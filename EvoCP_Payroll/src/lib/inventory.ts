import type { InventoryStock, StockType } from "@/types/domain";

export function getAvailableStock(row: InventoryStock) {
  return Math.max(0, row.onHand - row.reserved);
}

export function calculateInventoryValue(row: InventoryStock) {
  return Math.max(0, Math.round(row.onHand * (row.avgCostMinor ?? 0)));
}

export function validateStockSelection(args: {
  orderQuantity: number;
  stockType: StockType;
  game: string;
  selections: Array<{ inventoryStockId: string; quantity: number }>;
  inventory: InventoryStock[];
}) {
  const { orderQuantity, stockType, selections, inventory } = args;
  const game = args.game.trim().toUpperCase();
  const total = selections.reduce((sum, row) => sum + Math.max(0, row.quantity), 0);
  const ids = selections.map((row) => row.inventoryStockId).filter(Boolean);

  if (!selections.length || selections.some((row) => !row.inventoryStockId)) {
    return { ok: false as const, code: "STOCK_NOT_SELECTED", total, difference: total - orderQuantity };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false as const, code: "DUPLICATE_STOCK_SOURCE", total, difference: total - orderQuantity };
  }
  if (selections.some((row) => row.quantity <= 0)) {
    return { ok: false as const, code: "INVALID_STOCK_QUANTITY", total, difference: total - orderQuantity };
  }

  for (const selection of selections) {
    const stock = inventory.find((row) => row.id === selection.inventoryStockId);
    if (!stock) return { ok: false as const, code: "STOCK_NOT_FOUND", total, difference: total - orderQuantity };
    if (stock.stockType !== stockType) return { ok: false as const, code: "WRONG_STOCK_TYPE", total, difference: total - orderQuantity };
    if (game && stock.game.toUpperCase() !== game) return { ok: false as const, code: "WRONG_STOCK_GAME", total, difference: total - orderQuantity };
    if (selection.quantity > getAvailableStock(stock)) return { ok: false as const, code: "INSUFFICIENT_INVENTORY", total, difference: total - orderQuantity };
  }

  if (total !== orderQuantity) {
    return { ok: false as const, code: total > orderQuantity ? "STOCK_OVER_ALLOCATED" : "STOCK_UNDER_ALLOCATED", total, difference: total - orderQuantity };
  }

  return { ok: true as const, code: "OK", total, difference: 0 };
}
