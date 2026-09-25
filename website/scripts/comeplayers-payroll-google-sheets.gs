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
    CP_HEADER_ROW: "2"
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
    if (handler === COMEPLAYERS_PAYROLL_SYNC_HANDLER || handler === COMEPLAYERS_PAYROLL_EDIT_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function reinstallComePlayersPayrollRealtimeSync() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty("CP_SPREADSHEET_ID");
    var spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet || !spreadsheet.getSheetByName("MUTASI FH")) throw new Error("Sheet MUTASI FH tidak ditemukan.");
    props.setProperties({ CP_SPREADSHEET_ID: spreadsheet.getId(), CP_SHEET_NAME: "MUTASI FH" }, false);
    removeComePlayersPayrollSyncTriggers();
    ScriptApp.newTrigger(COMEPLAYERS_PAYROLL_EDIT_HANDLER).forSpreadsheet(spreadsheet).onEdit().create();
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
  return runComePlayersPayrollSync_("incremental", event);
}

function comePlayersSignature_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value), Utilities.Charset.UTF_8
  )).slice(0, 24);
}

function runComePlayersPayrollSync_(mode, event) {
  var lock = LockService.getScriptLock();
  // A missed edit is picked up by reconciliation; never advance its signature.
  if (!lock.tryLock(1000)) return { ok: true, saved: false, skipped: "busy" };
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

  var lastRow = sheet.getLastRow();
  var lastColumn = Math.min(Math.max(sheet.getLastColumn(), 13), 32);
  var firstRow = event ? Math.max(headerRow + 1, event.range.getRow()) : headerRow + 1;
  var endRow = event ? Math.min(lastRow, event.range.getLastRow()) : lastRow;
  var summary = { ok: true, saved: false, syncMode: mode, added: 0, updated: 0, unchanged: 0,
    skippedProtected: 0, skippedConflicts: 0, skippedInvalid: 0, sent: 0, deferred: 0 };
  if (endRow < firstRow) return summary;
  if (lastRow - headerRow > 10000) throw new Error("Batas sinkronisasi 10000 baris aktif terlampaui.");

  var headers = sheet.getRange(headerRow, 1, 1, lastColumn).getDisplayValues()[0];
  var codeColumn = findComePlayersHeader_(headers, ["KODE", "CODE", "ORDER CODE"], 1);
  var boosterColumn = findComePlayersHeader_(headers, ["BOOSTER", "KARYAWAN", "PEKERJA"], 5);
  // Scan only KODE outside the edit range to catch duplicates across the sheet.
  var codeValues = sheet.getRange(headerRow + 1, codeColumn + 1, lastRow - headerRow, 1).getDisplayValues();
  var codeCounts = Object.create(null);
  codeValues.forEach(function (row) {
    var key = String(row[0] || "").trim().toLowerCase();
    if (key) codeCounts[key] = (codeCounts[key] || 0) + 1;
  });
  var rowCount = endRow - firstRow + 1;
  var range = sheet.getRange(firstRow, 1, rowCount, lastColumn);
  var values = range.getValues();
  var display = range.getDisplayValues();
  var backgrounds = range.getBackgrounds();
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
  // Prune signatures for removed/blank rows, never ComePlayers orders.
  if (mode === "reconcile") {
    Object.keys(buckets).forEach(function (key) {
      Object.keys(buckets[key]).forEach(function (number) {
        var codeRow = codeValues[Number(number) - headerRow - 1];
        if (!codeRow || !String(codeRow[0] || "").trim()) {
          delete buckets[key][number]; dirtyBuckets[key] = true;
        }
      });
    });
  }

  for (var i = 0; i < rowCount; i++) {
    var code = String(display[i][codeColumn] || values[i][codeColumn] || "").trim();
    if (!code) continue;
    var row = {
      rowNumber: firstRow + i,
      values: values[i].map(comePlayersJsonValue_),
      display: display[i],
      boosterBlack: isComePlayersBlack_(backgrounds[i][boosterColumn]),
      duplicateCode: codeCounts[code.toLowerCase()] > 1
    };
    var signature = comePlayersSignature_([url, actorEmail, sheetName, headers, row]);
    var bucket = buckets[cacheKey(row.rowNumber)] || {};
    var cached = String(bucket[row.rowNumber] || "");
    var retryMinute = cached.indexOf(":") >= 0 ? parseInt(cached.split(":")[1], 36) : 0;
    if (cached === signature || (cached.split(":")[0] === signature && Math.floor(Date.now() / 60000) - retryMinute < 15)) {
      summary.unchanged++; continue;
    }
    signatures[row.rowNumber] = signature;
    rows.push(row);
  }

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
    if (Date.now() - startedAt > 45000) { summary.deferred = rows.length - offset; break; }
    var batch = rows.slice(offset, offset + COMEPLAYERS_PAYROLL_BATCH_SIZE);
    var payload = { version: 1, syncMode: mode, spreadsheetId: spreadsheet.getId(),
      spreadsheetName: spreadsheet.getName(), sheetName: sheet.getName(), headerRow: headerRow,
      headers: headers, sentAt: new Date().toISOString(), actor: { email: actorEmail }, rows: batch };
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
    ["added", "updated", "unchanged", "skippedProtected", "skippedConflicts", "skippedInvalid"].forEach(function (key) {
      summary[key] += Number(result[key] || 0);
    });
    result.rowResults.forEach(function (ack) {
      var applied = ["added", "updated", "unchanged"].indexOf(ack.status) >= 0;
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
  props.setProperties({ CP_LAST_SYNC_AT: new Date().toISOString(), CP_LAST_SYNC_RESULT: JSON.stringify(summary) }, false);
  console.log(JSON.stringify(summary));
  return summary;
}
