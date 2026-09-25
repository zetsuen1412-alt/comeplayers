import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeOrderIssues, hasBlockingOrderIssues } from "../features/payroll/lib/order-issues";
import { analyzeOrderQuantityIssues, statedOrderQuantity } from "../features/payroll/lib/order-quantity";
import { expandMutationRows, formatMutationDistribution } from "../features/payroll/lib/mutation-rows";
import { mergeGoogleSheetPayroll, type GoogleSheetSyncPayload } from "../features/payroll/lib/google-sheet-sync";
import { closeWorkspace, validateWorkspaceEdit, workspaceKeys as K, type WorkspaceState } from "../features/payroll/lib/workspace-model";
import type { Employee, Order } from "../features/payroll/types/domain";

const workers: [string, number][] = [["DANDA", 12], ["FAJAR", 10], ["FURQON", 29], ["YASYA", 24], ["MUHIB", 11], ["NUGI", 10], ["RIZWAN", 23], ["RUDI", 10], ["SYARIF", 29], ["WISNU", 42], ["Angga", 25], ["Deden", 25]];
const employees: Employee[] = workers.map(([name], index) => ({ id: `e${index}`, code: `E${index}`, name, team: "FH2", workforceStatus: "FULL", utilization: 0, earningsMinor: 0 }));
function imported(): WorkspaceState {
  const payload: GoogleSheetSyncPayload = {
    version: 1, spreadsheetId: "quantity-regression", sheetName: "MUTASI FH", sentAt: "2026-09-25T03:00:00.000Z",
    headers: ["", "KODE", "GATE", "NAMA BUYER", "NAMA ORDER", "BOOSTER", "FH", "STATUS", "GAME", "PROSES", "JUMLAH", "RATE", "TOTAL", "TASK"],
    rows: [["X2832", "200M", 20, workers.slice(0, 10)], ["X2833", "50M", 5, workers.slice(10)]].map(([code, title, quantity, allocations], index) => {
      const values = ["25/09/2026 9:41", code, "G2G", "Buyer", title, "", "2", (allocations as typeof workers).map(([name, qty]) => `${name} ${qty}M`).join("\n"), "SSV", "F2F", quantity, 22000, Number(quantity) * 22000, ""];
      return { rowNumber: 5067 + index, boosterBlack: true, values, display: values.map(String) };
    }),
  };
  return mergeGoogleSheetPayroll({ [K.employees]: employees }, payload).state;
}
function orders(state = imported()) { return state[K.orders] as Order[]; }
function example() { return orders().find((order) => order.externalReference === "X2832")!; }

test("black BOOSTER legacy imports X2832/X2833 retain JUMLAH and become blocking issues immediately", () => {
  const rows = orders();
  for (const [code, title, quantity, assigned] of [["X2832", "200M", 20, 200], ["X2833", "50M", 5, 50]] as const) {
    const order = rows.find((row) => row.externalReference === code)!;
    assert.equal(order.orderType, undefined);
    assert.equal(order.orderName, title);
    assert.equal(order.quantity, quantity);
    assert.equal(order.operationalStatus, "draft");
    assert.equal(order.workerAssignments!.reduce((sum, row) => sum + row.quantity, 0), assigned);
    const issues = analyzeOrderIssues(order, employees);
    assert.ok(hasBlockingOrderIssues(issues));
    assert.ok(issues.some((issue) => issue.code === "ORDER_NAME_QUANTITY_MISMATCH"));
    assert.ok(issues.some((issue) => issue.code === "WORKER_QUANTITY_MISMATCH"));
    assert.match(formatMutationDistribution(expandMutationRows([order])[0]), new RegExp(`= ${assigned}M$`));
  }
});

test("title mismatch remains visible even if allocations add up to the incorrect JUMLAH", () => {
  const order = example();
  const issues = analyzeOrderQuantityIssues({ ...order, workerAssignments: [{ ...order.workerAssignments![0], quantity: 20 }] });
  assert.deepEqual(issues.map((issue) => issue.code), ["ORDER_NAME_QUANTITY_MISMATCH"]);
});

test("both under-allocation and over-allocation are flagged without relying on a numeric title", () => {
  const order = example();
  for (const quantity of [100, 300]) {
    const issues = analyzeOrderQuantityIssues({ ...order, orderName: "Custom Order", quantity });
    assert.deepEqual(issues.map((issue) => issue.code), ["WORKER_QUANTITY_MISMATCH"]);
    assert.match(issues[0].description, quantity === 100 ? /Kelebihan 100/ : /Kekurangan 100/);
  }
});

test("corrected quantity clears issues dynamically without mutating stored import data", () => {
  const order = example();
  const before = structuredClone(order);
  assert.deepEqual(analyzeOrderQuantityIssues({ ...order, quantity: 200 }), []);
  assert.equal(hasBlockingOrderIssues(analyzeOrderIssues({ ...order, quantity: 200 }, employees)), false);
  assert.deepEqual(order, before);
});

test("boosting, daily work, levels, ambiguous separators and bundles are not guessed from title", () => {
  const order = example();
  for (const title of ["6 Hours Package", "Leveling 1 - 200", "1 Month Package", "200M + 50M", "200M x2", "1.000M", "1,000M", "200M 2 days"]) {
    assert.equal(statedOrderQuantity({ ...order, orderName: title }), null, title);
    assert.deepEqual(analyzeOrderQuantityIssues({ ...order, orderName: title, process: "JOKI", quantity: 1 }), [], title);
  }
  assert.deepEqual(analyzeOrderQuantityIssues({ ...order, orderType: "boosting", quantity: 1 }), []);
  assert.deepEqual(analyzeOrderQuantityIssues({ ...order, scheduleMode: "daily", quantity: 1 }), []);
});

test("decimal quantities and title suffixes preserve unit precision", () => {
  const order = example();
  const corrected = { ...order, orderName: "0,3m SKADI", quantity: 0.3, workerAssignments: order.workerAssignments!.slice(0, 2).map((row, index) => ({ ...row, quantity: (index + 1) / 10 })) };
  assert.deepEqual(statedOrderQuantity(corrected), { quantity: 0.3, unit: "M" });
  assert.deepEqual(analyzeOrderQuantityIssues(corrected), []);
});

test("explicit gold/item still validate allocations; invalid worker quantities cannot pass", () => {
  const order = example();
  for (const orderType of ["gold", "item"] as const) {
    assert.ok(analyzeOrderQuantityIssues({ ...order, orderType, orderName: "Custom", process: undefined }).some((issue) => issue.code === "WORKER_QUANTITY_MISMATCH"));
    assert.ok(analyzeOrderQuantityIssues({ ...order, orderType, workerAssignments: [{ ...order.workerAssignments![0], quantity: 0 }] }).some((issue) => issue.code === "WORKER_QUANTITY_INVALID"));
  }
});

test("API validation permits faulty drafts but rejects verification and inconsistent verified edits", () => {
  const state = imported();
  assert.doesNotThrow(() => validateWorkspaceEdit({}, state));
  const verified = { ...state, [K.orders]: orders(state).map((order) => ({ ...order, operationalStatus: "verified" as const })) };
  assert.throws(() => validateWorkspaceEdit(state, verified), /bermasalah/);
  const fixed = { ...verified, [K.orders]: orders(verified).map((order) => ({ ...order, quantity: statedOrderQuantity(order)!.quantity })) };
  assert.doesNotThrow(() => validateWorkspaceEdit(state, fixed));
  const brokenEdit = { ...fixed, [K.orders]: orders(fixed).map((order) => ({ ...order, quantity: 1 })) };
  assert.throws(() => validateWorkspaceEdit(fixed, brokenEdit), /bermasalah/);
  assert.doesNotThrow(() => validateWorkspaceEdit(verified, { ...verified, [K.history]: [] }));
});

test("Closing rejects legacy inconsistent verified orders before altering salary, history or data", () => {
  const state: WorkspaceState = {
    ...imported(),
    [K.orders]: [{ ...example(), operationalStatus: "verified" }],
    [K.lock]: { id: "lock", from: "2026-09-25T00:00", to: "2026-09-25T23:59", lockedAt: "2026-09-25T00:00:00Z", lockedBy: "Admin" },
  };
  const before = structuredClone(state);
  assert.throws(() => closeWorkspace(state), /X2832 bermasalah/);
  assert.deepEqual(state, before);
  const fixed = { ...state, [K.orders]: [{ ...example(), quantity: 200, grossMinor: 4400000, expectedPaymentMinor: 4400000, operationalStatus: "verified" }] };
  assert.equal(closeWorkspace(fixed).record.totalOrderMinor, 4400000);
});
