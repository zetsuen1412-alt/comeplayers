import { loadMonitorControls } from "@/lib/monitorManagement";
import { requireMonitorAccess } from "@/lib/monitorAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import { buildMobileCompleted } from "@/lib/payrollMobileCompleted";
import { loadCompletedMonitorEvidence } from "@/lib/fh3MonitorCompletedData";
import { loadFH3MonitorJobs } from "@/lib/fh3MonitorJobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const respond = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
});

export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requireMonitorAccess(request);
    const url = new URL(request.url), code = url.searchParams.get("employeeCode") ?? "";
    const rawOffset = url.searchParams.get("offset") ?? "0", offset = Number(rawOffset);
    if (code.length > 100 || /[\u0000-\u001f\u007f]/.test(code)
      || !/^\d{1,7}$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset > 1_000_000)
      return respond({ error: "Filter order selesai tidak valid." }, 400);
    const [workspace, evidence, jobs, controls] = await Promise.all([
      supabaseAdmin.from("cp_payroll_workspace").select("payload,revision,updated_at").eq("id", 1).single(),
      loadCompletedMonitorEvidence(supabaseAdmin), loadFH3MonitorJobs(supabaseAdmin), loadMonitorControls(supabaseAdmin),
    ]);
    if (workspace.error || !workspace.data) throw workspace.error ?? new Error("Workspace tidak tersedia.");
    const history = buildMobileCompleted(workspace.data.payload, evidence.receipts, evidence.proofs, [...jobs.values()], code, offset, [...controls.values()]);
    return respond({ schema: 1, scope: "FH3", sourceOfTruth: "telegram_fh3_manual",
      completionRule: "telegram_done_confirmed", complete: true,
      revision: workspace.data.revision, updatedAt: workspace.data.updated_at,
      ...history,
    });
  } catch (error) {
    const status = adminErrorStatus(error);
    return respond({ error: status === 401 ? "Sesi habis; login kembali."
      : status === 403 ? "Akses Monitor belum diberikan." : status === 404 ? "Karyawan FH3 tidak ditemukan."
      : "Riwayat order selesai belum dapat dimuat. Coba perbarui." }, [401, 403, 404].includes(status) ? status : 503);
  }
}
