/**
 * ONE-TIME REIMPORT: EVO GAMING 2026 -> MUTASI FH rows 5848..7536.
 *
 * Install this file in the EXISTING bound Google Apps Script project containing
 * comeplayers-payroll-google-sheets.gs, then run:
 *    startComePlayersFH5848To7536Reimport()
 *
 * No password or secret is hard-coded here. Existing CP_SYNC_SECRET and
 * CP_ACTOR_EMAIL stay in Script Properties. Original Google cells are READ ONLY.
 *
 * Note: the site must have already been reset through the audited admin reset
 * endpoint, otherwise incoming rows update existing orders, not remove them.
 */
var CP_FH_REIMPORT_SOURCE_ID_20261020 = '1i8agw507TPoVd66TcMooDhOTzZvoUcFuqrlBmH6Lrdo';
var CP_FH_REIMPORT_NAMESPACE_20261020 = '1dcw71cfqrJnLUOd27bcDlP5EhFqer1xL6OnWuojbRMQ';
var CP_FH_REIMPORT_START_20261020 = 5848;
var CP_FH_REIMPORT_END_20261020 = 7536;
var CP_FH_REIMPORT_MARKER_20261020 = 'CP_FH_REIMPORT_5848_7536_RUNNING';
var CP_FH_REIMPORT_PROGRESS_20261020 = 'CP_FH_REIMPORT_5848_7536_LAST_RESULT';
var CP_FH_REIMPORT_TRIGGER_20261020 = 'continueComePlayersFH5848To7536Reimport';

function cpFHReimportVerifySource_20261020() {
  var props = PropertiesService.getScriptProperties();
  var mirrorConfigText = props.getProperty('EGM_CONFIG');
  if (mirrorConfigText) {
    var mirrorConfig = JSON.parse(mirrorConfigText);
    if (mirrorConfig.sourceId !== CP_FH_REIMPORT_SOURCE_ID_20261020
        || mirrorConfig.targetId !== CP_FH_REIMPORT_NAMESPACE_20261020) {
      throw new Error('Konfigurasi mirror tidak cocok dengan sumber EVO dan target OTOMATIS. Periksa EGM_CONFIG sebelum mengimpor.');
    }
  }
  var ss = SpreadsheetApp.openById(CP_FH_REIMPORT_SOURCE_ID_20261020);
  var sheet = ss.getSheetByName('MUTASI FH');
  if (!sheet || sheet.getLastRow() < CP_FH_REIMPORT_END_20261020) {
    throw new Error('Sheet MUTASI FH atau baris akhir 7536 tidak ditemukan; proses dihentikan.');
  }
  var begin = String(sheet.getRange(5848, 2).getDisplayValue()).trim().toUpperCase();
  var finish = String(sheet.getRange(7536, 2).getDisplayValue()).trim().toUpperCase();
  if (begin !== 'X2754' || finish !== 'X4688') {
    throw new Error('Penanda batas berubah: diperlukan B5848=X2754 dan B7536=X4688. Jangan impor data yang bergeser.');
  }
  return { spreadsheet: ss, sheet: sheet };
}

function cpFHReimportDeleteTrigger_20261020() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === CP_FH_REIMPORT_TRIGGER_20261020) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function cpFHReimportClearOnlyRangeHashes_20261020(ss, sheet) {
  // Important: preserve signature buckets for all other periods.
  var props = PropertiesService.getScriptProperties();
  var prefix = 'CP_ROW_HASH_' + comePlayersSignature_([ss.getId(), sheet.getSheetId()]) + '_';
  var values = props.getProperties();
  var cleared = 0;
  Object.keys(values).forEach(function (key) {
    if (key.indexOf(prefix) !== 0) return;
    var bucket;
    try { bucket = JSON.parse(values[key]); }
    catch (_error) { throw new Error('Cache signature rusak (' + key + '); data belum diubah.'); }
    var changed = false;
    Object.keys(bucket).forEach(function (rowText) {
      var n = Number(rowText);
      if (n >= 5848 && n <= 7536 && Number.isInteger(n)) {
        delete bucket[rowText]; changed = true; cleared++;
      }
    });
    if (changed) {
      if (Object.keys(bucket).length) props.setProperty(key, JSON.stringify(bucket));
      else props.deleteProperty(key);
    }
  });
  return cleared;
}

function startComePlayersFH5848To7536Reimport() {
  if (typeof syncComePlayersPayrollRows_ !== 'function' || typeof comePlayersSignature_ !== 'function') {
    throw new Error('Jalankan helper ini di proyek Apps Script ComePlayers yang telah memasang sinkronisasi payroll.');
  }
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CP_SYNC_SECRET') || !props.getProperty('CP_ACTOR_EMAIL')) {
    throw new Error('Secret dan akun admin payroll harus sudah terpasang di Script Properties.');
  }
  if (props.getProperty(CP_FH_REIMPORT_MARKER_20261020) === 'true') {
    return continueComePlayersFH5848To7536Reimport();
  }
  var source = cpFHReimportVerifySource_20261020();
  var lock = LockService.getUserLock();
  if (!lock.tryLock(25000)) throw new Error('Sinkronisasi lain sedang berjalan. Ulangi sesaat lagi.');
  try {
    var cleared = cpFHReimportClearOnlyRangeHashes_20261020(source.spreadsheet, source.sheet);
    props.setProperty(CP_FH_REIMPORT_MARKER_20261020, 'true');
    props.setProperty(CP_FH_REIMPORT_PROGRESS_20261020, JSON.stringify({
      status:'started',startRow:5848,endRow:7536,clearedCacheEntries:cleared
    }));
  } finally {
    lock.releaseLock();
  }
  cpFHReimportDeleteTrigger_20261020();
  ScriptApp.newTrigger(CP_FH_REIMPORT_TRIGGER_20261020).timeBased().everyMinutes(1).create();
  return continueComePlayersFH5848To7536Reimport();
}

function continueComePlayersFH5848To7536Reimport() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(CP_FH_REIMPORT_MARKER_20261020) !== 'true') {
    cpFHReimportDeleteTrigger_20261020();
    return { ok:true, status:'not_running' };
  }
  var lock = LockService.getUserLock();
  if (!lock.tryLock(25000)) return { ok:true, skipped:'sync_busy', retry:'next_minute' };
  var previous = {};
  var keys = [
    'CP_SPREADSHEET_ID','CP_SYNC_NAMESPACE_ID','CP_SHEET_NAME',
    'CP_HEADER_ROW','CP_START_ROW','CP_START_AFTER_CLOSING',
    'CP_SYNC_ALL_EXISTING','CP_LEGACY_BOOKKEEPING','CP_SYNC_DELETIONS'
  ];
  try {
    var source = cpFHReimportVerifySource_20261020();
    keys.forEach(function (key) { previous[key] = props.getProperty(key); });
    props.setProperties({
      CP_SPREADSHEET_ID: CP_FH_REIMPORT_SOURCE_ID_20261020,
      CP_SYNC_NAMESPACE_ID: CP_FH_REIMPORT_NAMESPACE_20261020,
      CP_SHEET_NAME: 'MUTASI FH',
      CP_HEADER_ROW: '2',
      CP_START_ROW: '5848',
      CP_START_AFTER_CLOSING: 'false',
      CP_SYNC_ALL_EXISTING: 'false',
      CP_LEGACY_BOOKKEEPING: 'false',
      CP_SYNC_DELETIONS: 'false'
    }, false);
    // The source range creates a bounded incremental upload; no last-row scan,
    // deletion reconciliation, or historical archive import is requested.
    var event = { source: source.spreadsheet,
      range: source.sheet.getRange(CP_FH_REIMPORT_START_20261020, 1,
        CP_FH_REIMPORT_END_20261020 - CP_FH_REIMPORT_START_20261020 + 1, 1) };
    var result = syncComePlayersPayrollRows_('incremental', event);
    var summary = {
      ok: result.ok === true, startRow:5848, endRow:7536,
      sent:Number(result.sent || 0), added:Number(result.added || 0),
      updated:Number(result.updated || 0), skippedConflicts:Number(result.skippedConflicts || 0),
      skippedInvalid:Number(result.skippedInvalid || 0), deferred:Number(result.deferred || 0),
      skipped: result.skipped || null, finishedAt:new Date().toISOString()
    };
    props.setProperty(CP_FH_REIMPORT_PROGRESS_20261020, JSON.stringify(summary));
    if (summary.ok && !summary.deferred && !summary.skipped) {
      props.deleteProperty(CP_FH_REIMPORT_MARKER_20261020);
      cpFHReimportDeleteTrigger_20261020();
      summary.status = 'source_scan_complete';
      // This confirms all bounded rows were attempted. Invalid/conflicting rows
      // stay skipped for review; it is NOT a claim that every row imported.
    } else {
      summary.status = 'retry_scheduled';
    }
    console.log(JSON.stringify(summary));
    return summary;
  } finally {
    keys.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(previous,key)) {
        if (previous[key] === null) props.deleteProperty(key);
        else props.setProperty(key,previous[key]);
      }
    });
    lock.releaseLock();
  }
}

function getComePlayersFH5848To7536ReimportStatus() {
  var props = PropertiesService.getScriptProperties();
  return {
    running:props.getProperty(CP_FH_REIMPORT_MARKER_20261020) === 'true',
    lastResult:JSON.parse(props.getProperty(CP_FH_REIMPORT_PROGRESS_20261020) || 'null')
  };
}

function stopComePlayersFH5848To7536Reimport() {
  PropertiesService.getScriptProperties().deleteProperty(CP_FH_REIMPORT_MARKER_20261020);
  cpFHReimportDeleteTrigger_20261020();
  return { stopped:true, dataAlreadyImportedRemains:true };
}
