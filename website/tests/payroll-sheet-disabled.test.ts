import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { timingSafeEqual } from "node:crypto";
import ts from "typescript";

function load(file: string, env: Record<string, string>, mocks: Record<string, unknown> = {}) {
  const exports: Record<string, (...args: never[]) => unknown> = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, process: { env }, Response, Buffer,
    require: (name: string) => mocks[name] ?? new Proxy({}, {
      get: () => () => { throw new Error(`Unexpected side effect: ${name}`); },
    }),
  });
  return exports;
}

test("disabled Sheets routes reject all credentials and payloads before any side effect", async () => {
  for (const flag of [undefined, "", "false", "TRUE", "1", "true "]) {
    const env = { PAYROLL_SHEETS_SYNC_SECRET: "s".repeat(24), CRON_SECRET: "c".repeat(24),
      ...(flag === undefined ? {} : { PAYROLL_SHEETS_SYNC_ENABLED: flag }) };
    const control = load("lib/payrollSheetSyncControl.ts", env);
    for (const [file, method] of [
      ["app/api/integrations/payroll-sheet/route.ts", "POST"],
      ["app/api/integrations/payroll-sheet/route.ts", "GET"],
      ["app/api/integrations/payroll-employee-renames/route.ts", "GET"],
    ]) {
      const route = load(file, env, { "@/lib/payrollSheetSyncControl": control });
      const request = new Proxy({}, { get: () => { throw new Error("Request must not be read while disabled"); } });
      const reply = await route[method](request as never) as Response;
      assert.equal(reply.status, 410);
      assert.equal(reply.headers.get("Cache-Control"), "no-store");
      assert.deepEqual(await reply.json(), {
        ok: false, saved: false, enabled: false, code: "PAYROLL_SHEETS_SYNC_DISABLED",
        error: "Sinkronisasi Google Sheets ke Payroll dinonaktifkan. Data Payroll tetap tersimpan.",
      });
    }
  }
});

test("explicit opt-in still requires dedicated secret, never global cron credentials", async () => {
  const env = { PAYROLL_SHEETS_SYNC_ENABLED: "true", CRON_SECRET: "c".repeat(24) };
  const mocks = { "@/lib/payrollSheetSyncControl": load("lib/payrollSheetSyncControl.ts", env),
    "node:crypto": { timingSafeEqual } };
  const sheet = load("app/api/integrations/payroll-sheet/route.ts", env, mocks);
  const rename = load("app/api/integrations/payroll-employee-renames/route.ts", env, mocks);
  const req = new Request("https://example.test", { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
  assert.equal((await sheet.POST(req as never) as Response).status, 503);
  assert.equal((await rename.GET(req as never) as Response).status, 503);
  assert.deepEqual(await (await sheet.GET() as Response).json(), { ok: true, enabled: true });
});

test("Apps Script defaults off for manual, edit, clock, writeback and direct row sends", () => {
  const props: Record<string, string> = {};
  const disabled = new Proxy({}, { get: () => { throw new Error("Unexpected network, workbook or lock access"); } });
  const context: Record<string, unknown> = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key: string) => props[key] }) },
    UrlFetchApp: disabled, SpreadsheetApp: disabled, LockService: disabled, ScriptApp: disabled,
  };
  runInNewContext(readFileSync(new URL("../scripts/comeplayers-payroll-google-sheets.gs", import.meta.url), "utf8"), context);
  for (const call of [
    "setupComePlayersPayrollSync()", "reinstallComePlayersPayrollRealtimeSync()",
    "installComePlayersPayrollHourlyTrigger()", "syncComePlayersPayroll()",
    "applyComePlayersEmployeeNameCorrections_()", "runComePlayersPayrollSync_('reconcile', null)",
    "syncComePlayersPayrollRows_('incremental', null)",
    "onComePlayersPayrollEdit({range:{},source:{}})",
    "onComePlayersPayrollChange({source:{getId:()=>undefined},changeType:'REMOVE_ROW'})",
  ]) {
    assert.equal(runInNewContext(call, context).code, "PAYROLL_SHEETS_SYNC_DISABLED", call);
  }
});

test("pause removes only the calling account's three Payroll triggers and preserves all properties", () => {
  const props: Record<string, string> = { CP_SYNC_SECRET: "fixture", CP_ROW_HASH_1: "keep", EGM_CONFIG: "keep" };
  const removed: string[] = [];
  const names = ["syncComePlayersPayroll", "onComePlayersPayrollEdit", "onComePlayersPayrollChange", "mirrorEvoGaming", "otherJob"];
  const context = {
    PropertiesService: { getScriptProperties: () => ({ setProperty: (key: string, value: string) => { props[key] = value; } }) },
    ScriptApp: { getProjectTriggers: () => names.map(name => ({ getHandlerFunction: () => name })),
      deleteTrigger: (trigger: { getHandlerFunction: () => string }) => removed.push(trigger.getHandlerFunction()) },
  };
  runInNewContext(readFileSync(new URL("../scripts/comeplayers-payroll-google-sheets.gs", import.meta.url), "utf8"), context);
  runInNewContext("pauseComePlayersPayrollSync()", context);
  assert.deepEqual(removed, names.slice(0, 3));
  assert.deepEqual(props, { CP_SYNC_SECRET: "fixture", CP_ROW_HASH_1: "keep", EGM_CONFIG: "keep", CP_PAYROLL_SYNC_ENABLED: "false" });
});
