import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { FH_PRIMARY_SYNC_NAMESPACE } from "./legacy-fh-cutover";
import { validateGoogleSheetSyncPayload, type GoogleSheetSyncPayload } from "./google-sheet-sync";
import type { createSupabaseAdmin } from "@/lib/serverSupabase";

/**
 * One-time, narrowly scoped initial import from the user-provided XLSX.
 * Financial records stay in the user's Supabase DB, not in the Git repository.
 * Existing future Google sync stays authoritative for subsequent edits.
 */
const JOB_ID = "evo2026-fh-5848-7536-xlsx-v1";
const DIGEST = "b1577d0798a824e3413b6e41757cddbd32f8ecc472eb69d3167d50042d2a5b88";
const ROW_START = 5848;
const ROW_END = 7536;
const BATCH_SIZE = 200;

type Admin = ReturnType<typeof createSupabaseAdmin>;
export type XlsxBootstrapBatch = {
  cursor: number;
  nextCursor: number;
  totalTasks: number;
  payload: GoogleSheetSyncPayload;
};

export async function loadPayrollXlsxBootstrapBatch(
  supabaseAdmin: Admin,
  currentPayload: Pick<GoogleSheetSyncPayload, "spreadsheetId" | "sheetName">,
): Promise<XlsxBootstrapBatch | null> {
  if (currentPayload.sheetName !== "MUTASI FH" || currentPayload.spreadsheetId !== FH_PRIMARY_SYNC_NAMESPACE) return null;

  const { data: job, error } = await supabaseAdmin
    .from("cp_payroll_xlsx_bootstrap_runs")
    .select("job_id,status,cursor,total_tasks,source_sha256")
    .eq("job_id", JOB_ID)
    .maybeSingle();
  if (error) throw error;
  if (!job || job.status !== "pending") return null;

  const { data: parts, error: partError } = await supabaseAdmin
    .from("cp_payroll_xlsx_bootstrap_parts")
    .select("part_no,content")
    .eq("job_id", JOB_ID)
    .order("part_no", { ascending: true });
  if (partError) throw partError;
  if (!parts?.length || parts.length !== 14 || parts.some((part, i) => part.part_no !== i)) {
    throw new Error("Initial XLSX source is incomplete. Payroll was not changed.");
  }

  const compressed = Buffer.from(parts.map(part => part.content).join(""), "base64");
  const original = gunzipSync(compressed, { maxOutputLength: 5_000_000 });
  const hash = createHash("sha256").update(original).digest("hex");
  if (hash !== DIGEST || hash !== job.source_sha256) throw new Error("Initial XLSX checksum mismatch.");

  const source = validateGoogleSheetSyncPayload(JSON.parse(original.toString("utf8")));
  if (source.spreadsheetId !== FH_PRIMARY_SYNC_NAMESPACE || source.sheetName !== "MUTASI FH"
    || source.newOrdersStartRow !== ROW_START || source.rows.length !== job.total_tasks
    || source.rows[0]?.rowNumber !== ROW_START
    || source.rows[0]?.display?.[1] !== "X2754"
    || source.rows.at(-1)?.rowNumber !== ROW_END
    || source.rows.at(-1)?.display?.[1] !== "X4688") {
    throw new Error("Initial XLSX row boundaries are invalid.");
  }
  for (const row of source.rows) {
    if (row.rowNumber < ROW_START || row.rowNumber > ROW_END ||
      row.dailyPackage?.rows.some(day => day.rowNumber < ROW_START || day.rowNumber > ROW_END)) {
      throw new Error("Initial XLSX contains rows outside the requested 5848–7536 interval.");
    }
  }

  const cursor = Number(job.cursor);
  const totalTasks = source.rows.length;
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > totalTasks) {
    throw new Error("XLSX import cursor is invalid.");
  }
  return {
    cursor, totalTasks,
    nextCursor: Math.min(totalTasks, cursor + BATCH_SIZE),
    payload: {
      ...source,
      rows: source.rows.slice(cursor, cursor + BATCH_SIZE),
      sentAt: new Date().toISOString(),
    },
  };
}

export async function advancePayrollXlsxBootstrap(admin: Admin, batch: XlsxBootstrapBatch) {
  const { error } = await admin
    .from("cp_payroll_xlsx_bootstrap_runs")
    .update({
      cursor: batch.nextCursor,
      status: batch.nextCursor === batch.totalTasks ? "complete" : "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("job_id", JOB_ID)
    .eq("status", "pending")
    .eq("cursor", batch.cursor);
  if (error) throw error;
}
