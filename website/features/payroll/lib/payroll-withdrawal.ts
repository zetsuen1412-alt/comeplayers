import type { Order } from "../types/domain";
import { getDailyAssignments, isDailySettlementOrder, replaceDailyWorkStatus } from "./daily-orders";
import { getOrderAssignments } from "./order-workers";

export type PayrollWithdrawalTarget = { orderId: string; dailyId?: string };
export type PayrollWithdrawalContext = { workspaceLocked?: boolean; closingReferences?: Iterable<string> };
export type PayrollWithdrawalResult = {
  orders: Order[];
  changed: boolean;
  orderReference: string;
  label: string;
  affectedWorkers: { employeeCode: string; employeeName: string }[];
  nextStatus: "completed" | "in_progress";
};

/** Remove exactly one unpaid order/DAY from payroll; financial and source values are retained. */
export function applyPayrollWithdrawal(
  orders: readonly Order[],
  target: PayrollWithdrawalTarget,
  context: PayrollWithdrawalContext = {},
): PayrollWithdrawalResult {
  if (!target || typeof target.orderId !== "string" || !target.orderId
    || (target.dailyId !== undefined && (typeof target.dailyId !== "string" || !target.dailyId))) {
    throw new Error("Pilihan Gaji tidak valid; muat ulang daftar.");
  }
  if (context.workspaceLocked) throw new Error("Sistem dikunci. Buka kunci sebelum menarik pesanan dari Gaji.");
  const matches = orders.filter(order => order.id === target.orderId);
  if (matches.length !== 1) throw new Error("Pesanan tidak ditemukan atau identitasnya terduplikat; muat ulang Gaji.");
  const order = matches[0];
  if (order.websiteDeletedAt || order.sheetDeletedAt) throw new Error("Pesanan sudah diarsipkan dan tidak dapat ditarik dari Gaji.");
  const daily = isDailySettlementOrder(order);
  if (daily && target.dailyId === undefined) throw new Error("Pilih Hari paket yang ingin ditarik dari Gaji. Hari lain tetap terpisah.");
  if (!daily && target.dailyId !== undefined) throw new Error("Hari pekerjaan tidak ditemukan; muat ulang Gaji.");
  const days = daily ? (order.dailyWork ?? []).filter(day => day.id === target.dailyId) : [];
  if (daily && days.length !== 1) throw new Error("Hari pekerjaan tidak ditemukan atau identitasnya terduplikat; muat ulang Gaji.");
  const day = days[0];
  const closing = new Set([...context.closingReferences ?? []].map(reference => reference.trim().toLowerCase()));
  const legacyClosing = closing.has(order.externalReference.trim().toLowerCase())
    && (!daily || !order.dailyWork?.some(row => row.payrollClosedAt || row.payrollPeriodId));
  if (order.payrollClosedAt || order.payrollPeriodId || order.financeStatus === "closed"
    || day?.payrollClosedAt || day?.payrollPeriodId || legacyClosing) {
    throw new Error("Pilihan ini sudah masuk Tutup Buku/Gaji dan tidak dapat ditarik kembali.");
  }
  const affectedWorkers = (day ? getDailyAssignments(order, day) : getOrderAssignments(order))
    .map(worker => ({ employeeCode: worker.employeeCode, employeeName: worker.employeeName }));
  const result: PayrollWithdrawalResult = {
    orders: [...orders], changed: false, orderReference: order.externalReference,
    label: day ? `Hari ${day.sequence}/${order.scheduleTotalDays ?? order.dailyWork?.length ?? day.sequence}` : "Pesanan",
    affectedWorkers,
    nextStatus: day ? "in_progress" : "completed",
  };
  if (day ? day.status !== "verified" : order.operationalStatus !== "verified") return result;
  const patch = day ? replaceDailyWorkStatus(order, day.id, "in_progress")
    : { operationalStatus: "completed" as const, verifiedAt: undefined };
  const updated = { ...order, ...patch };
  result.orders = orders.map(current => current.id === order.id ? updated : current);
  result.changed = true;
  return result;
}
