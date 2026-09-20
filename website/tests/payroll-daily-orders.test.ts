import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailyWorkSchedule,
  getPayrollEligibleGrossMinor,
  replaceDailyWorkStatus,
} from "../features/payroll/lib/daily-orders";
import { buildLivePayrollRows } from "../features/payroll/lib/payroll-live";
import { closeWorkspace, workspaceKeys } from "../features/payroll/lib/workspace-model";
import type { Order } from "../features/payroll/types/domain";

function baseOrder(): Order {
  return {
    id: "ord-daily-1",
    orderNumber: "G2G-DAILY-001",
    externalReference: "G2G-DAILY-001",
    source: "G2G",
    buyerName: "Buyer",
    orderName: "Boosting 7 hari",
    orderType: "boosting",
    scheduleMode: "daily",
    scheduleStartDate: "2026-09-21",
    dailyWork: buildDailyWorkSchedule("2026-09-21", 7, 700_000),
    game: "TEST",
    gameName: "Test Game",
    region: "Global",
    server: "Server 1",
    service: "Boosting",
    quantity: 1,
    grossMinor: 700_000,
    workerAssignments: [{
      id: "asg-1",
      employeeCode: "EMP001",
      employeeName: "Worker",
      team: "FH1",
      process: "JOKI",
      quantity: 1,
    }],
    transferStatus: "PENDING",
    operationalStatus: "assigned",
    financeStatus: "pending",
    expectedPaymentMinor: 700_000,
    matchedPaymentMinor: 0,
    orderedAt: "2026-09-21T00:00:00.000Z",
    dueAt: "2026-09-28T00:00:00.000Z",
  };
}

test("daily schedule splits the full value exactly across all days", () => {
  const rows = buildDailyWorkSchedule("2026-09-21", 30, 15_000_001);
  assert.equal(rows.length, 30);
  assert.equal(rows.reduce((sum, row) => sum + row.grossMinor, 0), 15_000_001);
  assert.equal(rows[0].workDate, "2026-09-21");
  assert.equal(rows[29].sequence, 30);
});

test("only verified and not-yet-closed days are payroll eligible", () => {
  const order = baseOrder();
  Object.assign(order, replaceDailyWorkStatus(order, order.dailyWork![0].id, "verified", "2026-09-21T12:00:00.000Z"));
  assert.equal(getPayrollEligibleGrossMinor(order), 100_000);
  const payroll = buildLivePayrollRows([order], {
    defaultSharePercent: 50,
    employees: [{
      id: "emp-1",
      code: "EMP001",
      name: "Worker",
      team: "FH1",
      workforceStatus: "SHIFT",
      utilization: 0,
      earningsMinor: 0,
    }],
  });
  assert.equal(payroll[0].gross, 100_000);
  assert.equal(payroll[0].earning, 50_000);
});

test("closing locks only completed daily segments and leaves future days open", () => {
  let order = baseOrder();
  order = { ...order, ...replaceDailyWorkStatus(order, order.dailyWork![0].id, "verified", "2026-09-21T12:00:00.000Z") };

  const result = closeWorkspace({
    [workspaceKeys.orders]: [order],
    [workspaceKeys.employees]: [{
      id: "emp-1",
      code: "EMP001",
      name: "Worker",
      team: "FH1",
      workforceStatus: "SHIFT",
      utilization: 0,
      earningsMinor: 0,
    }],
    [workspaceKeys.advances]: [],
    [workspaceKeys.settings]: {
      defaultSharePercent: 50,
      employeeSharePercent: {},
      adjustments: {},
    },
    [workspaceKeys.lock]: {
      id: "lock-1",
      from: "2026-09-21T00:00",
      to: "2026-09-21T23:59",
      lockedAt: "2026-09-21T13:00:00.000Z",
      lockedBy: "Admin",
    },
  }, "2026-09-21T13:00:00.000Z");

  const stored = (result.state[workspaceKeys.orders] as Order[])[0];
  assert.equal(result.record.totalOrderMinor, 100_000);
  assert.equal(stored.dailyWork![0].payrollClosedAt, "2026-09-21T13:00:00.000Z");
  assert.equal(stored.dailyWork![1].payrollClosedAt, undefined);
  assert.equal(stored.payrollClosedAt, undefined);
  assert.equal(getPayrollEligibleGrossMinor(stored), 0);

  const second = { ...stored, ...replaceDailyWorkStatus(stored, stored.dailyWork![1].id, "verified", "2026-09-22T12:00:00.000Z") };
  assert.equal(getPayrollEligibleGrossMinor(second), 100_000);
});
