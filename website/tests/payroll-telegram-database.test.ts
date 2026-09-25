import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { payrollTelegramKeyboard } from "../lib/payrollTelegramProtocol";

// Executes the deployed SQL itself, not a reimplementation of its rules.
// PGlite serializes one connection; independent-session lock contention is checked separately.
let db: PGlite;
let nextId = 1;
type Reply = { text: string; rejected?: boolean; duplicate?: boolean; keyboard?: string; orderId?: number; sessionId?: string; accepted?: number; remaining?: number; state?: string; employees?: { id: number; name: string }[]; page?: number };
const orders = [
  { id: "manual:B1", externalReference: "B1", orderType: "boosting", quantity: 1, team: "FH1", orderName: "Boost", operationalStatus: "draft" },
  { id: "gsheet:G1", externalReference: "G1", orderType: "gold", quantity: 200, team: "FH2", orderName: "Gold", operationalStatus: "draft" },
];
const employees = [
  { code: "A", name: "Andi", team: "FH1", workforceStatus: "SHIFT" },
  { code: "B", name: "Budi", team: "FH1", workforceStatus: "FULL" },
  { code: "C", name: "Candra", team: "FH2", workforceStatus: "SHIFT" },
  { code: "D", name: "Dedi", team: "FH3", workforceStatus: "NEW" },
  { code: "R", name: "Resigned", team: "FH1", workforceStatus: "RESIGN" },
];
const workspace = (items: unknown[] = orders) => ({ "cp-ofs-demo-user-orders-v3": items, "cp-ofs-demo-employees-v2": employees });
async function save(items: unknown[]) { await db.query("update cp_payroll_workspace set payload=$1::jsonb where id=1", [JSON.stringify(workspace(items))]); }
async function event(action: string, extra: Record<string, unknown> = {}, admin = false, id = nextId++): Promise<Reply> {
  const { rows } = await db.query<{ result: Reply }>("select cp_telegram_process_update($1,$2::jsonb,$3) as result", [id, JSON.stringify({ userId: 101, chatId: -101, action, ref: "B1", ...extra }), admin]);
  return rows[0].result;
}
async function count(table: string, condition = "true") { return Number((await db.query<{ n: number }>(`select count(*) n from ${table} where ${condition}`)).rows[0].n); }
async function state(ref = "B1") { return (await db.query<{ state: string }>("select state from cp_payroll_telegram_orders where order_ref=$1", [ref])).rows[0].state; }
async function assign() { const result = await event("assign", { employeeCode: "A" }, true); assert.ok(!result.rejected, result.text); return result; }
async function media(type = "photo", extra: Record<string, unknown> = {}) { return event("media", { mediaType: type, messageId: nextId, fileId: `file-${nextId}`, fileUniqueId: `unique-${nextId}`, ...extra }); }
async function start(type = "photo") { await assign(); await event("start"); const result = await media(type); assert.ok(!result.rejected, result.text); }
async function gold(userId = 101, chatId = -101, quantity = 50) {
  const s = await event("gold", { ref: "G1", userId, chatId }); assert.ok(!s.rejected, s.text);
  await event("amount", { userId, chatId, quantity }); await media("photo", { userId, chatId }); return { userId, chatId, sessionId: s.sessionId };
}
before(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; create table cp_payroll_workspace(id int primary key,payload jsonb); insert into cp_payroll_workspace values(1,'{}');");
  for (const file of ["20260926030000_payroll_telegram_operations.sql", "20260926030001_payroll_telegram_durable_workflow.sql"]) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  }
});
beforeEach(async () => {
  await db.exec("begin; insert into cp_payroll_telegram_divisions(division,chat_id) values('FH1',-101),('FH2',-102),('FH3',-103),('ADMIN',-104),('BANDAR',-105); insert into cp_payroll_telegram_employees(employee_code,telegram_user_id,division) values('A',101,'FH1'),('B',102,'FH1'),('C',103,'FH2'),('D',104,'FH3'),('R',105,'FH1');");
  await save(orders);
});
afterEach(async () => { await db.exec("rollback"); });
after(async () => { await db.close(); });

test("manual Boost dispatches only to its division; Sheet Gold only to FH1/FH2/FH3", async () => {
  assert.equal(await count("cp_payroll_telegram_order_chats", "order_ref='B1' and division='FH1'"), 1);
  assert.equal(await count("cp_payroll_telegram_order_chats", "order_ref='G1'"), 3);
  assert.equal(await count("cp_payroll_telegram_order_chats", "division in ('ADMIN','BANDAR')"), 0);
});
test("duplicate sync and dispatch do not duplicate notices", async () => {
  await save(orders); await db.query("select cp_telegram_dispatch('B1')");
  assert.equal(await count("cp_payroll_telegram_outbox", "event_key like 'dispatch:%'"), 4);
});
test("unknown division waits; unknown/item type cleanly avoids Telegram", async () => {
  await save([{ ...orders[0], id: "new", externalReference: "WAIT", team: undefined }, { ...orders[0], id: "unknown", externalReference: "UNKNOWN", orderType: undefined }, { ...orders[0], id: "item", externalReference: "ITEM", orderType: "item" }]);
  assert.equal(await count("cp_payroll_telegram_order_chats", "order_ref in ('WAIT','UNKNOWN','ITEM')"), 0);
  assert.equal((await db.query<{ dispatch_status: string }>("select dispatch_status from cp_payroll_telegram_orders where order_ref='WAIT'")).rows[0].dispatch_status, "waiting_division");
});
test("worker cannot select employees", async () => { assert.equal((await event("picker")).rejected, true); });
test("only the order division leader can select active linked employees", async () => {
  await db.exec("update cp_payroll_telegram_employees set role='leader' where employee_code in ('A','C')");
  const picker = await event("picker"); assert.deepEqual(picker.employees?.map(e => e.name), ["Andi", "Budi"]);
  assert.equal((await event("picker", { userId: 103 })).rejected, true);
  const selected = await event("pick", { employeeId: picker.employees![1].id }); assert.ok(!selected.rejected);
  assert.equal(await state(), "assigned");
});
test("assignment cannot cross divisions or select resigned workers", async () => {
  assert.equal((await event("assign", { employeeCode: "C" }, true)).rejected, true);
  assert.equal((await event("assign", { employeeCode: "R" }, true)).rejected, true);
});
test("pagination keeps eight employee buttons and navigation under Telegram limit", () => {
  const keyboard = payrollTelegramKeyboard({ text: "", keyboard: "picker", orderId: 123, page: 1, employees: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, name: `Employee ${i}` })) })!;
  assert.equal(keyboard.inline_keyboard.length, 9); assert.equal(keyboard.inline_keyboard[8].length, 2);
  for (const button of keyboard.inline_keyboard.flat()) assert.ok(Buffer.byteLength(button.callback_data) <= 64);
});
test("worker cannot operate another worker assignment", async () => { await assign(); assert.equal((await event("start", { userId: 102 })).rejected, true); });
test("START without evidence leaves assigned and cannot finish empty session", async () => {
  await assign(); const session = await event("start"); assert.equal(await state(), "assigned");
  assert.equal((await event("finish", { sessionId: session.sessionId })).rejected, true);
});
for (const type of ["photo", "video"]) test(`START with ${type} sets in_progress and snapshots employee/division`, async () => {
  await start(type); assert.equal(await state(), "in_progress");
  const row = (await db.query("select media_type,employee_code,division from cp_payroll_telegram_evidence")).rows[0];
  assert.deepEqual(row, { media_type: type, employee_code: "A", division: "FH1" });
});
test("PAUSE only in progress; RESUME only paused", async () => {
  await assign(); assert.equal((await event("pause")).rejected, true); assert.equal((await event("resume")).rejected, true);
  await event("start"); await media(); await event("pause"); assert.equal(await state(), "paused");
  assert.equal((await event("pause")).rejected, true); await event("resume"); assert.equal(await state(), "in_progress");
});
test("DONE without evidence rejected", async () => {
  await start(); const session = await event("done"); assert.equal((await event("finish", { sessionId: session.sessionId })).rejected, true); assert.equal(await state(), "in_progress");
});
test("DONE supports multiple mixed media and waits for finish to turn yellow", async () => {
  await start(); const session = await event("done"); await media(); await media(); const result = await media("video");
  assert.match(result.text, /Foto: 2/); assert.match(result.text, /Video: 1/); assert.equal(await state(), "in_progress");
  assert.equal((await event("more", { sessionId: session.sessionId })).keyboard, "session");
  const done = await event("finish", { sessionId: session.sessionId }); assert.equal(done.state, "done_pending_admin"); assert.equal(await state(), "done_pending_admin");
});
test("cancel/new sessions retain old evidence but never count it for a new DONE", async () => {
  await start(); const old = await event("done"); await media(); await event("cancel", { sessionId: old.sessionId });
  const fresh = await event("done"); assert.notEqual(old.sessionId, fresh.sessionId);
  assert.equal((await event("finish", { sessionId: old.sessionId })).rejected, true);
  assert.equal((await event("finish", { sessionId: fresh.sessionId })).rejected, true);
  assert.equal(await count("cp_payroll_telegram_evidence"), 2);
});
test("replacement invalidates previous employee evidence session", async () => {
  await assign(); await event("start"); await event("assign", { employeeCode: "B" }, true); await media();
  assert.equal(await count("cp_payroll_telegram_evidence"), 0); assert.equal((await event("start")).rejected, true);
});
for (const terminal of [{ operationalStatus: "verified" }, { verifiedAt: "2026-09-26T00:00:00Z" }, { payrollClosedAt: "2026-09-26T00:00:00Z" }]) test(`admin terminal marker ${Object.keys(terminal)[0]} rejects every old action`, async () => {
  await assign(); await save(orders.map(o => ({ ...o, ...terminal })));
  assert.equal(await state(), "verified"); assert.equal(await state("G1"), "verified");
  for (const action of ["start", "pause", "resume", "done", "problem", "picker", "assign"]) assert.equal((await event(action, { employeeCode: "B" }, true)).rejected, true, action);
  assert.equal((await event("gold", { ref: "G1" })).rejected, true);
  await save(orders.map(o => ({ ...o, ...terminal })));
  assert.equal(await count("cp_payroll_telegram_outbox", "event_key like 'verified:%'"), 4);
});
test("Gold cannot finish without evidence", async () => {
  const s = await event("gold", { ref: "G1" }); await event("amount", { quantity: 50 });
  assert.equal((await event("finish", { sessionId: s.sessionId })).rejected, true);
  assert.equal(await count("cp_payroll_telegram_gold_contributions"), 0);
});
test("180/200 + 50 accepts exactly 20, links evidence, notifies all three groups", async () => {
  await db.exec("update cp_payroll_telegram_orders set delivered_quantity=180 where order_ref='G1'");
  const s = await gold(); const id = nextId++; const result = await event("finish", s, false, id);
  assert.equal(result.accepted, 20); assert.equal(result.remaining, 0); assert.equal(await state("G1"), "done_pending_admin");
  assert.equal(await count("cp_payroll_telegram_evidence", "contribution_id is not null"), 1);
  assert.equal(await count("cp_payroll_telegram_outbox", `event_key like 'update:${id}:%'`), 3);
  assert.equal((await event("gold", { ref: "G1", userId: 103, chatId: -102 })).rejected, true);
});
test("overlapping Gold submissions across divisions cannot exceed global quota", async () => {
  await db.exec("update cp_payroll_telegram_orders set delivered_quantity=180 where order_ref='G1'");
  const sessions = [await gold(101, -101, 15), await gold(103, -102, 20), await gold(104, -103, 10)];
  const results = await Promise.all(sessions.map(s => event("finish", s)));
  assert.equal(results.reduce((sum, r) => sum + (r.accepted ?? 0), 0), 20);
  assert.equal(await count("cp_payroll_telegram_gold_contributions"), 2);
  assert.equal((await db.query<{ delivered_quantity: string }>("select delivered_quantity from cp_payroll_telegram_orders where order_ref='G1'")).rows[0].delivered_quantity, "200");
});
test("duplicate update ID cannot duplicate assignment, evidence, contribution or notification", async () => {
  const assignId = nextId++; await event("assign", { employeeCode: "A" }, true, assignId); await event("assign", { employeeCode: "A" }, true, assignId);
  assert.equal(await count("cp_payroll_telegram_assignments"), 1);
  const s = await gold(); const id = nextId++;
  await event("finish", s, false, id); const duplicate = await event("finish", s, false, id);
  assert.equal(duplicate.duplicate, true); assert.equal(await count("cp_payroll_telegram_gold_contributions"), 1);
  assert.equal(await count("cp_payroll_telegram_evidence"), 1);
  assert.equal(await count("cp_payroll_telegram_outbox", `event_key like 'update:${id}:%'`), 3);
});
test("repeated media delivery with a different update ID still counts one piece of evidence", async () => {
  await start(); await event("done"); const same = { messageId: 9000, fileId: "metadata-only", fileUniqueId: "same" };
  await media("photo", same); const result = await media("photo", same); assert.match(result.text, /Foto: 1/);
});
test("link never hijacks another employee identity or leader role", async () => {
  const result = await event("link", { userId: 999, employeeCode: "A" }); assert.equal(result.rejected, true);
  assert.equal((await db.query<{ telegram_user_id: number }>("select telegram_user_id from cp_payroll_telegram_employees where employee_code='A'")).rows[0].telegram_user_id, 101);
});
test("outbox claim is exclusive and a sending row is not blindly retried", async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => db.query<{ id: number }>("select id from cp_telegram_claim_outbox()")));
  const ids = results.flatMap(r => r.rows.map(row => row.id)); assert.equal(ids.length, 4); assert.equal(new Set(ids).size, 4);
});
test("private workflow tables and RPCs deny anon/authenticated", async () => {
  for (const role of ["anon", "authenticated"]) {
    const grants = (await db.query<{ allowed: boolean }>("select has_function_privilege($1,'cp_telegram_process_update(bigint,jsonb,boolean)','EXECUTE') allowed", [role])).rows[0];
    assert.equal(grants.allowed, false);
    assert.equal((await db.query<{ allowed: boolean }>("select has_table_privilege($1,'cp_payroll_telegram_evidence','SELECT') allowed", [role])).rows[0].allowed, false);
  }
  assert.equal(await count("pg_class", "relname in ('cp_payroll_telegram_updates','cp_payroll_telegram_outbox') and relrowsecurity"), 2);
});
test("legacy evidence-free Gold RPC is closed", async () => {
  await db.exec("savepoint expected_failure");
  await assert.rejects(db.query("select cp_payroll_telegram_accept_gold('G1','A','FH1',101,50)"), /sesi bukti atomik/);
  await db.exec("rollback to savepoint expected_failure");
});
