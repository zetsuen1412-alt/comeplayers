import { monitorFixtureImports } from './monitor-fixture-imports';
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { Employee, Order } from "../features/payroll/types/domain";
import { workspaceKeys as K, canonical } from "../features/payroll/lib/workspace-model";
import { buildMobileCompleted, type CompletedProof, type CompletedReceipt } from "../lib/payrollMobileCompleted";
import type { FH3MonitorJob } from "../lib/fh3MonitorJobs";
import { loadCompletedMonitorEvidence } from "../lib/fh3MonitorCompletedData";

const employee = { id: "e1", code: "E1", name: "ADIT3", team: "FH3", workforceStatus: "SHIFT" } as Employee;
const financial = { id: "order1", externalReference: "X4802", team: "FH3", operationalStatus: "verified",
  employeeCode: "E1", employeeName: "ADIT3", grossMinor: 900000, buyerName: "PRIVATE BUYER", orderName: "PRIVATE PASSWORD" } as Order;
const state = () => ({ [K.employees]: [employee, { ...employee, id: "e2", code: "E2", name: "RIKI3" },
  { ...employee, id: "e3", code: "E3", team: "FH1", name: "OTHER DIVISION" }],
  [K.orders]: [financial], [K.closings]: [{ note: "PRIVATE SALARY HISTORY" }] });
const source = (order_ref = "X4801"): CompletedReceipt => ({ order_ref, chat_id: -100123, game: "AION", duration: "12H", discord: "FH3 Demo", task: "Daily mission", active: true });
const done = (order_ref = "X4801"): CompletedProof => ({ order_ref, employee_code: "E1", chat_id: -100123, action: "done",
  status: "sent", telegram_message_id: 42, sent_at: "2026-10-22T03:00:00Z" });
const job = (order_ref = "X4801"): FH3MonitorJob => ({ order_ref, employee_id: "e1", employee_code: "E1", employee_name: "Old name",
  chat_id: -100123, source_message_id: 1, status: "completed", created_at: "2026-10-21T01:00:00Z", started_at: null, completed_at: "2026-10-22T03:00:00Z" });

test("completed history counts unpriced and priced Telegram DONE once and returns no financial data", () => {
  const data = state(), before = canonical(data);
  const result = buildMobileCompleted(data, [source(), source("X4802")], [done(), done(), done("X4802")], [job()], "E1");
  assert.equal(result.employees[0].employeeName, "ADIT3"); assert.equal(result.employees[0].completedCount, 2);
  assert.equal(result.employees[1].completedCount, 0); assert.equal(result.totals.completedCount, 2);
  assert.equal(result.totals.contributors, 1); assert.equal(result.workTotal, 2);
  assert.equal(result.work[0].discord, "FH3 Demo");
  assert.equal(result.work[0].telegramMessageUrl, "https://t.me/c/123/42");
  assert.equal(canonical(data), before, "Payroll, salary, assignments and Closing are read-only");
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|900000|earning|salary|gross|netMinor|OTHER DIVISION|Old name/);
});

test("unconfirmed, foreign, ambiguous or mismatched work never inflates completed counts", () => {
  const data = state();
  for (const patch of [{ status: "unknown" }, { status: "sending" }, { action: "start" }, { sent_at: null },
    { telegram_message_id: null }, { chat_id: -100999 }, { employee_code: "E2" }])
    assert.equal(buildMobileCompleted(data, [source()], [{ ...done(), ...patch }], [job()], "E1").workTotal, 0);
  for (const patch of [{ status: "in_progress" as const }, { employee_id: "other" }, { employee_code: "E2" }, { chat_id: -100999 }])
    assert.equal(buildMobileCompleted(data, [source()], [done()], [{ ...job(), ...patch }], "E1").workTotal, 0);
  assert.equal(buildMobileCompleted(data, [], [done("X4802")], [], "E1").workTotal, 0, "Payroll-only completion is excluded");
  data[K.orders].push({ ...financial, id: "duplicate" });
  assert.equal(buildMobileCompleted(data, [source("X4802")], [done("X4802")], [], "E1").workTotal, 0);
  assert.throws(() => buildMobileCompleted(data, [], [], [], "E3"), /FH3 tidak ditemukan/);
});

test("archiving a source retains confirmed work and stable pagination includes every completed order", () => {
  const receipts = Array.from({ length: 123 }, (_, i) => ({ ...source(`X${5000 + i}`), active: i !== 0 }));
  const proofs = receipts.map(receipt => done(receipt.order_ref)), jobs = receipts.map(receipt => job(receipt.order_ref));
  const data = state(), pages = [0, 50, 100].map(offset => buildMobileCompleted(data, receipts, proofs, jobs, "E1", offset));
  assert.deepEqual(pages.map(p => p.work.length), [50, 50, 23]);
  assert.deepEqual(pages.map(p => p.nextOffset), [50, 100, null]);
  assert.equal(pages[0].workTotal, 123); assert.equal(new Set(pages.flatMap(p => p.work.map(w => w.orderRef))).size, 123);
  assert.equal(pages[0].work[0].archived, true);
  const summary = buildMobileCompleted(data, receipts, proofs, jobs);
  assert.equal(summary.totals.completedCount, 123); assert.equal(summary.work.length, 0);
});

test("completed endpoint authorizes members before reads and rejects malformed filters", async () => {
  let status = 401, reads = 0;
  const exports: { GET?: (request: Request) => Promise<Response> } = {};
  const sourceCode = ts.transpileModule(readFileSync(new URL("../app/api/admin/payroll/mobile/completed/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modules = {
    "@/lib/monitorAccess": { requireMonitorAccess: async () => {
      if (status !== 200) throw Object.assign(new Error("Denied"), { status });
      return { actor: { isAdmin: false }, employeeCode:"E1", supabaseAdmin: { from: () => {
        reads++; return { select: () => ({ eq: () => ({ single: async () => ({ data: { payload: state(), revision: 9 } }) }) }) };
      } } };
    } },
    "@/lib/adminSecurity": { adminErrorStatus: (e: { status?: number }) => e.status ?? 500 },
    "@/lib/monitorManagement": {loadMonitorControls:async()=>new Map()},
    "@/lib/payrollMobileCompleted": { buildMobileCompleted },
    "@/lib/fh3MonitorCompletedData": { loadCompletedMonitorEvidence: async () => ({ receipts: [source()], proofs: [done()] }) },
    "@/lib/fh3MonitorJobs": { loadFH3MonitorJobs: async () => new Map([["X4801", job()]]) },
  };
  runInNewContext(sourceCode, { exports, Request, Response, URL, require: (key: keyof typeof modules) => modules[key] ?? monitorFixtureImports[key] });
  const get = (query = "") => exports.GET!(new Request("https://example.test/completed" + query));
  assert.equal((await get()).status, 401); status = 403; assert.equal((await get()).status, 403); assert.equal(reads, 0);
  status = 200; const response = await get("?employeeCode=E1");
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json(); assert.equal(result.workTotal, 1); assert.equal(result.completionRule, "telegram_done_confirmed");
  assert.equal((await get("?offset=-1")).status, 400); assert.equal((await get("?employeeCode=E3")).status, 404);
});

test("evidence reads complete pages and pins both group and sender without losing archived receipts", async () => {
  const conditions: string[] = [];
  const mock = { from: (table: string) => {
    const query = {
      select: () => query, eq: (key: string, value: unknown) => { conditions.push(`${table}:${key}=${value}`); return query; },
      order: () => query, maybeSingle: async () => ({ data: { chat_id: -100123, fh3_order_sender_id: 22 } }),
      range: async (from: number, to: number) => ({ data: Array.from({ length: Math.max(0, Math.min(to + 1, table.includes("manual") ? 1201 : 1001) - from) }, (_, i) =>
        table.includes("manual") ? source(`X${5000 + from + i}`) : done(`X${5000 + from + i}`)) }),
    }; return query;
  } };
  const result = await loadCompletedMonitorEvidence(mock as unknown as Parameters<typeof loadCompletedMonitorEvidence>[0]);
  assert.equal(result.receipts.length, 1201); assert.equal(result.proofs.length, 1001);
  assert.ok(conditions.includes("cp_fh3_telegram_manual_orders:admin_user_id=22"));
  assert.ok(!conditions.includes("cp_fh3_telegram_manual_orders:active=true"), "archived historical sources remain available");
  assert.ok(conditions.includes("cp_mobile_order_proof:status=sent"));
});
