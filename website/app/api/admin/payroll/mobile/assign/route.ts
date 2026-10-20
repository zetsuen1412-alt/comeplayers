import { requirePayrollAccess } from "@/lib/payrollAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import { deliverTakeNotice, TakeNoticeError } from "@/lib/payrollMobileTake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const respond = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
});

/** Mobile admin assignment uses a dedicated locked DB transaction, not a spoofed Telegram update. */
export async function POST(request: Request) {
  try {
    const { actor, supabaseAdmin } = await requirePayrollAccess(request);
    if (!actor.isAdmin) return respond({ error: "Hanya admin dapat menugaskan karyawan." }, 403);
    const raw = await request.text();
    if (raw.length > 4096) return respond({ error: "Permintaan terlalu besar." }, 413);
    const body = JSON.parse(raw) as { orderRef?: unknown; employeeCode?: unknown };
    const ref = typeof body?.orderRef === "string" ? body.orderRef.trim() : "";
    const code = typeof body?.employeeCode === "string" ? body.employeeCode.trim() : "";
    if (!ref || ref.length > 180 || /[\u0000-\u001f\u007f]/.test(ref)
      || !code || code.length > 100 || /[\u0000-\u001f\u007f]/.test(code)) {
      return respond({ error: "Order atau kode karyawan tidak valid." }, 400);
    }
    const { data, error } = await supabaseAdmin.rpc("cp_mobile_assign_fh3", {
      p_order_ref: ref, p_employee_code: code, p_actor_id: actor.id,
    });
    if (error) {
      if (error.code === "P0001" || error.code === "23505" || error.code === "23514") {
        return respond({ error: "Order sudah berubah atau karyawan tidak lagi memenuhi syarat. Muat ulang daftar order." }, 409);
      }
      throw error;
    }
    // TAKE is an intentional action performed by the admin in the app,
    // not a Telegram NEW ORDER notification. Payroll assignment commits first.
    try {
      const take = await deliverTakeNotice(supabaseAdmin, actor.id,
        String(data.orderRef || ref), String(data.employeeCode || code));
      return respond({ ...data, ...take, ok: true });
    } catch (error) {
      if (error instanceof TakeNoticeError)
        return respond({ ok: false, assigned: true, takeSent: false,
          uncertain: error.uncertain,
          error: "Order sudah ditugaskan di Payroll, tetapi TAKE belum terkonfirmasi Telegram. " +
            error.message + " Gunakan tombol TAKE di Tugas Aktif setelah memeriksa grup." },
          error.uncertain ? 409 : 502);
      return respond({ ok: false, assigned: true, takeSent: false,
        error: "Order tersimpan di Payroll; TAKE gagal diproses. Periksa grup dan gunakan tombol TAKE di Tugas Aktif." }, 503);
    }
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : adminErrorStatus(error);
    return respond({ error: status === 400 ? "Format data tidak valid."
      : status === 401 ? "Sesi habis, silakan login ulang."
      : status === 403 ? "Akses Payroll ditolak." : "Penugasan gagal disimpan. Coba perbarui data." },
      status === 400 || status === 401 || status === 403 ? status : 503);
  }
}
