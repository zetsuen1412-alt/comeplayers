import { describe, expect, it } from "vitest";
import { buildLivePayrollRows } from "../src/lib/payroll-live";
import type { Order } from "../src/types/domain";

function order(overrides: Partial<Order>): Order {
  return {
    id: "ord-1",
    orderNumber: "CP-1",
    externalReference: "X1",
    source: "G2G",
    buyerName: "Buyer",
    orderName: "Order",
    game: "RoR",
    service: "JOKI",
    employeeCode: "EMP-0041",
    employeeName: "Denar",
    team: "FH3",
    quantity: 1,
    grossMinor: 640_000,
    workerShareBps: 5000,
    transferStatus: "PENDING",
    operationalStatus: "verified",
    financeStatus: "pending",
    expectedPaymentMinor: 640_000,
    matchedPaymentMinor: 0,
    orderedAt: "2026-09-10T09:15:00+07:00",
    dueAt: "2026-09-11T09:15:00+07:00",
    ...overrides,
  };
}

describe("penggajian otomatis dari order selesai", () => {
  it("menghitung X1465 50% menjadi Rp320.000", () => {
    const rows = buildLivePayrollRows([order({ externalReference: "X1465" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].earning).toBe(320_000);
    expect(rows[0].orderRefs).toContain("X1465");
  });

  it("tidak memasukkan order yang belum diverifikasi", () => {
    const rows = buildLivePayrollRows([order({ operationalStatus: "completed" })]);
    expect(rows).toHaveLength(0);
  });

  it("menjumlahkan dua order karyawan yang sama", () => {
    const rows = buildLivePayrollRows([
      order({ id: "a", externalReference: "XA", grossMinor: 640_000 }),
      order({ id: "b", externalReference: "XB", grossMinor: 360_000 }),
    ]);
    expect(rows[0].gross).toBe(1_000_000);
    expect(rows[0].earning).toBe(500_000);
  });
});
