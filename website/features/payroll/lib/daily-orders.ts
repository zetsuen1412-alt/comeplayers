import type {
  OperationalStatus,
  Order,
  OrderDailyStatus,
  OrderDailyWork,
  OrderWorkerAssignment,
} from "@/features/payroll/types/domain";

const DAILY_STATUSES = new Set<OrderDailyStatus>([
  "pending",
  "in_progress",
  "verified",
  "on_hold",
]);

function validDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00+07:00`));
}

export function isDailySettlementOrder(order: Pick<Order, "scheduleMode" | "dailyWork">) {
  return order.scheduleMode === "daily" && Array.isArray(order.dailyWork) && order.dailyWork.length > 0;
}

type DailyScheduleOptions = {
  dailyHours?: number;
  startSequence?: number;
  workerAssignments?: OrderWorkerAssignment[];
};

export function buildDailyWorkSchedule(
  startDate: string,
  days: number,
  grossMinor: number,
  options: DailyScheduleOptions = {},
): OrderDailyWork[] {
  if (!validDateInput(startDate)) throw new Error("Tanggal mulai pekerjaan harian tidak valid.");
  const count = Math.floor(Number(days));
  if (!Number.isInteger(count) || count < 2 || count > 366) {
    throw new Error("Pesanan harian harus memiliki 2 sampai 366 hari pekerjaan.");
  }
  const gross = Math.max(0, Math.round(Number(grossMinor)));
  if (!Number.isSafeInteger(gross)) throw new Error("Nilai pesanan harian tidak valid.");

  const startSequence = Math.max(1, Math.floor(options.startSequence ?? 1));
  const base = Math.floor(gross / count);
  const remainder = gross - base * count;
  const start = new Date(`${startDate}T12:00:00+07:00`);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    const workDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    const sequence = startSequence + index;

    return {
      id: `day-${sequence}-${workDate}`,
      sequence,
      workDate,
      grossMinor: base + (index < remainder ? 1 : 0),
      status: "pending",
      quantity: 1,
      hours: options.dailyHours,
      workerAssignments: options.workerAssignments?.map((assignment) => ({ ...assignment })),
    } satisfies OrderDailyWork;
  });
}

export function dailyProgress(order: Pick<Order, "dailyWork" | "scheduleTotalDays">) {
  const rows = order.dailyWork ?? [];
  return {
    total: order.scheduleTotalDays ?? rows.length,
    recorded: rows.length,
    verified: rows.filter((row) => row.status === "verified").length,
    closed: rows.filter((row) => Boolean(row.payrollClosedAt)).length,
    inProgress: rows.filter((row) => row.status === "in_progress").length,
    onHold: rows.filter((row) => row.status === "on_hold").length,
    pending: rows.filter((row) => row.status === "pending").length,
  };
}

export function getDailyPayrollGrossMinor(order: Pick<Order, "dailyWork">, includeClosed = false) {
  return (order.dailyWork ?? []).reduce((sum, row) => {
    if (row.status !== "verified") return sum;
    if (!includeClosed && row.payrollClosedAt) return sum;
    return sum + row.grossMinor;
  }, 0);
}

export function getPayrollEligibleGrossMinor(order: Order, includeClosed = false) {
  if (isDailySettlementOrder(order)) return getDailyPayrollGrossMinor(order, includeClosed);
  if (order.operationalStatus !== "verified") return 0;
  if (!includeClosed && order.payrollClosedAt) return 0;
  return order.grossMinor;
}

export function dailySegmentsForPeriod(order: Order, from: number, to: number) {
  if (!isDailySettlementOrder(order)) return [];
  return (order.dailyWork ?? []).filter((row) => {
    if (row.status !== "verified" || row.payrollClosedAt || !row.verifiedAt) return false;
    const verified = Date.parse(row.verifiedAt);
    return Number.isFinite(verified) && verified >= from && verified <= to;
  });
}

export function createDailyPayrollSlice(order: Order, segments: OrderDailyWork[]): Order {
  const grossMinor = segments.reduce((sum, row) => sum + row.grossMinor, 0);
  const verifiedAt = [...segments]
    .map((row) => row.verifiedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return {
    ...order,
    grossMinor,
    expectedPaymentMinor: grossMinor,
    matchedPaymentMinor: Math.min(order.matchedPaymentMinor, grossMinor),
    operationalStatus: "verified",
    completedAt: verifiedAt ?? order.completedAt,
    verifiedAt: verifiedAt ?? order.verifiedAt,
    payrollClosedAt: undefined,
    payrollPeriodId: undefined,
    dailyWork: segments.map((row) => ({ ...row, payrollClosedAt: undefined, payrollPeriodId: undefined })),
  };
}

export function parentDailyOperationalStatus(rows: OrderDailyWork[], totalDays = rows.length): OperationalStatus {
  if (!rows.length) return "assigned";
  const recorded = new Set(rows.map(row => row.sequence));
  const completeSchedule = Number.isInteger(totalDays) && totalDays > 0 && rows.length === totalDays && recorded.size === totalDays
    && rows.every(row => row.sequence >= 1 && row.sequence <= totalDays);
  if (completeSchedule && rows.every((row) => row.status === "verified")) return "verified";
  const verified = rows.filter((row) => row.status === "verified").length;
  if (verified > 0) return "partially_completed";
  if (rows.some((row) => row.status === "in_progress")) return "in_progress";
  if (rows.some((row) => row.status === "on_hold")) return "on_hold";
  return "assigned";
}

export function replaceDailyWorkStatus(
  order: Order,
  dailyId: string,
  status: OrderDailyStatus,
  now = new Date().toISOString(),
): Partial<Order> {
  if (!DAILY_STATUSES.has(status)) throw new Error("Status pekerjaan harian tidak valid.");
  if (!isDailySettlementOrder(order)) throw new Error("Pesanan ini bukan pesanan harian.");

  let found = false;
  const dailyWork = (order.dailyWork ?? []).map((row) => {
    if (row.id !== dailyId) return row;
    found = true;
    if (row.payrollClosedAt) throw new Error("Hari ini sudah masuk Tutup Buku/Gaji dan tidak dapat diubah.");
    if (status === "verified") {
      return { ...row, status, completedAt: row.completedAt ?? now, verifiedAt: now };
    }
    return {
      ...row,
      status,
      completedAt: undefined,
      verifiedAt: undefined,
    };
  });
  if (!found) throw new Error("Hari pekerjaan tidak ditemukan.");

  const operationalStatus = parentDailyOperationalStatus(dailyWork, order.scheduleTotalDays);
  const verifiedRows = dailyWork.filter((row) => row.status === "verified" && row.verifiedAt);
  const lastVerifiedAt = verifiedRows.map((row) => row.verifiedAt as string).sort().at(-1);

  return {
    dailyWork,
    operationalStatus,
    completedAt: operationalStatus === "verified" ? lastVerifiedAt : undefined,
    verifiedAt: operationalStatus === "verified" ? lastVerifiedAt : undefined,
  };
}
