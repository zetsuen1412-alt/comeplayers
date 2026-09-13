import { describe, expect, it } from "vitest";
import { calculateBps } from "../src/lib/money";

describe("money", () => {
  it("calculates X1465 50% worker earning", () => {
    expect(calculateBps(640_000, 5000)).toBe(320_000);
  });

  it("uses ROUND HALF UP", () => {
    expect(calculateBps(1_000_001, 5000)).toBe(500_001);
  });

  it("rejects invalid basis points", () => {
    expect(() => calculateBps(100, 10_001)).toThrow("INVALID_BASIS_POINTS");
  });
});
