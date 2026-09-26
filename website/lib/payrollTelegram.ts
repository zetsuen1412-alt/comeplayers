import "server-only";
import { payrollTelegramKeyboard, type TelegramNotice } from "./payrollTelegramProtocol";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "@/features/payroll/types/domain";
import { workspaceKeys, type WorkspaceState } from "@/features/payroll/lib/workspace-model";

const TELEGRAM_API = "https://api.telegram.org";

export type TelegramWorkflowState =
  | "waiting"
  | "assigned"
  | "in_progress"
  | "paused"
  | "problem"
  | "done_pending_admin"
  | "verified";

type TelegramInlineButton = { text: string; callback_data: string };
type TelegramReplyMarkup = { inline_keyboard: TelegramInlineButton[][] };

function botToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

export function telegramWebhookSecret() {
  return String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
}

export function telegramEnabled() {
  return botToken().length > 20;
}

export function telegramAdminIds() {
  return new Set(
    String(process.env.TELEGRAM_ADMIN_USER_IDS || "")
      .split(",")
      .map(value => Number(value.trim()))
      .filter(value => Number.isSafeInteger(value) && value > 0),
  );
}

export function isTelegramAdmin(userId: number) {
  return telegramAdminIds().has(userId);
}

async function telegramApi<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum dikonfigurasi.");
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    const body = await response.json() as { ok?: boolean; result?: T };
    if (!response.ok || !body.ok) throw new Error("Telegram request failed");
    return body.result as T;
  } catch {
    throw new Error("Telegram belum dapat dihubungi. Periksa konfigurasi dan koneksi bot.");
  }
}

export async function telegramSendMessage(input: {
  chatId: number | string;
  text: string;
  replyMarkup?: TelegramReplyMarkup;
  replyToMessageId?: number;
}) {
  return telegramApi<{ message_id: number }>("sendMessage", {
    chat_id: input.chatId,
    text: input.text,
    ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
    ...(input.replyToMessageId ? { reply_parameters: { message_id: input.replyToMessageId, allow_sending_without_reply: true } } : {}),
  });
}

export async function telegramAnswerCallback(callbackQueryId: string, text?: string, showAlert = false) {
  return telegramApi<boolean>("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
    show_alert: showAlert,
  });
}

export async function telegramSetWebhook(url: string) {
  const secret = telegramWebhookSecret();
  if (!secret || secret.length < 16) throw new Error("TELEGRAM_WEBHOOK_SECRET minimal 16 karakter.");
  return telegramApi<boolean>("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}

export async function telegramGetMe() {
  return telegramApi<{ id: number; is_bot: boolean; first_name: string; username?: string }>("getMe", {});
}

export async function telegramGetPrivateChat(userId: number) {
  return telegramApi<{ id: number; type: string; first_name?: string; last_name?: string; username?: string }>("getChat", { chat_id: userId });
}

export async function telegramGetWebhookInfo() {
  return telegramApi<{ url?: string; pending_update_count?: number; last_error_message?: string }>("getWebhookInfo", {});
}

export async function payrollWorkspaceOrder(supabaseAdmin: SupabaseClient, orderRef: string): Promise<Order | null> {
  const { data, error } = await supabaseAdmin
    .from("cp_payroll_workspace")
    .select("payload")
    .eq("id", 1)
    .single();
  if (error) throw new Error(error.message);
  const state = data.payload as WorkspaceState;
  const orders = (state[workspaceKeys.orders] ?? []) as Order[];
  const ref = orderRef.trim().toLowerCase();
  return orders.find(order => order.externalReference.trim().toLowerCase() === ref && !order.sheetDeletedAt) ?? null;
}

export async function payrollWorkspaceEmployees(supabaseAdmin: SupabaseClient) {
  const { data, error } = await supabaseAdmin
    .from("cp_payroll_workspace")
    .select("payload")
    .eq("id", 1)
    .single();
  if (error) throw new Error(error.message);
  const state = data.payload as WorkspaceState;
  return (state[workspaceKeys.employees] ?? []) as Array<{
    code: string;
    name: string;
    team: "FH1" | "FH2" | "FH3" | "ADMIN" | "BANDAR";
    workforceStatus?: string;
  }>;
}

/** Drains committed notices. Never retry an ambiguous Telegram send (no provider idempotency key). */
export async function flushPayrollTelegramOutbox(supabase: SupabaseClient) {
  if (!telegramEnabled() || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")) return { sent: 0 };
  let sent = 0;
  const deadline = Date.now() + 12_000;
  while (sent < 10 && Date.now() < deadline) {
    const { data, error } = await supabase.rpc("cp_telegram_claim_outbox");
    if (error) throw new Error("Antrean Telegram belum dapat diakses.");
    const row = data?.[0];
    if (!row) break;
    try {
      const notice = row.payload as TelegramNotice;
      const message = await telegramSendMessage({ chatId: row.chat_id, text: notice.text.slice(0, 4000), replyMarkup: payrollTelegramKeyboard(notice) });
      const { error: saved } = await supabase.from("cp_payroll_telegram_outbox").update({ status: "sent", message_id: message.message_id }).eq("id", row.id);
      if (saved) throw new Error("Acknowledgement unavailable");
      if (String(row.event_key).startsWith("dispatch:")) {
        await supabase.from("cp_payroll_telegram_order_chats").update({ message_id: message.message_id }).eq("order_ref", row.order_ref).eq("chat_id", row.chat_id);
        await supabase.from("cp_payroll_telegram_orders").update({ dispatch_status: "sent" }).eq("order_ref", row.order_ref);
      }
      sent++;
    } catch {
      await supabase.from("cp_payroll_telegram_outbox").update({ status: "uncertain" }).eq("id", row.id);
      break;
    }
  }
  return { sent };
}

export async function dispatchPayrollTelegramOrder(supabase: SupabaseClient, order: Order) {
  if (order.orderType !== "boosting" && order.orderType !== "gold") return { sent: 0, skipped: "unsupported_type" };
  const { error } = await supabase.rpc("cp_telegram_dispatch", { p_order_ref: order.externalReference });
  if (error) throw new Error("Order Telegram belum dapat dijadwalkan.");
  return flushPayrollTelegramOutbox(supabase);
}

// The workspace database trigger enqueues new/corrected Sheet and manual orders atomically.
export async function dispatchAddedSheetOrders(supabase: SupabaseClient, _state: WorkspaceState, _rows: Array<{ rowNumber: number; status: string }>) {
  void _state; void _rows;
  try { return await flushPayrollTelegramOutbox(supabase); }
  catch { return { sent: 0 }; } // The minute worker retries pending rows independently of Sheet hashes.
}

export function telegramMessageLink(chatId: number, messageId: number, chatUsername?: string | null) {
  const username = String(chatUsername || "").replace(/^@/, "").trim();
  if (username) return `https://t.me/${username}/${messageId}`;
  const raw = String(chatId);
  if (raw.startsWith("-100")) return `https://t.me/c/${raw.slice(4)}/${messageId}`;
  return null;
}
