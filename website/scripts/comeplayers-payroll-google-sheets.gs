/**
 * ComePlayers Payroll — installable edit + one-minute reconciliation sync
 *
 * Paste this file into Extensions > Apps Script for the EVO GAMING 2026 workbook.
 * Open the MUTASI FH sheet first, then run setupComePlayersPayrollSync() once.
 *
 * Secrets are stored in Apps Script Properties, never in spreadsheet cells.
 */
var COMEPLAYERS_PAYROLL_SYNC_URL = "https://www.comeplayers.com/api/integrations/payroll-sheet";
var COMEPLAYERS_PAYROLL_SYNC_HANDLER = "syncComePlayersPayroll";
var COMEPLAYERS_PAYROLL_EDIT_HANDLER = "onComePlayersPayrollEdit";
var COMEPLAYERS_PAYROLL_CHANGE_HANDLER = "onComePlayersPayrollChange";
var COMEPLAYERS_PAYROLL_BATCH_SIZE = 100;

function normalizeComePlayersHeader_(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function findComePlayersHeader_(headers, names, fallback) {
  var wanted = {};
  names.forEach(function (name) { wanted[normalizeComePlayersHeader_(name)] = true; });
  for (var i = 0; i < headers.length; i++) {
    if (wanted[normalizeComePlayersHeader_(headers[i])]) return i;
  }
  return fallback;
}

function isComePlayersBlack_(background) {
  var color = String(background || "").toLowerCase();
  if (color === "#000000" || color === "#000") return true;
  var match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return false;
  var hex = match[1];
  var r = parseInt(hex.slice(0, 2), 16);
  var g = parseInt(hex.slice(2, 4), 16);
  var b = parseInt(hex.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 45;
}

function comePlayersJsonValue_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return value.toISOString();
  }
  if (typeof value === "number" && !isFinite(value)) return null;
  return value;
}

function setupComePlayersPayrollSync() {
  var ui = SpreadsheetApp.getUi();
  var secretPrompt = ui.prompt(
    "ComePlayers Payroll Sync",
    "Masukkan PAYROLL_SHEETS_SYNC_SECRET yang sama dengan Environment Variable di Vercel. Secret tidak akan ditulis ke sel spreadsheet.",
    ui.ButtonSet.OK_CANCEL
  );
  if (secretPrompt.getSelectedButton() !== ui.Button.OK) return;
  var secret = secretPrompt.getResponseText().trim();
  if (secret.length < 24) throw new Error("Sync secret minimal 24 karakter.");

  var currentEmail = Session.getActiveUser().getEmail() || "";
  var emailPrompt = ui.prompt(
    "Admin ComePlayers",
    "Masukkan email akun ADMIN ComePlayers untuk audit sinkronisasi." + (currentEmail ? "\nEmail Google saat ini: " + currentEmail : ""),
    ui.ButtonSet.OK_CANCEL
  );
  if (emailPrompt.getSelectedButton() !== ui.Button.OK) return;
  var actorEmail = emailPrompt.getResponseText().trim() || currentEmail;
  if (!actorEmail) throw new Error("Email admin ComePlayers wajib diisi.");

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("MUTASI FH");
  if (!sheet) throw new Error("Sheet MUTASI FH tidak ditemukan.");
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    CP_SYNC_URL: COMEPLAYERS_PAYROLL_SYNC_URL,
    CP_SYNC_SECRET: secret,
    CP_ACTOR_EMAIL: actorEmail,
    CP_SPREADSHEET_ID: spreadsheet.getId(),
    CP_SHEET_NAME: sheet.getName(),
    CP_HEADER_ROW: "2",
    CP_SYNC_DELETIONS: "true"
  }, false);

  reinstallComePlayersPayrollRealtimeSync();
  var result = syncComePlayersPayroll();
  ui.alert(
    "Sinkronisasi aktif",
    "Sheet: " + sheet.getName() + "\nJadwal: saat edit + rekonsiliasi setiap 1 menit\nHasil pertama: " + JSON.stringify(result),
    ui.ButtonSet.OK
  );
}

function removeComePlayersPayrollSyncTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var handler = trigger.getHandlerFunction();
    if ([COMEPLAYERS_PAYROLL_SYNC_HANDLER, COMEPLAYERS_PAYROLL_EDIT_HANDLER, COMEPLAYERS_PAYROLL_CHANGE_HANDLER].indexOf(handler) >= 0) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function reinstallComePlayersPayrollRealtimeSync() {
  var lock = LockService.getUserLock();
  lock.waitLock(30000);
  try {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty("CP_SPREADSHEET_ID");
    var spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet || !spreadsheet.getSheetByName("MUTASI FH")) throw new Error("Sheet MUTASI FH tidak ditemukan.");
    props.setProperties({ CP_SPREADSHEET_ID: spreadsheet.getId(), CP_SHEET_NAME: "MUTASI FH" }, false);
    removeComePlayersPayrollSyncTriggers();
    ScriptApp.newTrigger(COMEPLAYERS_PAYROLL_EDIT_HANDLER).forSpreadsheet(spreadsheet).onEdit().create();
    ScriptApp.newTrigger(COMEPLAYERS_PAYROLL_CHANGE_HANDLER).forSpreadsheet(spreadsheet).onChange().create();
    ScriptApp.newTrigger(COMEPLAYERS_PAYROLL_SYNC_HANDLER)
      .timeBased()
      .everyMinutes(1)
      .create();
    // Reinstall also requests a fresh reconciliation without removing any orders.
    Object.keys(props.getProperties()).forEach(function (key) {
      if (key.indexOf("CP_ROW_HASH_") === 0) props.deleteProperty(key);
    });
  } finally { lock.releaseLock(); }
}

// Compatibility for operators upgrading from the old hourly script.
function installComePlayersPayrollHourlyTrigger() { reinstallComePlayersPayrollRealtimeSync(); }
function removeComePlayersPayrollHourlyTrigger() { removeComePlayersPayrollSyncTriggers(); }

function syncComePlayersPayroll() { return runComePlayersPayrollSync_("reconcile", null); }

// Installable trigger only: a simple onEdit cannot authorize UrlFetchApp.
function onComePlayersPayrollEdit(event) {
  if (!event || !event.range || !event.source) return { ok: true, skipped: "no_edit_event" };
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('CP_SYNC_ROSTER') === 'true'
    && /^PAYROLL-[123]$/.test(event.range.getSheet().getName())) {
    if (event.source.getId() !== props.getProperty('CP_SPREADSHEET_ID')) return { ok: true, skipped: 'other_sheet' };
    return runComePlayersPayrollSync_('reconcile', null);
  }
  return runComePlayersPayrollSync_("incremental", event);
}

// Deleting/inserting physical rows does not reliably emit onEdit.
function onComePlayersPayrollChange(event) {
  if (!event || !event.source || event.changeType === 'EDIT') return { ok: true, skipped: 'no_structural_change' };
  if (event.source.getId() !== PropertiesService.getScriptProperties().getProperty('CP_SPREADSHEET_ID')) return { ok: true, skipped: 'other_sheet' };
  return syncComePlayersPayroll();
}

/** Upgrade the existing mirror installation without changing identities or secrets. */
function activateComePlayersSourceSync() {
  var props = PropertiesService.getScriptProperties();
  var mirror = JSON.parse(props.getProperty('EGM_CONFIG') || '{}');
  if (!mirror.sourceId || !mirror.targetId) throw new Error('Konfigurasi mirror sumber belum tersedia.');
  var current = props.getProperty('CP_SPREADSHEET_ID');
  if (current !== mirror.targetId && current !== mirror.sourceId) throw new Error('Sumber payroll berbeda dari konfigurasi mirror.');
  var source = SpreadsheetApp.openById(mirror.sourceId).getSheetByName('MUTASI FH');
  if (!source) throw new Error('MUTASI FH sumber tidak ditemukan.');
  comePlayersClosingStart_(source); // Verify the boundary before enabling deletions.
  props.setProperties({ CP_SYNC_NAMESPACE_ID: props.getProperty('CP_SYNC_NAMESPACE_ID') || mirror.targetId,
    CP_SPREADSHEET_ID: mirror.sourceId, CP_SYNC_DELETIONS: 'true', CP_START_AFTER_CLOSING: 'true' }, false);
  reinstallComePlayersPayrollRealtimeSync();
  return syncComePlayersPayroll();
}

/** Refresh existing unlocked orders across every period without importing old history. */
function activateComePlayersAllUnlockedSync() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CP_SPREADSHEET_ID');
  if (!id) throw new Error('Sumber payroll belum dikonfigurasi.');
  var spreadsheet = SpreadsheetApp.openById(id);
  var sheet = spreadsheet.getSheetByName(props.getProperty('CP_SHEET_NAME') || 'MUTASI FH');
  if (!sheet) throw new Error('Sheet MUTASI FH sumber tidak ditemukan.');
  comePlayersClosingStart_(sheet);
  comePlayersRoster_(spreadsheet); // Validate every payroll tab before enabling its snapshot.
  props.setProperties({ CP_SYNC_ALL_EXISTING: 'true', CP_SYNC_ROSTER: 'true', CP_SYNC_DELETIONS: 'true' }, false);
  reinstallComePlayersPayrollRealtimeSync();
  return syncComePlayersPayroll();
}

function comePlayersRoster_(spreadsheet) {
  var sheets = ['PAYROLL-1', 'PAYROLL-2', 'PAYROLL-3'].map(function (sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) throw new Error('Sheet ' + sheetName + ' tidak ditemukan; daftar karyawan tidak dikirim.');
    if (String(sheet.getRange(2, 2).getDisplayValues()[0][0] || '').trim().toUpperCase() !== 'NAMA') {
      throw new Error('Header NAMA pada ' + sheetName + ' tidak valid.');
    }
    var lastRow = sheet.getLastRow();
    if (lastRow > 5000) throw new Error('Daftar karyawan ' + sheetName + ' terlalu besar.');
    var values = lastRow > 2 ? sheet.getRange(3, 2, lastRow - 2, 4).getDisplayValues() : [];
    var rows = [];
    values.forEach(function (cells, index) {
      var name = String(cells[0] || '').trim().replace(/\s+/g, ' ');
      if (!name || /^(?:NAMA|TOTAL(?:\s.*)?|GOLD ALL GAME|GOLD PAYROLL|SELISIH|FH[123])$/i.test(name)) return;
      var row = { rowNumber: index + 3, name: name };
      var type = String(cells[3] || '').trim();
      if (type) row.type = type;
      rows.push(row);
    });
    return { sheetName: sheetName, rows: rows };
  });
  return { complete: true, sheets: sheets };
}

function comePlayersClosingStart_(sheet) {
  var dates = sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), 1).getDisplayValues();
  for (var i = dates.length - 1; i >= 0; i--) {
    if (String(dates[i][0] || '').trim().toUpperCase() === 'CLOSING') return i + 2;
  }
  throw new Error('Penanda CLOSING tidak ditemukan; sinkronisasi ditunda agar periode lama tetap aman.');
}

function comePlayersSignature_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value), Utilities.Charset.UTF_8
  )).slice(0, 24);
}

function runComePlayersPayrollSync_(mode, event) {
  // Payroll only reads the source and writes CP_* state; the mirror writes its target/EGM_*.
  // A user lock serializes the installer's payroll triggers independently of the mirror lock.
  var lock = LockService.getUserLock();
  // A missed edit is picked up by reconciliation; never advance its signature.
  if (!lock.tryLock(mode === 'reconcile' ? 25000 : 1000)) return { ok: true, saved: false, skipped: "busy" };
  try { return syncComePlayersPayrollRows_(mode, event); }
  finally { lock.releaseLock(); }
}

function syncComePlayersPayrollRows_(mode, event) {
  var startedAt = Date.now();
  var props = PropertiesService.getScriptProperties();
  var config = props.getProperties();
  var url = config.CP_SYNC_URL || COMEPLAYERS_PAYROLL_SYNC_URL;
  var secret = config.CP_SYNC_SECRET || "";
  var actorEmail = config.CP_ACTOR_EMAIL || "";
  var sheetName = config.CP_SHEET_NAME || "MUTASI FH";
  var headerRow = Number(config.CP_HEADER_ROW || "2");
  var spreadsheet = config.CP_SPREADSHEET_ID
    ? SpreadsheetApp.openById(config.CP_SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("Jalankan reinstallComePlayersPayrollRealtimeSync terlebih dahulu.");
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet " + sheetName + " tidak ditemukan.");
  if (event && (event.source.getId() !== spreadsheet.getId() || event.range.getSheet().getSheetId() !== sheet.getSheetId())) {
    return { ok: true, saved: false, skipped: "other_sheet" };
  }

  if (secret.length < 24) throw new Error("CP_SYNC_SECRET belum dikonfigurasi.");
  if (!actorEmail) throw new Error("CP_ACTOR_EMAIL belum dikonfigurasi.");
  if (!Number.isInteger(headerRow) || headerRow < 1) throw new Error("CP_HEADER_ROW tidak valid.");
  // Keep header mapping independent from the first open-period data row.
  var allExisting = config.CP_SYNC_ALL_EXISTING === 'true';
  var newOrdersStartRow;
  var dataStartRow = Number(config.CP_START_ROW || (headerRow + 1));
  if (allExisting) {
    newOrdersStartRow = comePlayersClosingStart_(sheet);
    dataStartRow = headerRow + 1;
  } else if (config.CP_START_AFTER_CLOSING === 'true') dataStartRow = comePlayersClosingStart_(sheet);
  if (!Number.isSafeInteger(dataStartRow) || dataStartRow <= headerRow) {
    throw new Error("CP_START_ROW harus berupa nomor baris setelah header.");
  }

  var lastRow = sheet.getLastRow();
  var lastColumn = Math.min(Math.max(sheet.getLastColumn(), 13), 32);
  var firstRow = event ? Math.max(dataStartRow, event.range.getRow()) : dataStartRow;
  var endRow = event ? Math.min(lastRow, event.range.getLastRow()) : lastRow;
  var syncDeletions = config.CP_SYNC_DELETIONS === 'true';
  var namespaceId = config.CP_SYNC_NAMESPACE_ID || spreadsheet.getId();
  var summary = { ok: true, saved: false, syncMode: mode, added: 0, updated: 0, archived: 0, restored: 0, unchanged: 0,
    skippedProtected: 0, skippedConflicts: 0, skippedInvalid: 0, skippedHistorical: 0,
    rosterAdded: 0, rosterUpdated: 0, rosterRemoved: 0, sent: 0, deferred: 0 };
  if (event && event.range.getLastRow() < dataStartRow) return summary;
  if (endRow < firstRow && !syncDeletions) return summary;
  if (lastRow - dataStartRow + 1 > 10000) throw new Error("Batas sinkronisasi 10000 baris aktif terlampaui.");

  var headers = sheet.getRange(headerRow, 1, 1, lastColumn).getDisplayValues()[0];
  var codeColumn = findComePlayersHeader_(headers, ["KODE", "CODE", "ORDER CODE"], 1);
  var boosterColumn = findComePlayersHeader_(headers, ["BOOSTER", "KARYAWAN", "PEKERJA"], 5);
  if ((syncDeletions || allExisting) && ['KODE', 'CODE', 'ORDERCODE'].indexOf(normalizeComePlayersHeader_(headers[codeColumn])) < 0) throw new Error('Header KODE tidak valid; tidak ada penghapusan yang diproses.');
  if (lastRow > 50000) throw new Error('Batas pemeriksaan KODE lengkap terlampaui.');
  var allCodeValues = (syncDeletions || allExisting) && lastRow > headerRow ? sheet.getRange(headerRow + 1, codeColumn + 1, lastRow - headerRow, 1).getDisplayValues() : [];
  // Legacy mode scans the configured period; all-existing mode scans complete history.
  var codeValues = lastRow >= dataStartRow ? sheet.getRange(dataStartRow, codeColumn + 1, lastRow - dataStartRow + 1, 1).getDisplayValues() : [];
  var codeCounts = Object.create(null);
  var globalCodeCounts = Object.create(null);
  var periods = Object.create(null);
  if (allExisting) {
    var dateValues = lastRow > headerRow ? sheet.getRange(headerRow + 1, 1, lastRow - headerRow, 1).getDisplayValues() : [];
    var period = headerRow;
    allCodeValues.forEach(function (row, index) {
      var number = headerRow + 1 + index;
      if (String(dateValues[index][0] || '').trim().toUpperCase() === 'CLOSING') period = number;
      periods[number] = period;
      var key = String(row[0] || '').trim().toLowerCase();
      if (!key) return;
      globalCodeCounts[key] = (globalCodeCounts[key] || 0) + 1;
      var scoped = period + ':' + key;
      codeCounts[scoped] = (codeCounts[scoped] || 0) + 1;
    });
  } else {
    codeValues.forEach(function (row) {
      var key = String(row[0] || "").trim().toLowerCase();
      if (key) codeCounts[key] = (codeCounts[key] || 0) + 1;
    });
  }
  var roster = config.CP_SYNC_ROSTER === 'true' ? comePlayersRoster_(spreadsheet) : undefined;
  var rosterSignature = roster ? comePlayersSignature_(roster) : undefined;
  var rowCount = Math.max(0, endRow - firstRow + 1);
  var range = rowCount ? sheet.getRange(firstRow, 1, rowCount, lastColumn) : null;
  var values = range ? range.getValues() : [];
  var display = range ? range.getDisplayValues() : [];
  var backgrounds = range ? range.getBackgrounds() : [];
  var rows = [];
  var signatures = {};
  // Shards stay below 9 KB/property; 10,000 signatures (including retries) fit 500 KB.
  var cachePrefix = "CP_ROW_HASH_" + comePlayersSignature_([spreadsheet.getId(), sheet.getSheetId()]) + "_";
  var buckets = {};
  var dirtyBuckets = {};
  Object.keys(config).forEach(function (key) {
    if (key.indexOf(cachePrefix) !== 0) return;
    try { buckets[key] = JSON.parse(config[key]); } catch (error) { buckets[key] = {}; }
  });
  function cacheKey(rowNumber) { return cachePrefix + Math.floor(rowNumber / 100); }
  function inventoryUnchanged() {
    var currentCodes = lastRow > headerRow ? sheet.getRange(headerRow + 1, codeColumn + 1, lastRow - headerRow, 1).getDisplayValues() : [];
    var currentDates = allExisting && lastRow > headerRow ? sheet.getRange(headerRow + 1, 1, lastRow - headerRow, 1).getDisplayValues() : [];
    return sheet.getLastRow() === lastRow && JSON.stringify(currentCodes) === JSON.stringify(allCodeValues)
      && (!allExisting || JSON.stringify(currentDates) === JSON.stringify(dateValues));
  }
  function sendPresence(requireTrackedRows) {
    var payload = { version: 1, syncMode: 'reconcile', spreadsheetId: namespaceId,
      spreadsheetName: spreadsheet.getName(), sheetName: sheetName, headers: headers,
      sentAt: new Date().toISOString(), actor: { email: actorEmail }, rows: [],
      roster: roster, newOrdersStartRow: newOrdersStartRow, headerRow: headerRow };
    if (syncDeletions) payload.presence = { complete: true, startRow: dataStartRow,
      references: allCodeValues.map(function (r) { return String(r[0] || '').trim(); }).filter(Boolean) };
    var response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret }, payload: JSON.stringify(payload), muteHttpExceptions: true });
    var status = response.getResponseCode();
    props.setProperty('CP_LAST_SYNC_STATUS', String(status));
    if (status < 200 || status >= 300) throw new Error('Pemeriksaan pesanan Sheet gagal (HTTP ' + status + '); dicoba lagi menit berikutnya.');
    var result = JSON.parse(response.getContentText());
    if (result.ok !== true || !Array.isArray(result.refreshReferences)
      || (requireTrackedRows && (!Array.isArray(result.trackedRows) || result.trackedRows.some(function (row) {
        return !row || typeof row.reference !== 'string' || !row.reference.trim()
          || (row.rowNumber !== undefined && (!Number.isSafeInteger(row.rowNumber) || row.rowNumber <= headerRow || row.rowNumber > 50000));
      })))) throw new Error('Respons pemeriksaan pesanan Sheet tidak valid.');
    ['archived', 'skippedProtected', 'rosterAdded', 'rosterUpdated', 'rosterRemoved'].forEach(function (key) { summary[key] += Number(result[key] || 0); });
    summary.saved = summary.saved || result.saved === true;
    // A requested unlock/restoration invalidates the prior signature immediately.
    var refresh = Object.create(null);
    result.refreshReferences.forEach(function (ref) { refresh[String(ref).trim().toLowerCase()] = true; });
    codeValues.forEach(function (r, index) {
      if (!refresh[String(r[0] || '').trim().toLowerCase()]) return;
      var number = dataStartRow + index, key = cacheKey(number);
      if (buckets[key]) { delete buckets[key][number]; dirtyBuckets[key] = true; }
    });
    return result;
  }
  var tracked = Object.create(null);
  if (allExisting) {
    // The identity preflight also applies roster before resolving order workers.
    // Recheck KODE so no deletion or upload is based on a partially moved inventory.
    if (!inventoryUnchanged()) throw new Error('Daftar KODE atau penanda CLOSING berubah saat dibaca; dicoba lagi menit berikutnya.');
    sendPresence(true).trackedRows.forEach(function (row) {
      var key = row.reference.trim().toLowerCase();
      if (!tracked[key]) tracked[key] = [];
      tracked[key].push(row.rowNumber);
    });
  }
  // Prune signatures for removed/blank rows, never ComePlayers orders.
  if (mode === "reconcile") {
    Object.keys(buckets).forEach(function (key) {
      Object.keys(buckets[key]).forEach(function (number) {
        var codeRow = codeValues[Number(number) - dataStartRow];
        if (!codeRow || !String(codeRow[0] || "").trim()) {
          delete buckets[key][number]; dirtyBuckets[key] = true;
        }
      });
    });
  }

  for (var i = 0; i < rowCount; i++) {
    var code = String(display[i][codeColumn] || values[i][codeColumn] || "").trim();
    if (!code) continue;
    var rowNumber = firstRow + i;
    var historical = allExisting && rowNumber < newOrdersStartRow;
    if (historical && (!tracked[code.toLowerCase()] || (globalCodeCounts[code.toLowerCase()] !== 1
      && tracked[code.toLowerCase()].indexOf(rowNumber) < 0))) {
      summary.skippedHistorical++; continue;
    }
    var row = {
      rowNumber: rowNumber,
      values: values[i].map(comePlayersJsonValue_),
      display: display[i],
      boosterBlack: isComePlayersBlack_(backgrounds[i][boosterColumn]),
      duplicateCode: codeCounts[(allExisting ? periods[firstRow + i] + ':' : '') + code.toLowerCase()] > 1
    };
    if (allExisting) row.codeOccurrences = globalCodeCounts[code.toLowerCase()];
    var signature = comePlayersSignature_([url, actorEmail, sheetName, headers, row, newOrdersStartRow, rosterSignature]);
    var bucket = buckets[cacheKey(row.rowNumber)] || {};
    var cached = String(bucket[row.rowNumber] || "");
    var retryMinute = cached.indexOf(":") >= 0 ? parseInt(cached.split(":")[1], 36) : 0;
    if (cached === signature || (cached.split(":")[0] === signature && Math.floor(Date.now() / 60000) - retryMinute < 15)) {
      summary.unchanged++; continue;
    }
    signatures[row.rowNumber] = signature;
    rows.push(row);
  }
  // Current orders make progress first if history needs several batches.
  if (allExisting) rows.sort(function (left, right) {
    return Number(left.rowNumber < newOrdersStartRow) - Number(right.rowNumber < newOrdersStartRow)
      || left.rowNumber - right.rowNumber;
  });

  function saveSignatures() {
    var changed = {};
    Object.keys(dirtyBuckets).forEach(function (key) {
      if (Object.keys(buckets[key]).length) changed[key] = JSON.stringify(buckets[key]);
      else props.deleteProperty(key);
    });
    if (Object.keys(changed).length) props.setProperties(changed, false);
    dirtyBuckets = {};
  }
  saveSignatures();
  for (var offset = 0; offset < rows.length; offset += COMEPLAYERS_PAYROLL_BATCH_SIZE) {
    // Always make progress even when reading/signing a large sheet took 45s.
    if (offset > 0 && Date.now() - startedAt > 45000) { summary.deferred = rows.length - offset; break; }
    var batch = rows.slice(offset, offset + COMEPLAYERS_PAYROLL_BATCH_SIZE);
    var payload = { version: 1, syncMode: mode, spreadsheetId: namespaceId,
      spreadsheetName: spreadsheet.getName(), sheetName: sheet.getName(), headerRow: headerRow,
      headers: headers, sentAt: new Date().toISOString(), actor: { email: actorEmail }, rows: batch,
      newOrdersStartRow: newOrdersStartRow, roster: roster };
    var response = UrlFetchApp.fetch(url, {
      method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + secret },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    var status = response.getResponseCode();
    props.setProperty("CP_LAST_SYNC_STATUS", String(status));
    // Do not log the raw response: upstream errors may echo sensitive request data.
    if (status < 200 || status >= 300) throw new Error("ComePlayers sync gagal (HTTP " + status + "). Dicoba lagi pada rekonsiliasi berikutnya.");
    var result = JSON.parse(response.getContentText());
    if (result.ok !== true || !Array.isArray(result.rowResults)) throw new Error("Respons sync tidak valid; signature tidak disimpan.");
    summary.sent += batch.length;
    summary.saved = summary.saved || result.saved === true;
    ["added", "updated", "archived", "restored", "unchanged", "skippedProtected", "skippedConflicts", "skippedInvalid", "skippedHistorical", "rosterAdded", "rosterUpdated", "rosterRemoved"].forEach(function (key) {
      summary[key] += Number(result[key] || 0);
    });
    result.rowResults.forEach(function (ack) {
      var applied = ["added", "updated", "unchanged", "skippedHistorical"].indexOf(ack.status) >= 0;
      if (!applied && ["skippedProtected", "skippedConflicts", "skippedInvalid"].indexOf(ack.status) < 0) return;
      if (!batch.some(function (row) { return row.rowNumber === ack.rowNumber; })) return;
      var key = cacheKey(ack.rowNumber);
      if (!buckets[key]) buckets[key] = {};
      // Retry unchanged rejected rows after 15 minutes, or immediately on an edit.
      // This avoids uploading thousands of unchanged historical/manual orders every minute.
      buckets[key][ack.rowNumber] = signatures[ack.rowNumber] + (applied ? "" : ":" + Math.floor(Date.now() / 60000).toString(36));
      dirtyBuckets[key] = true;
    });
    // Cache each acknowledged batch. HTTP failures never advance signatures.
    saveSignatures();
  }
  // Presence is never inferred from a partial row batch. Recheck the complete KODE
  // inventory after all writes; a concurrent row move/clear defers deletion.
  if (syncDeletions && !summary.deferred) {
    if (!inventoryUnchanged()) {
      summary.deletionsDeferred = true;
    } else {
      sendPresence(false);
      saveSignatures();
    }
  } else if (roster && !allExisting && !summary.deferred) {
    // The roster must reach the server even if every order signature was unchanged.
    var rosterPayload = { version: 1, syncMode: 'reconcile', spreadsheetId: namespaceId,
      spreadsheetName: spreadsheet.getName(), sheetName: sheetName, headerRow: headerRow,
      headers: headers, sentAt: new Date().toISOString(), actor: { email: actorEmail }, rows: [],
      roster: roster, newOrdersStartRow: newOrdersStartRow };
    var rosterResponse = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret }, payload: JSON.stringify(rosterPayload), muteHttpExceptions: true });
    var rosterStatus = rosterResponse.getResponseCode();
    if (rosterStatus < 200 || rosterStatus >= 300) throw new Error('Pembaruan daftar karyawan gagal (HTTP ' + rosterStatus + ').');
    var rosterResult = JSON.parse(rosterResponse.getContentText());
    if (rosterResult.ok !== true) throw new Error('Respons daftar karyawan tidak valid.');
    summary.saved = summary.saved || rosterResult.saved === true;
    ['rosterAdded', 'rosterUpdated', 'rosterRemoved'].forEach(function (key) { summary[key] += Number(rosterResult[key] || 0); });
  }
  props.setProperties({ CP_LAST_SYNC_AT: new Date().toISOString(), CP_LAST_SYNC_RESULT: JSON.stringify(summary) }, false);
  console.log(JSON.stringify(summary));
  return summary;
}
