import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
let eventId = 1;
const migrations = ["20260926030000_payroll_telegram_operations.sql", "20260926030001_payroll_telegram_durable_workflow.sql", "20260926030002_payroll_telegram_leader_dispatch.sql", "20260926035622_payroll_telegram_item_workflow.sql", "20260926041704_payroll_telegram_strict_division_routing.sql"];
const guard = readFileSync(new URL("../supabase/migrations/20261006060224_payroll_website_archive_telegram_guard.sql", import.meta.url), "utf8");
const original = readFileSync(new URL("../supabase/migrations/20260926041704_payroll_telegram_strict_division_routing.sql", import.meta.url), "utf8");
const active = { id: "manual:B1", externalReference: "B1", orderType: "boosting", quantity: 1, team: "FH1", orderName: "Boost", operationalStatus: "draft" };
const employees = [{ code: "A", name: "Andi", team: "FH1", workforceStatus: "SHIFT" }];
async function save(items: unknown[]) {
  await db.query("update cp_payroll_workspace set payload=$1::jsonb where id=1", [JSON.stringify({ "cp-ofs-demo-user-orders-v3": items, "cp-ofs-demo-employees-v2": employees })]);
}
async function event(action: string, extra: Record<string, unknown> = {}, admin = false) {
  return (await db.query<{ result: { rejected?: boolean; text: string } }>("select cp_telegram_process_update($1,$2::jsonb,$3) as result",
    [eventId++, JSON.stringify({ userId: 101, chatId: -101, action, ref: "B1", ...extra }), admin])).rows[0].result;
}
async function workflow() {
  return (await db.query<{ state: string }>("select state from cp_payroll_telegram_orders where order_ref='B1'")).rows[0]?.state;
}
before(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; create table cp_payroll_workspace(id int primary key,payload jsonb,revision bigint default 0,updated_at timestamptz default now()); insert into cp_payroll_workspace(id,payload) values(1,'{}');");
  for (const file of migrations) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  await db.exec(guard);
});
beforeEach(async () => {
  await db.exec("begin; insert into cp_payroll_telegram_divisions(division,chat_id) values('FH1',-101); insert into cp_payroll_telegram_employees(employee_code,telegram_user_id,division) values('A',101,'FH1');");
});
afterEach(async () => { await db.exec("rollback"); });
after(async () => { await db.close(); });

test("the archive migration changes only the three active-order predicates and leaves terminal/auth/business logic intact", () => {
  const names = ["cp_telegram_route_allowed", "cp_telegram_prepare_order", "cp_telegram_process_update"];
  for (const name of names) {
    const definition = new RegExp(`create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`);
    const before = original.match(definition)![0].replace(/^create function/, "create or replace function");
    const after = guard.match(definition)![0]
      .replace(" and nullif(j->>'websiteDeletedAt','') is null", "")
      .replace("  -- Website archives are inactive, not verified; explicit restoration resumes the prior workflow.\n  if nullif(p_order->>'websiteDeletedAt','') is not null then return; end if;\n", "")
      .replace(" or nullif(item->>'websiteDeletedAt','') is not null", "");
    assert.equal(after, before, name);
  }
  assert.doesNotMatch(guard, /create(?: or replace)? function public\.cp_telegram_terminal/);
});

test("a website archive rejects stale callbacks and keeps the original workflow available for explicit restoration", async () => {
  await save([active]);
  const assigned = await event("assign", { employeeCode: "A" }, true);
  assert.ok(!assigned.rejected, assigned.text);
  assert.equal(await workflow(), "assigned");
  const archived = { ...active, websiteDeletedAt: "2026-10-06T12:00:00Z", websiteDeletedBy: "Admin" };
  await save([archived]);
  const before = (await db.query<{ payload: unknown }>("select payload from cp_payroll_workspace where id=1")).rows[0].payload;
  assert.equal(await workflow(), "assigned", "archive must not persist verified");
  assert.equal((await db.query<{ allowed: boolean }>("select cp_telegram_route_allowed('B1','FH1',-101) allowed")).rows[0].allowed, false);
  const rejected = await event("start");
  assert.ok(rejected.rejected); assert.match(rejected.text, /tidak aktif/);
  assert.equal(await workflow(), "assigned");
  assert.deepEqual((await db.query<{ payload: unknown }>("select payload from cp_payroll_workspace where id=1")).rows[0].payload, before);
  await save([active]);
  assert.equal((await db.query<{ allowed: boolean }>("select cp_telegram_route_allowed('B1','FH1',-101) allowed")).rows[0].allowed, true);
  const started = await event("start");
  assert.ok(!started.rejected, started.text);
});

test("a newly archived workspace record cannot create or queue a Telegram order", async () => {
  await save([{ ...active, websiteDeletedAt: "2026-10-06T12:00:00Z" }]);
  assert.equal(await workflow(), undefined);
  assert.equal(Number((await db.query<{ n: number }>("select count(*) n from cp_payroll_telegram_outbox")).rows[0].n), 0);
});

test("archived evidence sessions reject media without accepting evidence or quota contributions", async () => {
  await save([active]); await event("assign", { employeeCode: "A" }, true); await event("start");
  await save([{ ...active, websiteDeletedAt: "2026-10-06T12:00:00Z" }]);
  const result = await event("media", { mediaType: "photo", messageId: 1, fileId: "file", fileUniqueId: "unique" });
  assert.ok(result.rejected); assert.match(result.text, /tidak aktif/);
  assert.equal(Number((await db.query<{ n: number }>("select count(*) n from cp_payroll_telegram_evidence")).rows[0].n), 0);
  assert.equal(await workflow(), "assigned");
});
