import { describe, expect, it } from "vitest";
import { validateStockSelection } from "@/lib/inventory";
import type { InventoryStock } from "@/types/domain";

const inventory: InventoryStock[] = [
  { id: "a", stockType: "gold", game: "GW2", itemName: "GW2 Gold", locationName: "", employeeCode: "EMP-1", employeeName: "Aziz", team: "FH3", onHand: 3000, reserved: 500, sold: 0, avgCostMinor: 450 },
  { id: "b", stockType: "gold", game: "GW2", itemName: "GW2 Gold", locationName: "", employeeCode: "EMP-2", employeeName: "Denar", team: "FH3", onHand: 3000, reserved: 0, sold: 0, avgCostMinor: 460 },
];

describe("inventory allocation", () => {
  it("accepts exact multi-employee stock", () => {
    const result = validateStockSelection({ orderQuantity: 5000, stockType: "gold", game: "GW2", inventory, selections: [
      { inventoryStockId: "a", quantity: 2500 },
      { inventoryStockId: "b", quantity: 2500 },
    ] });
    expect(result.ok).toBe(true);
  });

  it("blocks stock over order quantity", () => {
    const result = validateStockSelection({ orderQuantity: 5000, stockType: "gold", game: "GW2", inventory, selections: [
      { inventoryStockId: "a", quantity: 2500 },
      { inventoryStockId: "b", quantity: 3000 },
    ] });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("STOCK_OVER_ALLOCATED");
  });

  it("blocks employee stock with insufficient available stock", () => {
    const result = validateStockSelection({ orderQuantity: 3000, stockType: "gold", game: "GW2", inventory, selections: [
      { inventoryStockId: "a", quantity: 3000 },
    ] });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INSUFFICIENT_INVENTORY");
  });
});
