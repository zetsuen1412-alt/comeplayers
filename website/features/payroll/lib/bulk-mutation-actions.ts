import type { Order, OrderDailyStatus } from "../types/domain";
import { getDailyAssignments, getDailyPayrollValidationError, isDailySettlementOrder, replaceDailyWorkStatus } from "./daily-orders";
import { analyzeOrderQuantityIssues } from "./order-quantity";
import { getOrderAssignments } from "./order-workers";
import { hasAutomaticSheetProtection, isSheetOrder } from "./sheet-sync-policy";

export type BulkMutationAction = "complete" | "delete" | "problem" | "process" | "working";
export type BulkMutationTarget = { orderId: string; dailyId?: string };
export type BulkMutationSkipCode = "not_found" | "locked" | "archived" | "closed" | "verified"
  | "financial_protection" | "no_workers" | "quantity_issue" | "inventory" | "day_required" | "daily_delete" | "daily_inventory";
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
  changedTargetIds: string[];
  unchangedTargetIds: string[];
  skipped: { orderId: string; dailyId?: string; reference: string; code: BulkMutationSkipCode; reason: string }[];
};

const ACTIONS = new Set<BulkMutationAction>(["complete", "delete", "problem", "process", "working"]);
const referenceKey = (reference: string) => reference.trim().toLowerCase();

export function bulkMutationTargetId(target: BulkMutationTarget) {
  return target.dailyId === undefined ? target.orderId : `${target.orderId}::${target.dailyId}`;
}

/** Plans one atomic write. Daily packages require an explicit DAY; a parent ID never expands to other days. */
export function applyBulkMutationAction(
  orders: readonly Order[],
  targets: Iterable<string | BulkMutationTarget>,
  action: BulkMutationAction,
  context: BulkMutationContext = {},
): BulkMutationResult {
  if (!ACTIONS.has(action)) throw new Error("Aksi pilihan tidak dikenal.");
  const now = context.now ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(now))) throw new Error("Waktu aksi pilihan tidak valid.");
  const selected = new Map<string, BulkMutationTarget>();
  for (const item of targets) {
    const target = typeof item === "string" ? { orderId: item } : item;
    if (!target || typeof target.orderId !== "string" || !target.orderId
      || (target.dailyId !== undefined && (typeof target.dailyId !== "string" || !target.dailyId))) {
      throw new Error("Identitas pilihan Mutasi tidak valid; muat ulang tabel.");
    }
    selected.set(JSON.stringify([target.orderId, target.dailyId ?? null]), target);
  }
  const byId = new Map(orders.map(order => [order.id, order]));
  if (byId.size !== orders.length) throw new Error("Identitas pesanan terduplikat; muat ulang Mutasi.");
  const closing = new Set([...context.closingReferences ?? []].map(referenceKey));
  const movements = new Set([...context.inventoryMovementReferences ?? []].map(referenceKey));
  const stockCompletion = new Set(context.stockCompletionOrderIds ?? []);
  const patches = new Map<string, Order>();
  const result: BulkMutationResult = { orders: [], changedIds: [], unchangedIds: [], changedTargetIds: [], unchangedTargetIds: [], skipped: [] };
  function skip(target: BulkMutationTarget, order: Order | undefined, code: BulkMutationSkipCode, reason: string) {
    const day = target.dailyId ? order?.dailyWork?.find(row => row.id === target.dailyId) : undefined;
    result.skipped.push({ orderId: target.orderId, ...(target.dailyId ? { dailyId: target.dailyId } : {}),
      reference: `${order?.externalReference ?? target.orderId}${day ? ` · Hari ${day.sequence}` : ""}`, code, reason });
  }
  function unchanged(target: BulkMutationTarget) {
    result.unchangedIds.push(target.orderId);
    result.unchangedTargetIds.push(bulkMutationTargetId(target));
  }
  function changed(target: BulkMutationTarget, order: Order) {
    patches.set(target.orderId, order);
    result.changedIds.push(target.orderId);
    result.changedTargetIds.push(bulkMutationTargetId(target));
  }
  for (const target of selected.values()) {
    const id = target.orderId;
    const order = patches.get(id) ?? byId.get(id);
    if (!order) { skip(target, order, "not_found", "Pesanan tidak ditemukan; muat ulang Mutasi."); continue; }
    if (context.workspaceLocked) { skip(target, order, "locked", "Sistem dikunci. Buka kunci sebelum mengedit."); continue; }
    if (order.websiteDeletedAt || order.sheetDeletedAt) {
      if (action === "delete") unchanged(target);
      else skip(target, order, "archived", "Pesanan sudah dihapus atau diarsipkan; pulihkan terlebih dahulu.");
      continue;
    }
    const daily = isDailySettlementOrder(order);
    if (daily && target.dailyId === undefined) {
      skip(target, order, "day_required", "Pilih baris Hari yang ingin diubah. Aksi paket harian berlaku per hari."); continue;
    }
    const day = daily ? order.dailyWork?.find(row => row.id === target.dailyId) : undefined;
    if ((daily && !day) || (!daily && target.dailyId !== undefined)) {
      skip(target, order, "not_found", "Hari pekerjaan tidak ditemukan; muat ulang Mutasi."); continue;
    }
    if (daily && order.dailyWork!.filter(row => row.id === target.dailyId).length !== 1) {
      skip(target, order, "not_found", "Identitas Hari terduplikat. Periksa paket sebelum mengubah status."); continue;
    }
    const closed = Boolean(order.payrollClosedAt || order.payrollPeriodId || order.financeStatus === "closed"
      || day?.payrollClosedAt || day?.payrollPeriodId || (closing.has(referenceKey(order.externalReference))
        && (!daily || !order.dailyWork?.some(row => row.payrollClosedAt || row.payrollPeriodId))));
    if (closed) { skip(target, order, "closed", "Pilihan ini sudah masuk Tutup Buku/Gaji dan dikunci."); continue; }
    if (action === "delete") {
      if (daily) {
        skip(target, order, "daily_delete", "Hari paket tidak dihapus melalui Hapus pesanan. Hari lainnya dan riwayat paket tetap disimpan."); continue;
      }
      if (hasAutomaticSheetProtection(order) || ["verified", "reconciled", "ready_to_close"].includes(order.financeStatus)
        || closing.has(referenceKey(order.externalReference))
        || movements.has(referenceKey(order.externalReference))) {
        skip(target, order, "financial_protection", "Pesanan terkait verifikasi, Gaji/Closing, pembayaran, atau stok; penghapusan tidak dapat dilakukan.");
        continue;
      }
      changed(target, { ...order, websiteDeletedAt: now,
        ...(context.actorName ? { websiteDeletedBy: context.actorName } : {}),
        ...(isSheetOrder(order) ? { sheetSyncLocked: true } : {}) });
      continue;
    }
    if (day && (day.status === "verified" || day.verifiedAt)) {
      if (action === "complete") unchanged(target);
      else skip(target, order, "verified", "Hari ini sudah selesai dan menunggu Gaji. Tarik hari ini dari Gaji sebelum mengubah status.");
      continue;
    }
    if (!daily && (order.operationalStatus === "verified" || order.verifiedAt)) {
      if (action === "complete") unchanged(target);
      else skip(target, order, "verified", "Pesanan sudah selesai dan menunggu Gaji. Tarik dari Gaji satu per satu sebelum mengubah status.");
      continue;
    }
    const nextStatus = action === "complete" ? "verified" : action === "problem" ? "on_hold"
      : action === "working" ? "in_progress" : "assigned";
    if (!daily && !getOrderAssignments(order).length) {
      skip(target, order, "no_workers", "Pesanan belum mempunyai karyawan."); continue;
    }
    if (action === "complete") {
      if (daily && order.inventoryAllocations?.length && !order.inventoryConsumedAt) {
        skip(target, order, "daily_inventory", "Alokasi stok masih untuk seluruh paket. Periksa alokasi harian sebelum menyelesaikan hari ini."); continue;
      }
      if (day && !getDailyAssignments(order, day).length) {
        skip(target, order, "no_workers", "Hari ini belum mempunyai karyawan; periksa Kelola Hari terlebih dahulu."); continue;
      }
      const dayError = day ? getDailyPayrollValidationError(order, day) : undefined;
      if (dayError) { skip(target, order, "quantity_issue", dayError); continue; }
      const issues = analyzeOrderQuantityIssues(order);
      if (issues.length) { skip(target, order, "quantity_issue", `Koreksi jumlah sebelum menyelesaikan pesanan. ${issues.map(issue => issue.description).join(" ")}`); continue; }
      if (order.inventoryAllocations?.length && !order.inventoryConsumedAt && !stockCompletion.has(id)) {
        skip(target, order, "inventory", "Pesanan memakai alokasi stok. Selesaikan satu per satu agar stok tercatat bersama pesanan."); continue;
      }
    }
    let next: Order;
    if (daily) {
      next = order;
      const status: OrderDailyStatus = nextStatus === "assigned" ? "pending" : nextStatus;
      if (day!.status !== status) next = { ...order, ...replaceDailyWorkStatus(order, day!.id, status, now) };
    } else {
      next = action === "complete" ? { ...order, operationalStatus: "verified", completedAt: order.completedAt ?? now, verifiedAt: now }
        : order.operationalStatus === nextStatus ? order : { ...order, operationalStatus: nextStatus };
    }
    if (action === "complete" && stockCompletion.has(id) && order.inventoryAllocations?.length && !order.inventoryConsumedAt
      && next !== order) next = { ...next, inventoryConsumedAt: now };
    if (next === order) unchanged(target);
    else changed(target, next);
  }
  result.changedIds = [...new Set(result.changedIds)];
  result.unchangedIds = [...new Set(result.unchangedIds)];
  result.orders = orders.map(order => patches.get(order.id) ?? order);
  return result;
}
