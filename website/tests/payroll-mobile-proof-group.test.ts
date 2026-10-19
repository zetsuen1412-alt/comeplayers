import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/payrollMobileProof.ts", import.meta.url), "utf8");
function moduleWithTelegram(reply: { ok: boolean; result?: { id: number; type: string; title: string } }) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: {
    FH3_PROOF_GROUP?: string;
    normalizeTelegramGroupTitle?: (value: string) => string;
    verifyFH3ProofGroup?: (id: number) => Promise<string>;
  } = {};
  let requests = 0;
  const ctx = {
    exports, process: { env: { TELEGRAM_BOT_TOKEN: "123456:abcdefghijklmnopqrstuvwxyz" } },
    fetch: async (_url: string, options: { body: string }) => {
      requests++;
      const parsed = JSON.parse(options.body) as { chat_id: number };
      assert.equal(typeof parsed.chat_id, "number");
      return { ok: reply.ok, json: async () => reply };
    },
    AbortSignal, Number, String, JSON, Error,
    require: (name: string) => {
      assert.equal(name, "server-only");
      return {};
    },
  };
  runInNewContext(compiled, ctx);
  return { module: exports, requests: () => requests };
}

test("target group name matches screenshot independent of spaces and fire emoji", async () => {
  const run = moduleWithTelegram({ ok: true, result: {
    id: -1001888001111, type: "supergroup", title: "🔥 EVO🔥 Ilham FH3",
  } });
  assert.equal(run.module.FH3_PROOF_GROUP, "EVO Ilham FH3");
  assert.equal(run.module.normalizeTelegramGroupTitle!("🔥EVO🔥 Ilham FH3"),
    "evoilhamfh3");
  assert.equal(await run.module.verifyFH3ProofGroup!(-1001888001111), "🔥 EVO🔥 Ilham FH3");
  assert.equal(run.requests(), 1);
});

test("private leader chat is blocked before any Telegram network call", async () => {
  const run = moduleWithTelegram({ ok: true, result: {
    id: 777, type: "private", title: "Leader",
  } });
  await assert.rejects(run.module.verifyFH3ProofGroup!(777), /chat pribadi/);
  assert.equal(run.requests(), 0);
});

test("mismatched FH3 group is blocked despite database mapping to negative ID", async () => {
  const run = moduleWithTelegram({ ok: true, result: {
    id: -1001888001111, type: "supergroup", title: "EVO Ilham FH2",
  } });
  await assert.rejects(run.module.verifyFH3ProofGroup!(-1001888001111), /grup lain/);
  assert.equal(run.requests(), 1);
});

test("bots cannot treat a private Telegram chat as a group even with a matching title", async () => {
  const run = moduleWithTelegram({ ok: true, result: {
    id: -1001888001111, type: "private", title: "🔥 EVO🔥 Ilham FH3",
  } });
  await assert.rejects(run.module.verifyFH3ProofGroup!(-1001888001111), /grup lain/);
});

test("Telegram getChat errors block sending rather than guessing the destination", async () => {
  const run = moduleWithTelegram({ ok: false });
  await assert.rejects(run.module.verifyFH3ProofGroup!(-1001888001111), /belum bisa mengakses/);
});
