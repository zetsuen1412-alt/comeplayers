/** Rendering and delivery policy for the single, persistent message of an order. */
import { payrollTelegramKeyboard, type TelegramNotice } from "./payrollTelegramProtocol";

export type PayrollTelegramCardOrder = {
  externalReference: string;
  orderName?: string;
  service?: string;
  gameName?: string;
  game?: string;
  team?: string;
  task?: string;
  employeeName?: string;
  workerAssignments?: { employeeName: string }[];
};
export type PayrollTelegramCardWorkflow = {
  callback_id: number;
  order_type: string;
  state: string;
  division?: string | null;
  target_quantity: number | string;
  delivered_quantity: number | string;
};
export type PayrollTelegramReplyMarkup = NonNullable<ReturnType<typeof payrollTelegramKeyboard>>;
export type PayrollTelegramMessageInput = {
  chatId: number | string;
  text: string;
  replyMarkup?: PayrollTelegramReplyMarkup;
};
export type PayrollTelegramMessageTransport = {
  send(input: PayrollTelegramMessageInput): Promise<{ message_id: number }>;
  edit(input: PayrollTelegramMessageInput & { messageId: number }): Promise<unknown>;
};

const stateLabels: Record<string, string> = {
  waiting: "⚪ MENUNGGU KARYAWAN",
  assigned: "👤 KARYAWAN DITENTUKAN",
  in_progress: "🟢 SEDANG DIKERJAKAN",
  paused: "⏸ DIJEDA",
  problem: "⚠ BERMASALAH",
  done_pending_admin: "🟡 DONE — MENUNGGU VERIFIKASI ADMIN",
  verified: "✅ SELESAI — DIVERIFIKASI ADMIN",
};

export function telegramMessageText(value: string, limit = 4000) {
  if (value.length <= limit) return value;
  // Avoid cutting an emoji's UTF-16 surrogate pair at the Telegram text boundary.
  return value.slice(0, limit - 1).replace(/[\uD800-\uDBFF]$/, "") + "…";
}

export function isTelegramMessageNotModified(method: string, body: { error_code?: number; description?: string }) {
  return method === "editMessageText" && body.error_code === 400 && /message is not modified/i.test(body.description ?? "");
}

export function buildPayrollTelegramOrderNotice(
  order: PayrollTelegramCardOrder,
  workflow: PayrollTelegramCardWorkflow,
  notice?: TelegramNotice,
): TelegramNotice {
  const terminal = workflow.state === "verified" || workflow.state === "done_pending_admin";
  const title = workflow.order_type === "gold" ? "🪙 ORDER GOLD" : workflow.order_type === "item" ? "📦 ORDER ITEM" : "🎮 ORDER BOOSTING";
  const employees = (order.workerAssignments ?? []).map(worker => worker.employeeName).filter(Boolean).join(", ");
  const lines = [title, `Order : ${telegramMessageText(order.externalReference, 180)}`,
    `Nama : ${telegramMessageText(order.orderName || order.service || "—", 400)}`,
    `Game : ${telegramMessageText(order.gameName || order.game || "—", 200)}`,
    `Divisi : ${workflow.division || order.team || "—"}`,
    `Karyawan : ${telegramMessageText(employees || order.employeeName || "Ditentukan leader", 400)}`,
    `Target : ${workflow.target_quantity}`,
    `Status : ${stateLabels[workflow.state] || workflow.state}`];
  if (workflow.order_type === "gold") lines.push(`Terkirim : ${workflow.delivered_quantity} / ${workflow.target_quantity}`);
  lines.push(`TASK : ${telegramMessageText(order.task || "—", 1500)}`);

  const picker = notice?.keyboard === "picker" || notice?.keyboard === "goldpicker";
  if (!terminal && picker) {
    lines.push("", `👤 PILIH KARYAWAN — HALAMAN ${(notice.page ?? 0) + 1}`,
      notice.employees?.length ? "Pilih nama di bawah. Daftar tetap di pesan order ini." : "Tidak ada karyawan aktif pada halaman ini.");
  } else if (!terminal && notice?.text) {
    lines.push("", telegramMessageText(notice.text, 750));
  }
  if (terminal) lines.push("", workflow.state === "verified" ? "Order selesai. Semua aksi ditutup." : "Bukti diterima. Menunggu pemeriksaan admin; aksi pekerjaan ditutup.");

  return {
    ...notice,
    text: telegramMessageText(lines.join("\n")),
    orderId: workflow.callback_id,
    // Always remove stale picker/session buttons after completion.
    keyboard: terminal ? undefined : (notice?.keyboard || workflow.order_type),
  };
}

export async function deliverPayrollTelegramMessage(
  input: { chatId: number | string; notice: TelegramNotice; orderNotice: boolean; initialDispatch: boolean; messageId?: number | string | null },
  transport: PayrollTelegramMessageTransport,
): Promise<{ message_id: number }> {
  const messageId = input.messageId == null ? null : Number(input.messageId);
  const message = { chatId: input.chatId, text: telegramMessageText(input.notice.text), replyMarkup: payrollTelegramKeyboard(input.notice) };
  if (input.orderNotice && messageId !== null) {
    if (!Number.isSafeInteger(messageId) || messageId <= 0) throw new Error("ID pesan order tidak valid.");
    // An explicit empty keyboard clears the old buttons after DONE/verification.
    await transport.edit({ ...message, messageId, replyMarkup: message.replyMarkup ?? { inline_keyboard: [] } });
    return { message_id: messageId };
  }
  if (input.orderNotice && !input.initialDispatch) {
    // A missing/deleted canonical message is an operator issue, never a reason to spam a new card.
    throw new Error("Pesan utama order belum tercatat. Periksa pengiriman awal di Telegram Payroll.");
  }
  return transport.send(message);
}
