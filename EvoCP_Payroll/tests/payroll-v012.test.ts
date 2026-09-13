import { describe, expect, it } from "vitest";
import { buildLivePayrollRows } from "../src/lib/payroll-live";
import type { Employee, Order } from "../src/types/domain";

const employee: Employee = { id: "emp-1", code: "EMP-0001", name: "Ari", team: "FH1", workforceStatus: "SAKIT", utilization: 0, earningsMinor: 0 };
const order: Order = {
  id: "ord-1", orderNumber: "CP-1", externalReference: "EG1", source: "G2G", buyerName: "Buyer", orderName: "Boost", orderType: "boosting", game: "GW2", service: "JOKI", quantity: 1, grossMinor: 1_000_000,
  workerAssignments: [{ id: "a1", employeeCode: "EMP-0001", employeeName: "Ari", team: "FH1", process: "JOKI", quantity: 1 }],
  transferStatus: "PENDING", operationalStatus: "verified", financeStatus: "pending", expectedPaymentMinor: 1_000_000, matchedPaymentMinor: 0, orderedAt: "2026-09-10T08:00:00+07:00", dueAt: "2026-09-11T08:00:00+07:00",
};

describe("payroll v0.12", () => {
  it("uses one global percentage and deductions/additions", () => {
    const rows = buildLivePayrollRows([order], {
      sharePercent: 50, employees: [employee],
      adjustments: { "EMP-0001": { operationalMinor: 50_000, penaltyMinor: 25_000, bonusTipsMinor: 50_000 } },
      kasbonByEmployee: { "EMP-0001": 100_000 },
    });
    expect(rows[0].earning).toBe(500_000);
    expect(rows[0].net).toBe(375_000);
    expect(rows[0].employeeStatus).toBe("SAKIT");
  });

  it("caps kasbon deduction so salary never becomes negative", () => {
    const rows = buildLivePayrollRows([order], { sharePercent: 10, employees: [employee], kasbonByEmployee: { "EMP-0001": 500_000 } });
    expect(rows[0].kasbon).toBe(100_000);
    expect(rows[0].kasbonRemaining).toBe(400_000);
    expect(rows[0].net).toBe(0);
  });
});
