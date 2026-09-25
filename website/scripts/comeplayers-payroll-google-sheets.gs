/**
 * ComePlayers Payroll — Google Sheets hourly sync
 *
 * Paste this file into Extensions > Apps Script for the EVO GAMING 2026 workbook.
 * Open the MUTASI FH sheet first, then run setupComePlayersPayrollSync() once.
 *
 * Secrets are stored in Apps Script Properties, never in spreadsheet cells.
 */
var COMEPLAYERS_PAYROLL_SYNC_URL = "https://www.comeplayers.com/api/integrations/payroll-sheet";
var COMEPLAYERS_PAYROLL_SYNC_HANDLER = "syncComePlayersPayroll";

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

  var sheet = SpreadsheetApp.getActiveSheet();
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    CP_SYNC_URL: COMEPLAYERS_PAYROLL_SYNC_URL,
    CP_SYNC_SECRET: secret,
    CP_ACTOR_EMAIL: actorEmail,
    CP_SHEET_NAME: sheet.getName(),
    CP_HEADER_ROW: "2"
  }, false);

  installComePlayersPayrollHourlyTrigger();
  var result = syncComePlayersPayroll();
  ui.alert(
    "Sinkronisasi aktif",
    "Sheet: " + sheet.getName() + "\nJadwal: setiap 1 jam\nHasil pertama: " + JSON.stringify(result),
    ui.ButtonSet.OK
  );
}

function installComePlayersPayrollHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === COMEPLAYERS_PAYROLL_SYNC_HANDLER) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger(COMEPLAYERS_PAYROLL_SYNC_HANDLER)
    .timeBased()
    .everyHours(1)
    .create();
}

function removeComePlayersPayrollHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === COMEPLAYERS_PAYROLL_SYNC_HANDLER) ScriptApp.deleteTrigger(trigger);
  });
}

function syncComePlayersPayroll() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty("CP_SYNC_URL") || COMEPLAYERS_PAYROLL_SYNC_URL;
  var secret = props.getProperty("CP_SYNC_SECRET") || "";
  var actorEmail = props.getProperty("CP_ACTOR_EMAIL") || "";
  var sheetName = props.getProperty("CP_SHEET_NAME") || "";
  var headerRow = Number(props.getProperty("CP_HEADER_ROW") || "2");

  if (secret.length < 24) throw new Error("CP_SYNC_SECRET belum dikonfigurasi.");
  if (!actorEmail) throw new Error("CP_ACTOR_EMAIL belum dikonfigurasi.");
  if (!Number.isInteger(headerRow) || headerRow < 1) throw new Error("CP_HEADER_ROW tidak valid.");

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = sheetName ? spreadsheet.getSheetByName(sheetName) : SpreadsheetApp.getActiveSheet();
  if (!sheet) throw new Error("Sheet " + sheetName + " tidak ditemukan.");

  var lastRow = sheet.getLastRow();
  var lastColumn = Math.min(Math.max(sheet.getLastColumn(), 13), 32);
  if (lastRow <= headerRow) {
    return { ok: true, saved: false, rows: 0, message: "Tidak ada baris data." };
  }

  var headers = sheet.getRange(headerRow, 1, 1, lastColumn).getDisplayValues()[0];
  var codeColumn = findComePlayersHeader_(headers, ["KODE", "CODE", "ORDER CODE"], 1);
  var boosterColumn = findComePlayersHeader_(headers, ["BOOSTER", "KARYAWAN", "PEKERJA"], 5);
  var rowCount = lastRow - headerRow;
  var range = sheet.getRange(headerRow + 1, 1, rowCount, lastColumn);
  var values = range.getValues();
  var display = range.getDisplayValues();
  var backgrounds = range.getBackgrounds();
  var rows = [];

  for (var i = 0; i < rowCount; i++) {
    var code = String(display[i][codeColumn] || values[i][codeColumn] || "").trim();
    if (!code) continue;
    rows.push({
      rowNumber: headerRow + 1 + i,
      values: values[i].map(comePlayersJsonValue_),
      display: display[i],
      boosterBlack: isComePlayersBlack_(backgrounds[i][boosterColumn])
    });
  }

  var payload = {
    version: 1,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    sheetName: sheet.getName(),
    headerRow: headerRow,
    headers: headers,
    sentAt: new Date().toISOString(),
    actor: { email: actorEmail },
    rows: rows
  };

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  var body = response.getContentText();
  var result;
  try { result = JSON.parse(body); }
  catch (error) { result = { raw: body }; }

  props.setProperty("CP_LAST_SYNC_AT", new Date().toISOString());
  props.setProperty("CP_LAST_SYNC_STATUS", String(status));
  props.setProperty("CP_LAST_SYNC_RESULT", JSON.stringify(result).slice(0, 8000));

  if (status < 200 || status >= 300) {
    throw new Error("ComePlayers sync gagal (" + status + "): " + body.slice(0, 1000));
  }
  console.log(JSON.stringify(result));
  return result;
}
