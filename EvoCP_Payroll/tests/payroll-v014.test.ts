import { describe, expect, it } from "vitest";
import { buildLivePayrollRows, isPayrollEligible } from "../src/lib/payroll-live";
import { getAssignmentGrossMinor } from "../src/lib/order-workers";
import type { Employee, Order } from "../src/types/domain";

const employees: Employee[] = [
  { id: "e1", code: "EMP-0001", name: "Ari", team: "FH1", workforceStatus: "SHIFT", utilization: 0, earningsMinor: 0 },
  { id: "e2", code: "EMP-0002", name: "Budi", team: "FH2", workforceStatus: "FULL", utilization: 0, earningsMinor: 0 },
];

const order: Order = {
  id: "o1", orderNumber: "CP-1", externalReference: "EG1", source: "G2G", buyerName: "Buyer", orderName: "Boost", orderType: "boosting", game: "GW2", service: "JOKI",
  quantity: 1, rateMinor: 10_000, grossMinor: 10_000,
  workerAssignments: [
    { id: "a1", employeeCode: "EMP-0001", employeeName: "Ari", team: "FH1", process: "JOKI", quantity: 1 },
    { id: "a2", employeeCode: "EMP-0002", employeeName: "Budi", team: "FH2", process: "JOKI", quantity: 1 },
  ],
  operationalStatus: "verified", financeStatus: "pending", expectedPaymentMinor: 10_000, matchedPaymentMinor: 0,
  orderedAt: "2026-09-10T08:00:00+07:00", dueAt: "2026-09-11T08:00:00+07:00", verifiedAt: "2026-09-10T09:00:00+07:00",
};

describe("v0.14 payroll and worker split", () => {
  it("keeps one boosting order but splits Rp10.000 equally to two workers", () => {
    const [a, b] = order.workerAssignments!;
    expect(getAssignmentGrossMinor(order, a)).toBe(5_000);
    expect(getAssignmentGrossMinor(order, b)).toBe(5_000);
  });

  it("uses different salary percentages per employee", () => {
    const rows = buildLivePayrollRows([order], { employees, defaultSharePercent: 50, employeeSharePercent: { "EMP-0001": 40, "EMP-0002": 60 } });
    expect(rows.find((x) => x.employeeCode === "EMP-0001")?.earning).toBe(2_000);
    expect(rows.find((x) => x.employeeCode === "EMP-0002")?.earning).toBe(3_000);
  });

  it("can show negative net salary", () => {
    const rows = buildLivePayrollRows([order], { employees, employeeSharePercent: { "EMP-0001": 40 }, adjustments: { "EMP-0001": { operationalMinor: 50_000 } } });
    expect(rows.find((x) => x.employeeCode === "EMP-0001")!.net).toBeLessThan(0);
  });

  it("closed order is excluded from next payroll", () => {
    expect(isPayrollEligible({ ...order, payrollClosedAt: "2026-09-10T10:00:00+07:00" })).toBe(false);
  });
});
