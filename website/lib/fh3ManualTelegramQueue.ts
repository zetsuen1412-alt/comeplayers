import type { createSupabaseAdmin } from "@/lib/serverSupabase";

export type FH3ManualReceipt = {
  order_ref: string; chat_id: number; message_id: number; active: boolean;
  game: string; duration: string; task: string; posted_at: string;
};

/** Missing migration/binding or truncation must never expose the Payroll queue. */
export async function loadFH3ManualOrders(service: ReturnType<typeof createSupabaseAdmin>) {
  const { data: group, error } = await service.from("cp_payroll_telegram_divisions")
    .select("chat_id").eq("division", "FH3").eq("active", true).maybeSingle();
  const chatId = Number(group?.chat_id);
  if (error || !Number.isSafeInteger(chatId) || chatId >= 0)
    throw new Error("Grup Telegram FH3 belum terverifikasi.");
  const { data, error: readError } = await service.from("cp_fh3_telegram_manual_orders")
    .select("order_ref,chat_id,message_id,active,game,duration,task,posted_at")
    .eq("chat_id", chatId).eq("active", true).limit(1000);
  if (readError || !data || data.length >= 1000)
    throw new Error("Daftar Telegram FH3 tidak lengkap. Periksa order lama.");
  return new Map((data as FH3ManualReceipt[])
    .filter(item => item.active && Number(item.chat_id) === chatId && item.task.trim())
    .map(item => [item.order_ref.toUpperCase(), item]));
}
