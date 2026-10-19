import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrations = [
  "20260926030000_payroll_telegram_operations.sql",
  "20260926030001_payroll_telegram_durable_workflow.sql",
  "20260926030002_payroll_telegram_leader_dispatch.sql",
  "20260926035622_payroll_telegram_item_workflow.sql",
  "20260926041704_payroll_telegram_strict_division_routing.sql",
  "20261006060224_payroll_website_archive_telegram_guard.sql",
  "20261018090000_payroll_telegram_buyer_snapshot.sql",
  "20261019220000_cp_boost_monitor_mobile_assignment.sql",
  "20261019220001_cp_boost_monitor_direct_fh3_routing.sql",
  "20261019220002_cp_boost_monitor_mobile_telegram_proof.sql",
];
const actor = "e120c2e4-99bb-42b0-9d08-a8e71ebef76a";
const order = {
  id: "manual:X4671", externalReference: "X4671", team: "FH3", orderType: "boosting",
  operationalStatus: "assignment_pending", financeStatus: "pending", workerAssignments: [],
  quantity: 1, service: "Level Boost", game: "AION2", orderedAt: "2026-10-19T09:00:00Z",
};
async function getOrder(db: PGlite) {
  const result = await db.query<{ payload: Record<string, unknown> }>(
    "select payload from cp_payroll_workspace where id=1");
  return (result.rows[0].payload["cp-ofs-demo-user-orders-v3"] as Record<string, unknown>[])[0];
}

test("mobile START + photo and DONE + photo advance website only after delivery acknowledgment", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(`create table public.cp_payroll_workspace(
      id int primary key,payload jsonb,revision bigint default 0,updated_at timestamptz default now());
      insert into cp_payroll_workspace(id,payload) values(1,'{}'::jsonb);`);
    for (const file of migrations)
      await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    const payload = {
      "cp-ofs-demo-user-orders-v3": [order],
      "cp-ofs-demo-employees-v2": [{
        id: "1", code: "F001", name: "Mulyana", team: "FH3", workforceStatus: "SHIFT",
      }],
      "cp-ofs-demo-closing-v1": [],
    };
    await db.query("update cp_payroll_workspace set payload=$1::jsonb where id=1", [JSON.stringify(payload)]);
    await db.query("select cp_mobile_assign_fh3('X4671','F001',$1::uuid)", [actor]);
    // The group must be an admin-configured FH3 destination, never supplied by APK.
    await db.exec("insert into cp_payroll_telegram_divisions(division,chat_id,chat_title) values('FH3',-123456,'EVO Ilham FH3')");
    const begin = async (action: string) => (await db.query<{ result: {
      eventId: string; caption: string; chatId: number; alreadySent: boolean;
    } }>("select cp_mobile_proof_begin('X4671','F001',$1,$2::uuid) result",
    [action,actor])).rows[0].result;
    const start = await begin("start");
    assert.equal(start.caption, "x4671/mulyana/start");
    assert.equal(Number(start.chatId), -123456);
    assert.equal((await getOrder(db)).operationalStatus, "assigned", "no status change before confirmed upload");
    const claimed = (await db.query<{ status: string }>(
      "select status from cp_mobile_order_proof where action='start'")).rows[0];
    assert.equal(claimed.status, "sending");
    await db.query("select cp_mobile_proof_finish($1::uuid,$2::uuid,101,'telegram-photo-id')",
      [start.eventId,actor]);
    assert.equal((await getOrder(db)).operationalStatus, "in_progress");
    const done = await begin("done");
    assert.equal(done.caption, "x4671/mulyana/done");
    assert.equal((await getOrder(db)).operationalStatus, "in_progress");
    await db.query("select cp_mobile_proof_finish($1::uuid,$2::uuid,102,'telegram-photo-id-2')",
      [done.eventId,actor]);
    const saved = await getOrder(db);
    assert.equal(saved.operationalStatus, "completed");
    assert.ok(saved.completedAt);
    const proofs = (await db.query<{ action: string; telegram_message_id: number; status: string }>(
      "select action,telegram_message_id,status from cp_mobile_order_proof order by telegram_message_id")).rows;
    assert.deepEqual(proofs.map(x=>x.action), ["start","done"]);
    assert.ok(proofs.every(x => x.status === "sent"));
    assert.equal((await db.query<{ count: number }>(
      "select count(*)::int count from cp_payroll_telegram_outbox")).rows[0].count, 0);
  } finally { await db.close(); }
});

test("mobile photo proof migration enforces one event per order and action, no anonymous writes", () => {
  const sql = readFileSync(new URL(
    "../supabase/migrations/20261019220002_cp_boost_monitor_mobile_telegram_proof.sql", import.meta.url), "utf8");
  assert.match(sql, /unique\(order_ref,action\)/);
  assert.match(sql, /status in \('sending','sent','failed','unknown'\)/);
  assert.match(sql, /revoke all on function public\.cp_mobile_proof_begin/);
  assert.match(sql, /where division='FH3' and active/);
  assert.doesNotMatch(sql, /p_chat_id|p_telegram_token/);
});
