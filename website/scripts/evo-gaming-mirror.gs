/**
 * EVO GAMING -> OTOMATIS EVO GAMING (one way, values + effective formatting).
 * Enable Services > Google Sheets API (v4), then run setupEvoGamingMirrorSync().
 * Separate from ComePlayers Payroll: never calls its endpoint or removes its triggers.
 */
var EVO_GAMING_MIRROR = {
  sourceId: '1i8agw507TPoVd66TcMooDhOTzZvoUcFuqrlBmH6Lrdo',
  targetId: '1dcw71cfqrJnLUOd27bcDlP5EhFqer1xL6OnWuojbRMQ',
  sheets: ['MUTASI FH'], // Add more sheet names only when explicitly desired.
  chunkCells: 2000,
  runBudgetMs: 45000,
  setupBudgetMs: 240000
};
var EGM_PREFIX = 'EGM_';
var EGM_HANDLERS = ['syncEvoGamingEditedRange', 'reconcileEvoGamingMirror'];
var EGM_FORMAT_FIELDS = 'numberFormat,backgroundColor,backgroundColorStyle,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy';
var EGM_WRITE_FIELDS = 'userEnteredValue,userEnteredFormat.numberFormat,userEnteredFormat.backgroundColorStyle,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy,dataValidation';

function setupEvoGamingMirrorSync() {
  return egmWithLock_(function () {
    egmValidateConfig_(EVO_GAMING_MIRROR);
    egmRequireService_();
    // Verify both destinations before changing triggers/configuration.
    var source = egmMetadata_(EVO_GAMING_MIRROR.sourceId);
    egmMetadata_(EVO_GAMING_MIRROR.targetId);
    EVO_GAMING_MIRROR.sheets.forEach(function (name) {
      if (!egmSheet_(source, name)) throw new Error('Sheet sumber tidak ditemukan: ' + name);
    });
    var props = PropertiesService.getScriptProperties();
    props.setProperties({ EGM_CONFIG: JSON.stringify(EVO_GAMING_MIRROR), EGM_ENABLED: 'true', EGM_CURSOR: '0:1' }, false);
    egmRemoveTriggers_();
    ScriptApp.newTrigger('syncEvoGamingEditedRange').forSpreadsheet(EVO_GAMING_MIRROR.sourceId).onEdit().create();
    ScriptApp.newTrigger('reconcileEvoGamingMirror').timeBased().everyMinutes(1).create();
    return egmReconcile_(EVO_GAMING_MIRROR, EVO_GAMING_MIRROR.setupBudgetMs);
  });
}

function reinstallEvoGamingMirrorSync() { return setupEvoGamingMirrorSync(); }

function removeEvoGamingMirrorSync() {
  return egmWithLock_(function () {
    PropertiesService.getScriptProperties().setProperty('EGM_ENABLED', 'false');
    egmRemoveTriggers_();
    return { ok: true, enabled: false };
  });
}

function egmRemoveTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (EGM_HANDLERS.indexOf(trigger.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(trigger);
  });
}

function syncEvoGamingMirrorNow() {
  return egmWithLock_(function () {
    var config = egmConfig_();
    PropertiesService.getScriptProperties().setProperty('EGM_CURSOR', '0:1');
    return egmReconcile_(config, config.setupBudgetMs);
  });
}

function reconcileEvoGamingMirror() {
  return egmWithLock_(function () {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('EGM_ENABLED') !== 'true') return { ok: true, skipped: 'disabled' };
    // Payroll reads the original source directly. Bound background mirror scans
    // so their HTTP requests cannot exhaust the shared Google account quota.
    var nextScan = Number(props.getProperty('EGM_NEXT_RECONCILE_AT') || 0);
    if (nextScan > Date.now()) return { ok: true, skipped: 'reconcile_cooldown', queued: true };
    props.setProperty('EGM_NEXT_RECONCILE_AT', String(Date.now() + 15 * 60 * 1000));
    var config = egmConfig_();
    return egmReconcile_(config, config.runBudgetMs);
  });
}

// Installable only. Read the latest cells, never e.value (absent for paste/clear).
function syncEvoGamingEditedRange(e) {
  if (!e || !e.source || !e.range) return { ok: true, skipped: 'no_edit_event' };
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('EGM_ENABLED') !== 'true') return { ok: true, skipped: 'disabled' };
  var config = egmConfig_();
  var sheet = e.range.getSheet();
  if (e.source.getId() !== config.sourceId || config.sheets.indexOf(sheet.getName()) < 0) return { ok: true, skipped: 'other_sheet' };
  // Unique keys avoid lost updates while another invocation holds the lock.
  // Only coordinates are retained, including explicit clears; never cell contents.
  var key = EGM_PREFIX + 'PENDING_' + Utilities.getUuid();
  props.setProperty(key, JSON.stringify({ sourceId: config.sourceId, targetId: config.targetId, name: sheet.getName(), sheetId: sheet.getSheetId(),
    row: e.range.getRow(), column: e.range.getColumn(), rows: e.range.getNumRows(), columns: e.range.getNumColumns() }));
  return egmWithLock_(function () {
    if (props.getProperty('EGM_ENABLED') !== 'true') return { ok: true, skipped: 'disabled' };
    var context = egmContext_(config);
    var result = egmSummary_('edit');
    egmDrainEdits_(context, Date.now() + config.runBudgetMs, result);
    return egmFinish_(result);
  });
}

function egmWithLock_(work) {
  var props = PropertiesService.getScriptProperties();
  var retryAfter = Number(props.getProperty('EGM_URLFETCH_RETRY_AFTER') || 0);
  if (retryAfter > Date.now()) return { ok: false, skipped: 'google_urlfetch_quota', queued: true, retryAt: new Date(retryAfter).toISOString() };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { ok: true, skipped: 'busy', queued: true };
  try {
    var result = work();
    props.deleteProperty('EGM_URLFETCH_RETRY_AFTER');
    return result;
  } catch (error) {
    if (!/Service invoked too many times for one day:\s*urlfetch/i.test(String(error))) throw error;
    var pending = { ok: false, skipped: 'google_urlfetch_quota', queued: true,
      retryAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
    props.setProperty('EGM_URLFETCH_RETRY_AFTER', String(Date.now() + 15 * 60 * 1000));
    // Keep the cursor, pending edits and last successful result intact.
    console.log(JSON.stringify(pending)); return pending;
  } finally { lock.releaseLock(); }
}

function egmValidateConfig_(config) {
  if (!config.sourceId || !config.targetId || config.sourceId === config.targetId) throw new Error('Sumber dan target harus berbeda.');
  if (!Array.isArray(config.sheets) || !config.sheets.length || config.sheets.some(function (name) { return typeof name !== 'string' || !name.trim(); })) throw new Error('Daftar sheet tidak valid.');
  if (!(config.chunkCells >= 100 && config.chunkCells <= 10000) || !(config.runBudgetMs > 0 && config.runBudgetMs <= 240000) || !(config.setupBudgetMs > 0 && config.setupBudgetMs <= 240000)) throw new Error('Batas batch/waktu tidak valid.');
}

function egmConfig_() {
  var raw = PropertiesService.getScriptProperties().getProperty('EGM_CONFIG');
  if (!raw) throw new Error('Jalankan setupEvoGamingMirrorSync terlebih dahulu.');
  var config = JSON.parse(raw); egmValidateConfig_(config); egmRequireService_(); return config;
}

function egmRequireService_() {
  if (typeof Sheets === 'undefined') throw new Error('Aktifkan Services > Google Sheets API v4 di Apps Script.');
}

function egmMetadata_(id) {
  return egmApi_(id, '', { fields: 'properties(defaultFormat,spreadsheetTheme),sheets(properties,merges,conditionalFormats)' });
}

// Parse HTTP JSON directly. Large Advanced Service cell objects otherwise spend
// substantial time/memory crossing the service bridge even within a small range.
// The token is used only for Google's fixed API host, never persisted or logged.
function egmApi_(id, suffix, query, body) {
  var parameters = ['prettyPrint=false'];
  Object.keys(query || {}).forEach(function (key) {
    var values = Array.isArray(query[key]) ? query[key] : [query[key]];
    values.forEach(function (value) { parameters.push(encodeURIComponent(key) + '=' + encodeURIComponent(value)); });
  });
  var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(id) + suffix + (parameters.length ? '?' + parameters.join('&') : '');
  var options = { method: body ? 'post' : 'get', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true, followRedirects: false };
  if (body) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
  var response = UrlFetchApp.fetch(url, options), status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('Google Sheets API HTTP ' + status + '; batch akan dicoba ulang dari cursor/antrean.');
  return JSON.parse(response.getContentText());
}

function egmSheet_(metadata, name) {
  return (metadata.sheets || []).filter(function (sheet) { return sheet.properties.title === name; })[0];
}

function egmContext_(config) {
  return { config: config, source: egmMetadata_(config.sourceId), target: egmMetadata_(config.targetId),
    sourceBook: SpreadsheetApp.openById(config.sourceId), validationLists: {}, prepared: {} };
}

function egmSummary_(mode) {
  return { ok: true, mode: mode, rangesUpdated: 0, cellsUpdated: 0, rowsUnchanged: 0, blankRowsPreserved: 0, complete: true };
}

function egmFinish_(result) {
  PropertiesService.getScriptProperties().setProperty('EGM_LAST_RESULT', JSON.stringify({ at: new Date().toISOString(), result: result }));
  console.log(JSON.stringify(result)); return result;
}

function egmReconcile_(config, budget) {
  var deadline = Date.now() + budget;
  var context = egmContext_(config), props = PropertiesService.getScriptProperties();
  var result = egmSummary_('reconcile');
  egmDrainEdits_(context, deadline, result);
  var cursor = (props.getProperty('EGM_CURSOR') || '0:1').split(':').map(Number);
  var index = Number.isInteger(cursor[0]) && cursor[0] >= 0 && cursor[0] < config.sheets.length ? cursor[0] : 0;
  var firstRow = Number.isInteger(cursor[1]) && cursor[1] > 0 ? cursor[1] : 1;
  for (; index < config.sheets.length; index++, firstRow = 1) {
    var name = config.sheets[index], source = context.sourceBook.getSheetByName(name);
    if (!source) throw new Error('Sheet sumber tidak ditemukan: ' + name);
    var rows = source.getLastRow(), columns = source.getLastColumn();
    if (!rows || !columns) continue; // Never clear historical target data on an empty source.
    egmPrepareTarget_(context, name, rows, columns, true);
    var batchRows = Math.max(1, Math.floor(config.chunkCells / columns));
    for (var row = firstRow; row <= rows; row += batchRows) {
      if (Date.now() >= deadline) {
        props.setProperty('EGM_CURSOR', index + ':' + row); result.complete = false; return egmFinish_(result);
      }
      egmSyncRange_(context, { name: name, row: row, column: 1, rows: Math.min(batchRows, rows - row + 1), columns: columns }, false, result);
      // Advance only after every batch write succeeds. A failed batch is retried.
      props.setProperty('EGM_CURSOR', index + ':' + (row + batchRows));
    }
  }
  props.setProperty('EGM_CURSOR', '0:1');
  return egmFinish_(result);
}

function egmDrainEdits_(context, deadline, result) {
  var props = PropertiesService.getScriptProperties(), pending = props.getProperties();
  Object.keys(pending).filter(function (key) { return key.indexOf('EGM_PENDING_') === 0; }).sort().some(function (key) {
    if (Date.now() >= deadline) { result.complete = false; return true; }
    var range = JSON.parse(pending[key]);
    var source = egmSheet_(context.source, range.name);
    if (range.sourceId !== context.config.sourceId || range.targetId !== context.config.targetId || context.config.sheets.indexOf(range.name) < 0 || !source || source.properties.sheetId !== range.sheetId) {
      props.deleteProperty(key); return false;
    }
    // A later structural deletion can invalidate an old event's coordinates.
    range.rows = Math.min(range.rows, source.properties.gridProperties.rowCount - range.row + 1);
    range.columns = Math.min(range.columns, source.properties.gridProperties.columnCount - range.column + 1);
    if (range.rows > 0 && range.columns > 0) {
      egmPrepareTarget_(context, range.name, range.row + range.rows - 1, range.column + range.columns - 1, false);
      var batchRows = Math.max(1, Math.floor(context.config.chunkCells / range.columns));
      while (range.rows > 0) {
        if (Date.now() >= deadline) { result.complete = false; return true; }
        var count = Math.min(batchRows, range.rows);
        egmSyncRange_(context, { name: range.name, row: range.row, column: range.column,
          rows: count, columns: range.columns }, true, result);
        range.row += count; range.rows -= count;
        if (range.rows) props.setProperty(key, JSON.stringify(range));
      }
    }
    props.deleteProperty(key); return false;
  });
}

// All writes are guarded here: no call can write the source workbook.
function egmWrite_(context, requests) {
  if (!requests.length) return;
  if (context.config.targetId === context.config.sourceId) throw new Error('Dilarang menulis ke sumber.');
  return egmApi_(context.config.targetId, ':batchUpdate', {}, { requests: requests });
}

function egmPrepareTarget_(context, name, rows, columns, layout) {
  var target = egmSheet_(context.target, name), requests = [];
  if (!target) {
    var created = egmWrite_(context, [{ addSheet: { properties: { title: name,
      gridProperties: { rowCount: Math.max(rows, 100), columnCount: Math.max(columns, 26) } } } }]);
    target = { properties: created.replies[0].addSheet.properties, merges: [], conditionalFormats: [] };
    context.target.sheets = context.target.sheets || []; context.target.sheets.push(target);
  }
  var grid = target.properties.gridProperties;
  if (rows > grid.rowCount || columns > grid.columnCount) {
    grid.rowCount = Math.max(rows, grid.rowCount); grid.columnCount = Math.max(columns, grid.columnCount);
    requests.push({ updateSheetProperties: { properties: { sheetId: target.properties.sheetId,
      gridProperties: { rowCount: grid.rowCount, columnCount: grid.columnCount } }, fields: 'gridProperties.rowCount,gridProperties.columnCount' } });
  }
  if (layout && !context.prepared[name]) {
    // Effective SOURCE colors are copied as static RGB; stale target rules must not override them.
    for (var i = (target.conditionalFormats || []).length - 1; i >= 0; i--) requests.push({ deleteConditionalFormatRule: { sheetId: target.properties.sheetId, index: i } });
    target.conditionalFormats = [];
    var desired = (egmSheet_(context.source, name).merges || []).filter(function (m) { return m.endRowIndex <= rows && m.endColumnIndex <= columns; });
    var present = target.merges || [];
    present.forEach(function (m) {
      if (m.endRowIndex <= rows && m.endColumnIndex <= columns && !desired.some(function (d) { return egmSameMerge_(m, d); })) requests.push({ unmergeCells: { range: m } });
    });
    desired.forEach(function (m) {
      if (!present.some(function (p) { return egmSameMerge_(m, p); })) {
        var copy = Object.assign({}, m, { sheetId: target.properties.sheetId });
        requests.push({ mergeCells: { range: copy, mergeType: 'MERGE_ALL' } });
      }
    });
    context.prepared[name] = true;
  }
  egmWrite_(context, requests); return target;
}

function egmSameMerge_(a, b) {
  return ['startRowIndex', 'endRowIndex', 'startColumnIndex', 'endColumnIndex'].every(function (key) { return (a[key] || 0) === (b[key] || 0); });
}

function egmColumn_(number) {
  var letters = ''; while (number > 0) { number--; letters = String.fromCharCode(65 + number % 26) + letters; number = Math.floor(number / 26); } return letters;
}

function egmA1_(range) {
  return "'" + range.name.replace(/'/g, "''") + "'!" + egmColumn_(range.column) + range.row + ':' + egmColumn_(range.column + range.columns - 1) + (range.row + range.rows - 1);
}

function egmRead_(id, range) {
  var response = egmApi_(id, '', { ranges: [egmA1_(range)], fields:
    'sheets(data(startRow,startColumn,rowData(values(effectiveValue,userEnteredValue,formattedValue,effectiveFormat(' + EGM_FORMAT_FIELDS + '),dataValidation))))' });
  var data = ((response.sheets || [])[0] || {}).data || [];
  var grid = data[0] || {}, values = grid.rowData || [];
  return Array.from({ length: range.rows }, function (_, r) {
    var row = values[r + range.row - 1 - (grid.startRow || 0)] || {};
    return Array.from({ length: range.columns }, function (_, c) { return (row.values || [])[c + range.column - 1 - (grid.startColumn || 0)] || {}; });
  });
}

function egmCanonical_(value) {
  if (Array.isArray(value)) return '[' + value.map(egmCanonical_).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(function (key) { return value[key] !== undefined; }).map(function (key) { return JSON.stringify(key) + ':' + egmCanonical_(value[key]); }).join(',') + '}';
  return JSON.stringify(value);
}

function egmHash_(value) {
  return egmHashText_(egmCanonical_(value));
}

function egmHashText_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

function egmUtf8Bytes_(text) {
  var bytes = 0;
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    if (code < 128) bytes++;
    else if (code < 2048) bytes += 2;
    else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

function egmColor_(color, style, metadata, fallback) {
  var rgb = color || (style && style.rgbColor);
  if (!rgb && style && style.themeColor) {
    var pairs = ((metadata.properties || {}).spreadsheetTheme || {}).themeColors || [];
    var match = pairs.filter(function (pair) { return pair.colorType === style.themeColor; })[0];
    rgb = match && match.color && match.color.rgbColor;
  }
  rgb = rgb || fallback;
  return { red: rgb.red || 0, green: rgb.green || 0, blue: rgb.blue || 0 };
}

function egmFormat_(cell, metadata) {
  var defaults = (metadata.properties || {}).defaultFormat || {};
  var format = Object.assign({}, defaults, cell.effectiveFormat || {});
  var text = Object.assign({}, defaults.textFormat || {}, format.textFormat || {});
  var result = { backgroundColorStyle: { rgbColor: egmColor_(format.backgroundColor, format.backgroundColorStyle, metadata, { red: 1, green: 1, blue: 1 }) },
    textFormat: { foregroundColorStyle: { rgbColor: egmColor_(text.foregroundColor, text.foregroundColorStyle, metadata, {}) },
      fontFamily: text.fontFamily || 'Arial', fontSize: text.fontSize || 10, bold: !!text.bold, italic: !!text.italic, strikethrough: !!text.strikethrough, underline: !!text.underline },
    horizontalAlignment: format.horizontalAlignment || ((cell.effectiveValue || {}).numberValue !== undefined ? 'RIGHT' : (cell.effectiveValue || {}).boolValue !== undefined ? 'CENTER' : 'LEFT'),
    verticalAlignment: format.verticalAlignment || 'BOTTOM', wrapStrategy: format.wrapStrategy || 'OVERFLOW_CELL' };
  if (format.numberFormat) result.numberFormat = format.numberFormat;
  return result;
}

function egmValidation_(rule, context, source) {
  if (!rule) return undefined;
  var copy = JSON.parse(JSON.stringify(rule));
  if (source && copy.condition && copy.condition.type === 'ONE_OF_RANGE') {
    var reference = copy.condition.values[0].userEnteredValue.replace(/^=/, '');
    if (!context.validationLists[reference]) {
      var data = egmApi_(context.config.sourceId, '/values/' + encodeURIComponent(reference), { valueRenderOption: 'FORMATTED_VALUE' });
      var options = [];
      (data.values || []).forEach(function (row) { row.forEach(function (value) { var text = String(value); if (text !== '' && options.indexOf(text) < 0) options.push(text); }); });
      if (options.length > 500) throw new Error('Dropdown sumber memiliki lebih dari 500 opsi; gunakan daftar yang lebih kecil.');
      context.validationLists[reference] = options;
    }
    var options = context.validationLists[reference];
    // Empty source list cannot become a valid ONE_OF_LIST; remove only that validation.
    if (!options.length) return undefined;
    copy.condition = { type: 'ONE_OF_LIST', values: options.map(function (value) { return { userEnteredValue: value }; }) };
  }
  // Omitted false flags and explicit false represent the same rule.
  copy.strict = !!copy.strict; copy.showCustomUi = !!copy.showCustomUi;
  return copy;
}

function egmCell_(cell, context, source) {
  var value = cell.effectiveValue || {};
  var result = { userEnteredFormat: egmFormat_(cell, source ? context.source : context.target) };
  // Serial dates are copied verbatim with the source number format. No locale parsing,
  // JS timezone conversion, formulaValue, or target NOW()/circular formula execution.
  if (value.numberValue !== undefined) result.userEnteredValue = { numberValue: value.numberValue };
  else if (value.boolValue !== undefined) result.userEnteredValue = { boolValue: value.boolValue };
  else if (value.stringValue !== undefined && value.stringValue !== '') result.userEnteredValue = { stringValue: value.stringValue };
  else if (value.errorValue) result.userEnteredValue = { stringValue: cell.formattedValue || ('#' + value.errorValue.type + '!') };
  var validation = egmValidation_(cell.dataValidation, context, source);
  if (validation) result.dataValidation = validation;
  if (!source && cell.userEnteredValue && cell.userEnteredValue.formulaValue) result.hasFormula = true;
  return result;
}

function egmSyncRange_(context, range, explicitEdit, result) {
  var source = egmRead_(context.config.sourceId, range), target = egmRead_(context.config.targetId, range);
  var targetSheet = egmSheet_(context.target, range.name), requests = [], bytes = 0;
  var cache = CacheService.getScriptCache(), key = 'EGM_HASH_' + egmHash_([context.config.sourceId, context.config.targetId, range]);
  var rowSignatures = [];
  function flush() { egmWrite_(context, requests); requests = []; bytes = 0; }
  for (var r = 0; r < range.rows; r++) {
    // Normalize one row at a time. Dropdown-rich sheets otherwise retain four
    // full cell matrices plus their canonical JSON strings and exhaust Apps Script memory.
    var prepared = source[r].map(function (cell) { return egmCell_(cell, context, true); });
    var current = target[r].map(function (cell) { return egmCell_(cell, context, false); });
    source[r] = null; target[r] = null;
    var canonical = egmCanonical_(prepared);
    // One native digest per bounded batch, not thousands of service calls per sweep.
    rowSignatures.push(canonical);
    // Compare target too: cached signatures must never hide manual target drift.
    if (canonical === egmCanonical_(current)) { result.rowsUnchanged++; continue; }
    if (!explicitEdit && !prepared.some(function (cell) { return cell.userEnteredValue !== undefined; })) { result.blankRowsPreserved++; continue; }
    var rowData = { values: prepared }, rowSize = egmUtf8Bytes_(JSON.stringify(rowData));
    if (bytes + rowSize > 1500000 && requests.length) flush();
    var last = requests[requests.length - 1];
    if (last && last.updateCells.start.rowIndex + last.updateCells.rows.length === range.row + r - 1) last.updateCells.rows.push(rowData);
    else requests.push({ updateCells: { start: { sheetId: targetSheet.properties.sheetId, rowIndex: range.row + r - 1, columnIndex: range.column - 1 }, rows: [rowData], fields: EGM_WRITE_FIELDS } });
    bytes += rowSize; result.rangesUpdated++; result.cellsUpdated += range.columns;
  }
  flush();
  // Store only successful non-sensitive signatures. A timeout/failure leaves edits queued.
  cache.put(key, egmHashText_(rowSignatures.join('\n')), 21600);
}
