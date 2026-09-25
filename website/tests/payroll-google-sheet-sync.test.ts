import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeGoogleSheetPayroll,
  parseSheetOrderedAt,
  type GoogleSheetSyncPayload,
} from "../features/payroll/lib/google-sheet-sync";
import { workspaceKeys, type WorkspaceState } from "../features/payroll/lib/workspace-model";
import type { Employee, Order, ProductGame } from "../features/payroll/types/domain";

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

test("the same hourly payload is idempotent", () => {
  const first = mergeGoogleSheetPayroll(base(), payload());
  const second = mergeGoogleSheetPayroll(first.state, payload());
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
  assert.equal(order.team, "FH1");
  assert.equal(order.operationalStatus, "draft");
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
