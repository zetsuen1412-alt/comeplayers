import {test} from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {matchesBuyerMessage,parseMessageMeta,parseIdAllowlist} from "../lib/monitorDiscordBuyerAlerts";
const meta={messageId:"1461111111111111111",guildId:"1451111111111111111",
 channelId:"1452222222222222222",authorId:"1453333333333333333",
 username:"Toasty",globalName:"Toasty",serverNick:"",bot:false};
const bind={order_ref:"X4759",guild_id:meta.guildId,channel_id:meta.channelId,buyer_user_id:meta.authorId,enabled:true};
const env={MONITOR_DISCORD_GUILD_IDS:meta.guildId,MONITOR_DISCORD_INTERNAL_USER_IDS:"",MONITOR_DISCORD_RELAY_SECRET:"test-only-fake-key-01234567890123456789"};
function load(path:string,mocks:Record<string,unknown>) {
 const exports:Record<string,(...args:unknown[])=>Promise<Response>>={};
 runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),"utf8"),{
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
 }).outputText,{exports,Response,Request,Buffer,URL,Date,process:{env},
    require:(name:string)=>{assert.ok(name in mocks,name);return mocks[name];}});
 return exports;
}
function signed(payload:unknown,key=env.MONITOR_DISCORD_RELAY_SECRET){
 const body=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000));
 const signature=createHmac("sha256",key).update(timestamp+"."+body).digest("hex");
 return new Request("https://test/api/integrations/discord/fh3-message",{
   method:"POST",headers:{"x-cp-discord-timestamp":timestamp,"x-cp-discord-signature":signature},body,
 });
}
test("Discord Gateway relay validates signature, binds only verified FH3 customer and stores IDs only",async()=>{
 let writes=0,mutations:unknown[]=[];
 const service={from:(name:string)=>({
  select:()=>({eq:()=>({eq:()=>({eq:()=>({eq:()=>({limit:async()=>({data:[bind]})})})})})}),
  upsert:async(rows:unknown)=>{assert.equal(name,"cp_fh3_discord_alert_events");writes++;mutations=rows as unknown[];return {error:null};},
 })};
 const route=load("app/api/integrations/discord/fh3-message/route.ts",{
  "node:crypto":await import("node:crypto"),
  "@/lib/serverSupabase":{createSupabaseAdmin:()=>service},
  "@/lib/fh3ManualTelegramQueue":{loadFH3ManualOrders:async()=>new Map([["X4759",{active:true}]])},
  "@/lib/fh3MonitorJobs":{loadFH3MonitorJobs:async()=>new Map()},
  "@/lib/monitorManagement":{loadMonitorControls:async()=>new Map()},
  "@/lib/monitorDiscordBuyerAlerts":{matchesBuyerMessage,parseIdAllowlist,parseMessageMeta},
 });
 const bad=await route.POST(new Request("https://test",{method:"POST",body:JSON.stringify(meta)}));
 assert.equal(bad.status,401);assert.equal(writes,0);
 const ok=await route.POST(signed(meta));assert.equal(ok.status,200);
 assert.equal((await ok.json()).accepted,1);assert.equal(writes,1);
 assert.deepEqual(Object.keys((mutations as Record<string,unknown>[])[0]).sort(),
  ["message_id","order_ref","guild_id","channel_id"].sort());
 const evo=await route.POST(signed({...meta,username:"EVOBOOSTER3"}));
 assert.equal((await evo.json()).accepted,0);assert.equal(writes,1);
 const stranger=await route.POST(signed({...meta,channelId:"1459999999999999999"}));
 assert.equal((await stranger.json()).accepted,0);assert.equal(writes,1);
});
test("Android and Windows contract source requires explicit Discord metadata namespace",()=>{
 const source=readFileSync(new URL("../../CP-BoostMonitor-Windows/PayrollApi.cs",import.meta.url),"utf8");
 assert.match(source,/discord_buyer_metadata/);
 const android=readFileSync(new URL("../../CP-BoostMonitor-Android/app/src/main/java/id/comeplayers/boostmonitor/OrderNotificationService.java",import.meta.url),"utf8");
 assert.match(android,/seen_discord_/);
});
test("Additive migration cannot grant employees raw Discord events or touch Payroll tables",()=>{
 const sql=readFileSync(new URL("../supabase/migrations/20261025160001_fh3_discord_buyer_alerts.sql",import.meta.url),"utf8");
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all[\s\S]*from public,anon,authenticated,service_role/);
 assert.ok(!/\b(update|delete from|truncate|alter table)\s+(?:public\.)?(?:cp_payroll_workspace|cp_fh3_monitor_closings|cp_fh3_monitor_closing_items)\b/i.test(sql));
});
