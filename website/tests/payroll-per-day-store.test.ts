import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as bulkActions from "../features/payroll/lib/bulk-mutation-actions";
import * as dailyOrders from "../features/payroll/lib/daily-orders";
import * as bulkInventory from "../features/payroll/lib/bulk-mutation-inventory";
import * as syncPolicy from "../features/payroll/lib/sheet-sync-policy";
import { workspaceKeys as K } from "../features/payroll/lib/workspace-model";
import type { Order } from "../features/payroll/types/domain";

type Hook = typeof import("../features/payroll/lib/demo-order-store");
const source = readFileSync(new URL("../features/payroll/lib/demo-order-store.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const now = "2026-10-07T02:00:00.000Z", later = "2026-10-07T03:00:00.000Z";
function parent(): Order {
  return { id: "monthly", orderNumber: "X2184", externalReference: "X2184", source: "G2G", orderType: "boosting", game: "TWM",
    orderName: "1 Month Package (6 Hours/Day)", service: "Boosting", quantity: 3, grossMinor: 399999, rateMinor: 133333,
    expectedPaymentMinor: 399999, matchedPaymentMinor: 0, operationalStatus: "assigned", financeStatus: "pending",
    orderedAt: now, dueAt: later, scheduleMode: "daily", scheduleTotalDays: 30, dailyHours: 6,
    dailyWork: [1, 2, 3].map(sequence => ({ id: `sheet-day:${sequence}`, sequence, workDate: "2026-09-23", quantity: 1,
      grossMinor: 133333, rateMinor: 133333, status: "pending", hours: 6,
      workerAssignments: [{ id: `worker-${sequence}`, employeeCode: `W${sequence}`, employeeName: `Worker ${sequence}`, team: "FH3", process: "JOKI", quantity: 1 }] })) };
}

// Exercise the real hook/store actions with in-memory storage; no network, browser session or live financial records.
function harness(initial: Order[]) {
  const state: Record<string, unknown> = { [K.orders]: structuredClone(initial) };
  const writes: string[] = [];
  let isAdmin = true;
  const exported: Partial<Hook> = {};
  runInNewContext(code, {
    exports: exported, crypto, Event, window: { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} },
    require(name: string) {
      if (name === "react") return { useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn(),
        useEffect() {}, useState: (value: unknown) => [value, () => {}] };
      if (name === "@/features/payroll/lib/workspace-store") return {
        getPayrollActor: () => ({ name: "Admin", isAdmin }),
        payrollStorage: { getItem: (key: string) => key in state ? JSON.stringify(state[key]) : null,
          setItem: (key: string, value: string) => { state[key] = JSON.parse(value); writes.push(key); },
          removeItem: (key: string) => { delete state[key]; } },
      };
      if (name === "@/features/payroll/lib/demo-data") return { orders: [] };
      if (name === "./bulk-mutation-actions") return bulkActions;
      if (name === "./bulk-mutation-inventory") return bulkInventory;
      if (name === "./sheet-sync-policy") return syncPolicy;
      if (name === "./daily-orders") return dailyOrders;
      if (name === "./workspace-model") return { workspaceKeys: K };
      throw new Error(`Unexpected isolated dependency: ${name}`);
    },
  });
  return { actions: exported.useDemoOrders!(), state, writes, admin: (value: boolean) => { isAdmin = value; },
    order: () => (state[K.orders] as Order[])[0] };
}
const target = (sequence: number) => ({ orderId: "monthly", dailyId: `sheet-day:${sequence}` });

test("rapid sibling DAY actions read the latest store and never overwrite an earlier DAY completion", () => {
  const initial = parent(), h = harness([initial]);
  const first = h.actions.applyBulkAction([target(1)], "complete", { now });
  assert.deepEqual(first.changedTargetIds, ["monthly::sheet-day:1"]);
  h.actions.applyBulkAction([target(2)], "complete", { now: later });
  const saved = h.order();
  assert.equal(saved.dailyWork![0].verifiedAt, now);
  assert.equal(saved.dailyWork![1].verifiedAt, later);
  assert.deepEqual(saved.dailyWork![2], initial.dailyWork![2]);
  assert.equal(saved.operationalStatus, "partially_completed");
  assert.equal(saved.quantity, initial.quantity);
  assert.equal(saved.grossMinor, initial.grossMinor);
});

test("explicit payroll withdrawal changes only the selected completed DAY using fresh sibling state", () => {
  const h = harness([parent()]);
  h.actions.applyBulkAction([target(1), target(2)], "complete", { now });
  const before = structuredClone(h.order());
  assert.equal(h.actions.withdrawDailyFromPayroll("monthly", "sheet-day:2"), true);
  assert.deepEqual(h.order().dailyWork![0], before.dailyWork![0]);
  assert.deepEqual(h.order().dailyWork![2], before.dailyWork![2]);
  assert.equal(h.order().dailyWork![1].status, "in_progress");
  assert.equal(h.order().dailyWork![1].verifiedAt, undefined);
  assert.equal(h.order().operationalStatus, "partially_completed");
});

test("preview and removed DAY targets never write storage or expand to the remaining package", () => {
  const h = harness([parent()]);
  const preview = h.actions.previewBulkAction([target(2)], "complete", { now });
  assert.deepEqual(preview.changedTargetIds, ["monthly::sheet-day:2"]);
  assert.deepEqual(h.writes, []);
  h.order().dailyWork = h.order().dailyWork!.filter(day => day.sequence !== 2);
  const before = structuredClone(h.state);
  const stale = h.actions.applyBulkAction([target(2)], "complete", { now });
  assert.equal(stale.skipped[0].code, "not_found");
  assert.deepEqual(h.state, before);
  assert.deepEqual(h.writes, []);
});

test("fresh period locks and closed DAY markers reject payroll withdrawal without changing siblings", () => {
  const h = harness([parent()]); h.actions.applyBulkAction([target(2)], "complete", { now });
  h.order().dailyWork![1].payrollPeriodId = "paid-day";
  const before = structuredClone(h.state);
  assert.throws(() => h.actions.withdrawDailyFromPayroll("monthly", "sheet-day:2"), /Tutup Buku/);
  assert.deepEqual(h.state, before);
  h.state[K.lock] = { id: "locked" };
  assert.throws(() => h.actions.withdrawDailyFromPayroll("monthly", "sheet-day:1"), /dikunci/);
  h.admin(false);
  assert.throws(() => h.actions.applyBulkAction([target(1)], "complete", { now }), /Hanya admin/);
});

test("legacy Closing records without DAY markers cannot be withdrawn or repaid", () => {
  const h = harness([parent()]); h.actions.applyBulkAction([target(2)], "complete", { now });
  h.state[K.closings] = [{ id: "legacy-closing", orderRefs: ["x2184"] }];
  const before = structuredClone(h.state);
  assert.throws(() => h.actions.withdrawDailyFromPayroll("monthly", "sheet-day:2"), /Tutup Buku/);
  const repeat = h.actions.applyBulkAction([target(1)], "complete", { now: later });
  assert.equal(repeat.skipped[0].code, "closed");
  assert.deepEqual(h.state, before);
});
