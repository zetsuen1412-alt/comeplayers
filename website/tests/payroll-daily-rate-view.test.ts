import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBoostingPackagePlan } from "../features/payroll/lib/boosting-package";
import { dailyProgress, getPayrollEligibleGrossMinor, parentDailyOperationalStatus, replaceDailyWorkStatus } from "../features/payroll/lib/daily-orders";
import { compareMutationRowRates } from "../features/payroll/lib/mutation-table-sort";
import { expandMutationRows, mutationDayLabel } from "../features/payroll/lib/mutation-rows";
import type { Order, OrderDailyWork } from "../features/payroll/types/domain";

function day(sequence: number, rateMinor?: number): OrderDailyWork {
  return { id: `d${sequence}`, sequence, workDate: "2026-10-06", sourceOrderedAt: "2026-10-06T10:00:00+07:00",
    sourceRow: 4_000 + sequence, grossMinor: 160_000, rateMinor, status: "pending" };
}
function daily(days: OrderDailyWork[], totalDays = 30): Order {
  return { id: "daily", orderNumber: "X2184", externalReference: "X2184", source: "G2G", orderType: "boosting",
    orderName: "1 Month Package (6 Hours/Day)", service: "1 Month Package (6 Hours/Day)", game: "AION",
    quantity: days.length, grossMinor: days.reduce((sum, row) => sum + row.grossMinor, 0),
    operationalStatus: "assigned", financeStatus: "pending", expectedPaymentMinor: 0, matchedPaymentMinor: 0,
    orderedAt: "2026-10-01T00:00:00Z", dueAt: "2026-10-31T00:00:00Z", scheduleMode: "daily", scheduleTotalDays: totalDays, dailyHours: 6,
    dailyWork: days };
}

test("sparse recorded packages show actual DAY rows and progress without inventing unrecorded work", () => {
  const order = daily(Array.from({ length: 17 }, (_, index) => day(index + 1, 133_333)));
  const rows = expandMutationRows([order]);
  assert.equal(rows.length, 17);
  assert.equal(mutationDayLabel(rows.at(-1)!), "Hari 17/30");
  assert.equal(rows[0].orderedAt, order.dailyWork![0].sourceOrderedAt);
  assert.equal(rows.reduce((sum, row) => sum + row.grossMinor, 0), order.grossMinor);
  assert.deepEqual(dailyProgress(order), { total: 30, recorded: 17, verified: 0, closed: 0, inProgress: 0, onHold: 0, pending: 17 });
});

test("all recorded days verified cannot complete a sparse or invalid schedule", () => {
  const verified = Array.from({ length: 17 }, (_, index) => ({ ...day(index + 1), status: "verified" as const }));
  assert.equal(parentDailyOperationalStatus(verified, 30), "partially_completed");
  assert.equal(parentDailyOperationalStatus(verified, 17), "verified");
  assert.equal(parentDailyOperationalStatus([{ ...verified[0], sequence: 2 }, verified[1]], 2), "partially_completed");
  assert.equal(parentDailyOperationalStatus([{ ...verified[0], sequence: 0 }, verified[1]], 2), "partially_completed");
  assert.equal(parentDailyOperationalStatus([], 30), "assigned");
});

test("finishing the last recorded DAY keeps sparse parent partial while its verified DAY remains payroll eligible", () => {
  const order = daily([{ ...day(1), status: "verified", verifiedAt: "2026-10-06T00:00:00Z" }, day(2)], 30);
  order.dailyWork![1].workerAssignments = [{ id: "day-worker", employeeCode: "TEGUH3", employeeName: "TEGUH3", team: "FH3", process: "JOKI", quantity: 1 }];
  const patch = replaceDailyWorkStatus(order, "d2", "verified", "2026-10-07T00:00:00Z");
  const updated = { ...order, ...patch };
  assert.equal(updated.operationalStatus, "partially_completed");
  assert.equal(updated.verifiedAt, undefined);
  assert.equal(updated.completedAt, undefined);
  assert.equal(getPayrollEligibleGrossMinor(updated), 320_000);
  const closed = { ...order, dailyWork: order.dailyWork!.map(row => ({ ...row, payrollClosedAt: "2026-10-06" })) };
  assert.throws(() => replaceDailyWorkStatus(closed, "d2", "verified"), /Tutup Buku/);
});

test("RATE sorting uses each DAY rate and leaves missing RATE last in both directions", () => {
  const order = daily([day(1, 416_000), day(2, 0), day(3), day(4, 224_000)]);
  const rows = expandMutationRows([order]);
  assert.deepEqual([...rows].sort((a, b) => compareMutationRowRates(a, b, "asc")).map(row => row.day!.sequence), [2, 4, 1, 3]);
  assert.deepEqual([...rows].sort((a, b) => compareMutationRowRates(a, b, "desc")).map(row => row.day!.sequence), [1, 4, 2, 3]);
  assert.deepEqual(order.dailyWork!.map(row => row.sequence), [1, 2, 3, 4]);
});

test("package grammar recognizes explicit day counts, plurals and Indonesian durations", () => {
  const cases = [
    ["2 Weeks Package (6 Hours/Day)", 14, 6, "week"], ["1 Minggu Paket (6 Jam/Hari)", 7, 6, "week"],
    ["2 Months Package (5 Hours per Day) X2", 120, 5, "month"], ["1 Bulan Paket (6 Jam per Hari)", 30, 6, "month"],
    ["7 Days Package (6 Hours/Day)", 7, 6, "day"], ["3 Hari Paket (4 Jam/Hari) X2", 6, 4, "day"],
    ["12 Hours Package X6", 6, 12, "hours-multiplier"],
  ] as const;
  for (const [title, totalDays, dailyHours, basis] of cases) {
    const plan = parseBoostingPackagePlan(title);
    assert.equal(plan.isDaily, true, title);
    assert.equal(plan.totalDays, totalDays, title);
    assert.equal(plan.dailyHours, dailyHours, title);
    assert.equal(plan.basis, basis, title);
  }
  assert.equal(parseBoostingPackagePlan("1 Day Package (6 Hours/Day)").isDaily, false);
  assert.equal(parseBoostingPackagePlan("1 Day Package X2").totalDays, 2);
  assert.equal(parseBoostingPackagePlan("12 Hours Package").isDaily, false);
  assert.equal(parseBoostingPackagePlan("1.5 Weeks Package").isDaily, false);
});

test("an x immediately introducing the explicit DAY count does not multiply that same count twice", () => {
  for (const title of ["Custom Order 7H x 5 days", "Custom Order 7H X5 days", "Custom Order 7H x 5 hari"]) {
    const plan = parseBoostingPackagePlan(title);
    assert.equal(plan.isDaily, true, title);
    assert.equal(plan.totalDays, 5, title);
    assert.equal(plan.multiplier, 1, title);
  }
  assert.equal(parseBoostingPackagePlan("3 Days Package X2").totalDays, 6);
  assert.equal(parseBoostingPackagePlan("1 Month Package X2").totalDays, 60);
  assert.equal(parseBoostingPackagePlan("Custom Order 7H x2weeks").totalDays, 14);
  assert.equal(parseBoostingPackagePlan("Custom Order 7H x 2 weeks").totalDays, 14);
  assert.equal(parseBoostingPackagePlan("Custom Order 7H x2months").totalDays, 60);
  assert.equal(parseBoostingPackagePlan("Custom Order 7H x 2 months").totalDays, 60);
  assert.equal(parseBoostingPackagePlan("1 Week Package X2").totalDays, 14);
  assert.equal(parseBoostingPackagePlan("Custom Order 7H x 2 weeks X2").totalDays, 28);
});
