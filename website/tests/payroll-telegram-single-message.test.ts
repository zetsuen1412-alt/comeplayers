import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPayrollTelegramOrderNotice,
  deliverPayrollTelegramMessage,
  isTelegramMessageNotModified,
  telegramMessageText,
  type PayrollTelegramCardWorkflow,
  type PayrollTelegramMessageTransport,
} from "../lib/payrollTelegramMessage";
import { parsePayrollTelegramUpdate, payrollTelegramKeyboard, type TelegramNotice } from "../lib/payrollTelegramProtocol";

const order = {
  externalReference: "X3092", orderName: "1 Week Package (12 Hours/Day)",
  buyerName: "ShumzSG", game: "AION", team: "FH3", task: "Complete daily activities",
  workerAssignments: [{ employeeName: "ASTRI" }],
};
const workflow: PayrollTelegramCardWorkflow = {
  callback_id: 31, order_type: "boosting", state: "assigned", division: "FH3",
  target_quantity: 1, delivered_quantity: 0,
};
const employees = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, name: `Employee ${i + 1}` }));
function recorder() {
  const sent: unknown[] = [];
  const edited: Array<Parameters<PayrollTelegramMessageTransport["edit"]>[0]> = [];
  const transport: PayrollTelegramMessageTransport = {
    async send(input) { sent.push(input); return { message_id: 999 }; },
    async edit(input) { edited.push(input); return { message_id: input.messageId }; },
  };
  return { sent, edited, transport };
}

test("employee picker retains the order details and edits the canonical message", async () => {
  const notice = buildPayrollTelegramOrderNotice(order, workflow, { text: "PILIH KARYAWAN", keyboard: "picker", page: 0, employees });
  assert.ok(notice.text.includes(`Buyer : ${order.buyerName}`));
  for (const value of ["X3092", order.orderName, order.buyerName, "AION", "FH3", "ASTRI", order.task, "HALAMAN 1"]) assert.ok(notice.text.includes(value));
  const calls = recorder();
  assert.deepEqual(await deliverPayrollTelegramMessage({ chatId: -100300, notice, orderNotice: true, initialDispatch: false, messageId: 42 }, calls.transport), { message_id: 42 });
  assert.equal(calls.sent.length, 0);
  assert.equal(calls.edited[0].messageId, 42);
  assert.equal(calls.edited[0].chatId, -100300);
});

for (const keyboard of ["picker", "goldpicker"]) {
  test(`${keyboard} pagination and empty results always offer a way back`, () => {
    for (const [page, roster] of [[0, employees], [1, employees.slice(0, 2)], [2, []]] as const) {
      const notice = buildPayrollTelegramOrderNotice(order, workflow, { text: "", keyboard, page, employees: [...roster] });
      const buttons = payrollTelegramKeyboard(notice)!.inline_keyboard.flat();
      assert.equal(buttons.at(-1)?.callback_data, "cp2:back:31");
      assert.equal(buttons.some(b => b.callback_data === `cp2:${keyboard}:31:${page - 1}`), page > 0);
      assert.equal(buttons.some(b => b.callback_data === `cp2:${keyboard}:31:${page + 1}`), roster.length > 8);
      assert.ok(buttons.filter(b => b.callback_data.includes(keyboard === "picker" ? ":pick:" : ":pickgold:")).length <= 8);
      assert.ok(buttons.every(b => Buffer.byteLength(b.callback_data, "utf8") <= 64));
    }
  });
}

test("back button carries the same order ID, not the clicked Telegram message ID", () => {
  const event = parsePayrollTelegramUpdate({ update_id: 700, callback_query: {
    id: "callback", from: { id: 20 }, data: "cp2:back:31",
    message: { message_id: 42, chat: { id: -100300, type: "supergroup" } },
  } });
  assert.equal(event?.action, "back");
  assert.equal(event?.orderId, "31");
  assert.equal(event?.chatId, -100300);
});

const actions: Array<[string, string, TelegramNotice]> = [
  ["assigned", "assigned", { text: "KARYAWAN DITENTUKAN", keyboard: "boosting" }],
  ["start evidence", "assigned", { text: "BUKTI START WAJIB", keyboard: "session", sessionId: "start-session" }],
  ["start accepted", "in_progress", { text: "START", keyboard: "boosting" }],
  ["pause", "paused", { text: "PAUSE", keyboard: "boosting" }],
  ["resume", "in_progress", { text: "RESUME", keyboard: "boosting" }],
  ["problem", "problem", { text: "BERMASALAH", keyboard: "boosting" }],
  ["done evidence", "in_progress", { text: "BUKTI DONE WAJIB", keyboard: "session", sessionId: "done-session" }],
  ["more evidence", "in_progress", { text: "Kirim bukti tambahan", keyboard: "session", sessionId: "done-session" }],
  ["cancel evidence", "in_progress", { text: "Sesi dibatalkan. Bukti tetap tersimpan." }],
  ["validation error", "paused", { text: "PAUSE hanya saat berlangsung.", rejected: true }],
  ["done accepted", "done_pending_admin", { text: "DONE" }],
  ["admin verified", "verified", { text: "SELESAI" }],
];
for (const [action, state, payload] of actions) {
  test(`${action} updates the same message and preserves the full order`, async () => {
    const calls = recorder();
    const notice = buildPayrollTelegramOrderNotice(order, { ...workflow, state }, payload);
    await deliverPayrollTelegramMessage({ chatId: -100300, notice, orderNotice: true, initialDispatch: false, messageId: "42" }, calls.transport);
    assert.equal(calls.sent.length, 0);
    assert.equal(calls.edited.length, 1);
    assert.equal(calls.edited[0].messageId, 42);
    assert.ok(calls.edited[0].text.includes(order.orderName));
    if (["done_pending_admin", "verified"].includes(state)) assert.deepEqual(calls.edited[0].replyMarkup, { inline_keyboard: [] });
    else assert.ok(calls.edited[0].replyMarkup!.inline_keyboard.length > 0);
  });
}

test("START and DONE prompts do not prematurely change the database state", () => {
  for (const state of ["assigned", "in_progress"]) {
    const notice = buildPayrollTelegramOrderNotice(order, { ...workflow, state }, { text: "BUKTI WAJIB", keyboard: "session", sessionId: "evidence-session" });
    assert.ok(!notice.text.includes("DONE — MENUNGGU"));
    const callbacks = payrollTelegramKeyboard(notice)!.inline_keyboard.flat().map(b => b.callback_data);
    assert.ok(callbacks.includes("cp2:finish:evidence-session"));
    assert.ok(callbacks.includes("cp2:cancel:evidence-session"));
  }
});

test("completed orders remove even a stale picker or upload keyboard", () => {
  for (const state of ["done_pending_admin", "verified"]) {
    const notice = buildPayrollTelegramOrderNotice(order, { ...workflow, state }, { text: "Upload", keyboard: "session", sessionId: "old" });
    assert.equal(payrollTelegramKeyboard(notice), undefined);
    assert.ok(!notice.text.includes("Upload"));
  }
});

test("partial gold delivery restores gold actions and shows the current quota", () => {
  const notice = buildPayrollTelegramOrderNotice(order, { ...workflow, order_type: "gold", state: "in_progress", target_quantity: 200, delivered_quantity: 70 }, { text: "SETORAN GOLD DITERIMA" });
  assert.ok(notice.text.includes("70 / 200"));
  assert.equal(payrollTelegramKeyboard(notice)!.inline_keyboard[0][0].callback_data, "cp2:gold:31");
});

test("only the initial order dispatch sends, while repeat dispatch edits", async () => {
  const calls = recorder();
  const notice = buildPayrollTelegramOrderNotice(order, workflow);
  await deliverPayrollTelegramMessage({ chatId: -100300, notice, orderNotice: true, initialDispatch: true }, calls.transport);
  await deliverPayrollTelegramMessage({ chatId: -100300, notice, orderNotice: true, initialDispatch: true, messageId: 999 }, calls.transport);
  assert.equal(calls.sent.length, 1);
  assert.equal(calls.edited.length, 1);
  assert.equal(calls.edited[0].messageId, 999);
});

test("standalone commands may still receive a normal reply", async () => {
  const calls = recorder();
  await deliverPayrollTelegramMessage({ chatId: 500, notice: { text: "Telegram User ID: 500" }, orderNotice: false, initialDispatch: false }, calls.transport);
  assert.equal(calls.sent.length, 1);
  assert.equal(calls.edited.length, 0);
});

test("missing or invalid canonical IDs never fall back to sending a new card", async () => {
  for (const messageId of [undefined, null, 0, -1, "broken", 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const calls = recorder();
    await assert.rejects(deliverPayrollTelegramMessage({ chatId: -100300, notice: { text: "PAUSE" }, orderNotice: true, initialDispatch: false, messageId }, calls.transport));
    assert.equal(calls.sent.length, 0);
    assert.equal(calls.edited.length, 0);
  }
});

test("timeouts, deleted messages, and Telegram errors do not send replacement messages", async () => {
  for (const reason of ["timeout", "message to edit not found", "rate limited"]) {
    const calls = recorder();
    calls.transport.edit = async () => { throw new Error(reason); };
    await assert.rejects(deliverPayrollTelegramMessage({ chatId: -100300, notice: { text: "PAUSE" }, orderNotice: true, initialDispatch: false, messageId: 42 }, calls.transport), new RegExp(reason));
    assert.equal(calls.sent.length, 0);
  }
});

test("only Telegram's unchanged edit response is an idempotent success", () => {
  const unchanged = { error_code: 400, description: "Bad Request: message is not modified" };
  assert.equal(isTelegramMessageNotModified("editMessageText", unchanged), true);
  assert.equal(isTelegramMessageNotModified("sendMessage", unchanged), false);
  assert.equal(isTelegramMessageNotModified("editMessageText", { error_code: 400, description: "message to edit not found" }), false);
  assert.equal(isTelegramMessageNotModified("editMessageText", { error_code: 429, description: "Too Many Requests" }), false);
});

test("long task text stays within Telegram's limit without cutting an emoji", () => {
  const notice = buildPayrollTelegramOrderNotice({ ...order, task: "😀".repeat(6000) }, workflow, { text: "📷".repeat(2000), keyboard: "session", sessionId: "s" });
  assert.ok(notice.text.length <= 4000);
  assert.equal(decodeURI(encodeURI(notice.text)), notice.text);
  assert.equal(telegramMessageText("abc😀def", 5), "abc…");
});

test("media parsing retains the user's evidence ID independently of the order card", () => {
  const event = parsePayrollTelegramUpdate({ update_id: 701, message: {
    message_id: 85, from: { id: 20 }, chat: { id: -100300, type: "supergroup" },
    photo: [{ file_id: "photo", file_unique_id: "unique" }],
  } });
  assert.equal(event?.action, "media");
  assert.equal(event?.messageId, 85);
  assert.equal(event?.fileId, "photo");
});
