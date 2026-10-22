import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { Order, Employee } from "../features/payroll/types/domain";
import { workspaceKeys as K, canonical } from "../features/payroll/lib/workspace-model";
import { buildMobileEarnings } from "../lib/payrollMobileEarnings";

const employee = { id: "e1", code: "E1", name: "Andi Baru", team: "FH3", workforceStatus: "SHIFT", utilization: 0, earningsMinor: 999999 } as Employee;
const order = (patch: Partial<Order> = {}): Order => ({
  id: "manual:o1", orderNumber: "CP1", externalReference: "X4806", source: "Direct",
  buyerName: "PRIVATE BUYER", orderName: "PRIVATE PASSWORD", game: "AION", service: "JOKI",
  employeeCode: "E1", employeeName: "Andi Lama", team: "FH3", quantity: 1,
  grossMinor: 100000, workerShareBps: 5000, operationalStatus: "verified", financeStatus: "pending",
  expectedPaymentMinor: 100000, matchedPaymentMinor: 0, orderedAt: "2026-10-22T01:00:00Z", dueAt: "2026-10-23T01:00:00Z",
  ...patch,
});
function fixture() { return {
  [K.orders]: [order(), order({ id: "o2", externalReference: "X4807", operationalStatus: "completed" }),
    order({ id: "o3", externalReference: "X4808", operationalStatus: "in_progress" })],
  [K.employees]: [employee, { ...employee, id: "e2", code: "E2", team: "FH1", name: "PRIVATE OTHER TEAM" }],
  [K.settings]: { defaultSharePercent: 50, employeeSharePercent: { E1: 60 },
    adjustments: { E1: { operationalMinor: 25000, penaltyMinor: 1000, bonusTipsMinor: 5000 } } },
  [K.advances]: [{ employeeCode: "E1", remainingMinor: 10000, status: "active", note: "PRIVATE NOTE" }],
  [K.closings]: [{ id: "C1", from: "2026-10-01", to: "2026-10-15", closedAt: "2026-10-16T00:00:00Z",
    payrollSnapshot: [{ employeeCode: "E1", earning: 90000, net: 70000 }] }],
}; }

test("employee earnings equal Website Gaji; DONE is not treated as verified or paid", () => {
  const data = fixture(); const before = canonical(data);
  const result = buildMobileEarnings(data, "E1");
  assert.equal(result.employees.length, 1);
  const row = result.employees[0];
  assert.equal(row.employeeName, "Andi Baru");
  assert.equal(row.earningMinor, 60000);
  assert.equal(row.netMinor, 29000);
  assert.equal(row.closedNetMinor, 70000);
  assert.equal(row.awaitingVerificationCount, 1);
  assert.equal(row.activeOrderCount, 1);
  assert.equal(row.verifiedWorkCount, 1);
  assert.equal(result.workTotal, 3);
  assert.equal(result.work.length, 3);
  assert.equal(canonical(data), before, "salary, assignments, advances and Closing must remain unchanged");
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|999999|Andi Lama/);
});

test("work history pages are stable, bounded and retain archived work without counting it as current salary", () => {
  const data = fixture();
  data[K.orders] = Array.from({ length: 205 }, (_, i) => order({
    id: `history:${i.toString().padStart(3, "0")}`, externalReference: `X${10000 + i}`,
    websiteDeletedAt: i === 0 ? "2026-10-22T01:00:00Z" : undefined,
  }));
  const first = buildMobileEarnings(data, "E1");
  const second = buildMobileEarnings(data, "E1", 100);
  const third = buildMobileEarnings(data, "E1", 200);
  assert.equal(first.workTotal, 205); assert.equal(first.nextOffset, 100);
  assert.equal(second.work.length, 100); assert.equal(second.nextOffset, 200);
  assert.equal(third.work.length, 5); assert.equal(third.nextOffset, null);
  assert.equal(new Set([...first.work, ...second.work, ...third.work].map(row => row.id)).size, 205);
  assert.equal(first.employees[0].verifiedWorkCount, 204);
  assert.throws(() => buildMobileEarnings(data, "E2"), /FH3 tidak ditemukan/);
});

test("unpriced operational work stays visible and only an explicit verified Payroll entry creates earnings", () => {
  const data = fixture(); data[K.orders] = [];
  const job: import("../lib/fh3MonitorJobs").FH3MonitorJob = { order_ref: "X4806", employee_id: "e1", employee_code: "E1",
    employee_name: "Andi Lama", chat_id: -123, source_message_id: 42, status: "completed",
    created_at: "2026-10-22T01:00:00Z", started_at: "2026-10-22T01:01:00Z", completed_at: "2026-10-22T01:02:00Z", source_active: true };
  const unpriced = buildMobileEarnings(data, "E1", 0, [job]);
  assert.equal(unpriced.employees[0].unvaluedOrderCount, 1);
  assert.equal(unpriced.employees[0].earningMinor, 0);
  assert.equal(unpriced.work[0].status, "completed");
  data[K.orders] = [order({ operationalStatus: "assigned" })];
  const registered = buildMobileEarnings(data, "E1", 0, [job]);
  assert.equal(registered.employees[0].earningMinor, 0);
  assert.equal(registered.employees[0].awaitingVerificationCount, 1);
  assert.equal(registered.work[0].status, "completed", "pricing must not reset recorded operational work");
  data[K.orders] = [order()]; // Explicit fixture of admin entering and verifying the real priced sale.
  const priced = buildMobileEarnings(data, "E1", 0, [job]);
  assert.equal(priced.employees[0].unvaluedOrderCount, 0);
  assert.equal(priced.employees[0].earningMinor, 60000);
  assert.equal(priced.workTotal, 1, "linked work is never counted twice");
});

test("earnings endpoint permits authorized Payroll members but rejects unauthenticated requests before reading data", async () => {
  let authorized = false, reads = 0;
  const exports: { GET?: (request: Request) => Promise<Response> } = {};
  const source = ts.transpileModule(readFileSync(new URL("../app/api/admin/payroll/mobile/earnings/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modules = {
    "@/lib/payrollAccess": { requirePayrollAccess: async () => {
      if (!authorized) throw Object.assign(new Error("No session"), { status: 401 });
      return { actor: { isAdmin: false }, supabaseAdmin: { from: () => {
        reads++; return { select: () => ({ eq: () => ({ single: async () => ({ data: { payload: fixture(), revision: 9 } }) }) }) };
      } } };
    } },
    "@/lib/adminSecurity": { adminErrorStatus: (e: { status?: number }) => e.status ?? 500 },
    "@/lib/payrollMobileEarnings": { buildMobileEarnings },
    "@/lib/fh3MonitorJobs": { loadFH3MonitorJobs: async () => new Map() },
  };
  runInNewContext(source, { exports, Request, Response, URL,
    require: (name: keyof typeof modules) => { assert.ok(name in modules); return modules[name]; },
  });
  const get = (query = "") => exports.GET!(new Request("https://example.test/earnings" + query));
  assert.equal((await get()).status, 401); assert.equal(reads, 0);
  authorized = true;
  const response = await get("?employeeCode=E1");
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).employees[0].netMinor, 29000);
  assert.equal((await get("?offset=-1")).status, 400);
  assert.equal((await get("?employeeCode=E2")).status, 404);
});
