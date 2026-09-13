import type { Employee, Order } from "@/features/payroll/types/domain";
import { calculateWorkerEarning } from "@/features/payroll/lib/finance";
import { getAssignmentGrossMinor, getOrderAssignments } from "@/features/payroll/lib/order-workers";

export type PayrollAdjustmentInput = {
  operationalMinor?: number;
  penaltyMinor?: number;
  bonusTipsMinor?: number;
};

export type LivePayrollRow = {
  employeeCode: string;
  employee: string;
  team: string;
  employeeStatus: string;
  game: string;
  units: number;
  gross: number;
  sharePercent: number;
  shareBps: number;
  earning: number;
  operational: number;
  kasbonOutstanding: number;
  kasbon: number;
  kasbonRemaining: number;
  penalty: number;
  bonusTips: number;
  net: number;
  status: string;
  orderRefs: string[];
};

export type PayrollBuildOptions = {
  /** compatibility with older callers */
  sharePercent?: number;
  defaultSharePercent?: number;
  employeeSharePercent?: Record<string, number>;
  employees?: Employee[];
  adjustments?: Record<string, PayrollAdjustmentInput>;
  kasbonByEmployee?: Record<string, number>;
  includeClosed?: boolean;
};

export function isPayrollEligible(order: Order, includeClosed = false) {
  return order.operationalStatus === "verified" && getOrderAssignments(order).length > 0 && (includeClosed || !order.payrollClosedAt);
}

export function buildLivePayrollRows(orders: Order[], options: PayrollBuildOptions = {}): LivePayrollRow[] {
  const defaultSharePercent = Math.max(0, Math.min(100, Number(options.defaultSharePercent ?? options.sharePercent ?? 50)));
  const employeeMap = new Map((options.employees ?? []).map((row) => [row.code, row]));

  const groups = new Map<string, {
    employeeCode: string;
    employee: string;
    team: string;
    games: Set<string>;
    units: number;
    gross: number;
    orderRefs: Set<string>;
  }>();

  for (const order of orders) {
    if (!isPayrollEligible(order, options.includeClosed)) continue;
    for (const assignment of getOrderAssignments(order)) {
      const key = assignment.employeeCode;
      const current = groups.get(key) ?? {
        employeeCode: assignment.employeeCode,
        employee: assignment.employeeName,
        team: assignment.team,
        games: new Set<string>(),
        units: 0,
        gross: 0,
        orderRefs: new Set<string>(),
      };
      current.games.add(order.game);
      current.units += assignment.quantity;
      current.gross += getAssignmentGrossMinor(order, assignment);
      current.orderRefs.add(order.externalReference);
      groups.set(key, current);
    }
  }

  for (const employee of options.employees ?? []) {
    if (!groups.has(employee.code)) {
      groups.set(employee.code, {
        employeeCode: employee.code,
        employee: employee.name,
        team: employee.team,
        games: new Set<string>(),
        units: 0,
        gross: 0,
        orderRefs: new Set<string>(),
      });
    }
  }

  return [...groups.values()].map((group) => {
    const employee = employeeMap.get(group.employeeCode);
    const adjustment = options.adjustments?.[group.employeeCode] ?? {};
    const operational = Math.max(0, Math.round(Number(adjustment.operationalMinor ?? 0)));
    const penalty = Math.max(0, Math.round(Number(adjustment.penaltyMinor ?? 0)));
    const bonusTips = Math.max(0, Math.round(Number(adjustment.bonusTipsMinor ?? 0)));
    const kasbonOutstanding = Math.max(0, Math.round(Number(options.kasbonByEmployee?.[group.employeeCode] ?? 0)));
    const sharePercent = Math.max(0, Math.min(100, Number(options.employeeSharePercent?.[group.employeeCode] ?? defaultSharePercent)));
    const shareBps = Math.round(sharePercent * 100);
    const earning = calculateWorkerEarning(group.gross, shareBps);

    // Kasbon only uses salary that is still available. Other deductions may still make salary negative,
    // and negative net is intentionally shown in red in the UI.
    const beforeKasbon = earning + bonusTips - operational - penalty;
    const kasbon = Math.min(kasbonOutstanding, Math.max(0, beforeKasbon));
    const kasbonRemaining = Math.max(0, kasbonOutstanding - kasbon);
    const net = beforeKasbon - kasbon;

    return {
      employeeCode: group.employeeCode,
      employee: employee?.name ?? group.employee,
      team: employee?.team ?? group.team,
      employeeStatus: employee?.workforceStatus ?? "SHIFT",
      game: [...group.games].sort().join(", ") || "—",
      units: group.units,
      gross: group.gross,
      sharePercent,
      shareBps,
      earning,
      operational,
      kasbonOutstanding,
      kasbon,
      kasbonRemaining,
      penalty,
      bonusTips,
      net,
      status: group.orderRefs.size ? "Siap dihitung" : "Belum ada order selesai",
      orderRefs: [...group.orderRefs].sort(),
    } satisfies LivePayrollRow;
  }).sort((a, b) => a.team.localeCompare(b.team) || a.employee.localeCompare(b.employee));
}
