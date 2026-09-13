import { describe, expect, it } from "vitest";
import { checkAllocationQuantity } from "@/lib/order-allocation";

describe("multi-worker quantity allocation", () => {
  it("accepts 1000 + 1500 + 2500 for a 5000 order", () => {
    const result = checkAllocationQuantity(5000, [1000, 1500, 2500]);
    expect(result.matches).toBe(true);
    expect(result.status).toBe("match");
    expect(result.assignedQuantity).toBe(5000);
  });

  it("blocks 2000 + 2000 + 2000 for a 5000 order", () => {
    const result = checkAllocationQuantity(5000, [2000, 2000, 2000]);
    expect(result.matches).toBe(false);
    expect(result.status).toBe("over");
    expect(result.difference).toBe(1000);
  });

  it("also warns when allocation is incomplete", () => {
    const result = checkAllocationQuantity(5000, [1000, 1500]);
    expect(result.matches).toBe(false);
    expect(result.status).toBe("under");
    expect(result.difference).toBe(-2500);
  });
});
