import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const files = [
  "20260926030000_payroll_telegram_operations.sql",
  "20260926030001_payroll_telegram_durable_workflow.sql",
  "20260926030002_payroll_telegram_leader_dispatch.sql",
  "20260926035622_payroll_telegram_item_workflow.sql",
  "20260926041704_payroll_telegram_strict_division_routing.sql",
  "20261006060224_payroll_website_archive_telegram_guard.sql",
  "20261018090000_payroll_telegram_buyer_snapshot.sql",
  "20261019220000_cp_boost_monitor_mobile_assignment.sql",
  "20261019220001_cp_boost_monitor_direct_fh3_routing.sql",
];
const order = (code: string, team: string) => ({
  id: `manual:${code}`, externalReference: code, orderType: "boosting",
  team, quantity: 1, operationalStatus: "assignment_pending", financeStatus: "pending",
  assignmentMode: "leader", workerAssignments: [], source: "Manual",
  orderedAt: "2026-10-19T09:00:00Z", service: "Boost", game: "ML",
});
test("new FH3 orders bypass Telegram even when bot routing is configured; other teams remain unchanged", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(`create table public.cp_payroll_workspace(
      id int primary key,payload jsonb,revision bigint default 0,updated_at timestamptz default now());
      insert into cp_payroll_workspace(id,payload) values(1,'{}'::jsonb);`);
    for (const file of files) await db.exec(readFileSync(
      new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    await db.exec(`insert into public.cp_payroll_telegram_divisions(division,chat_id,chat_title,active)
      values('FH3',-103,'FH3',true),('FH1',-101,'FH1',true);`);
    const payload = JSON.stringify({
      "cp-ofs-demo-user-orders-v3": [order("F3", "FH3"), order("F1", "FH1")],
      "cp-ofs-demo-employees-v2": [
        { code:"FH3001", name:"Andi", team:"FH3", workforceStatus:"SHIFT" },
      ],
      "cp-ofs-demo-closing-v1": [],
    });
    await db.query("update cp_payroll_workspace set payload=$1::jsonb where id=1", [payload]);
    const rows = (await db.query<{ order_ref: string }>(
      "select order_ref from cp_payroll_telegram_orders order by order_ref")).rows;
    assert.deepEqual(rows.map(x => x.order_ref), ["F1"]);
    const dispatch = (await db.query<{ order_ref: string }>(
      "select order_ref from cp_payroll_telegram_outbox order by order_ref")).rows;
    assert.deepEqual(dispatch.map(x => x.order_ref), ["F1"]);
    const userId = "e120c2e4-99bb-42b0-9d08-a8e71ebef76a";
    await db.query("select cp_mobile_assign_fh3('F3','FH3001',$1::uuid)", [userId]);
    const after = (await db.query<{ order_ref: string }>(
      "select order_ref from cp_payroll_telegram_orders order by order_ref")).rows;
    assert.deepEqual(after.map(x => x.order_ref), ["F1"]);
    const updated = (await db.query<{ payload: Record<string, unknown> }>(
      "select payload from cp_payroll_workspace where id=1")).rows[0].payload;
    const f3 = (updated["cp-ofs-demo-user-orders-v3"] as Array<{ externalReference: string; operationalStatus: string }>).find(x => x.externalReference === "F3");
    assert.equal(f3?.operationalStatus, "assigned");
  } finally {
    await db.close();
  }
});
