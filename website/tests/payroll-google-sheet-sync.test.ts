import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeGoogleSheetPayroll,
  parseSheetOrderedAt,
  sheetOrderId,
  validateGoogleSheetSyncPayload,
  type GoogleSheetSyncPayload,
} from "../features/payroll/lib/google-sheet-sync";
import { workspaceKeys, type WorkspaceState } from "../features/payroll/lib/workspace-model";
import type { Employee, Order, ProductGame } from "../features/payroll/types/domain";
import { attributeWorkspaceEdit } from "../features/payroll/lib/audit-model";
import { activeSheetOrders } from "../features/payroll/lib/sheet-sync-policy";

const employees: Employee[] = [
  { id: "e1", code: "EMP-IRWAN", name: "Irwan", team: "FH2", workforceStatus: "SHIFT", utilization: 0, earningsMinor: 0 },
  { id: "e2", code: "EMP-FARDAN", name: "Fardan", team: "FH2", workforceStatus: "SHIFT", utilization: 0, earningsMinor: 0 },
  { id: "e3", code: "EMP-FERDI", name: "Ferdi", team: "FH2", workforceStatus: "SHIFT", utilization: 0, earningsMinor: 0 },
  { id: "e4", code: "EMP-INDRA", name: "Indra", team: "FH2", workforceStatus: "SHIFT", utilization: 0, earningsMinor: 0 },
  { id: "e5", code: "EMP-SEM", name: "Sem", team: "FH2", workforceStatus: "SHIFT", utilization: 0, earningsMinor: 0 },
];

const games: ProductGame[] = [
  { id: "g1", code: "RO", name: "Ragnarok Online", aliases: ["RO"], regions: [], active: true },
];

const headers = [
  "", "KODE", "GATE", "NAMA BUYER", "NAMA ORDER", "BOOSTER", "FH",
  "STATUS", "GAME", "PROSES", "JUMLAH", "RATE", "TOTAL", "TASK",
];

function payload(): GoogleSheetSyncPayload {
  return {
    version: 1,
    spreadsheetId: "sheet123",
    spreadsheetName: "EVO GAMING 2026",
    sheetName: "MUTASI FH",
    headers,
    sentAt: "2026-09-25T00:00:00.000Z",
    actor: { email: "admin@example.com" },
    rows: [{
      rowNumber: 5057,
      boosterBlack: true,
      values: [
        "25/09/2026 0:24", "X2821", "G2G", "Vernansyah", "40M SKADI", "", "2",
        "Irwan: 4M\nFardan: 4M\nFerdi: 5M\nIndra: 6M\nSem: 1M",
        "RO", "F2F", 20, 1000, 20000, "Catatan",
      ],
      display: [
        "25/09/2026 0:24", "X2821", "G2G", "Vernansyah", "40M SKADI", "", "2",
        "Irwan: 4M\nFardan: 4M\nFerdi: 5M\nIndra: 6M\nSem: 1M",
        "RO", "F2F", "20", "1.000", "20.000", "Catatan",
      ],
    }],
  };
}

function base(): WorkspaceState {
  return {
    [workspaceKeys.orders]: [],
    [workspaceKeys.employees]: structuredClone(employees),
    [workspaceKeys.products]: structuredClone(games),
  };
}

for (const [header, value, expected] of [["JENIS ORDER", "JASA BOOSTING", "boosting"], ["JENIS", "COIN", "gold"], ["ORDER TYPE", "gold", "gold"], ["TYPE", "ITEM GAME", "item"]]) {
  test(`Sheet explicit ${header}=${value} wins and survives merge`, () => {
    const input = payload(); input.headers = [...headers, header];
    input.rows[0].values.push(value); input.rows[0].display!.push(value);
    const initial = mergeGoogleSheetPayroll(base(), payload());
    const result = mergeGoogleSheetPayroll(initial.state, input);
    assert.equal((result.state[workspaceKeys.orders] as Order[])[0].orderType, expected);
    assert.equal(mergeGoogleSheetPayroll(result.state, input).unchanged, 1);
  });
}
test("legacy JOKI infers Boosting before black Booster Gold inference", () => {
  const input = payload(); input.rows[0].values[9] = "JOKI"; input.rows[0].display![9] = "JOKI";
  assert.equal((mergeGoogleSheetPayroll(base(), input).state[workspaceKeys.orders] as Order[])[0].orderType, "boosting");
});
test("black Booster named quantities infer Gold even before employees are linked", () => {
  const input = payload(); input.rows[0].values[7] = "PERMANA 20M\nFARDAN 30M"; input.rows[0].display![7] = String(input.rows[0].values[7]);
  assert.equal((mergeGoogleSheetPayroll(base(), input).state[workspaceKeys.orders] as Order[])[0].orderType, "gold");
});
test("ambiguous or invalid explicit type stays saved with warning and no type", () => {
  for (const explicit of [false, true]) {
    const input = payload();
    if (explicit) { input.headers = [...headers, "TYPE"]; input.rows[0].values.push("unknown"); input.rows[0].display!.push("unknown"); }
    else { input.rows[0].display![7] = "MULAI JAM 8"; input.rows[0].values[7] = "MULAI JAM 8"; }
    const result = mergeGoogleSheetPayroll(base(), input);
    const order = (result.state[workspaceKeys.orders] as Order[])[0];
    assert.equal(result.added, 1); assert.equal(order.orderType, undefined);
    assert.ok(order.importIssues?.some(issue => issue.code === "sheet_order_type_unknown"));
  }
});

function presence(references: string[] = []): GoogleSheetSyncPayload {
  return { ...payload(), syncMode: "reconcile", rows: [], presence: { complete: true, startRow: 4908, references } };
}

test("complete presence archives only missing source orders and reappearance restores the same ID", () => {
  const initial = mergeGoogleSheetPayroll(base(), payload());
  const archived = mergeGoogleSheetPayroll(initial.state, presence());
  assert.equal(archived.archived, 1);
  assert.equal(activeSheetOrders(archived.state[workspaceKeys.orders] as Order[]).length, 0);
  assert.equal((archived.state[workspaceKeys.orders] as Order[]).length, 1, "full record remains recoverable");
  assert.equal(mergeGoogleSheetPayroll(archived.state, presence()).archived, 0);
  const restored = mergeGoogleSheetPayroll(archived.state, payload());
  assert.equal(restored.restored, 1);
  assert.equal(restored.added, 0);
  assert.equal(activeSheetOrders(restored.state[workspaceKeys.orders] as Order[]).length, 1);
  assert.equal((restored.state[workspaceKeys.orders] as Order[])[0].id, (initial.state[workspaceKeys.orders] as Order[])[0].id);
});

test("locked, manual, other-source, verified, paid and Closing orders survive a source deletion", () => {
  for (const patch of [{ sheetSyncLocked: true }, { id: "manual" }, { id: "gsheet:other:MUTASI_FH:1" }, { verifiedAt: payload().sentAt }, { payrollClosedAt: payload().sentAt }, { matchedPaymentMinor: 1 }, { inventoryConsumedAt: payload().sentAt }]) {
    const initial = mergeGoogleSheetPayroll(base(), payload()).state;
    Object.assign((initial[workspaceKeys.orders] as Order[])[0], patch);
    assert.equal(mergeGoogleSheetPayroll(initial, presence()).archived, 0, JSON.stringify(patch));
  }
});

test("missing rows in partial batches, older periods and moves before start never cause deletion", () => {
  const initial = mergeGoogleSheetPayroll(base(), payload()).state;
  assert.equal(mergeGoogleSheetPayroll(initial, { ...payload(), rows: [] }).archived, 0);
  assert.equal(mergeGoogleSheetPayroll(initial, { ...presence(), presence: { complete: true, startRow: 6000, references: [] } }).archived, 0);
  assert.equal(mergeGoogleSheetPayroll(initial, presence(["X2821"])).archived, 0);
  assert.throws(() => mergeGoogleSheetPayroll(initial, { ...presence(), syncMode: "incremental" }), /lengkap/);
  assert.throws(() => mergeGoogleSheetPayroll(initial, { ...presence(), rows: payload().rows }), /lengkap/);
  assert.throws(() => mergeGoogleSheetPayroll(initial, { ...presence(), presence: { complete: false, startRow: 4908, references: [] } }), /lengkap/);
});

test("only a website admin can toggle a lock; audit identity is stamped and unlocking requests refresh", () => {
  const initial = mergeGoogleSheetPayroll(base(), payload()).state;
  const next = structuredClone(initial);
  (next[workspaceKeys.orders] as Order[])[0].sheetSyncLocked = true;
  assert.throws(() => attributeWorkspaceEdit(initial, next, { id: "member", name: "Member", isAdmin: false }, payload().sentAt), /admin website/);
  const locked = attributeWorkspaceEdit(initial, next, { id: "admin", name: "Admin", isAdmin: true }, payload().sentAt);
  assert.equal((locked[workspaceKeys.orders] as Order[])[0].sheetSyncLockedBy, "Admin");
  const changed = payload(); changed.rows[0].values[4] = changed.rows[0].display![4] = "New sheet title";
  assert.equal(mergeGoogleSheetPayroll(locked, changed).skippedProtected, 1);
  assert.deepEqual(mergeGoogleSheetPayroll(locked, presence()).state, locked);
  const unlock = structuredClone(locked); (unlock[workspaceKeys.orders] as Order[])[0].sheetSyncLocked = false;
  const unlocked = attributeWorkspaceEdit(locked, unlock, { id: "admin", name: "Admin", isAdmin: true }, payload().sentAt);
  assert.deepEqual(mergeGoogleSheetPayroll(unlocked, presence(["X2821"])).refreshReferences, ["X2821"]);
  const result = mergeGoogleSheetPayroll(unlocked, changed);
  assert.equal(result.updated, 1);
  assert.equal((result.state[workspaceKeys.orders] as Order[])[0].sheetSyncRefreshRequested, undefined);
});

test("admin can restore an archive only with a lock; generic callers cannot forge archive metadata", () => {
  const initial = mergeGoogleSheetPayroll(base(), payload()).state;
  const archived = mergeGoogleSheetPayroll(initial, presence()).state;
  const admin = { id: "admin", name: "Admin", isAdmin: true };
  assert.throws(() => attributeWorkspaceEdit(initial, archived, admin, payload().sentAt), /Arsip spreadsheet/);
  const restored = structuredClone(archived); delete (restored[workspaceKeys.orders] as Order[])[0].sheetDeletedAt;
  assert.throws(() => attributeWorkspaceEdit(archived, restored, admin, payload().sentAt), /Arsip spreadsheet/);
  (restored[workspaceKeys.orders] as Order[])[0].sheetSyncLocked = true;
  const saved = attributeWorkspaceEdit(archived, restored, admin, payload().sentAt);
  assert.equal(mergeGoogleSheetPayroll(saved, presence()).archived, 0);
});

test("Google Sheets sync parses WIB date/time correctly", () => {
  assert.equal(parseSheetOrderedAt("25/09/2026 0:24"), "2026-09-24T17:24:00.000Z");
});

test("black BOOSTER reads STATUS as workers while keeping NAMA ORDER", () => {
  const result = mergeGoogleSheetPayroll(base(), payload());
  assert.equal(result.added, 1);
  const order = (result.state[workspaceKeys.orders] as Order[])[0];
  assert.equal(order.orderName, "40M SKADI");
  assert.equal(order.operationalStatus, "draft");
  assert.equal(order.workerAssignments?.length, 5);
  assert.equal(order.workerAssignments?.[0].employeeName, "Irwan");
  assert.equal(order.task, "Catatan");
  assert.equal(order.grossMinor, 20000);
  assert.equal(order.gameId, "g1");
});

test("the same reconciliation payload is idempotent after JSON database persistence", () => {
  const first = mergeGoogleSheetPayroll(base(), payload());
  const persisted = JSON.parse(JSON.stringify(first.state)) as WorkspaceState;
  const second = mergeGoogleSheetPayroll(persisted, payload());
  assert.equal(second.added, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.unchanged, 1);
});

test("manual order with same KODE is never overwritten", () => {
  const imported = mergeGoogleSheetPayroll(base(), payload());
  const synced = (imported.state[workspaceKeys.orders] as Order[])[0];
  const state = base();
  state[workspaceKeys.orders] = [{ ...synced, id: "manual-1", orderName: "Manual" }];
  const result = mergeGoogleSheetPayroll(state, payload());
  assert.equal(result.skippedConflicts, 1);
  assert.equal((result.state[workspaceKeys.orders] as Order[])[0].orderName, "Manual");
});

test("verified synced order is protected from later spreadsheet edits", () => {
  const first = mergeGoogleSheetPayroll(base(), payload());
  const order = (first.state[workspaceKeys.orders] as Order[])[0];
  order.operationalStatus = "verified";
  order.verifiedAt = "2026-09-25T01:00:00.000Z";
  const changed = payload();
  changed.rows[0].values[4] = "CHANGED";
  changed.rows[0].display![4] = "CHANGED";
  const result = mergeGoogleSheetPayroll(first.state, changed);
  assert.equal(result.skippedProtected, 1);
  assert.equal((result.state[workspaceKeys.orders] as Order[])[0].orderName, "40M SKADI");
});

test("FH team label in BOOSTER does not invent an employee", () => {
  const current = payload();
  current.rows[0].boosterBlack = false;
  current.rows[0].values[5] = "FH1";
  current.rows[0].display![5] = "FH1";
  current.rows[0].values[7] = "START";
  current.rows[0].display![7] = "START";
  const result = mergeGoogleSheetPayroll(base(), current);
  const order = (result.state[workspaceKeys.orders] as Order[])[0];
  assert.equal(order.workerAssignments?.length, 0);
  assert.equal(order.team, "FH2"); // Explicit FH column takes precedence over a BOOSTER team label.
  assert.equal(order.operationalStatus, "draft");
});

test("incremental single cell edit leaves all other orders and payroll data unchanged", () => {
  const source = payload();
  const second = structuredClone(source.rows[0]);
  second.rowNumber++;
  second.values[1] = second.display![1] = "OTHER";
  source.rows.push(second);
  const first = mergeGoogleSheetPayroll(base(), source);
  first.state[workspaceKeys.advances] = [{ id: "untouched", amountMinor: 10 }];
  first.state[workspaceKeys.closings] = [];
  const edit = payload();
  edit.syncMode = "incremental";
  edit.rows[0].values[3] = edit.rows[0].display![3] = "New buyer";
  const result = mergeGoogleSheetPayroll(first.state, edit);
  assert.equal(result.updated, 1);
  assert.deepEqual(result.rowResults, [{ rowNumber: 5057, status: "updated" }]);
  assert.deepEqual((result.state[workspaceKeys.orders] as Order[])[1], (first.state[workspaceKeys.orders] as Order[])[1]);
  for (const key of [workspaceKeys.closings, workspaceKeys.advances]) assert.deepEqual(result.state[key], first.state[key]);
});

test("duplicate KODE skips every ambiguous row, even before an order exists", () => {
  const source = payload();
  const duplicate = structuredClone(source.rows[0]);
  duplicate.rowNumber++;
  duplicate.values[1] = duplicate.display![1] = "x2821";
  source.rows.push(duplicate);
  const result = mergeGoogleSheetPayroll(base(), source);
  assert.equal(result.added, 0);
  assert.equal(result.skippedConflicts, 2);
  assert.equal((result.state[workspaceKeys.orders] as Order[]).length, 0);
});

test("incremental duplicate outside edit range is a conflict", () => {
  const source = payload();
  source.syncMode = "incremental";
  source.rows[0].duplicateCode = true;
  assert.equal(mergeGoogleSheetPayroll(base(), source).skippedConflicts, 1);
});

test("deletion, row movement and row reuse never remove or rename an existing KODE", () => {
  const original = payload();
  const first = mergeGoogleSheetPayroll(base(), original);
  // Simulate an order imported by the previous row-ID implementation.
  const old = (first.state[workspaceKeys.orders] as Order[])[0];
  old.id = sheetOrderId(original, old.importSourceRow!);
  const empty = payload(); empty.rows = []; empty.syncMode = "reconcile";
  assert.deepEqual(mergeGoogleSheetPayroll(first.state, empty).state, first.state);
  const moved = payload(); moved.rows[0].rowNumber = 4;
  const movedResult = mergeGoogleSheetPayroll(first.state, moved);
  assert.equal(movedResult.added, 0);
  assert.equal((movedResult.state[workspaceKeys.orders] as Order[])[0].id, old.id);
  const reused = payload();
  reused.rows[0].values[1] = reused.rows[0].display![1] = "NEW-KODE";
  const result = mergeGoogleSheetPayroll(movedResult.state, reused);
  assert.equal(result.added, 1);
  const orders = result.state[workspaceKeys.orders] as Order[];
  assert.equal(orders.length, 2);
  assert.equal(orders[0].externalReference, "X2821");
  assert.equal(orders[1].financeStatus, "pending");
  assert.notEqual(orders[0].id, orders[1].id);
});

test("orders from another spreadsheet cannot be taken over", () => {
  const first = mergeGoogleSheetPayroll(base(), payload());
  const edit = payload(); edit.spreadsheetId = "another-sheet";
  const result = mergeGoogleSheetPayroll(first.state, edit);
  assert.equal(result.skippedConflicts, 1);
  assert.deepEqual(result.state, first.state);
});

test("Closing, payroll period and closed daily work each protect the entire order", () => {
  const protections: Partial<Order>[] = [
    { payrollClosedAt: "2026-09-25T01:00:00Z" },
    { payrollPeriodId: "closing-1" },
    { financeStatus: "closed" },
    { dailyWork: [{ id: "d1", sequence: 1, workDate: "2026-09-25", grossMinor: 100, status: "pending", payrollClosedAt: "2026-09-25T01:00:00Z" }] },
  ];
  for (const protection of protections) {
    const first = mergeGoogleSheetPayroll(base(), payload());
    Object.assign((first.state[workspaceKeys.orders] as Order[])[0], protection);
    const edit = payload(); edit.rows[0].values[4] = edit.rows[0].display![4] = "CHANGED";
    const result = mergeGoogleSheetPayroll(first.state, edit);
    assert.equal(result.skippedProtected, 1);
    assert.deepEqual(result.state, first.state);
  }
  const first = mergeGoogleSheetPayroll(base(), payload());
  first.state[workspaceKeys.closings] = [{ id: "legacy-closing", orderRefs: ["X2821"] }];
  assert.equal(mergeGoogleSheetPayroll(first.state, payload()).skippedProtected, 1);
});

test("STATUS never allocates workers for a nonblack BOOSTER, including text HITAM", () => {
  const source = payload();
  source.rows[0].boosterBlack = false;
  source.rows[0].values[5] = source.rows[0].display![5] = "HITAM";
  const order = (mergeGoogleSheetPayroll(base(), source).state[workspaceKeys.orders] as Order[])[0];
  assert.deepEqual(order.workerAssignments, []);
  assert.equal(order.orderName, "40M SKADI");
});

test("incremental and reconcile retain the mapping and default draft/pending states", () => {
  for (const syncMode of ["incremental", "reconcile"] as const) {
    const source = payload(); source.syncMode = syncMode;
    source.headers = source.headers.map(header => header === "GAME" ? "GIM" : header);
    const order = (mergeGoogleSheetPayroll(base(), source).state[workspaceKeys.orders] as Order[])[0];
    assert.deepEqual([order.externalReference, order.source, order.buyerName, order.orderName,
      order.team, order.game, order.process, order.quantity, order.rateMinor, order.grossMinor, order.task],
    ["X2821", "G2G", "Vernansyah", "40M SKADI", "FH2", "RO", "F2F", 20, 1000, 20000, "Catatan"]);
    assert.equal(order.operationalStatus, "draft");
    assert.equal(order.financeStatus, "pending");
    assert.equal(order.payrollClosedAt, undefined);
    assert.equal(order.verifiedAt, undefined);
  }
});

test("invalid mode and repeated row numbers are rejected, invalid date is skipped", () => {
  assert.throws(() => validateGoogleSheetSyncPayload({ ...payload(), syncMode: "delete" }), /Mode/);
  const repeated = payload(); repeated.rows.push(structuredClone(repeated.rows[0]));
  assert.throws(() => validateGoogleSheetSyncPayload(repeated), /duplikat/);
  const invalid = payload(); invalid.rows[0].values[0] = invalid.rows[0].display![0] = "not a date";
  const result = mergeGoogleSheetPayroll(base(), invalid);
  assert.equal(result.skippedInvalid, 1);
  assert.equal(result.rowResults[0].status, "skippedInvalid");
});

test("a spreadsheet edit updates only an unverified sheet-owned order", () => {
  const first = mergeGoogleSheetPayroll(base(), payload());
  const changed = payload();
  changed.rows[0].values[3] = "Buyer Baru";
  changed.rows[0].display![3] = "Buyer Baru";
  changed.rows[0].values[12] = 25000;
  changed.rows[0].display![12] = "25.000";
  const result = mergeGoogleSheetPayroll(first.state, changed);
  assert.equal(result.updated, 1);
  const order = (result.state[workspaceKeys.orders] as Order[])[0];
  assert.equal(order.buyerName, "Buyer Baru");
  assert.equal(order.grossMinor, 25000);
});


test("black BOOSTER worker list also parses when Google Sheets only visually wraps the text", () => {
  const current = payload();
  current.rows[0].values[7] = "Irwan 4M Fardan 4M Ferdi 5M Indra 6M Sem 1M";
  current.rows[0].display![7] = "Irwan 4M Fardan 4M Ferdi 5M Indra 6M Sem 1M";
  const result = mergeGoogleSheetPayroll(base(), current);
  const order = (result.state[workspaceKeys.orders] as Order[])[0];
  assert.deepEqual(order.workerAssignments?.map(row => [row.employeeName, row.quantity]), [
    ["Irwan", 4],
    ["Fardan", 4],
    ["Ferdi", 5],
    ["Indra", 6],
    ["Sem", 1],
  ]);
});

function monetaryPayload(rate: unknown, total: unknown, displayRate = String(rate ?? ""), displayTotal = String(total ?? "")) {
  const source = payload();
  source.rows[0].values[11] = rate;
  source.rows[0].values[12] = total;
  source.rows[0].display![11] = displayRate;
  source.rows[0].display![12] = displayTotal;
  return source;
}

test("numeric Sheet RATE/TOTAL take precedence over formatted decimal display", () => {
  const source = monetaryPayload(2200, 44000, "Rp 2.200,0", "Rp 44.000,0");
  const snapshot = structuredClone(source);
  const result = mergeGoogleSheetPayroll(base(), source);
  const order = (result.state[workspaceKeys.orders] as Order[])[0];
  assert.equal(order.rateMinor, 2200);
  assert.equal(order.grossMinor, 44000);
  assert.equal(order.quantity, 20);
  assert.deepEqual(source, snapshot);
});

test("text RATE/TOTAL preserve decimals in Indonesian and English currency formats", () => {
  const formats = [
    ["2200.0", "44000.0"], ["2200,0", "44000,0"],
    ["2.200,0", "44.000,0"], ["2,200.0", "44,000.0"],
    ["Rp 2.200,00", "Rp 44.000,00"], ["Rp. 2.200,00", "Rp. 44.000,00"],
    ["IDR 2,200.00", "IDR 44,000.00"], ["$2,200.0", "$44,000.0"],
    ["2.200", "44.000"], ["2,200", "44,000"],
    ["2\u00a0200,0", "44\u00a0000,0"], ["2200.000", "44000.000"],
  ];
  for (const [rate, total] of formats) {
    const order = (mergeGoogleSheetPayroll(base(), monetaryPayload(rate, total)).state[workspaceKeys.orders] as Order[])[0];
    assert.equal(order.rateMinor, 2200, rate);
    assert.equal(order.grossMinor, 44000, total);
    assert.equal(order.expectedPaymentMinor, 44000, total);
  }
});

test("formatted money rounds decimal rupiah and validates repeated thousands groups", () => {
  for (const [rate, total, expectedRate, expectedTotal] of [
    ["Rp 2.200,49", "Rp 44.000,50", 2200, 44001],
    ["2,200.50", "44,000.49", 2201, 44000],
    ["1.234.567,00", "24.691.340,00", 1234567, 24691340],
    ["1,234,567.00", "24,691,340.00", 1234567, 24691340],
    ["1.234.567", "24.691.340", 1234567, 24691340],
    ["1,234,567", "24,691,340", 1234567, 24691340],
  ] as const) {
    const order = (mergeGoogleSheetPayroll(base(), monetaryPayload(rate, total)).state[workspaceKeys.orders] as Order[])[0];
    assert.equal(order.rateMinor, expectedRate, rate);
    assert.equal(order.grossMinor, expectedTotal, total);
  }
});

test("zero and blank money stay distinct and decimal display remains a valid fallback", () => {
  const zero = (mergeGoogleSheetPayroll(base(), monetaryPayload(0, 0, "2.200,0", "44.000,0")).state[workspaceKeys.orders] as Order[])[0];
  assert.equal(zero.rateMinor, 0);
  assert.equal(zero.grossMinor, 0);
  const blank = (mergeGoogleSheetPayroll(base(), monetaryPayload("", "")).state[workspaceKeys.orders] as Order[])[0];
  assert.equal(blank.rateMinor, undefined);
  assert.equal(blank.grossMinor, 0);
  const displayed = (mergeGoogleSheetPayroll(base(), monetaryPayload(null, undefined, "2.200,0", "44.000,0")).state[workspaceKeys.orders] as Order[])[0];
  assert.equal(displayed.rateMinor, 2200);
  assert.equal(displayed.grossMinor, 44000);
  const totalFromRate = (mergeGoogleSheetPayroll(base(), monetaryPayload("2.200,0", "")).state[workspaceKeys.orders] as Order[])[0];
  assert.equal(totalFromRate.rateMinor, 2200);
  assert.equal(totalFromRate.grossMinor, 44000);
});

test("negative formatted amounts preserve their sign and stay marked for review", () => {
  for (const [rate, total] of [["Rp -2.200,0", "Rp -44.000,0"], ["-Rp 2.200,0", "-Rp 44.000,0"], ["(Rp 2.200,0)", "(Rp 44.000,0)"]]) {
    const order = (mergeGoogleSheetPayroll(base(), monetaryPayload(rate, total)).state[workspaceKeys.orders] as Order[])[0];
    assert.equal(order.rateMinor, -2200, rate);
    assert.equal(order.grossMinor, -44000, total);
    assert.equal(order.importIssues?.some(issue => issue.code === "sheet_amount_review"), true, total);
  }
});

test("malformed or unsafe money never silently combines unrelated digits", () => {
  for (const invalid of ["2.200.0", "2,200,0", "2.20.000,0", "2,20,000.0", "Rp 2?200", "2$200", "Rp 2€200", "2 2 00", "amount 2200", "2.2e3", "9007199254740992", Number.POSITIVE_INFINITY]) {
    const source = monetaryPayload(invalid, invalid);
    const order = (mergeGoogleSheetPayroll(base(), source).state[workspaceKeys.orders] as Order[])[0];
    assert.equal(order.rateMinor, undefined, String(invalid));
    assert.equal(order.grossMinor, 0, String(invalid));
    assert.equal(order.importIssues?.some(issue => issue.code === "sheet_amount_review"), true, String(invalid));
  }
});

test("a decimal-text price correction updates Sheet-owned financial fields without bypassing locks", () => {
  const before = mergeGoogleSheetPayroll(base(), monetaryPayload(22000, 440000));
  const corrected = monetaryPayload("2.200,0", "44.000,0");
  const result = mergeGoogleSheetPayroll(before.state, corrected);
  const order = (result.state[workspaceKeys.orders] as Order[])[0];
  assert.equal(result.updated, 1);
  assert.equal(order.rateMinor, 2200);
  assert.equal(order.grossMinor, 44000);
  assert.equal(order.expectedPaymentMinor, 44000);
  assert.equal(mergeGoogleSheetPayroll(result.state, corrected).unchanged, 1);
  const locked = structuredClone(before.state);
  (locked[workspaceKeys.orders] as Order[])[0].sheetSyncLocked = true;
  const skipped = mergeGoogleSheetPayroll(locked, corrected);
  assert.equal(skipped.skippedProtected, 1);
  assert.deepEqual(skipped.state, locked);
});

test("all-period sync refreshes a tracked historical order but never imports unrelated history", () => {
  const before = mergeGoogleSheetPayroll(base(), payload());
  const source = monetaryPayload(2200, 44000);
  source.newOrdersStartRow = 6000;
  source.rows[0].codeOccurrences = 1;
  const unknown = structuredClone(source.rows[0]);
  unknown.rowNumber = 1000; unknown.values[0] = unknown.display![0] = "invalid old date";
  unknown.values[1] = unknown.display![1] = "HISTORY";
  const current = structuredClone(source.rows[0]);
  current.rowNumber = 6001; current.values[1] = current.display![1] = "NEW";
  source.rows = [unknown, source.rows[0], current];
  const result = mergeGoogleSheetPayroll(before.state, source);
  assert.equal(result.updated, 1);
  assert.equal(result.added, 1);
  assert.equal(result.skippedHistorical, 1);
  assert.equal(result.skippedInvalid, 0);
  const orders = result.state[workspaceKeys.orders] as Order[];
  assert.deepEqual(orders.map(order => order.externalReference), ["X2821", "NEW"]);
  assert.equal(orders[0].rateMinor, 2200);
  assert.equal(orders[0].grossMinor, 44000);
});

test("an unrelated occurrence before Closing cannot block the tracked row or a new current order", () => {
  const before = mergeGoogleSheetPayroll(base(), payload());
  const source = monetaryPayload(2200, 44000); source.newOrdersStartRow = 6000;
  source.rows[0].codeOccurrences = 2;
  const otherPeriod = structuredClone(source.rows[0]); otherPeriod.rowNumber = 1000;
  otherPeriod.values[11] = 999; otherPeriod.display![11] = "999";
  source.rows = [otherPeriod, source.rows[0]];
  const result = mergeGoogleSheetPayroll(before.state, source);
  assert.equal(result.updated, 1);
  assert.equal(result.skippedHistorical, 1);
  assert.equal(result.skippedConflicts, 0);
  assert.equal((result.state[workspaceKeys.orders] as Order[])[0].rateMinor, 2200);
  const active = structuredClone(source.rows[1]); active.rowNumber = 6001;
  active.values[1] = active.display![1] = "CURRENT";
  const old = structuredClone(active); old.rowNumber = 900;
  const created = mergeGoogleSheetPayroll(base(), { ...source, rows: [old, active] });
  assert.equal(created.added, 1);
  assert.equal(created.skippedHistorical, 1);
  assert.equal((created.state[workspaceKeys.orders] as Order[])[0].importSourceRow, 6001);
});

test("a unique historical KODE may move while ambiguous or unproven moved rows are ignored", () => {
  const before = mergeGoogleSheetPayroll(base(), payload());
  const source = monetaryPayload(2200, 44000); source.newOrdersStartRow = 6000;
  source.rows[0].rowNumber = 5100;
  for (const occurrences of [undefined, 2]) {
    source.rows[0].codeOccurrences = occurrences;
    const result = mergeGoogleSheetPayroll(before.state, source);
    assert.equal(result.skippedHistorical, 1);
    assert.deepEqual(result.state, before.state);
  }
  source.rows[0].codeOccurrences = 1;
  const result = mergeGoogleSheetPayroll(before.state, source);
  assert.equal(result.updated, 1);
  assert.equal((result.state[workspaceKeys.orders] as Order[])[0].importSourceRow, 5100);
  assert.equal((result.state[workspaceKeys.orders] as Order[])[0].rateMinor, 2200);
});

test("same-period duplicate and all financial locks still protect historical refreshes", () => {
  const source = monetaryPayload(2200, 44000); source.newOrdersStartRow = 6000;
  source.rows[0].codeOccurrences = 1;
  for (const patch of [{ sheetSyncLocked: true }, { operationalStatus: "verified" as const }, { matchedPaymentMinor: 1 },
    { payrollPeriodId: "closed-period" }, { inventoryConsumedAt: "2026-10-06T00:00:00Z" }]) {
    const before = mergeGoogleSheetPayroll(base(), payload());
    Object.assign((before.state[workspaceKeys.orders] as Order[])[0], patch);
    const result = mergeGoogleSheetPayroll(before.state, source);
    assert.equal(result.skippedProtected, 1);
    assert.deepEqual(result.state, before.state);
  }
  const before = mergeGoogleSheetPayroll(base(), payload());
  source.rows[0].duplicateCode = true;
  const result = mergeGoogleSheetPayroll(before.state, source);
  assert.equal(result.skippedConflicts, 1);
  // A true duplicate now adds an admin review alert and blocks an unclosed
  // order, but never rewrites its original financial source amounts.
  const oldOrder=(before.state[workspaceKeys.orders] as Order[])[0];
  const stored=(result.state[workspaceKeys.orders] as Order[])[0];
  assert.equal(stored.id,oldOrder.id);
  assert.equal(stored.grossMinor,oldOrder.grossMinor);
  assert.equal(stored.rateMinor,oldOrder.rateMinor);
  assert.equal((result.state[workspaceKeys.sheetCodeConflicts] as unknown[]).length,1);
});

test("all-period complete presence archives missing unprotected history and keeps Closing protected orders", () => {
  const before = mergeGoogleSheetPayroll(base(), payload());
  const complete = { ...payload(), newOrdersStartRow: 6000, rows: [], syncMode: "reconcile" as const,
    presence: { complete: true as const, startRow: 3, references: [] as string[] } };
  assert.equal(mergeGoogleSheetPayroll(before.state, complete).archived, 1);
  before.state[workspaceKeys.closings] = [{ id: "closed", orderRefs: ["X2821"] }];
  assert.equal(mergeGoogleSheetPayroll(before.state, complete).archived, 0);
});

test("historical boundaries and global KODE counts reject invalid types and bounds", () => {
  for (const value of [0, 1, 2.5, 50002, "6000", Number.POSITIVE_INFINITY]) {
    assert.throws(() => validateGoogleSheetSyncPayload({ ...payload(), newOrdersStartRow: value }), /Batas pesanan/);
  }
  const source = payload(); source.headerRow = 2; source.newOrdersStartRow = 2;
  assert.throws(() => validateGoogleSheetSyncPayload(source), /Batas pesanan/);
  for (const value of [0, -1, 1.5, 50001, "1", Number.NaN]) {
    const input = payload(); (input.rows[0] as unknown as { codeOccurrences: unknown }).codeOccurrences = value;
    assert.throws(() => validateGoogleSheetSyncPayload(input), /kemunculan KODE/);
  }
});

test("tracked row manifests expose only same-source identities and retain archived restoration candidates", () => {
  const initial = mergeGoogleSheetPayroll(base(), payload());
  const orders = initial.state[workspaceKeys.orders] as Order[];
  orders[0].sheetDeletedAt = "2026-10-05T00:00:00Z";
  const manual = { ...orders[0], id: "manual:order", externalReference: "MANUAL" };
  const otherSource = { ...orders[0], id: "gsheet:other:MUTASI_FH:OTHER", externalReference: "OTHER" };
  const legacy = { ...orders[0], id: sheetOrderId(payload(), 9900), externalReference: "LEGACY", importSourceRow: undefined };
  initial.state[workspaceKeys.orders] = [...orders, manual, otherSource, legacy];
  const result = mergeGoogleSheetPayroll(initial.state, { ...payload(), rows: [], newOrdersStartRow: 6000 });
  assert.deepEqual(result.trackedRows, [{ reference: "X2821", rowNumber: 5057 }, { reference: "LEGACY" }]);
  assert.deepEqual(result.state, initial.state);
});

test("a reused current-period KODE cannot overwrite a tracked historical identity across separate batches", () => {
  const initial = mergeGoogleSheetPayroll(base(), payload());
  const correct = monetaryPayload(2200, 44000);
  correct.newOrdersStartRow = 6000; correct.rows[0].codeOccurrences = 2;
  const reused = structuredClone(correct.rows[0]); reused.rowNumber = 6001;
  reused.values[11] = 999; reused.display![11] = "999";
  const together = mergeGoogleSheetPayroll(initial.state, { ...correct, rows: [reused, correct.rows[0]] });
  assert.equal(together.updated, 1); assert.equal(together.skippedConflicts, 1);
  assert.equal((together.state[workspaceKeys.orders] as Order[])[0].importSourceRow, 5057);
  assert.equal((together.state[workspaceKeys.orders] as Order[])[0].rateMinor, 2200);
  const historic = mergeGoogleSheetPayroll(initial.state, correct);
  const laterBatch = mergeGoogleSheetPayroll(historic.state, { ...correct, rows: [reused] });
  assert.equal(laterBatch.skippedConflicts, 1);
  assert.deepEqual(laterBatch.state, historic.state);
});
test("Sheet date edits synchronize the derived deadline while locked dates remain unchanged", () => {
  const initial = mergeGoogleSheetPayroll(base(), payload());
  const snapshot = structuredClone(initial.state);
  const corrected = payload();
  corrected.rows[0].values[0] = corrected.rows[0].display![0] = "26/09/2026 1:30";
  const result = mergeGoogleSheetPayroll(initial.state, corrected);
  const order = (result.state[workspaceKeys.orders] as Order[])[0];
  assert.equal(result.updated, 1);
  assert.equal(order.orderedAt, "2026-09-25T18:30:00.000Z");
  assert.equal(order.dueAt, order.orderedAt);
  assert.equal(mergeGoogleSheetPayroll(result.state, corrected).unchanged, 1);
  assert.deepEqual(initial.state, snapshot);

  const locked = structuredClone(initial.state);
  (locked[workspaceKeys.orders] as Order[])[0].sheetSyncLocked = true;
  const protectedResult = mergeGoogleSheetPayroll(locked, corrected);
  assert.equal(protectedResult.skippedProtected, 1);
  assert.deepEqual(protectedResult.state, locked);
});

