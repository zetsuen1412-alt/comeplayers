import type { InventoryMovement, InventoryStock, Order } from "../types/domain";

export type BulkInventoryPlan = {
  inventory: InventoryStock[];
  movements: InventoryMovement[];
  stockCompletionOrderIds: string[];
  skippedOrderReasons: Record<string, string>;
  skipped: { orderId: string; reason: string }[];
};
const key = (value: string | undefined) => String(value ?? "").trim().toUpperCase();
const validQuantity = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1e13;
const tolerance = (left: number, right: number) => Number.EPSILON * 8 * Math.max(Math.abs(left), Math.abs(right));
const exceeds = (quantity: number, available: number) => quantity - available > tolerance(quantity, available);
const subtract = (available: number, quantity: number) => {
  const value = available - quantity;
  return value < 0 && !exceeds(quantity, available) ? 0 : value;
};

/** Reserve each accepted parent's complete budget before planning the next parent. */
export function planBulkMutationInventory(
  inventory: readonly InventoryStock[],
  movements: readonly InventoryMovement[],
  completionOrders: readonly Order[],
  context: { now: string; batchId: string },
): BulkInventoryPlan {
  if (!Number.isFinite(Date.parse(context.now)) || !context.batchId?.trim()) throw new Error("Waktu atau identitas batch stok tidak valid.");
  const byStock = new Map(inventory.map(stock => [stock.id, stock]));
  const movementIds = new Set(movements.map(movement => movement.id));
  if (byStock.size !== inventory.length || movementIds.size !== movements.length) throw new Error("Identitas stok atau pergerakan terduplikat; muat ulang Gudang.");
  const priorOut = new Set(movements.filter(movement => movement.movementType === "out" && movement.orderReference)
    .map(movement => key(movement.orderReference)));
  const parents = new Map<string, Order>();
  for (const order of completionOrders) {
    const existing = parents.get(order.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(order)) throw new Error("Snapshot pesanan berbeda untuk identitas yang sama; muat ulang Mutasi.");
    parents.set(order.id, order);
  }
  const remaining = new Map<string, InventoryStock>();
  const added: InventoryMovement[] = [];
  const result: BulkInventoryPlan = { inventory: [], movements: [], stockCompletionOrderIds: [], skipped: [], skippedOrderReasons: Object.create(null) as Record<string, string> };
  for (const order of parents.values()) {
    const allocations = order.inventoryAllocations ?? [];
    if (!allocations.length || order.inventoryConsumedAt) continue;
    // These allocations belong to the entire parent, not to an individual DAY.
    // Never let a daily target reach the ordinary whole-order stock planner.
    if (order.scheduleMode === "daily" || order.dailyWork?.length) {
      result.skippedOrderReasons[order.id] = "Pesanan harian memakai alokasi stok induk. Periksa alokasi stok sebelum menyelesaikan DAY.";
      continue;
    }
    if (priorOut.has(key(order.externalReference))) {
      result.skippedOrderReasons[order.id] = "Stok keluar pesanan sudah tercatat, tetapi penanda konsumsi belum ada. Periksa pesanan satu per satu."; continue;
    }
    const rateMinor = order.rateMinor ?? (order.quantity > 0 ? Math.round(order.grossMinor / order.quantity) : order.grossMinor);
    if (!validQuantity(rateMinor)) { result.skippedOrderReasons[order.id] = "Rate pesanan tidak valid untuk mencatat stok keluar."; continue; }
    const requested = new Map<string, number>();
    let reason = "";
    for (const allocation of allocations) {
      const stock = remaining.get(allocation.inventoryStockId) ?? byStock.get(allocation.inventoryStockId);
      if (!stock) { reason = "Stok gudang tidak ditemukan. Periksa alokasi pesanan."; break; }
      if (!validQuantity(allocation.quantity) || allocation.quantity <= 0) { reason = "Jumlah alokasi stok harus lebih dari nol dan valid."; break; }
      if (stock.stockType !== allocation.stockType || key(stock.game) !== key(allocation.game)
        || key(order.game) !== key(stock.game) || stock.employeeCode !== allocation.employeeCode || stock.team !== allocation.team
        || key(stock.region) !== key(allocation.region) || key(stock.server) !== key(allocation.server)
        || (stock.stockType === "item" && key(stock.itemName) !== key(allocation.itemName))) {
        reason = "Jenis, game, atau pemilik stok berbeda dari alokasi pesanan. Periksa alokasi."; break;
      }
      requested.set(stock.id, (requested.get(stock.id) ?? 0) + allocation.quantity);
    }
    const allocated = [...requested.values()].reduce((sum, quantity) => sum + quantity, 0);
    if (!reason && (order.orderType === "gold" || order.orderType === "item")
      && Math.abs(allocated - order.quantity) > tolerance(allocated, order.quantity)) {
      reason = "Total alokasi stok tidak sama dengan JUMLAH pesanan. Koreksi alokasi terlebih dahulu.";
    }
    for (const [stockId, quantity] of requested) {
      if (reason) break;
      const stock = remaining.get(stockId) ?? byStock.get(stockId)!;
      if (!validQuantity(stock.onHand) || !validQuantity(stock.reserved) || !validQuantity(stock.sold ?? 0)
        || exceeds(stock.reserved, stock.onHand) || !validQuantity(quantity) || !validQuantity((stock.sold ?? 0) + quantity)) {
        reason = "Saldo atau reservasi stok tidak valid. Periksa Gudang sebelum menyelesaikan pesanan.";
      } else if (exceeds(quantity, stock.onHand)) {
        reason = `Stok ${stock.itemName} milik ${stock.employeeName} tidak cukup untuk pilihan ini. Tersisa ${stock.onHand.toLocaleString("id-ID")}.`;
      } else if (exceeds(quantity, stock.reserved)) {
        reason = `Reservasi stok ${stock.itemName} milik ${stock.employeeName} tidak cukup. Periksa alokasi pesanan terlebih dahulu.`;
      }
    }
    const nextMovements = allocations.map((allocation, index): InventoryMovement => ({
      id: `stock-out-bulk:${encodeURIComponent(context.batchId)}:${encodeURIComponent(order.id)}:${index}`,
      stockId: allocation.inventoryStockId, movementType: "out", occurredAt: context.now,
      stockType: allocation.stockType, game: allocation.game, region: allocation.region, server: allocation.server,
      itemName: allocation.itemName, locationName: allocation.locationName, employeeCode: allocation.employeeCode,
      employeeName: allocation.employeeName, team: allocation.team, quantity: allocation.quantity, rateMinor,
      orderReference: order.externalReference, note: "Stok keluar dari order selesai",
    }));
    if (!reason && nextMovements.some(movement => movementIds.has(movement.id))) reason = "Identitas pencatatan stok sudah digunakan. Muat ulang Mutasi sebelum mengulang aksi.";
    if (reason) { result.skippedOrderReasons[order.id] = reason; continue; }
    for (const [stockId, quantity] of requested) {
      const stock = remaining.get(stockId) ?? byStock.get(stockId)!;
      remaining.set(stockId, { ...stock, onHand: subtract(stock.onHand, quantity), reserved: subtract(stock.reserved, quantity), sold: (stock.sold ?? 0) + quantity });
    }
    nextMovements.forEach(movement => movementIds.add(movement.id));
    added.push(...nextMovements);
    result.stockCompletionOrderIds.push(order.id);
  }
  result.inventory = inventory.map(stock => remaining.get(stock.id) ?? stock);
  result.movements = [...added, ...movements];
  result.skipped = Object.entries(result.skippedOrderReasons).map(([orderId, reason]) => ({ orderId, reason }));
  return result;
}
