import "server-only";
import { parseFH3ManualOrder } from "@/lib/fh3ManualTelegram";
import type { createSupabaseAdmin } from "@/lib/serverSupabase";

type Service = ReturnType<typeof createSupabaseAdmin>;
type TelegramMessage = {
  message_id?: number;
  date?: number;
  from?: { id?: number; is_bot?: boolean };
  chat?: { id?: number; type?: string };
  text?: string;
  caption?: string;
};
type TelegramIncoming = { message?: TelegramMessage; edited_message?: TelegramMessage };

/**
 * Called BEFORE the legacy photo-evidence workflow. A manual order sent as
 * a photo caption must never be mistaken for evidence and auto-deleted.
 * True means consumed (including untrusted candidate ignored safely).
 */
export async function captureManualFH3Telegram(update: TelegramIncoming, service: Service): Promise<boolean> {
  const message = update.edited_message ?? update.message;
  if (!message) return false;
  const parsed = parseFH3ManualOrder(message.caption ?? message.text ?? "");
  if (!parsed) return false;

  const chatId = message.chat?.id;
  const senderId = message.from?.id;
  if (!Number.isSafeInteger(chatId) || !Number.isSafeInteger(senderId)
      || (chatId as number) >= 0 || (senderId as number) <= 0
      || !["group", "supergroup"].includes(message.chat?.type ?? "")
      || message.from?.is_bot) return true;

  const { data: bound, error: boundError } = await service
    .from("cp_payroll_telegram_divisions")
    .select("chat_id").eq("division", "FH3").eq("active", true).maybeSingle();
  if (boundError) throw new Error("Konfigurasi grup FH3 tidak tersedia.");
  if (Number(bound?.chat_id) !== chatId) return false; // Other divisions retain their legacy workflow.

  const token = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) throw new Error("Bot Telegram belum dikonfigurasi.");
  let result: Response;
  try {
    result = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: senderId }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Belum dapat memeriksa hak admin Telegram.");
  }
  // Reject non-admins without processing or deleting their manual post.
  const membership = await result.json().catch(() => null) as
    { ok?: boolean; result?: { status?: string } } | null;
  if (!result.ok || !membership?.ok) throw new Error("Pemeriksaan admin Telegram gagal.");
  if (!["creator", "administrator"].includes(membership.result?.status ?? "")) return true;

  if (!Number.isSafeInteger(message.message_id) || (message.message_id ?? 0) <= 0
      || !Number.isSafeInteger(message.date) || (message.date ?? 0) <= 0) return true;

  const { error } = await service.rpc("cp_fh3_telegram_save_manual", {
    p_order_ref: parsed.orderRef,
    p_chat_id: chatId,
    p_message_id: message.message_id,
    p_admin_user_id: senderId,
    p_game: parsed.game,
    p_server_name: parsed.serverName,
    p_duration: parsed.duration,
    p_task: parsed.task,
    p_posted_at: new Date((message.date as number) * 1000).toISOString(),
  });
  if (error) throw new Error("Order manual Telegram belum dapat dicatat.");
  return true;
}
