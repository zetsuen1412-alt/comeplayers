import type { Employee, Order } from "@/features/payroll/types/domain";
import type { PayrollSettings } from "@/features/payroll/lib/demo-payroll-settings-store";
import type { KasbonRecord } from "@/features/payroll/lib/demo-advance-store";
import type { DemoClosingRecord } from "@/features/payroll/lib/demo-closing-store";
import { workspaceKeys, type WorkspaceState } from "@/features/payroll/lib/workspace-model";
import { buildLivePayrollRows, isPayrollEligible } from "@/features/payroll/lib/payroll-live";
import { getOrderAssignments } from "@/features/payroll/lib/order-workers";
import { getDailyAssignments, isDailySettlementOrder } from "@/features/payroll/lib/daily-orders";
import type { FH3MonitorJob } from "@/lib/fh3MonitorJobs";

const list = <T>(state: WorkspaceState, key: string): T[] => Array.isArray(state[key]) ? state[key] as T[] : [];
const clean = (value: unknown, max = 160) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const percent = (value: unknown, fallback = 50) => Number.isFinite(Number(value))
  ? Math.max(0, Math.min(100, Number(value))) : fallback;

/** Same verified earnings/adjustments as Website Gaji. This function never mutates the workspace. */
export function buildMobileEarnings(state: WorkspaceState, employeeCode = "", offset = 0, jobs: FH3MonitorJob[] = []) {
  const orders = list<Order>(state, workspaceKeys.orders);
  const employees = list<Employee>(state, workspaceKeys.employees);
  const settings = (state[workspaceKeys.settings] ?? {}) as Partial<PayrollSettings> & { sharePercent?: number };
  const advances = list<KasbonRecord>(state, workspaceKeys.advances);
  const closings = list<DemoClosingRecord>(state, workspaceKeys.closings);
  const byRef = new Map<string, Order[]>();
  const jobsByWorkerRef = new Map(jobs.map(job => [`${job.employee_code}:${job.order_ref}`, job]));
  for (const order of orders) {
    const ref = order.externalReference.trim().toUpperCase();
    const records = byRef.get(ref) ?? []; records.push(order); byRef.set(ref, records);
  }
  const matchingPayroll = (job: FH3MonitorJob) => {
    const candidates = byRef.get(job.order_ref) ?? [];
    return candidates.length === 1 && getOrderAssignments(candidates[0]).some(a => a.employeeCode === job.employee_code)
      ? candidates[0] : undefined;
  };
  const operationalStatus = (order: Order, code: string) => {
    const job = jobsByWorkerRef.get(`${code}:${order.externalReference.trim().toUpperCase()}`);
    if (!job || isDailySettlementOrder(order) || isPayrollEligible(order, true)) return order.operationalStatus;
    return job.source_active === false ? "cancelled" : job.status;
  };
  const kasbonByEmployee: Record<string, number> = {};
  for (const row of advances) if (row.status === "active")
    kasbonByEmployee[row.employeeCode] = (kasbonByEmployee[row.employeeCode] ?? 0) + row.remainingMinor;
  const rows = buildLivePayrollRows(orders, {
    employees, defaultSharePercent: percent(settings.defaultSharePercent ?? settings.sharePercent ?? 50),
    employeeSharePercent: settings.employeeSharePercent ?? {},
    adjustments: settings.adjustments ?? {}, kasbonByEmployee,
  }).filter(row => row.team === "FH3");
  const summaries = rows.map(row => {
    const employee = employees.find(item => item.code === row.employeeCode);
    const workJobs = jobs.filter(job => job.employee_code === row.employeeCode && job.employee_id === employee?.id);
    const standaloneJobs = workJobs.filter(job => !matchingPayroll(job));
    const closingRows = closings.flatMap(closing => (closing.payrollSnapshot ?? [])
      .filter(item => item.employeeCode === row.employeeCode)
      .map(item => ({ periodId: clean(closing.id), from: clean(closing.from), to: clean(closing.to),
        closedAt: clean(closing.closedAt), netMinor: item.net, earningMinor: item.earning })));
    const related = orders.filter(order => !order.sheetDeletedAt && !order.websiteDeletedAt
      && (isDailySettlementOrder(order)
        ? (order.dailyWork ?? []).some(day => getDailyAssignments(order, day).some(a => a.employeeCode === row.employeeCode))
        : getOrderAssignments(order).some(a => a.employeeCode === row.employeeCode)));
    return {
      employeeId: clean(employee?.id), employeeCode: clean(row.employeeCode), employeeName: clean(row.employee),
      workforceStatus: clean(row.employeeStatus), division: "FH3",
      sharePercent: row.sharePercent, verifiedGrossMinor: row.gross,
      earningMinor: row.earning, operationalMinor: row.operational, penaltyMinor: row.penalty,
      bonusTipsMinor: row.bonusTips, kasbonMinor: row.kasbon,
      kasbonOutstandingMinor: row.kasbonOutstanding, netMinor: row.net,
      closedNetMinor: closingRows.reduce((sum, closing) => sum + closing.netMinor, 0),
      closingCount: closingRows.length,
      activeOrderCount: related.filter(order => ["assigned", "in_progress", "on_hold"].includes(operationalStatus(order, row.employeeCode))).length
        + standaloneJobs.filter(job => job.source_active !== false && job.status !== "completed").length,
      awaitingVerificationCount: related.filter(order => operationalStatus(order, row.employeeCode) === "completed" && !isPayrollEligible(order, true)).length
        + standaloneJobs.filter(job => job.status === "completed").length,
      unvaluedOrderCount: standaloneJobs.length,
      verifiedWorkCount: row.orderRefs.length,
    };
  });
  const selected = summaries.find(row => row.employeeCode === employeeCode);
  if (employeeCode && !selected) throw Object.assign(new Error("Karyawan FH3 tidak ditemukan."), { status: 404 });
  const payrollWork = selected ? orders.flatMap(order => {
    const belongs = (code: string) => code === employeeCode;
    if (isDailySettlementOrder(order)) return (order.dailyWork ?? []).flatMap(day =>
      getDailyAssignments(order, day).some(a => belongs(a.employeeCode)) ? [{
        id: clean(`${order.id}:${day.id}`, 240), orderRef: clean(order.externalReference),
        game: clean(order.gameName ?? order.game), date: clean(day.workDate),
        status: clean(day.status), schedule: `Hari ${day.sequence}`,
        archived: !!(order.sheetDeletedAt || order.websiteDeletedAt),
        closed: !!(day.payrollClosedAt || day.payrollPeriodId),
      }] : []);
    return getOrderAssignments(order).some(a => belongs(a.employeeCode)) ? [{
      id: clean(order.id, 240), orderRef: clean(order.externalReference), game: clean(order.gameName ?? order.game),
      date: clean(jobsByWorkerRef.get(`${employeeCode}:${order.externalReference.trim().toUpperCase()}`)?.completed_at
        ?? order.completedAt ?? order.orderedAt), status: clean(operationalStatus(order, employeeCode)),
      schedule: "Order", archived: !!(order.sheetDeletedAt || order.websiteDeletedAt),
      closed: !!(order.payrollClosedAt || order.payrollPeriodId || order.financeStatus === "closed"),
    }] : [];
  }) : [];
  const jobWork = selected ? jobs.filter(job => job.employee_code === employeeCode
    && job.employee_id === selected.employeeId && (!matchingPayroll(job) || isDailySettlementOrder(matchingPayroll(job)!))).map(job => ({
    id: `telegram-job:${job.order_ref}`, orderRef: job.order_ref, game: "Order Telegram",
    date: job.completed_at ?? job.started_at ?? job.created_at, status: job.status,
    schedule: matchingPayroll(job) ? "Laporan Monitor (paket)" : "Nilai Payroll belum diisi", archived: job.source_active === false, closed: false,
  })) : [];
  const work = [...payrollWork, ...jobWork]
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) || a.id.localeCompare(b.id));
  return {
    employees: summaries, selectedEmployeeCode: selected?.employeeCode ?? null,
    work: work.slice(offset, offset + 100), workTotal: work.length,
    nextOffset: offset + 100 < work.length ? offset + 100 : null,
    notice: "Pekerjaan tanpa nilai tetap tercatat. Nilai diisi admin di Payroll; DONE menunggu verifikasi. Closing berarti dibukukan, bukan bukti pembayaran.",
  };
}
