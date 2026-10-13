import { parseBoostingPackagePlan } from "./boosting-package";
import { getDailyAssignments, parentDailyOperationalStatus } from "./daily-orders";
import type { Order, OrderDailyWork, OrderIssue, OrderWorkerAssignment } from "../types/domain";

export type GoogleSheetDailyRecord = {
  order: Order;
  sourceRow: number;
  days: number[];
  quantity: number | null;
  totalMinor: number | null;
  sourceStatus: string;
  sourceTransferStatus?: string;
  workersByDay?: { sequence: number; assignments: OrderWorkerAssignment[]; issues?: OrderIssue[] }[];
};

const normalized = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
const normalizedTitle = (value: unknown) => normalized(String(value ?? "").replace(/[⭐☑️✅]/gu, " "));

/** Only an explicit trailing DAY suffix is removed; employee digits stay intact. */
export function parseGoogleSheetBoostingDays(booster: string): { workerName: string; days: number[] } | null {
  const value = booster.trim().replace(/[–—]/g, "-");
  const match = value.match(/^(.*?)\s+((?:DAY|D)\s*\d+(?:\s*-\s*(?:DAY|D)?\s*\d+)?(?:[\s,;]+(?:DAY|D)\s*\d+(?:\s*-\s*(?:DAY|D)?\s*\d+)?)*)\s*$/i);
  if (!match || !match[1].trim()) return null;
  const days: number[] = [];
  for (const marker of match[2].matchAll(/(?:DAY|D)\s*(\d+)(?:\s*-\s*(?:DAY|D)?\s*(\d+))?/gi)) {
    const first = Number(marker[1]), last = marker[2] === undefined ? first : Number(marker[2]);
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last > 366 || last < first) {
      throw new Error("Penanda DAY harus berada pada 1–366 dan rentang harus berurutan.");
    }
    for (let day = first; day <= last; day++) {
      if (days.includes(day)) throw new Error(`Hari ${day} muncul lebih dari sekali dalam BOOSTER.`);
      days.push(day);
    }
  }
  return { workerName: match[1].trim().replace(/\s+/g, " "), days: days.sort((a, b) => a - b) };
}

function dailyIssue(code: string, description: string): OrderIssue {
  return { code, title: "Paket harian perlu diperiksa", description, severity: "warning", source: "import" };
}

function uniqueIssues(issues: OrderIssue[]) {
  const seen = new Set<string>();
  return issues.filter(issue => {
    const key = `${issue.code}:${issue.description}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function commonRate(days: OrderDailyWork[]) {
  const first = days[0]?.rateMinor;
  return first !== undefined && days.every(day => day.rateMinor === first) ? first : undefined;
}

function parentAssignments(days: OrderDailyWork[]) {
  const assignments = new Map<string, OrderWorkerAssignment>();
  for (const day of days) for (const worker of day.workerAssignments ?? []) {
    const key = JSON.stringify([worker.employeeCode, worker.employeeName, worker.team, worker.process]);
    const old = assignments.get(key);
    assignments.set(key, { ...worker, id: `sheet-worker:${encodeURIComponent(key)}`, quantity: (old?.quantity ?? 0) + worker.quantity });
  }
  return [...assignments.values()];
}

function summarizeDays(order: Order, days: OrderDailyWork[], additionalIssues: OrderIssue[] = []): Order {
  const grossMinor = days.reduce((sum, day) => sum + day.grossMinor, 0);
  if (!Number.isSafeInteger(grossMinor) || grossMinor < 0) throw new Error("Total paket harian di luar batas rupiah yang aman.");
  const rateMinor = commonRate(days);
  const issues = uniqueIssues([...(order.importIssues ?? []), ...additionalIssues,
    ...(rateMinor === undefined ? [dailyIssue("sheet_daily_rate_review", "RATE berbeda atau belum tersedia pada hari-hari paket. Lihat Rate Sheet pada setiap hari; rata-rata tidak menggantikan RATE sumber.")] : [])]);
  const workerAssignments = parentAssignments(days);
  const operationalStatus = parentDailyOperationalStatus(days, order.scheduleTotalDays);
  const lastVerifiedAt = days.filter(day => day.status === "verified").map(day => day.verifiedAt).filter((date): date is string => Boolean(date)).sort().at(-1);
  return {
    ...order,
    dailyWork: days,
    quantity: days.reduce((sum, day) => sum + (day.quantity ?? 1), 0),
    rateMinor,
    grossMinor,
    expectedPaymentMinor: grossMinor,
    workerAssignments,
    employeeCode: workerAssignments[0]?.employeeCode,
    employeeName: workerAssignments[0]?.employeeName,
    team: workerAssignments[0]?.team ?? order.team,
    operationalStatus,
    completedAt: operationalStatus === "verified" ? lastVerifiedAt : undefined,
    verifiedAt: operationalStatus === "verified" ? lastVerifiedAt : undefined,
    importIssues: issues.length ? issues : undefined,
    importNeedsReview: issues.length > 0,
  };
}

/** The Sheet TOTAL belongs to the markers on its row, never to unrecorded days. */
export function buildGoogleSheetDailyOrder(records: GoogleSheetDailyRecord[]): Order {
  if (!records.length || records.length > 366) throw new Error("Paket harian harus berisi 1–366 baris sumber.");
  const ordered = [...records].sort((a, b) => a.sourceRow - b.sourceRow);
  const first = ordered[0].order;
  const title = first.orderName ?? first.service;
  let plan = parseBoostingPackagePlan(title);
  if (!plan.isDaily && plan.basis === "day" && plan.totalDays === 1) plan = { ...plan, isDaily: true };
  // A complete Sheet group can explicitly record several DAYs for an Hours
  // Package without Xn. Its known schedule ends at the last recorded marker;
  // explicit week/month/day and Xn bounds still come from their package title.
  const lastRecordedDay = ordered.reduce((last, record) => record.days.reduce((current, day) => Math.max(current, day), last), 0);
  const explicitMultiplier = title.match(/(?:\bx|×)\s*(\d+)\b/i);
  if (!plan.isDaily && plan.basis === "single" && plan.dailyHours !== undefined
    && /\d+(?:[.,]\d+)?\s*(?:hours?|jam)\s*(?:package|paket)\b/i.test(title)) {
    if (explicitMultiplier && Number(explicitMultiplier[1]) === 1) plan = { ...plan, isDaily: true, totalDays: 1 };
    else if (!explicitMultiplier && Number.isInteger(lastRecordedDay) && lastRecordedDay >= 1 && lastRecordedDay <= 366) {
      plan = { ...plan, isDaily: true, totalDays: lastRecordedDay };
    }
  }
  if (first.orderType !== "boosting" || !plan.isDaily || plan.totalDays < 1
    || (plan.dailyHours !== undefined && (!Number.isFinite(plan.dailyHours) || plan.dailyHours <= 0 || plan.dailyHours > 24))) {
    throw new Error("KODE berulang hanya dapat digabung sebagai paket Boosting berjangka yang jelas.");
  }
  const scope = (order: Order) => JSON.stringify([normalized(order.externalReference), normalized(order.source), normalized(order.buyerName), normalized(order.game), normalized(order.process), normalizedTitle(order.orderName ?? order.service)]);
  const expected = scope(first), days = new Map<number, OrderDailyWork>();
  const sourceRows = new Set<number>();
  for (const record of ordered) {
    const { order } = record;
    if (order.orderType !== "boosting" || scope(order) !== expected) throw new Error("KODE paket berulang mempunyai buyer, game, sumber, proses, atau nama paket yang berbeda.");
    if (sourceRows.has(record.sourceRow)) throw new Error("Nomor baris sumber paket harian duplikat.");
    sourceRows.add(record.sourceRow);
    const quantityPerDay = record.quantity === null ? NaN : record.quantity / record.days.length;
    if (!record.days.length || !Number.isSafeInteger(quantityPerDay) || quantityPerDay < 1) throw new Error(`JUMLAH pada baris ${record.sourceRow} harus membentuk unit kerja bulat positif untuk ${record.days.length} DAY.`);
    if (record.totalMinor === null || !Number.isSafeInteger(record.totalMinor) || record.totalMinor < 0) throw new Error(`TOTAL pada baris ${record.sourceRow} harus berupa rupiah yang valid.`);
    if (order.rateMinor !== undefined && (!Number.isFinite(order.rateMinor) || order.rateMinor < 0)) throw new Error(`RATE pada baris ${record.sourceRow} tidak valid.`);
    const base = Math.floor(record.totalMinor / record.days.length), remainder = record.totalMinor - base * record.days.length;
    const sequence = [...record.days].sort((a, b) => a - b);
    const workDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(order.orderedAt));
    for (const [index, day] of sequence.entries()) {
      if (!Number.isInteger(day) || day < 1 || day > plan.totalDays) throw new Error(`Hari ${day} di luar paket ${plan.totalDays} hari.`);
      if (days.has(day)) throw new Error(`Hari ${day} muncul lebih dari sekali untuk KODE ${first.externalReference}.`);
      days.set(day, {
        id: `sheet-day:${day}`, sequence: day, workDate, sourceRow: record.sourceRow,
        sourceOrderedAt: order.orderedAt, sourceStatus: record.sourceStatus, sourceTransferStatus: record.sourceTransferStatus,
        grossMinor: base + (index < remainder ? 1 : 0), rateMinor: order.rateMinor,
        quantity: quantityPerDay, hours: plan.dailyHours, status: "pending",
        workerAssignments: (record.workersByDay?.find(work => work.sequence === day)?.assignments ?? order.workerAssignments ?? [])
          .map(worker => ({ ...worker, id: `sheet-day-worker:${day}:${worker.employeeCode}`, quantity: record.workersByDay ? worker.quantity : worker.quantity / record.days.length })),
        issues: uniqueIssues([...(order.importIssues ?? []), ...(record.workersByDay?.find(work => work.sequence === day)?.issues ?? [])]),
      });
    }
  }
  const dailyWork = [...days.values()].sort((a, b) => a.sequence - b.sequence);
  return summarizeDays({
    ...first, scheduleMode: "daily", scheduleTotalDays: plan.totalDays, dailyHours: plan.dailyHours,
    orderedAt: ordered.map(record => record.order.orderedAt).sort()[0],
    dueAt: ordered.map(record => record.order.orderedAt).sort().at(-1)!,
    importIssues: uniqueIssues(ordered.flatMap(record => [...record.order.importIssues ?? [], ...record.workersByDay?.flatMap(work => work.issues ?? []) ?? []])),
  }, dailyWork);
}

export function isSettledGoogleSheetDay(day: OrderDailyWork) {
  return Boolean(day.payrollClosedAt || day.payrollPeriodId || day.verifiedAt || day.status === "verified");
}

/** Settled day objects and IDs survive refreshes, source deletion and physical sorts. */
export function mergeGoogleSheetDailyOrder(existing: Order, incoming: Order): Order {
  const oldDays = new Map<number, OrderDailyWork>();
  for (const day of existing.dailyWork ?? []) {
    if (oldDays.has(day.sequence)) throw new Error("Paket website memiliki nomor hari duplikat; periksa sebelum sinkronisasi.");
    oldDays.set(day.sequence, day);
  }
  const dailyWork = (incoming.dailyWork ?? []).map(day => {
    const old = oldDays.get(day.sequence);
    oldDays.delete(day.sequence);
    if (!old) return { ...day };
    if (isSettledGoogleSheetDay(old)) return old;
    return { ...old, ...day, id: old.id, status: old.status, completedAt: old.completedAt, verifiedAt: old.verifiedAt,
      issues: uniqueIssues([...(day.issues ?? []), ...(old.issues ?? []).filter(issue => issue.source === "manual")]) };
  });
  for (const day of oldDays.values()) if (isSettledGoogleSheetDay(day)) dailyWork.push(day);
  dailyWork.sort((a, b) => a.sequence - b.sequence);
  if (dailyWork.some(day => day.sequence > (incoming.scheduleTotalDays ?? 0))) throw new Error("Perubahan paket akan menghapus hari yang sudah selesai/digaji di luar durasi baru.");
  const merged = summarizeDays({ ...existing, ...incoming,
    id: existing.id, financeStatus: existing.financeStatus, matchedPaymentMinor: existing.matchedPaymentMinor,
    sheetDeletedAt: undefined, sheetSyncRefreshRequested: undefined,
  }, dailyWork);
  const effectiveWorkers = (order: Order, day: OrderDailyWork) => JSON.stringify(getDailyAssignments(order, day));
  for (const day of existing.dailyWork ?? []) {
    if (isSettledGoogleSheetDay(day) && day.workerAssignments === undefined
      && effectiveWorkers(existing, day) !== effectiveWorkers(merged, day)) {
      throw new Error(`Sinkronisasi paket dibatalkan karena penugasan Hari ${day.sequence} yang sudah selesai/digaji masih mengikuti pesanan induk dan akan berubah.`);
    }
  }
  return merged;
}
