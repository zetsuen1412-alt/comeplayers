import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";

// Test the installed mirror file, independently of the payroll producer.
const script = readFileSync(new URL("../scripts/evo-gaming-mirror.gs", import.meta.url), "utf8");
const QUOTA_ERROR = "Service invoked too many times for one day: urlfetch.";
const RETRY_MS = 15 * 60 * 1000;
type MirrorResult = { ok: boolean; mode?: string; skipped?: string; queued?: boolean; retryAt?: string };
type MirrorRange = { name: string; row: number; column: number; rows: number; columns: number };

function harness() {
  const config = { sourceId: "source-book", targetId: "target-book", sheets: ["MUTASI FH"], chunkCells: 200, runBudgetMs: 45000, setupBudgetMs: 240000 };
  const properties: Record<string, string> = {
    EGM_CONFIG: JSON.stringify(config), EGM_ENABLED: "true", EGM_CURSOR: "0:3",
    EGM_LAST_RESULT: '{"at":"2026-10-07T00:00:00.000Z","result":{"ok":true,"mode":"prior-success"}}',
  };
  let now = Date.parse("2026-10-07T02:00:00.000Z");
  let locked = false, lockCalls = 0, lockReleases = 0, contextReads = 0, attempts = 0, uuid = 0;
  let failure: string | undefined;
  const completed: MirrorRange[] = [];
  const lockTimeouts: number[] = [];
  class ScriptDate extends Date { static now() { return now; } }
  const store = {
    getProperty: (key: string) => properties[key] ?? null,
    getProperties: () => ({ ...properties }),
    setProperty: (key: string, value: string) => { properties[key] = value; },
    setProperties: (values: Record<string, string>) => Object.assign(properties, values),
    deleteProperty: (key: string) => { delete properties[key]; },
  };
  const sheet = { getName: () => "MUTASI FH", getSheetId: () => 123, getLastRow: () => 6, getLastColumn: () => 100 };
  const sourceBook = { getSheetByName: () => sheet };
  const context = createContext({
    Date: ScriptDate, PropertiesService: { getScriptProperties: () => store }, Sheets: {},
    LockService: { getScriptLock: () => {
      lockCalls++;
      return { tryLock: (timeout: number) => { lockTimeouts.push(timeout); if (locked) return false; locked = true; return true; },
        releaseLock: () => { lockReleases++; locked = false; } };
    } },
    Utilities: { getUuid: () => `event-${++uuid}` },
    UrlFetchApp: { fetch: () => { throw new Error("Unexpected real HTTP in isolated mirror test"); } },
    ScriptApp: { getOAuthToken: () => { throw new Error("OAuth must never be read in isolated mirror test"); } },
    console: { log: () => {} },
  });
  runInContext(script, context, { filename: "evo-gaming-mirror.gs" });
  // Retain the real lock/cooldown, reconcile cursor, edit queue and finish logic.
  // Replace only external source/target operations with deterministic failures.
  context.egmContext_ = () => {
    assert.equal(locked, true);
    contextReads++;
    return { config, source: { sheets: [{ properties: { title: "MUTASI FH", sheetId: 123, gridProperties: { rowCount: 10, columnCount: 100 } } }] }, sourceBook };
  };
  context.egmPrepareTarget_ = () => { assert.equal(locked, true); };
  context.egmSyncRange_ = (_context: unknown, range: MirrorRange, _explicit: boolean, result: { rangesUpdated: number }) => {
    assert.equal(locked, true);
    attempts++;
    if (failure) throw new Error(failure);
    completed.push(JSON.parse(JSON.stringify(range)) as MirrorRange);
    result.rangesUpdated++;
  };
  const call = (name: string, value?: unknown) => (context[name] as (value?: unknown) => MirrorResult)(value);
  const pending = (row = 4) => {
    properties.EGM_PENDING_saved = JSON.stringify({ sourceId: config.sourceId, targetId: config.targetId, name: "MUTASI FH", sheetId: 123,
      row, column: 2, rows: 1, columns: 1 });
  };
  return {
    properties, completed, lockTimeouts, pending,
    reconcile: () => call("reconcileEvoGamingMirror"),
    edit: (row = 5) => call("syncEvoGamingEditedRange", { source: { getId: () => config.sourceId }, range: {
      getSheet: () => sheet, getRow: () => row, getColumn: () => 12, getNumRows: () => 1, getNumColumns: () => 2,
    } }),
    fail: (message?: string) => { failure = message; },
    advance: (milliseconds: number) => { now += milliseconds; },
    get now() { return now; }, get locked() { return locked; }, get lockCalls() { return lockCalls; },
    get lockReleases() { return lockReleases; }, get contextReads() { return contextReads; }, get attempts() { return attempts; },
  };
}

test("mirror quota failure leaves its pending range, cursor and last success intact", () => {
  const h = harness(); h.pending(); h.fail(QUOTA_ERROR);
  const pending = h.properties.EGM_PENDING_saved, lastSuccess = h.properties.EGM_LAST_RESULT;
  const result = h.reconcile();
  assert.equal(result.ok, false); assert.equal(result.skipped, "google_urlfetch_quota"); assert.equal(result.queued, true);
  assert.equal(h.properties.EGM_URLFETCH_RETRY_AFTER, String(h.now + RETRY_MS));
  assert.equal(result.retryAt, new Date(h.now + RETRY_MS).toISOString());
  assert.equal(h.properties.EGM_PENDING_saved, pending); assert.equal(h.properties.EGM_CURSOR, "0:3");
  assert.equal(h.properties.EGM_LAST_RESULT, lastSuccess); assert.deepEqual(h.completed, []);
  assert.equal(h.locked, false); assert.equal(h.lockCalls, 1); assert.equal(h.lockReleases, 1);
});

test("mirror quota backoff performs no source work or lock acquisition before expiry", () => {
  const h = harness(); h.pending(); h.fail(QUOTA_ERROR); h.reconcile();
  const before = { lockCalls: h.lockCalls, contextReads: h.contextReads, attempts: h.attempts, cursor: h.properties.EGM_CURSOR, pending: h.properties.EGM_PENDING_saved };
  for (const milliseconds of [0, 60_000, RETRY_MS - 60_001]) {
    h.advance(milliseconds);
    assert.equal(h.reconcile().skipped, "google_urlfetch_quota");
  }
  assert.equal(h.lockCalls, before.lockCalls); assert.equal(h.contextReads, before.contextReads); assert.equal(h.attempts, before.attempts);
  assert.equal(h.properties.EGM_CURSOR, before.cursor); assert.equal(h.properties.EGM_PENDING_saved, before.pending);
});

test("mirror resumes the pending edit and saved scan cursor exactly when quota backoff expires", () => {
  const h = harness(); h.pending(); h.fail(QUOTA_ERROR); h.reconcile();
  h.fail(); h.advance(RETRY_MS);
  const result = h.reconcile();
  assert.equal(result.ok, true); assert.equal(result.mode, "reconcile");
  assert.equal(h.properties.EGM_URLFETCH_RETRY_AFTER, undefined); assert.equal(h.properties.EGM_PENDING_saved, undefined);
  assert.deepEqual(h.completed.map(range => [range.row, range.column, range.rows, range.columns]), [[4, 2, 1, 1], [3, 1, 2, 100], [5, 1, 2, 100]]);
  assert.equal(h.properties.EGM_CURSOR, "0:1");
  assert.equal(JSON.parse(h.properties.EGM_LAST_RESULT).result.mode, "reconcile");
  assert.equal(h.locked, false); assert.equal(h.lockCalls, 2); assert.equal(h.lockReleases, 2);
});

test("an edit during mirror quota backoff still queues its latest coordinates without reading cells", () => {
  const h = harness(); h.pending(); h.fail(QUOTA_ERROR); h.reconcile();
  const before = { lockCalls: h.lockCalls, contextReads: h.contextReads, attempts: h.attempts, cursor: h.properties.EGM_CURSOR };
  h.advance(1000);
  assert.equal(h.edit(5436).skipped, "google_urlfetch_quota");
  assert.deepEqual(JSON.parse(h.properties["EGM_PENDING_event-1"]), { sourceId: "source-book", targetId: "target-book", name: "MUTASI FH", sheetId: 123, row: 5436, column: 12, rows: 1, columns: 2 });
  assert.ok(h.properties.EGM_PENDING_saved); assert.equal(h.properties.EGM_CURSOR, before.cursor);
  assert.equal(h.lockCalls, before.lockCalls); assert.equal(h.contextReads, before.contextReads); assert.equal(h.attempts, before.attempts);
});

test("mirror background cooldown suppresses repeated scans while live edits still drain immediately", () => {
  const h = harness();
  assert.equal(h.reconcile().mode, "reconcile");
  assert.equal(h.properties.EGM_NEXT_RECONCILE_AT, String(h.now + RETRY_MS));
  const contextReads = h.contextReads, attempts = h.attempts;
  h.advance(1000);
  assert.equal(h.reconcile().skipped, "reconcile_cooldown");
  assert.equal(h.contextReads, contextReads); assert.equal(h.attempts, attempts);
  assert.equal(h.edit(5).mode, "edit");
  assert.equal(h.contextReads, contextReads + 1); assert.equal(h.attempts, attempts + 1);
  assert.equal(h.properties["EGM_PENDING_event-1"], undefined);
  assert.deepEqual(h.completed.at(-1), { name: "MUTASI FH", row: 5, column: 12, rows: 1, columns: 2 });
  assert.equal(JSON.parse(h.properties.EGM_LAST_RESULT).result.mode, "edit");
});

test("nonquota mirror failures stay visible and release the lock without a quota backoff", () => {
  const h = harness(); h.fail("Google Sheets API HTTP 503; batch will retry");
  const lastSuccess = h.properties.EGM_LAST_RESULT;
  assert.throws(() => h.edit(5), /HTTP 503/);
  assert.equal(h.properties.EGM_URLFETCH_RETRY_AFTER, undefined); assert.ok(h.properties["EGM_PENDING_event-1"]);
  assert.equal(h.properties.EGM_CURSOR, "0:3"); assert.equal(h.properties.EGM_LAST_RESULT, lastSuccess);
  assert.equal(h.locked, false); assert.equal(h.lockCalls, 1); assert.equal(h.lockReleases, 1);
  h.fail();
  assert.equal(h.edit(6).mode, "edit", "ordinary failures do not suppress the next edit");
  assert.deepEqual(h.completed.map(range => range.row), [5, 6]);
  assert.equal(h.properties["EGM_PENDING_event-1"], undefined); assert.equal(h.properties["EGM_PENDING_event-2"], undefined);
});
