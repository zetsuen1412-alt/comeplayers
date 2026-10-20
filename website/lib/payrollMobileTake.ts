import "server-only";
import type { requirePayrollAccess } from "@/lib/payrollAccess";
import { MobileTelegramError, verifyFH3ProofGroup } from "@/lib/payrollMobileProof";

type Service = Awaited<ReturnType<typeof requirePayrollAccess>>["supabaseAdmin"];

export class TakeNoticeError extends Error {
  constructor(message: string, readonly uncertain: boolean) { super(message); }
}

/** Send a short TAKE text only after a committed direct Payroll assignment.
 * No new-order cards or photos are posted by this function.
 */
export async function deliverTakeNotice(service: Service, actorId: string, orderRef: string, employeeCode: string) {
  const { data: claim, error: beginError } = await service.rpc("cp_mobile_take_begin", {
    p_order_ref: orderRef, p_employee_code: employeeCode, p_actor_id: actorId,
  });
  if (beginError) throw new TakeNoticeError(
    "Order telah ditugaskan, tetapi status TAKE belum dapat dipastikan. Periksa Telegram dan muat ulang Tugas Aktif.", true);
  if (claim?.alreadySent) return {
    ok: true, takeSent: true, alreadySent: true,
    caption: String(claim.caption), chatTitle: String(claim.chatTitle ?? "FH3"),
  };
  if (!claim?.ok || typeof claim.eventId !== "string" || !Number.isSafeInteger(claim.chatId)
    || typeof claim.caption !== "string")
    throw new TakeNoticeError("Order telah ditugaskan; klaim TAKE dari server tidak valid.", true);

  const eventId: string = claim.eventId;
  let telegramAcknowledged = false;
  try {
    await verifyFH3ProofGroup(claim.chatId);
    const token = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
    if (token.length < 20)
      throw new MobileTelegramError("Bot Telegram belum dikonfigurasi di server.", "failed");

    let response: Response;
    try {
      response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: claim.chatId, text: claim.caption,
          disable_web_page_preview: true,
        }),
        cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new MobileTelegramError(
        "Jaringan Telegram tidak pasti. Periksa grup sebelum mencoba ulang TAKE.", "unknown");
    }
    let payload: { ok?: boolean; result?: { message_id?: number } };
    try { payload = await response.json(); }
    catch { throw new MobileTelegramError("Balasan Telegram TAKE tidak jelas; periksa grup.", "unknown"); }
    if (!response.ok || !payload.ok)
      throw new MobileTelegramError("Bot Telegram menolak TAKE; periksa koneksi grup.", "failed");
    const messageId = payload.result?.message_id;
    if (!Number.isSafeInteger(messageId) || !messageId)
      throw new MobileTelegramError("Telegram tidak memberikan ID TAKE; periksa grup.", "unknown");
    telegramAcknowledged = true;
    const { data: stored, error: saveError } = await service.rpc("cp_mobile_take_finish", {
      p_event_id: eventId, p_actor_id: actorId, p_message_id: messageId,
    });
    if (saveError || !stored?.ok)
      throw new MobileTelegramError("Pesan TAKE terkirim tetapi audit website belum pasti. Periksa admin.", "unknown");
    return { ...stored, takeSent: true, alreadySent: false };
  } catch (error) {
    const state = telegramAcknowledged ? "unknown"
      : error instanceof MobileTelegramError ? error.outcome : "unknown";
    try {
      await service.rpc("cp_mobile_take_mark", {
        p_event_id: eventId, p_actor_id: actorId, p_status: state,
      });
    } catch { /* fail closed; manual reconciliation before another send */ }
    throw new TakeNoticeError(error instanceof Error ? error.message
      : "Pengiriman TAKE belum dikonfirmasi.", state === "unknown");
  }
}
