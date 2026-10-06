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
type Summary = { saved: boolean; sent: number; unchanged: number; deferred: number; skipped?: string; skippedConflicts: number; skippedHistorical: number };
type Trigger = { handler: string; kind?: string; minutes?: number; getHandlerFunction(): string };

function harness(count = 3, digestDelayMs = 0) {
  const cells: unknown[][] = [[], headers, ...Array.from({ length: count }, (_, i) =>
    ["25/09/2026 00:24", `CODE-${i}`, "G2G", "Buyer", "40M SKADI", "", "2", "START", "RO", "F2F", 20, 1000, 20000, "Task"])];
  const colors = new Map<number, string>();
  const rosterCells: Record<string, unknown[][]> = {
    "PAYROLL-1": [[], ["", "NAMA"], [1, "FH1 Worker", "BOOST", "", "OFF"], ["", "Unnumbered", "BOOST", "", "∞"], ["", "TOTAL"], ["", "FH1"]],
    "PAYROLL-2": [[], ["", "NAMA"], [1, "Irwan", "BOOST", "", "SHIFT"]],
    "PAYROLL-3": [[], ["", "NAMA"], [1, "FH3 Worker", "BOOST", "", "NEW"]],
  };
  const lockTimeouts: number[] = [];
  const properties: Record<string, string> = { CP_SYNC_SECRET: "a".repeat(30), CP_ACTOR_EMAIL: "admin@example.com",
    CP_SPREADSHEET_ID: "test-book", CP_SHEET_NAME: "MUTASI FH", CP_HEADER_ROW: "2" };
  let locked = false;
  let status = 200;
  let fetchError: string | undefined;
  let duringFetch: (() => void) | undefined;
  let afterFetch: (() => void) | undefined;
  let responseTransform: ((response: Record<string, unknown>) => Record<string, unknown>) | undefined;
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
  function rosterSheet(name: string) {
    if (!rosterCells[name]) return null;
    return { getName: () => name, getSheetId: () => 200 + Number(name.slice(-1)), getLastRow: () => rosterCells[name].length,
      getRange: (row: number, column: number, rows = 1, columns = 1) => ({
        getDisplayValues: () => Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => String(rosterCells[name][row - 1 + r]?.[column - 1 + c] ?? ""))),
      }) };
  }
  const spreadsheet = { getId: () => "test-book", getName: () => "Workbook", getSheetByName: (name: string) => name === "MUTASI FH" ? sheet : rosterSheet(name) };
  const context = createContext({
    Date: ScriptDate,
    PropertiesService: { getScriptProperties: () => propertyStore },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet },
    LockService: { getScriptLock: () => { throw new Error("Payroll must not contend with the mirror script lock"); }, getUserLock: () => ({
      tryLock: (timeout: number) => { lockTimeouts.push(timeout); if (locked) return false; locked = true; return true; },
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
      if (fetchError) throw new Error(fetchError);
      const payload = JSON.parse(options.payload) as GoogleSheetSyncPayload;
      posts.push(payload);
      duringFetch?.();
      if (status !== 200) return { getResponseCode: () => status, getContentText: () => "upstream failure" };
      const merged = mergeGoogleSheetPayroll(state, payload);
      state = merged.state;
      afterFetch?.();
      const result = { ...merged, state: undefined, ok: true,
        saved: merged.added + merged.updated + merged.archived + merged.restored + merged.rosterAdded + merged.rosterUpdated + merged.rosterRemoved > 0 };
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(responseTransform ? responseTransform(result) : result) };
    } },
    console: { log: () => {} },
  });
  runInContext(script, context);
  const api = context as Record<string, (...args: unknown[]) => Summary>;
  return {
    cells, colors, properties, posts, reads, triggers, rosterCells, lockTimeouts,
    edit: (row: number, rows = 1, column = 4) => api.onComePlayersPayrollEdit({ source: spreadsheet, range: range(row, column, rows) }),
    otherSheet: () => api.onComePlayersPayrollEdit({ source: spreadsheet, range: { ...range(3, 1), getSheet: () => ({ getSheetId: () => 456 }) } }),
    reconcile: () => api.syncComePlayersPayroll(), reinstall: () => api.reinstallComePlayersPayrollRealtimeSync(),
    activateAll: () => api.activateComePlayersAllUnlockedSync(),
    rosterEdit: (name: string) => api.onComePlayersPayrollEdit({ source: spreadsheet, range: { getSheet: () => rosterSheet(name) } }),
    change: () => api.onComePlayersPayrollChange({ source: spreadsheet, changeType: "REMOVE_ROW" }),
    fail: (code: number) => { status = code; }, setLocked: (value: boolean) => { locked = value; },
    fetchError: (message?: string) => { fetchError = message; }, advance: (ms: number) => { elapsedMs += ms; },
    duringFetch: (callback: () => void) => { duringFetch = callback; },
    afterFetch: (callback: () => void) => { afterFetch = callback; },
    transformResponse: (callback: (response: Record<string, unknown>) => Record<string, unknown>) => { responseTransform = callback; },
    get locked() { return locked; }, get requests() { return requests; }, get state() { return state; },
  };
}

function dailySource(code: string, day: string, date = '25/09/2026 00:24', rate = 160000, quantity = 1) {
  return [date, code, 'G2G', 'Buyer', '1 Week Package (6 Hours/Day)', `Irwan ${day}`, '2', 'START', 'AION', 'JOKI', quantity, rate, rate * quantity, 'Task'];
}

test('complete DAY packages recover historical records across Closing periods as one parent', () => {
  const h = harness(0); h.properties.CP_SYNC_ALL_EXISTING = 'true'; h.properties.CP_SYNC_ROSTER = 'true';
  h.cells.push(dailySource('X2685', 'D1'), ['CLOSING'], dailySource('X2685', 'DAY 2', '26/09/2026 00:24'), ['CLOSING'], dailySource('X2685', 'D3', '27/09/2026 00:24'));
  h.reconcile();
  const uploads = h.posts.flatMap(post => post.rows).filter(row => row.dailyPackage);
  assert.equal(uploads.length, 1);
  assert.deepEqual(uploads[0].dailyPackage?.rows.map(row => row.rowNumber), [3, 5, 7]);
  const orders = h.state[workspaceKeys.orders] as Order[];
  assert.equal(orders.length, 1);
  assert.equal(orders[0].scheduleTotalDays, 7);
  assert.deepEqual(orders[0].dailyWork?.map(day => day.sequence), [1, 2, 3]);
  assert.equal(orders[0].grossMinor, 480000);
  assert.equal(orders[0].rateMinor, 160000);
  assert.equal(orders[0].dailyWork?.every(day => day.rateMinor === 160000), true);
  assert.equal(orders[0].dailyWork?.every(day => day.workerAssignments?.[0]?.employeeName === 'Irwan'), true);
  assert.equal(orders[0].dailyWork?.some(day => day.status === 'verified'), false, 'Closing position must not create payroll eligibility');
  assert.equal(h.reconcile().sent, 0, 'the complete package signature is acknowledged once');
});

test('editing one historical DAY uploads its entire package and preserves a settled DAY', () => {
  const h = harness(0); h.properties.CP_SYNC_ALL_EXISTING = 'true'; h.properties.CP_SYNC_ROSTER = 'true';
  h.cells.push(dailySource('DAILY', 'D1'), dailySource('DAILY', 'D2', '26/09/2026 00:24'), ['CLOSING']);
  h.reconcile();
  const order = (h.state[workspaceKeys.orders] as Order[])[0];
  order.dailyWork![0].status = 'verified'; order.dailyWork![0].verifiedAt = '2026-09-25T12:00:00Z';
  order.operationalStatus = 'partially_completed';
  const frozen = structuredClone(order.dailyWork![0]);
  h.cells[3][11] = 176000; h.cells[3][12] = 176000;
  const before = h.posts.length; h.edit(4);
  const uploads = h.posts.slice(before).flatMap(post => post.rows);
  assert.equal(uploads.length, 1);
  assert.deepEqual(uploads[0].dailyPackage?.rows.map(row => row.rowNumber), [3, 4]);
  const updated = (h.state[workspaceKeys.orders] as Order[])[0];
  assert.deepEqual(updated.dailyWork![0], frozen);
  assert.equal(updated.dailyWork![1].rateMinor, 176000);
  assert.equal(updated.grossMinor, 336000);
  assert.equal(updated.rateMinor, undefined, 'mixed DAY rates must not invent a package rate');
});

test('explicitly locked DAY packages remain byte-identical and unlock retries the whole group', () => {
  const h = harness(0); h.properties.CP_SYNC_ALL_EXISTING = 'true'; h.properties.CP_SYNC_ROSTER = 'true';
  h.cells.push(dailySource('LOCKED-DAY', 'D1'), dailySource('LOCKED-DAY', 'D2'), ['CLOSING']);
  h.reconcile();
  const original = (h.state[workspaceKeys.orders] as Order[])[0]; original.sheetSyncLocked = true;
  const snapshot = structuredClone(original);
  h.cells[3][11] = 175000; h.cells[3][12] = 175000; h.edit(4);
  assert.deepEqual((h.state[workspaceKeys.orders] as Order[])[0], snapshot);
  const current = (h.state[workspaceKeys.orders] as Order[])[0]; current.sheetSyncLocked = false; current.sheetSyncRefreshRequested = true;
  h.reconcile();
  assert.equal((h.state[workspaceKeys.orders] as Order[])[0].dailyWork![1].rateMinor, 175000);
});

test('a package crossing a raw row batch boundary stays one upload unit', () => {
  const h = harness(99); h.properties.CP_SYNC_ROSTER = 'true';
  h.cells.push(dailySource('BATCH-DAY', 'D1'), dailySource('BATCH-DAY', 'D2'));
  h.reconcile();
  const dataPosts = h.posts.filter(post => post.rows.length);
  assert.deepEqual(dataPosts.map(post => post.rows.length), [100]);
  assert.equal(dataPosts[0].rows.filter(row => row.dailyPackage).length, 1);
  assert.equal(dataPosts[0].rows.find(row => row.dailyPackage)?.dailyPackage?.rows.length, 2);
  assert.equal((h.state[workspaceKeys.orders] as Order[]).find(order => order.externalReference === 'BATCH-DAY')?.dailyWork?.length, 2);
});

test('merged row1 headers are detected before importing historical DAY rows', () => {
  const h = harness(0); h.properties.CP_SYNC_ALL_EXISTING = 'true'; h.properties.CP_SYNC_ROSTER = 'true';
  h.cells[0] = headers; h.cells[1] = [];
  h.cells.push(dailySource('MERGED-HEADER', 'D1'), dailySource('MERGED-HEADER', 'D2'), ['CLOSING']);
  h.reconcile();
  assert.equal(h.posts.every(post => post.headerRow === 1), true);
  assert.equal((h.state[workspaceKeys.orders] as Order[])[0].dailyWork?.length, 2);
  assert.equal((h.state[workspaceKeys.orders] as Order[])[0].grossMinor, 320000);
});

test('reused CODE with incompatible package rows is not resolved by selecting its first DAY', () => {
  const h = harness(0); h.properties.CP_SYNC_ALL_EXISTING = 'true'; h.properties.CP_SYNC_ROSTER = 'true';
  h.cells.push(dailySource('REUSED', 'D1'), dailySource('REUSED', 'D2'), ['CLOSING']);
  h.cells[3][3] = 'Different Buyer';
  const result = h.reconcile();
  assert.equal(result.skippedConflicts, 1);
  assert.equal((h.state[workspaceKeys.orders] as Order[]).length, 0);
  assert.equal(h.posts.flatMap(post => post.rows).filter(row => row.dailyPackage).length, 1);
});

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

test('Google daily UrlFetch quota keeps failed rows pending and retries without reading during backoff', () => {
  const h = harness(); h.properties.CP_LAST_SYNC_AT = 'last-success';
  h.fetchError('Exception: Service invoked too many times for one day: urlfetch.');
  const pending = h.reconcile();
  assert.equal(pending.skipped, 'google_urlfetch_quota');
  assert.equal(pending.saved, false);
  assert.equal(h.locked, false);
  assert.equal(h.properties.CP_LAST_SYNC_AT, 'last-success');
  assert.equal(h.properties.CP_LAST_SYNC_STATUS, 'GOOGLE_URLFETCH_QUOTA');
  assert.equal(Object.keys(h.properties).some(key => key.startsWith('CP_ROW_HASH_')), false);
  const readCount = h.reads.length; const lockCount = h.lockTimeouts.length;
  h.fetchError();
  assert.equal(h.reconcile().skipped, 'google_urlfetch_quota');
  assert.equal(h.requests, 1);
  assert.equal(h.reads.length, readCount);
  assert.equal(h.lockTimeouts.length, lockCount);
  h.advance(15 * 60 * 1000 + 1);
  assert.equal(h.reconcile().sent, 3);
  assert.equal((h.state[workspaceKeys.orders] as Order[]).length, 3);
  assert.equal(h.properties.CP_URLFETCH_RETRY_AFTER, undefined);
});

test('nonquota Google failures remain visible and do not start quota backoff', () => {
  const h = harness(); h.fetchError('Service unavailable');
  assert.throws(() => h.reconcile(), /Service unavailable/);
  assert.equal(h.properties.CP_URLFETCH_RETRY_AFTER, undefined);
  assert.equal(h.locked, false);
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

test("all-existing mode refreshes orders before latest Closing without importing unknown history", () => {
  const h = harness(); h.reconcile();
  h.cells[2][11] = 2200; h.cells[2][12] = 44000;
  const historical = [...h.cells[2]]; historical[1] = "UNIMPORTED-HISTORY";
  const current = [...h.cells[2]]; current[1] = "CURRENT";
  h.cells.push(historical, ["CLOSING"], current);
  h.properties.CP_SYNC_ALL_EXISTING = "true"; h.properties.CP_SYNC_DELETIONS = "true";
  const result = h.reconcile();
  assert.equal(result.skippedHistorical, 1);
  const order = (h.state[workspaceKeys.orders] as Order[]).find(row => row.externalReference === "CODE-0")!;
  assert.equal(order.rateMinor, 2200); assert.equal(order.grossMinor, 44000);
  assert.equal((h.state[workspaceKeys.orders] as Order[]).length, 4);
  assert.equal((h.state[workspaceKeys.orders] as Order[]).some(row => row.externalReference === "UNIMPORTED-HISTORY"), false);
  assert.equal(h.posts.find(post => post.newOrdersStartRow)?.newOrdersStartRow, 8);
  assert.equal(h.posts.at(-1)?.presence?.startRow, 3);
  const firstRequests = h.requests;
  assert.equal(h.reconcile().unchanged, 4);
  assert.equal(h.requests, firstRequests + 2, "preflight and final presence run without uploading ignored history");
  assert.equal(h.posts.filter(post => post.newOrdersStartRow).flatMap(post => post.rows).some(row => row.values[1] === "UNIMPORTED-HISTORY"), false);
});

test("Closing-period duplicate counts permit a new code with unrelated unimported history", () => {
  const h = harness(1);
  const current = [...h.cells[2]];
  h.cells.push(["CLOSING"], current);
  h.properties.CP_SYNC_ALL_EXISTING = "true";
  h.reconcile();
  const uploaded = h.posts.flatMap(post => post.rows);
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded.every(row => row.duplicateCode === false), true);
  assert.equal(uploaded.every(row => row.codeOccurrences === 2), true);
  const orders = h.state[workspaceKeys.orders] as Order[];
  assert.equal(orders.length, 1);
  assert.equal(orders[0].importSourceRow, 5);
});

test("a same-period duplicate still blocks a tracked historical order", () => {
  const h = harness(2); h.reconcile();
  h.cells[3][1] = "CODE-0"; h.cells[2][11] = 2200;
  h.cells.push(["CLOSING"]);
  h.properties.CP_SYNC_ALL_EXISTING = "true";
  const result = h.reconcile();
  assert.equal(result.skippedConflicts, 1);
  assert.equal((h.state[workspaceKeys.orders] as Order[]).find(row => row.externalReference === "CODE-0")?.rateMinor, 1000);
});

test("a unique historical order moves by KODE and edits before Closing are sent immediately", () => {
  const h = harness(1); h.reconcile();
  h.cells.splice(2, 0, []); h.cells.push(["CLOSING"]);
  h.properties.CP_SYNC_ALL_EXISTING = "true";
  h.reconcile();
  assert.equal((h.state[workspaceKeys.orders] as Order[])[0].importSourceRow, 4);
  h.cells[3][11] = 2200; h.cells[3][12] = 44000; h.edit(4);
  assert.deepEqual(h.posts.at(-1)?.rows.map(row => row.rowNumber), [4]);
  assert.equal((h.state[workspaceKeys.orders] as Order[])[0].rateMinor, 2200);
});

test("complete rosters retain OFF and unnumbered names and send even when orders are unchanged", () => {
  const h = harness(); h.properties.CP_SYNC_ROSTER = "true"; h.properties.CP_SYNC_DELETIONS = "true";
  h.reconcile();
  const roster = h.posts[0].roster!;
  assert.deepEqual(roster.sheets[0].rows.map(row => [row.rowNumber, row.name, row.type]), [[3, "FH1 Worker", "OFF"], [4, "Unnumbered", "∞"]]);
  const before = h.requests;
  h.reconcile();
  assert.equal(h.requests, before + 1);
  assert.equal(h.posts.at(-1)?.rows.length, 0);
  assert.ok(h.posts.at(-1)?.roster?.complete);
});

test("a payroll-tab edit reconciles workers after roster changes even with no Mutasi edit", () => {
  const h = harness(); h.properties.CP_SYNC_ROSTER = "true"; h.cells[2][5] = "Irwan";
  h.reconcile();
  assert.equal((h.state[workspaceKeys.orders] as Order[])[0].employeeName, "Irwan");
  h.rosterCells["PAYROLL-2"][2][1] = "Irwan2";
  h.rosterCells["PAYROLL-2"][2][4] = "FULL";
  const before = h.posts.length;
  h.rosterEdit("PAYROLL-2");
  assert.equal(h.posts[before].syncMode, "reconcile");
  assert.equal(h.posts[before].rows.length, 3, "roster signature invalidates cached worker assignments");
  assert.equal((h.state[workspaceKeys.orders] as Order[])[0].employeeName, "Irwan2");
  assert.equal((h.state[workspaceKeys.employees] as { name: string; workforceStatus: string }[]).find(employee => employee.name === "Irwan2")?.workforceStatus, "FULL");
});

test("missing or invalid roster sheets fail before sending an incomplete employee snapshot", () => {
  for (const missing of [false, true]) {
    const h = harness(); h.properties.CP_SYNC_ROSTER = "true";
    if (missing) delete h.rosterCells["PAYROLL-3"];
    else h.rosterCells["PAYROLL-3"][1][1] = "wrong header";
    assert.throws(() => h.reconcile(), /PAYROLL-3/);
    assert.equal(h.requests, 0);
    assert.equal(h.locked, false);
  }
});

test("activation preserves source, namespace and secrets while enabling all-existing and rosters", () => {
  const h = harness(); h.cells.push(["CLOSING"]);
  h.properties.CP_SYNC_NAMESPACE_ID = "old-mirror-namespace";
  const originalSecret = h.properties.CP_SYNC_SECRET;
  h.activateAll();
  assert.equal(h.properties.CP_SPREADSHEET_ID, "test-book");
  assert.equal(h.properties.CP_SYNC_NAMESPACE_ID, "old-mirror-namespace");
  assert.equal(h.properties.CP_SYNC_SECRET, originalSecret);
  assert.equal(h.properties.CP_SYNC_ALL_EXISTING, "true");
  assert.equal(h.properties.CP_SYNC_ROSTER, "true");
  assert.equal(h.posts[0].spreadsheetId, "old-mirror-namespace");
  assert.equal(h.triggers.filter(trigger => trigger.kind === "clock").length, 1);
  assert.ok(h.posts.at(-1)?.roster?.complete);
});

test("payroll uses its user lock with a longer reconciliation wait and releases on failed HTTP", () => {
  const h = harness(); h.edit(3); h.reconcile();
  assert.deepEqual(h.lockTimeouts, [1000, 25000]);
  h.fail(503); h.cells[2][11] = 2200;
  assert.throws(() => h.reconcile(), /503/);
  assert.equal(h.locked, false);
  h.setLocked(true);
  assert.equal(h.edit(4).skipped, "busy");
  assert.equal(h.reconcile().skipped, "busy");
});

test("all-existing preflight excludes thousands of unknown historical rows before signing or posting", () => {
  const h = harness(1, 300); h.reconcile();
  const historical = Array.from({ length: 1200 }, (_, i) => { const row = [...h.cells[2]]; row[1] = `OLD-${i}`; return row; });
  h.cells.push(...historical, ["CLOSING"]);
  h.properties.CP_SYNC_ALL_EXISTING = "true";
  h.properties.CP_SYNC_DELETIONS = "true";
  h.cells[2][11] = 2200;
  const before = h.posts.length;
  const result = h.reconcile();
  const posts = h.posts.slice(before);
  assert.equal(posts.length, 3, "one preflight, one relevant batch, one final complete inventory");
  assert.ok(posts[0].presence?.complete);
  assert.equal(result.sent, 1);
  assert.equal(result.deferred, 0);
  assert.equal(result.skippedHistorical, 1200);
  assert.deepEqual(posts.flatMap(post => post.rows).map(row => row.rowNumber), [3]);
  assert.equal((h.state[workspaceKeys.orders] as Order[])[0].rateMinor, 2200);
});

test("all-existing preflight fails closed on a concurrently moved KODE inventory", () => {
  const h = harness(1); h.reconcile();
  h.cells.push(["CLOSING"]);
  h.properties.CP_SYNC_ALL_EXISTING = "true";
  const before = h.posts.length;
  let reads = 0;
  // A cell value changes between the initial inventory and the preflight recheck.
  Object.defineProperty(h.cells[2], 1, { get() { return ++reads >= 5 ? "MOVED-CODE" : "CODE-0"; } });
  assert.throws(() => h.reconcile(), /Daftar KODE .* berubah/);
  assert.equal(h.posts.length, before);
  assert.equal(h.locked, false);
});

test("all-existing preflight applies roster renames before refreshing tracked historical workers", () => {
  const h = harness(1); h.properties.CP_SYNC_ROSTER = "true"; h.cells[2][5] = "Irwan";
  h.reconcile(); h.cells.push(["CLOSING"]);
  h.properties.CP_SYNC_ALL_EXISTING = "true"; h.properties.CP_SYNC_DELETIONS = "true";
  h.rosterCells["PAYROLL-2"][2][1] = "Irwan2";
  const before = h.posts.length;
  h.rosterEdit("PAYROLL-2");
  assert.ok(h.posts[before].presence?.complete);
  assert.equal(h.posts[before].rows.length, 0);
  assert.equal(h.posts[before + 1].rows.length, 1);
  assert.equal((h.state[workspaceKeys.orders] as Order[])[0].employeeName, "Irwan2");
});

test("payroll sorting and TYPE changes update the roster without replaying cached orders", () => {
  const h = harness(1); h.properties.CP_SYNC_ROSTER = "true"; h.cells[2][5] = "Irwan";
  h.reconcile(); h.cells.push(["CLOSING"]);
  h.properties.CP_SYNC_ALL_EXISTING = "true"; h.properties.CP_SYNC_DELETIONS = "true";
  h.reconcile(); // Cache the all-existing boundary before changing roster metadata.
  const originalOrders = structuredClone(h.state[workspaceKeys.orders]);
  const before = h.posts.length;
  [h.rosterCells["PAYROLL-1"][2], h.rosterCells["PAYROLL-1"][3]] = [h.rosterCells["PAYROLL-1"][3], h.rosterCells["PAYROLL-1"][2]];
  h.rosterCells["PAYROLL-2"][2][4] = "FULL";
  const result = h.rosterEdit("PAYROLL-2");
  assert.equal(result.sent, 0);
  assert.equal(result.deferred, 0);
  assert.equal(h.posts.slice(before).every(post => post.rows.length === 0), true);
  assert.deepEqual(h.state[workspaceKeys.orders], originalOrders);
  const employees = h.state[workspaceKeys.employees] as { name: string; workforceStatus: string; sheetRosterSource: { rowNumber: number } }[];
  assert.equal(employees.find(employee => employee.name === "Irwan")?.workforceStatus, "FULL");
  assert.equal(employees.find(employee => employee.name === "FH1 Worker")?.sheetRosterSource.rowNumber, 4);
  assert.equal(employees.find(employee => employee.name === "Unnumbered")?.sheetRosterSource.rowNumber, 3);
  const after = h.posts.length;
  h.reconcile();
  assert.equal(h.posts.slice(after).every(post => post.rows.length === 0), true, "metadata changes do not cause repeated order uploads");
});

test("roster name whitespace is normalized without replaying unchanged worker identities", () => {
  const h = harness(1); h.properties.CP_SYNC_ROSTER = "true"; h.cells[2][5] = "Irwan";
  h.reconcile();
  h.rosterCells["PAYROLL-1"][2][1] = "  FH1   Worker  ";
  h.rosterCells["PAYROLL-2"][2][1] = "  Irwan  ";
  const before = h.posts.length;
  assert.equal(h.rosterEdit("PAYROLL-2").sent, 0);
  assert.equal(h.posts.slice(before).every(post => post.rows.length === 0), true);
});

test("display-name case changes refresh cached order employee names", () => {
  const h = harness(1); h.properties.CP_SYNC_ROSTER = "true"; h.cells[2][5] = "Irwan";
  h.reconcile(); h.rosterCells["PAYROLL-2"][2][1] = "IRWAN";
  assert.equal(h.rosterEdit("PAYROLL-2").sent, 1);
  assert.equal((h.state[workspaceKeys.orders] as Order[])[0].employeeName, "IRWAN");
});

test("roster additions, removals and division moves invalidate worker-resolution signatures", () => {
  for (const change of ["add", "remove", "move"] as const) {
    const h = harness(1); h.properties.CP_SYNC_ROSTER = "true"; h.cells[2][5] = "Irwan";
    h.reconcile();
    if (change === "add") h.rosterCells["PAYROLL-2"].push(["", "New Worker", "BOOST", "", "NEW"]);
    else {
      const [worker] = h.rosterCells["PAYROLL-2"].splice(2, 1);
      if (change === "move") h.rosterCells["PAYROLL-1"].splice(2, 0, worker);
    }
    const before = h.posts.length;
    assert.equal(h.rosterEdit("PAYROLL-2").sent, 1, change);
    assert.deepEqual(h.posts.slice(before).flatMap(post => post.rows).map(row => row.rowNumber), [3]);
    const order = (h.state[workspaceKeys.orders] as Order[])[0];
    assert.equal(order.employeeName, change === "add" ? "Irwan" : undefined);
  }
});

test("a current reused KODE is rejected before the tracked historical row refreshes in its later batch", () => {
  const h = harness(101); h.reconcile();
  h.cells[2][11] = 2200;
  const reused = [...h.cells[2]]; reused[11] = 999;
  h.cells.push(["CLOSING"], reused);
  h.properties.CP_SYNC_ALL_EXISTING = "true";
  const before = h.posts.length;
  const result = h.reconcile();
  const batches = h.posts.slice(before).filter(post => post.rows.length);
  assert.equal(batches[0].rows[0].rowNumber, 105, "current orders are considered first");
  assert.equal(result.skippedConflicts, 1);
  const order = (h.state[workspaceKeys.orders] as Order[]).find(row => row.externalReference === "CODE-0")!;
  assert.equal(order.importSourceRow, 3);
  assert.equal(order.rateMinor, 2200);
});

test("all-existing preflight stops without uploading rows when identity manifests are missing or invalid", () => {
  for (const trackedRows of [undefined, [{ reference: "CODE-0", rowNumber: 0 }], [{ reference: 123, rowNumber: 3 }]]) {
    const h = harness(1); h.reconcile(); h.cells.push(["CLOSING"]);
    h.properties.CP_SYNC_ALL_EXISTING = "true";
    h.transformResponse(response => ({ ...response, trackedRows }));
    const before = h.posts.length;
    assert.throws(() => h.reconcile(), /Respons pemeriksaan pesanan Sheet tidak valid/);
    assert.equal(h.posts.length, before + 1);
    assert.equal(h.posts.at(-1)?.rows.length, 0);
    assert.equal(h.locked, false);
  }
});

test("a concurrent Closing move defers final presence even when every KODE stays unchanged", () => {
  const h = harness(2); h.reconcile();
  h.cells.push(["CLOSING"]); h.cells[2][11] = 2200;
  h.properties.CP_SYNC_ALL_EXISTING = "true"; h.properties.CP_SYNC_DELETIONS = "true";
  const before = h.posts.length;
  h.afterFetch(() => { if (h.posts.at(-1)?.rows.length) h.cells[4][0] = "CLOSED ELSEWHERE"; });
  h.reconcile();
  assert.equal(h.posts.slice(before).filter(post => post.presence).length, 1, "only the stable initial presence is sent");
  assert.equal(JSON.parse(h.properties.CP_LAST_SYNC_RESULT).deletionsDeferred, true);
});

test("all-existing identity preflight respects an explicit deletion disable", () => {
  const h = harness(2); h.reconcile();
  h.cells[3][1] = ""; h.cells.push(["CLOSING"]);
  h.properties.CP_SYNC_ALL_EXISTING = "true"; h.properties.CP_SYNC_DELETIONS = "false";
  const before = h.posts.length;
  h.reconcile();
  assert.equal(h.posts.slice(before).some(post => post.presence), false);
  assert.equal((h.state[workspaceKeys.orders] as Order[]).some(order => order.sheetDeletedAt), false);
});
