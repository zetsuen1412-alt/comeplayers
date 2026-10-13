import type { Employee, Order, OrderWorkerAssignment } from "@/features/payroll/types/domain";
import { calculateWorkerEarning } from "@/features/payroll/lib/finance";
import { getOrderAssignments } from "@/features/payroll/lib/order-workers";
import { getDailyAssignments, getDailyPayrollValidationError, getPayrollEligibleGrossMinor, isDailySettlementOrder } from "@/features/payroll/lib/daily-orders";
import { eligibleTransferForPayroll } from "./sheet-transfer-payroll";
import { isPreX2754SheetDay, isPreX2754SheetOrder } from "./legacy-fh-cutover";

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

function eligibleDailyRows(order: Order, includeClosed = false) {
  return (order.dailyWork ?? []).filter((row) =>
    row.status === "verified" && !isPreX2754SheetDay(order,row) && eligibleTransferForPayroll(order,row) && (includeClosed || !(row.payrollClosedAt || row.payrollPeriodId))
      && !getDailyPayrollValidationError(order, row)
      && !(row.issues??[]).some(issue=>issue.severity==="high"||issue.severity==="critical"),
  );
}

export function isPayrollEligible(order: Order, includeClosed = false) {
  if (order.sheetDeletedAt || order.websiteDeletedAt) return false;
  if(order.id.startsWith("gsheet:") && (order.importIssues??[]).some(issue=>issue.severity==="high"||issue.severity==="critical"))return false;
  if (!isDailySettlementOrder(order) && (isPreX2754SheetOrder(order) || !eligibleTransferForPayroll(order))) return false;
  if (getPayrollEligibleGrossMinor(order, includeClosed) <= 0) return false;
  if (isDailySettlementOrder(order)) {
    return eligibleDailyRows(order, includeClosed).length > 0;
  }
  return getOrderAssignments(order).length > 0;
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

  function addWork(order: Order, assignment: OrderWorkerAssignment, gross: number, units: number, reference: string) {
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
    current.units += units;
    current.gross += gross;
    current.orderRefs.add(reference);
    groups.set(key, current);
  }

  for (const order of orders) {
    if (!isPayrollEligible(order, options.includeClosed)) continue;

    if (isDailySettlementOrder(order)) {
      for (const day of eligibleDailyRows(order, options.includeClosed)) {
        const assignments = getDailyAssignments(order, day);
        if (!assignments.length) continue;
        const base = Math.floor(day.grossMinor / assignments.length);
        const remainder = day.grossMinor - base * assignments.length;
        for (const [index, assignment] of assignments.entries()) {
          const gross = base + (index < remainder ? 1 : 0);
          addWork(order, assignment, gross, assignment.quantity, `${order.externalReference} D${day.sequence}`);
        }
      }
      continue;
    }

    const assignments = getOrderAssignments(order);
    const eligibleGross = getPayrollEligibleGrossMinor(order, options.includeClosed);
    for (const [index, assignment] of assignments.entries()) {
      const base = Math.floor(eligibleGross / assignments.length);
      const remainder = eligibleGross - base * assignments.length;
      addWork(order, assignment, base + (index < remainder ? 1 : 0), assignment.quantity, order.externalReference);
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
