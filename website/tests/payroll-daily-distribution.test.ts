import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBoosterDayNumbers, parseBoostingPackagePlan } from "../features/payroll/lib/boosting-package";
import { analyzeOrderIssues } from "../features/payroll/lib/order-issues";
import { expandMutationRows, formatMutationDistribution, goldDistributionSummary, mutationDayLabel } from "../features/payroll/lib/mutation-rows";
import { buildLivePayrollRows } from "../features/payroll/lib/payroll-live";
import type { Employee, Order, OrderWorkerAssignment } from "../features/payroll/types/domain";

const employees: Employee[] = [
  { id: "e1", code: "EMP-1", name: "SATU", team: "FH1", workforceStatus: "FULL", utilization: 0, earningsMinor: 0 },
  { id: "e2", code: "EMP-2", name: "DUA", team: "FH1", workforceStatus: "FULL", utilization: 0, earningsMinor: 0 },
  { id: "e3", code: "EMP-3", name: "TIGA", team: "FH2", workforceStatus: "FULL", utilization: 0, earningsMinor: 0 },
];

function worker(id: string, code: string, name: string, team: "FH1" | "FH2", quantity: number): OrderWorkerAssignment {
  return { id, employeeCode: code, employeeName: name, team, process: "F2F", quantity };
}

function baseOrder(patch: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    orderNumber: "X1",
    externalReference: "X1",
    source: "G2G",
    buyerName: "Buyer",
    orderName: "150G Gold",
    orderType: "gold",
    game: "TEST",
    service: "150G Gold",
    quantity: 150,
    rateMinor: 1000,
    grossMinor: 150000,
    workerAssignments: [
      worker("a1", "EMP-1", "SATU", "FH1", 50),
      worker("a2", "EMP-2", "DUA", "FH1", 75),
      worker("a3", "EMP-3", "TIGA", "FH2", 25),
    ],
    transferStatus: "PENDING",
    operationalStatus: "assigned",
    financeStatus: "pending",
    expectedPaymentMinor: 150000,
    matchedPaymentMinor: 0,
    orderedAt: "2026-09-21T01:00:00.000Z",
    dueAt: "2026-09-21T01:00:00.000Z",
    ...patch,
  };
}

test("boosting package parser follows week, month and multiplier rules", () => {
  assert.deepEqual(parseBoostingPackagePlan("12 Hours Package⭐ Piloting All Activities X6"), {
    isDaily: true, totalDays: 6, dailyHours: 12, multiplier: 6, basis: "hours-multiplier",
  });
  assert.deepEqual(parseBoostingPackagePlan("1 Week Package (5 Hours/Day)"), {
    isDaily: true, totalDays: 7, dailyHours: 5, multiplier: 1, basis: "week",
  });
  assert.deepEqual(parseBoostingPackagePlan("1 Month Package (5 Hours/Day)"), {
    isDaily: true, totalDays: 30, dailyHours: 5, multiplier: 1, basis: "month",
  });
  assert.deepEqual(parseBoostingPackagePlan("1 Month Package (5 Hours/Day) x2"), {
    isDaily: true, totalDays: 60, dailyHours: 5, multiplier: 2, basis: "month",
  });
  assert.equal(parseBoostingPackagePlan("2 Week Package (4 Hours/Day) x2").totalDays, 28);
  assert.deepEqual(parseBoostingPackagePlan("12 Hours Package"), {
    isDaily: false, totalDays: 1, dailyHours: 12, multiplier: 1, basis: "single",
  });
});

test("booster day parser understands single days and ranges", () => {
  assert.deepEqual(parseBoosterDayNumbers("TATANG D24 D25"), [24, 25]);
  assert.deepEqual(parseBoosterDayNumbers("EKO D2-D4"), [2, 3, 4]);
  assert.deepEqual(parseBoosterDayNumbers("D7-D5"), [5, 6, 7]);
});

test("gold mutation distribution shows employee quantities and exact total", () => {
  const [row] = expandMutationRows([baseOrder()]);
  assert.equal(formatMutationDistribution(row), "SATU 50G + DUA 75G + TIGA 25G = 150G");
  const summary = goldDistributionSummary([row]);
  assert.deepEqual(summary.map((item) => [item.employeeName, item.quantity]).sort(), [
    ["DUA", 75], ["SATU", 50], ["TIGA", 25],
  ]);
});

test("daily boosting expands into Hari rows with hours and daily employees", () => {
  const dailyOrder = baseOrder({
    orderType: "boosting",
    orderName: "12 Hours Package Piloting All Activities X2",
    service: "12 Hours Package Piloting All Activities X2",
    quantity: 1,
    grossMinor: 200000,
    expectedPaymentMinor: 200000,
    rateMinor: 200000,
    scheduleMode: "daily",
    scheduleTotalDays: 2,
    dailyHours: 12,
    workerAssignments: undefined,
    dailyWork: [
      { id: "d1", sequence: 1, workDate: "2026-09-21", grossMinor: 100000, status: "pending", quantity: 1, hours: 12, workerAssignments: [worker("d1a", "EMP-1", "SATU", "FH1", 1)] },
      { id: "d2", sequence: 2, workDate: "2026-09-22", grossMinor: 100000, status: "pending", quantity: 1, hours: 12, workerAssignments: [worker("d2a", "EMP-2", "DUA", "FH1", 1)] },
    ],
  });
  const rows = expandMutationRows([dailyOrder]);
  assert.equal(rows.length, 2);
  assert.equal(mutationDayLabel(rows[0]), "Hari 1/2");
  assert.equal(mutationDayLabel(rows[1]), "Hari 2/2");
  assert.equal(formatMutationDistribution(rows[0]), "SATU · 12 jam");
  assert.equal(formatMutationDistribution(rows[1]), "DUA · 12 jam");
});

test("problem analyzer explains missing employees and quantity mismatch", () => {
  const missing = baseOrder({ workerAssignments: [worker("bad", "EMP-404", "HILANG", "FH1", 150)] });
  assert.ok(analyzeOrderIssues(missing, employees).some((item) => item.code === "EMPLOYEE_NOT_FOUND"));

  const mismatch = baseOrder({
    workerAssignments: [
      worker("a1", "EMP-1", "SATU", "FH1", 50),
      worker("a2", "EMP-2", "DUA", "FH1", 75),
    ],
  });
  const issues = analyzeOrderIssues(mismatch, employees);
  const quantityIssue = issues.find((item) => item.code === "WORKER_QUANTITY_MISMATCH");
  assert.ok(quantityIssue);
  assert.match(quantityIssue.description, /150/);
  assert.match(quantityIssue.description, /125/);
});

test("daily payroll pays the worker assigned to each completed day", () => {
  const order = baseOrder({
    orderType: "boosting",
    orderName: "1 Week Package (5 Hours/Day)",
    service: "1 Week Package (5 Hours/Day)",
    quantity: 1,
    grossMinor: 700000,
    expectedPaymentMinor: 700000,
    rateMinor: 700000,
    scheduleMode: "daily",
    scheduleTotalDays: 7,
    dailyHours: 5,
    workerAssignments: undefined,
    dailyWork: [
      { id: "d1", sequence: 1, workDate: "2026-09-21", grossMinor: 100000, status: "verified", quantity: 1, hours: 5, verifiedAt: "2026-09-21T10:00:00.000Z", workerAssignments: [worker("d1a", "EMP-1", "SATU", "FH1", 1)] },
      { id: "d2", sequence: 2, workDate: "2026-09-22", grossMinor: 100000, status: "verified", quantity: 1, hours: 5, verifiedAt: "2026-09-22T10:00:00.000Z", workerAssignments: [worker("d2a", "EMP-2", "DUA", "FH1", 1)] },
      { id: "d3", sequence: 3, workDate: "2026-09-23", grossMinor: 100000, status: "pending", quantity: 1, hours: 5, workerAssignments: [worker("d3a", "EMP-3", "TIGA", "FH2", 1)] },
    ],
  });

  const payroll = buildLivePayrollRows([order], { employees, defaultSharePercent: 50 });
  const satu = payroll.find((row) => row.employeeCode === "EMP-1")!;
  const dua = payroll.find((row) => row.employeeCode === "EMP-2")!;
  const tiga = payroll.find((row) => row.employeeCode === "EMP-3")!;
  assert.equal(satu.gross, 100000);
  assert.equal(dua.gross, 100000);
  assert.equal(tiga.gross, 0);
  assert.deepEqual(satu.orderRefs, ["X1 D1"]);
  assert.deepEqual(dua.orderRefs, ["X1 D2"]);
});
