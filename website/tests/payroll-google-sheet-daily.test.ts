import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGoogleSheetDailyOrder, parseGoogleSheetBoostingDays } from "../features/payroll/lib/google-sheet-daily";
import { mergeGoogleSheetPayroll, validateGoogleSheetSyncPayload, type GoogleSheetSyncPayload, type GoogleSheetSyncRow } from "../features/payroll/lib/google-sheet-sync";
import { parentDailyOperationalStatus } from "../features/payroll/lib/daily-orders";
import { validateWorkspace, validateWorkspaceEdit, workspaceKeys as K, type WorkspaceState } from "../features/payroll/lib/workspace-model";
import type { Employee, Order } from "../features/payroll/types/domain";

const headers = ["TANGGAL", "KODE", "GATE", "NAMA BUYER", "NAMA ORDER", "BOOSTER", "FH", "STATUS", "GAME", "PROSES", "JUMLAH", "RATE", "TOTAL"];
const employee = (name: string, team: Employee["team"] = "FH3"): Employee => ({ id: `e-${name}`, code: `EMP-${name}`, name, team, workforceStatus: "FULL", utilization: 0, earningsMinor: 0 });
const employees = ["DAVA", "HUDA", "TEGUH", "IDAN", "INDAH", "ADIT", "SEPTIAN", "FAHRI", "D2"].map(name => employee(name));
const base = (): WorkspaceState => ({ [K.orders]: [], [K.employees]: structuredClone(employees), [K.products]: [{ id: "g1", code: "ARK", name: "ARK", aliases: [], regions: [], active: true }] });
function row(number: number, booster: string, options: { code?: string; title?: string; quantity?: number; rate?: unknown; total?: unknown; date?: string; team?: string } = {}): GoogleSheetSyncRow {
  const values = [options.date ?? "23/09/2026 20:38:49", options.code ?? "X2685", "G2G", "Buyer", options.title ?? "⭐ 1 Week Package (6 Hours/Day)", booster, options.team ?? "3", "START 15:09", "ARK", "JOKI", options.quantity ?? 1, options.rate ?? 160000, options.total ?? 160000];
  return { rowNumber: number, values, display: values.map(String), boosterBlack: false, duplicateCode: true };
}
function payload(rows: GoogleSheetSyncRow[], boundary = 6000): GoogleSheetSyncPayload {
  const leader = [...rows].sort((a, b) => a.rowNumber - b.rowNumber)[0];
  return { version: 1, syncMode: "reconcile", spreadsheetId: "daily-book", sheetName: "MUTASI FH", headerRow: 1,
    newOrdersStartRow: boundary, headers, sentAt: "2026-10-07T02:00:00.000Z",
    rows: [{ ...structuredClone(leader), codeOccurrences: rows.length, dailyPackage: { complete: true, rows: structuredClone(rows) } }] };
}
const imported = (state: WorkspaceState, rows: GoogleSheetSyncRow[]) => mergeGoogleSheetPayroll(state, payload(rows));
const firstOrder = (state: WorkspaceState) => (state[K.orders] as Order[])[0];

test("Boosting DAY suffixes preserve employee names and reject invalid/overlapping marker syntax", () => {
  assert.deepEqual(parseGoogleSheetBoostingDays("EKO3 D2-D4 D7 D8"), { workerName: "EKO3", days: [2, 3, 4, 7, 8] });
  assert.deepEqual(parseGoogleSheetBoostingDays("DAVA DAY 1, DAY2-3"), { workerName: "DAVA", days: [1, 2, 3] });
  assert.equal(parseGoogleSheetBoostingDays("D2"), null);
  assert.equal(parseGoogleSheetBoostingDays("DAVA D1 extra"), null);
  for (const text of ["DAVA D0", "DAVA D367", "DAVA D3-D2", "DAVA D2 D2", "DAVA D2-D3 D3"]) assert.throws(() => parseGoogleSheetBoostingDays(text));
});

test("X2685 seven historical source days create one parent without copying RATE into a package total", () => {
  const rows = [4858, 4990, 5038, 5086, 5136, 5232, 5276].map((number, index) => row(number, `DAVA D${index + 1}`));
  const original = base(), input = payload(rows), before = structuredClone(input);
  const result = mergeGoogleSheetPayroll(original, input), order = firstOrder(result.state);
  assert.equal(result.added, 1); assert.equal(result.skippedHistorical, 0); assert.equal(result.skippedConflicts, 0);
  assert.equal(order.scheduleMode, "daily"); assert.equal(order.scheduleTotalDays, 7); assert.equal(order.dailyHours, 6);
  assert.equal(order.quantity, 7); assert.equal(order.rateMinor, 160000); assert.equal(order.grossMinor, 1120000);
  assert.deepEqual(order.dailyWork?.map(day => [day.sequence, day.quantity, day.rateMinor, day.grossMinor, day.sourceRow, day.workerAssignments?.[0].employeeName]), rows.map((source, index) => [index + 1, 1, 160000, 160000, source.rowNumber, "DAVA"]));
  assert.ok(order.dailyWork?.every(day => day.status === "pending" && !day.verifiedAt && !day.payrollClosedAt));
  assert.deepEqual(input, before); assert.deepEqual(original[K.orders], []); validateWorkspace(result.state); validateWorkspaceEdit(original, result.state);
  const repeated = mergeGoogleSheetPayroll(JSON.parse(JSON.stringify(result.state)) as WorkspaceState, input);
  assert.equal(repeated.unchanged, 1); assert.deepEqual(repeated.state, result.state);
});

test("X2184 records only D1–D17 and splits the D7 D8 row TOTAL exactly", () => {
  const rows: GoogleSheetSyncRow[] = [];
  for (let day = 1; day <= 17; day++) {
    if (day === 8) continue;
    rows.push(row(4233 + day, day === 7 ? "TEGUH D7 D8" : `${day === 1 ? "HUDA" : day >= 16 ? "IDAN" : "TEGUH"} D${day}`, {
      code: "X2184", title: "⭐ 1 Month Package (6 Hours/Day)", quantity: day === 7 ? 2 : 1, rate: 133333, total: day === 7 ? 266666 : 133333,
    }));
  }
  const result = imported(base(), rows), order = firstOrder(result.state);
  assert.equal(order.scheduleTotalDays, 30); assert.equal(order.dailyWork?.length, 17); assert.equal(order.grossMinor, 2266661);
  assert.equal(order.rateMinor, 133333); assert.equal(order.quantity, 17);
  assert.deepEqual(order.dailyWork?.filter(day => day.sourceRow === 4240).map(day => [day.sequence, day.grossMinor]), [[7, 133333], [8, 133333]]);
  assert.equal(parentDailyOperationalStatus(order.dailyWork!.map(day => ({ ...day, status: "verified" })), order.scheduleTotalDays), "partially_completed");
});

test("complete Hours Package DAY markers recover two real days without an Xn title", () => {
  for (const code of ["EGX9207", "EGX9706"]) {
    const rows = [row(355, "DAVA D1", { code, title: "⭐24 Hours Package⭐ Piloting All Activities", rate: 300000, total: 300000 }),
      row(434, "HUDA D2", { code, title: "⭐24 Hours Package⭐ Piloting All Activities", rate: 300000, total: 300000 })];
    const original = base(), result = imported(original, rows), order = firstOrder(result.state);
    assert.equal(result.added, 1); assert.equal(result.skippedConflicts, 0); assert.equal(result.skippedHistorical, 0);
    assert.equal(order.scheduleTotalDays, 2); assert.equal(order.dailyHours, 24); assert.equal(order.quantity, 2);
    assert.equal(order.rateMinor, 300000); assert.equal(order.grossMinor, 600000); assert.equal(order.expectedPaymentMinor, 600000);
    assert.deepEqual(order.dailyWork?.map(day => [day.sequence, day.hours, day.rateMinor, day.grossMinor, day.workerAssignments?.[0].employeeName]),
      [[1, 24, 300000, 300000, "DAVA"], [2, 24, 300000, 300000, "HUDA"]]);
    assert.ok(order.dailyWork?.every(day => day.status === "pending" && !day.verifiedAt && !day.payrollClosedAt));
    validateWorkspaceEdit(original, result.state);
    assert.equal(imported(result.state, rows).unchanged, 1);
    order.sheetSyncLocked = true;
    const before = structuredClone(result.state[K.orders]);
    const locked = imported(result.state, [rows[0], row(434, "HUDA D2", { code, title: rows[0].values[4] as string, rate: 9, total: 9 })]);
    assert.equal(locked.skippedProtected, 1); assert.deepEqual(locked.state[K.orders], before); assert.deepEqual(result.state[K.orders], before);
  }
});

test("Hours Package inference ends at its last explicit DAY and never expands known package bounds", () => {
  const sparse = firstOrder(imported(base(), [row(3, "DAVA D1 D3", { title: "12 Hours Package", quantity: 2 })]).state);
  assert.equal(sparse.scheduleTotalDays, 3); assert.deepEqual(sparse.dailyWork?.map(day => day.sequence), [1, 3]);
  for (const [title, booster] of [["1 Week Package (6 Hours/Day)", "DAVA D8"], ["1 Month Package (6 Hours/Day)", "DAVA D31"],
    ["2 Days Package (6 Hours/Day)", "DAVA D3"], ["12 Hours Package X2", "DAVA D3"],
    ["25 Hours Package", "DAVA D1 D2"], ["Custom Order 12 Hours/Day", "DAVA D1 D2"]]) {
    const result = imported(base(), [row(3, booster, { title, quantity: booster.endsWith("D2") ? 2 : 1 })]);
    assert.equal(result.added, 0, title); assert.equal(result.skippedConflicts, 1, title);
  }
});

test("one explicit D1 on a recognized Hours Package stays one recorded DAY with a valid workspace", () => {
  const original = base(), result = imported(original, [row(3, "DAVA D1", { title: "12 Hours Package" })]), order = firstOrder(result.state);
  assert.equal(result.added, 1); assert.equal(order.scheduleMode, "daily"); assert.equal(order.scheduleTotalDays, 1);
  assert.equal(order.dailyWork?.length, 1); assert.equal(order.dailyWork?.[0].sequence, 1);
  assert.equal(order.dailyWork?.[0].status, "pending"); assert.notEqual(order.operationalStatus, "verified"); assert.equal(order.financeStatus, "pending");
  assert.equal(order.dailyWork?.[0].workerAssignments?.[0].employeeName, "DAVA");
  assert.equal(order.quantity, 1); assert.equal(order.rateMinor, 160000); assert.equal(order.grossMinor, 160000);
  validateWorkspace(result.state); validateWorkspaceEdit(original, result.state);
  assert.equal(parentDailyOperationalStatus([{ ...order.dailyWork![0], status: "verified" }], order.scheduleTotalDays), "verified");
  const onlyD2 = imported(original, [row(3, "DAVA D2", { title: "12 Hours Package" })]), sparse = firstOrder(onlyD2.state);
  assert.equal(sparse.scheduleTotalDays, 2); assert.deepEqual(sparse.dailyWork?.map(day => day.sequence), [2]);
  assert.equal(parentDailyOperationalStatus([{ ...sparse.dailyWork![0], status: "verified" }], sparse.scheduleTotalDays), "partially_completed");
  validateWorkspaceEdit(original, onlyD2.state);
  for (const scheduleTotalDays of [0, -1, 1.5, 367]) assert.throws(() => validateWorkspace({ ...result.state, [K.orders]: [{ ...order, scheduleTotalDays }] }));
});

test("explicit one-Day and Hours Package X1 bounds remain one DAY instead of being inferred upward", () => {
  for (const title of ["1 Day Package (6 Hours/Day)", "12 Hours Package X1", "12 Hours Package ×1"]) {
    const original = base(), result = imported(original, [row(3, "DAVA D1", { title })]), order = firstOrder(result.state);
    assert.equal(result.added, 1, title); assert.equal(order.scheduleMode, "daily"); assert.equal(order.scheduleTotalDays, 1);
    assert.deepEqual(order.dailyWork?.map(day => day.sequence), [1]); assert.equal(order.dailyWork?.[0].status, "pending");
    validateWorkspaceEdit(original, result.state);
    const outOfBounds = imported(original, [row(3, "DAVA D1", { title }), row(4, "DAVA D2", { title })]);
    assert.equal(outOfBounds.added, 0, title); assert.equal(outOfBounds.skippedConflicts, 1, title); assert.deepEqual(outOfBounds.state[K.orders], []);
  }
});

test("odd row TOTAL preserves every rupiah and each source DAY RATE across mixed rates", () => {
  const order = firstOrder(imported(base(), [row(3, "DAVA D1 D2", { quantity: 2, rate: 100, total: 201 }), row(4, "DAVA D3", { rate: 150, total: 150 })]).state);
  assert.deepEqual(order.dailyWork?.map(day => [day.sequence, day.rateMinor, day.grossMinor]), [[1, 100, 101], [2, 100, 100], [3, 150, 150]]);
  assert.equal(order.rateMinor, undefined); assert.equal(order.grossMinor, 351); assert.equal(order.expectedPaymentMinor, 351);
  assert.ok(order.importIssues?.some(issue => issue.code === "sheet_daily_rate_review"));
});

test("shared workers preserve work units for one DAY and several DAYs", () => {
  for (const [booster, quantity, expectedDays] of [["INDAH ADIT D2", 2, [2]], ["INDAH ADIT D2 D3", 4, [2, 3]]] as const) {
    const order = firstOrder(imported(base(), [row(3, booster, { quantity, rate: 168000, total: quantity * 168000 })]).state);
    assert.equal(order.quantity, quantity); assert.equal(order.grossMinor, quantity * 168000);
    assert.deepEqual(order.dailyWork?.map(day => [day.sequence, day.quantity, day.grossMinor, day.workerAssignments?.map(worker => [worker.employeeName, worker.quantity])]), expectedDays.map(sequence => [sequence, 2, 336000, [["INDAH", 1], ["ADIT", 1]]]));
  }
});

test("multiline workers stay attached to their DAY; fractional effort is explicit for review", () => {
  const order = firstOrder(imported(base(), [row(3, "SEPTIAN FAHRI D5\nSEPTIAN D6", { quantity: 2, rate: 205714, total: 411428 })]).state);
  assert.deepEqual(order.dailyWork?.map(day => [day.sequence, day.quantity, day.grossMinor, day.workerAssignments?.map(worker => [worker.employeeName, worker.quantity])]), [[5, 1, 205714, [["SEPTIAN", 0.5], ["FAHRI", 0.5]]], [6, 1, 205714, [["SEPTIAN", 1]]]]);
  assert.ok(order.dailyWork?.[0].issues?.some(issue => issue.code === "sheet_daily_worker_share_review"));
  validateWorkspace(imported(base(), [row(3, "SEPTIAN FAHRI D5\nSEPTIAN D6", { quantity: 2 })]).state);
});

test("exact full worker names win; ambiguous or missing segmentation leaves work unallocated for review", () => {
  const state = base(); (state[K.employees] as Employee[]).push(employee("INDAH ADIT"));
  const exact = firstOrder(imported(state, [row(3, "INDAH ADIT D1", { quantity: 2 })]).state);
  assert.deepEqual(exact.dailyWork?.[0].workerAssignments?.map(worker => [worker.employeeName, worker.quantity]), [["INDAH ADIT", 2]]);
  for (const names of [[], ["ALFA", "ALFA BETA", "BETA GAMMA", "GAMMA"]]) {
    const state = base(); (state[K.employees] as Employee[]).push(...names.map(name => employee(name)));
    const result = imported(state, [row(3, names.length ? "ALFA BETA GAMMA D1" : "UNKNOWN D1")]);
    assert.equal(result.added, 1); assert.deepEqual(firstOrder(result.state).dailyWork?.[0].workerAssignments, []);
    assert.ok(firstOrder(result.state).importIssues?.some(issue => issue.code === "sheet_daily_workers_review"));
  }
});

test("plain Gold worker named D2 and suffixed worker EKO3 stay ordinary identities", () => {
  const state = base(); (state[K.employees] as Employee[]).push(employee("EKO3"));
  const gold = row(6001, "D2", { title: "40M SKADI", quantity: 40, rate: 1000, total: 40000 });
  gold.values[9] = "F2F"; gold.display![9] = "F2F"; gold.duplicateCode = false;
  const input = payload([gold]); delete input.rows[0].dailyPackage;
  const result = mergeGoogleSheetPayroll(state, input);
  assert.equal(firstOrder(result.state).employeeName, "D2"); assert.equal(firstOrder(result.state).scheduleMode, undefined);
  assert.equal(firstOrder(imported(state, [row(3, "EKO3 D1")]).state).dailyWork?.[0].workerAssignments?.[0].employeeName, "EKO3");
});

test("complete daily groups recover before Closing but ordinary unknown history remains excluded", () => {
  const input = payload([row(3, "DAVA D1")]);
  const normal = row(4, "DAVA", { code: "OLD-NORMAL", title: "12 Hours Package" }); normal.duplicateCode = false;
  input.rows.push(normal);
  const result = mergeGoogleSheetPayroll(base(), input);
  assert.equal(result.added, 1); assert.equal(result.skippedHistorical, 1); assert.equal((result.state[K.orders] as Order[]).length, 1);
});

test("overlapping DAY, reused KODE scopes, missing markers and bad work units fail atomically with diagnostics", () => {
  const cases: GoogleSheetSyncRow[][] = [
    [row(3, "DAVA D1"), row(4, "DAVA D1")], [row(3, "DAVA D8")], [row(3, "DAVA D1", { quantity: 0 })],
    [row(3, "DAVA D1 D2", { quantity: 3 })], [row(3, "DAVA D1", { total: "bad" })],
    [row(3, "DAVA D1", { title: "40M SKADI" })], [row(3, "DAVA D1"), row(4, "DAVA")],
    [row(3, "DAVA D1"), row(4, "DAVA D2", { code: "OTHER" })],
  ];
  for (const field of [2, 3, 4, 8, 9]) {
    const second = row(4, "DAVA D2"); second.values[field] = "DIFFERENT"; second.display![field] = "DIFFERENT";
    cases.push([row(3, "DAVA D1"), second]);
  }
  for (const rows of cases) {
    const result = imported(base(), rows);
    assert.equal(result.added, 0); assert.equal(result.skippedConflicts, 1); assert.equal(result.skippedHistorical, 0);
    assert.deepEqual(result.state[K.orders], []); assert.ok(result.issues[0]?.message);
  }
});

test("full group proof requires exact CODE occurrences and a matching minimum-row leader", () => {
  for (const mutation of ["count", "leader", "contents"] as const) {
    const input = payload([row(3, "DAVA D1"), row(4, "DAVA D2")]);
    if (mutation === "count") input.rows[0].codeOccurrences = 3;
    else if (mutation === "leader") input.rows[0].rowNumber = 4;
    else input.rows[0].values[12] = 999;
    const result = mergeGoogleSheetPayroll(base(), input);
    assert.equal(result.skippedConflicts, 1); assert.equal(result.added, 0);
  }
});

test("nested package structure rejects recursion, duplicate source rows and excessive raw row counts", () => {
  for (const kind of ["recursive", "duplicate", "incomplete", "header", "too_many"] as const) {
    const input = payload([row(3, "DAVA D1")]), group = input.rows[0].dailyPackage!;
    if (kind === "recursive") group.rows[0].dailyPackage = { complete: true, rows: [] };
    else if (kind === "duplicate") group.rows.push(structuredClone(group.rows[0]));
    else if (kind === "incomplete") (group as { complete: boolean }).complete = false;
    else if (kind === "header") group.rows[0].rowNumber = 1;
    else group.rows = Array.from({ length: 367 }, (_, index) => row(3 + index, "DAVA D1"));
    assert.throws(() => validateGoogleSheetSyncPayload(input));
  }
});

test("physical row moves keep parent and DAY identities while refreshing source provenance", () => {
  const initial = imported(base(), [row(3, "DAVA D1"), row(4, "DAVA D2")]), old = firstOrder(initial.state);
  old.dailyWork![0].id = "legacy-day-1"; old.dailyWork![0].status = "in_progress";
  const result = imported(initial.state, [row(30, "DAVA D1"), row(20, "DAVA D2")]), order = firstOrder(result.state);
  assert.equal(result.updated, 1); assert.equal(order.id, old.id); assert.equal(order.importSourceRow, 20);
  assert.deepEqual(order.dailyWork?.map(day => [day.sequence, day.id, day.sourceRow, day.status]), [[1, "legacy-day-1", 30, "in_progress"], [2, "sheet-day:2", 20, "pending"]]);
});

test("settled daily segments stay byte-identical while open days refresh and new days append", () => {
  const initial = imported(base(), [row(3, "HUDA D1"), row(4, "TEGUH D2")]), old = firstOrder(initial.state);
  Object.assign(old.dailyWork![0], { id: "paid-day", status: "verified", completedAt: "2026-09-23T16:00:00Z", verifiedAt: "2026-09-23T16:00:00Z", payrollClosedAt: "2026-09-24T16:00:00Z", payrollPeriodId: "closing-1" });
  old.operationalStatus = "partially_completed";
  initial.state[K.closings] = [{ id: "closing-1", orderRefs: [old.externalReference] }];
  old.dailyWork![1].status = "on_hold";
  const frozen = structuredClone(old.dailyWork![0]), original = structuredClone(initial.state);
  const result = imported(initial.state, [row(30, "IDAN D1", { rate: 9, total: 9 }), row(40, "DAVA D2", { total: 170000 }), row(50, "DAVA D3")]), order = firstOrder(result.state);
  assert.equal(result.updated, 1); assert.deepEqual(order.dailyWork![0], frozen); assert.deepEqual(initial.state, original);
  assert.equal(order.dailyWork![1].status, "on_hold"); assert.equal(order.dailyWork![1].grossMinor, 170000); assert.equal(order.dailyWork![1].workerAssignments?.[0].employeeName, "DAVA");
  assert.equal(order.dailyWork![2].sequence, 3); assert.equal(order.grossMinor, 490000); assert.equal(order.operationalStatus, "partially_completed");
  validateWorkspace(result.state); validateWorkspaceEdit(initial.state, result.state);
  const missing = imported(result.state, [row(40, "DAVA D2", { total: 170000 }), row(50, "DAVA D3")]);
  assert.deepEqual(firstOrder(missing.state).dailyWork![0], frozen, "source deletion never deletes a paid segment");
  validateWorkspaceEdit(result.state, missing.state);
});

test("locks, admin archives, whole Closing, payment, stock and finance protections preserve complete parents", () => {
  const protections: Partial<Order>[] = [
    { sheetSyncLocked: true }, { websiteDeletedAt: "2026-10-06T00:00:00Z", websiteDeletedBy: "Admin" },
    { payrollClosedAt: "2026-10-06T00:00:00Z" }, { payrollPeriodId: "closed" }, { matchedPaymentMinor: 1 },
    { inventoryConsumedAt: "2026-10-06T00:00:00Z" }, { inventoryAllocations: [{ id: "reserved" } as never] },
    ...(["verified", "reconciled", "ready_to_close", "closed"] as const).map(financeStatus => ({ financeStatus })),
    { verifiedAt: "2026-10-06T00:00:00Z" }, { operationalStatus: "verified" },
  ];
  for (const protection of protections) {
    const initial = imported(base(), [row(3, "DAVA D1")]); Object.assign(firstOrder(initial.state), protection);
    const before = structuredClone(initial.state[K.orders]);
    const result = imported(initial.state, [row(3, "HUDA D1", { total: 9 }), row(4, "HUDA D2")]);
    assert.equal(result.skippedProtected, 1); assert.equal(result.updated, 0); assert.deepEqual(result.state[K.orders], before);
  }
  const initial = imported(base(), [row(3, "DAVA D1")]); initial.state[K.closings] = [{ id: "legacy", orderRefs: ["X2685"] }];
  assert.equal(imported(initial.state, [row(3, "DAVA D1"), row(4, "DAVA D2")]).skippedProtected, 1);
});

test("returning source archives restore a valid complete package but manual/foreign identities cannot be replaced", () => {
  const initial = imported(base(), [row(3, "DAVA D1")]); firstOrder(initial.state).sheetDeletedAt = "2026-10-06T00:00:00Z";
  const result = imported(initial.state, [row(3, "DAVA D1")]); assert.equal(result.restored, 1); assert.equal(firstOrder(result.state).sheetDeletedAt, undefined);
  for (const id of ["manual-order", "gsheet:other-book:MUTASI_FH:ref:x2685"]) {
    const initial = imported(base(), [row(3, "DAVA D1")]); firstOrder(initial.state).id = id;
    const before = structuredClone(initial.state[K.orders]);
    const result = imported(initial.state, [row(3, "DAVA D1"), row(4, "DAVA D2")]);
    assert.equal(result.skippedConflicts, 1); assert.deepEqual(result.state[K.orders], before);
  }
});

test("missing daily parents already referenced by Closing are not recreated as new payable work", () => {
  for (const closing of [{ id: "c", orderRefs: ["X2685"] }, { id: "c", ordersSnapshot: [{ externalReference: "X2685" }] }]) {
    const state = base(); state[K.closings] = [closing];
    const before = structuredClone(state);
    const result = imported(state, [row(3, "DAVA D1"), row(4, "DAVA D2")]);
    assert.equal(result.skippedProtected, 1); assert.equal(result.added, 0); assert.deepEqual(result.state, before);
  }
});

test("ordinary duplicate payload rows and flat updates cannot bypass complete-package safety", () => {
  const input = payload([row(3, "DAVA D1")]); input.rows.push(row(4, "DAVA D2"));
  assert.equal(mergeGoogleSheetPayroll(base(), input).added, 0);
  const initial = imported(base(), [row(3, "DAVA D1"), row(4, "DAVA D2")]);
  const flat = payload([row(3, "DAVA D1")]); delete flat.rows[0].dailyPackage; flat.rows[0].duplicateCode = false; flat.rows[0].codeOccurrences = 1;
  const result = mergeGoogleSheetPayroll(initial.state, flat);
  assert.equal(result.skippedConflicts, 1); assert.deepEqual(result.state[K.orders], initial.state[K.orders]);
});

test("settled segments cannot be moved outside a shorter package and duplicate website DAY is not guessed", () => {
  for (const kind of ["shorten", "duplicate"] as const) {
    const initial = imported(base(), [row(3, "DAVA D7")]), order = firstOrder(initial.state);
    Object.assign(order.dailyWork![0], { status: "verified", verifiedAt: "2026-10-06T00:00:00Z" });
    order.operationalStatus = "partially_completed";
    if (kind === "duplicate") order.dailyWork!.push({ ...order.dailyWork![0], id: "duplicate" });
    const rows = kind === "shorten" ? [row(3, "DAVA D1", { title: "3 Days Package (6 Hours/Day)" })] : [row(3, "DAVA D7")];
    const result = imported(initial.state, rows);
    assert.equal(result.skippedConflicts, 1); assert.deepEqual(result.state[K.orders], initial.state[K.orders]);
  }
});

test("pure daily builder rejects unsafe aggregate money before producing a partial schedule", () => {
  const order = firstOrder(imported(base(), [row(3, "DAVA D1")]).state);
  assert.throws(() => buildGoogleSheetDailyOrder([1, 2].map(day => ({ order, sourceRow: day + 2, days: [day], quantity: 1, totalMinor: Number.MAX_SAFE_INTEGER, sourceStatus: "START" }))), /batas rupiah/);
});
