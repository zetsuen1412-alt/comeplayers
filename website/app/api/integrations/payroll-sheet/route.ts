import { timingSafeEqual } from "node:crypto";
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
      validateWorkspace(merged.state);
      validateWorkspaceEdit(currentState, merged.state);

      const changed = merged.added + merged.updated + merged.archived;
      if (!changed) {
        return response({
          ok: true,
          saved: false,
          syncMode,
          revision: current.revision,
          ...merged,
          state: undefined,
        });
      }

      const { data: saved, error: saveError } = await supabaseAdmin.rpc("cp_save_payroll_workspace", {
        p_revision: current.revision,
        p_payload: merged.state,
        p_actor: actor.id,
        p_action: "save",
      });

      if (saveError?.code === "40001" && attempt < 2) continue;
      if (saveError) throw saveError;

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
          unchanged: merged.unchanged,
          skippedProtected: merged.skippedProtected,
          skippedConflicts: merged.skippedConflicts,
          skippedInvalid: merged.skippedInvalid,
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
        refreshReferences: merged.refreshReferences,
        unchanged: merged.unchanged,
        skippedProtected: merged.skippedProtected,
        skippedConflicts: merged.skippedConflicts,
        skippedInvalid: merged.skippedInvalid,
        issues: merged.issues,
        rowResults: merged.rowResults,
      });
    }

    throw Object.assign(new Error("Payroll berubah bersamaan dengan sinkronisasi. Coba lagi pada jadwal berikutnya."), { status: 409 });
  } catch (error) {
    return failure(error);
  }
}
