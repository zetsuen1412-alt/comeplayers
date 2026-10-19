import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, afterEach, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const actor = "e120c2e4-99bb-42b0-9d08-a8e71ebef76a";
const workers = [
  { id: "a", code: "FH3001", name: "Andi", team: "FH3", workforceStatus: "SHIFT" },
  { id: "b", code: "FH3002", name: "Budi", team: "FH3", workforceStatus: "NEW" },
  { id: "c", code: "FH2001", name: "Wrong division", team: "FH2", workforceStatus: "SHIFT" },
  { id: "d", code: "FH3003", name: "Resigned", team: "FH3", workforceStatus: "RESIGN" },
];
const baseOrder = {
  id: "manual:1", externalReference: "X100", team: "FH3", orderType: "boosting",
  operationalStatus: "assignment_pending", financeStatus: "pending",
  workerAssignments: [], quantity: 1, process: "JOKI", orderedAt: "2026-10-19T09:00:00Z",
};
const payload = (orders: unknown[] = [baseOrder]) =>
  JSON.stringify({ "cp-ofs-demo-user-orders-v3": orders,
    "cp-ofs-demo-employees-v2": workers, "cp-ofs-demo-closing-v1": [] });
async function write(orders: unknown[]) {
  await db.query("update public.cp_payroll_workspace set payload=$1::jsonb where id=1", [payload(orders)]);
}
async function assign(ref: string, code: string) {
  const result = await db.query<{ result: { ok: boolean; alreadyAssigned: boolean; employeeCode: string; orderRef: string } }>(
    "select public.cp_mobile_assign_fh3($1,$2,$3::uuid) result", [ref, code, actor]);
  return result.rows[0].result;
}
async function rejectAssignment(ref: string, code: string, expected: RegExp) {
  await db.exec("savepoint expected_rejection");
  await assert.rejects(assign(ref, code), expected);
  await db.exec("rollback to savepoint expected_rejection");
  await db.exec("release savepoint expected_rejection");
}
async function orderRow() {
  const { rows } = await db.query<{ payload: Record<string, unknown> }>(
    "select payload from public.cp_payroll_workspace where id=1");
  return (rows[0].payload["cp-ofs-demo-user-orders-v3"] as Record<string, unknown>[])[0];
}
async function auditCount() {
  return (await db.query<{ n: number }>(
    "select count(*)::int n from public.cp_mobile_assignment_audit")).rows[0].n;
}
before(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(`create table public.cp_payroll_workspace(
    id int primary key, payload jsonb, revision bigint default 0, updated_at timestamptz default now()
  ); insert into public.cp_payroll_workspace(id,payload) values(1,'{}'::jsonb);`);
  const sql = readFileSync(new URL("../supabase/migrations/20261019220000_cp_boost_monitor_mobile_assignment.sql", import.meta.url), "utf8");
  await db.exec(sql);
});
beforeEach(async () => {
  await db.exec("begin");
  await write([baseOrder]);
});
afterEach(async () => { await db.exec("rollback"); });
after(async () => { await db.close(); });

test("one mobile assignment sets Payroll worker, status and audit atomically", async () => {
  const result = await assign("X100", "FH3001");
  assert.equal(result.ok, true);
  assert.equal(result.alreadyAssigned, false);
  const stored = await orderRow();
  assert.equal(stored.operationalStatus, "assigned");
  assert.equal(stored.employeeCode, "FH3001");
  assert.equal(stored.assignmentMode, "direct");
  assert.equal((stored.workerAssignments as { id: string }[])[0].id, "mobile:X100:FH3001");
  assert.equal(await auditCount(), 1);
  assert.equal((await db.query<{ revision: number }>("select revision from cp_payroll_workspace where id=1")).rows[0].revision, 1);
});

test("same worker retry is idempotent, different worker cannot take assigned order", async () => {
  await assign("X100", "FH3001");
  assert.equal((await assign("X100", "FH3001")).alreadyAssigned, true);
  assert.equal(await auditCount(), 1);
  await rejectAssignment("X100", "FH3002", /tidak tersedia/i);
  assert.equal((await orderRow()).employeeCode, "FH3001");
});

test("wrong division, resigned worker, verified order and review draft are blocked", async () => {
  await rejectAssignment("X100", "FH2001", /tidak aktif/i);
  await rejectAssignment("X100", "FH3003", /tidak aktif/i);
  await write([{ ...baseOrder, operationalStatus: "verified" }]);
  await rejectAssignment("X100", "FH3001", /tidak tersedia/i);
  await write([{ ...baseOrder, operationalStatus: "draft", importNeedsReview: true }]);
  await rejectAssignment("X100", "FH3001", /tidak tersedia/i);
  assert.equal(await auditCount(), 0);
});

test("closings and already assigned order are never overwritten", async () => {
  await write([{ ...baseOrder, workerAssignments: [{
    id: "other", employeeCode: "FH3002", employeeName: "Budi", team: "FH3", process: "JOKI", quantity: 1,
  }] }]);
  await rejectAssignment("X100", "FH3001", /tidak tersedia/i);
  await db.query("update cp_payroll_workspace set payload=jsonb_set(payload,'{cp-ofs-demo-closing-v1}',$1::jsonb) where id=1",
    [JSON.stringify([{ orderRefs: ["X100"] }])]);
  await rejectAssignment("X100", "FH3001", /tidak tersedia/i);
  assert.equal(await auditCount(), 0);
});
