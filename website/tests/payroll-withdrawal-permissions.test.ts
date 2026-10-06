import assert from "node:assert/strict";
import { test } from "node:test";
import { attributeWorkspaceEdit } from "../features/payroll/lib/audit-model";
import { getPayrollEligibleGrossMinor, replaceDailyWorkStatus } from "../features/payroll/lib/daily-orders";
import { buildLivePayrollRows, isPayrollEligible } from "../features/payroll/lib/payroll-live";
import { closeWorkspace, validateWorkspaceEdit, workspaceKeys as K, type WorkspaceState } from "../features/payroll/lib/workspace-model";
import type { Order, OrderDailyWork, OrderWorkerAssignment } from "../features/payroll/types/domain";

const NOW = "2026-10-07T03:00:00.000Z";
const COMPLETED = "2026-10-06T02:00:00.000Z";
const admin = { id: "admin", name: "Admin", isAdmin: true };
const staff = { id: "staff", name: "Staff", isAdmin: false };
function worker(name: string, quantity = 1): OrderWorkerAssignment {
  return { id: `worker-${name}`, employeeCode: name, employeeName: name, team: "FH2", process: "JOKI", quantity };
}
function ordinary(patch: Partial<Order> = {}): Order {
  return { id: "ord-user-withdraw", orderNumber: "WITHDRAW1", externalReference: "WITHDRAW1", source: "G2G",
    game: "AION", orderName: "12 Hours Package", service: "12 Hours Package", orderType: "boosting", process: "JOKI",
    quantity: 1, rateMinor: 320_000, grossMinor: 320_000, expectedPaymentMinor: 320_000, matchedPaymentMinor: 0,
    workerAssignments: [worker("A", 0.5), worker("B", 0.5)], workerShareBps: 6000,
    operationalStatus: "verified", financeStatus: "pending", completedAt: COMPLETED, verifiedAt: NOW,
    orderedAt: "2026-10-01T00:00:00.000Z", dueAt: "2026-10-02T00:00:00.000Z", ...patch };
}
function day(sequence: number, patch: Partial<OrderDailyWork> = {}): OrderDailyWork {
  return { id: `day-${sequence}`, sequence, workDate: `2026-10-${String(sequence + 1).padStart(2, "0")}`,
    quantity: 1, grossMinor: 320_000, rateMinor: 320_000, workerAssignments: [worker(`DAY${sequence}`)],
    status: "verified", completedAt: COMPLETED, verifiedAt: NOW, ...patch };
}
function daily(days = [day(1), day(2)]): Order {
  return ordinary({ id: "ord-user-daily", orderNumber: "WITHDRAW2", externalReference: "WITHDRAW2",
    orderName: "1 Month Package (12 Hours/Day)", service: "1 Month Package (12 Hours/Day)",
    scheduleMode: "daily", scheduleTotalDays: 30, dailyHours: 12, dailyWork: days,
    quantity: days.reduce((sum, row) => sum + (row.quantity ?? 1), 0), grossMinor: days.reduce((sum, row) => sum + row.grossMinor, 0),
    expectedPaymentMinor: days.reduce((sum, row) => sum + row.grossMinor, 0),
    operationalStatus: "partially_completed", verifiedAt: undefined, completedAt: undefined });
}
function state(order: Order, extra: WorkspaceState = {}): WorkspaceState {
  return { [K.orders]: [order], [K.closings]: [], ...extra };
}
function locked(order: Order, extra: WorkspaceState = {}) {
  return state(order, { [K.lock]: { id: "lock", from: "2026-10-07T00:00", to: "2026-10-07T23:59", lockedAt: NOW, lockedBy: "Admin" }, ...extra });
}
function expectForbidden(action: () => unknown) {
  assert.throws(action, (error: unknown) => error instanceof Error && (error as Error & { status: number }).status === 403);
}

test("admin ordinary withdrawal removes the whole order's salary shares and preserves completion, stock and payment records", () => {
  const source = ordinary({ matchedPaymentMinor: 100_000, inventoryConsumedAt: COMPLETED, financeStatus: "reconciled" });
  const before = structuredClone(source);
  const changed = { ...source, operationalStatus: "completed" as const, verifiedAt: undefined };
  expectForbidden(() => attributeWorkspaceEdit(state(source), state(changed), staff, NOW));
  const attributed = attributeWorkspaceEdit(state(source), state(changed), admin, NOW);
  assert.doesNotThrow(() => validateWorkspaceEdit(state(source), attributed));
  const current = (attributed[K.orders] as Order[])[0];
  assert.equal(current.completedAt, COMPLETED);
  for (const key of ["rateMinor", "grossMinor", "quantity", "workerAssignments", "workerShareBps", "inventoryConsumedAt", "matchedPaymentMinor", "financeStatus"] as const) {
    assert.deepEqual(current[key], source[key]);
  }
  assert.deepEqual(buildLivePayrollRows([source]).map(row => row.employee), ["A", "B"]);
  assert.deepEqual(buildLivePayrollRows([current]), []);
  assert.deepEqual(source, before);
});

test("sparse DAY withdrawal requires admin even when parent status and verification clocks stay unchanged", () => {
  const source = daily(Array.from({ length: 17 }, (_, index) => day(index + 1, index > 1
    ? { status: "pending", completedAt: undefined, verifiedAt: undefined } : {})));
  const before = structuredClone(source);
  const changed = { ...source, ...replaceDailyWorkStatus(source, "day-2", "in_progress", NOW) };
  assert.equal(changed.operationalStatus, source.operationalStatus);
  assert.equal(changed.verifiedAt, source.verifiedAt);
  assert.equal(changed.completedAt, source.completedAt);
  expectForbidden(() => attributeWorkspaceEdit(state(source), state(changed), staff, NOW));
  const attributed = attributeWorkspaceEdit(state(source), state(changed), admin, NOW);
  assert.doesNotThrow(() => validateWorkspaceEdit(state(source), attributed));
  const current = (attributed[K.orders] as Order[])[0];
  assert.deepEqual(current.dailyWork![0], source.dailyWork![0]);
  assert.equal(current.dailyWork![1].status, "in_progress");
  assert.equal(current.dailyWork![1].verifiedAt, undefined);
  assert.equal(current.dailyWork![1].completedAt, undefined);
  assert.deepEqual(buildLivePayrollRows([current]).map(row => row.employee), ["DAY1"]);
  assert.deepEqual(source, before);
});

test("staff cannot verify an existing DAY or append a verified DAY without changing parent clocks", () => {
  const pending = day(2, { status: "pending", completedAt: undefined, verifiedAt: undefined });
  const source = daily([day(1), pending]);
  const changed = { ...source, ...replaceDailyWorkStatus(source, pending.id, "verified", NOW) };
  expectForbidden(() => attributeWorkspaceEdit(state(source), state(changed), staff, NOW));
  const appended = { ...source, dailyWork: [...source.dailyWork!, day(3)] };
  expectForbidden(() => attributeWorkspaceEdit(state(source), state(appended), staff, NOW));
  const attributed = attributeWorkspaceEdit(state(source), state(changed), admin, NOW);
  assert.doesNotThrow(() => validateWorkspaceEdit(state(source), attributed));
});

test("staff cannot erase or reidentify a verified DAY or remove its parent to bypass verification permissions", () => {
  const source = daily();
  for (const rows of [[source.dailyWork![0]], [{ ...source.dailyWork![0], id: "replacement" }, source.dailyWork![1]], []]) {
    expectForbidden(() => attributeWorkspaceEdit(state(source), state({ ...source, dailyWork: rows }), staff, NOW));
  }
  expectForbidden(() => attributeWorkspaceEdit(state(source), { ...state(source), [K.orders]: [] }, staff, NOW));
});

test("staff cannot forge DAY verification or paid markers and may still update unfinished DAY work", () => {
  const pending = day(2, { status: "pending", completedAt: undefined, verifiedAt: undefined });
  const source = daily([day(1), pending]);
  for (const marker of [{ verifiedAt: NOW }, { payrollClosedAt: NOW }, { payrollPeriodId: "forged" }]) {
    const changed = { ...source, dailyWork: [source.dailyWork![0], { ...pending, ...marker }] };
    expectForbidden(() => attributeWorkspaceEdit(state(source), state(changed), staff, NOW));
  }
  const changed = { ...source, ...replaceDailyWorkStatus(source, pending.id, "in_progress", NOW) };
  const attributed = attributeWorkspaceEdit(state(source), state(changed), staff, NOW);
  assert.doesNotThrow(() => validateWorkspaceEdit(state(source), attributed));
  assert.deepEqual((attributed[K.orders] as Order[])[0].dailyWork![0], source.dailyWork![0]);
});

test("parent paid timestamp, period-only and finance-closed states are frozen and never counted or repaid", () => {
  for (const base of [ordinary(), daily()]) for (const marker of [{ payrollClosedAt: NOW }, { payrollPeriodId: "paid-parent" }, { financeStatus: "closed" as const }]) {
    const source = { ...base, ...marker };
    assert.equal(getPayrollEligibleGrossMinor(source), 0);
    assert.equal(isPayrollEligible(source), false);
    assert.deepEqual(buildLivePayrollRows([source]), []);
    assert.equal(isPayrollEligible(source, true), true);
    assert.throws(() => closeWorkspace(locked(source), NOW), /Tidak ada order atau pekerjaan harian selesai/);
    const changed = { ...source, operationalStatus: "completed" as const, verifiedAt: undefined,
      dailyWork: source.dailyWork?.map(row => ({ ...row, status: "in_progress" as const, verifiedAt: undefined, completedAt: undefined })) };
    assert.throws(() => validateWorkspaceEdit(state(source), state(changed)), /Order yang sudah Closing/);
    assert.throws(() => validateWorkspaceEdit(state(source), { ...state(source), [K.orders]: [] }), /Order yang sudah Closing/);
    assert.doesNotThrow(() => validateWorkspaceEdit(state(source), state(structuredClone(source))));
  }
});

test("Closing skips a marker-only paid parent while another unpaid DAY remains eligible", () => {
  const paid = ordinary({ payrollPeriodId: "paid-parent" });
  const open = daily([day(1)]);
  const previous = locked(paid, { [K.orders]: [paid, open] });
  const result = closeWorkspace(previous, NOW);
  assert.deepEqual(result.record.orderRefs, [open.externalReference]);
  assert.equal(result.record.totalOrderMinor, 320_000);
  assert.deepEqual((result.state[K.orders] as Order[])[0], paid);
});

test("explicit partial Closing allows unpaid sibling withdrawal but blocks paid DAY and legacy whole-order references", () => {
  const paid = day(1, { payrollPeriodId: "partial-period", payrollClosedAt: NOW });
  const source = daily([paid, day(2)]);
  const closing = { id: "partial-period", orderRefs: [source.externalReference] };
  const previous = state(source, { [K.closings]: [closing] });
  const changed = { ...source, ...replaceDailyWorkStatus(source, "day-2", "in_progress", NOW) };
  const attributed = attributeWorkspaceEdit(previous, { ...previous, [K.orders]: [changed] }, admin, NOW);
  assert.doesNotThrow(() => validateWorkspaceEdit(previous, attributed));
  assert.deepEqual((attributed[K.orders] as Order[])[0].dailyWork![0], paid);
  assert.throws(() => replaceDailyWorkStatus(source, paid.id, "in_progress", NOW), /Tutup Buku/);
  const forgedPaid = { ...source, dailyWork: [{ ...paid, status: "in_progress" as const, verifiedAt: undefined }, source.dailyWork![1]] };
  assert.throws(() => validateWorkspaceEdit(previous, { ...previous, [K.orders]: [forgedPaid] }), /sudah masuk Closing/);
  const legacy = daily();
  for (const record of [{ id: "old", orderRefs: [" withdraw2 "] }, { id: "old", ordersSnapshot: [{ externalReference: " withdraw2 " }] }]) {
    const oldState = state(legacy, { [K.closings]: [record] });
    const next = { ...legacy, ...replaceDailyWorkStatus(legacy, "day-2", "in_progress", NOW) };
    assert.throws(() => validateWorkspaceEdit(oldState, { ...oldState, [K.orders]: [next] }), /Closing lama/);
  }
});

test("server period locks reject withdrawal even for an authenticated admin", () => {
  const source = ordinary();
  const previous = locked(source);
  const changed = { ...source, operationalStatus: "completed" as const, verifiedAt: undefined };
  const attributed = attributeWorkspaceEdit(previous, { ...previous, [K.orders]: [changed] }, admin, NOW);
  assert.throws(() => validateWorkspaceEdit(previous, attributed), /Sistem dikunci/);
});
