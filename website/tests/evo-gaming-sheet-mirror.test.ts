import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

// A small Sheets API emulator verifies actual read/write requests, not source strings.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
type Cell = { effectiveValue?: Json; userEnteredValue?: Json; effectiveFormat?: Json; dataValidation?: Json; formattedValue?: string };
type Grid = { properties: Json; merges: Json[]; conditionalFormats: Json[]; cells: Map<string, Cell>; lastRow: number; lastColumn: number };
type Result = { ok: boolean; complete: boolean; skipped?: string; rowsUnchanged: number; cellsUpdated: number; blankRowsPreserved: number };
const script = readFileSync(new URL('../scripts/evo-gaming-sheet-mirror.gs', import.meta.url), 'utf8');
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const key = (row: number, column: number) => `${row}:${column}`;
function grid(title = 'MUTASI FH', sheetId = 1, rowCount = 100, columnCount = 20): Grid {
  return { properties: { title, sheetId, gridProperties: { rowCount, columnCount } }, merges: [], conditionalFormats: [], cells: new Map(), lastRow: 0, lastColumn: 0 };
}
function harness() {
  const source = grid(), target = grid('MUTASI FH', 2);
  const books: Record<string, { properties: Json; sheets: Grid[] }> = {
    source: { properties: { defaultFormat: {} }, sheets: [source] }, target: { properties: { defaultFormat: {} }, sheets: [target] },
  };
  const properties: Record<string, string> = { CP_SYNC_SECRET: 'unrelated-kept', CP_START_ROW: '4908' };
  const cache: Record<string, string> = {};
  const triggers: Json[] = [{ handler: 'syncComePlayersPayroll', getHandlerFunction() { return this.handler; } }, { handler: 'onComePlayersPayrollEdit', getHandlerFunction() { return this.handler; } }];
  const writes: Json[] = [], reads: Json[] = [], lists = new Map<string, string[][]>();
  let locked = false, failWrite = false, uuid = 0, elapsed = 0, delayRead = 0, httpError = 0, digests = 0;
  let duringWrite: (() => void) | undefined;
  class FakeDate extends Date { static now() { return Date.now() + elapsed; } }
  const propertyStore = {
    getProperty: (name: string) => properties[name] ?? null,
    getProperties: () => ({ ...properties }),
    setProperty: (name: string, value: string) => { properties[name] = value; },
    setProperties: (values: Record<string, string>) => { Object.assign(properties, values); },
    deleteProperty: (name: string) => { delete properties[name]; },
  };
  function put(sheet: Grid, row: number, column: number, value: string | number | boolean | null, extra: Cell = {}) {
    const typed = value === null ? undefined : typeof value === 'number' ? { numberValue: value } : typeof value === 'boolean' ? { boolValue: value } : { stringValue: value };
    sheet.cells.set(key(row, column), { effectiveValue: typed, userEnteredValue: typed, ...copy(extra) });
    sheet.lastRow = Math.max(sheet.lastRow, row); sheet.lastColumn = Math.max(sheet.lastColumn, column);
    sheet.properties.gridProperties.rowCount = Math.max(sheet.properties.gridProperties.rowCount, row);
    sheet.properties.gridProperties.columnCount = Math.max(sheet.properties.gridProperties.columnCount, column);
  }
  function parseRange(a1: string) {
    const match = /^'((?:[^']|'')+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(a1);
    assert.ok(match, a1);
    const column = (letters: string) => [...letters].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
    return { name: match[1].replace(/''/g, "'"), column: column(match[2]), row: Number(match[3]), endColumn: column(match[4]), endRow: Number(match[5]) };
  }
  const context = createContext({
    Date: FakeDate, console: { log() {} },
    PropertiesService: { getScriptProperties: () => propertyStore },
    CacheService: { getScriptCache: () => ({ get: (name: string) => cache[name] ?? null, put: (name: string, value: string) => { cache[name] = value; } }) },
    Utilities: { getUuid: () => String(++uuid), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_algorithm: string, text: string) => { digests++; return createHash('sha256').update(text).digest(); }, base64EncodeWebSafe: (buffer: Buffer) => buffer.toString('base64url') },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (locked) return false; locked = true; return true; }, releaseLock: () => { locked = false; } }) },
    ScriptApp: {
      getOAuthToken: () => 'test-oauth-token',
      getProjectTriggers: () => [...triggers], deleteTrigger: (trigger: Json) => triggers.splice(triggers.indexOf(trigger), 1),
      newTrigger: (handler: string) => {
        const trigger: Json = { handler, getHandlerFunction: () => handler };
        const builder = { forSpreadsheet: (id: string) => { trigger.source = id; return builder; }, onEdit: () => { trigger.kind = 'edit'; return builder; },
          timeBased: () => { trigger.kind = 'clock'; return builder; }, everyMinutes: (minutes: number) => { trigger.minutes = minutes; return builder; }, create: () => triggers.push(trigger) };
        return builder;
      },
    },
    SpreadsheetApp: { openById: (id: string) => ({ getSheetByName: (name: string) => {
      const sheet = books[id].sheets.find(s => s.properties.title === name);
      return sheet && { getLastRow: () => sheet.lastRow, getLastColumn: () => sheet.lastColumn };
    } }) },
    Sheets: { Spreadsheets: {
      get: (id: string, options: Json) => {
        reads.push(copy({ id, ...options }));
        if (!options.ranges) return copy({ properties: books[id].properties, sheets: books[id].sheets.map(s => ({ properties: s.properties, merges: s.merges, conditionalFormats: s.conditionalFormats })) });
        elapsed += delayRead;
        const range = parseRange(options.ranges[0]), sheet = books[id].sheets.find(s => s.properties.title === range.name)!;
        assert.ok(range.endRow <= sheet.properties.gridProperties.rowCount);
        assert.ok(range.endColumn <= sheet.properties.gridProperties.columnCount);
        return { sheets: [{ data: [{ startRow: range.row - 1, startColumn: range.column - 1, rowData: Array.from({ length: range.endRow - range.row + 1 }, (_, r) => ({
          values: Array.from({ length: range.endColumn - range.column + 1 }, (_, c) => copy(sheet.cells.get(key(range.row + r, range.column + c)) ?? {})),
        })) }] }] };
      },
      Values: { get: (id: string, reference: string) => { assert.equal(id, 'source'); return { values: lists.get(reference) ?? [] }; } },
      batchUpdate: (body: Json, id: string) => {
        assert.equal(locked, true, 'every target write holds the script lock');
        assert.equal(id, 'target', 'never mutate source');
        if (failWrite) throw new Error('simulated network failure');
        writes.push(copy(body));
        const replies: Json[] = [];
        for (const request of body.requests) {
          if (request.addSheet) {
            const p = request.addSheet.properties, newSheet = grid(p.title, 42, p.gridProperties.rowCount, p.gridProperties.columnCount);
            books.target.sheets.push(newSheet); replies.push({ addSheet: { properties: newSheet.properties } });
          } else if (request.updateSheetProperties) {
            const p = request.updateSheetProperties.properties, sheet = books.target.sheets.find(s => s.properties.sheetId === p.sheetId)!;
            Object.assign(sheet.properties.gridProperties, p.gridProperties);
          } else if (request.deleteConditionalFormatRule) {
            const p = request.deleteConditionalFormatRule;
            books.target.sheets.find(s => s.properties.sheetId === p.sheetId)!.conditionalFormats.splice(p.index, 1);
          } else if (request.unmergeCells || request.mergeCells) {
            const p = request.unmergeCells || request.mergeCells, sheet = books.target.sheets.find(s => s.properties.sheetId === p.range.sheetId)!;
            if (request.mergeCells) sheet.merges.push(copy(p.range));
            else sheet.merges = sheet.merges.filter(m => JSON.stringify(m) !== JSON.stringify(p.range));
          } else if (request.updateCells) {
            const p = request.updateCells, sheet = books.target.sheets.find(s => s.properties.sheetId === p.start.sheetId)!;
            assert.equal(p.fields.includes('formulaValue'), false);
            p.rows.forEach((row: Json, r: number) => row.values.forEach((cell: Json, c: number) => {
              assert.equal(cell.userEnteredValue?.formulaValue, undefined, 'writes contain resolved values only');
              put(sheet, p.start.rowIndex + r + 1, p.start.columnIndex + c + 1, null, {
                effectiveValue: cell.userEnteredValue, userEnteredValue: cell.userEnteredValue,
                effectiveFormat: cell.userEnteredFormat, dataValidation: cell.dataValidation,
              });
            }));
          } else assert.fail(`Unknown request ${JSON.stringify(request)}`);
        }
        const callback = duringWrite; duringWrite = undefined; callback?.();
        return { replies };
      },
    } },
  });
  context.UrlFetchApp = { fetch: (url: string, options: Json) => {
    const endpoint = new URL(url);
    assert.equal(endpoint.origin, 'https://sheets.googleapis.com', 'never send authorization outside Google Sheets');
    assert.equal(options.followRedirects, false);
    assert.equal(options.headers.Authorization, 'Bearer test-oauth-token');
    if (httpError) return { getResponseCode: () => httpError, getContentText: () => 'private response must not appear in errors' };
    const match = /^\/v4\/spreadsheets\/([^/:]+)(.*)$/.exec(endpoint.pathname)!;
    const id = decodeURIComponent(match[1]), suffix = match[2], service = (context.Sheets as Json).Spreadsheets;
    const query: Json = Object.fromEntries(endpoint.searchParams);
    if (endpoint.searchParams.has('ranges')) query.ranges = endpoint.searchParams.getAll('ranges');
    const result = suffix === ':batchUpdate' ? service.batchUpdate(JSON.parse(options.payload), id)
      : suffix.startsWith('/values/') ? service.Values.get(id, decodeURIComponent(suffix.slice(8)), query)
      : service.get(id, query);
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify(result) };
  } };
  runInContext(script, context);
  const api = context as Json;
  Object.assign(api.EVO_GAMING_MIRROR, { sourceId: 'source', targetId: 'target' });
  properties.EGM_CONFIG = JSON.stringify(api.EVO_GAMING_MIRROR); properties.EGM_ENABLED = 'true';
  function edit(row: number, column: number, rows = 1, columns = 1, name = 'MUTASI FH', id = 'source') {
    return api.syncEvoGamingEditedRange({ source: { getId: () => id }, range: {
      getSheet: () => ({ getName: () => name, getSheetId: () => 1 }), getRow: () => row, getColumn: () => column, getNumRows: () => rows, getNumColumns: () => columns,
    } }) as Result;
  }
  return { source, target, books, properties, cache, triggers, writes, reads, lists, api, put, edit,
    setup: () => api.setupEvoGamingMirrorSync() as Result, reconcile: () => api.reconcileEvoGamingMirror() as Result,
    fail: (value: boolean) => { failWrite = value; }, lock: (value: boolean) => { locked = value; },
    httpError: (status: number) => { httpError = status; },
    duringWrite: (callback: () => void) => { duringWrite = callback; }, delay: (ms: number) => { delayRead = ms; },
    value: (row: number, column: number, sheet = target) => sheet.cells.get(key(row, column))?.effectiveValue,
    get locked() { return locked; }, get digests() { return digests; }, get pending() { return Object.keys(properties).filter(k => k.startsWith('EGM_PENDING_')); },
  };
}

test('text edit copies only its exact range in the same row; source and adjacent history are untouched', () => {
  const h = harness(); h.put(h.source, 5068, 2, 'X2832'); h.put(h.source, 5068, 5, 'NEW ORDER'); h.put(h.target, 5068, 4, 'KEEP BUYER');
  h.edit(5068, 5);
  assert.deepEqual(h.value(5068, 5), { stringValue: 'NEW ORDER' });
  assert.deepEqual(h.value(5068, 4), { stringValue: 'KEEP BUYER' });
  assert.equal(h.value(5068, 2), undefined);
  assert.deepEqual(h.reads.filter(r => r.ranges).map(r => r.ranges), [["'MUTASI FH'!E5068:E5068"], ["'MUTASI FH'!E5068:E5068"]]);
});

test('resolved circular date/time replaces target formula/1899 zero with the exact source serial and format', () => {
  const h = harness(), serial = (Date.UTC(2026, 8, 25, 10, 55) - Date.UTC(1899, 11, 30)) / 86400000;
  h.put(h.source, 5070, 1, serial, { userEnteredValue: { formulaValue: '=IF(D5070="","",IF(A5070="",NOW(),A5070))' },
    effectiveFormat: { numberFormat: { type: 'DATE_TIME', pattern: 'dd/MM/yyyy H:mm' } } });
  h.put(h.target, 5070, 1, 0, { userEnteredValue: { formulaValue: '=NOW()' } }); h.edit(5070, 1);
  const cell = h.target.cells.get('5070:1')!;
  assert.deepEqual(cell.userEnteredValue, { numberValue: serial });
  assert.deepEqual(cell.effectiveFormat.numberFormat, { type: 'DATE_TIME', pattern: 'dd/MM/yyyy H:mm' });
  assert.equal('formulaValue' in cell.userEnteredValue, false);
});

test('multi-cell multi-row paste keeps numbers, currency, false, zero and literal leading equals typed', () => {
  const h = harness();
  h.put(h.source, 6, 11, 0); h.put(h.source, 6, 12, 12000, { effectiveFormat: { numberFormat: { type: 'CURRENCY', pattern: '"Rp" #,##0' } } });
  h.put(h.source, 7, 11, false); h.put(h.source, 7, 12, '=not a formula'); h.edit(6, 11, 2, 2);
  assert.deepEqual(h.value(6, 11), { numberValue: 0 }); assert.deepEqual(h.value(6, 12), { numberValue: 12000 });
  assert.deepEqual(h.value(7, 11), { boolValue: false }); assert.deepEqual(h.value(7, 12), { stringValue: '=not a formula' });
  assert.equal(h.writes.flatMap(b => b.requests).filter(r => r.updateCells).length, 1, 'one rectangular write, not per-cell');
});

test('black BOOSTER and multiline STATUS preserve contents, color, font, alignment and wrapping without inference', () => {
  const h = harness(), workers = 'DANDA 12M\nFAJAR 10M\nFURQON 29M\nYASYA 24M\nMUHIB 11M\nNUGI 10M\nRIZWAN 23M\nRUDI 10M\nSYARIF 29M\nWISNU 42M';
  h.put(h.source, 5068, 5, 'ORIGINAL ORDER'); h.put(h.source, 5068, 6, '', { effectiveFormat: {
    backgroundColor: {}, textFormat: { foregroundColor: { red: 1 }, bold: true, italic: true }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' } });
  h.put(h.source, 5068, 8, workers); h.edit(5068, 5, 1, 4);
  const format = h.target.cells.get('5068:6')!.effectiveFormat;
  assert.deepEqual(format.backgroundColorStyle.rgbColor, { red: 0, green: 0, blue: 0 }); assert.equal(format.textFormat.bold, true); assert.equal(format.textFormat.italic, true);
  assert.equal(format.horizontalAlignment, 'CENTER'); assert.equal(format.verticalAlignment, 'MIDDLE'); assert.equal(format.wrapStrategy, 'WRAP');
  assert.deepEqual(h.value(5068, 8), { stringValue: workers }); assert.deepEqual(h.value(5068, 5), { stringValue: 'ORIGINAL ORDER' });
});

test('dropdown lists and range dropdowns remain usable without copying other source tabs', () => {
  const h = harness(); h.lists.set("'PEKERJA'!A2:A100", [['DANDA'], ['FAJAR'], ['DANDA'], ['']]);
  h.put(h.source, 2, 6, 'DANDA', { dataValidation: { condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: "='PEKERJA'!A2:A100" }] }, strict: true, showCustomUi: true, inputMessage: 'Pilih karyawan' } });
  h.edit(2, 6); const validation = h.target.cells.get('2:6')!.dataValidation;
  assert.deepEqual(validation.condition, { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'DANDA' }, { userEnteredValue: 'FAJAR' }] });
  assert.equal(validation.strict, true); assert.equal(validation.showCustomUi, true); assert.equal(h.books.target.sheets.length, 1);
  const before = h.writes.length; h.edit(2, 6); assert.equal(h.writes.length, before);
  h.lists.set("'PEKERJA'!A2:A100", [['DANDA'], ['FAJAR'], ['NEW']]); h.reconcile();
  assert.equal(h.target.cells.get('2:6')!.dataValidation.condition.values.length, 3);
});

test('unchanged edits are deduplicated, but a stale signature cannot hide manual target edits', () => {
  const h = harness(); h.put(h.source, 2, 2, 'X2834'); h.edit(2, 2); const writes = h.writes.length;
  assert.equal(h.edit(2, 2).rowsUnchanged, 1); assert.equal(h.writes.length, writes); assert.ok(Object.keys(h.cache).length);
  h.put(h.target, 2, 2, 'TARGET DRIFT'); h.edit(2, 2); assert.deepEqual(h.value(2, 2), { stringValue: 'X2834' });
});

test('setup is idempotent, runs an initial mirror, installs source edit + everyMinutes(1), and leaves Payroll triggers/properties intact', () => {
  const h = harness(); h.put(h.source, 3, 2, 'X2834'); h.setup(); h.setup();
  assert.deepEqual(h.value(3, 2), { stringValue: 'X2834' }); assert.equal(h.triggers.length, 4);
  assert.equal(h.triggers.find(t => t.kind === 'edit').source, 'source'); assert.equal(h.triggers.find(t => t.kind === 'clock').minutes, 1);
  assert.equal(h.properties.CP_SYNC_SECRET, 'unrelated-kept'); assert.equal(h.properties.CP_START_ROW, '4908');
  h.api.removeEvoGamingMirrorSync(); assert.equal(h.triggers.length, 2); assert.equal(h.reconcile().skipped, 'disabled');
  assert.deepEqual(h.value(3, 2), { stringValue: 'X2834' });
});

test('reconciliation catches formula and color changes, repairs target drift, and removes target formulas even with equal results', () => {
  const h = harness(); h.put(h.source, 2, 2, 'X2834'); h.put(h.source, 2, 13, 24000, { userEnteredValue: { formulaValue: '=K2*L2' } }); h.reconcile();
  h.put(h.source, 2, 13, 36000, { userEnteredValue: { formulaValue: '=K2*L2' }, effectiveFormat: { backgroundColor: { red: 1 } } });
  h.put(h.target, 2, 2, 'X2834', { userEnteredValue: { formulaValue: '="X2834"' } }); h.reconcile();
  assert.deepEqual(h.value(2, 13), { numberValue: 36000 }); assert.equal(h.target.cells.get('2:2')!.userEnteredValue.formulaValue, undefined);
  assert.equal(h.target.cells.get('2:13')!.effectiveFormat.backgroundColorStyle.rgbColor.red, 1);
});

test('missing target sheet is created and expansion never shifts source coordinates or shrinks target', () => {
  const h = harness(); h.books.target.sheets = []; h.put(h.source, 5068, 30, 'X2832'); h.edit(5068, 30);
  const created = h.books.target.sheets[0]; assert.deepEqual(h.value(5068, 30, created), { stringValue: 'X2832' });
  h.put(h.source, 5071, 33, 'X2834'); h.edit(5071, 33);
  assert.equal(created.properties.gridProperties.rowCount, 5071); assert.equal(created.properties.gridProperties.columnCount, 33);
  assert.deepEqual(h.value(5068, 30, created), { stringValue: 'X2832' });
});

test('fallback preserves fully blank source rows and target tail; explicit clears affect only the edited range', () => {
  const h = harness(); h.put(h.source, 3, 2, 'ACTIVE'); h.put(h.target, 2, 2, 'HISTORY'); h.put(h.target, 20, 2, 'TAIL'); h.reconcile();
  assert.deepEqual(h.value(2, 2), { stringValue: 'HISTORY' }); assert.deepEqual(h.value(20, 2), { stringValue: 'TAIL' });
  h.edit(2, 2); assert.equal(h.value(2, 2), undefined); assert.deepEqual(h.value(20, 2), { stringValue: 'TAIL' });
});

test('lock collision queues an explicit blank edit and the next minute applies it, without simultaneous writes', () => {
  const h = harness(); h.put(h.target, 2, 2, 'REMOVE ONLY THIS'); h.put(h.target, 2, 3, 'KEEP'); h.lock(true);
  assert.equal(h.edit(2, 2).skipped, 'busy'); assert.equal(h.writes.length, 0); assert.equal(h.pending.length, 1);
  h.lock(false); h.reconcile(); assert.equal(h.value(2, 2), undefined); assert.deepEqual(h.value(2, 3), { stringValue: 'KEEP' }); assert.equal(h.pending.length, 0);
});

test('edit arriving during reconciliation stays queued and uses the newest source value on retry', () => {
  const h = harness(); h.put(h.source, 2, 2, 'OLD');
  h.duringWrite(() => { h.put(h.source, 2, 2, 'NEW'); assert.equal(h.edit(2, 2).skipped, 'busy'); });
  h.reconcile(); assert.equal(h.pending.length, 1); h.reconcile(); assert.deepEqual(h.value(2, 2), { stringValue: 'NEW' }); assert.equal(h.pending.length, 0);
});

test('failed writes release the lock and retain pending edits without advancing the signature', () => {
  const h = harness(); h.put(h.source, 2, 2, 'RETRY'); h.fail(true); assert.throws(() => h.edit(2, 2), /network/);
  assert.equal(h.locked, false); assert.equal(h.pending.length, 1); assert.equal(Object.keys(h.cache).length, 0);
  h.fail(false); h.reconcile(); assert.deepEqual(h.value(2, 2), { stringValue: 'RETRY' }); assert.equal(h.pending.length, 0);
});

test('5000+ rows use bounded rectangular batches; same KODE values do not append or deduplicate separate source rows', () => {
  const h = harness(); for (let row = 1; row <= 5100; row++) h.put(h.source, row, 2, row === 5100 ? 'X2832' : 'DUPLICATE');
  assert.equal(h.setup().complete, true); assert.deepEqual(h.value(5100, 2), { stringValue: 'X2832' }); assert.deepEqual(h.value(5099, 2), { stringValue: 'DUPLICATE' });
  assert.ok(h.writes.length < 30, `batch writes: ${h.writes.length}`);
  assert.ok(h.digests < 30, `native hash calls must be batched: ${h.digests}`);
  const before = h.writes.length; h.reconcile(); assert.equal(h.writes.length, before);
});

test('HTTP quota failures keep edits queued without exposing response bodies or tokens', () => {
  const h = harness(); h.put(h.source, 2, 2, 'RETRY'); h.httpError(429);
  assert.throws(() => h.edit(2, 2), error => {
    assert.match(String(error), /HTTP 429/); assert.doesNotMatch(String(error), /private response|test-oauth-token/); return true;
  });
  assert.equal(h.locked, false); assert.equal(h.pending.length, 1); assert.equal(h.writes.length, 0);
  h.httpError(0); h.reconcile(); assert.deepEqual(h.value(2, 2), { stringValue: 'RETRY' }); assert.equal(h.pending.length, 0);
});

test('dropdown-rich rows use bounded reads and writes and remain unchanged on the next sweep', () => {
  const h = harness();
  const rule = { condition: { type: 'ONE_OF_LIST', values: Array.from({ length: 80 }, (_, i) => ({ userEnteredValue: `WORKER-${i}` })) }, showCustomUi: true };
  for (let row = 1; row <= 320; row++) {
    for (let column = 1; column <= 19; column++) h.put(h.source, row, column, column === 2 ? `X${row}` : 'WORKER-1', column % 3 === 0 ? { dataValidation: rule } : {});
  }
  assert.equal(h.setup().complete, true);
  assert.deepEqual(h.value(320, 2), { stringValue: 'X320' });
  assert.deepEqual(h.target.cells.get('320:18')!.dataValidation.condition, rule.condition);
  for (const read of h.reads.filter(r => r.ranges)) {
    const bounds = /!A(\d+):S(\d+)$/.exec(read.ranges[0])!;
    assert.ok((Number(bounds[2]) - Number(bounds[1]) + 1) * 19 <= 2000, 'bound the rich cell response');
  }
  assert.ok(h.writes.every(body => Buffer.byteLength(JSON.stringify(body)) < 1600000), 'bound serialized write payloads');
  const before = h.writes.length; h.reconcile(); assert.equal(h.writes.length, before);
});

test('time-budget cursor resumes the remaining rows on the next minute', () => {
  const h = harness(); h.api.EVO_GAMING_MIRROR.chunkCells = 100; h.properties.EGM_CONFIG = JSON.stringify(h.api.EVO_GAMING_MIRROR);
  for (let row = 1; row <= 160; row++) h.put(h.source, row, 2, `ROW-${row}`);
  h.delay(16000); assert.equal(h.reconcile().complete, false); assert.notEqual(h.properties.EGM_CURSOR, '0:1');
  h.delay(0); assert.equal(h.reconcile().complete, true); assert.deepEqual(h.value(160, 2), { stringValue: 'ROW-160' });
});

test('large queued paste advances its own cursor so repeated time budgets cannot starve later rows', () => {
  const h = harness(); h.api.EVO_GAMING_MIRROR.chunkCells = 100; h.properties.EGM_CONFIG = JSON.stringify(h.api.EVO_GAMING_MIRROR);
  for (let row = 1; row <= 160; row++) h.put(h.source, row, 2, `PASTE-${row}`);
  h.delay(16000); assert.equal(h.edit(1, 1, 160, 2).complete, false);
  assert.ok(JSON.parse(h.properties[h.pending[0]]).row > 1);
  h.reconcile(); assert.deepEqual(h.value(160, 2), { stringValue: 'PASTE-160' }); assert.equal(h.pending.length, 0);
});

test('only explicitly enabled source sheets are mirrored; target edits cannot sync backward', () => {
  const h = harness(); assert.equal(h.edit(2, 2, 1, 1, 'MUTASI BANDAR').skipped, 'other_sheet');
  assert.equal(h.edit(2, 2, 1, 1, 'MUTASI FH', 'target').skipped, 'other_sheet'); assert.equal(h.pending.length, 0); assert.equal(h.writes.length, 0);
  h.api.EVO_GAMING_MIRROR.targetId = 'source'; assert.throws(() => h.setup(), /berbeda/); assert.equal(h.locked, false);
});

test('source merged headers are retained and stale target conditional rules cannot override black BOOSTER', () => {
  const h = harness(); h.put(h.source, 1, 1, 'HEADER'); h.put(h.source, 2, 6, 'WORKER', { effectiveFormat: { backgroundColor: {} } });
  h.source.merges = [{ sheetId: 1, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 }];
  h.target.conditionalFormats = [{ ranges: [], booleanRule: {} }]; h.reconcile();
  assert.equal(h.target.conditionalFormats.length, 0); assert.equal(h.target.merges.length, 1); assert.equal(h.target.merges[0].sheetId, 2);
  assert.deepEqual(h.target.cells.get('2:6')!.effectiveFormat.backgroundColorStyle.rgbColor, { red: 0, green: 0, blue: 0 });
});
