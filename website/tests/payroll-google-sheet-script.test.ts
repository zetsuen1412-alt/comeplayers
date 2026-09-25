import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";
import { mergeGoogleSheetPayroll, type GoogleSheetSyncPayload } from "../features/payroll/lib/google-sheet-sync";
import { workspaceKeys, type WorkspaceState } from "../features/payroll/lib/workspace-model";
import type { Order } from "../features/payroll/types/domain";

const script = readFileSync(new URL("../scripts/comeplayers-payroll-google-sheets.gs", import.meta.url), "utf8");
const headers = ["TANGGAL", "KODE", "GATE", "NAMA BUYER", "NAMA ORDER", "BOOSTER", "FH", "STATUS", "GAME", "PROSES", "JUMLAH", "RATE", "TOTAL", "TASK"];
type Summary = { sent: number; unchanged: number; deferred: number; skipped?: string; skippedConflicts: number };
type Trigger = { handler: string; kind?: string; minutes?: number; getHandlerFunction(): string };

function harness(count = 3, digestDelayMs = 0) {
  const cells: unknown[][] = [[], headers, ...Array.from({ length: count }, (_, i) =>
    ["25/09/2026 00:24", `CODE-${i}`, "G2G", "Buyer", "40M SKADI", "", "2", "START", "RO", "F2F", 20, 1000, 20000, "Task"])];
  const colors = new Map<number, string>();
  const properties: Record<string, string> = { CP_SYNC_SECRET: "a".repeat(30), CP_ACTOR_EMAIL: "admin@example.com",
    CP_SPREADSHEET_ID: "test-book", CP_SHEET_NAME: "MUTASI FH", CP_HEADER_ROW: "2" };
  let locked = false;
  let status = 200;
  let duringFetch: (() => void) | undefined;
  let afterFetch: (() => void) | undefined;
  let requests = 0;
  const posts: GoogleSheetSyncPayload[] = [];
  const reads: { row: number; column: number; rows: number; columns: number }[] = [];
  let state: WorkspaceState = { [workspaceKeys.orders]: [] };
  const triggers: Trigger[] = [];
  let elapsedMs = 0;
  class ScriptDate extends Date {
    static now() { return Date.now() + elapsedMs; }
  }
  const propertyStore = {
    getProperty: (key: string) => properties[key] ?? null,
    getProperties: () => ({ ...properties }),
    setProperty: (key: string, value: string) => { properties[key] = value; },
    setProperties: (values: Record<string, string>) => Object.assign(properties, values),
    deleteProperty: (key: string) => { delete properties[key]; },
  };
  function range(row: number, column: number, rows = 1, columns = 1) {
    reads.push({ row, column, rows, columns });
    const values = () => Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => cells[row - 1 + r]?.[column - 1 + c] ?? ""));
    return {
      getRow: () => row, getLastRow: () => row + rows - 1, getSheet: () => sheet,
      getValues: values, getDisplayValues: () => values().map(r => r.map(String)),
      getBackgrounds: () => Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => column + c === 6 ? colors.get(row + r) ?? "#ffffff" : "#ffffff")),
    };
  }
  const sheet = { getName: () => "MUTASI FH", getSheetId: () => 123, getLastRow: () => cells.length,
    getLastColumn: () => headers.length, getRange: range };
  const spreadsheet = { getId: () => "test-book", getName: () => "Workbook", getSheetByName: (name: string) => name === "MUTASI FH" ? sheet : null };
  const context = createContext({
    Date: ScriptDate,
    PropertiesService: { getScriptProperties: () => propertyStore },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet },
    LockService: { getScriptLock: () => ({
      tryLock: () => { if (locked) return false; locked = true; return true; },
      waitLock: () => { if (locked) throw new Error("busy"); locked = true; },
      releaseLock: () => { locked = false; },
    }) },
    Utilities: { DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      computeDigest: (_algorithm: string, text: string) => {
        elapsedMs += digestDelayMs;
        return createHash("sha256").update(text).digest();
      },
      base64EncodeWebSafe: (bytes: Buffer) => bytes.toString("base64url"),
    },
    ScriptApp: {
      getProjectTriggers: () => [...triggers],
      deleteTrigger: (trigger: Trigger) => triggers.splice(triggers.indexOf(trigger), 1),
      newTrigger: (handler: string) => {
        const trigger: Trigger = { handler, getHandlerFunction() { return handler; } };
        const builder = {
          forSpreadsheet: () => builder,
          onEdit: () => { trigger.kind = "edit"; return builder; },
          onChange: () => { trigger.kind = "change"; return builder; },
          timeBased: () => { trigger.kind = "clock"; return builder; },
          everyMinutes: (minutes: number) => { trigger.minutes = minutes; return builder; },
          create: () => triggers.push(trigger),
        };
        return builder;
      },
    },
    UrlFetchApp: { fetch: (_url: string, options: { payload: string }) => {
      assert.equal(locked, true, "network write must hold the script lock");
      requests++;
      const payload = JSON.parse(options.payload) as GoogleSheetSyncPayload;
      posts.push(payload);
      duringFetch?.();
      if (status !== 200) return { getResponseCode: () => status, getContentText: () => "upstream failure" };
      const merged = mergeGoogleSheetPayroll(state, payload);
      state = merged.state;
      afterFetch?.();
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ...merged, state: undefined, ok: true, saved: merged.added + merged.updated > 0 }) };
    } },
    console: { log: () => {} },
  });
  runInContext(script, context);
  const api = context as Record<string, (...args: unknown[]) => Summary>;
  return {
    cells, colors, properties, posts, reads, triggers,
    edit: (row: number, rows = 1, column = 4) => api.onComePlayersPayrollEdit({ source: spreadsheet, range: range(row, column, rows) }),
    otherSheet: () => api.onComePlayersPayrollEdit({ source: spreadsheet, range: { ...range(3, 1), getSheet: () => ({ getSheetId: () => 456 }) } }),
    reconcile: () => api.syncComePlayersPayroll(), reinstall: () => api.reinstallComePlayersPayrollRealtimeSync(),
    change: () => api.onComePlayersPayrollChange({ source: spreadsheet, changeType: "REMOVE_ROW" }),
    fail: (code: number) => { status = code; }, setLocked: (value: boolean) => { locked = value; },
    duringFetch: (callback: () => void) => { duringFetch = callback; },
    afterFetch: (callback: () => void) => { afterFetch = callback; },
    get locked() { return locked; }, get requests() { return requests; }, get state() { return state; },
  };
}

test("installable single cell edit sends only its row, never the full sheet", () => {
  const h = harness(); h.edit(4);
  assert.deepEqual(h.posts[0].rows.map(r => r.rowNumber), [4]);
  assert.equal(h.posts[0].syncMode, "incremental");
  assert.equal(h.reads.filter(r => r.row > 2 && r.columns > 1).every(r => r.row === 4 && r.rows === 1), true);
});

test("deletion-enabled sync sends a complete manifest, archives clears and handles physical row deletion", () => {
  const h = harness(); h.properties.CP_SYNC_DELETIONS = "true"; h.reconcile();
  assert.ok(h.posts.at(-1)?.presence?.complete);
  h.cells[3] = []; h.edit(4);
  assert.ok((h.state[workspaceKeys.orders] as Order[]).find(o => o.externalReference === "CODE-1")?.sheetDeletedAt);
  h.cells.splice(2, 1); h.change();
  assert.ok((h.state[workspaceKeys.orders] as Order[]).find(o => o.externalReference === "CODE-0")?.sheetDeletedAt);
  assert.equal((h.state[workspaceKeys.orders] as Order[]).find(o => o.externalReference === "CODE-2")?.sheetDeletedAt, undefined);
});

test("empty active sheet archives all unprotected orders but bad headers and failed reads fail closed", () => {
  const h = harness(); h.properties.CP_SYNC_DELETIONS = "true"; h.reconcile();
  h.cells.splice(2); h.reconcile();
  assert.equal((h.state[workspaceKeys.orders] as Order[]).filter(o => o.sheetDeletedAt).length, 3);
  const bad = harness(); bad.properties.CP_SYNC_DELETIONS = "true"; bad.reconcile();
  bad.cells[1] = []; bad.cells.splice(2);
  assert.throws(() => bad.reconcile(), /Header KODE/);
  assert.equal((bad.state[workspaceKeys.orders] as Order[]).some(o => o.sheetDeletedAt), false);
});

test("unlocking invalidates a successful signature even when the sheet has not changed", () => {
  const h = harness(); h.properties.CP_SYNC_DELETIONS = "true"; h.reconcile();
  const order = (h.state[workspaceKeys.orders] as Order[])[0]; order.sheetSyncRefreshRequested = true; order.orderName = "Manual title";
  h.reconcile(); h.reconcile();
  assert.equal((h.state[workspaceKeys.orders] as Order[])[0].orderName, "40M SKADI");
  assert.equal((h.state[workspaceKeys.orders] as Order[])[0].sheetSyncRefreshRequested, undefined);
});

test("moving KODE while uploading defers presence and never archives from a partial snapshot", () => {
  const h = harness(); h.properties.CP_SYNC_DELETIONS = "true";
  let changed = false;
  h.duringFetch(() => { if (!changed) { changed = true; h.cells[2][1] = "MOVED"; } });
  h.reconcile();
  assert.equal(h.posts.some(post => post.presence), false);
  assert.equal((h.state[workspaceKeys.orders] as Order[]).some(o => o.sheetDeletedAt), false);
});

test("direct source uses the existing namespace and the Closing boundary follows row shifts", () => {
  const h = harness(); h.properties.CP_SYNC_NAMESPACE_ID = "existing-target"; h.properties.CP_START_AFTER_CLOSING = "true"; h.properties.CP_SYNC_DELETIONS = "true";
  h.cells[2] = ["CLOSING"]; h.reconcile();
  assert.equal(h.posts[0].spreadsheetId, "existing-target");
  assert.equal(h.posts.at(-1)?.presence?.startRow, 4);
  h.cells.splice(2, 0, []); h.change();
  assert.equal(h.posts.at(-1)?.presence?.startRow, 5);
  assert.equal((h.state[workspaceKeys.orders] as Order[]).some(o => o.sheetDeletedAt), false);
});

test("multi-row paste sends every affected row and deduplicates the next edit", () => {
  const h = harness(); h.edit(3, 2);
  assert.deepEqual(h.posts[0].rows.map(r => r.rowNumber), [3, 4]);
  assert.equal(h.edit(3, 2).unchanged, 2);
  assert.equal(h.requests, 1);
  h.cells[3][3] = "Edited buyer";
  h.edit(3, 2);
  assert.deepEqual(h.posts[1].rows.map(r => r.rowNumber), [4]);
});

test("header edits and edits to other sheets do not upload the workbook", () => {
  const h = harness(); h.edit(2); h.otherSheet();
  assert.equal(h.requests, 0);
});

test("reinstall replaces sync triggers with edit, structural change and everyMinutes(1)", () => {
  const h = harness();
  for (const handler of ["syncComePlayersPayroll", "onComePlayersPayrollEdit", "unrelatedHandler"]) {
    h.triggers.push({ handler, getHandlerFunction: () => handler });
  }
  h.reinstall(); h.reinstall();
  assert.equal(h.triggers.length, 4);
  assert.equal(h.triggers.filter(t => t.kind === "change").length, 1);
  assert.equal(h.triggers.filter(t => t.kind === "edit").length, 1);
  assert.equal(h.triggers.find(t => t.kind === "clock")?.minutes, 1);
  assert.equal(h.triggers.some(t => t.handler === "unrelatedHandler"), true);
});

test("one-minute reconciliation catches missed edits, formula and color changes without resending unchanged rows", () => {
  const h = harness(); h.reconcile();
  assert.equal(h.posts[0].syncMode, "reconcile");
  assert.equal(h.posts[0].rows.length, 3);
  assert.equal(h.reconcile().unchanged, 3);
  assert.equal(h.requests, 1);
  h.cells[3][12] = 30000; // Formula/API changes need no edit event.
  h.colors.set(5, "#000000");
  h.reconcile();
  assert.deepEqual(h.posts[1].rows.map(r => r.rowNumber), [4, 5]);
  assert.equal(h.posts[1].rows[1].boosterBlack, true);
});

test("concurrent edit and clock triggers cannot write together; fallback recovers a busy edit", () => {
  const h = harness();
  h.duringFetch(() => assert.equal(h.reconcile().skipped, "busy"));
  h.edit(3);
  assert.equal(h.requests, 1);
  h.setLocked(true);
  assert.equal(h.edit(4).skipped, "busy");
  h.setLocked(false); h.reconcile();
  assert.deepEqual(h.posts[1].rows.map(r => r.rowNumber), [4, 5]);
  assert.equal(h.locked, false);
});

test("network errors release the lock and never acknowledge failed signatures", () => {
  const h = harness(); h.fail(503);
  assert.throws(() => h.edit(3), /503/);
  assert.equal(h.locked, false);
  assert.equal(Object.keys(h.properties).some(key => key.startsWith("CP_ROW_HASH_")), false);
  h.fail(200); h.reconcile();
  assert.equal(h.posts[1].rows.length, 3);
});

test("an edit during HTTP is picked up on reconciliation instead of caching newer unread values", () => {
  const h = harness(); h.afterFetch(() => { h.cells[2][3] = "Newer value"; });
  h.edit(3); h.reconcile();
  assert.equal(h.posts[1].rows[0].display?.[3], "Newer value");
});

test("duplicate KODE outside edit range is skipped and retried once the duplicate is fixed", () => {
  const h = harness(); h.cells[4][1] = "code-0";
  assert.equal(h.edit(3).skippedConflicts, 1);
  assert.equal((h.state[workspaceKeys.orders] as Order[]).length, 0);
  h.cells[4][1] = "UNIQUE"; h.reconcile();
  assert.equal((h.state[workspaceKeys.orders] as Order[]).length, 3);
});

test("unchanged rejected rows back off for 15 minutes instead of uploading every minute", () => {
  const h = harness(); h.cells[4][1] = "code-0";
  h.reconcile();
  h.reconcile();
  assert.equal(h.requests, 1);
  for (const [key, value] of Object.entries(h.properties)) {
    if (!key.startsWith("CP_ROW_HASH_")) continue;
    const bucket = JSON.parse(value) as Record<string, string>;
    for (const [row, signature] of Object.entries(bucket)) {
      if (signature.includes(":")) bucket[row] = signature.split(":")[0] + ":" + (Math.floor(Date.now() / 60000) - 16).toString(36);
    }
    h.properties[key] = JSON.stringify(bucket);
  }
  h.reconcile();
  assert.deepEqual(h.posts[1].rows.map(r => r.rowNumber), [3, 5]);
});

test("large pastes are batched, unchanged data is suppressed and deleted rows never delete orders", () => {
  const h = harness(205); h.edit(3, 205);
  assert.deepEqual(h.posts.map(p => p.rows.length), [100, 100, 5]);
  assert.equal(h.reconcile().unchanged, 205);
  assert.equal(h.requests, 3);
  h.cells.splice(3, 1); h.reconcile();
  assert.equal((h.state[workspaceKeys.orders] as Order[]).length, 205);
  for (const [key, value] of Object.entries(h.properties)) {
    if (key.startsWith("CP_ROW_HASH_")) assert.ok(Buffer.byteLength(value) < 9000);
  }
});

test("post-closing start row excludes historical data from reads and both sync modes", () => {
  const h = harness(5000);
  h.properties.CP_START_ROW = "4908";
  // A code in a closed period does not conflict with the active period.
  h.cells[2][1] = h.cells[4907][1];
  h.edit(4907);
  assert.equal(h.requests, 0);
  h.edit(4907, 3);
  assert.deepEqual(h.posts[0].rows.map(r => r.rowNumber), [4908, 4909]);
  assert.equal(h.posts[0].rows[0].duplicateCode, false);
  h.reconcile();
  assert.equal(h.posts.flatMap(p => p.rows).every(r => r.rowNumber >= 4908), true);
  assert.equal(h.reads.filter(r => r.rows > 1).every(r => r.row >= 4907), true);
  assert.equal(h.reconcile().unchanged, 95);
});

test("start row validation fails closed and a future period sends nothing", () => {
  for (const value of ["0", "2", "2.5", "bad", "9007199254740992"]) {
    const h = harness(); h.properties.CP_START_ROW = value;
    assert.throws(() => h.reconcile(), /CP_START_ROW/);
    assert.equal(h.requests, 0);
    assert.equal(h.locked, false);
  }
  const h = harness(); h.properties.CP_START_ROW = "4908";
  assert.equal(h.reconcile().sent, 0);
  assert.equal(h.requests, 0);
});

test("moving the start row prunes historical signatures without deleting orders", () => {
  const h = harness(); h.reconcile();
  h.properties.CP_START_ROW = "4";
  h.reconcile();
  const cachedRows = Object.entries(h.properties).filter(([key]) => key.startsWith("CP_ROW_HASH_"))
    .flatMap(([, value]) => Object.keys(JSON.parse(value)));
  assert.deepEqual(cachedRows.sort(), ["4", "5"]);
  assert.equal((h.state[workspaceKeys.orders] as Order[]).length, 3);
});

test("slow preparation still sends a batch and subsequent runs finish instead of deferring forever", () => {
  const h = harness(205, 300);
  assert.equal(h.reconcile().sent, 100);
  assert.equal(h.reconcile().sent, 100);
  assert.equal(h.reconcile().sent, 5);
  assert.equal(h.reconcile().sent, 0);
  assert.equal((h.state[workspaceKeys.orders] as Order[]).length, 205);
  assert.deepEqual(h.posts.map(p => p.rows.length), [100, 100, 5]);
});
