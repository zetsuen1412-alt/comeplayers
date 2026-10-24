import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/api/admin/payroll/mobile/proof-setup/route.ts", import.meta.url), "utf8");
const url = "https://www.comeplayers.com/api/admin/payroll/mobile/proof-setup";

function endpoint(options: {
  admin?: boolean;
  group?: { chat_id: number; chat_title: string; active: boolean } | null;
  verify?: (chatId: number) => Promise<string>;
}) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { GET?: (request: Request) => Promise<Response> } = {};
  let reads = 0;
  let checks = 0;
  runInNewContext(compiled, {
    exports, Request, Response, Number, Error,
    require: (moduleName: string) => {
      if (moduleName === "@/lib/monitorAccess") return {
        requireMonitorAccess: async () => ({
          actor: { isAdmin: options.admin ?? true },
          supabaseAdmin: { from: (table: string) => {
            reads++;
            assert.equal(table, "cp_payroll_telegram_divisions");
            return { select: () => ({ eq: () => ({
              maybeSingle: async () => ({ data: options.group, error: null }),
            }) }) };
          } },
        }),
      };
      if (moduleName === "@/lib/adminSecurity") return {
        adminErrorStatus: (e: { status?: number }) => e.status ?? 503,
      };
      if (moduleName === "@/lib/payrollMobileProof") return {
        FH3_PROOF_GROUP: "EVO Ilham FH3",
        verifyFH3ProofGroup: async (id: number) => {
          checks++;
          return options.verify?.(id) ?? "🔥 EVO🔥 Ilham FH3";
        },
      };
      throw new Error("Unexpected module: " + moduleName);
    },
  });
  return { get: () => exports.GET!(new Request(url)), reads: () => reads, checks: () => checks };
}
test("bound employee can verify the group without sending reports", async () => {
  const route = endpoint({ admin: false,group:{chat_id:-100777,chat_title:"FH3",active:true} });
  assert.equal((await route.get()).status, 200);
  assert.equal(route.reads(), 1);
  assert.equal(route.checks(), 1);
});
test("FH3 bot group can be verified without sending a Telegram photo", async () => {
  const route = endpoint({ group: { chat_id: -100777, chat_title: "🔥 EVO🔥 Ilham FH3", active: true },
    verify: async id => {
      assert.equal(id, -100777);
      return "🔥 EVO🔥 Ilham FH3";
    } });
  const response = await route.get();
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ready, true);
  assert.equal(payload.liveTitle, "🔥 EVO🔥 Ilham FH3");
  assert.equal(route.checks(), 1);
});
test("old Telegram private leader chat is rejected without network call", async () => {
  const route = endpoint({ group: { chat_id: 12345, chat_title: "Leader", active: true } });
  const response = await route.get();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).ready, false);
  assert.equal(route.checks(), 0);
});
test("group mismatch fails safely before Telegram sendPhoto", async () => {
  const route = endpoint({ group: { chat_id: -100777, chat_title: "Unknown", active: true },
    verify: async () => { throw new Error("Wrong group"); } });
  const response = await route.get();
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Wrong group/);
});
