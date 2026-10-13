import type { Order, OrderDailyWork } from "../types/domain";

export type DailyPackageDay = { sequence: number; expectedDate?: string; day?: OrderDailyWork };
export type DailyPackageOverview = {
  totalDays: number;
  recorded: number;
  completed: number;
  closed: number;
  missing: number;
  recordedGrossMinor: number;
  finishedGrossMinor: number;
  timeline: DailyPackageDay[];
};

function dateShift(date: string, offset: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const dateValue = new Date(date + "T12:00:00Z");
  if (Number.isNaN(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== date) return undefined;
  dateValue.setUTCDate(dateValue.getUTCDate() + offset);
  return dateValue.toISOString().slice(0, 10);
}

/** The original sheet may contain only some DAY rows; never manufacture financial rows. */
export function dailyPackageOverview(order: Order): DailyPackageOverview {
  const days = order.dailyWork ?? [];
  const totalDays = Math.min(366, Math.max(0, order.scheduleTotalDays ?? days.length));
  const bySequence = new Map(days.map(day => [day.sequence, day]));
  const known = [...days].sort((a, b) => a.sequence - b.sequence).find(day => dateShift(day.workDate, 0));
  const anchor = order.scheduleStartDate && dateShift(order.scheduleStartDate, 0)
    ? order.scheduleStartDate
    : known ? dateShift(known.workDate, 1 - known.sequence) : undefined;
  const timeline = Array.from({ length: totalDays }, (_, i) => ({
    sequence: i + 1,
    expectedDate: anchor ? dateShift(anchor, i) : undefined,
    day: bySequence.get(i + 1),
  }));
  const finished = days.filter(day => day.status === "verified" || day.payrollClosedAt || day.payrollPeriodId);
  return {
    totalDays,
    recorded: days.length,
    completed: finished.length,
    closed: days.filter(day => day.payrollClosedAt || day.payrollPeriodId).length,
    missing: timeline.filter(entry => !entry.day).length,
    recordedGrossMinor: days.reduce((sum, day) => sum + day.grossMinor, 0),
    finishedGrossMinor: finished.reduce((sum, day) => sum + day.grossMinor, 0),
    timeline,
  };
}

export function packageScheduledForDate(order: Order, date: string) {
  if (order.scheduleMode !== "daily") return false;
  if (order.dailyWork?.some(day => day.workDate === date)) return true;
  // Show missing days in the expected package interval, without calling them a source row.
  return dailyPackageOverview(order).timeline.some(entry => entry.expectedDate === date);
}
