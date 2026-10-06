import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeGoogleSheetPayroll, type GoogleSheetSyncPayload } from "../features/payroll/lib/google-sheet-sync";
import { mergeGoogleSheetRoster, validateGoogleSheetRoster, type GoogleSheetRosterSnapshot, type PayrollRosterRow } from "../features/payroll/lib/google-sheet-roster";
import { validateWorkspace, workspaceKeys, type WorkspaceState } from "../features/payroll/lib/workspace-model";
import type { Employee, Order } from "../features/payroll/types/domain";

const sentAt = "2026-10-06T09:30:00Z";
const sheetId = "original-namespace";
const employee = (name: string, team: Employee["team"] = "FH2", code = "EMP-0001"): Employee => ({
  id: `existing:${code}`, code, name, team, workforceStatus: "SHIFT", utilization: 20, earningsMinor: 12345,
});
function snapshot(fh1: PayrollRosterRow[] = [], fh2: PayrollRosterRow[] = [], fh3: PayrollRosterRow[] = []): GoogleSheetRosterSnapshot {
  return { complete: true, sheets: [
    { sheetName: "PAYROLL-1", rows: fh1 }, { sheetName: "PAYROLL-2", rows: fh2 }, { sheetName: "PAYROLL-3", rows: fh3 },
  ] };
}
const named = (name: string, rowNumber = 3, type?: string) => ({ rowNumber, name, ...(type ? { type } : {}) });
const employees = (state: WorkspaceState) => state[workspaceKeys.employees] as Employee[];
const orders = (state: WorkspaceState) => state[workspaceKeys.orders] as Order[];
function payload(roster: GoogleSheetRosterSnapshot, booster = "Dani2"): GoogleSheetSyncPayload {
  return {
    version: 1, spreadsheetId: sheetId, sheetName: "MUTASI FH", sentAt, roster,
    headers: ["TANGGAL", "KODE", "GATE", "NAMA BUYER", "NAMA ORDER", "BOOSTER", "FH", "STATUS", "GAME", "PROSES", "JUMLAH", "RATE", "TOTAL", "JENIS ORDER"],
    rows: [{ rowNumber: 5900, values: ["06/10/2026 16:30", "X3141", "G2G", "Buyer", "200M SPIRITVALE", booster, "2", "", "SV", "MAIL", 20, 2200, 44000, "GOLD"] }],
  };
}

test("complete roster validation allows cross-team duplicates but rejects partial or ambiguous snapshots", () => {
  assert.doesNotThrow(() => validateGoogleSheetRoster(snapshot([named("ANDIKA")], [named("ANDIKA")])));
  for (const bad of [
    { complete: false, sheets: [] }, { complete: true, sheets: [snapshot().sheets[0]] },
    { complete: true, sheets: [snapshot().sheets[0], snapshot().sheets[0], snapshot().sheets[2]] },
    snapshot([], [named("Dani2"), named(" DANI2 ", 4)]), snapshot([], [named("TOTAL")]),
    snapshot([], [named("Dani2", 2)]), snapshot([], [{ rowNumber: 3, name: "" }]),
    { complete: true, sheets: [{ sheetName: "toString", rows: [] }, ...snapshot().sheets.slice(1)] },
  ]) assert.throws(() => validateGoogleSheetRoster(bad));
});

test("matching name in an FH preserves website identity, earnings and utilization", () => {
  const original = employee("DANI2");
  const state: WorkspaceState = { [workspaceKeys.employees]: [original] };
  const result = mergeGoogleSheetRoster(state, snapshot([], [named("Dani2", 12, "FULL")]), sheetId, sentAt);
  const next = employees(state)[0];
  assert.deepEqual([next.id, next.code, next.utilization, next.earningsMinor], [original.id, original.code, 20, 12345]);
  assert.equal(next.name, "Dani2"); assert.equal(next.workforceStatus, "FULL");
  assert.deepEqual(next.sheetRosterSource, { spreadsheetId: sheetId, sheetName: "PAYROLL-2", rowNumber: 12, type: "FULL" });
  assert.deepEqual(result, { rosterAdded: 0, rosterUpdated: 1, rosterRemoved: 0 });
  assert.equal(original.name, "DANI2");
});

test("unambiguous known FH suffix updates preserve id/code but arbitrary rename creates a new identity", () => {
  const state: WorkspaceState = { [workspaceKeys.employees]: [employee("Dani")] };
  mergeGoogleSheetRoster(state, snapshot([], [named("DANI2")]), sheetId, sentAt);
  assert.equal(employees(state)[0].code, "EMP-0001"); assert.equal(employees(state)[0].name, "DANI2");
  const moved: WorkspaceState = { [workspaceKeys.employees]: [employee("Dani")], [workspaceKeys.history]: [{ id: "h1", employeeCode: "EMP-0001" }] };
  mergeGoogleSheetRoster(moved, snapshot([], [named("ERWIN2")]), sheetId, sentAt);
  assert.equal(employees(moved).find(row => row.code === "EMP-0001")?.name, "Dani");
  assert.notEqual(employees(moved).find(row => row.name === "ERWIN2")?.code, "EMP-0001");
});

test("ambiguous suffix aliases never claim two identities or guess a sorted row rename", () => {
  const state: WorkspaceState = { [workspaceKeys.employees]: [employee("Dani"), employee("DANI", "FH2", "EMP-0002")] };
  assert.throws(() => mergeGoogleSheetRoster(state, snapshot([], [named("DANI2")]), sheetId, sentAt), /ambigu/);
});

test("identical names in different FH get separate stable identities; unknown TYPE is preserved without guessing status", () => {
  const state: WorkspaceState = { [workspaceKeys.employees]: [] };
  mergeGoogleSheetRoster(state, snapshot([named("ANDIKA", 24, "OFF")], [named("ANDIKA", 59, "HADIR")], [named("ILHAM3", 51, "∞")]), sheetId, sentAt);
  assert.equal(new Set(employees(state).map(row => row.code)).size, 3);
  assert.deepEqual(employees(state).map(row => row.team), ["FH1", "FH2", "FH3"]);
  assert.deepEqual(employees(state).map(row => [row.workforceStatus, row.sheetRosterSource?.type]), [["SHIFT", "OFF"], ["SHIFT", "HADIR"], ["SHIFT", "∞"]]);
  assert.doesNotThrow(() => validateWorkspace(state));
});

test("roster-only merge is idempotent after database JSON persistence and row moves keep employee identity", () => {
  const state: WorkspaceState = { [workspaceKeys.employees]: [] };
  const roster = snapshot([], [named("DANI2")]);
  mergeGoogleSheetRoster(state, roster, sheetId, sentAt);
  const first = JSON.parse(JSON.stringify(state)) as WorkspaceState;
  assert.deepEqual(mergeGoogleSheetRoster(first, roster, sheetId, "2026-10-06T09:31:00Z"), { rosterAdded: 0, rosterUpdated: 0, rosterRemoved: 0 });
  assert.deepEqual(first, state);
  mergeGoogleSheetRoster(first, snapshot([], [named("DANI2", 15)]), sheetId, sentAt);
  assert.deepEqual([employees(first)[0].id, employees(first)[0].code], [employees(state)[0].id, employees(state)[0].code]);
});

test("missing employees preserve references, mark unmanaged FH workers absent and keep ADMIN/BANDAR active", () => {
  const state: WorkspaceState = {
    [workspaceKeys.employees]: [employee("Dani2"), employee("IQBAL", "FH2", "EMP-IQBAL"), employee("ADMIN", "ADMIN", "EMP-ADMIN"), employee("BANDAR", "BANDAR", "EMP-BANDAR")],
    [workspaceKeys.advances]: [{ id: "kasbon", employeeCode: "EMP-0001", status: "paid", amountMinor: 1000 }],
    [workspaceKeys.settings]: { adjustments: { "EMP-0001": { sharePercent: 50 } } },
    [workspaceKeys.closings]: [{ id: "closing", employeeName: "Dani2", employeeCode: "EMP-0001" }],
  };
  mergeGoogleSheetRoster(state, snapshot([], [named("Dani2")]), sheetId, sentAt);
  const ledger = structuredClone({ advances: state[workspaceKeys.advances], settings: state[workspaceKeys.settings], closings: state[workspaceKeys.closings] });
  const result = mergeGoogleSheetRoster(state, snapshot(), sheetId, sentAt);
  assert.equal(result.rosterRemoved, 0); assert.equal(employees(state).length, 4);
  assert.equal(employees(state)[0].sheetRosterMissingAt, sentAt);
  assert.equal(employees(state)[1].sheetRosterMissingAt, sentAt);
  assert.equal(employees(state)[2].sheetRosterMissingAt, undefined);
  assert.equal(employees(state)[3].sheetRosterMissingAt, undefined);
  assert.deepEqual({ advances: state[workspaceKeys.advances], settings: state[workspaceKeys.settings], closings: state[workspaceKeys.closings] }, ledger);
  mergeGoogleSheetRoster(state, snapshot([], [named("Dani2")]), sheetId, sentAt);
  assert.equal(employees(state)[0].sheetRosterMissingAt, undefined); assert.equal(employees(state)[0].code, "EMP-0001");
});

test("only unreferenced managed employees are removed; reappearance restores deterministic id/code", () => {
  const state: WorkspaceState = { [workspaceKeys.employees]: [] };
  mergeGoogleSheetRoster(state, snapshot([], [named("Dani2")]), sheetId, sentAt);
  const first = structuredClone(employees(state)[0]);
  assert.equal(mergeGoogleSheetRoster(state, snapshot(), sheetId, sentAt).rosterRemoved, 1);
  mergeGoogleSheetRoster(state, snapshot([], [named("Dani2", 9)]), sheetId, sentAt);
  assert.deepEqual([employees(state)[0].id, employees(state)[0].code], [first.id, first.code]);
});

test("new roster names resolve order workers in the same atomic merge and retain Sheet financial numbers", () => {
  const input = payload(snapshot([], [named("Dani2")]));
  const original = structuredClone(input);
  const result = mergeGoogleSheetPayroll({ [workspaceKeys.employees]: [] }, input);
  assert.equal(result.rosterAdded, 1); assert.equal(result.added, 1);
  const next = orders(result.state)[0];
  assert.equal(next.employeeCode, employees(result.state)[0].code); assert.equal(next.employeeName, "Dani2");
  assert.deepEqual([next.rateMinor, next.grossMinor, next.quantity], [2200, 44000, 20]);
  assert.deepEqual(input, original); assert.doesNotThrow(() => validateWorkspace(result.state));
});

test("generated Sheet employee codes resolve in black BOOSTER lists without becoming quantities", () => {
  const roster = snapshot([], [named("Dani2")]);
  const initial = mergeGoogleSheetPayroll({}, payload(roster)).state;
  const code = employees(initial)[0].code;
  const input = payload(roster, "");
  input.rows[0].boosterBlack = true;
  input.rows[0].values[7] = `${code} 20M`;
  const result = mergeGoogleSheetPayroll(initial, input);
  assert.deepEqual(orders(result.state)[0].workerAssignments?.map(row => [row.employeeCode, row.quantity]), [[code, 20]]);
});

test("all locked snapshots stay byte-identical while unprotected Sheet workers change names", () => {
  const initial = mergeGoogleSheetPayroll({}, payload(snapshot([], [named("Dani2")]))).state;
  const locked = structuredClone(orders(initial)[0]); locked.id += ":locked"; locked.externalReference = locked.orderNumber = "LOCKED"; locked.sheetSyncLocked = true;
  orders(initial).push(locked);
  const history = [{ id: "paid", employeeCode: locked.employeeCode, employeeName: "Dani2", amountMinor: 3000 }];
  initial[workspaceKeys.history] = history;
  const input = payload(snapshot([], [named("Erwin2")]), "Erwin2");
  const lockedRow = structuredClone(input.rows[0]); lockedRow.rowNumber++; lockedRow.values[1] = "LOCKED"; input.rows.push(lockedRow);
  const result = mergeGoogleSheetPayroll(initial, input);
  assert.equal(result.updated, 1); assert.equal(result.skippedProtected, 1);
  assert.equal(orders(result.state)[0].employeeName, "Erwin2"); assert.notEqual(orders(result.state)[0].employeeCode, locked.employeeCode);
  assert.deepEqual(orders(result.state)[1], locked); assert.deepEqual(result.state[workspaceKeys.history], history);
  assert.equal(employees(result.state).find(row => row.code === locked.employeeCode)?.sheetRosterMissingAt, sentAt);
});

test("missing roster names cannot resolve a new unlocked order by stale name or code", () => {
  const initial = mergeGoogleSheetPayroll({}, payload(snapshot([], [named("Dani2")]))).state;
  orders(initial)[0].sheetSyncLocked = true;
  const input = payload(snapshot(), employees(initial)[0].code); input.rows[0].values[1] = "NEW";
  const result = mergeGoogleSheetPayroll(initial, input);
  assert.equal(orders(result.state)[1].employeeCode, undefined);
  assert.equal(orders(result.state)[1].importIssues?.some(issue => issue.code === "sheet_booster_unmatched"), true);
});

test("an unlocked rename removes only obsolete unreferenced identity and next merge is idempotent", () => {
  const initial = mergeGoogleSheetPayroll({}, payload(snapshot([], [named("Dani2")]))).state;
  const corrected = payload(snapshot([], [named("Erwin2")]), "Erwin2");
  const first = mergeGoogleSheetPayroll(initial, corrected);
  assert.equal(employees(first.state).length, 1); assert.equal(employees(first.state)[0].name, "Erwin2");
  const second = mergeGoogleSheetPayroll(first.state, corrected);
  assert.deepEqual(second.state, first.state); assert.equal(second.rosterAdded + second.rosterUpdated + second.rosterRemoved + second.updated, 0);
});
