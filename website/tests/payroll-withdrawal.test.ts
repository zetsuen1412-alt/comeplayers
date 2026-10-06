import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPayrollWithdrawal } from "../features/payroll/lib/payroll-withdrawal";
import { applyBulkMutationAction } from "../features/payroll/lib/bulk-mutation-actions";
import { buildLivePayrollRows } from "../features/payroll/lib/payroll-live";
import { validateWorkspaceEdit, workspaceKeys as K, type WorkspaceState } from "../features/payroll/lib/workspace-model";
import type { Order, OrderDailyWork, OrderWorkerAssignment } from "../features/payroll/types/domain";

const COMPLETED = "2026-10-06T03:00:00.000Z";
const VERIFIED = "2026-10-07T03:00:00.000Z";
const REVERIFIED = "2026-10-07T04:00:00.000Z";

function worker(name: string, quantity = 1): OrderWorkerAssignment {
  return { id: `assignment-${name}`, employeeCode: name, employeeName: name, team: "FH1", process: "JOKI", quantity };
}
function order(id: string, patch: Partial<Order> = {}): Order {
  return { id, orderNumber: id.toUpperCase(), externalReference: id.toUpperCase(), source: "G2G",
    buyerName: "Buyer", game: "AION", orderName: "12 Hours Package", service: "Boosting", process: "JOKI",
    orderType: "boosting", quantity: 1, grossMinor: 320_000, rateMinor: 320_000,
    workerAssignments: [worker(id)], operationalStatus: "verified", financeStatus: "pending",
    expectedPaymentMinor: 320_000, matchedPaymentMinor: 0, orderedAt: COMPLETED, dueAt: VERIFIED,
    completedAt: COMPLETED, verifiedAt: VERIFIED, ...patch };
}
function day(parent: string, sequence: number, name: string, patch: Partial<OrderDailyWork> = {}): OrderDailyWork {
  return { id: `${parent}-day-${sequence}`, sequence, workDate: `2026-10-${String(sequence + 1).padStart(2, "0")}`,
    quantity: 1, grossMinor: 320_000, rateMinor: 320_000, status: "verified", hours: 12,
    completedAt: COMPLETED, verifiedAt: VERIFIED, workerAssignments: [worker(name)], ...patch };
}
function daily(id: string, days = [day(id, 1, "DAY1"), day(id, 2, "DAY2"), day(id, 3, "DAY3")], totalDays = 30): Order {
  return order(id, { scheduleMode: "daily", scheduleTotalDays: totalDays, dailyHours: 12,
    orderName: "1 Month Package (12 Hours/Day)", dailyWork: days, operationalStatus: "partially_completed",
    quantity: days.reduce((sum, value) => sum + (value.quantity ?? 1), 0),
    grossMinor: days.reduce((sum, value) => sum + value.grossMinor, 0),
    expectedPaymentMinor: days.reduce((sum, value) => sum + value.grossMinor, 0),
    workerAssignments: [worker("PARENT", 30)], completedAt: undefined, verifiedAt: undefined });
}
function state(orders: Order[], closings: unknown[] = []): WorkspaceState {
  return { [K.orders]: orders, [K.closings]: closings };
}
function assertRejected(source: Order[], target: { orderId: string; dailyId?: string }, context = {}) {
  const snapshot = structuredClone(source);
  assert.throws(() => applyPayrollWithdrawal(source, target, context));
  assert.deepEqual(source, snapshot);
}

test("withdrawing one shared-worker order removes its contribution for every worker and preserves other orders", () => {
  const selected = order("shared", { workerAssignments: [worker("A", 0.5), worker("B", 0.5)],
    importSourceRow: 6000, sheetSyncLocked: true, sheetSyncLockedAt: COMPLETED, sheetSyncLockedBy: "Admin" });
  const other = order("other", { workerAssignments: [worker("C")] });
  const source = [selected, other], before = structuredClone(source);
  assert.deepEqual(buildLivePayrollRows(source).map(row => row.employee), ["A", "B", "C"]);
  const result = applyPayrollWithdrawal(source, { orderId: selected.id });
  assert.equal(result.changed, true);
  assert.equal(result.orderReference, "SHARED");
  assert.equal(result.nextStatus, "completed");
  assert.deepEqual(result.affectedWorkers.map(value => value.employeeCode).sort(), ["A", "B"]);
  assert.deepEqual(result.orders[0], { ...selected, operationalStatus: "completed", verifiedAt: undefined });
  assert.strictEqual(result.orders[1], other);
  assert.deepEqual(buildLivePayrollRows(result.orders), buildLivePayrollRows([other]));
  assert.deepEqual(source, before);
  assert.doesNotThrow(() => validateWorkspaceEdit(state(source), state(result.orders)));
});

test("withdrawing one DAY preserves paid and verified siblings, source rates and the package amount", () => {
  const id = "monthly";
  const paid = day(id, 1, "PAID", { payrollClosedAt: COMPLETED, payrollPeriodId: "closing-old" });
  const chosen = day(id, 2, "A", { quantity: 2, grossMinor: 640_000, workerAssignments: [worker("A", 0.5), worker("B", 1.5)] });
  const unpaid = day(id, 3, "STILL-PAYABLE");
  const pending = day(id, 4, "FUTURE", { status: "pending", completedAt: undefined, verifiedAt: undefined });
  const selected = daily(id, [paid, chosen, unpaid, pending]), other = order("other");
  const source = [selected, other], before = structuredClone(source);
  const closings = [{ id: "closing-old", orderRefs: ["MONTHLY"] }];
  const result = applyPayrollWithdrawal(source, { orderId: id, dailyId: chosen.id }, { closingReferences: [" monthly "] });
  assert.equal(result.changed, true);
  assert.equal(result.nextStatus, "in_progress");
  assert.deepEqual(result.affectedWorkers.map(value => value.employeeCode).sort(), ["A", "B"]);
  assert.deepEqual(result.orders[0].dailyWork![1], { ...chosen, status: "in_progress", completedAt: undefined, verifiedAt: undefined });
  for (const index of [0, 2, 3]) assert.strictEqual(result.orders[0].dailyWork![index], selected.dailyWork![index]);
  assert.strictEqual(result.orders[1], other);
  assert.equal(result.orders[0].operationalStatus, "partially_completed");
  assert.equal(result.orders[0].grossMinor, selected.grossMinor);
  assert.equal(result.orders[0].quantity, selected.quantity);
  assert.equal(result.orders[0].rateMinor, selected.rateMinor);
  assert.equal(result.orders[0].expectedPaymentMinor, selected.expectedPaymentMinor);
  const salary = buildLivePayrollRows(result.orders);
  assert.equal(salary.length, 2);
  for (const name of ["STILL-PAYABLE", "other"]) {
    const row = salary.find(value => value.employee === name)!;
    assert.equal(row.gross, 320_000); assert.equal(row.units, 1);
  }
  assert.deepEqual(source, before);
  assert.doesNotThrow(() => validateWorkspaceEdit(state(source, closings), state(result.orders, closings)));
});

test("withdrawing from a completely verified package clears parent verification without unfinishing its other DAYs", () => {
  const source = daily("full", undefined, 3);
  source.operationalStatus = "verified"; source.completedAt = COMPLETED; source.verifiedAt = VERIFIED;
  const result = applyPayrollWithdrawal([source], { orderId: source.id, dailyId: source.dailyWork![1].id });
  assert.equal(result.orders[0].operationalStatus, "partially_completed");
  assert.equal(result.orders[0].completedAt, undefined);
  assert.equal(result.orders[0].verifiedAt, undefined);
  assert.strictEqual(result.orders[0].dailyWork![0], source.dailyWork![0]);
  assert.strictEqual(result.orders[0].dailyWork![2], source.dailyWork![2]);
  assert.deepEqual(buildLivePayrollRows(result.orders).map(row => [row.employee, row.gross]), [["DAY1", 320_000], ["DAY3", 320_000]]);
  assert.doesNotThrow(() => validateWorkspaceEdit(state([source]), state(result.orders)));
});

test("repeating withdrawal and targeting an already unfinished item are noops without changing clocks or source objects", () => {
  for (const selected of [order("single"), daily("monthly")]) {
    const target = { orderId: selected.id, ...(selected.dailyWork ? { dailyId: selected.dailyWork[1].id } : {}) };
    const first = applyPayrollWithdrawal([selected], target);
    const repeat = applyPayrollWithdrawal(first.orders, target);
    assert.equal(repeat.changed, false);
    assert.strictEqual(repeat.orders[0], first.orders[0]);
    assert.deepEqual(repeat.orders, first.orders);
  }
  for (const status of ["completed", "in_progress", "assigned", "on_hold", "cancelled"] as const) {
    const selected = order("unfinished", { operationalStatus: status, verifiedAt: undefined });
    const result = applyPayrollWithdrawal([selected], { orderId: selected.id });
    assert.equal(result.changed, false);
    assert.strictEqual(result.orders[0], selected);
    assert.equal(result.orders[0].completedAt, COMPLETED);
  }
});

test("withdrawal preserves payments, financial approval, consumed stock and source-lock metadata", () => {
  const allocation = { id: "allocation", inventoryStockId: "warehouse", stockType: "gold" as const, game: "AION",
    itemName: "Gold", locationName: "Warehouse", employeeCode: "A", employeeName: "A", team: "FH1" as const, quantity: 1 };
  for (const inventoryConsumedAt of [COMPLETED, undefined]) {
    const source = order("stock", { financeStatus: "reconciled", matchedPaymentMinor: 320_000,
      inventoryAllocations: [allocation], inventoryConsumedAt,
      sheetSyncLocked: true, sheetSyncLockedAt: COMPLETED, sheetSyncLockedBy: "Admin" });
    const snapshot = structuredClone(source);
    const result = applyPayrollWithdrawal([source], { orderId: source.id });
    assert.deepEqual(result.orders[0], { ...source, operationalStatus: "completed", verifiedAt: undefined });
    assert.strictEqual(result.orders[0].inventoryAllocations, source.inventoryAllocations);
    assert.deepEqual(source, snapshot);
    assert.doesNotThrow(() => validateWorkspaceEdit(state([source]), state(result.orders)));
  }
});

test("reverification returns only the corrected item to payroll and never consumes stock a second time", () => {
  const source = order("corrected", { inventoryConsumedAt: COMPLETED, matchedPaymentMinor: 320_000,
    inventoryAllocations: [{ id: "allocation", inventoryStockId: "warehouse", stockType: "gold", game: "AION",
      itemName: "Gold", locationName: "Warehouse", employeeCode: "A", employeeName: "A", team: "FH1", quantity: 1 }] });
  const withdrawn = applyPayrollWithdrawal([source], { orderId: source.id });
  assert.deepEqual(buildLivePayrollRows(withdrawn.orders), []);
  const completed = applyBulkMutationAction(withdrawn.orders, [source.id], "complete", { now: REVERIFIED });
  assert.equal(completed.orders[0].inventoryConsumedAt, COMPLETED);
  assert.equal(completed.orders[0].completedAt, COMPLETED);
  assert.equal(completed.orders[0].verifiedAt, REVERIFIED);
  assert.equal(completed.orders[0].matchedPaymentMinor, source.matchedPaymentMinor);
  assert.deepEqual(completed.orders[0].inventoryAllocations, source.inventoryAllocations);
  assert.deepEqual(buildLivePayrollRows(completed.orders), buildLivePayrollRows([source]));
});

test("workspace locks, both archive types and all parent Closing markers reject withdrawal atomically", () => {
  const single = order("protected");
  assertRejected([single], { orderId: single.id }, { workspaceLocked: true });
  for (const patch of [{ sheetDeletedAt: VERIFIED }, { websiteDeletedAt: VERIFIED, websiteDeletedBy: "Admin" },
    { payrollClosedAt: VERIFIED }, { payrollPeriodId: "closed-period" }, { financeStatus: "closed" as const }]) {
    for (const selected of [order("protected", patch), { ...daily("protected"), ...patch }]) {
      assertRejected([selected], { orderId: selected.id, ...(selected.dailyWork ? { dailyId: selected.dailyWork[1].id } : {}) });
    }
  }
});

test("a closed selected DAY cannot be withdrawn even when an unfinished sibling remains open", () => {
  for (const marker of [{ payrollClosedAt: VERIFIED }, { payrollPeriodId: "closed-period" }]) {
    const selected = daily("closed", [day("closed", 1, "PAID", marker), day("closed", 2, "OPEN")]);
    assertRejected([selected], { orderId: selected.id, dailyId: selected.dailyWork![0].id });
  }
});

test("legacy whole-order Closing references protect ordinary and daily items without relying on parent markers", () => {
  for (const selected of [order("legacy"), daily("legacy")]) {
    assertRejected([selected], { orderId: selected.id, ...(selected.dailyWork ? { dailyId: selected.dailyWork[1].id } : {}) },
      { closingReferences: [" unrelated ", " legacy "] });
  }
});

test("missing, removed and cross-parent DAY targets never fall back to withdrawing the package", () => {
  const a = daily("first"), b = daily("second"), single = order("single");
  for (const target of [{ orderId: "missing" }, { orderId: a.id }, { orderId: a.id, dailyId: "removed-day" },
    { orderId: a.id, dailyId: b.dailyWork![1].id }, { orderId: single.id, dailyId: a.dailyWork![1].id }]) {
    assertRejected([a, b, single], target);
  }
});

test("duplicate parent or selected DAY identities reject the operation before any mutation", () => {
  const single = order("ambiguous");
  assertRejected([single, { ...single, externalReference: "OTHER" }], { orderId: single.id });
  const selected = daily("duplicate");
  selected.dailyWork![2] = { ...selected.dailyWork![2], id: selected.dailyWork![1].id };
  assertRejected([selected], { orderId: selected.id, dailyId: selected.dailyWork![1].id });
});
