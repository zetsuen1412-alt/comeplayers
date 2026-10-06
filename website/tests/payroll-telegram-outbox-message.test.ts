import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as messagePolicy from "../lib/payrollTelegramMessage";

// Exercise the actual server transport with isolated credentials, database and fetch.
// This does not import server-only into the browser or contact Telegram/Supabase.
type Row = Record<string, unknown>;
class Query {
  filters: Array<(row: Row) => boolean> = [];
  patch?: Row;
  take?: number;
  constructor(private rows: Row[]) {}
  select() { return this; }
  eq(key: string, value: unknown) { this.filters.push(row => String(row[key]) === String(value)); return this; }
  is(key: string, value: unknown) { this.filters.push(row => row[key] === value); return this; }
  gt(key: string, value: unknown) { this.filters.push(row => String(row[key]) > String(value)); return this; }
  order() { return this; }
  limit(count: number) { this.take = count; return this; }
  update(patch: Row) { this.patch = patch; return this; }
  result() {
    let selected = this.rows.filter(row => this.filters.every(filter => filter(row)));
    if (this.take !== undefined) selected = selected.slice(0, this.take);
    if (this.patch) for (const row of selected) Object.assign(row, this.patch);
    return { data: selected, error: null };
  }
  async maybeSingle() { const result = this.result(); return { ...result, data: result.data[0] ?? null }; }
  async single() { return this.maybeSingle(); }
  then<T>(callback: (result: ReturnType<Query["result"]>) => T) { return Promise.resolve(this.result()).then(callback); }
}

const source = readFileSync(resolve(process.cwd(), "lib/payrollTelegram.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function fixture(options: { state?: string; messageId?: number | null; notice?: Row; eventKey?: string; orderRef?: string | null; allowed?: boolean; session?: Row; failure?: "unchanged" | "deleted" | "network"; websiteDeletedAt?: string; sheetDeletedAt?: string } = {}) {
  const outbox: Row = { id: 1, event_key: options.eventKey ?? "update:123", order_ref: options.orderRef === undefined ? "X3092" : options.orderRef,
    chat_id: -100300, status: "pending", payload: options.notice ?? { text: "PAUSE — X3092", keyboard: "boosting", orderId: 31 } };
  const route = { order_ref: "X3092", division: "FH3", chat_id: -100300, message_id: options.messageId === undefined ? 42 : options.messageId };
  const rows: Record<string, Row[]> = {
    cp_payroll_telegram_outbox: [outbox],
    cp_payroll_telegram_order_chats: [route],
    cp_payroll_telegram_orders: [{ order_ref: "X3092", callback_id: 31, order_type: "boosting", state: options.state ?? "paused", division: "FH3", target_quantity: 1, delivered_quantity: 0 }],
    cp_payroll_workspace: [{ id: 1, payload: { "cp-ofs-demo-user-orders-v3": [{ externalReference: "X3092", orderName: "1 Week Package", game: "AION", team: "FH3", task: "Daily quests", workerAssignments: [{ employeeName: "ASTRI" }], websiteDeletedAt: options.websiteDeletedAt, sheetDeletedAt: options.sheetDeletedAt }] } }],
    cp_payroll_telegram_evidence: [],
    cp_payroll_telegram_sessions: options.session ? [{ order_ref: "X3092", chat_id: -100300, closed_at: null, expires_at: new Date(Date.now() + 3600000).toISOString(), ...options.session }] : [],
  };
  const database = {
    from(name: string) { assert.ok(rows[name], `Unexpected table ${name}`); return new Query(rows[name]); },
    async rpc(name: string) {
      if (name === "cp_telegram_route_allowed") return { data: options.allowed ?? true, error: null };
      assert.equal(name, "cp_telegram_claim_outbox");
      const next = rows.cp_payroll_telegram_outbox.find(row => row.status === "pending");
      if (next) next.status = "sending";
      return { data: next ? [{ ...next }] : [], error: null };
    },
  };
  const calls: Array<{ method: string; body: Row }> = [];
  const exported: Row = {};
  runInNewContext(compiled, {
    exports: exported, module: { exports: exported },
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "./payrollTelegramMessage") return messagePolicy;
      if (name === "@/features/payroll/lib/workspace-model") return { workspaceKeys: { orders: "cp-ofs-demo-user-orders-v3" } };
      throw new Error(`Unexpected server dependency ${name}`);
    },
    process: { env: { TELEGRAM_BOT_TOKEN: "test-only-not-a-real-bot-token", VERCEL_ENV: "production" } },
    AbortSignal, Date,
    async fetch(url: string, init: { body: string }) {
      const method = url.split("/").at(-1)!;
      const body = JSON.parse(init.body) as Row;
      calls.push({ method, body });
      if (options.failure === "network") throw new Error(url);
      if (options.failure) return { ok: false, async json() { return { ok: false, error_code: 400, description: options.failure === "unchanged" ? "Bad Request: message is not modified" : "Bad Request: message to edit not found" }; } };
      return { ok: true, async json() { return { ok: true, result: { message_id: body.message_id ?? 999 } }; } };
    },
  });
  const api = exported as unknown as {
    flushPayrollTelegramOutbox(db: typeof database): Promise<{ sent: number }>;
    restorePayrollTelegramOrder(db: typeof database, orderId: string, chatId: number): Promise<boolean>;
    payrollWorkspaceOrder(db: typeof database, reference: string): Promise<Row | null>;
  };
  return { api, database, calls, outbox, route, rows };
}

test("real outbox flusher edits the canonical order card, preserving employee and details", async () => {
  const f = fixture();
  await f.api.flushPayrollTelegramOutbox(f.database);
  assert.deepEqual(f.calls.map(call => call.method), ["editMessageText"]);
  assert.equal(f.calls[0].body.message_id, 42);
  assert.equal(f.calls[0].body.chat_id, -100300);
  assert.match(String(f.calls[0].body.text), /ASTRI/);
  assert.match(String(f.calls[0].body.text), /1 Week Package/);
  assert.match(String(f.calls[0].body.text), /DIJEDA/);
  assert.equal(f.outbox.status, "sent");
  assert.equal(f.outbox.message_id, 42);
  assert.equal(f.route.message_id, 42);
});

test("website-deleted orders are inactive in lookup, callback navigation and queued initial delivery", async () => {
  const f = fixture({ websiteDeletedAt: "2026-10-06T12:00:00Z", eventKey: "dispatch:X3092", state: "assigned" });
  assert.equal(await f.api.payrollWorkspaceOrder(f.database, " x3092 "), null);
  assert.equal(await f.api.restorePayrollTelegramOrder(f.database, "31", -100300), false);
  assert.equal((await f.api.flushPayrollTelegramOutbox(f.database)).sent, 0);
  assert.equal(f.outbox.status, "cancelled");
  assert.equal(f.calls.length, 0);
  assert.equal(f.rows.cp_payroll_telegram_orders[0].state, "assigned", "an archive must not mark the workflow verified");
});

test("explicit website restoration resumes the same canonical card without changing its workflow state", async () => {
  const f = fixture({ websiteDeletedAt: "2026-10-06T12:00:00Z", state: "paused" });
  const payload = f.rows.cp_payroll_workspace[0].payload as Record<string, Row[]>;
  delete payload["cp-ofs-demo-user-orders-v3"][0].websiteDeletedAt;
  assert.ok(await f.api.payrollWorkspaceOrder(f.database, " X3092 "));
  assert.equal(await f.api.restorePayrollTelegramOrder(f.database, "31", -100300), true);
  assert.deepEqual(f.calls.map(call => call.method), ["editMessageText"]);
  assert.equal(f.calls[0].body.message_id, 42);
  assert.equal(f.rows.cp_payroll_telegram_orders[0].state, "paused");
});

test("real flusher replaces picker buttons in the existing order", async () => {
  const f = fixture({ notice: { text: "PILIH", keyboard: "picker", page: 1, employees: [{ id: 5, name: "ASTRI" }] } });
  await f.api.flushPayrollTelegramOutbox(f.database);
  assert.equal(f.calls[0].method, "editMessageText");
  const markup = JSON.stringify(f.calls[0].body.reply_markup);
  assert.match(markup, /cp2:pick:31:5/);
  assert.match(markup, /cp2:back:31/);
  assert.equal(f.calls.length, 1);
});

test("session evidence responses without an order ID still edit the original card", async () => {
  const f = fixture({ notice: { text: "BUKTI DONE WAJIB", keyboard: "session", sessionId: "session-1" }, session: { id: "session-1", kind: "done", stage: "evidence" }, state: "in_progress" });
  await f.api.flushPayrollTelegramOutbox(f.database);
  assert.equal(f.calls[0].body.message_id, 42);
  assert.match(JSON.stringify(f.calls[0].body.reply_markup), /cp2:finish:session-1/);
  assert.equal(f.outbox.status, "sent");
});

test("an expired upload screen restores order actions without a new message", async () => {
  const f = fixture({ notice: { text: "BUKTI", keyboard: "session", sessionId: "expired" } });
  await f.api.flushPayrollTelegramOutbox(f.database);
  assert.match(String(f.calls[0].body.text), /Sesi bukti telah berakhir/);
  assert.doesNotMatch(JSON.stringify(f.calls[0].body.reply_markup), /expired/);
  assert.equal(f.calls[0].method, "editMessageText");
});

test("a rejected evidence action keeps active upload controls on the order card", async () => {
  const f = fixture({ notice: { text: "Minimal satu foto/video wajib sebelum selesai.", rejected: true }, session: { id: "session-1", kind: "done", stage: "evidence" }, state: "in_progress" });
  await f.api.flushPayrollTelegramOutbox(f.database);
  assert.match(JSON.stringify(f.calls[0].body.reply_markup), /cp2:finish:session-1/);
  assert.equal(f.calls[0].method, "editMessageText");
});

test("initial dispatch records the new message ID; a known dispatch is not sent twice", async () => {
  const fresh = fixture({ messageId: null, eventKey: "dispatch:X3092:-100300" });
  await fresh.api.flushPayrollTelegramOutbox(fresh.database);
  assert.deepEqual(fresh.calls.map(call => call.method), ["sendMessage"]);
  assert.equal(fresh.route.message_id, 999);
  const existing = fixture({ eventKey: "dispatch:X3092:-100300" });
  await existing.api.flushPayrollTelegramOutbox(existing.database);
  assert.deepEqual(existing.calls.map(call => call.method), ["editMessageText"]);
});

test("no recorded original message makes updates uncertain rather than creating duplicates", async () => {
  const f = fixture({ messageId: null });
  await f.api.flushPayrollTelegramOutbox(f.database);
  assert.equal(f.calls.length, 0);
  assert.equal(f.outbox.status, "uncertain");
});

test("a re-routed division receives no order updates", async () => {
  const f = fixture({ allowed: false });
  await f.api.flushPayrollTelegramOutbox(f.database);
  assert.equal(f.calls.length, 0);
  assert.equal(f.outbox.status, "cancelled");
});

test("Telegram not-modified marks the edit sent without any replacement message", async () => {
  const f = fixture({ failure: "unchanged" });
  await f.api.flushPayrollTelegramOutbox(f.database);
  assert.equal(f.outbox.status, "sent");
  assert.deepEqual(f.calls.map(call => call.method), ["editMessageText"]);
});

for (const failure of ["deleted", "network"] as const) {
  test(`${failure} edit failure never invokes sendMessage`, async () => {
    const f = fixture({ failure });
    await f.api.flushPayrollTelegramOutbox(f.database);
    assert.equal(f.outbox.status, "uncertain");
    assert.deepEqual(f.calls.map(call => call.method), ["editMessageText"]);
    assert.equal(f.route.message_id, 42);
  });
}

test("read-only back restores the original order and rejects a different chat", async () => {
  const f = fixture();
  assert.equal(await f.api.restorePayrollTelegramOrder(f.database, "31", -100300), true);
  assert.equal(await f.api.restorePayrollTelegramOrder(f.database, "31", -100999), false);
  assert.equal(await f.api.restorePayrollTelegramOrder(f.database, "invalid", -100300), false);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].body.message_id, 42);
  assert.equal(f.outbox.status, "pending");
});

test("terminal status clears the keyboard in the real Telegram edit payload", async () => {
  const f = fixture({ state: "done_pending_admin" });
  await f.api.flushPayrollTelegramOutbox(f.database);
  assert.equal(JSON.stringify(f.calls[0].body.reply_markup), '{"inline_keyboard":[]}');
  assert.equal(f.calls[0].method, "editMessageText");
});

test("myid and other non-order command responses still use sendMessage", async () => {
  const f = fixture({ orderRef: null, notice: { text: "Telegram User ID: 123" } });
  await f.api.flushPayrollTelegramOutbox(f.database);
  assert.deepEqual(f.calls.map(call => call.method), ["sendMessage"]);
});
