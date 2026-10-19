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
    require: (name: string) => {
      assert.ok(name in mocks, `Unexpected module: ${name}`);
      return mocks[name];
    },
  });
  return exports;
}
const url = "https://example.com/api/admin/payroll/mobile";

test("mobile pending rejects non-admin before querying any order", async () => {
  let reads = 0;
  const route = load("app/api/admin/payroll/mobile/pending/route.ts", {
    "@/lib/payrollAccess": { requirePayrollAccess: async () => ({ actor: { isAdmin: false }, supabaseAdmin: { from: () => { reads++; } } }) },
    "@/lib/adminSecurity": { adminErrorStatus: () => 500 },
    "@/features/payroll/lib/workspace-model": { workspaceKeys: { orders: "orders" } },
  });
  const result = await route.GET!(new Request(url + "/pending"));
  assert.equal(result.status, 403);
  assert.equal(reads, 0);
});

test("mobile pending only shows waiting FH3 Boosting/Item, without sensitive financial fields", async () => {
  const seen: string[] = [];
  const workspace = { payload: { orders: [
    { externalReference: "X100", team: "FH3", orderType: "boosting", orderName: "Boost Rank", game: "Mobile Legends", buyerName: "Buyer", task: "Joki", grossMinor: 12345 },
    { externalReference: "X200", team: "FH2", orderType: "boosting", orderName: "Unrelated" },
    { externalReference: "X300", team: "FH3", orderType: "item", sheetDeletedAt: "2026-10-01" },
  ] }, revision: 7 };
  const query = (table: string) => {
    const q = {
      select: (_fields: string) => q,
      eq: (field: string, val: unknown) => { seen.push(`${table}:${field}=${val}`); return q; },
      in: () => q,
      order: () => q,
      limit: async () => ({ data: [
        { order_ref: "X100", order_type: "boosting", state: "waiting" },
        { order_ref: "X200", order_type: "boosting", state: "waiting" },
        { order_ref: "X300", order_type: "item", state: "waiting" },
      ] }),
      single: async () => ({ data: workspace }),
    };
    return q;
  };
  const route = load("app/api/admin/payroll/mobile/pending/route.ts", {
    "@/lib/payrollAccess": { requirePayrollAccess: async () => ({ actor: { isAdmin: true }, supabaseAdmin: { from: query } }) },
    "@/lib/adminSecurity": { adminErrorStatus: () => 500 },
    "@/features/payroll/lib/workspace-model": { workspaceKeys: { orders: "orders" } },
  });
  const response = await route.GET!(new Request(url + "/pending"));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.pending.length, 1);
  assert.equal(data.pending[0].orderRef, "X100");
  assert.equal(data.pending[0].buyer, "Buyer");
  assert.ok(seen.includes("cp_payroll_telegram_orders:division=FH3"));
  assert.ok(seen.includes("cp_payroll_telegram_orders:state=waiting"));
  assert.doesNotMatch(JSON.stringify(data), /grossMinor|telegram_user_id|salary|kasbon|refreshToken/);
});

test("mobile assignment requires admin and a valid order/employee before the database RPC", async () => {
  let isAdmin = false;
  const calls: unknown[] = [];
  const route = load("app/api/admin/payroll/mobile/assign/route.ts", {
    "@/lib/payrollAccess": { requirePayrollAccess: async () => ({
      actor: { isAdmin, id: "e120c2e4-99bb-42b0-9d08-a8e71ebef76a" },
      supabaseAdmin: { rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return { data: { ok: true, orderRef: "X100" } }; } },
    }) },
    "@/lib/adminSecurity": { adminErrorStatus: () => 500 },
  });
  const send = (body: unknown) => new Request(url + "/assign", { method: "POST", body: JSON.stringify(body) });
  assert.equal((await route.POST!(send({ orderRef: "X100", employeeCode: "EMP1" }))).status, 403);
  isAdmin = true;
  assert.equal((await route.POST!(send({ orderRef: "", employeeCode: "EMP1" }))).status, 400);
  assert.equal(calls.length, 0);
  const response = await route.POST!(send({ orderRef: "X100", employeeCode: "EMP1" }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {
    name: "cp_mobile_assign_fh3",
    args: { p_order_ref: "X100", p_employee_code: "EMP1", p_actor_id: "e120c2e4-99bb-42b0-9d08-a8e71ebef76a" },
  });
});

test("mobile assignment maps concurrent assignment conflicts to reload instead of overwriting", async () => {
  const route = load("app/api/admin/payroll/mobile/assign/route.ts", {
    "@/lib/payrollAccess": { requirePayrollAccess: async () => ({
      actor: { isAdmin: true, id: "e120c2e4-99bb-42b0-9d08-a8e71ebef76a" },
      supabaseAdmin: { rpc: async () => ({ error: { code: "P0001" } }) },
    }) },
    "@/lib/adminSecurity": { adminErrorStatus: () => 500 },
  });
  const request = new Request(url + "/assign", { method: "POST", body: JSON.stringify({ orderRef: "X100", employeeCode: "EMP1" }) });
  assert.equal((await route.POST!(request)).status, 409);
});

test("mobile assignment SQL cannot overwrite started/done work and records audit actor", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261019220000_cp_boost_monitor_mobile_assignment.sql", import.meta.url), "utf8");
  assert.match(sql, /for update/);
  assert.match(sql, /o\.state <> 'waiting'/);
  assert.match(sql, /cp_telegram_terminal\(item, w\)/);
  assert.match(sql, /cp_mobile_assignment_audit/);
  assert.match(sql, /p_actor_id/);
  assert.match(sql, /revoke all on function public\.cp_mobile_assign_fh3/);
  assert.doesNotMatch(sql, /cp_telegram_process_update\(/);
});
