import type { Order } from "../types/domain";
import { expandMutationRows, type MutationViewRow } from "./mutation-rows";

/** Immutable bookkeeping periods saved by the trusted Closing endpoint. */
export type BookkeepingClosing = {
  id: string;
  from: string;
  to: string;
  closedAt: string;
  orderRefs?: string[];
  ordersSnapshot?: Order[];
  totalOrderMinor?: number;
  totalPayrollMinor?: number;
};

/**
 * Closing never deletes source rows. Filter its immutable rows from the
 * operational Mutasi view; a multi-day order can have active and closed days.
 * Legacy Closing references may archive non-DAY orders, but must NEVER hide
 * every day of a partial package solely because its parent code is listed.
 */
export function isBookedMutationRow(row: MutationViewRow, closings: BookkeepingClosing[] = []) {
  const order = row.order;
  if (row.day) {
    if (row.day.payrollClosedAt || row.day.payrollPeriodId || order.payrollClosedAt || order.payrollPeriodId) return true;
    return closings.some(closing => (closing.ordersSnapshot ?? []).some(snapshot =>
      snapshot.id === order.id && (snapshot.dailyWork ?? []).some(day =>
        day.id === row.day?.id || day.sequence === row.day?.sequence)));
  }
  if (order.payrollClosedAt || order.payrollPeriodId) return true;
  return closings.some(closing =>
    closing.orderRefs?.some(ref => ref.trim().toLowerCase() === order.externalReference.trim().toLowerCase()) ||
    closing.ordersSnapshot?.some(snapshot => snapshot.id === order.id && snapshot.scheduleMode !== "daily"));
}

export function activeMutationRows(orders: Order[], closings: BookkeepingClosing[] = []) {
  return expandMutationRows(orders).filter(row => !isBookedMutationRow(row, closings));
}

export type BookkeepingEntry = {
  key: string;
  closing: BookkeepingClosing;
  row: MutationViewRow;
  /** Snapshot retained by Closing is preferable to current mutable order values. */
  hasSnapshot: boolean;
};

/**
 * Historical listings are sourced from immutable Closing snapshots; fallback
 * to closed markers only when an old Closing record has no snapshot.
 */
export function bookkeepingEntries(closings: BookkeepingClosing[], orders: Order[]): BookkeepingEntry[] {
  const result: BookkeepingEntry[] = [];
  const allRows = expandMutationRows(orders);
  const sorted = [...closings].sort((a, b) => b.closedAt.localeCompare(a.closedAt));
  for (const closing of sorted) {
    const snapshotRows = expandMutationRows(closing.ordersSnapshot ?? []);
    if (snapshotRows.length) {
      for (const row of snapshotRows) result.push({
        key: closing.id + "::" + row.id, closing, row, hasSnapshot: true,
      });
      continue;
    }
    // Legacy records might lack snapshots; do not accidentally show all
    // days for a parent code that has only some days paid.
    for (const row of allRows) {
      if (row.day) {
        if (row.day.payrollPeriodId !== closing.id) continue;
      } else if (!(row.order.payrollPeriodId === closing.id || (
        !row.order.payrollPeriodId && closing.orderRefs?.some(ref =>
          ref.trim().toLowerCase() === row.order.externalReference.trim().toLowerCase())
      ))) continue;
      result.push({ key: closing.id + "::" + row.id, closing, row, hasSnapshot: false });
    }
  }
  return result;
}
