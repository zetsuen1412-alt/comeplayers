import type { Order, OrderDailyWork, OrderWorkerAssignment } from "../types/domain";
import { getOrderAssignments } from "./order-workers";

export type MutationViewRow = {
  id: string;
  order: Order;
  day?: OrderDailyWork;
  orderedAt: string;
  quantity: number;
  grossMinor: number;
  assignments: OrderWorkerAssignment[];
};

function dailyDateIso(day: OrderDailyWork) {
  return day.sourceOrderedAt ?? `${day.workDate}T12:00:00+07:00`;
}

export function expandMutationRows(orders: Order[]): MutationViewRow[] {
  return orders.flatMap((order) => {
    if (order.scheduleMode === "daily" && order.dailyWork?.length) {
      return [...order.dailyWork]
        .sort((a, b) => a.sequence - b.sequence)
        .map((day) => ({
          id: `${order.id}::${day.id}`,
          order,
          day,
          orderedAt: dailyDateIso(day),
          quantity: day.quantity ?? 1,
          grossMinor: day.grossMinor,
          assignments: day.workerAssignments?.length ? day.workerAssignments : getOrderAssignments(order),
        }));
    }
    return [{
      id: order.id,
      order,
      orderedAt: order.orderedAt,
      quantity: order.quantity,
      grossMinor: order.grossMinor,
      assignments: getOrderAssignments(order),
    }];
  });
}

export function mutationDayLabel(row: MutationViewRow) {
  if (!row.day) return "—";
  const total = row.order.scheduleTotalDays ?? row.order.dailyWork?.length ?? row.day.sequence;
  return `Hari ${row.day.sequence}/${total}`;
}

function quantityFormat(value: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(value);
}

export function orderQuantityUnit(order: Order) {
  if (order.orderType === "item") return "item";
  if (order.orderType !== "gold") return "";
  const title = order.orderName ?? order.service ?? "";
  const match = title.match(/(?:^|\s)\d+(?:[.,]\d+)?\s*([KMBG])(?:\s|\b)/i);
  return match?.[1]?.toUpperCase() ?? "unit";
}

export function formatMutationDistribution(row: MutationViewRow) {
  const { order, day, assignments } = row;
  if (order.orderType === "gold" || order.orderType === "item") {
    const unit = orderQuantityUnit(order);
    if (!assignments.length) return `Belum ada · total ${quantityFormat(row.quantity)} ${unit}`;
    const parts = assignments.map((assignment) => `${assignment.employeeName} ${quantityFormat(assignment.quantity)}${unit === "unit" ? "" : unit}`);
    const total = assignments.reduce((sum, assignment) => sum + assignment.quantity, 0);
    return `${parts.join(" + ")} = ${quantityFormat(total)}${unit === "unit" ? " unit" : unit}`;
  }

  if (day) {
    const hours = day.hours ?? order.dailyHours;
    const workers = assignments.map((assignment) => assignment.employeeName).join(" + ");
    if (hours && workers) return `${workers} · ${quantityFormat(hours)} jam`;
    if (hours) return `${quantityFormat(hours)} jam`;
    if (workers) return workers;
  }

  return "—";
}

export function mutationRowTitle(row: MutationViewRow) {
  return row.order.orderName ?? (row.order.orderType === "gold" ? row.order.service : row.order.service);
}

export function mutationRowStatusText(row: MutationViewRow) {
  if (row.day) {
    if (row.day.payrollClosedAt) return "Selesai · sudah digaji";
    if (row.day.status === "verified") return "Selesai · masuk gaji";
    if (row.day.status === "on_hold") return "Bermasalah";
    if (row.day.status === "in_progress") return "Dikerjakan";
    return "Proses";
  }
  const order = row.order;
  if (order.payrollClosedAt) return "Selesai · sudah digaji";
  if (order.operationalStatus === "verified") return "Selesai · masuk gaji";
  if (order.operationalStatus === "on_hold") return "Bermasalah";
  if (order.operationalStatus === "completed") return "Selesai · belum masuk gaji";
  if (order.operationalStatus === "in_progress") return "Dikerjakan";
  if (order.operationalStatus === "assigned") return "Proses";
  if (order.operationalStatus === "assignment_pending") return "Belum ada karyawan";
  if (order.operationalStatus === "cancelled") return "Dibatalkan";
  return "Baru";
}

export type GoldDistributionSummaryRow = {
  key: string;
  game: string;
  employeeCode: string;
  employeeName: string;
  team: string;
  unit: string;
  quantity: number;
  orderCount: number;
};

export function goldDistributionSummary(rows: MutationViewRow[]): GoldDistributionSummaryRow[] {
  const map = new Map<string, GoldDistributionSummaryRow>();
  for (const row of rows) {
    if (row.order.orderType !== "gold") continue;
    const unit = orderQuantityUnit(row.order);
    for (const assignment of row.assignments) {
      const game = row.order.gameName ?? row.order.game;
      const key = [game, unit, assignment.employeeCode].join("|");
      const current = map.get(key) ?? {
        key,
        game,
        employeeCode: assignment.employeeCode,
        employeeName: assignment.employeeName,
        team: assignment.team,
        unit,
        quantity: 0,
        orderCount: 0,
      };
      current.quantity += assignment.quantity;
      current.orderCount += 1;
      map.set(key, current);
    }
  }
  return [...map.values()].sort((a, b) =>
    a.game.localeCompare(b.game, "id") ||
    b.quantity - a.quantity ||
    a.employeeName.localeCompare(b.employeeName, "id"),
  );
}

export function formatSummaryQuantity(row: GoldDistributionSummaryRow) {
  return `${quantityFormat(row.quantity)}${row.unit === "unit" ? " unit" : row.unit}`;
}
