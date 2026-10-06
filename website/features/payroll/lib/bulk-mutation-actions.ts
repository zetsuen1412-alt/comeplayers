import type { Order, OrderDailyStatus } from "../types/domain";
import { isDailySettlementOrder, replaceDailyWorkStatus } from "./daily-orders";
import { analyzeOrderQuantityIssues } from "./order-quantity";
import { getOrderAssignments } from "./order-workers";
import { hasAutomaticSheetProtection, isSheetOrder } from "./sheet-sync-policy";

export type BulkMutationAction = "complete" | "delete" | "problem" | "process" | "working";
export type BulkMutationSkipCode = "not_found" | "locked" | "archived" | "closed" | "verified"
  | "financial_protection" | "no_workers" | "quantity_issue" | "inventory";
export type BulkMutationContext = {
  now?: string;
  workspaceLocked?: boolean;
  closingReferences?: Iterable<string>;
  inventoryMovementReferences?: Iterable<string>;
  actorName?: string;
  /** IDs whose inventory changes are included in the same atomic workspace write. */
  stockCompletionOrderIds?: Iterable<string>;
};
export type BulkMutationResult = {
  orders: Order[];
  changedIds: string[];
  unchangedIds: string[];
  skipped: { orderId: string; reference: string; code: BulkMutationSkipCode; reason: string }[];
};

const ACTIONS = new Set<BulkMutationAction>(["complete", "delete", "problem", "process", "working"]);
const referenceKey = (reference: string) => reference.trim().toLowerCase();

/** Plans one order-array write; rejected parents stay unchanged and no input is mutated. */
export function applyBulkMutationAction(
  orders: readonly Order[],
  parentIds: Iterable<string>,
  action: BulkMutationAction,
  context: BulkMutationContext = {},
): BulkMutationResult {
  if (!ACTIONS.has(action)) throw new Error("Aksi pilihan tidak dikenal.");
  const now = context.now ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(now))) throw new Error("Waktu aksi pilihan tidak valid.");
  const selected = [...new Set(parentIds)];
  const byId = new Map(orders.map(order => [order.id, order]));
  if (byId.size !== orders.length) throw new Error("Identitas pesanan terduplikat; muat ulang Mutasi.");
  const closing = new Set([...context.closingReferences ?? []].map(referenceKey));
  const movements = new Set([...context.inventoryMovementReferences ?? []].map(referenceKey));
  const stockCompletion = new Set(context.stockCompletionOrderIds ?? []);
  const patches = new Map<string, Order>();
  const result: BulkMutationResult = { orders: [], changedIds: [], unchangedIds: [], skipped: [] };
  function skip(orderId: string, order: Order | undefined, code: BulkMutationSkipCode, reason: string) {
    result.skipped.push({ orderId, reference: order?.externalReference ?? orderId, code, reason });
  }
  for (const id of selected) {
    const order = byId.get(id);
    if (!order) { skip(id, order, "not_found", "Pesanan tidak ditemukan; muat ulang Mutasi."); continue; }
    if (context.workspaceLocked) { skip(id, order, "locked", "Sistem dikunci. Buka kunci sebelum mengedit."); continue; }
    if (order.websiteDeletedAt || order.sheetDeletedAt) {
      if (action === "delete") result.unchangedIds.push(id);
      else skip(id, order, "archived", "Pesanan sudah dihapus atau diarsipkan; pulihkan terlebih dahulu.");
      continue;
    }
    const daily = isDailySettlementOrder(order);
    const closed = Boolean(order.payrollClosedAt || order.payrollPeriodId || order.financeStatus === "closed"
      || (!daily && closing.has(referenceKey(order.externalReference))));
    if (closed) { skip(id, order, "closed", "Pesanan sudah masuk Tutup Buku/Gaji dan dikunci."); continue; }
    if (action === "delete") {
      if (hasAutomaticSheetProtection(order) || ["verified", "reconciled", "ready_to_close"].includes(order.financeStatus)
        || closing.has(referenceKey(order.externalReference))
        || movements.has(referenceKey(order.externalReference))) {
        skip(id, order, "financial_protection", "Pesanan terkait verifikasi, Gaji/Closing, pembayaran, atau stok; penghapusan tidak dapat dilakukan.");
        continue;
      }
      patches.set(id, { ...order, websiteDeletedAt: now,
        ...(context.actorName ? { websiteDeletedBy: context.actorName } : {}),
        ...(isSheetOrder(order) ? { sheetSyncLocked: true } : {}) });
      result.changedIds.push(id);
      continue;
    }
    if (!daily && (order.operationalStatus === "verified" || order.verifiedAt)) {
      if (action === "complete") result.unchangedIds.push(id);
      else skip(id, order, "verified", "Pesanan sudah selesai dan menunggu Gaji. Tarik dari Gaji satu per satu sebelum mengubah status.");
      continue;
    }
    const nextStatus = action === "complete" ? "verified" : action === "problem" ? "on_hold"
      : action === "working" ? "in_progress" : "assigned";
    const openDays = daily ? (order.dailyWork ?? []).filter(day => !day.payrollClosedAt && !day.payrollPeriodId
      && day.status !== "verified" && !day.verifiedAt) : [];
    if (daily && !openDays.length) {
      if (action === "complete" && order.dailyWork?.every(day => day.status === "verified")) result.unchangedIds.push(id);
      else skip(id, order, "verified", "Semua hari sudah selesai atau masuk Gaji/Closing. Kelola hari satu per satu untuk koreksi.");
      continue;
    }
    if (!daily && !getOrderAssignments(order).length) {
      skip(id, order, "no_workers", "Pesanan belum mempunyai karyawan."); continue;
    }
    if (action === "complete") {
      if (daily && openDays.some(day => !(day.workerAssignments?.length || getOrderAssignments(order).length))) {
        skip(id, order, "no_workers", "Ada hari yang belum mempunyai karyawan; periksa Kelola Hari terlebih dahulu."); continue;
      }
      const issues = analyzeOrderQuantityIssues(order);
      if (issues.length) { skip(id, order, "quantity_issue", `Koreksi jumlah sebelum menyelesaikan pesanan. ${issues.map(issue => issue.description).join(" ")}`); continue; }
      if (order.inventoryAllocations?.length && !order.inventoryConsumedAt && !stockCompletion.has(id)) {
        skip(id, order, "inventory", "Pesanan memakai alokasi stok. Selesaikan satu per satu agar stok tercatat bersama pesanan."); continue;
      }
    }
    let next: Order;
    if (daily) {
      next = order;
      const status: OrderDailyStatus = nextStatus === "assigned" ? "pending" : nextStatus;
      for (const day of openDays) {
        if (day.status === status) continue;
        next = { ...next, ...replaceDailyWorkStatus(next, day.id, status, now) };
      }
    } else {
      next = action === "complete" ? { ...order, operationalStatus: "verified", completedAt: order.completedAt ?? now, verifiedAt: now }
        : order.operationalStatus === nextStatus ? order : { ...order, operationalStatus: nextStatus };
    }
    if (action === "complete" && stockCompletion.has(id) && order.inventoryAllocations?.length && !order.inventoryConsumedAt
      && next !== order) next = { ...next, inventoryConsumedAt: now };
    if (next === order) result.unchangedIds.push(id);
    else { patches.set(id, next); result.changedIds.push(id); }
  }
  result.orders = orders.map(order => patches.get(order.id) ?? order);
  return result;
}
