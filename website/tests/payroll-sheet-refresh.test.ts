import assert from "node:assert/strict";
import { test } from "node:test";
import { attributeWorkspaceEdit } from "../features/payroll/lib/audit-model";
import { mergeGoogleSheetPayroll, type GoogleSheetSyncPayload } from "../features/payroll/lib/google-sheet-sync";
import { validateWorkspaceEdit, workspaceKeys, type WorkspaceState } from "../features/payroll/lib/workspace-model";
import type { Order } from "../features/payroll/types/domain";

const now = "2026-10-06T10:00:00Z";
const admin = { id: "admin", name: "Admin", isAdmin: true };
const member = { id: "member", name: "Member", isAdmin: false };
function payload(): GoogleSheetSyncPayload {
  return {
    version: 1, syncMode: "reconcile", spreadsheetId: "source", sheetName: "MUTASI FH", sentAt: now,
    headers: ["TANGGAL", "KODE", "GATE", "NAMA BUYER", "NAMA ORDER", "BOOSTER", "FH", "STATUS", "GAME", "PROSES", "JUMLAH", "RATE", "TOTAL", "JENIS ORDER", "TASK"],
    rows: [{ rowNumber: 5900, values: ["06/10/2026 17:00", "X3141", "G2G", "Buyer", "200M SPIRITVALE", "", "2", "", "SV", "MAIL", 20, 2200, 44000, "GOLD", "Sheet task"] }],
  };
}
const order = (state: WorkspaceState) => (state[workspaceKeys.orders] as Order[])[0];
const base = () => mergeGoogleSheetPayroll({}, payload()).state;
function webEdit(previous: WorkspaceState, patch: Partial<Order>, actor = admin) {
  const next = structuredClone(previous);
  Object.assign(order(next), patch);
  return attributeWorkspaceEdit(previous, next, actor, now);
}

test("website changes to Sheet identity, instructions, money and worker fields request replay", () => {
  const previous = base();
  const patches: Partial<Order>[] = [
    { source: "PAUC" }, { buyerName: undefined }, { orderName: "50M SPIRITVALE", service: "50M SPIRITVALE" },
    { task: "Website task" }, { orderType: "item" },
    { game: "RO", gameId: "game-ro", gameName: "Ragnarok" }, { process: "F2F" }, { team: "FH3" },
    { quantity: 50 }, { rateMinor: 22000 }, { rateMinor: undefined }, { grossMinor: 440000, expectedPaymentMinor: 440000 },
    { employeeCode: "EMP-0001", employeeName: "Worker" },
    { workerAssignments: [{ id: "new", employeeCode: "EMP-0001", employeeName: "Worker", team: "FH2", process: "MAIL", quantity: 20 }] },
    { orderedAt: "2026-10-06T09:00:00Z" }, { dueAt: "2026-10-07T10:00:00Z" },
  ];
  for (const patch of patches) {
    const before = structuredClone(previous);
    const saved = webEdit(previous, patch, member);
    assert.equal(order(saved).sheetSyncRefreshRequested, true, JSON.stringify(patch));
    assert.deepEqual(previous, before);
  }
});

test("workflow changes and canonical no-op saves do not request a source replay", () => {
  const previous = base();
  for (const patch of [
    {}, { operationalStatus: "in_progress" }, { operationalStatus: "on_hold" },
    { completedAt: now }, { region: "Asia", server: "SKADI" },
  ] satisfies Partial<Order>[]) assert.equal(order(webEdit(previous, patch)).sheetSyncRefreshRequested, undefined);
  const pending = structuredClone(previous); order(pending).sheetSyncRefreshRequested = true;
  assert.equal(order(webEdit(pending, { operationalStatus: "in_progress" })).sheetSyncRefreshRequested, true);
});

test("locked, automatically protected and legacy Closing orders preserve source refresh metadata", () => {
  const protections: Partial<Order>[] = [
    { sheetSyncLocked: true }, { verifiedAt: now }, { operationalStatus: "verified" },
    { payrollClosedAt: now }, { payrollPeriodId: "period" }, { financeStatus: "closed" },
    { inventoryConsumedAt: now }, { inventoryAllocations: [{ id: "stock", inventoryStockId: "stock", stockType: "gold", game: "SV", itemName: "Gold", locationName: "Storage", employeeCode: "EMP-0001", employeeName: "Worker", team: "FH2", quantity: 20 }] },
    { matchedPaymentMinor: 100 },
    { dailyWork: [{ id: "day", sequence: 1, workDate: "2026-10-06", grossMinor: 44000, status: "verified", verifiedAt: now }] },
    { sheetDeletedAt: now },
  ];
  for (const protection of protections) {
    const previous = base(); Object.assign(order(previous), protection);
    assert.equal(order(webEdit(previous, { rateMinor: 22000 })).sheetSyncRefreshRequested, undefined, JSON.stringify(protection));
  }
  const previous = base(); previous[workspaceKeys.closings] = [{ id: "old-closing", orderRefs: [" x3141 "] }];
  assert.equal(order(webEdit(previous, { rateMinor: 22000 })).sheetSyncRefreshRequested, undefined);
});

test("same save that protects the order does not request source overwrite", () => {
  const previous = base();
  assert.equal(order(webEdit(previous, { operationalStatus: "verified", verifiedAt: now, rateMinor: 22000 })).sheetSyncRefreshRequested, undefined);
  const locked = webEdit(previous, { sheetSyncLocked: true, rateMinor: 22000 });
  assert.equal(order(locked).sheetSyncRefreshRequested, false);
  const unlocked = webEdit(locked, { sheetSyncLocked: false });
  assert.equal(order(unlocked).sheetSyncRefreshRequested, true);
  assert.equal(order(unlocked).sheetSyncLockedBy, admin.name);
});

test("releasing automatic protection requests replay even when only workflow fields change", () => {
  const cases: { protected: Partial<Order>; released: Partial<Order> }[] = [
    { protected: { operationalStatus: "verified", verifiedAt: now }, released: { operationalStatus: "in_progress", verifiedAt: undefined } },
    { protected: { matchedPaymentMinor: 100 }, released: { matchedPaymentMinor: 0 } },
    { protected: { inventoryConsumedAt: now }, released: { inventoryConsumedAt: undefined } },
    { protected: { dailyWork: [{ id: "day", sequence: 1, workDate: "2026-10-06", grossMinor: 44000, status: "verified", verifiedAt: now }] },
      released: { dailyWork: [{ id: "day", sequence: 1, workDate: "2026-10-06", grossMinor: 44000, status: "pending" }] } },
  ];
  for (const item of cases) {
    const previous = base(); Object.assign(order(previous), item.protected);
    const snapshot = structuredClone(previous);
    assert.equal(order(webEdit(previous, item.released)).sheetSyncRefreshRequested, true);
    assert.equal(order(webEdit(previous, { ...item.released, rateMinor: 22000 })).sheetSyncRefreshRequested, true);
    assert.equal(order(webEdit(previous, { ...item.released, matchedPaymentMinor: 1 })).sheetSyncRefreshRequested, undefined);
    assert.deepEqual(previous, snapshot);
  }
});

test("a protection release does not bypass explicit locks, archives or Closing references", () => {
  for (const protection of [{ sheetSyncLocked: true }, { sheetDeletedAt: now }]) {
    const previous = base();
    Object.assign(order(previous), { operationalStatus: "verified", verifiedAt: now }, protection);
    const saved = webEdit(previous, { operationalStatus: "in_progress", verifiedAt: undefined, rateMinor: 22000 });
    assert.equal(order(saved).sheetSyncRefreshRequested, undefined);
  }
  const closing = base();
  Object.assign(order(closing), { operationalStatus: "verified", verifiedAt: now });
  closing[workspaceKeys.closings] = [{ id: "period", orderRefs: [" x3141 "] }];
  assert.equal(order(webEdit(closing, { operationalStatus: "in_progress", verifiedAt: undefined })).sheetSyncRefreshRequested, undefined);
  const archived = base(); order(archived).sheetDeletedAt = now;
  assert.throws(() => webEdit(archived, { sheetDeletedAt: undefined }), /Arsip spreadsheet/);
  const restoredLocked = webEdit(archived, { sheetDeletedAt: undefined, sheetSyncLocked: true });
  assert.equal(order(restoredLocked).sheetSyncRefreshRequested, false);
});

test("manual/new orders never create source refresh requests", () => {
  const previous = base(); order(previous).id = "manual-order";
  assert.equal(order(webEdit(previous, { rateMinor: 22000 })).sheetSyncRefreshRequested, undefined);
  assert.equal(order(webEdit(previous, { externalReference: "MANUAL-NEW", orderNumber: "MANUAL-NEW" })).externalReference, "MANUAL-NEW");
  const fresh = base();
  assert.equal(order(attributeWorkspaceEdit({}, fresh, admin, now)).sheetSyncRefreshRequested, undefined);
});

test("website KODE overrides cannot break Sheet identity for locked or unlocked orders", () => {
  for (const locked of [false, true]) for (const actor of [admin, member]) {
    const previous = base(); order(previous).sheetSyncLocked = locked;
    for (const patch of [{ externalReference: "WEB-NEW" }, { orderNumber: "WEB-NEW" }, { externalReference: "WEB-NEW", orderNumber: "WEB-NEW" }]) {
      assert.throws(() => webEdit(previous, patch, actor), /KODE pesanan dari Sheet harus diubah di Sheet/);
    }
    assert.equal(order(webEdit(previous, { operationalStatus: "in_progress" }, actor)).sheetSyncRefreshRequested, undefined);
  }
});

test("caller supplied refresh flags and lock metadata still fail before automatic attribution", () => {
  const previous = base();
  for (const actor of [admin, member]) {
    assert.throws(() => webEdit(previous, { rateMinor: 22000, sheetSyncRefreshRequested: true }, actor), /Metadata kunci/);
    assert.throws(() => webEdit(previous, { rateMinor: 22000, sheetSyncLockedAt: now }, actor), /Metadata kunci/);
    assert.throws(() => webEdit(previous, { sheetSyncLocked: true }, member), /Hanya admin website/);
  }
  const pending = webEdit(previous, { rateMinor: 22000 });
  assert.throws(() => webEdit(pending, { sheetSyncRefreshRequested: undefined }), /Metadata kunci/);
});

test("unchanged source replay fixes website override and acknowledges refresh without restamping it", () => {
  const previous = base();
  const overridden = webEdit(previous, { orderName: "Wrong website name", rateMinor: 22000, grossMinor: 440000 });
  validateWorkspaceEdit(previous, overridden);
  const input = payload();
  const presence = { ...input, rows: [], presence: { complete: true as const, startRow: 4908, references: ["X3141"] } };
  assert.deepEqual(mergeGoogleSheetPayroll(overridden, presence).refreshReferences, ["X3141"]);
  const restored = mergeGoogleSheetPayroll(overridden, input);
  validateWorkspaceEdit(overridden, restored.state);
  assert.equal(restored.updated, 1);
  assert.deepEqual([order(restored.state).orderName, order(restored.state).rateMinor, order(restored.state).grossMinor], ["200M SPIRITVALE", 2200, 44000]);
  assert.equal(order(restored.state).sheetSyncRefreshRequested, undefined);
  assert.equal(mergeGoogleSheetPayroll(restored.state, input).unchanged, 1);
});
