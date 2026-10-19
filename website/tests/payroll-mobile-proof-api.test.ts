import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { File } from "node:buffer";
import ts from "typescript";

class TransportError extends Error {
  constructor(message: string, readonly outcome: "failed" | "unknown") { super(message); }
}

const source = readFileSync(new URL("../app/api/admin/payroll/mobile/progress/route.ts", import.meta.url), "utf8");
function endpoint(access: () => unknown, rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>,
    telegram: (input: Record<string, unknown>) => Promise<unknown>) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { POST?: (request: Request) => Promise<Response> } = {};
  runInNewContext(compiled, {
    exports, Request, Response, File, Blob, Uint8Array, Number, Error,
    require: (name: string) => {
      if (name === "@/lib/payrollAccess") return {
        requirePayrollAccess: async () => {
          const actor = access();
          return { actor, supabaseAdmin: { rpc } };
        },
      };
      if (name === "@/lib/adminSecurity") return { adminErrorStatus: (error: { status?: number }) => error.status ?? 500 };
      if (name === "@/lib/payrollMobileProof") return {
        isSupportedProofImage: () => true,
        MobileTelegramError: TransportError,
        sendMobileProofPhoto: telegram,
      };
      throw new Error("Unexpected import: " + name);
    },
  });
  return exports.POST!;
}
function formRequest(action = "start") {
  const form = new FormData();
  form.set("orderRef", "X4671");
  form.set("employeeCode", "F001");
  form.set("action", action);
  form.set("photo", new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0])],
    "proof.png", { type: "image/png" }));
  return new Request("https://www.comeplayers.com/api/admin/payroll/mobile/progress",
    { method: "POST", body: form });
}

test("non-admin cannot upload to Telegram", async () => {
  const send = endpoint(() => ({ isAdmin: false }), async () => {
    throw new Error("RPC should not run");
  }, async () => { throw new Error("Telegram should not run"); });
  assert.equal((await send(formRequest())).status, 403);
});

test("START proof uses server-selected chat, not a client-provided Telegram group", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let outgoing: Record<string, unknown> | undefined;
  const send = endpoint(() => ({ isAdmin: true, id: "valid-actor" }),
    async (name, args) => {
      calls.push({ name, args });
      if (name === "cp_mobile_proof_begin") return { data: {
        ok: true, alreadySent: false, eventId: "claim-id", chatId: -123456,
        caption: "x4671/mulyana/start", replyToMessageId: 99,
      }, error: null };
      if (name === "cp_mobile_proof_finish") return { data: {
        ok: true, caption: "x4671/mulyana/start", status: "in_progress",
      }, error: null };
      throw new Error("Wrong RPC " + name);
    },
    async input => { outgoing = input; return { messageId: 101, fileId: "file-from-Telegram" }; });
  const response = await send(formRequest());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "in_progress");
  assert.equal(outgoing?.chatId, -123456);
  assert.equal(outgoing?.replyToMessageId, 99);
  assert.equal(outgoing?.caption, "x4671/mulyana/start");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].name, "cp_mobile_proof_begin");
  assert.equal(calls[0].args.p_actor_id, "valid-actor");
  assert.equal(calls[1].args.p_file_id, "file-from-Telegram");
});

test("Telegram rejection does not mutate Payroll and marks proof failed", async () => {
  const calls: string[] = [];
  const send = endpoint(() => ({ isAdmin: true, id: "valid-actor" }),
    async (name) => {
      calls.push(name);
      if (name === "cp_mobile_proof_begin") return { data: {
        ok: true, alreadySent: false, eventId: "claim-id", chatId: -100,
        caption: "x4671/mulyana/start",
      }, error: null };
      if (name === "cp_mobile_proof_mark") return { data: true, error: null };
      throw new Error("Unexpected RPC " + name);
    },
    async () => { throw new TransportError("Bot failed", "failed"); });
  const response = await send(formRequest());
  assert.equal(response.status, 502);
  assert.deepEqual(calls, ["cp_mobile_proof_begin", "cp_mobile_proof_mark"]);
});
