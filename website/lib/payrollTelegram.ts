import "server-only";
import type { TelegramNotice } from "./payrollTelegramProtocol";
import { buildPayrollTelegramOrderNotice, deliverPayrollTelegramMessage, isTelegramMessageNotModified, type PayrollTelegramCardWorkflow } from "./payrollTelegramMessage";

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
    const body = await response.json() as { ok?: boolean; result?: T; error_code?: number; description?: string };
    if (isTelegramMessageNotModified(method, body)) return true as T;
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

export async function telegramEditMessage(input: {
  chatId: number | string;
  messageId: number;
  text: string;
  replyMarkup?: TelegramReplyMarkup;
}) {
  return telegramApi<{ message_id: number } | boolean>("editMessageText", {
    chat_id: input.chatId,
    message_id: input.messageId,
    text: input.text,
    reply_markup: input.replyMarkup ?? { inline_keyboard: [] },
  });
}

export async function telegramDeleteMessage(chatId: number | string, messageId: number) {
  return telegramApi<boolean>("deleteMessage", { chat_id: chatId, message_id: messageId });
}

export async function telegramDownloadFile(fileId: string) {
  const file = await telegramApi<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("File Telegram tidak tersedia.");
  const token = botToken();
  const response = await fetch(`${TELEGRAM_API}/file/bot${token}/${file.file_path}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Bukti Telegram belum dapat diunduh.");
  return {
    body: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
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
  return orders.find(order => order.externalReference.trim().toLowerCase() === ref && !order.sheetDeletedAt && !order.websiteDeletedAt) ?? null;
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

/** Resolve only the order's currently authorized chat, never an arbitrary callback message. */
async function payrollTelegramOrderCard(supabase: SupabaseClient, orderRef: string, chatId: number | string, notice?: TelegramNotice) {
  const [{ data: workflow, error: workflowError }, { data: route, error: routeError }, order, { data: evidence, error: evidenceError }] = await Promise.all([
    supabase.from("cp_payroll_telegram_orders")
      .select("callback_id,order_type,state,division,target_quantity,delivered_quantity").eq("order_ref", orderRef).maybeSingle(),
    supabase.from("cp_payroll_telegram_order_chats").select("message_id,division")
      .eq("order_ref", orderRef).eq("chat_id", chatId).limit(1).maybeSingle(),
    payrollWorkspaceOrder(supabase, orderRef),
    supabase.from("cp_payroll_telegram_evidence").select("media_type").eq("order_ref", orderRef),
  ]);
  if (workflowError || routeError || evidenceError) throw new Error("Pesan order belum dapat dimuat.");
  if (!workflow || !route || !order) return null;
  const { data: allowed, error: accessError } = await supabase.rpc("cp_telegram_route_allowed", {
    p_ref: orderRef, p_division: route.division, p_chat: chatId,
  });
  if (accessError) throw new Error("Rute Telegram belum dapat diperiksa.");
  if (!allowed) return null;

  let screen = notice;
  if (notice?.keyboard === "session" || notice?.rejected) {
    let query = supabase.from("cp_payroll_telegram_sessions").select("id,kind,stage")
      .eq("order_ref", orderRef).eq("chat_id", chatId).is("closed_at", null).gt("expires_at", new Date().toISOString());
    if (notice.sessionId) query = query.eq("id", notice.sessionId);
    const { data: session, error: sessionError } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (sessionError) throw new Error("Sesi bukti belum dapat diperiksa.");
    screen = session
      ? { ...notice, keyboard: "session", sessionId: session.id }
      : notice.keyboard === "session" ? { text: "Sesi bukti telah berakhir. Gunakan tombol order yang tersedia." } : notice;
  }
  const evidencePhotos = (evidence || []).filter(row => row.media_type === "photo").length;
  const evidenceVideos = (evidence || []).filter(row => row.media_type === "video").length;
  screen = { ...(screen || { text: "" }), evidencePhotos, evidenceVideos };
  return { messageId: route.message_id, notice: buildPayrollTelegramOrderNotice(order, workflow as PayrollTelegramCardWorkflow, screen) };
}

/** Read-only navigation. Work/assignment/evidence mutations still go through the database state machine. */
export async function restorePayrollTelegramOrder(supabase: SupabaseClient, orderId: string, chatId: number) {
  if (!/^\d+$/.test(orderId)) return false;
  const { data: order, error } = await supabase.from("cp_payroll_telegram_orders")
    .select("order_ref").eq("callback_id", orderId).maybeSingle();
  if (error) throw new Error("Order Telegram belum dapat dimuat.");
  if (!order) return false;
  const card = await payrollTelegramOrderCard(supabase, order.order_ref, chatId);
  if (!card) return false;
  await deliverPayrollTelegramMessage({ chatId, notice: card.notice, messageId: card.messageId, orderNotice: true, initialDispatch: false },
    { send: telegramSendMessage, edit: telegramEditMessage });
  return true;
}

/** Drain notices by editing the canonical card; only the first dispatch may send an order message. */
export async function flushPayrollTelegramOutbox(supabase: SupabaseClient) {
  if (!telegramEnabled() || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")) return { sent: 0 };
  let sent = 0, processed = 0;
  const deadline = Date.now() + 12_000;
  while (processed < 10 && Date.now() < deadline) {
    const { data, error } = await supabase.rpc("cp_telegram_claim_outbox");
    if (error) throw new Error("Antrean Telegram belum dapat diakses.");
    const row = data?.[0];
    if (!row) break;
    processed++;
    try {
      const initialDispatch = String(row.event_key).startsWith("dispatch:");
      const orderNotice = Boolean(row.order_ref);
      const card = orderNotice
        ? await payrollTelegramOrderCard(supabase, row.order_ref, row.chat_id, initialDispatch ? undefined : row.payload as TelegramNotice)
        : null;
      if (orderNotice && !card) {
        // An archived/re-routed order must not leak updates into its former division.
        const { error: cancelled } = await supabase.from("cp_payroll_telegram_outbox").update({ status: "cancelled" }).eq("id", row.id);
        if (cancelled) throw new Error("Acknowledgement unavailable");
        continue;
      }
      const message = await deliverPayrollTelegramMessage({ chatId: row.chat_id, notice: card?.notice ?? row.payload as TelegramNotice,
        messageId: card?.messageId, orderNotice, initialDispatch }, { send: telegramSendMessage, edit: telegramEditMessage });
      if (initialDispatch) {
        // Save the canonical pointer before acknowledging dispatch; never replace it with a picker/session message.
        const { error: linked } = await supabase.from("cp_payroll_telegram_order_chats").update({ message_id: message.message_id })
          .eq("order_ref", row.order_ref).eq("chat_id", row.chat_id);
        if (linked) throw new Error("Order message link unavailable");
        const { error: marked } = await supabase.from("cp_payroll_telegram_orders").update({ dispatch_status: "sent" }).eq("order_ref", row.order_ref);
        if (marked) throw new Error("Dispatch acknowledgement unavailable");
      }
      const { error: saved } = await supabase.from("cp_payroll_telegram_outbox").update({ status: "sent", message_id: message.message_id }).eq("id", row.id);
      if (saved) throw new Error("Acknowledgement unavailable");
      sent++;
    } catch {
      // Never fall back from editMessageText to sendMessage (even after timeouts or deleted messages).
      await supabase.from("cp_payroll_telegram_outbox").update({ status: "uncertain" }).eq("id", row.id);
      break;
    }
  }
  return { sent };
}

export async function dispatchPayrollTelegramOrder(supabase: SupabaseClient, order: Order) {
  if (order.orderType !== "boosting" && order.orderType !== "gold" && order.orderType !== "item") return { sent: 0, skipped: "unsupported_type" };
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
