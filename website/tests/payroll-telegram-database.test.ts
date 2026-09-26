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
async function gold(userId = 103, chatId = -102, quantity = 50) {
  const s = await event("gold", { ref: "G1", userId, chatId }); assert.ok(!s.rejected, s.text);
  await event("amount", { userId, chatId, quantity }); await media("photo", { userId, chatId }); return { userId, chatId, sessionId: s.sessionId };
}
const migrations = ["20260926030000_payroll_telegram_operations.sql", "20260926030001_payroll_telegram_durable_workflow.sql", "20260926030002_payroll_telegram_leader_dispatch.sql", "20260926035622_payroll_telegram_item_workflow.sql", "20260926041704_payroll_telegram_strict_division_routing.sql"];
const migrationSql = (file: string) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
async function initialize(database: PGlite, files = migrations) {
  await database.exec("create role anon; create role authenticated; create role service_role; create table cp_payroll_workspace(id int primary key,payload jsonb,revision bigint default 0,updated_at timestamptz default now()); insert into cp_payroll_workspace(id,payload) values(1,'{}');");
  for (const file of files) await database.exec(migrationSql(file));
}
before(async () => { db = new PGlite(); await initialize(db); });
beforeEach(async () => {
  await db.exec("begin; insert into cp_payroll_telegram_divisions(division,chat_id) values('FH1',-101),('FH2',-102),('FH3',-103),('ADMIN',-104),('BANDAR',-105); insert into cp_payroll_telegram_employees(employee_code,telegram_user_id,division) values('A',101,'FH1'),('B',102,'FH1'),('C',103,'FH2'),('D',104,'FH3'),('R',105,'FH1');");
  await save(orders);
});
afterEach(async () => { await db.exec("rollback"); });
after(async () => { await db.close(); });

test("manual Boost and Sheet Gold dispatch only to their respective divisions", async () => {
  assert.equal(await count("cp_payroll_telegram_order_chats", "order_ref='B1' and division='FH1'"), 1);
  assert.equal(await count("cp_payroll_telegram_order_chats", "order_ref='G1'"), 1);
  assert.equal(await count("cp_payroll_telegram_order_chats", "order_ref='G1' and division='FH2'"), 1);
  assert.equal(await count("cp_payroll_telegram_order_chats", "division in ('ADMIN','BANDAR')"), 0);
});
test("duplicate sync and dispatch do not duplicate notices", async () => {
  await save(orders); await db.query("select cp_telegram_dispatch('B1')");
  assert.equal(await count("cp_payroll_telegram_outbox", "event_key like 'dispatch:%'"), 2);
});
test("unknown division waits for Boosting and Item; unknown type avoids Telegram", async () => {
  await save([{ ...orders[0], id: "new", externalReference: "WAIT", team: undefined }, { ...orders[0], id: "unknown", externalReference: "UNKNOWN", orderType: undefined }, { ...orders[0], id: "item", externalReference: "ITEM", orderType: "item", team: undefined }]);
  assert.equal(await count("cp_payroll_telegram_order_chats", "order_ref in ('WAIT','UNKNOWN','ITEM')"), 0);
  assert.equal((await db.query<{ dispatch_status: string }>("select dispatch_status from cp_payroll_telegram_orders where order_ref='WAIT'")).rows[0].dispatch_status, "waiting_division");
  assert.equal((await db.query<{ dispatch_status: string }>("select dispatch_status from cp_payroll_telegram_orders where order_ref='ITEM'")).rows[0].dispatch_status, "waiting_division");
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
  assert.equal(await count("cp_payroll_telegram_outbox", "event_key like 'verified:%'"), 2);
});
test("Gold cannot finish without evidence", async () => {
  const actor = { userId: 103, chatId: -102 };
  const s = await event("gold", { ...actor, ref: "G1" }); assert.ok(!s.rejected, s.text);
  assert.ok(!(await event("amount", { ...actor, quantity: 50 })).rejected);
  assert.equal((await event("finish", { ...actor, sessionId: s.sessionId })).rejected, true);
  assert.equal(await count("cp_payroll_telegram_gold_contributions"), 0);
});
test("180/200 + 50 accepts exactly 20, links evidence, notifies only the order division", async () => {
  await db.exec("update cp_payroll_telegram_orders set delivered_quantity=180 where order_ref='G1'");
  const s = await gold(); const id = nextId++; const result = await event("finish", s, false, id);
  assert.equal(result.accepted, 20); assert.equal(result.remaining, 0); assert.equal(await state("G1"), "done_pending_admin");
  assert.equal(await count("cp_payroll_telegram_evidence", "contribution_id is not null"), 1);
  assert.equal(await count("cp_payroll_telegram_outbox", `event_key like 'update:${id}:%'`), 1);
  assert.equal((await event("gold", { ref: "G1", userId: 103, chatId: -102 })).rejected, true);
});
test("overlapping Gold submissions in the order division cannot exceed its quota", async () => {
  await db.exec("update cp_payroll_telegram_orders set delivered_quantity=180 where order_ref='G1'");
  await db.query("update cp_payroll_workspace set payload=jsonb_set(payload,'{cp-ofs-demo-employees-v2}',$1::jsonb) where id=1", [JSON.stringify([...employees, { code: "E", name: "Erik", team: "FH2", workforceStatus: "SHIFT" }, { code: "F", name: "Feri", team: "FH2", workforceStatus: "SHIFT" }])]);
  await db.exec("insert into cp_payroll_telegram_employees(employee_code,telegram_user_id,division) values('E',106,'FH2'),('F',107,'FH2')");
  const sessions = [await gold(103, -102, 15), await gold(106, -102, 20), await gold(107, -102, 10)];
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
  assert.equal(await count("cp_payroll_telegram_outbox", `event_key like 'update:${id}:%'`), 1);
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
  const ids = results.flatMap(r => r.rows.map(row => row.id)); assert.equal(ids.length, 2); assert.equal(new Set(ids).size, 2);
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

async function configureLeader(divisions = ["FH1", "FH2", "FH3"], userId = 900) {
  await db.query("select cp_telegram_configure_leader($1::text[],$2,'Leader')", [divisions, userId]);
  await db.query("select cp_telegram_dispatch('B1')");
  await db.query("select cp_telegram_dispatch('G1')");
}
const leader = { userId: 900, chatId: 900, chatType: "private" };

test("X2867 FH2 waits when only FH3 has a leader; missing Gold division never broadcasts", async () => {
  await db.exec("update cp_payroll_telegram_divisions set active=false");
  await configureLeader(["FH3"], 903);
  await save([
    { ...orders[1], id: "gsheet:X2867", externalReference: "X2867", quantity: 60, orderName: "60M Spiritvale" },
    { ...orders[1], id: "no-team", externalReference: "NO-TEAM", team: "" },
  ]);
  assert.equal(await count("cp_payroll_telegram_outbox", "order_ref in ('X2867','NO-TEAM')"), 0);
  assert.equal((await db.query<{ dispatch_status: string }>("select dispatch_status from cp_payroll_telegram_orders where order_ref='NO-TEAM'")).rows[0].dispatch_status, "waiting_division");
  await db.query("select cp_telegram_configure_leader(array['FH2'],902,'FH2 leader')");
  await db.query("select cp_telegram_dispatch('X2867')");
  await db.query("select cp_telegram_dispatch('X2867')");
  const notices = (await db.query<{ chat_id: number; payload: { text: string } }>("select chat_id,payload from cp_payroll_telegram_outbox where order_ref='X2867'")).rows;
  assert.equal(notices.length, 1); assert.equal(notices[0].chat_id, 902);
  assert.match(notices[0].payload.text, /Divisi : FH2/); assert.doesNotMatch(notices[0].payload.text, /GLOBAL/);
});

test("migration repairs wrong-division routing without deleting sent history or payroll data", async () => {
  const legacy = new PGlite();
  try {
    await initialize(legacy, migrations.slice(0, -1));
    await legacy.query("select cp_telegram_configure_leader(array['FH3'],903,'FH3 leader')");
    const original = workspace([{ ...orders[1], id: "gsheet:X2867", externalReference: "X2867", quantity: 60 }]);
    await legacy.query("update cp_payroll_workspace set payload=$1::jsonb where id=1", [JSON.stringify(original)]);
    await legacy.exec("update cp_payroll_telegram_order_chats set message_id=135 where order_ref='X2867'; update cp_payroll_telegram_outbox set status='sent',message_id=135 where order_ref='X2867'; update cp_payroll_telegram_orders set dispatch_status='sent' where order_ref='X2867'; insert into cp_payroll_telegram_outbox(event_key,order_ref,chat_id,payload) values('update:999:903','X2867',903,'{}'); insert into cp_payroll_telegram_sessions(order_ref,telegram_user_id,chat_id,kind,stage,employee_code,division) values('X2867',903,903,'gold','evidence','D','FH3');");
    await legacy.exec(migrationSql(migrations.at(-1)!));
    assert.deepEqual((await legacy.query<{ payload: unknown }>("select payload from cp_payroll_workspace where id=1")).rows[0].payload, original);
    assert.deepEqual((await legacy.query("select division,state,dispatch_status,delivered_quantity from cp_payroll_telegram_orders where order_ref='X2867'")).rows[0], { division: "FH2", state: "waiting", dispatch_status: "pending", delivered_quantity: "0" });
    assert.deepEqual((await legacy.query("select division,message_id from cp_payroll_telegram_order_chats where order_ref='X2867'")).rows, [{ division: "FH3", message_id: 135 }]);
    assert.deepEqual((await legacy.query("select status,message_id from cp_payroll_telegram_outbox where order_ref='X2867' order by id")).rows, [{ status: "sent", message_id: 135 }, { status: "cancelled", message_id: null }]);
    assert.equal((await legacy.query<{ closed: boolean }>("select closed_at is not null as closed from cp_payroll_telegram_sessions where order_ref='X2867'")).rows[0].closed, true);
    assert.equal((await legacy.query<{ allowed: boolean }>("select cp_telegram_route_allowed('X2867','FH3',903) as allowed")).rows[0].allowed, false);
  } finally { await legacy.close(); }
});

test("legacy FH3 Gold buttons and open upload session cannot operate an FH2 order", async () => {
  await configureLeader(["FH2"], 902); await configureLeader(["FH3"], 903);
  await db.exec("insert into cp_payroll_telegram_order_chats(order_ref,division,chat_id,message_id) values('G1','FH3',903,135)");
  const session = (await db.query<{ id: string }>("insert into cp_payroll_telegram_sessions(order_ref,telegram_user_id,chat_id,kind,stage,employee_code,division,requested_quantity) values('G1',903,903,'gold','evidence','D','FH3',10) returning id")).rows[0].id;
  const workerId = (await db.query<{ callback_id: number }>("select callback_id from cp_payroll_telegram_employees where employee_code='C'")).rows[0].callback_id;
  for (const action of ["gold", "goldpicker", "pickgold", "problem", "amount", "media", "finish"]) {
    const result = await event(action, { userId: 903, chatId: 903, ref: "G1", employeeId: workerId, quantity: 10, sessionId: session, mediaType: "photo", messageId: nextId, fileId: "wrong-route", fileUniqueId: "wrong-route" });
    assert.equal(result.rejected, true, `${action}: ${result.text}`);
  }
  assert.equal(await state("G1"), "waiting");
  assert.equal(await count("cp_payroll_telegram_gold_contributions"), 0);
  assert.equal(await count("cp_payroll_telegram_evidence"), 0);
  assert.equal(await count("cp_payroll_telegram_order_chats", "order_ref='G1' and division='FH3' and message_id=135"), 1);
  const picker = await event("gold", { userId: 902, chatId: 902, ref: "G1" });
  assert.deepEqual(picker.employees?.map(e => e.name), ["Candra"]);
});

test("claims cancel old cross-division notices and later verification only notifies FH2", async () => {
  await configureLeader(["FH2"], 902); await configureLeader(["FH3"], 903);
  await db.exec("insert into cp_payroll_telegram_order_chats(order_ref,division,chat_id,message_id) values('G1','FH3',903,135)");
  for (const key of ["dispatch:G1:903", "verified:G1:903", "update:999:903"]) {
    await db.query("insert into cp_payroll_telegram_outbox(event_key,order_ref,chat_id,payload) values($1,'G1',903,'{}')", [key]);
  }
  await event("problem", { userId: 902, chatId: 902, ref: "G1" });
  await save(orders.map(o => o.externalReference === "G1" ? { ...o, verifiedAt: "2026-09-26T05:00:00Z" } : o));
  const claimed: { order_ref: string; chat_id: number }[] = [];
  for (let i = 0; i < 12; i++) claimed.push(...(await db.query<{ order_ref: string; chat_id: number }>("select order_ref,chat_id from cp_telegram_claim_outbox()")).rows);
  assert.ok(claimed.some(r => r.order_ref === "G1"));
  assert.ok(claimed.filter(r => r.order_ref === "G1").every(r => r.chat_id === 902));
  assert.equal(await count("cp_payroll_telegram_outbox", "order_ref='G1' and chat_id=903 and status='cancelled'"), 3);
  assert.equal(await count("cp_payroll_telegram_outbox", "event_key='verified:G1:902'"), 1);
});

test("changing an order division invalidates old Gold sessions and sends to the new division", async () => {
  await configureLeader(["FH2"], 902); await configureLeader(["FH3"], 903);
  const ctx = { userId: 902, chatId: 902, ref: "G1" };
  const picker = await event("gold", ctx);
  const s = await event("pickgold", { ...ctx, employeeId: picker.employees![0].id });
  await event("amount", { ...ctx, quantity: 10 }); await media("photo", ctx);
  await save([{ ...orders[1], team: "FH3" }]);
  assert.equal((await event("finish", { ...ctx, sessionId: s.sessionId })).rejected, true);
  assert.equal(await count("cp_payroll_telegram_gold_contributions"), 0);
  assert.equal(await count("cp_payroll_telegram_evidence", "order_ref='G1' and division='FH2'"), 1);
  const newPicker = await event("gold", { userId: 903, chatId: 903, ref: "G1" });
  assert.deepEqual(newPicker.employees?.map(e => e.name), ["Dedi"]);
  const claimed = [];
  for (let i = 0; i < 12; i++) claimed.push(...(await db.query<{ chat_id: number }>("select chat_id from cp_telegram_claim_outbox() where order_ref='G1' and event_key like 'dispatch:%'")).rows);
  assert.deepEqual(claimed, [{ chat_id: 903 }]);
});

test("one leader manages multiple divisions and selects workers without Telegram links", async () => {
  await db.exec("delete from cp_payroll_telegram_employees");
  await configureLeader();
  const picker = await event("picker", leader);
  assert.deepEqual(picker.employees?.map(e => e.name), ["Andi", "Budi"]);
  const selected = await event("pick", { ...leader, employeeId: picker.employees![1].id });
  assert.ok(!selected.rejected, selected.text);
  const assignment = (await db.query("select employee_code,telegram_user_id,assigned_by_telegram_user_id from cp_payroll_telegram_assignments where order_ref='B1'")).rows[0];
  assert.deepEqual(assignment, { employee_code: "B", telegram_user_id: null, assigned_by_telegram_user_id: 900 });
  const row = (await db.query<{ payload: ReturnType<typeof workspace>; revision: number }>("select payload,revision from cp_payroll_workspace where id=1")).rows[0];
  assert.equal((row.payload["cp-ofs-demo-user-orders-v3"][0] as { employeeName: string }).employeeName, "Budi");
  assert.ok(row.revision > 0);
  await event("start", leader); await media("photo", leader); await event("pause", leader); await event("resume", leader);
  const session = await event("done", leader); await media("video", leader);
  const finished = await event("finish", { ...leader, sessionId: session.sessionId });
  assert.equal(finished.state, "done_pending_admin", finished.text);
  const evidence = (await db.query("select employee_code,telegram_user_id,division from cp_payroll_telegram_evidence")).rows;
  assert.deepEqual(evidence, [0, 1].map(() => ({ employee_code: "B", telegram_user_id: 900, division: "FH1" })));
});

test("outsiders, other-division leaders and former leaders cannot act for a worker", async () => {
  await configureLeader(["FH1"]);
  assert.equal((await event("picker", { ...leader, userId: 901 })).rejected, true);
  assert.equal((await event("assign", { ...leader, employeeCode: "C" })).rejected, true);
  await event("assign", { ...leader, employeeCode: "A" });
  const session = await event("start", leader);
  await db.query("select cp_telegram_configure_leader(array['FH1'],901,'Replacement')");
  assert.equal((await event("start", leader)).rejected, true);
  assert.equal((await event("finish", { ...leader, sessionId: session.sessionId })).rejected, true);
  await db.query("select cp_telegram_dispatch('B1')");
  assert.ok(!(await event("start", { userId: 901, chatId: 901 })).rejected);
});

test("leader can submit Gold for different unlinked employees and cap remains global", async () => {
  await db.exec("delete from cp_payroll_telegram_employees");
  await configureLeader();
  await save([{ ...orders[1], team: "FH1", assignmentMode: "leader" }]);
  const picker = await event("gold", { ...leader, ref: "G1" });
  assert.equal(picker.keyboard, "goldpicker", picker.text);
  for (const [index, quantity] of [120, 100].entries()) {
    const session = await event("pickgold", { ...leader, ref: "G1", employeeId: picker.employees![index].id });
    assert.ok(!session.rejected, session.text);
    await event("amount", { ...leader, quantity }); await media("photo", leader);
    const finished = await event("finish", { ...leader, sessionId: session.sessionId });
    assert.equal(finished.accepted, index === 0 ? 120 : 80, finished.text);
  }
  const contributions = (await db.query("select employee_code,telegram_user_id from cp_payroll_telegram_gold_contributions order by employee_code")).rows;
  assert.deepEqual(contributions, [{ employee_code: "A", telegram_user_id: 900 }, { employee_code: "B", telegram_user_id: 900 }]);
  const saved = (await db.query<{ order: { workerAssignments: { employeeCode: string; quantity: number }[]; operationalStatus: string; verifiedAt?: string } }>("select payload->'cp-ofs-demo-user-orders-v3'->0 as \"order\" from cp_payroll_workspace where id=1")).rows[0].order;
  assert.deepEqual(saved.workerAssignments.map(w => [w.employeeCode, w.quantity]), [["A", 120], ["B", 80]]);
  assert.equal(saved.operationalStatus, "assigned"); assert.equal(saved.verifiedAt, undefined);
});

test("explicit website division routes Gold only to that division and request booster is assigned", async () => {
  await configureLeader();
  await save([
    { ...orders[0], externalReference: "REQUEST", id: "request", assignmentMode: "direct", workerAssignments: [{ employeeCode: "B", employeeName: "Budi" }] },
    { ...orders[1], externalReference: "GOLD2", id: "gold2", assignmentMode: "leader", team: "FH3" },
  ]);
  assert.equal(await count("cp_payroll_telegram_assignments", "order_ref='REQUEST' and employee_code='B'"), 1);
  assert.equal(await count("cp_payroll_telegram_order_chats", "order_ref='GOLD2'"), 1);
  assert.equal(await count("cp_payroll_telegram_order_chats", "order_ref='GOLD2' and division='FH3'"), 1);
  assert.equal((await event("gold", { ...leader, ref: "GOLD2" })).employees?.[0]?.name, "Dedi");
});

test("shared leader receives one legacy Gold dispatch, and stale recipients are cancelled", async () => {
  await configureLeader();
  assert.equal(await count("cp_payroll_telegram_outbox", "order_ref='G1' and chat_id=900 and event_key like 'dispatch:%'"), 1);
  const sent: number[] = [];
  for (let i = 0; i < 8; i++) {
    const rows = (await db.query<{ chat_id: number }>("select chat_id from cp_telegram_claim_outbox()")).rows;
    sent.push(...rows.map(r => r.chat_id));
  }
  assert.deepEqual(sent, [900, 900]);
  assert.equal(await count("cp_payroll_telegram_outbox", "status='cancelled'"), 2);
});

test("leader assignment and configuration functions remain service-only", async () => {
  for (const role of ["anon", "authenticated"]) {
    for (const fn of ["cp_telegram_configure_leader(text[],bigint,text)", "cp_telegram_save_worker(text,jsonb)", "cp_telegram_refresh_roster(jsonb)", "cp_telegram_save_gold_workers(text)", "cp_telegram_route_allowed(text,text,bigint)"]) {
      assert.equal((await db.query<{ allowed: boolean }>("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, fn])).rows[0].allowed, false);
    }
  }
});

test("Sheet Gold stays in its division even when one leader handles multiple divisions", async () => {
  await configureLeader();
  const picker = await event("gold", { ...leader, ref: "G1" });
  assert.deepEqual(picker.employees?.map(e => e.name), ["Candra"]);
  const session = await event("pickgold", { ...leader, ref: "G1", employeeId: picker.employees![0].id });
  assert.ok(!session.rejected, session.text); assert.match(session.text, /Candra · FH2/);
  await event("amount", { ...leader, quantity: 10 }); await media("photo", leader);
  assert.equal((await event("finish", { ...leader, sessionId: session.sessionId })).accepted, 10);
  assert.ok(!(await event("problem", { ...leader, ref: "G1" })).rejected);
  assert.equal(await state("G1"), "problem");
});

const itemOrder = {
  id: "manual:I1", externalReference: "I1", orderType: "item", quantity: 10, team: "FH1", orderName: "Ancient Core x10",
  assignmentMode: "leader", operationalStatus: "assignment_pending", financeStatus: "pending", transferStatus: "PENDING",
  rateMinor: 2000, grossMinor: 20000, workerAssignments: [],
  inventoryAllocations: [{ inventoryStockId: "stock-1", employeeCode: "C", team: "FH2", quantity: 10, stockType: "item" }],
};

test("Item routes to one division with correct quantity and no duplicate dispatch", async () => {
  await configureLeader(["FH1"], 900); await configureLeader(["FH2"], 901);
  await save([itemOrder]); await save([itemOrder]); await db.query("select cp_telegram_dispatch('I1')");
  const notices = (await db.query<{ chat_id: number; payload: { text: string; keyboard: string } }>("select chat_id,payload from cp_payroll_telegram_outbox where order_ref='I1' and event_key like 'dispatch:%'")).rows;
  assert.equal(notices.length, 1); assert.equal(notices[0].chat_id, 900);
  assert.match(notices[0].payload.text, /ORDER ITEM/); assert.match(notices[0].payload.text, /Target : 10/);
  assert.equal(notices[0].payload.keyboard, "item");
  assert.ok(payrollTelegramKeyboard(notices[0].payload)?.inline_keyboard.flat().some(b => b.text.includes("DONE")));
});

test("Item leader flow requires evidence, preserves warehouse/finance and finishes once", async () => {
  await db.exec("delete from cp_payroll_telegram_employees");
  await configureLeader(["FH1"]);
  const inventory = [{ id: "stock-1", stockType: "item", onHand: 20, reserved: 10, employeeCode: "C" }];
  await db.query("update cp_payroll_workspace set payload=$1::jsonb where id=1", [JSON.stringify({ ...workspace([itemOrder]), "cp-ofs-demo-inventory-v4": inventory })]);
  const ctx = { ...leader, ref: "I1" };
  const picker = await event("picker", ctx);
  assert.deepEqual(picker.employees?.map(e => e.name), ["Andi", "Budi"]);
  const picked = await event("pick", { ...ctx, employeeId: picker.employees![0].id });
  assert.ok(!picked.rejected, picked.text); assert.equal(picked.keyboard, "item");
  const startSession = await event("start", ctx);
  assert.equal(await state("I1"), "assigned");
  assert.equal((await event("finish", { ...ctx, sessionId: startSession.sessionId })).rejected, true);
  assert.ok(!(await media("photo", ctx)).rejected); assert.equal(await state("I1"), "in_progress");
  await event("pause", ctx); assert.equal(await state("I1"), "paused");
  await event("resume", ctx); assert.equal(await state("I1"), "in_progress");
  const done = await event("done", ctx);
  assert.equal((await event("finish", { ...ctx, sessionId: done.sessionId })).rejected, true);
  await media("photo", ctx); await media("video", ctx);
  const updateId = nextId++;
  const finish = await event("finish", { ...ctx, sessionId: done.sessionId }, false, updateId);
  assert.equal(finish.state, "done_pending_admin", finish.text);
  assert.equal((await event("finish", { ...ctx, sessionId: done.sessionId }, false, updateId)).duplicate, true);
  assert.equal((await event("finish", { ...ctx, sessionId: done.sessionId })).rejected, true);
  const data = (await db.query<{ payload: Record<string, unknown> }>("select payload from cp_payroll_workspace where id=1")).rows[0].payload;
  const saved = (data["cp-ofs-demo-user-orders-v3"] as (Omit<typeof itemOrder, "workerAssignments"> & { workerAssignments: { employeeCode: string; quantity: number; process: string }[] })[])[0];
  assert.deepEqual(data["cp-ofs-demo-inventory-v4"], inventory);
  assert.deepEqual(saved.inventoryAllocations, itemOrder.inventoryAllocations);
  assert.deepEqual(saved.workerAssignments.map(w => [w.employeeCode, w.quantity, w.process]), [["A", 10, "MAIL"]]);
  assert.equal(saved.financeStatus, "pending"); assert.equal(saved.transferStatus, "PENDING"); assert.equal(saved.grossMinor, 20000);
  assert.equal(saved.operationalStatus, "assigned"); assert.equal("verifiedAt" in saved, false); assert.equal("payrollClosedAt" in saved, false);
  const workflow = (await db.query<{ delivered_quantity: number; target_quantity: number }>("select delivered_quantity,target_quantity from cp_payroll_telegram_orders where order_ref='I1'")).rows[0];
  assert.equal(Number(workflow.delivered_quantity), 10); assert.equal(Number(workflow.target_quantity), 10);
  assert.equal(await count("cp_payroll_telegram_evidence", "order_ref='I1' and employee_code='A' and telegram_user_id=900"), 3);
  assert.equal(await count("cp_payroll_telegram_gold_contributions", "order_ref='I1'"), 0);
});

test("Item rejects other leaders, resigned workers, wrong divisions and Gold commands", async () => {
  await configureLeader(["FH1"], 900); await configureLeader(["FH2"], 901); await save([itemOrder]);
  assert.equal((await event("picker", { userId: 901, chatId: 901, ref: "I1" })).rejected, true);
  assert.equal((await event("picker", { userId: 901, chatId: 900, ref: "I1" })).rejected, true);
  for (const employeeCode of ["C", "R"]) assert.equal((await event("assign", { ...leader, ref: "I1", employeeCode })).rejected, true);
  assert.ok(!(await event("assign", { ...leader, ref: "I1", employeeCode: "A" })).rejected);
  for (const action of ["gold", "goldpicker", "pickgold"]) assert.equal((await event(action, { ...leader, ref: "I1", employeeId: "1" })).rejected, true);
});

test("Item direct request auto-assigns and replacement invalidates stale evidence", async () => {
  await configureLeader(["FH1"]);
  await save([{ ...itemOrder, assignmentMode: "direct", workerAssignments: [{ employeeCode: "B", employeeName: "Budi", team: "FH1", quantity: 10, process: "F2F" }] }]);
  assert.equal(await count("cp_payroll_telegram_assignments", "order_ref='I1' and employee_code='B' and status='assigned'"), 1);
  const old = await event("start", { ...leader, ref: "I1" });
  assert.ok(!old.rejected, old.text);
  assert.ok(!(await event("assign", { ...leader, ref: "I1", employeeCode: "A" })).rejected);
  await media("photo", leader);
  assert.equal(await count("cp_payroll_telegram_evidence", "order_ref='I1'"), 0);
  assert.equal((await event("finish", { ...leader, sessionId: old.sessionId })).rejected, true);
});

for (const protection of [{ verifiedAt: "2026-09-26T00:00:00Z" }, { payrollClosedAt: "2026-09-26T00:00:00Z" }, { sheetDeletedAt: "2026-09-26T00:00:00Z" }]) test(`Item rejects actions after ${Object.keys(protection)[0]}`, async () => {
  await configureLeader(["FH1"]); await save([itemOrder]);
  await event("assign", { ...leader, ref: "I1", employeeCode: "A" });
  await save([{ ...itemOrder, ...protection }]);
  for (const action of ["picker", "assign", "start", "pause", "resume", "done", "problem"]) {
    assert.equal((await event(action, { ...leader, ref: "I1", employeeCode: "B" })).rejected, true, action);
  }
});
