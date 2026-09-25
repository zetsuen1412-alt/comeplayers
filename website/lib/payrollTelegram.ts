import "server-only";

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
  | "done_pending_admin";

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
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const body = await response.json() as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || !body.ok) throw new Error(body.description || `Telegram ${method} gagal.`);
  return body.result as T;
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

export async function telegramGetWebhookInfo() {
  return telegramApi<{ url?: string; pending_update_count?: number; last_error_message?: string }>("getWebhookInfo", {});
}

function buttonsForBoosting(orderRef: string, assigned: boolean): TelegramReplyMarkup {
  return {
    inline_keyboard: assigned
      ? [
          [
            { text: "▶ START", callback_data: `cp:start:${orderRef}` },
            { text: "⏸ PAUSE", callback_data: `cp:pause:${orderRef}` },
            { text: "▶ RESUME", callback_data: `cp:resume:${orderRef}` },
          ],
          [
            { text: "✅ DONE", callback_data: `cp:done:${orderRef}` },
            { text: "⚠ BERMASALAH", callback_data: `cp:problem:${orderRef}` },
          ],
          [{ text: "👤 CARA PILIH / GANTI KARYAWAN", callback_data: `cp:assignhelp:${orderRef}` }],
        ]
      : [
          [{ text: "👤 PILIH KARYAWAN", callback_data: `cp:assignhelp:${orderRef}` }],
          [{ text: "⚠ BERMASALAH", callback_data: `cp:problem:${orderRef}` }],
        ],
  };
}

function buttonsForGold(orderRef: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [{ text: "🪙 KIRIM GOLD", callback_data: `cp:gold:${orderRef}` }],
      [{ text: "⚠ BERMASALAH", callback_data: `cp:problem:${orderRef}` }],
    ],
  };
}

function orderText(order: Order, division: string) {
  const game = order.gameName || order.game || "—";
  const name = order.orderName || order.service || "—";
  const task = order.task?.trim();
  if (order.orderType === "gold") {
    return [
      "🪙 ORDER GOLD BARU",
      "",
      `Kode Order : ${order.externalReference}`,
      `Game       : ${game}`,
      `Target     : ${order.quantity.toLocaleString("id-ID")} Gold`,
      `Divisi     : ${division}`,
      `Proses     : ${order.process || "—"}`,
      "",
      `Progress   : 0 / ${order.quantity.toLocaleString("id-ID")}`,
      "",
      "Kuota adalah GLOBAL. Semua divisi yang menerima order ini boleh mengirim sampai target terpenuhi.",
    ].join("\n");
  }
  return [
    "🎮 ORDER BOOSTING BARU",
    "",
    `Kode Order : ${order.externalReference}`,
    `Game       : ${game}`,
    `Divisi     : ${division}`,
    `Order      : ${name}`,
    ...(task ? [`Task       : ${task}`] : []),
    `Buyer      : ${order.buyerName || "—"}`,
    `Proses     : ${order.process || "JOKI"}`,
    "",
    "Karyawan   : BELUM DITENTUKAN DI TELEGRAM",
    "",
    "Admin/leader gunakan:",
    `/assign ${order.externalReference} KODE_KARYAWAN`,
  ].join("\n");
}

function normalizedDivision(value: unknown) {
  const text = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (["1", "FH1"].includes(text)) return "FH1";
  if (["2", "FH2"].includes(text)) return "FH2";
  if (["3", "FH3"].includes(text)) return "FH3";
  if (text === "ADMIN") return "ADMIN";
  if (text === "BANDAR") return "BANDAR";
  return "";
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

export async function dispatchPayrollTelegramOrder(supabaseAdmin: SupabaseClient, order: Order) {
  if (!telegramEnabled()) return { sent: 0, skipped: "bot_disabled" };
  if (order.orderType !== "boosting" && order.orderType !== "gold") return { sent: 0, skipped: "unsupported_type" };

  const { data: boundDivisions, error: divisionError } = await supabaseAdmin
    .from("cp_payroll_telegram_divisions")
    .select("division,chat_id,chat_title,chat_username")
    .eq("active", true);
  if (divisionError) throw new Error(divisionError.message);

  const team = normalizedDivision(order.team);
  const targets = order.orderType === "gold"
    ? (boundDivisions || []).filter(row => ["FH1", "FH2", "FH3"].includes(row.division))
    : team
      ? (boundDivisions || []).filter(row => row.division === team)
      : (boundDivisions || []).filter(row => ["FH1", "FH2", "FH3"].includes(row.division));

  if (!targets.length) return { sent: 0, skipped: "no_bound_division" };

  const { error: orderError } = await supabaseAdmin
    .from("cp_payroll_telegram_orders")
    .upsert({
      order_ref: order.externalReference,
      order_type: order.orderType,
      target_quantity: order.orderType === "gold" ? Math.max(0, Number(order.quantity || 0)) : 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: "order_ref", ignoreDuplicates: false });
  if (orderError) throw new Error(orderError.message);

  let sent = 0;
  for (const target of targets) {
    const { data: existing } = await supabaseAdmin
      .from("cp_payroll_telegram_order_chats")
      .select("message_id")
      .eq("order_ref", order.externalReference)
      .eq("division", target.division)
      .maybeSingle();
    if (existing?.message_id) continue;

    const message = await telegramSendMessage({
      chatId: target.chat_id,
      text: orderText(order, target.division),
      replyMarkup: order.orderType === "gold"
        ? buttonsForGold(order.externalReference)
        : buttonsForBoosting(order.externalReference, false),
    });
    const { error } = await supabaseAdmin
      .from("cp_payroll_telegram_order_chats")
      .upsert({
        order_ref: order.externalReference,
        division: target.division,
        chat_id: target.chat_id,
        message_id: message.message_id,
      }, { onConflict: "order_ref,division" });
    if (error) throw new Error(error.message);
    sent++;
  }
  return { sent };
}

export async function dispatchAddedSheetOrders(
  supabaseAdmin: SupabaseClient,
  state: WorkspaceState,
  rowResults: Array<{ rowNumber: number; status: string }>,
) {
  if (!telegramEnabled()) return { sent: 0 };
  const addedRows = new Set(rowResults.filter(row => row.status === "added").map(row => row.rowNumber));
  if (!addedRows.size) return { sent: 0 };
  const orders = ((state[workspaceKeys.orders] ?? []) as Order[])
    .filter(order => order.importSourceRow && addedRows.has(order.importSourceRow) && !order.sheetDeletedAt);
  let sent = 0;
  for (const order of orders) {
    try {
      const result = await dispatchPayrollTelegramOrder(supabaseAdmin, order);
      sent += result.sent;
    } catch (error) {
      console.error("Telegram payroll dispatch failed", order.externalReference, error);
    }
  }
  return { sent };
}

export function telegramMessageLink(chatId: number, messageId: number, chatUsername?: string | null) {
  const username = String(chatUsername || "").replace(/^@/, "").trim();
  if (username) return `https://t.me/${username}/${messageId}`;
  const raw = String(chatId);
  if (raw.startsWith("-100")) return `https://t.me/c/${raw.slice(4)}/${messageId}`;
  return null;
}

export const telegramKeyboards = {
  boosting: buttonsForBoosting,
  gold: buttonsForGold,
};
