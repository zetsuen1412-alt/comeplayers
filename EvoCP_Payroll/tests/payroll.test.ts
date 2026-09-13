import { describe, expect, it } from "vitest";
import { calculatePayroll } from "../src/lib/payroll";

describe("payroll", () => {
  it("matches the golden payroll case", () => {
    const result = calculatePayroll([
      { type: "worker_earning", effect: "earning", amountMinor: 1_000_000 },
      { type: "bonus", effect: "earning", amountMinor: 100_000 },
      { type: "maintenance", effect: "deduction", amountMinor: 50_000 },
      { type: "advance_repayment", effect: "deduction", amountMinor: 200_000 },
      { type: "penalty", effect: "deduction", amountMinor: 25_000 },
    ]);
    expect(result.grossCompensationMinor).toBe(1_100_000);
    expect(result.netPayMinor).toBe(825_000);
    expect(result.employerCostMinor).toBe(1_100_000);
  });
});
