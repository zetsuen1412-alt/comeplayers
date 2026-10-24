import { requireMonitorAccess } from "@/lib/monitorAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import { FH3_PROOF_GROUP, verifyFH3ProofGroup } from "@/lib/payrollMobileProof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const respond = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Read-only preflight. Does not send test photos or change orders. */
export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requireMonitorAccess(request);
    const { data, error } = await supabaseAdmin
      .from("cp_payroll_telegram_divisions")
      .select("chat_id,chat_title,active")
      .eq("division", "FH3")
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.active)
      return respond({ ready: false, group: FH3_PROOF_GROUP,
        error: "Grup FH3 belum terhubung. Jalankan /bind FH3 di grup yang benar." }, 409);
    const chatId = Number(data.chat_id);
    if (!Number.isSafeInteger(chatId) || chatId >= 0)
      return respond({ ready: false, group: FH3_PROOF_GROUP,
        error: "Tujuan FH3 masih chat pribadi atau ID tidak valid. Jalankan /bind FH3 di grup." }, 409);
    try {
      const liveTitle = await verifyFH3ProofGroup(chatId);
      return respond({ ready: true, group: FH3_PROOF_GROUP, liveTitle,
        message: "Grup bukti START/DONE dapat diakses oleh bot Telegram website." });
    } catch (error) {
      return respond({ ready: false, group: FH3_PROOF_GROUP,
        error: error instanceof Error ? error.message : "Grup FH3 belum dapat diverifikasi." }, 409);
    }
  } catch (error) {
    const status = adminErrorStatus(error);
    return respond({ error: status === 401 ? "Sesi habis, silakan login ulang."
      : status === 403 ? "Akses Payroll ditolak."
      : "Pemeriksaan grup Telegram belum tersedia." },
      status === 401 || status === 403 ? status : 503);
  }
}
