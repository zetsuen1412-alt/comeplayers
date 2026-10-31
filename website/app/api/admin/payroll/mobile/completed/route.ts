export const maxDuration = 25;
import { withMonitorSessionDeadline } from '@/lib/monitorSessionDeadline';
import { loadMonitorControls } from "@/lib/monitorManagement";
import { requireMonitorAccess } from "@/lib/monitorAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import { buildMobileCompleted } from "@/lib/payrollMobileCompleted";
import { loadCompletedMonitorEvidence } from "@/lib/fh3MonitorCompletedData";
import { loadFH3MonitorJobs } from "@/lib/fh3MonitorJobs";
import { loadMonitorWorkspace } from '@/lib/monitorWorkspaceSnapshot';
import { loadMonitorTeams } from '@/lib/monitorTeams';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const respond = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
});

export async function GET(request: Request) {
  try {
    return await withMonitorSessionDeadline(async signal => {
    const { supabaseAdmin, workspaceSnapshot } = await requireMonitorAccess(request, { allowPublic: true, signal });
    const url = new URL(request.url), code = url.searchParams.get("employeeCode") ?? "";
    const rawOffset = url.searchParams.get("offset") ?? "0", offset = Number(rawOffset);
    if (code.length > 100 || /[\u0000-\u001f\u007f]/.test(code)
      || !/^\d{1,7}$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset > 1_000_000)
      return respond({ error: "Filter order selesai tidak valid." }, 400);
    const [workspace, evidence, jobs, controls] = await Promise.all([
      workspaceSnapshot ?? loadMonitorWorkspace(supabaseAdmin),
      loadCompletedMonitorEvidence(supabaseAdmin), loadFH3MonitorJobs(supabaseAdmin), loadMonitorControls(supabaseAdmin),
    ]);
    const teams = await loadMonitorTeams(supabaseAdmin, evidence.receipts.map(receipt => receipt.order_ref));
    const history = buildMobileCompleted(workspace.payload, evidence.receipts, evidence.proofs, [...jobs.values()], code, offset,
      [...controls.values()], false, false, [...teams.teams.values()]);
    return respond({ schema: 1, scope: "FH3", sourceOfTruth: "telegram_fh3_manual",
      completionRule: "telegram_done_confirmed", complete: true,
      revision: workspace.revision, updatedAt: workspace.updated_at,
      ...history,
    });
    }, 18_000);
  } catch (error) {
    const status = adminErrorStatus(error);
    return respond({ error: status === 401 ? "Sesi habis; login kembali."
      : status === 403 ? "Akses Monitor belum diberikan." : status === 404 ? "Karyawan FH3 tidak ditemukan."
      : "Riwayat order selesai belum dapat dimuat. Coba perbarui." }, [401, 403, 404, 429].includes(status) ? status : 503);
  }
}

