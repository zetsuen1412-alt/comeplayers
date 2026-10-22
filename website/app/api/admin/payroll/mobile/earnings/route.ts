import { requirePayrollAccess } from "@/lib/payrollAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import { buildMobileEarnings } from "@/lib/payrollMobileEarnings";
import { loadFH3MonitorJobs } from "@/lib/fh3MonitorJobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const respond = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
});

/** Owner-authorized visibility for all Payroll members; never a public salary endpoint. */
export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requirePayrollAccess(request);
    const url = new URL(request.url);
    const code = url.searchParams.get("employeeCode") ?? "";
    const rawOffset = url.searchParams.get("offset") ?? "0";
    const offset = Number(rawOffset);
    if (code.length > 100 || /[\u0000-\u001f\u007f]/.test(code)
      || !/^\d{1,7}$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset > 1_000_000)
      return respond({ error: "Filter penghasilan tidak valid." }, 400);
    const { data, error } = await supabaseAdmin.from("cp_payroll_workspace")
      .select("payload,revision,updated_at").eq("id", 1).single();
    if (error || !data) throw error ?? new Error("Workspace tidak tersedia");
    const jobs = [...(await loadFH3MonitorJobs(supabaseAdmin)).values()];
    return respond({ schema: 1, scope: "FH3", currency: "IDR", source: "payroll",
      revision: data.revision, updatedAt: data.updated_at,
      ...buildMobileEarnings(data.payload, code, offset, jobs),
    });
  } catch (error) {
    const status = adminErrorStatus(error);
    return respond({ error: status === 401 ? "Sesi habis; login kembali."
      : status === 403 ? "Akses Payroll belum diberikan."
      : status === 404 ? "Karyawan FH3 tidak ditemukan."
      : "Penghasilan belum dapat dimuat. Coba segarkan." }, [401, 403, 404].includes(status) ? status : 503);
  }
}
