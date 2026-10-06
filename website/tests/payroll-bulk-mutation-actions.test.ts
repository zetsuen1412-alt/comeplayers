import assert from "node:assert/strict";
import { test } from "node:test";
import { applyBulkMutationAction, bulkMutationTargetId, type BulkMutationAction } from "../features/payroll/lib/bulk-mutation-actions";
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

test("daily completion targets one DAY and preserves closed and unselected sibling days byte for byte", () => {
  const source = dailyOrder("daily");
  source.dailyWork![0] = { ...source.dailyWork![0], status: "verified", completedAt: old, verifiedAt: old, payrollClosedAt: old, payrollPeriodId: "closing" };
  source.operationalStatus = "partially_completed";
  const snapshot = structuredClone(source);
  const target = { orderId: source.id, dailyId: source.dailyWork![1].id };
  const result = applyBulkMutationAction([source], [target, target], "complete", { now, closingReferences: [source.externalReference] });
  assert.deepEqual(result.changedIds, [source.id]);
  assert.deepEqual(result.changedTargetIds, [bulkMutationTargetId(target)]);
  assert.deepEqual(result.orders[0].dailyWork![0], snapshot.dailyWork![0]);
  assert.equal(result.orders[0].dailyWork![1].status, "verified");
  assert.equal(result.orders[0].dailyWork![1].verifiedAt, now);
  assert.deepEqual(result.orders[0].dailyWork![2], snapshot.dailyWork![2]);
  assert.equal(result.orders[0].operationalStatus, "partially_completed");
  assert.equal(result.orders[0].verifiedAt, undefined);
  assert.equal(result.orders[0].grossMinor, source.grossMinor);
  validateWorkspaceEdit({ [workspaceKeys.orders]: [source] }, { [workspaceKeys.orders]: result.orders });
  assert.deepEqual(source, snapshot);
});

test("daily status actions affect only the selected DAY and leave completed and other unfinished DAYs untouched", () => {
  for (const [action, status] of [["problem", "on_hold"], ["working", "in_progress"], ["process", "pending"]] as const) {
    const source = dailyOrder("daily");
    source.dailyWork![0] = { ...source.dailyWork![0], status: "verified", verifiedAt: old, completedAt: old };
    source.dailyWork![1].status = "in_progress"; source.dailyWork![2].status = "on_hold";
    source.operationalStatus = "partially_completed";
    source.dailyWork![1].status = "pending";
    const result = applyBulkMutationAction([source], [{ orderId: source.id, dailyId: source.dailyWork![2].id }], action, { now });
    assert.deepEqual(result.orders[0].dailyWork![0], source.dailyWork![0]);
    assert.deepEqual(result.orders[0].dailyWork![1], source.dailyWork![1]);
    assert.equal(result.orders[0].dailyWork![2].status, status);
    assert.equal(result.orders[0].operationalStatus, "partially_completed");
    assert.equal(result.orders[0].verifiedAt, undefined);
  }
});

test("an unassigned sibling does not block a selected assigned DAY, and explicit empty DAY workers never inherit the parent", () => {
  const source = dailyOrder("daily"); source.workerAssignments = [];
  source.dailyWork![1].workerAssignments = [];
  const target = (index: number) => ({ orderId: source.id, dailyId: source.dailyWork![index].id });
  const valid = applyBulkMutationAction([source], [target(0)], "complete", { now });
  assert.equal(valid.orders[0].dailyWork![0].status, "verified");
  assert.deepEqual(valid.orders[0].dailyWork!.slice(1), source.dailyWork!.slice(1));
  source.workerAssignments = order("parent").workerAssignments;
  const result = applyBulkMutationAction([source], [target(1)], "complete", { now });
  assert.equal(result.skipped[0].code, "no_workers");
  assert.deepEqual(result.orders, [source]);
});

test("a parent-only daily selection never expands to sibling days for any action", () => {
  const source = dailyOrder("daily");
  for (const action of ["complete", "problem", "process", "working", "delete"] as const) {
    const result = applyBulkMutationAction([source], [source.id], action, { now });
    assert.equal(result.skipped[0].code, "day_required");
    assert.deepEqual(result.changedTargetIds, []);
    assert.strictEqual(result.orders[0], source);
  }
});

test("mixed DAY targets accumulate on one parent while counts retain each selected DAY", () => {
  const source = dailyOrder("monthly"); source.scheduleTotalDays = 30;
  const target = (index: number) => ({ orderId: source.id, dailyId: source.dailyWork![index].id });
  const selected = [target(0), target(2), target(0)];
  const result = applyBulkMutationAction([source], selected, "complete", { now });
  assert.deepEqual(result.changedIds, [source.id]);
  assert.deepEqual(result.changedTargetIds, [bulkMutationTargetId(target(0)), bulkMutationTargetId(target(2))]);
  assert.equal(result.orders[0].dailyWork![0].status, "verified");
  assert.equal(result.orders[0].dailyWork![2].status, "verified");
  assert.strictEqual(result.orders[0].dailyWork![1], source.dailyWork![1]);
  assert.equal(result.orders[0].operationalStatus, "partially_completed");
  const repeated = applyBulkMutationAction(result.orders, selected, "complete", { now: old });
  assert.deepEqual(repeated.changedTargetIds, []);
  assert.deepEqual(repeated.unchangedTargetIds, result.changedTargetIds);
  assert.deepEqual(repeated.orders, result.orders);
});

test("selected closed and already verified DAYs stay unchanged while an open sibling completes", () => {
  const source = dailyOrder("daily");
  source.dailyWork![0] = { ...source.dailyWork![0], status: "verified", verifiedAt: old, completedAt: old, payrollPeriodId: "closing" };
  source.dailyWork![1] = { ...source.dailyWork![1], status: "verified", verifiedAt: old, completedAt: old };
  const targets = source.dailyWork!.map(day => ({ orderId: source.id, dailyId: day.id }));
  const result = applyBulkMutationAction([source], targets, "complete", { now });
  assert.deepEqual(result.changedTargetIds, [bulkMutationTargetId(targets[2])]);
  assert.deepEqual(result.unchangedTargetIds, [bulkMutationTargetId(targets[1])]);
  assert.equal(result.skipped[0].dailyId, targets[0].dailyId);
  assert.equal(result.skipped[0].reference, "DAILY · Hari 1");
  assert.equal(result.skipped[0].code, "closed");
  assert.deepEqual(result.orders[0].dailyWork!.slice(0, 2), source.dailyWork!.slice(0, 2));
});

test("legacy whole-package Closing references cannot repay DAYs while explicit partial Closing leaves siblings open", () => {
  const source = dailyOrder("daily");
  const target = { orderId: source.id, dailyId: source.dailyWork![1].id };
  const blocked = applyBulkMutationAction([source], [target], "complete", { now, closingReferences: [" DAILY "] });
  assert.equal(blocked.skipped[0].code, "closed");
  assert.strictEqual(blocked.orders[0], source);
  const partial = { ...source, dailyWork: source.dailyWork!.map((day, index) => index === 0
    ? { ...day, status: "verified" as const, verifiedAt: old, payrollPeriodId: "old-closing" } : day) };
  const allowed = applyBulkMutationAction([partial], [target], "complete", { now, closingReferences: ["daily"] });
  assert.equal(allowed.changedTargetIds.length, 1);
  assert.equal(allowed.orders[0].dailyWork![1].status, "verified");
  assert.deepEqual(allowed.orders[0].dailyWork![0], partial.dailyWork![0]);
  assert.deepEqual(allowed.orders[0].dailyWork![2], partial.dailyWork![2]);
});

test("a stale or cross-order DAY target cannot fall back to the parent", () => {
  const source = dailyOrder("daily"), ordinary = order("ordinary");
  const result = applyBulkMutationAction([source, ordinary], [
    { orderId: source.id, dailyId: "missing" }, { orderId: ordinary.id, dailyId: source.dailyWork![0].id },
  ], "complete", { now });
  assert.deepEqual(result.skipped.map(row => row.code), ["not_found", "not_found"]);
  assert.deepEqual(result.changedTargetIds, []);
  assert.deepEqual(result.orders, [source, ordinary]);
});

test("DAY deletion never archives its parent or silently deletes other DAYs", () => {
  const source = dailyOrder("daily");
  const result = applyBulkMutationAction([source], [{ orderId: source.id, dailyId: source.dailyWork![1].id }], "delete", { now });
  assert.equal(result.skipped[0].code, "daily_delete");
  assert.strictEqual(result.orders[0], source);
  assert.deepEqual(result.changedTargetIds, []);
});

test("a per-DAY action cannot consume the entire shared parent stock budget", () => {
  const source = dailyOrder("daily");
  source.inventoryAllocations = order("stock", { inventoryAllocations: [{ id: "allocation", inventoryStockId: "warehouse", stockType: "gold", game: "AION", itemName: "Gold", locationName: "Warehouse", employeeCode: "WORKER", employeeName: "Worker", team: "FH1", quantity: 1 }] }).inventoryAllocations;
  const target = { orderId: source.id, dailyId: source.dailyWork![1].id };
  const result = applyBulkMutationAction([source], [target], "complete", { now, stockCompletionOrderIds: [source.id] });
  assert.equal(result.skipped[0].code, "daily_inventory");
  assert.strictEqual(result.orders[0], source);
  const consumed = { ...source, inventoryConsumedAt: old };
  const accepted = applyBulkMutationAction([consumed], [target], "complete", { now });
  assert.equal(accepted.orders[0].dailyWork![1].status, "verified");
  assert.equal(accepted.orders[0].inventoryConsumedAt, old);
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
