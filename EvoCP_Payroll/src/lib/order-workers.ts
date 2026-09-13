import type { Order, OrderWorkerAssignment } from "@/types/domain";
import { calculateWorkerEarning } from "@/lib/finance";

export function getOrderAssignments(order: Order): OrderWorkerAssignment[] {
  if (order.workerAssignments?.length) return order.workerAssignments;
  if (!order.employeeCode || !order.employeeName || !order.team) return [];
  return [{
    id: `${order.id}-legacy-worker`,
    employeeCode: order.employeeCode,
    employeeName: order.employeeName,
    team: order.team as "FH1" | "FH2" | "FH3" | "ADMIN" | "BANDAR",
    process: order.process ?? order.service,
    quantity: order.quantity,
  }];
}

export function getAssignedQuantity(order: Order) {
  return getOrderAssignments(order).reduce((sum, row) => sum + row.quantity, 0);
}

/**
 * Boosting quantity 1 can be handled by multiple workers. In that case the order
 * value is split evenly across workers and the order itself remains one record.
 * Gold/Item remain quantity-based so stock and worker quantities stay exact.
 */
export function getAssignmentGrossMinor(order: Order, assignment: OrderWorkerAssignment) {
  const assignments = getOrderAssignments(order);
  if (order.orderType === "boosting" && assignments.length > 1) {
    const index = Math.max(0, assignments.findIndex((row) => row.id === assignment.id));
    const base = Math.floor(order.grossMinor / assignments.length);
    const remainder = order.grossMinor - base * assignments.length;
    return base + (index < remainder ? 1 : 0);
  }

  if (order.rateMinor !== undefined) return Math.max(0, Math.round(assignment.quantity * order.rateMinor));
  if (order.quantity <= 0) return 0;
  return Math.max(0, Math.round(order.grossMinor * (assignment.quantity / order.quantity)));
}

export function getAssignmentEarningMinor(order: Order, assignment: OrderWorkerAssignment) {
  return calculateWorkerEarning(getAssignmentGrossMinor(order, assignment), order.workerShareBps ?? 5000);
}

export function getTotalWorkerEarning(order: Order) {
  const assignments = getOrderAssignments(order);
  if (!assignments.length) return 0;
  return assignments.reduce((sum, assignment) => sum + getAssignmentEarningMinor(order, assignment), 0);
}

export function getWorkerSummary(order: Order) {
  const assignments = getOrderAssignments(order);
  if (!assignments.length) return "Belum ada";
  return assignments.map((row) => `${row.employeeName} (${row.quantity.toLocaleString("id-ID")})`).join(", ");
}
