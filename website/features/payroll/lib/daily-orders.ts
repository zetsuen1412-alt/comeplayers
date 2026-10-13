import type {
  OperationalStatus,
  Order,
  OrderDailyStatus,
  OrderDailyWork,
  OrderWorkerAssignment,
} from "@/features/payroll/types/domain";
import { getOrderAssignments } from "./order-workers";

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
  return order.scheduleMode === "daily";
}

/** An explicit empty DAY allocation never inherits workers from other DAYs. */
export function getDailyAssignments(order: Order, day: OrderDailyWork): OrderWorkerAssignment[] {
  if (day.workerAssignments !== undefined) return day.workerAssignments;
  const assignments = getOrderAssignments(order);
  const quantity = day.quantity ?? 1;
  const assigned = assignments.reduce((sum, worker) => sum + worker.quantity, 0);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(assigned) || assigned <= 0
    || assignments.some(worker => !Number.isFinite(worker.quantity) || worker.quantity <= 0)) return [];
  // Legacy rows stored the package allocation on the parent. Preserve its
  // proportions while limiting this DAY's units to the units actually recorded.
  return assignments.map(worker => ({ ...worker, quantity: quantity * (worker.quantity / assigned) }));
}

export function getDailyPayrollValidationError(order: Order, day: OrderDailyWork): string | undefined {
  if (order.inventoryAllocations?.length && !order.inventoryConsumedAt) {
    return "Stok pesanan belum diproses. Periksa alokasi stok sebelum menyelesaikan DAY ini.";
  }
  const quantity = day.quantity ?? 1;
  if (!Number.isFinite(quantity) || quantity <= 0) return `Jumlah kerja Hari ${day.sequence} harus lebih dari 0.`;
  if (!Number.isSafeInteger(day.grossMinor) || day.grossMinor < 0) return `TOTAL Hari ${day.sequence} tidak valid.`;
  const workers = getDailyAssignments(order, day);
  if (!workers.length) return `Hari ${day.sequence} belum mempunyai karyawan. Periksa pembagian hari ini.`;
  if (workers.some(worker => typeof worker.employeeCode !== "string" || !worker.employeeCode.trim()
    || typeof worker.employeeName !== "string" || !worker.employeeName.trim()
    || !Number.isFinite(worker.quantity) || worker.quantity <= 0)) return `Pembagian karyawan Hari ${day.sequence} tidak valid.`;
  const assigned = workers.reduce((sum, worker) => sum + worker.quantity, 0);
  const tolerance = Number.EPSILON * Math.max(Math.abs(assigned), Math.abs(quantity)) * 8;
  if (!Number.isFinite(assigned) || Math.abs(assigned - quantity) > tolerance) {
    return `Jumlah pembagian karyawan Hari ${day.sequence} harus sama dengan jumlah kerja hari ini (${quantity}).`;
  }
  return undefined;
}

export function hasCompleteDailySchedule(rows: readonly Pick<OrderDailyWork, "sequence">[], totalDays = rows.length) {
  const recorded = new Set(rows.map(row => row.sequence));
  return Number.isInteger(totalDays) && totalDays > 0 && rows.length === totalDays && recorded.size === totalDays
    && rows.every(row => Number.isInteger(row.sequence) && row.sequence >= 1 && row.sequence <= totalDays);
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
    closed: rows.filter((row) => Boolean(row.payrollClosedAt || row.payrollPeriodId)).length,
    inProgress: rows.filter((row) => row.status === "in_progress").length,
    onHold: rows.filter((row) => row.status === "on_hold").length,
    pending: rows.filter((row) => row.status === "pending").length,
  };
}

export function getDailyPayrollGrossMinor(order: Pick<Order, "dailyWork">, includeClosed = false) {
  return (order.dailyWork ?? []).reduce((sum, row) => {
    if (row.status !== "verified" || row.sourceTransferStatus?.trim().toUpperCase() === "PENDING") return sum;
    if (!includeClosed && (row.payrollClosedAt || row.payrollPeriodId)) return sum;
    return sum + row.grossMinor;
  }, 0);
}

export function getPayrollEligibleGrossMinor(order: Order, includeClosed = false) {
  if (!includeClosed && (order.payrollClosedAt || order.payrollPeriodId || order.financeStatus === "closed")) return 0;
  if (isDailySettlementOrder(order)) return getDailyPayrollGrossMinor(order, includeClosed);
  if (order.operationalStatus !== "verified" || (order.id.startsWith("gsheet:") && order.transferStatus?.trim().toUpperCase() === "PENDING")) return 0;
  return order.grossMinor;
}

export function dailySegmentsForPeriod(order: Order, from: number, to: number) {
  if (!isDailySettlementOrder(order)) return [];
  return (order.dailyWork ?? []).filter((row) => {
    if (row.status !== "verified" || row.sourceTransferStatus?.trim().toUpperCase() === "PENDING" || row.payrollClosedAt || row.payrollPeriodId || !row.verifiedAt) return false;
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
  const workers = new Map<string, OrderWorkerAssignment>();
  for (const day of segments) for (const worker of getDailyAssignments(order, day)) {
    const key = JSON.stringify([worker.employeeCode, worker.employeeName, worker.team, worker.process]);
    const old = workers.get(key);
    workers.set(key, { ...worker, quantity: (old?.quantity ?? 0) + worker.quantity });
  }
  const workerAssignments = [...workers.values()];
  const rates = segments.map(day => day.rateMinor ?? order.rateMinor);
  const rateMinor = rates.length && rates[0] !== undefined && rates.every(rate => rate === rates[0]) ? rates[0] : undefined;

  return {
    ...order,
    quantity: segments.reduce((sum, day) => sum + (day.quantity ?? 1), 0),
    workerAssignments,
    employeeCode: workerAssignments[0]?.employeeCode,
    employeeName: workerAssignments[0]?.employeeName,
    team: workerAssignments[0]?.team ?? order.team,
    rateMinor,
    grossMinor,
    expectedPaymentMinor: grossMinor,
    matchedPaymentMinor: Math.min(order.matchedPaymentMinor, grossMinor),
    operationalStatus: "verified",
    completedAt: verifiedAt ?? order.completedAt,
    verifiedAt: verifiedAt ?? order.verifiedAt,
    payrollClosedAt: undefined,
    payrollPeriodId: undefined,
    dailyWork: segments.map((row) => ({ ...row, workerAssignments: getDailyAssignments(order, row).map(worker => ({ ...worker })), payrollClosedAt: undefined, payrollPeriodId: undefined })),
  };
}

export function parentDailyOperationalStatus(rows: OrderDailyWork[], totalDays = rows.length): OperationalStatus {
  if (!rows.length) return "assigned";
  const completeSchedule = hasCompleteDailySchedule(rows, totalDays);
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
  if (!Number.isFinite(Date.parse(now))) throw new Error("Waktu aksi hari tidak valid.");
  if (order.payrollClosedAt || order.payrollPeriodId || order.financeStatus === "closed") throw new Error("Pesanan sudah masuk Tutup Buku/Gaji dan tidak dapat diubah.");
  const selected = (order.dailyWork ?? []).filter(day => day.id === dailyId);
  if (selected.length !== 1) throw new Error(selected.length ? "Identitas hari terduplikat; muat ulang Mutasi." : "Hari pekerjaan tidak ditemukan.");
  if (selected[0].payrollClosedAt || selected[0].payrollPeriodId) throw new Error("Hari ini sudah masuk Tutup Buku/Gaji dan tidak dapat diubah.");
  if (selected[0].status === status) return {};
  if (status === "verified") {
    const error = getDailyPayrollValidationError(order, selected[0]);
    if (error) throw new Error(error);
  }

  let found = false;
  const dailyWork = (order.dailyWork ?? []).map((row) => {
    if (row.id !== dailyId) return row;
    found = true;
    if (status === "verified") {
      return { ...row, workerAssignments: getDailyAssignments(order, row).map(worker => ({ ...worker })), status,
        completedAt: row.completedAt ?? now, verifiedAt: now };
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
