import type { Order, OrderIssue } from "../types/domain";
import { getOrderAssignments } from "./order-workers";

const EPSILON = 0.000001;

/** A clear amount at the start of a title, not a level, duration, range or bundle. */
export function statedOrderQuantity(order: Order): { quantity: number; unit: string } | null {
  if (order.orderType === "boosting" || order.scheduleMode === "daily") return null;
  const title = (order.orderName ?? order.service ?? "").trim();
  const match = title.match(/^(\d+(?:[.,]\d+)?)\s*([KMBG])(?:\s+([\p{L}\s]+))?$/iu);
  if (!match) return null;
  // Three decimal digits can also mean a thousands separator. Do not guess.
  if (/[.,]\d{3}$/.test(match[1])) return null;
  if (/\b(?:hours?|days?|weeks?|months?|package|level|jam|hari|paket)\b/i.test(match[3] ?? "")) return null;
  const quantity = Number(match[1].replace(",", "."));
  return Number.isFinite(quantity) && quantity > 0 ? { quantity, unit: match[2].toUpperCase() } : null;
}

/** Legacy sheet imports have no orderType; keep their stored type and financial mapping intact. */
export function hasQuantityDistribution(order: Order): boolean {
  if (order.orderType === "boosting" || order.scheduleMode === "daily") return false;
  if (order.orderType === "gold" || order.orderType === "item") return true;
  return statedOrderQuantity(order) !== null || /^(?:F2F|MAIL|TRADE)$/i.test(order.process?.trim() ?? "");
}

export function analyzeOrderQuantityIssues(order: Order): OrderIssue[] {
  if (!hasQuantityDistribution(order)) return [];
  const issues: OrderIssue[] = [];
  const stated = statedOrderQuantity(order);
  const format = (value: number) => `${value.toLocaleString("id-ID", { maximumFractionDigits: 6 })}${stated?.unit ?? ""}`;
  const add = (code: string, title: string, description: string) => issues.push({ code, title, description, severity: "high", source: "validation" });
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) {
    add("QUANTITY_INVALID", "Jumlah pesanan tidak valid", "JUMLAH pesanan harus berupa angka lebih dari 0.");
    return issues;
  }
  if (stated && Math.abs(stated.quantity - order.quantity) > EPSILON) {
    add("ORDER_NAME_QUANTITY_MISMATCH", "Nama pesanan dan JUMLAH tidak cocok",
      `Nama pesanan menyebut ${format(stated.quantity)}, tetapi JUMLAH berisi ${format(order.quantity)}. Periksa input sumber; angka tidak diganti otomatis.`);
  }
  const assignments = getOrderAssignments(order);
  if (assignments.some((assignment) => !Number.isFinite(assignment.quantity) || assignment.quantity <= 0)) {
    add("WORKER_QUANTITY_INVALID", "Pembagian jumlah karyawan tidak valid", "Setiap jumlah karyawan harus berupa angka lebih dari 0.");
  } else if (assignments.length) {
    const assigned = assignments.reduce((sum, assignment) => sum + assignment.quantity, 0);
    if (Math.abs(assigned - order.quantity) > EPSILON) {
      add("WORKER_QUANTITY_MISMATCH", "Total pembagian jumlah tidak sama",
        `JUMLAH pesanan ${format(order.quantity)}, tetapi total pembagian karyawan ${format(assigned)}. ${assigned > order.quantity ? "Kelebihan" : "Kekurangan"} ${format(Math.abs(assigned - order.quantity))}.`);
    }
  }
  return issues;
}
