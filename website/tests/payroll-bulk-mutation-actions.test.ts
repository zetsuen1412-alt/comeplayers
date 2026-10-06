import assert from "node:assert/strict";
import { test } from "node:test";
import { applyBulkMutationAction, type BulkMutationAction } from "../features/payroll/lib/bulk-mutation-actions";
import { buildDailyWorkSchedule } from "../features/payroll/lib/daily-orders";
import { validateWorkspaceEdit, workspaceKeys } from "../features/payroll/lib/workspace-model";
import type { Order } from "../features/payroll/types/domain";

const now = "2026-10-06T12:00:00.000Z";
const old = "2026-10-05T12:00:00.000Z";
function order(id: string, patch: Partial<Order> = {}): Order {
  return { id, orderNumber: id, externalReference: id.toUpperCase(), source: "G2G", buyerName: "Buyer",
    orderName: "12 Hours Boosting", orderType: "boosting", game: "AION", service: "Boosting", quantity: 1,
    rateMinor: 320000, grossMinor: 320000, operationalStatus: "assigned", financeStatus: "pending",
    expectedPaymentMinor: 320000, matchedPaymentMinor: 0, orderedAt: old, dueAt: old,
    workerAssignments: [{ id: "assignment", employeeCode: "WORKER", employeeName: "Worker", team: "FH1", process: "Boosting", quantity: 1 }],
    ...patch };
}
function dailyOrder(id: string): Order {
  const base = order(id, { scheduleMode: "daily", scheduleTotalDays: 3, grossMinor: 960000, expectedPaymentMinor: 960000 });
  base.dailyWork = buildDailyWorkSchedule("2026-10-07", 3, base.grossMinor, { workerAssignments: base.workerAssignments });
  return base;
}

test("bulk status actions change selected parents once and preserve all financial/source fields", () => {
  for (const [action, status] of [["problem", "on_hold"], ["process", "assigned"], ["working", "in_progress"]] as const) {
    const selected = order("selected", { operationalStatus: "confirmed", importSourceRow: 5436, rateMinor: 2200, grossMinor: 44000 });
    const other = order("other"); const before = structuredClone([selected, other]);
    const result = applyBulkMutationAction([selected, other], ["selected", "selected"], action, { now });
    assert.deepEqual(result.changedIds, ["selected"]);
    assert.deepEqual(result.orders[0], { ...selected, operationalStatus: status });
    assert.strictEqual(result.orders[1], other);
    assert.deepEqual([selected, other], before);
    assert.equal(result.skipped.length, 0);
  }
});

test("completion stamps one shared clock, preserves previous completion, and repeats without timestamp churn", () => {
  const source = [order("one"), order("two", { completedAt: old })];
  const result = applyBulkMutationAction(source, ["one", "two", "one"], "complete", { now });
  assert.deepEqual(result.changedIds, ["one", "two"]);
  assert.equal(result.orders[0].completedAt, now);
  assert.equal(result.orders[1].completedAt, old);
  assert.equal(result.orders.every(row => row.operationalStatus === "verified" && row.verifiedAt === now), true);
  validateWorkspaceEdit({ [workspaceKeys.orders]: source }, { [workspaceKeys.orders]: result.orders });
  const repeat = applyBulkMutationAction(result.orders, ["one", "two"], "complete", { now: "2026-10-07T12:00:00Z" });
  assert.deepEqual(repeat.changedIds, []);
  assert.deepEqual(repeat.unchangedIds, ["one", "two"]);
  assert.deepEqual(repeat.orders, result.orders);
});

test("already verified parents cannot be withdrawn from payroll through other bulk statuses", () => {
  const source = order("verified", { operationalStatus: "verified", completedAt: old, verifiedAt: old });
  for (const action of ["problem", "process", "working"] as const) {
    const result = applyBulkMutationAction([source], [source.id], action, { now });
    assert.equal(result.skipped[0].code, "verified");
    assert.deepEqual(result.orders, [source]);
  }
});

test("completion safely skips quantity mistakes, missing workers and unconsumed stock without partially consuming anything", () => {
  const valid = order("valid");
  const wrong = order("wrong", { orderType: "gold", orderName: "200M", quantity: 20, process: "MAIL", workerAssignments: [{ ...valid.workerAssignments![0], quantity: 20 }] });
  const missing = order("missing", { workerAssignments: [] });
  const stock = order("stock", { inventoryAllocations: [{ id: "allocation", inventoryStockId: "warehouse", stockType: "gold", game: "AION", itemName: "Gold", locationName: "Warehouse", employeeCode: "WORKER", employeeName: "Worker", team: "FH1", quantity: 1 }] });
  const source = [valid, wrong, missing, stock], snapshot = structuredClone(source);
  const result = applyBulkMutationAction(source, source.map(row => row.id), "complete", { now });
  assert.deepEqual(result.changedIds, ["valid"]);
  assert.deepEqual(result.skipped.map(row => row.code), ["quantity_issue", "no_workers", "inventory"]);
  assert.match(result.skipped[2].reason, /satu per satu/);
  assert.deepEqual(result.orders.slice(1), source.slice(1));
  assert.deepEqual(source, snapshot);
});

test("already consumed stock can complete without consuming it again or changing its allocation", () => {
  const source = order("stock", { inventoryConsumedAt: old, inventoryAllocations: [{ id: "allocation", inventoryStockId: "warehouse", stockType: "gold", game: "AION", itemName: "Gold", locationName: "Warehouse", employeeCode: "WORKER", employeeName: "Worker", team: "FH1", quantity: 1 }] });
  const result = applyBulkMutationAction([source], [source.id], "complete", { now });
  assert.equal(result.changedIds.length, 1);
  assert.equal(result.orders[0].inventoryConsumedAt, old);
  assert.deepEqual(result.orders[0].inventoryAllocations, source.inventoryAllocations);
});

test("daily completion deduplicates parents, verifies only unfinished days and preserves closed financial rows byte for byte", () => {
  const source = dailyOrder("daily");
  source.dailyWork![0] = { ...source.dailyWork![0], status: "verified", completedAt: old, verifiedAt: old, payrollClosedAt: old, payrollPeriodId: "closing" };
  source.operationalStatus = "partially_completed";
  const snapshot = structuredClone(source);
  const result = applyBulkMutationAction([source], [source.id, source.id, source.id], "complete", { now, closingReferences: [source.externalReference] });
  assert.deepEqual(result.changedIds, [source.id]);
  assert.deepEqual(result.orders[0].dailyWork![0], snapshot.dailyWork![0]);
  assert.equal(result.orders[0].dailyWork!.slice(1).every(day => day.status === "verified" && day.verifiedAt === now), true);
  assert.equal(result.orders[0].operationalStatus, "verified");
  assert.equal(result.orders[0].verifiedAt, now);
  assert.equal(result.orders[0].grossMinor, source.grossMinor);
  validateWorkspaceEdit({ [workspaceKeys.orders]: [source] }, { [workspaceKeys.orders]: result.orders });
  assert.deepEqual(source, snapshot);
});

test("daily status changes preserve completed days and update all unfinished days through existing daily semantics", () => {
  for (const [action, status] of [["problem", "on_hold"], ["working", "in_progress"], ["process", "pending"]] as const) {
    const source = dailyOrder("daily");
    source.dailyWork![0] = { ...source.dailyWork![0], status: "verified", verifiedAt: old, completedAt: old };
    source.dailyWork![1].status = "in_progress"; source.dailyWork![2].status = "on_hold";
    source.operationalStatus = "partially_completed";
    const result = applyBulkMutationAction([source], [source.id], action, { now });
    assert.deepEqual(result.orders[0].dailyWork![0], source.dailyWork![0]);
    assert.equal(result.orders[0].dailyWork!.slice(1).every(day => day.status === status), true);
    assert.equal(result.orders[0].operationalStatus, "partially_completed");
    assert.equal(result.orders[0].verifiedAt, undefined);
  }
});

test("daily completion skips the parent if any unfinished day lacks an assignment", () => {
  const source = dailyOrder("daily"); source.workerAssignments = [];
  source.dailyWork![1].workerAssignments = [];
  const result = applyBulkMutationAction([source], [source.id], "complete", { now });
  assert.equal(result.skipped[0].code, "no_workers");
  assert.deepEqual(result.orders, [source]);
});

test("recoverable deletion preserves prices/assignments/provenance and locks only Sheet parents", () => {
  const sheet = order("gsheet:book:MUTASI_FH:5436", { importSourceRow: 5436, rateMinor: 2200, grossMinor: 44000 });
  const manual = order("manual"); const before = structuredClone([sheet, manual]);
  const result = applyBulkMutationAction([sheet, manual], [sheet.id, manual.id], "delete", { now, actorName: "Admin" });
  assert.deepEqual(result.orders[0], { ...sheet, websiteDeletedAt: now, websiteDeletedBy: "Admin", sheetSyncLocked: true });
  assert.deepEqual(result.orders[1], { ...manual, websiteDeletedAt: now, websiteDeletedBy: "Admin" });
  assert.deepEqual(result.changedIds, [sheet.id, manual.id]);
  assert.equal(result.orders.length, 2, "history records are retained instead of physically removed");
  assert.deepEqual([sheet, manual], before);
  const repeat = applyBulkMutationAction(result.orders, [sheet.id, manual.id], "delete", { now: old });
  assert.deepEqual(repeat.changedIds, []); assert.deepEqual(repeat.unchangedIds, [sheet.id, manual.id]);
});

test("deletion preserves every verified, Closing, payment and inventory record, including daily settlements and movement links", () => {
  const variants: Partial<Order>[] = [{ operationalStatus: "verified" }, { verifiedAt: old }, { financeStatus: "closed" },
    { financeStatus: "verified" }, { financeStatus: "reconciled" }, { financeStatus: "ready_to_close" },
    { payrollClosedAt: old }, { payrollPeriodId: "closing" }, { matchedPaymentMinor: 10 }, { inventoryConsumedAt: old },
    { inventoryAllocations: [{ id: "allocation", inventoryStockId: "warehouse", stockType: "gold", game: "AION", itemName: "Gold", locationName: "Warehouse", employeeCode: "WORKER", employeeName: "Worker", team: "FH1", quantity: 1 }] },
    { dailyWork: [{ id: "day", sequence: 1, workDate: "2026-10-07", grossMinor: 320000, status: "verified" }] },
    { dailyWork: [{ id: "day", sequence: 1, workDate: "2026-10-07", grossMinor: 320000, status: "pending", payrollPeriodId: "closing" }] }];
  const source = [...variants.map((patch, i) => order(`protected-${i}`, patch)), order("closing-reference"), order("movement-reference")];
  const result = applyBulkMutationAction(source, source.map(row => row.id), "delete", { now,
    closingReferences: [" Closing-Reference "], inventoryMovementReferences: [" MOVEMENT-reference "] });
  assert.deepEqual(result.changedIds, []);
  assert.equal(result.skipped.length, source.length);
  assert.deepEqual(result.orders, source);
});

test("workspace locks and archived rows cannot be changed by any bulk action", () => {
  const active = order("active"), archived = order("archived", { websiteDeletedAt: old }), sheetArchived = order("sheet-archived", { sheetDeletedAt: old });
  for (const action of ["complete", "delete", "problem", "process", "working"] as const) {
    const source = [active, archived, sheetArchived];
    const locked = applyBulkMutationAction(source, source.map(row => row.id), action, { now, workspaceLocked: true });
    assert.deepEqual(locked.changedIds, []); assert.equal(locked.skipped.length, 3);
    assert.deepEqual(locked.orders, source);
    const archivedResult = applyBulkMutationAction(source, [archived.id, sheetArchived.id], action, { now });
    assert.deepEqual(archivedResult.changedIds, []);
    assert.deepEqual(archivedResult.orders, source);
  }
});

test("missing IDs and unchanged statuses return exact distinct-parent counts without affecting other parents", () => {
  const source = [order("ready"), order("other")];
  const result = applyBulkMutationAction(source, ["missing", "missing", "ready", "ready"], "process", { now });
  assert.deepEqual(result.changedIds, []); assert.deepEqual(result.unchangedIds, ["ready"]);
  assert.deepEqual(result.skipped, [{ orderId: "missing", reference: "missing", code: "not_found", reason: "Pesanan tidak ditemukan; muat ulang Mutasi." }]);
  assert.deepEqual(result.orders, source);
});

test("invalid action/clock or duplicate workspace identities fail before planning any change", () => {
  const source = [order("one"), order("two")], snapshot = structuredClone(source);
  assert.throws(() => applyBulkMutationAction(source, ["one"], "unknown" as BulkMutationAction, { now }), /tidak dikenal/);
  assert.throws(() => applyBulkMutationAction(source, ["one"], "complete", { now: "invalid" }), /Waktu/);
  assert.throws(() => applyBulkMutationAction([source[0], source[0]], ["one"], "complete", { now }), /terduplikat/);
  assert.deepEqual(source, snapshot);
});
