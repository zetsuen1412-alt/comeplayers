import type { Order } from "../types/domain";

export function isSheetOrder(order: Pick<Order, "id">) { return order.id.startsWith("gsheet:"); }

export function hasAutomaticSheetProtection(order: Order) {
  return Boolean(order.payrollClosedAt || order.payrollPeriodId || order.verifiedAt
    || order.operationalStatus === "verified" || order.financeStatus === "closed"
    || order.dailyWork?.some(day => day.payrollClosedAt || day.payrollPeriodId || day.verifiedAt || day.status === "verified")
    || order.inventoryAllocations?.length || order.inventoryConsumedAt || order.matchedPaymentMinor > 0);
}

export function activeSheetOrders(orders: Order[]) { return orders.filter(order => !order.sheetDeletedAt); }
