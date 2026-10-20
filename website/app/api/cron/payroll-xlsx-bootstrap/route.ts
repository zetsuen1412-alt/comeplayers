import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/serverSupabase";
import { recordAdminAudit } from "@/lib/adminSecurity";
import {
  advancePayrollXlsxBootstrap,
  loadPayrollXlsxBootstrapBatch,
} from "@/features/payroll/lib/xlsx-bootstrap";
import { FH_PRIMARY_SYNC_NAMESPACE } from "@/features/payroll/lib/legacy-fh-cutover";
import { mergeGoogleSheetPayroll } from "@/features/payroll/lib/google-sheet-sync";
import { validateWorkspace, validateWorkspaceEdit, type WorkspaceState } from "@/features/payroll/lib/workspace-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Temporary authenticated server-side importer. Vercel automatically
 * supplies Authorization: Bearer CRON_SECRET for configured cron invocations.
 * Once task 1283 has been processed, it is a no-op. Live Sheet syncing
 * continues separately and is not changed here.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdmin();
    const { data: actor, error: actorError } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", "admin@comeplayers.com")
      .eq("role", "admin")
      .maybeSingle();
    if (actorError) throw actorError;
    if (!actor) throw new Error("Payroll admin identity unavailable.");

    for (let attempt = 0; attempt < 3; attempt++) {
      const batch = await loadPayrollXlsxBootstrapBatch(admin, {
        sheetName: "MUTASI FH",
        spreadsheetId: FH_PRIMARY_SYNC_NAMESPACE,
      });
      if (!batch) return Response.json({ ok: true, status: "already_complete_or_inactive" });

      const { data: snapshot, error: readError } = await admin
        .from("cp_payroll_workspace")
        .select("payload,revision")
        .eq("id", 1)
        .single();
      if (readError) throw readError;

      const previous = snapshot.payload as WorkspaceState;
      const imported = mergeGoogleSheetPayroll(previous, batch.payload);
      validateWorkspace(imported.state);
      validateWorkspaceEdit(previous, imported.state, "sync");
      const modified = imported.added + imported.updated + imported.archived + imported.restored
        + imported.conflictsUpdated + imported.legacyArchived;

      if (modified) {
        const { error: savedError } = await admin.rpc("cp_save_payroll_workspace", {
          p_revision: snapshot.revision,
          p_payload: imported.state,
          p_actor: actor.id,
          p_action: "save",
        });
        if (savedError?.code === "40001" && attempt < 2) continue;
        if (savedError) throw savedError;
      }

      await advancePayrollXlsxBootstrap(admin, batch);
      await recordAdminAudit({
        adminId: actor.id,
        action: "payroll.xlsx_source_bootstrap",
        entityType: "payroll_workspace",
        entityId: 1,
        metadata: {
          source: "EVO GAMING 2026.xlsx",
          sheetName: "MUTASI FH",
          fromRow: 5848,
          toRow: 7536,
          cursorBefore: batch.cursor,
          cursorAfter: batch.nextCursor,
          totalTasks: batch.totalTasks,
          added: imported.added,
          updated: imported.updated,
          skippedConflicts: imported.skippedConflicts,
          skippedInvalid: imported.skippedInvalid,
          skippedProtected: imported.skippedProtected,
          skippedHistorical: imported.skippedHistorical,
        },
      });
      // No Telegram notifications for a historical backfill. They are sent
      // only by the normal live Google Sheet incremental sync.
      return Response.json({
        ok: true,
        status: batch.nextCursor === batch.totalTasks ? "complete" : "importing",
        processed: batch.nextCursor,
        total: batch.totalTasks,
        added: imported.added,
        updated: imported.updated,
        skippedConflicts: imported.skippedConflicts,
        skippedInvalid: imported.skippedInvalid,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Payroll workspace changed concurrently." }, { status: 409 });
  } catch (error) {
    // Never echo workbook rows, service secrets or token contents.
    console.error("payroll-xlsx-bootstrap failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Initial payroll import deferred." }, { status: 503 });
  }
}
