import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { timingSafeEqual } from "node:crypto";
import ts from "typescript";
import * as protocol from "../lib/payrollTelegramProtocol";

function load(file: string, mocks: Record<string, unknown>) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { GET?: (r: Request) => Promise<Response>; POST?: (r: Request) => Promise<Response> } = {};
  runInNewContext(compiled, { exports, Buffer, Response, Request, URL, SyntaxError, Error, process: { env: {} }, require: (name: string) => {
    assert.ok(name in mocks, `Unexpected module ${name}`); return mocks[name];
  } }); return exports;
}
test("evidence endpoint rejects delegated users before querying any private Telegram data", async () => {
  let reads = 0;
  const route = load("app/api/admin/payroll/telegram/evidence/route.ts", {
    "@/lib/payrollAccess": { requirePayrollAccess: async () => ({ actor: { isAdmin: false }, supabaseAdmin: { from: () => { reads++; } } }) },
    "@/lib/adminSecurity": { adminErrorStatus: (e: { status: number }) => e.status },
    "@/lib/payrollTelegram": { telegramMessageLink: () => { throw new Error("Never reached"); } },
  });
  const result = await route.GET!(new Request("https://example.com/api/admin/payroll/telegram/evidence?ref=B1"));
  assert.equal(result.status, 403); assert.equal(reads, 0); assert.doesNotMatch(await result.text(), /telegramMessageId|telegramChatId|t\.me/);
});
test("authorized admin receives original Telegram link and metadata, no file body", async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: {} }), order: async () => ({ data: [{ id: "e1", evidence_type: "done", media_type: "video", telegram_chat_id: -100123, telegram_message_id: 42, employee_code: "A", division: "FH1" }] }) };
  const route = load("app/api/admin/payroll/telegram/evidence/route.ts", {
    "@/lib/payrollAccess": { requirePayrollAccess: async () => ({ actor: { isAdmin: true }, supabaseAdmin: { from: () => query } }) },
    "@/lib/adminSecurity": { adminErrorStatus: () => 500 },
    "@/lib/payrollTelegram": { telegramMessageLink: () => "https://t.me/c/123/42" },
  });
  const response = await route.GET!(new Request("https://example.com/api/admin/payroll/telegram/evidence?ref=B1"));
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.evidence[0].link, "https://t.me/c/123/42"); assert.equal(data.evidence[0].employeeCode, "A"); assert.equal(data.evidence[0].file, undefined);
});
test("webhook authenticates before parsing and passes numeric identity to durable RPC", async () => {
  const secret = "s".repeat(32); let calls = 0; let failure = false;
  const route = load("app/api/integrations/telegram/payroll/route.ts", {
    "node:crypto": { timingSafeEqual }, "@/lib/payrollTelegramProtocol": protocol,
    "@/lib/serverSupabase": { createSupabaseAdmin: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      calls++; assert.equal(name, "cp_telegram_process_update"); assert.equal(args.p_update_id, 55); assert.equal(args.p_is_admin, false);
      return failure ? { error: { code: "40001" } } : { data: { duplicate: calls > 1 } };
    } }) },
    "@/lib/payrollTelegram": { telegramWebhookSecret: () => secret, isTelegramAdmin: () => false, telegramAnswerCallback: async () => {}, flushPayrollTelegramOutbox: async () => {} },
  });
  const request = (auth: string) => new Request("https://example.com/api/integrations/telegram/payroll", { method: "POST", headers: { "x-telegram-bot-api-secret-token": auth }, body: JSON.stringify({ update_id: 55, message: { message_id: 1, from: { id: 7, username: "admin" }, chat: { id: -1, type: "supergroup" }, text: "/myid" } }) });
  assert.equal((await route.POST!(request("invalid"))).status, 401); assert.equal(calls, 0);
  assert.equal((await route.POST!(request(secret))).status, 200);
  assert.equal((await (await route.POST!(request(secret))).json()).duplicate, true);
  failure = true; assert.equal((await route.POST!(request(secret))).status, 500);
});
test("transport parses media metadata, command fallback and session-scoped buttons", () => {
  const base = { update_id: 1, message: { message_id: 2, from: { id: 101 }, chat: { id: -101, type: "group" }, text: "/assign@PayrollBot B1 A" } };
  assert.equal(protocol.parsePayrollTelegramUpdate(base)?.employeeCode, "A");
  const video = protocol.parsePayrollTelegramUpdate({ ...base, message: { ...base.message, text: undefined, video: { file_id: "metadata", file_unique_id: "unique" } } });
  assert.equal(video?.mediaType, "video"); assert.equal(video?.fileId, "metadata");
  assert.throws(() => protocol.parsePayrollTelegramUpdate({ update_id: NaN }), /tidak valid/);
});
test("old numeric order references cannot be confused with new callback IDs", () => {
  const callback = (data: string) => protocol.parsePayrollTelegramUpdate({ update_id: 1, callback_query: { id: "c", from: { id: 7 }, data,
    message: { message_id: 1, chat: { id: -7, type: "group" } } } });
  assert.equal(callback("cp:start:123")?.ref, "123");
  assert.equal(callback("cp2:start:123")?.orderId, "123");
});
test("Telegram code never fetches, downloads, proxies or stores media binaries", () => {
  for (const file of ["lib/payrollTelegram.ts", "lib/payrollTelegramProtocol.ts", "app/api/integrations/telegram/payroll/route.ts", "app/api/admin/payroll/telegram/evidence/route.ts"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /getFile|arrayBuffer\(|\.blob\(|storage\.from|putObject|uploadFile|file_path/);
  }
  const status = readFileSync(new URL("../app/api/admin/payroll/telegram/status/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(status, /telegram_chat_id|telegram_message_id|telegram_file_id|telegram_user_id|t\.me/);
});

test("only website admins can configure a leader and invalid IDs never reach Telegram", async () => {
  let isAdmin = false; let reads = 0; let saved = 0;
  const route = load("app/api/admin/payroll/telegram/leader/route.ts", {
    "@/lib/payrollAccess": { requirePayrollAccess: async () => ({ actor: { isAdmin }, supabaseAdmin: { rpc: async () => { saved++; return {}; } } }) },
    "@/lib/adminSecurity": { adminErrorStatus: (e: { status?: number }) => e.status ?? 500 },
    "@/lib/payrollTelegram": { telegramGetPrivateChat: async (id: number) => { reads++; return { id, type: "private", first_name: "Leader" }; } },
  });
  const request = (body: unknown) => new Request("https://example.com/api/admin/payroll/telegram/leader", { method: "POST", body: JSON.stringify(body) });
  assert.equal((await route.POST!(request({ userId: 900, divisions: ["FH1"] }))).status, 403);
  assert.equal(reads, 0);
  isAdmin = true;
  for (const body of [{ userId: -900, divisions: ["FH1"] }, { userId: 900, divisions: [] }, { userId: 900, divisions: ["UNKNOWN"] }]) {
    assert.equal((await route.POST!(request(body))).status, 400);
  }
  assert.equal(reads, 0); assert.equal(saved, 0);
  assert.equal((await route.POST!(request({ userId: 900, divisions: ["FH1", "FH2"] }))).status, 200);
  assert.equal(saved, 1);
});

test("Gold roster pagination preserves the selected employee and order in callbacks", () => {
  const notice = { text: "", keyboard: "goldpicker", orderId: 123, page: 1, employees: Array.from({ length: 9 }, (_, i) => ({ id: i + 100, name: `Karyawan ${i}` })) };
  const keyboard = protocol.payrollTelegramKeyboard(notice)!;
  for (const row of keyboard.inline_keyboard) for (const button of row) assert.ok(Buffer.byteLength(button.callback_data) <= 64);
  const result = protocol.parsePayrollTelegramUpdate({ update_id: 5, callback_query: { id: "c", from: { id: 900 }, data: keyboard.inline_keyboard[0][0].callback_data, message: { message_id: 9, chat: { id: 900, type: "private" } } } });
  assert.equal(result?.action, "pickgold"); assert.equal(result?.orderId, "123"); assert.equal(result?.employeeId, "100");
  assert.match(keyboard.inline_keyboard.at(-1)![1].callback_data, /goldpicker:123:2/);
});

test("Item buttons use the standard evidence workflow, never Gold contributions", () => {
  const buttons = protocol.payrollTelegramKeyboard({ text: "ORDER ITEM", keyboard: "item", orderId: 4321 })!.inline_keyboard.flat();
  const actions = buttons.map(button => protocol.parsePayrollTelegramUpdate({ update_id: 5, callback_query: {
    id: "c", from: { id: 900 }, data: button.callback_data,
    message: { message_id: 9, chat: { id: 900, type: "private" } },
  } }));
  assert.deepEqual(actions.map(a => a?.action), ["picker", "start", "pause", "resume", "done", "problem"]);
  assert.ok(actions.every(a => a?.orderId === "4321"));
});
