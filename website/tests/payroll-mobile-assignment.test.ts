import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(file: string, mocks: Record<string, unknown>) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { GET?: (request: Request) => Promise<Response>; POST?: (request: Request) => Promise<Response> } = {};
  runInNewContext(compiled, {
    exports, Request, Response, Error, SyntaxError,
    require: (name: string) => { assert.ok(name in mocks, `Unexpected module: ${name}`); return mocks[name]; },
  });
  return exports;
}
const url = "https://example.com/api/admin/payroll/mobile";
const order = (externalReference: string, patch: Record<string, unknown> = {}) => ({
  externalReference, team: "FH3", orderType: "boosting", operationalStatus: "assignment_pending",
  orderedAt: "2026-10-19T09:00:00.000Z", financeStatus: "pending",
  orderName: "Boost Rank", game: "Mobile Legends", buyerName: "Buyer", task: "Joki",
  workerAssignments: [], grossMinor: 2000, ...patch,
});
const workspace = (orders: unknown[], employees: unknown[] = []) =>
  { return { payload: { orders, employees }, revision: 7, updated_at: "2026-10-19T10:00:00Z" }; };
const client = (data: unknown) => ({
  from: (table: string) => {
    assert.equal(table, "cp_payroll_workspace", "mobile endpoint must never query Telegram tables");
    return { select: () => ({ eq: () => ({ single: async () => ({ data }) }) }) };
  },
});
const common = {
  "@/lib/adminSecurity": { adminErrorStatus: (e: { status?: number }) => e.status ?? 500 },
  "@/features/payroll/lib/workspace-model": { workspaceKeys: { orders: "orders", employees: "employees" } },
};
test("pending endpoint blocks non-admin before reading order details", async () => {
  let reads = 0;
  const route = load("app/api/admin/payroll/mobile/pending/route.ts", {
    ...common, "@/lib/payrollAccess": { requirePayrollAccess: async () => ({
      actor: { isAdmin: false }, supabaseAdmin: { from: () => { reads++; } },
    }) },
  });
  assert.equal((await route.GET!(new Request(url + "/pending"))).status, 403);
  assert.equal(reads, 0);
});

test("new orders are read directly from Payroll (including imported draft), never Telegram", async () => {
  const rows = [
    order("X100"), order("X200", { operationalStatus: "draft" }),
    order("X300", { operationalStatus: "assigned" }),
    order("X400", { team: "FH2" }),
    order("X500", { workerAssignments: [{ employeeCode: "E" }] }),
    order("X600", { importNeedsReview: true }),
    order("X700", { sheetDeletedAt: "2026-10-18T00:00:00Z" }),
    order("X800", { scheduleMode: "daily" }),
    order("X900", { orderType: "item", operationalStatus: "confirmed" }),
  ];
  const route = load("app/api/admin/payroll/mobile/pending/route.ts", {
    ...common, "@/lib/payrollAccess": { requirePayrollAccess: async () => ({
      actor: { isAdmin: true }, supabaseAdmin: client(workspace(rows)),
    }) },
  });
  const response = await route.GET!(new Request(url + "/pending"));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.schema, 2);
  assert.equal(result.source, "payroll");
  assert.deepEqual(result.pending.map((x: { orderRef: string }) => x.orderRef), ["X100","X200","X900"]);
  assert.equal(result.pending[0].buyer, "Buyer");
  assert.doesNotMatch(JSON.stringify(result), /grossMinor|telegram_user_id|salary|kasbon|refreshToken/);
});

test("assignment endpoint checks admin, validates payload, and uses website actor identity", async () => {
  let isAdmin = false;
  const calls: unknown[] = [];
  const route = load("app/api/admin/payroll/mobile/assign/route.ts", {
    ...common, "@/lib/payrollAccess": { requirePayrollAccess: async () => ({
      actor: { isAdmin, id: "e120c2e4-99bb-42b0-9d08-a8e71ebef76a" },
      supabaseAdmin: { rpc: async (name: string, args: unknown) => {
        calls.push({ name, args }); return { data: { ok: true, orderRef: "X100" } };
      } },
    }) },
  });
  const request = (body: unknown) => new Request(url + "/assign", {
    method: "POST", body: JSON.stringify(body),
  });
  assert.equal((await route.POST!(request({ orderRef: "X100", employeeCode: "E" }))).status, 403);
  isAdmin = true;
  assert.equal((await route.POST!(request({ orderRef: "", employeeCode: "E" }))).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await route.POST!(request({ orderRef: "X100", employeeCode: "E" }))).status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    name: "cp_mobile_assign_fh3",
    args: { p_order_ref: "X100", p_employee_code: "E", p_actor_id: "e120c2e4-99bb-42b0-9d08-a8e71ebef76a" },
  }]);
});

test("concurrent assignment conflicts are surfaced instead of overwriting work", async () => {
  const route = load("app/api/admin/payroll/mobile/assign/route.ts", {
    ...common, "@/lib/payrollAccess": { requirePayrollAccess: async () => ({
      actor: { isAdmin: true, id: "e120c2e4-99bb-42b0-9d08-a8e71ebef76a" },
      supabaseAdmin: { rpc: async () => ({ error: { code: "P0001" } }) },
    }) },
  });
  const request = new Request(url + "/assign", {
    method: "POST", body: JSON.stringify({ orderRef: "X100", employeeCode: "E" }),
  });
  assert.equal((await route.POST!(request)).status, 409);
});

test("active tasks project directly from assigned Payroll orders", async () => {
  const e = { id: "uid-1", code: "FH3001", name: "Andi", team: "FH3", workforceStatus: "SHIFT" };
  const rows = [
    order("X100", { operationalStatus: "assigned", workerAssignments: [
      { employeeCode: "FH3001", employeeName: "Andi", team: "FH3", quantity: 1 },
    ] }),
    order("X200", { operationalStatus: "assignment_pending" }),
  ];
  const route = load("app/api/admin/payroll/mobile/tasks/route.ts", {
    ...common, "@/lib/payrollAccess": { requirePayrollAccess: async () => ({
      supabaseAdmin: client(workspace(rows, [e])),
    }) },
  });
  const response = await route.GET!(new Request(url + "/tasks"));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, "payroll");
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].employeeCode, "FH3001");
  assert.equal(result.tasks[0].orderRef, "X100");
  assert.doesNotMatch(JSON.stringify(result), /grossMinor|telegram_file_id|telegram_chat_id/);
});

test("direct database migrations contain no Telegram assignment or outbox writes", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261019220000_cp_boost_monitor_mobile_assignment.sql", import.meta.url), "utf8");
  const routing = readFileSync(new URL("../supabase/migrations/20261019220001_cp_boost_monitor_direct_fh3_routing.sql", import.meta.url), "utf8");
  assert.match(sql, /cp_payroll_workspace where id = 1 for update/);
  assert.match(sql, /cp_mobile_assignment_audit/);
  assert.doesNotMatch(sql, /cp_payroll_telegram_/);
  assert.match(routing, /p_order->>'team'='FH3'/);
  assert.match(routing, /then return; end if/);
});
