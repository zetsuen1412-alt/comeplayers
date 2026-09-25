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
