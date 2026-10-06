import assert from "node:assert/strict";
import { test } from "node:test";
import { planBulkMutationInventory } from "../features/payroll/lib/bulk-mutation-inventory";
import { applyBulkMutationAction } from "../features/payroll/lib/bulk-mutation-actions";
import { validateWorkspaceEdit, workspaceKeys } from "../features/payroll/lib/workspace-model";
import type { InventoryMovement, InventoryStock, Order, OrderInventoryAllocation } from "../features/payroll/types/domain";

const now = "2026-10-06T12:00:00.000Z", context = { now, batchId: "batch-uuid" };
function stock(id = "stock", quantity = 10): InventoryStock {
  return { id, stockType: "gold", game: "AION", itemName: "Gold", locationName: "", employeeCode: "W", employeeName: "Worker", team: "FH1", onHand: quantity, reserved: quantity, sold: 0 };
}
function allocation(id: string, quantity: number): OrderInventoryAllocation {
  return { id: `allocation-${id}`, inventoryStockId: id, stockType: "gold", game: "AION", itemName: "Gold", locationName: "", employeeCode: "W", employeeName: "Worker", team: "FH1", quantity };
}
function order(id: string, quantity: number, allocations = [allocation("stock", quantity)]): Order {
  return { id, orderNumber: id, externalReference: id.toUpperCase(), source: "DIRECT", orderType: "gold", game: "AION", service: "Gold", quantity,
    rateMinor: 2200, grossMinor: quantity * 2200, expectedPaymentMinor: quantity * 2200, matchedPaymentMinor: 0,
    operationalStatus: "assigned", financeStatus: "pending", orderedAt: now, dueAt: now,
    workerAssignments: [{ id: "worker", employeeCode: "W", employeeName: "Worker", team: "FH1", process: "MAIL", quantity }], inventoryAllocations: allocations };
}

test("shared stock completion aggregates accepted parents, deduplicates daily parent selections and records unique per-order movements", () => {
  const inventory = [stock()], parents = [order("one", 3), order("two", 4)];
  const before = structuredClone({ inventory, parents });
  const plan = planBulkMutationInventory(inventory, [], [parents[0], parents[1], parents[0]], context);
  assert.deepEqual(plan.stockCompletionOrderIds, ["one", "two"]);
  assert.deepEqual(plan.inventory[0], { ...inventory[0], onHand: 3, reserved: 3, sold: 7 });
  assert.deepEqual(plan.movements.map(row => [row.orderReference, row.quantity, row.rateMinor, row.occurredAt]), [["ONE", 3, 2200, now], ["TWO", 4, 2200, now]]);
  assert.equal(new Set(plan.movements.map(row => row.id)).size, 2);
  const done = applyBulkMutationAction(parents, parents.map(row => row.id), "complete", { now, stockCompletionOrderIds: plan.stockCompletionOrderIds });
  assert.deepEqual(done.changedIds, ["one", "two"]);
  assert.equal(done.orders.every(row => row.operationalStatus === "verified" && row.inventoryConsumedAt === now), true);
  validateWorkspaceEdit({ [workspaceKeys.orders]: parents, [workspaceKeys.inventory]: inventory, [workspaceKeys.movements]: [] },
    { [workspaceKeys.orders]: done.orders, [workspaceKeys.inventory]: plan.inventory, [workspaceKeys.movements]: plan.movements });
  assert.deepEqual({ inventory, parents }, before);
});

test("a shortage rejects only its whole parent and consumes no stock, leaving a later smaller order feasible", () => {
  const inventory = [stock()], parents = [order("first", 6), order("too-large", 5), order("small", 2)];
  const plan = planBulkMutationInventory(inventory, [], parents, context);
  assert.deepEqual(plan.stockCompletionOrderIds, ["first", "small"]);
  assert.deepEqual(plan.skipped.map(row => row.orderId), ["too-large"]);
  assert.match(plan.skipped[0].reason, /tidak cukup/);
  assert.equal(plan.skippedOrderReasons["too-large"], plan.skipped[0].reason);
  assert.equal(plan.inventory[0].onHand, 2); assert.equal(plan.inventory[0].reserved, 2); assert.equal(plan.inventory[0].sold, 8);
  assert.deepEqual(plan.movements.map(row => row.orderReference), ["FIRST", "SMALL"]);
});

test("a parent with one missing source consumes none of its valid sources", () => {
  const inventory = [stock("stock", 5)], bad = order("bad", 4, [allocation("stock", 2), allocation("missing", 2)]), valid = order("valid", 5);
  const plan = planBulkMutationInventory(inventory, [], [bad, valid], context);
  assert.deepEqual(plan.stockCompletionOrderIds, ["valid"]);
  assert.match(plan.skipped[0].reason, /tidak ditemukan/);
  assert.equal(plan.inventory[0].onHand, 0);
  assert.equal(plan.movements.length, 1);
});

test("reserved stock and summed repeated-source allocations are checked before each parent commits", () => {
  const inventory = [{ ...stock(), reserved: 4 }];
  const plan = planBulkMutationInventory(inventory, [], [order("over-reservation", 5), order("valid", 4, [allocation("stock", 1), allocation("stock", 3)])], context);
  assert.deepEqual(plan.stockCompletionOrderIds, ["valid"]);
  assert.match(plan.skipped[0].reason, /Reservasi/);
  assert.equal(plan.inventory[0].onHand, 6); assert.equal(plan.inventory[0].reserved, 0);
  assert.equal(plan.movements.length, 2); assert.equal(new Set(plan.movements.map(row => row.id)).size, 2);
});

test("already consumed parents and orphaned existing stock-out movements never consume twice", () => {
  const consumed = { ...order("consumed", 2), inventoryConsumedAt: now }, orphan = order("orphan", 2);
  const prior: InventoryMovement = { ...allocation("stock", 2), id: "old-out", stockId: "stock", movementType: "out", occurredAt: now, orderReference: " orphan " };
  const inventory = [stock()];
  const plan = planBulkMutationInventory(inventory, [prior], [consumed, orphan], context);
  assert.deepEqual(plan.stockCompletionOrderIds, []);
  assert.equal(plan.skipped.length, 1); assert.match(plan.skipped[0].reason, /sudah tercatat/);
  assert.deepEqual(plan.inventory, inventory); assert.deepEqual(plan.movements, [prior]);
});

test("wrong stock identity, negative allocations, invalid balances and quantity mismatch are explicit safe skips", () => {
  for (const change of [
    { game: "OTHER" }, { employeeCode: "OTHER" }, { stockType: "item" as const }, { server: "OTHER" },
    { onHand: Number.NaN }, { reserved: 20 }, { sold: -1 },
  ]) {
    const inventory = [{ ...stock(), ...change }];
    const plan = planBulkMutationInventory(inventory, [], [order("blocked", 2)], context);
    assert.equal(plan.stockCompletionOrderIds.length, 0, JSON.stringify(change));
    assert.equal(plan.skipped.length, 1);
    assert.equal(plan.movements.length, 0);
    assert.deepEqual(plan.inventory, inventory);
  }
  const invalid = [order("negative", 2, [allocation("stock", -2)]), order("mismatch", 3, [allocation("stock", 2)])];
  const plan = planBulkMutationInventory([stock()], [], invalid, context);
  assert.equal(plan.skipped.length, 2); assert.equal(plan.movements.length, 0);
});

test("decimal allocation totals do not create floating-point shortages or negative residual balances", () => {
  const inventory = [stock("stock", 0.3)];
  const plan = planBulkMutationInventory(inventory, [], [order("one", 0.1), order("two", 0.2)], context);
  assert.deepEqual(plan.stockCompletionOrderIds, ["one", "two"]);
  assert.equal(plan.inventory[0].onHand, 0); assert.equal(plan.inventory[0].reserved, 0);
});

test("tiny genuine shortages cannot consume zero stock and small positive balances are preserved", () => {
  const empty = [stock("stock", 0)];
  const blocked = planBulkMutationInventory(empty, [], [order("tiny", 0.0000001)], context);
  assert.deepEqual(blocked.stockCompletionOrderIds, []);
  assert.equal(blocked.skipped.length, 1);
  assert.deepEqual(blocked.inventory, empty); assert.deepEqual(blocked.movements, []);
  const small = planBulkMutationInventory([stock("stock", 0.0000003)], [], [order("tiny", 0.0000001)], context);
  assert.deepEqual(small.stockCompletionOrderIds, ["tiny"]);
  assert.ok(small.inventory[0].onHand > 0.00000019);
  assert.ok(small.inventory[0].reserved > 0.00000019);
});

test("colliding movement IDs reject only that parent, while structural ambiguity and invalid clocks fail before any output", () => {
  const parents = [order("one", 2), order("two", 2)], inventory = [stock()], before = structuredClone({ parents, inventory });
  const initial = planBulkMutationInventory(inventory, [], [parents[0]], context);
  const collision = { ...initial.movements[0], orderReference: "OTHER" };
  const plan = planBulkMutationInventory(inventory, [collision], parents, context);
  assert.deepEqual(plan.stockCompletionOrderIds, ["two"]); assert.match(plan.skipped[0].reason, /Identitas/);
  assert.throws(() => planBulkMutationInventory([inventory[0], inventory[0]], [], parents, context), /terduplikat/);
  assert.throws(() => planBulkMutationInventory(inventory, [collision, collision], parents, context), /terduplikat/);
  assert.throws(() => planBulkMutationInventory(inventory, [], [parents[0], { ...parents[0], quantity: 3 }], context), /Snapshot/);
  assert.throws(() => planBulkMutationInventory(inventory, [], parents, { ...context, now: "invalid" }), /Waktu/);
  assert.deepEqual({ parents, inventory }, before);
});
