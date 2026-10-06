import assert from "node:assert/strict";
import { test } from "node:test";
import { attributeWorkspaceEdit } from "../features/payroll/lib/audit-model";
import { applyBulkMutationAction } from "../features/payroll/lib/bulk-mutation-actions";
import { activeSheetOrders, hasAutomaticSheetProtection } from "../features/payroll/lib/sheet-sync-policy";
import { isPayrollEligible } from "../features/payroll/lib/payroll-live";
import { buildOrderPriceAssessments } from "../features/payroll/lib/price-anomaly";
import { mergeGoogleSheetPayroll } from "../features/payroll/lib/google-sheet-sync";
import { validateWorkspace, validateWorkspaceEdit, workspaceKeys as K } from "../features/payroll/lib/workspace-model";
import type { Order } from "../features/payroll/types/domain";

const now = "2026-10-06T12:00:00.000Z";
const admin = { id: "admin-id", name: "Admin", isAdmin: true };
function order(patch: Partial<Order> = {}): Order {
  return { id: "gsheet:TEST", orderNumber: "TEST", externalReference: "TEST", source: "G2G",
    orderName: "12 Hours Boosting", orderType: "boosting", game: "AION", service: "Boosting",
    quantity: 1, rateMinor: 320000, grossMinor: 320000, operationalStatus: "assigned", financeStatus: "pending",
    expectedPaymentMinor: 320000, matchedPaymentMinor: 0, orderedAt: now, dueAt: now, ...patch };
}
function archive(source: Order) {
  const result = applyBulkMutationAction([source], [source.id], "delete", { now, actorName: "Untrusted client" });
  const next = attributeWorkspaceEdit({ [K.orders]: [source] }, { [K.orders]: result.orders }, admin, now);
  validateWorkspaceEdit({ [K.orders]: [source] }, next);
  return (next[K.orders] as Order[])[0];
}
test("website delete retains source identity/amounts, stamps trusted metadata, and locks Sheet", () => {
  const source = order(); const archived = archive(source);
  assert.equal(archived.id, source.id); assert.equal(archived.externalReference, source.externalReference);
  assert.equal(archived.grossMinor, source.grossMinor); assert.equal(archived.rateMinor, source.rateMinor);
  assert.equal(archived.websiteDeletedAt, now); assert.equal(archived.websiteDeletedBy, "Admin");
  assert.equal(archived.sheetSyncLocked, true); assert.equal(archived.sheetSyncLockedAt, now);
  assert.equal(archived.sheetSyncLockedBy, "Admin"); assert.equal(archived.sheetSyncRefreshRequested, false);
});
test("manual orders archive without Sheet lock and admin restores unchanged details", () => {
  const archived = archive(order({ id: "ord-user-test" }));
  assert.equal(archived.sheetSyncLocked, undefined);
  const restored = attributeWorkspaceEdit({ [K.orders]: [archived] }, { [K.orders]: [{ ...archived, websiteDeletedAt: undefined, websiteDeletedBy: undefined }] }, admin, now);
  const current = (restored[K.orders] as Order[])[0];
  assert.equal(current.websiteDeletedAt, undefined); assert.equal(current.grossMinor, archived.grossMinor);
  validateWorkspaceEdit({ [K.orders]: [archived] }, restored);
});
test("Sheet restore keeps lock and does not request source replay", () => {
  const archived = archive(order());
  const restored = attributeWorkspaceEdit({ [K.orders]: [archived] }, { [K.orders]: [{ ...archived, websiteDeletedAt: undefined, websiteDeletedBy: undefined }] }, admin, now);
  const current = (restored[K.orders] as Order[])[0];
  assert.equal(current.sheetSyncLocked, true); assert.equal(current.sheetSyncRefreshRequested, false);
});
test("staff cannot archive or restore and clients cannot forge archive identity/time", () => {
  const source = order(), archived = archive(source), staff = { ...admin, isAdmin: false };
  assert.throws(() => attributeWorkspaceEdit({ [K.orders]: [source] }, { [K.orders]: [{ ...source, websiteDeletedAt: now }] }, staff, now), /Hanya admin/);
  assert.throws(() => attributeWorkspaceEdit({ [K.orders]: [archived] }, { [K.orders]: [{ ...archived, websiteDeletedAt: undefined }] }, staff, now), /Hanya admin/);
  assert.throws(() => attributeWorkspaceEdit({ [K.orders]: [archived] }, { [K.orders]: [{ ...archived, websiteDeletedBy: "Forged" }] }, admin, now), /Metadata arsip/);
});
test("archived snapshots are frozen and delete/restore cannot change other fields", () => {
  const source = order(), archived = archive(source);
  assert.throws(() => attributeWorkspaceEdit({ [K.orders]: [source] }, { [K.orders]: [{ ...source, grossMinor: 1, websiteDeletedAt: now }] }, admin, now), /mempertahankan/);
  assert.throws(() => attributeWorkspaceEdit({ [K.orders]: [archived] }, { [K.orders]: [{ ...archived, task: "Changed" }] }, admin, now), /Pulihkan/);
  assert.throws(() => attributeWorkspaceEdit({ [K.orders]: [archived] }, { [K.orders]: [{ ...archived, websiteDeletedAt: undefined, grossMinor: 1 }] }, admin, now), /mempertahankan/);
});
test("server rejects financial, stock-movement and Closing protected deletions", () => {
  for (const patch of [{ operationalStatus: "verified" }, { verifiedAt: now }, { matchedPaymentMinor: 1 }, { financeStatus: "ready_to_close" }, { payrollPeriodId: "closing" }, { inventoryConsumedAt: now }] as Partial<Order>[]) {
    const source = order(patch);
    assert.throws(() => attributeWorkspaceEdit({ [K.orders]: [source] }, { [K.orders]: [{ ...source, websiteDeletedAt: now }] }, admin, now), /tidak dapat dihapus/);
  }
  const source = order();
  for (const state of [{ [K.movements]: [{ orderReference: "test" }] }, { [K.closings]: [{ ordersSnapshot: [source] }] }]) {
    assert.throws(() => attributeWorkspaceEdit({ [K.orders]: [source], ...state }, { [K.orders]: [{ ...source, websiteDeletedAt: now }], ...state }, admin, now), /tidak dapat dihapus/);
  }
});
test("website tombstone protects against source replay even if lock is absent and excludes active payroll/price rows", () => {
  const archived = order({ websiteDeletedAt: now, operationalStatus: "verified", verifiedAt: now, sheetSyncLocked: false });
  assert.equal(hasAutomaticSheetProtection(archived), true);
  assert.deepEqual(activeSheetOrders([archived]), []); assert.equal(isPayrollEligible(archived), false);
  assert.equal(buildOrderPriceAssessments([archived]).has(archived.id), false);
});
test("full Sheet replay and missing-presence reconciliation never restore or overwrite a website tombstone", () => {
  const payload = { version: 1, spreadsheetId: "archive-sheet", spreadsheetName: "Sheet", sheetName: "MUTASI FH", sentAt: now,
    headers: ["TANGGAL", "KODE", "GATE", "NAMA BUYER", "NAMA ORDER", "BOOSTER", "FH", "STATUS", "GAME", "PROSES", "JUMLAH", "RATE", "TOTAL", "TASK"],
    rows: [{ rowNumber: 5000, values: ["06/10/2026 12:00", "ARCHIVE1", "G2G", "Buyer", "12 Hours Boosting", "", "1", "", "AION", "JOKI", 1, 320000, 320000, "Original"] }] };
  const initial = mergeGoogleSheetPayroll({ [K.orders]: [] }, payload);
  const source = (initial.state[K.orders] as Order[])[0];
  const archived = archive(source);
  const tombstone = { ...archived, sheetSyncLocked: false };
  const state = { ...initial.state, [K.orders]: [tombstone] };
  const changed = structuredClone(payload); changed.rows[0].values[11] = 1; changed.rows[0].values[12] = 1;
  const replay = mergeGoogleSheetPayroll(state, changed);
  assert.deepEqual(replay.state[K.orders], [tombstone]);
  const missing = mergeGoogleSheetPayroll(state, { ...payload, syncMode: "reconcile", rows: [], presence: { complete: true, startRow: 4908, references: [] } });
  assert.deepEqual(missing.state[K.orders], [tombstone]);
});
test("workspace validates archive metadata and rejects fake archive on a new order", () => {
  assert.throws(() => validateWorkspace({ [K.orders]: [order({ websiteDeletedAt: "invalid" })] }), /Arsip website/);
  assert.throws(() => attributeWorkspaceEdit({ [K.orders]: [] }, { [K.orders]: [order({ websiteDeletedAt: now })] }, admin, now), /Hanya admin/);
  assert.throws(() => attributeWorkspaceEdit({ [K.orders]: [archive(order())] }, { [K.orders]: [] }, admin, now), /tidak dapat dihapus permanen/);
});
