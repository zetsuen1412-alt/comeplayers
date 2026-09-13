import { describe, expect, it } from "vitest";
import { isPayrollEligible } from "../src/lib/payroll-live";
import type { Order } from "../src/types/domain";

function order(status: Order["operationalStatus"]): Order {
  return {
    id: "ord-1",
    orderNumber: "CP-1",
    externalReference: "EG1",
    source: "G2G",
    buyerName: "Buyer",
    orderType: "boosting",
    game: "GW2",
    service: "JOKI",
    quantity: 1,
    grossMinor: 100_000,
    workerAssignments: [{ id: "a1", employeeCode: "EMP-0001", employeeName: "Ari", team: "FH1", process: "JOKI", quantity: 1 }],
    operationalStatus: status,
    financeStatus: "pending",
    expectedPaymentMinor: 100_000,
    matchedPaymentMinor: 0,
    orderedAt: "2026-09-10T10:00:00+07:00",
    dueAt: "2026-09-11T10:00:00+07:00",
  };
}

describe("status Mutasi v0.13", () => {
  it("Proses belum masuk payroll", () => expect(isPayrollEligible(order("assigned"))).toBe(false));
  it("Dikerjakan belum masuk payroll", () => expect(isPayrollEligible(order("in_progress"))).toBe(false));
  it("Bermasalah belum masuk payroll", () => expect(isPayrollEligible(order("on_hold"))).toBe(false));
  it("Selesai masuk payroll", () => expect(isPayrollEligible(order("verified"))).toBe(true));
});
