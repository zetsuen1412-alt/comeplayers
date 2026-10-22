import "server-only";
import { manualFH3Reference, parseFH3Cancellation, parseFH3ManualOrder } from "@/lib/fh3ManualTelegram";
import { verifyFH3ProofGroup } from "@/lib/payrollMobileProof";
import type { createSupabaseAdmin } from "@/lib/serverSupabase";

type Service = ReturnType<typeof createSupabaseAdmin>;
type TelegramMessage = {
  message_id?: number; date?: number; edit_date?: number;
  from?: { id?: number; is_bot?: boolean };
  sender_chat?: unknown; forward_origin?: unknown;
  chat?: { id?: number; type?: string };
  text?: string; caption?: string; photo?: unknown[];
};
type TelegramIncoming = { update_id?: number; message?: TelegramMessage; edited_message?: TelegramMessage };

/** Consume admin order photos before the legacy proof workflow can delete them. */
export async function captureManualFH3Telegram(update: TelegramIncoming, service: Service): Promise<boolean> {
  const message = update.edited_message ?? update.message;
  if (!message) return false;
  const raw = message.caption ?? message.text ?? "";
  const parsed = parseFH3ManualOrder(raw);
  const cancelRef = parseFH3Cancellation(raw);
  const candidate = Boolean(parsed || cancelRef || manualFH3Reference(raw));
  if (!candidate && !update.edited_message && !message.photo?.length) return false;
  const chatId = message.chat?.id, senderId = message.from?.id;
  if (!Number.isSafeInteger(chatId) || (chatId as number) >= 0
    || !["group", "supergroup"].includes(message.chat?.type ?? "")) return candidate;

  const { data: bound, error: boundError } = await service
    .from("cp_payroll_telegram_divisions")
    .select("chat_id,fh3_order_sender_id").eq("division", "FH3").eq("active", true).maybeSingle();
  if (boundError) throw new Error("Konfigurasi grup FH3 tidak tersedia.");
  if (Number(bound?.chat_id) !== chatId) return false;
  if (!Number.isSafeInteger(senderId) || (senderId as number) <= 0
    || message.from?.is_bot || message.sender_chat || message.forward_origin)
    return candidate || Boolean(message.photo?.length);
  if (!Number.isSafeInteger(update.update_id) || (update.update_id ?? -1) < 0)
    throw new Error("Update ID tidak valid.");
  if (!Number.isSafeInteger(message.message_id) || (message.message_id ?? 0) <= 0
    || !Number.isSafeInteger(message.date) || (message.date ?? 0) <= 0
    || (update.edited_message && (!Number.isSafeInteger(message.edit_date) || (message.edit_date ?? 0) < (message.date ?? 0)))) return true;

  await verifyFH3ProofGroup(chatId as number);
  const token = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) throw new Error("Bot Telegram belum dikonfigurasi.");
  let result: Response;
  try {
    result = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: senderId }),
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
  } catch { throw new Error("Belum dapat memeriksa hak admin Telegram."); }
  const membership = await result.json().catch(() => null) as
    { ok?: boolean; result?: { status?: string; user?: { id?: number; username?: string } } } | null;
  if (!result.ok || !membership?.ok || membership.result?.user?.id !== senderId)
    throw new Error("Pemeriksaan admin Telegram gagal.");
  if (!["creator", "administrator"].includes(membership.result?.status ?? "")) return candidate;

  // Identify the screenshot's account using Telegram's live unique username,
  // then pin its numeric ID in the same transaction as the first receipt.
  // Display names and later username ownership changes cannot replace that ID.
  const username = String(membership.result?.user?.username ?? "").toLowerCase();
  const pinnedSender = Number(bound?.fh3_order_sender_id);
  if (bound?.fh3_order_sender_id != null
    ? !Number.isSafeInteger(pinnedSender) || pinnedSender <= 0 || pinnedSender !== senderId
    : username !== "evogamings") return true;

  // All admin photos in the bound group are protected, even malformed order captions.
  if (!parsed && !cancelRef && !update.edited_message) return true;
  if (bound?.fh3_order_sender_id == null && !parsed) return true;
  const { error } = await service.rpc("cp_fh3_telegram_save_manual", {
    p_order_ref: cancelRef ?? parsed?.orderRef ?? null,
    p_chat_id: chatId, p_message_id: message.message_id, p_admin_user_id: senderId,
    p_game: parsed?.game ?? "", p_server_name: parsed?.serverName ?? "",
    p_duration: parsed?.duration ?? "", p_task: parsed?.task ?? "",
    p_posted_at: new Date((message.date as number) * 1000).toISOString(),
    p_version_at: new Date((message.edit_date ?? message.date as number) * 1000).toISOString(),
    p_update_id: update.update_id, p_active: Boolean(parsed && !cancelRef),
    p_sender_username: username,
  });
  if (error) throw new Error("Order manual Telegram belum dapat dicatat.");
  return true;
}
