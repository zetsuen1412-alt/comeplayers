import { requireOwnEmployee } from "../lib/monitorAccess";
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
      if (name === "@/lib/monitorAccess") return {
        requireOwnEmployee, requireMonitorAccess: async () => {
          const actor = access();
          return { actor, employeeCode:(actor as {employeeCode?:string}).employeeCode ?? "", supabaseAdmin: { rpc } };
        },
      };
      if (name === "@/lib/adminSecurity") return { adminErrorStatus: (error: { status?: number }) => error.status ?? 500 };
      if (name === "@/lib/payrollMobileProof") return {
        isSupportedProofImage: () => true,
        MobileTelegramError: TransportError,
        sendMobileProofPhoto: telegram,
        verifyFH3ProofGroup: async (chatId: number) => {
          assert.ok(Number.isSafeInteger(chatId) && chatId < 0);
          return "🔥 EVO🔥 Ilham FH3";
        },
      };
      throw new Error("Unexpected import: " + name);
    },
  });
  return exports.POST!;
}
function formRequest(action = "start", extra: Record<string,string> = {}) {
  const form = new FormData();
  form.set("orderRef", "X4671");
  form.set("employeeCode", "F001");
  form.set("action", action);
  for (const [key,value] of Object.entries(extra)) form.set(key,value);
  // Node's File is structurally incompatible with DOM Blob in TypeScript 5.9,
  // even though the same object is accepted by Node FormData at runtime.
  const file = new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0])],
    "proof.png", { type: "image/png" });
  form.set("photo", file as unknown as Blob, "proof.png");
  return new Request("https://www.comeplayers.com/api/admin/payroll/mobile/progress",
    { method: "POST", body: form });
}

test("unbound employee cannot upload to Telegram", async () => {
  const send = endpoint(() => ({ isAdmin: false }), async () => {
    throw new Error("RPC should not run");
  }, async () => { throw new Error("Telegram should not run"); });
  assert.equal((await send(formRequest())).status, 403);
});

test("bound employee can confirm own proof without gaining admin permissions", async () => {
  let claimed=false;
  const send=endpoint(()=>({id:"staff-1",isAdmin:false,employeeCode:"F001"}),async(name,args)=>{
    assert.equal(name,"cp_mobile_proof_begin");assert.equal(args.p_actor_id,"staff-1");assert.equal(args.p_employee_code,"F001");
    claimed=true;return {data:{alreadySent:true,caption:"x4671/adit/start",chatTitle:"FH3"}};
  },async()=>{throw new Error("Already sent proof must not be reposted");});
  assert.equal((await send(formRequest())).status,200);assert.equal(claimed,true);
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

const cycle="00000000-0000-4000-8000-000000000001";
for(const action of ["start","pause","continue","done"]){
 test(`daily ${action} uses the reviewed day and server caption without legacy completion`,async()=>{
  const calls:string[]=[];let sent=0;
  const send=endpoint(()=>({isAdmin:true,id:"daily-actor"}),async(name,args)=>{
   calls.push(name);
   if(name==="cp_monitor_daily_begin"){
    assert.equal(args.p_day,2);assert.equal(args.p_revision,4);assert.equal(args.p_cycle,cycle);assert.equal(args.p_action,action);
    return {data:{ok:true,eventId:"daily-id",chatId:-100123,caption:`x4671/adit/day2/${action}`,replyToMessageId:77}};
   }
   assert.equal(name,"cp_monitor_daily_finish");assert.equal(args.p_message_id,123);
   return {data:{ok:true,status:action==="done"?"assigned":"in_progress",completedDays:action==="done"?2:1,totalDays:7}};
  },async input=>{sent++;assert.equal(input.caption,`x4671/adit/day2/${action}`);assert.equal(input.chatId,-100123);return {messageId:123,fileId:"photo"};});
  const response=await send(formRequest(action,{dayNumber:"2",dailyRevision:"4",dailyCycleId:cycle,caption:"spoof/day7/done",chatId:"999"}));
  assert.equal(response.status,200);assert.equal(sent,1);assert.equal((await response.json()).totalDays,7);
  assert.deepEqual(calls,["cp_monitor_daily_begin","cp_monitor_daily_finish"]);
 });
}
test("malformed or incomplete daily metadata never claims a report",async()=>{
 const send=endpoint(()=>({isAdmin:true}),async()=>{throw new Error("Claim must not run");},async()=>{throw new Error("No Telegram");});
 const invalid:Record<string,string>[]=[{dayNumber:"0",dailyRevision:"1",dailyCycleId:cycle},{dayNumber:"367",dailyRevision:"1",dailyCycleId:cycle},
  {dayNumber:"2"},{dayNumber:"2",dailyRevision:"-1",dailyCycleId:cycle}];
 for(const fields of invalid)
  assert.equal((await send(formRequest("done",fields))).status,409);
});
test("ambiguous daily DONE is marked unknown and is not replayed or committed",async()=>{
 const calls:string[]=[];
 const send=endpoint(()=>({isAdmin:true,id:"daily-actor"}),async(name,args)=>{
  calls.push(name);
  if(name==="cp_monitor_daily_begin")return {data:{ok:true,eventId:"daily-id",chatId:-100123,caption:"x4671/adit/day2/done"}};
  assert.equal(name,"cp_monitor_daily_mark");assert.equal(args.p_status,"unknown");return {data:true};
 },async()=>{throw new TransportError("Network uncertain","unknown");});
 assert.equal((await send(formRequest("done",{dayNumber:"2",dailyRevision:"4",dailyCycleId:cycle}))).status,409);
 assert.deepEqual(calls,["cp_monitor_daily_begin","cp_monitor_daily_mark"]);
});
for(const action of ["pause","continue"]){
  test(`${action} photo uses a versioned START cycle and confirmed Telegram result`,async()=>{
    const calls:string[]=[];let sent=0;
    const send=endpoint(()=>({isAdmin:true,id:"valid-actor"}),async(name,args)=>{
      calls.push(name);
      if(name==="cp_monitor_pause_begin"){
        assert.equal(args.p_start_event_id,cycle);assert.equal(args.p_revision,2);assert.equal(args.p_action,action);
        return {data:{ok:true,eventId:"pause-id",chatId:-100123,caption:`x4671/adit/${action}`,replyToMessageId:77}};
      }
      assert.equal(name,"cp_monitor_pause_finish");assert.equal(args.p_message_id,123);
      return {data:{ok:true,status:action==="pause"?"paused":"in_progress",pauseRevision:3}};
    },async input=>{sent++;assert.equal(input.chatId,-100123);assert.equal(input.replyToMessageId,77);return {messageId:123,fileId:"proof"};});
    const response=await send(formRequest(action,{startEventId:cycle,pauseRevision:"2"}));
    assert.equal(response.status,200);assert.equal((await response.json()).pauseRevision,3);assert.equal(sent,1);
    assert.deepEqual(calls,["cp_monitor_pause_begin","cp_monitor_pause_finish"]);
  });
}
test("missing or malformed PAUSE cycle/version never claims or sends Telegram",async()=>{
  const send=endpoint(()=>({isAdmin:true,id:"valid-actor"}),async()=>{throw new Error("No RPC expected");},async()=>{throw new Error("No send expected");});
  const invalid:Record<string,string>[]=[{},{startEventId:cycle,pauseRevision:"-1"},{startEventId:"invalid",pauseRevision:"0"},{startEventId:cycle,pauseRevision:"1000001"}];
  for(const extra of invalid)
    assert.equal((await send(formRequest("pause",extra))).status,409);
});
test("ambiguous PAUSE delivery remains unknown and cannot advance status",async()=>{
  const calls:string[]=[];
  const send=endpoint(()=>({isAdmin:true,id:"valid-actor"}),async(name,args)=>{
    calls.push(name);
    if(name==="cp_monitor_pause_begin")return {data:{ok:true,eventId:"pause-id",chatId:-100123,caption:"x4671/adit/pause"}};
    assert.equal(name,"cp_monitor_pause_mark");assert.equal(args.p_status,"unknown");return {data:true};
  },async()=>{throw new TransportError("Timeout","unknown");});
  const response=await send(formRequest("pause",{startEventId:cycle,pauseRevision:"0"}));assert.equal(response.status,409);
  assert.equal((await response.json()).uncertain,true);assert.deepEqual(calls,["cp_monitor_pause_begin","cp_monitor_pause_mark"]);
});
