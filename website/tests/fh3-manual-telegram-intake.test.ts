import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as parser from "../lib/fh3ManualTelegram";

type Intake = { captureManualFH3Telegram: (update: unknown, service: unknown) => Promise<boolean> };
function load<T>(file: string, mocks: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, Request, Response, Buffer, AbortSignal, Error, SyntaxError,
    process: { env: { TELEGRAM_BOT_TOKEN: "fixture-token" } },
    require: (name: string) => { assert.ok(name in mocks, `Unexpected module ${name}`); return mocks[name]; },
    ...extra,
  });
  return exports as T;
}
const message = (patch: Record<string, unknown> = {}) => ({
  message_id:42,date:1792555200,from:{id:22},chat:{id:-100123,type:"supergroup"},
  photo:[{file_id:"photo-fixture"}],caption:"X4519\nGame: aion2\nDiscord Server: FH3 Demo\nTask: Farm XP\nPass: fixture password",...patch,
});
function harness(status = "administrator", boundChat = -100123, pinnedSender: number | null = null, username = "evogamings") {
  const calls: {name:string;args:Record<string,unknown>}[] = [];
  let memberships = 0, groupChecks = 0;
  const service = {
    from: (name: string) => {
      assert.equal(name,"cp_payroll_telegram_divisions");
      const q = {select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{chat_id:boundChat,fh3_order_sender_id:pinnedSender}})};
      return q;
    },
    rpc: async (name: string, args: Record<string,unknown>) => {calls.push({name,args}); return {data:true};},
  };
  const intake = load<Intake>("lib/fh3ManualTelegramIntake.ts", {
    "server-only":{}, "@/lib/fh3ManualTelegram":parser,
    "@/lib/payrollMobileProof":{verifyFH3ProofGroup:async(id:number)=>{assert.equal(id,-100123);groupChecks++;}},
  }, {fetch:async(_url:string,options:{body:string})=>{
    memberships++;
    assert.deepEqual(JSON.parse(options.body),{chat_id:-100123,user_id:22});
    return Response.json({ok:true,result:{status,user:{id:22,username}}});
  }});
  return {service,intake,calls,get memberships(){return memberships;},get groupChecks(){return groupChecks;}};
}

test("verified admin caption stores only operational fields after group and role verification", async () => {
  const h=harness();
  assert.equal(await h.intake.captureManualFH3Telegram({update_id:10,message:message()},h.service),true);
  assert.equal(h.memberships,1);assert.equal(h.groupChecks,1);
  assert.equal(h.calls[0].name,"cp_fh3_telegram_save_manual_with_discord");
  assert.equal(h.calls[0].args.p_discord,"FH3 Demo");
  assert.equal(h.calls[0].args.p_order_ref,"X4519");
  assert.equal(h.calls[0].args.p_task,"Farm XP");
  assert.equal(h.calls[0].args.p_active,true);
  assert.equal(h.calls[0].args.p_sender_username,"evogamings");
  assert.doesNotMatch(JSON.stringify(h.calls),/fixture password|photo-fixture|caption|file_id/);
});

test("only @evogamings can establish the pin; other admins and reused usernames cannot replace it", async () => {
  for (const username of ["another_admin", "", "evogamings_clone"]) {
    const h=harness("administrator",-100123,null,username);
    await h.intake.captureManualFH3Telegram({update_id:10,message:message({from:{id:22,first_name:"Adm EVO Gaming"}})},h.service);
    assert.equal(h.calls.length,0,"display name is never identity");
  }
  const takeover=harness("administrator",-100123,23,"evogamings");
  await takeover.intake.captureManualFH3Telegram({update_id:10,message:message()},takeover.service);
  assert.equal(takeover.calls.length,0,"same username cannot change the pinned numeric identity");
  const renamed=harness("administrator",-100123,22,"renamed_account");
  await renamed.intake.captureManualFH3Telegram({update_id:10,message:message()},renamed.service);
  assert.equal(renamed.calls.length,1,"the original numeric identity survives a username change");
});

test("members, bots, forwarded or anonymous posts and foreign groups never create receipts", async () => {
  const member=harness("member");
  assert.equal(await member.intake.captureManualFH3Telegram({update_id:10,message:message()},member.service),true);
  assert.equal(member.calls.length,0);
  for(const patch of [{from:{id:22,is_bot:true}},{sender_chat:{id:-100123}},
    {forward_origin:{type:"user"}},{chat:{id:123,type:"private"}}]) {
    const h=harness();
    await h.intake.captureManualFH3Telegram({update_id:10,message:message(patch)},h.service);
    assert.equal(h.calls.length,0);assert.equal(h.memberships,0);
  }
  const foreign=harness("administrator",-100999);
  assert.equal(await foreign.intake.captureManualFH3Telegram({update_id:10,message:message()},foreign.service),false);
  assert.equal(foreign.calls.length,0);assert.equal(foreign.memberships,0);
});

test("admin photos without TASK are preserved; invalid edits and cancel commands invalidate receipts", async () => {
  const h=harness("administrator",-100123,22);
  assert.equal(await h.intake.captureManualFH3Telegram({update_id:10,message:message({caption:"Order details in photo"})},h.service),true);
  assert.equal(h.calls.length,0);
  await h.intake.captureManualFH3Telegram({update_id:11,edited_message:message({caption:"X4519\nTask:",edit_date:1792555201})},h.service);
  assert.equal(h.calls[0].args.p_order_ref,null);assert.equal(h.calls[0].args.p_active,false);
  await h.intake.captureManualFH3Telegram({update_id:12,message:message({caption:undefined,text:"/fh3_cancel X4519"})},h.service);
  assert.equal(h.calls[1].args.p_order_ref,"X4519");assert.equal(h.calls[1].args.p_active,false);
  const unpinned=harness();
  await unpinned.intake.captureManualFH3Telegram({update_id:12,message:message({caption:undefined,text:"/fh3_cancel X4519"})},unpinned.service);
  assert.equal(unpinned.calls.length,0,"cancellation cannot establish the sender pin");
});

test("webhook authenticates first and consumes admin photos without legacy deletion or financial writes", async () => {
  const h=harness();
  let reads=0;
  const forbidden=()=>{throw new Error("Legacy workflow must not run for admin order photo");};
  const route=load<{POST:(request:Request)=>Promise<Response>}>("app/api/integrations/telegram/payroll/route.ts", {
    "node:crypto":{timingSafeEqual},
    "@/lib/serverSupabase":{createSupabaseAdmin:()=>{reads++;return h.service;}},
    "@/lib/fh3ManualTelegramIntake":h.intake,
    "@/lib/payrollTelegramProtocol":{parsePayrollTelegramUpdate:forbidden},
    "@/lib/payrollTelegram":{telegramWebhookSecret:()=>"fixture-webhook-secret",telegramDeleteMessage:forbidden,
      flushPayrollTelegramOutbox:forbidden},
  });
  const req=(auth:string)=>new Request("https://example.test/webhook",{method:"POST",
    headers:{"x-telegram-bot-api-secret-token":auth},body:JSON.stringify({update_id:10,message:message()})});
  assert.equal((await route.POST(req("wrong"))).status,401);assert.equal(reads,0);
  assert.equal((await route.POST(req("fixture-webhook-secret"))).status,200);
  assert.equal(h.calls.length,1);
});
