import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDailyPayrollSlice, dailySegmentsForPeriod, getDailyAssignments,
  getDailyPayrollValidationError, hasCompleteDailySchedule, replaceDailyWorkStatus,
} from "../features/payroll/lib/daily-orders";
import { buildLivePayrollRows, isPayrollEligible } from "../features/payroll/lib/payroll-live";
import { applyBulkMutationAction } from "../features/payroll/lib/bulk-mutation-actions";
import { closeWorkspace, validateWorkspaceEdit, workspaceKeys as K, type WorkspaceState } from "../features/payroll/lib/workspace-model";
import type { Order, OrderDailyWork, OrderWorkerAssignment } from "../features/payroll/types/domain";

const NOW = "2026-10-07T03:00:00.000Z";
function worker(name: string, quantity = 1): OrderWorkerAssignment {
  return { id: `worker-${name}`, employeeCode: name, employeeName: name, team: "FH1", process: "JOKI", quantity };
}
function day(sequence: number, name = `WORKER${sequence}`, overrides: Partial<OrderDailyWork> = {}): OrderDailyWork {
  return { id: `day-${sequence}`, sequence, workDate: `2026-10-${String(sequence + 1).padStart(2, "0")}`,
    sourceRow: 5000 + sequence, sourceOrderedAt: "2026-10-01T10:00:00+07:00", quantity: 1,
    grossMinor: 320_000, rateMinor: 320_000, hours: 12, status: "pending",
    workerAssignments: [worker(name)], ...overrides };
}
function order(days = [day(1), day(2)], totalDays = 30): Order {
  return { id: "gsheet:test:MUTASI_FH:ref:xday1", orderNumber: "XDAY1", externalReference: "XDAY1", source: "G2G",
    game: "AION", orderName: "1 Month Package (12 Hours/Day)", service: "1 Month Package (12 Hours/Day)",
    process: "JOKI", orderType: "boosting", quantity: days.reduce((sum, d) => sum + (d.quantity ?? 1), 0),
    grossMinor: days.reduce((sum, d) => sum + d.grossMinor, 0), rateMinor: 320_000,
    workerAssignments: [worker("PARENT", 30)], operationalStatus: "assigned", financeStatus: "pending",
    expectedPaymentMinor: days.reduce((sum, d) => sum + d.grossMinor, 0), matchedPaymentMinor: 0,
    orderedAt: "2026-09-01T00:00:00.000Z", dueAt: "2026-10-31T00:00:00.000Z",
    scheduleMode: "daily", scheduleTotalDays: totalDays, dailyHours: 12, dailyWork: days };
}
function state(value: Order, locked = false, date = "2026-10-07"): WorkspaceState {
  return { [K.orders]: [value], [K.employees]: [], [K.advances]: [], [K.closings]: [],
    [K.settings]: { defaultSharePercent: 50, employeeSharePercent: {}, adjustments: {} },
    ...(locked ? { [K.lock]: { id: "lock", from: `${date}T00:00`, to: `${date}T23:59`, lockedAt: NOW, lockedBy: "Admin" } } : {}) };
}
function verified(d: OrderDailyWork, timestamp = NOW): OrderDailyWork {
  return { ...d, status: "verified", completedAt: timestamp, verifiedAt: timestamp };
}

test("completing DAY2 of30 immediately pays only its worker, DAY value and assigned units", () => {
  const source = order([day(1), day(2), day(3)]);
  const before = structuredClone(source);
  const patch = replaceDailyWorkStatus(source, "day-2", "verified", NOW);
  const changed = { ...source, ...patch };
  assert.equal(changed.operationalStatus, "partially_completed");
  assert.equal(changed.verifiedAt, undefined);
  assert.equal(changed.dailyWork![0], source.dailyWork![0]);
  assert.equal(changed.dailyWork![2], source.dailyWork![2]);
  assert.deepEqual(source, before);
  assert.equal(isPayrollEligible(changed), true);
  const salary = buildLivePayrollRows([changed]);
  assert.equal(salary.length, 1);
  assert.equal(salary[0].employee, "WORKER2");
  assert.equal(salary[0].units, 1);
  assert.equal(salary[0].gross, 320_000);
  assert.equal(salary[0].earning, 160_000);
  assert.deepEqual(salary[0].orderRefs, ["XDAY1 D2"]);
  assert.doesNotThrow(() => validateWorkspaceEdit(state(source), state(changed)));
});

test("shared DAY workers retain their own fractional units and existing equal gross split", () => {
  const d = verified(day(2, "A", { quantity: 3, grossMinor: 960_001, workerAssignments: [worker("A", 1), worker("B", 2)] }));
  const rows = buildLivePayrollRows([order([day(1), d])]);
  assert.deepEqual(rows.map(r => [r.employee, r.units, r.gross]), [["A", 1, 480_001], ["B", 2, 480_000]]);
  assert.equal(rows.reduce((sum, r) => sum + r.units, 0), 3);
  assert.equal(rows.reduce((sum, r) => sum + r.gross, 0), d.grossMinor);
});

test("undefined legacy DAY workers inherit actual parent proportions normalized to this DAY", () => {
  const source = order([day(1, "", { quantity: 2, workerAssignments: undefined })]);
  source.workerAssignments = [worker("A", 10), worker("B", 30)];
  const before = structuredClone(source);
  assert.deepEqual(getDailyAssignments(source, source.dailyWork![0]).map(w => [w.employeeCode, w.quantity]), [["A", 0.5], ["B", 1.5]]);
  assert.equal(getDailyPayrollValidationError(source, source.dailyWork![0]), undefined);
  assert.deepEqual(source, before);
  source.workerAssignments = undefined;
  source.employeeCode = "LEGACY"; source.employeeName = "Legacy"; source.team = "FH1"; source.quantity = 30;
  assert.equal(getDailyAssignments(source, source.dailyWork![0])[0].quantity, 2);
  const completed = { ...source, ...replaceDailyWorkStatus(source, "day-1", "verified", NOW) };
  assert.equal(completed.dailyWork![0].workerAssignments![0].quantity, 2);
  const changedParent = { ...completed, employeeCode: "OTHER", employeeName: "Other", workerAssignments: [worker("OTHER", 30)] };
  assert.equal(getDailyAssignments(changedParent, completed.dailyWork![0])[0].employeeCode, "LEGACY");
});

test("explicit empty DAY workers never borrow workers or salary from another DAY or parent", () => {
  const empty = verified(day(2, "", { workerAssignments: [] }));
  const source = order([verified(day(1)), empty]);
  assert.deepEqual(getDailyAssignments(source, empty), []);
  assert.match(getDailyPayrollValidationError(source, empty)!, /belum mempunyai karyawan/);
  assert.deepEqual(buildLivePayrollRows([source]).map(r => r.employee), ["WORKER1"]);
  assert.throws(() => replaceDailyWorkStatus(order([day(1), day(2, "", { workerAssignments: [] })]), "day-2", "verified", NOW), /belum mempunyai karyawan/);
});

test("selected DAY validation does not reject unrelated pending or unchanged legacy DAY allocations", () => {
  const unrelated = day(1, "", { workerAssignments: [], quantity: 3 });
  const source = order([unrelated, day(2)]);
  const changed = { ...source, ...replaceDailyWorkStatus(source, "day-2", "verified", NOW) };
  assert.equal(changed.dailyWork![0], unrelated);
  assert.doesNotThrow(() => validateWorkspaceEdit(state(source), state(changed)));
  const oldBad = verified(unrelated, "2026-10-06T03:00:00.000Z");
  const legacy = order([oldBad, day(2)]);
  const next = { ...legacy, ...replaceDailyWorkStatus(legacy, "day-2", "verified", NOW) };
  assert.doesNotThrow(() => validateWorkspaceEdit(state(legacy), state(next)));
  assert.deepEqual(buildLivePayrollRows([next]).map(r => r.employee), ["WORKER2"]);
});

test("selected allocation mismatch and tiny real mismatch cannot be verified or forged through workspace save", () => {
  for (const d of [day(2, "A", { workerAssignments: [worker("A", 2)] }),
    day(2, "A", { quantity: 1e-7, workerAssignments: [worker("A", 2e-7)] })]) {
    const source = order([day(1), d]);
    const before = structuredClone(source);
    assert.throws(() => replaceDailyWorkStatus(source, d.id, "verified", NOW), /Jumlah pembagian/);
    const next = { ...source, dailyWork: [source.dailyWork![0], verified(d)] };
    assert.throws(() => validateWorkspaceEdit(state(source), state(next)), /Jumlah pembagian/);
    assert.deepEqual(source, before);
  }
  const fractional = day(2, "A", { quantity: 0.3, workerAssignments: [worker("A", 0.1), worker("B", 0.2)] });
  assert.equal(getDailyPayrollValidationError(order([fractional]), fractional), undefined);
});

test("repeated DAY completion preserves its clock and paid markers guard direct status edits", () => {
  const completed = verified(day(2), "2026-10-06T03:00:00.000Z");
  const source = order([day(1), completed]);
  assert.deepEqual(replaceDailyWorkStatus(source, completed.id, "verified", NOW), {});
  assert.equal(source.dailyWork![1].verifiedAt, "2026-10-06T03:00:00.000Z");
  for (const marker of [{ payrollClosedAt: NOW }, { payrollPeriodId: "closing-only" }]) {
    const paid = order([day(1), { ...completed, ...marker }]);
    assert.throws(() => replaceDailyWorkStatus(paid, completed.id, "on_hold", NOW), /Tutup Buku/);
    assert.equal(buildLivePayrollRows([paid]).length, 0);
  }
  assert.throws(() => replaceDailyWorkStatus({ ...source, payrollPeriodId: "parent-closed" }, "day-1", "verified", NOW), /Tutup Buku/);
});

test("Closing period and snapshot use only selected verified DAY clock, workers, quantities and gross", () => {
  const d1 = verified(day(1), "2026-10-06T03:00:00.000Z");
  const d2 = verified(day(2, "SECOND", { quantity: 2, grossMinor: 640_000, workerAssignments: [worker("SECOND", 2)] }));
  const source = order([d1, d2, day(3)]);
  const selected = dailySegmentsForPeriod(source, Date.parse("2026-10-06T17:00:00Z"), Date.parse("2026-10-07T16:59:59Z"));
  assert.deepEqual(selected.map(d => d.id), [d2.id]);
  const slice = createDailyPayrollSlice(source, selected);
  assert.equal(slice.quantity, 2); assert.equal(slice.grossMinor, 640_000); assert.equal(slice.rateMinor, 320_000);
  assert.equal(slice.employeeName, "SECOND");
  assert.deepEqual(slice.workerAssignments, [worker("SECOND", 2)]);
  assert.deepEqual(slice.dailyWork!.map(d => [d.id, d.workDate, d.sourceOrderedAt, d.verifiedAt]), [[d2.id, d2.workDate, d2.sourceOrderedAt, NOW]]);
  const result = closeWorkspace(state(source, true), "2026-10-07T05:00:00.000Z");
  assert.equal(result.record.totalOrderMinor, 640_000);
  assert.equal(result.record.totalPayrollMinor, 320_000);
  assert.deepEqual(result.payroll.map(r => [r.employee, r.units, r.gross]), [["SECOND", 2, 640_000]]);
  const updated = (result.state[K.orders] as Order[])[0];
  assert.deepEqual(updated.dailyWork![0], d1); assert.deepEqual(updated.dailyWork![2], source.dailyWork![2]);
  assert.equal(updated.dailyWork![1].payrollPeriodId, result.record.id);
  assert.equal(updated.payrollClosedAt, undefined); assert.equal(updated.payrollPeriodId, undefined);
  assert.equal(updated.financeStatus, "pending");
});

test("Closing all recorded sparse DAYs leaves parent open for future work and excludes paid salary", () => {
  const source = order([verified(day(1)), verified(day(2))], 30);
  const before = structuredClone(source);
  const result = closeWorkspace(state(source, true), NOW);
  const updated = (result.state[K.orders] as Order[])[0];
  assert.deepEqual(source, before);
  assert.equal(result.record.totalOrderMinor, 640_000);
  assert.equal(updated.payrollClosedAt, undefined); assert.equal(updated.financeStatus, "pending");
  assert.equal(buildLivePayrollRows([updated]).length, 0);
  const next = { ...updated, quantity: 3, grossMinor: 960_000, dailyWork: [...updated.dailyWork!, day(3)] };
  const previousState = { ...result.state }; delete previousState[K.lock];
  assert.doesNotThrow(() => validateWorkspaceEdit(previousState, { ...previousState, [K.orders]: [next] }));
});

test("only a full unique schedule1..N can close the parent and later Closing does not pay prior DAY twice", () => {
  const paid = { ...verified(day(1), "2026-10-06T03:00:00.000Z"), payrollClosedAt: "2026-10-06T05:00:00.000Z", payrollPeriodId: "old-closing" };
  const source = order([paid, verified(day(2))], 2);
  const result = closeWorkspace(state(source, true), NOW);
  const updated = (result.state[K.orders] as Order[])[0];
  assert.equal(updated.payrollClosedAt, NOW); assert.equal(updated.financeStatus, "closed");
  assert.equal(result.record.totalOrderMinor, 320_000);
  assert.deepEqual(result.payroll.map(r => r.employee), ["WORKER2"]);
  assert.deepEqual(updated.dailyWork![0], paid);
  for (const rows of [[day(2), day(2)], [day(1), day(3)], [day(1)], []]) assert.equal(hasCompleteDailySchedule(rows, 2), false);
  assert.equal(hasCompleteDailySchedule([day(2), day(1)], 2), true);
  const duplicate = order([verified(day(2)), verified(day(2, "OTHER", { id: "different-id" }))], 2);
  assert.throws(() => closeWorkspace(state(duplicate, true), NOW), /urutan hari pekerjaan duplikat/);
});

test("server protects closed DAY byte-for-byte including period-only markers and parent removal", () => {
  const paid = { ...verified(day(1)), payrollPeriodId: "closed-period-only" };
  const source = order([paid, day(2)]);
  const changed = { ...source, ...replaceDailyWorkStatus(source, "day-2", "verified", NOW) };
  assert.doesNotThrow(() => validateWorkspaceEdit(state(source), state(changed)));
  for (const next of [{ ...changed, dailyWork: [{ ...paid, grossMinor: 1 }, changed.dailyWork![1]] },
    { ...changed, dailyWork: [changed.dailyWork![1]] }]) {
    assert.throws(() => validateWorkspaceEdit(state(source), state(next)), /sudah masuk Closing/);
  }
  assert.throws(() => validateWorkspaceEdit(state(source), { ...state(source), [K.orders]: [] }), /hari yang sudah masuk Closing/);
  const unclosed = order();
  const forged = { ...unclosed, dailyWork: [{ ...unclosed.dailyWork![0], payrollPeriodId: "forged" }, unclosed.dailyWork![1]] };
  assert.throws(() => validateWorkspaceEdit(state(unclosed), state(forged)), /Closing harian harus diproses di server/);
  const legacyPaid = { ...paid, workerAssignments: undefined };
  const legacy = order([legacyPaid, day(2)]);
  const reassigned = { ...legacy, workerAssignments: [worker("REPLACEMENT", 30)] };
  assert.throws(() => validateWorkspaceEdit(state(legacy), state(reassigned)), /Karyawan hari yang sudah masuk Closing/);
});

test("Closing rejects selected unallocated verified DAY while unrelated unfinished bad DAY stays unchanged", () => {
  const invalid = verified(day(2, "", { workerAssignments: [] }));
  const source = order([day(1), invalid]);
  const before = structuredClone(source);
  assert.throws(() => closeWorkspace(state(source, true), NOW), /belum mempunyai karyawan/);
  assert.deepEqual(source, before);
  const unrelated = day(1, "", { workerAssignments: [] });
  const valid = order([unrelated, verified(day(2))]);
  const result = closeWorkspace(state(valid, true), NOW);
  assert.deepEqual((result.state[K.orders] as Order[])[0].dailyWork![0], unrelated);
  assert.equal(result.record.totalOrderMinor, 320_000);
});

test("unconsumed parent stock cannot become payable through direct DAY, forged save or Closing", () => {
  const source = order([day(1), day(2)]);
  source.inventoryAllocations = [{ id: "alloc", inventoryStockId: "stock", stockType: "item", game: "AION",
    itemName: "item", locationName: "Warehouse", employeeCode: "PARENT", employeeName: "PARENT", team: "FH1", quantity: 1 }];
  assert.throws(() => replaceDailyWorkStatus(source, "day-2", "verified", NOW), /Stok pesanan belum diproses/);
  const forged = { ...source, dailyWork: [source.dailyWork![0], verified(source.dailyWork![1])] };
  assert.throws(() => validateWorkspaceEdit(state(source), state(forged)), /Stok pesanan belum diproses/);
  assert.equal(buildLivePayrollRows([forged]).length, 0);
  assert.throws(() => closeWorkspace(state(forged, true), NOW), /Stok pesanan belum diproses/);
  const consumed = { ...source, inventoryConsumedAt: "2026-10-06T03:00:00.000Z" };
  assert.doesNotThrow(() => replaceDailyWorkStatus(consumed, "day-2", "verified", NOW));
  const updated = { ...consumed, ...replaceDailyWorkStatus(consumed, "day-2", "verified", NOW) };
  assert.equal(buildLivePayrollRows([updated])[0].gross, 320_000);
  assert.equal(updated.inventoryConsumedAt, consumed.inventoryConsumedAt);
});

test("daily packages without recorded DAYs never fall back to completing or paying the whole parent", () => {
  for (const dailyWork of [[], undefined]) {
    const source = { ...order(), dailyWork, operationalStatus: "verified" as const, verifiedAt: NOW };
    assert.equal(isPayrollEligible(source), false);
    assert.deepEqual(buildLivePayrollRows([source]), []);
    assert.throws(() => closeWorkspace(state(source, true), NOW), /Tidak ada order atau pekerjaan harian selesai/);
    assert.throws(() => replaceDailyWorkStatus(source, "day-1", "verified", NOW), /Hari pekerjaan tidak ditemukan/);
    const result = applyBulkMutationAction([source], [source.id], "complete", { now: NOW });
    assert.deepEqual(result.changedIds, []);
    assert.equal(result.skipped[0].code, "day_required");
    assert.equal(result.orders[0], source);
  }
});

test("legacy whole-package Closing references block direct DAY edits and repayment while explicit partial Closing stays open", () => {
  for (const record of [{ id: "legacy-closing", orderRefs: [" xday1 "] },
    { id: "legacy-closing", ordersSnapshot: [{ externalReference: " xday1 " }] }]) {
    const source = order();
    const previous = { ...state(source), [K.closings]: [record] };
    const before = structuredClone(previous);
    const changed = { ...source, ...replaceDailyWorkStatus(source, "day-2", "verified", NOW) };
    assert.throws(() => validateWorkspaceEdit(previous, { ...previous, [K.orders]: [changed] }), /Closing lama/);
    assert.throws(() => validateWorkspaceEdit(previous, { ...previous, [K.orders]: [] }), /Closing lama/);
    assert.throws(() => closeWorkspace({ ...state(changed, true), [K.closings]: [record] }, NOW), /Tidak ada order atau pekerjaan harian selesai/);
    const active = { ...order([verified(day(2, "ACTIVE"))]), id: "active", externalReference: "XACTIVE", orderNumber: "XACTIVE" };
    const mixed = { ...state(changed, true), [K.orders]: [changed, active], [K.closings]: [record] };
    const result = closeWorkspace(mixed, NOW);
    assert.deepEqual(result.record.orderRefs, ["XACTIVE"]);
    assert.equal(result.record.totalOrderMinor, 320_000);
    assert.deepEqual((result.state[K.orders] as Order[])[0], changed);
    assert.deepEqual(previous, before);

    const closed = { ...verified(day(1)), payrollPeriodId: record.id, payrollClosedAt: NOW };
    const partial = order([closed, day(2)]);
    const partialState = { ...previous, [K.orders]: [partial] };
    const partialNext = { ...partial, ...replaceDailyWorkStatus(partial, "day-2", "verified", NOW) };
    assert.doesNotThrow(() => validateWorkspaceEdit(partialState, { ...partialState, [K.orders]: [partialNext] }));
    const partialResult = closeWorkspace({ ...state(partialNext, true), [K.closings]: [record] }, NOW);
    assert.deepEqual(partialResult.payroll.map(row => row.employee), ["WORKER2"]);
    assert.equal(partialResult.record.totalOrderMinor, 320_000);
    assert.deepEqual((partialResult.state[K.orders] as Order[])[0].dailyWork![0], closed);
  }
});
