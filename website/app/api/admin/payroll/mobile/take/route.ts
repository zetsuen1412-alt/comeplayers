import { requireMonitorAccess, requireOwnEmployee } from "@/lib/monitorAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import { deliverTakeNotice, TakeNoticeError } from "@/lib/payrollMobileTake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;
const respond = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
});

/** Manual safe recovery: returns existing sent TAKE without posting a duplicate. */
export async function POST(request: Request) {
  try {
    const context = await requireMonitorAccess(request, { allowPublic: true, rosterOnly: true });
    const { actor, supabaseAdmin } = context;
    const raw = await request.text();
    if (raw.length > 4096) return respond({ error: "Permintaan terlalu besar." }, 413);
    const body = JSON.parse(raw) as { orderRef?: unknown; employeeCode?: unknown };
    const ref = typeof body.orderRef === "string" ? body.orderRef.trim() : "";
    const code = typeof body.employeeCode === "string" ? body.employeeCode.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(ref) || !/^[\w-]{1,100}$/.test(code))
      return respond({ error: "Kode order atau karyawan tidak valid." }, 400);
    requireOwnEmployee(context, code);
    try {
      return respond(await deliverTakeNotice(supabaseAdmin, actor.id, ref, code));
    } catch (error) {
      if (error instanceof TakeNoticeError)
        return respond({ error: error.message, takeSent: false,
          uncertain: error.uncertain }, error.uncertain ? 409 : 502);
      throw error;
    }
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : adminErrorStatus(error);
    return respond({ error: status === 400 ? "Format permintaan tidak valid."
      : status === 401 ? "Sesi habis, silakan login."
      : status === 403 ? "Khusus admin Payroll."
      : "TAKE belum berhasil. Periksa grup Telegram." },
      [400,401,403,429].includes(status) ? status : 503);
  }
}
