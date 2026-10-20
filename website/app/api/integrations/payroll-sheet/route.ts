import { timingSafeEqual } from "node:crypto";
import {
  loadPayrollXlsxBootstrapBatch,
  advancePayrollXlsxBootstrap,
} from "@/features/payroll/lib/xlsx-bootstrap";

import { dispatchAddedSheetOrders } from "@/lib/payrollTelegram";
import { FH_NEW_BOOK_ROW, FH_PRIMARY_SYNC_NAMESPACE } from "@/features/payroll/lib/legacy-fh-cutover";
import { mergeResetReimportRefresh } from "@/features/payroll/lib/reset-reimport-refresh";
import { recordAdminAudit } from "@/lib/adminSecurity";
import { createSupabaseAdmin } from "@/lib/serverSupabase";
import {
  mergeGoogleSheetPayroll,
  validateGoogleSheetSyncPayload,
  type GoogleSheetSyncPayload,
} from "@/features/payroll/lib/google-sheet-sync";
import {
  validateWorkspace,
  validateWorkspaceEdit,
  type WorkspaceState,
} from "@/features/payroll/lib/workspace-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 4_200_000;
const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

function failure(error: unknown) {
  const value = error as { status?: number; code?: string; message?: string };
  const status = Number(value?.status)
    || (value?.code === "42501" ? 403
      : value?.code === "40001" ? 409
        : value?.code === "22023" ? 400
          : 500);
  const message = status >= 500
    ? "Sinkronisasi payroll belum dapat diproses."
    : value?.message || "Permintaan sinkronisasi tidak valid.";
  return response({ error: message }, status);
}

function syncSecret() {
  return process.env.PAYROLL_SHEETS_SYNC_SECRET || process.env.CRON_SECRET || "";
}

function authorized(request: Request) {
  const expected = syncSecret();
  if (!expected || expected.length < 24) {
    throw Object.assign(new Error("PAYROLL_SHEETS_SYNC_SECRET belum dikonfigurasi."), { status: 503 });
  }
  const authorization = request.headers.get("authorization") || "";
  const provided = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : request.headers.get("x-comeplayers-sync-secret")?.trim() || "";
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) {
    throw Object.assign(new Error("Secret sinkronisasi tidak valid."), { status: 401 });
  }
}

async function readJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error("Payload sinkronisasi kosong."), { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw Object.assign(new Error("Payload sinkronisasi terlalu besar."), { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("JSON sinkronisasi tidak valid."), { status: 400 });
  }
}

async function resolveActor(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  payload: GoogleSheetSyncPayload,
) {
  const actorId = String(payload.actor?.id || "").trim();
  const actorEmail = String(payload.actor?.email || "").trim();
  if (!actorId && !actorEmail) {
    throw Object.assign(new Error("Akun admin ComePlayers untuk audit sinkronisasi belum diisi."), { status: 400 });
  }

  let query = supabaseAdmin
    .from("profiles")
    .select("id,role,username,full_name,email");

  query = actorId ? query.eq("id", actorId) : query.ilike("email", actorEmail);
  const { data: profile, error } = await query.maybeSingle();
  if (error) throw error;
  if (!profile || String(profile.role || "").trim().toLowerCase() !== "admin") {
    throw Object.assign(new Error("Akun sinkronisasi harus merupakan admin ComePlayers."), { status: 403 });
  }
  return {
    id: String(profile.id),
    name: String(profile.username || profile.full_name || profile.email || profile.id),
    email: String(profile.email || ""),
  };
}

export async function POST(request: Request) {
  try {
    authorized(request);
    const body = await readJson(request);
    let payload: GoogleSheetSyncPayload;
    try { payload = validateGoogleSheetSyncPayload(body); }
    catch (error) { throw Object.assign(error as Error, { status: 400 }); }
    const syncMode = payload.syncMode ?? "reconcile";
    const supabaseAdmin = createSupabaseAdmin();
    const actor = await resolveActor(supabaseAdmin, payload);

    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: current, error: readError } = await supabaseAdmin
        .from("cp_payroll_workspace")
        .select("payload,revision")
        .eq("id", 1)
        .single();
      if (readError) throw readError;

      const currentState = current.payload as WorkspaceState;
      const merged = mergeGoogleSheetPayroll(currentState, payload);
      const bootstrap = await loadPayrollXlsxBootstrapBatch(supabaseAdmin, payload);
      // Apply the uploaded historical workbook using exactly the same merge and
      // validation paths as live Google Sheets, without resetting newer orders.
      const fileMerged = bootstrap
        ? mergeGoogleSheetPayroll(merged.state, bootstrap.payload)
        : null;
      const effectiveState = fileMerged?.state ?? merged.state;
      validateWorkspace(effectiveState);
      validateWorkspaceEdit(currentState, effectiveState, "sync");

      // After an audited reset, Apps Script can still have old per-row signatures
      // and skip re-sending rows even though they no longer exist in Payroll.
      // The presence preflight carries the source CODE inventory; respond with
      // absent post-X2754 references from the last two backed-up resets so the
      // existing Apps Script refreshReferences mechanism invalidates only those
      // signatures and re-reads the live Google Sheet.
      let refreshReferences = merged.refreshReferences;
      if (payload.rows.length === 0 && payload.presence?.complete
        && payload.sheetName === "MUTASI FH"
        && payload.spreadsheetId === FH_PRIMARY_SYNC_NAMESPACE) {
        const { data: missing, error: missingError } = await supabaseAdmin
          .rpc("cp_missing_payroll_reset_reimport_refs", {
            p_namespace: FH_PRIMARY_SYNC_NAMESPACE, p_start_row: FH_NEW_BOOK_ROW,
          });
        if (missingError) throw missingError;
        refreshReferences = mergeResetReimportRefresh(
          merged.refreshReferences, Array.isArray(missing) ? missing : [],
          payload.presence.references,
        );
      }

      const changed = merged.added + merged.updated + merged.archived
        + merged.rosterAdded + merged.rosterUpdated + merged.rosterRemoved + merged.conflictsUpdated + merged.legacyArchived
        + (fileMerged ? fileMerged.added + fileMerged.updated + fileMerged.archived
          + fileMerged.rosterAdded + fileMerged.rosterUpdated + fileMerged.rosterRemoved
          + fileMerged.conflictsUpdated + fileMerged.legacyArchived : 0);
      const bootstrapSummary = bootstrap && fileMerged ? {
        source: "uploaded-xlsx",
        fromRow: 5848,
        toRow: 7536,
        processedTasks: bootstrap.nextCursor,
        totalTasks: bootstrap.totalTasks,
        added: fileMerged.added,
        updated: fileMerged.updated,
        skippedConflicts: fileMerged.skippedConflicts,
        skippedInvalid: fileMerged.skippedInvalid,
      } : null;
      if (!changed) {
        if (bootstrap) await advancePayrollXlsxBootstrap(supabaseAdmin, bootstrap);
        return response({
          ok: true,
          saved: false,
          syncMode,
          revision: current.revision,
          ...(bootstrapSummary ? { bootstrap: bootstrapSummary } : {}),
          ...merged,
          refreshReferences,
          state: undefined,
        });
      }

      const { data: saved, error: saveError } = await supabaseAdmin.rpc("cp_save_payroll_workspace", {
        p_revision: current.revision,
        p_payload: effectiveState,
        p_actor: actor.id,
        p_action: "save",
      });

      if (saveError?.code === "40001" && attempt < 2) continue;
      if (saveError) throw saveError;
      // Revision-guarded save succeeded; this is now safe to advance the
      // durable spreadsheet import cursor. A crash before advancing merely
      // retries the same idempotent group, never loses work.
      if (bootstrap) await advancePayrollXlsxBootstrap(supabaseAdmin, bootstrap);

      const telegramDispatch = await dispatchAddedSheetOrders(supabaseAdmin, effectiveState, merged.rowResults);

      await recordAdminAudit({
        adminId: actor.id,
        action: "payroll.google_sheets_sync",
        entityType: "payroll_workspace",
        entityId: 1,
        metadata: {
          spreadsheetId: payload.spreadsheetId,
          spreadsheetName: payload.spreadsheetName || null,
          sheetName: payload.sheetName,
          headerRow: payload.headerRow || null,
          syncMode,
          rowsReceived: payload.rows.length,
          added: merged.added,
          updated: merged.updated,
          archived: merged.archived,
          restored: merged.restored,
          rosterAdded: merged.rosterAdded,
          rosterUpdated: merged.rosterUpdated,
          rosterRemoved: merged.rosterRemoved,
          conflictsUpdated: merged.conflictsUpdated,
          legacyArchived: merged.legacyArchived,
          unchanged: merged.unchanged,
          skippedProtected: merged.skippedProtected,
          skippedConflicts: merged.skippedConflicts,
          skippedInvalid: merged.skippedInvalid,
          skippedHistorical: merged.skippedHistorical,
          telegramDispatched: telegramDispatch.sent,
          ...(bootstrapSummary ? { xlsxBootstrap: bootstrapSummary } : {}),
        },
      });

      return response({
        ok: true,
        saved: true,
        syncMode,
        revision: saved?.revision,
        added: merged.added,
        updated: merged.updated,
        archived: merged.archived,
        restored: merged.restored,
        rosterAdded: merged.rosterAdded,
        rosterUpdated: merged.rosterUpdated,
        rosterRemoved: merged.rosterRemoved,
        conflictsUpdated: merged.conflictsUpdated,
        legacyArchived: merged.legacyArchived,
        refreshReferences,
        trackedRows: merged.trackedRows,
        unchanged: merged.unchanged,
        skippedProtected: merged.skippedProtected,
        skippedConflicts: merged.skippedConflicts,
        skippedInvalid: merged.skippedInvalid,
        skippedHistorical: merged.skippedHistorical,
        telegramDispatched: telegramDispatch.sent,
        ...(bootstrapSummary ? { bootstrap: bootstrapSummary } : {}),
        issues: merged.issues,
        rowResults: merged.rowResults,
      });
    }

    throw Object.assign(new Error("Payroll berubah bersamaan dengan sinkronisasi. Coba lagi pada jadwal berikutnya."), { status: 409 });
  } catch (error) {
    return failure(error);
  }
}
