import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { monitorDuration, dailyWorkflow } from "../lib/monitorDuration";

const files=["20260926030000_payroll_telegram_operations.sql","20260926030001_payroll_telegram_durable_workflow.sql",
 "20260926030002_payroll_telegram_leader_dispatch.sql","20260926035622_payroll_telegram_item_workflow.sql",
 "20260926041704_payroll_telegram_strict_division_routing.sql","20261006060224_payroll_website_archive_telegram_guard.sql",
 "20261018090000_payroll_telegram_buyer_snapshot.sql","20261019220000_cp_boost_monitor_mobile_assignment.sql",
 "20261019220001_cp_boost_monitor_direct_fh3_routing.sql","20261019220002_cp_boost_monitor_mobile_telegram_proof.sql",
 "20261020140000_fh3_take_before_photo_start.sql","20261022002214_fh3_monitor_source_guards.sql",
 "20261022070000_fh3_manual_telegram_intake.sql","20261022093000_fh3_monitor_delivery_consistency.sql",
 "20261022100000_fh3_monitor_operational_jobs.sql","20261022103000_fh3_monitor_job_permissions.sql",
 "20261022103001_fh3_monitor_discord.sql","20261024034347_fh3_monitor_accounts_closing.sql",
 "20261025141943_fh3_monitor_shared_workstations.sql","20261026110043_fh3_monitor_pause_continue.sql",
 "20261026172128_fh3_monitor_daily_duration.sql"];
const admin="e120c2e4-99bb-42b0-9d08-a8e71ebef76a",shared="e120c2e4-99bb-42b0-9d08-a8e71ebef76b",personal="e120c2e4-99bb-42b0-9d08-a8e71ebef76c";
const cases:[string,number|null,number|null,boolean][]=[
 ["8hours x7",7,8,false],["8 hours/day x 7 days",7,8,false],["8H × 7",7,8,false],
 ["8hoursx7",7,8,false],["8hx7",7,8,false],["8hours x1week",7,8,false],["8h x1month",30,8,false],
 ["48H",2,24,false],["72 hours",3,24,false],["36H",null,null,true],
 ["1 Week 8 Hours/Day",7,8,false],["7 days (8 hours/day)",7,8,false],["12 jam x30",30,12,false],
 ["1 month",30,null,false],["sebulan",30,null,false],["seminggu",7,null,false],["2 minggu 4 jam/hari",14,4,false],
 ["2 months 8 hours/day",60,8,false],["2 days",2,null,false],["1 hari",1,null,false],["12H",1,null,false],
 ["",1,null,false],["lifetime",1,null,false],["8hours x7 2 weeks",null,null,true],["8h x0",null,null,true],
 ["8h x999",null,null,true],["8h x7.5",null,null,true],["25h x7",null,null,true],["8h 12h x7",null,null,true],
 ["8-12 hours x7",null,null,true],["1.5 weeks",null,null,true],["7 days 8,5 hours/day",7,8.5,false],
];
test("Duration parser identifies explicit daily, weekly and 30-day monthly schedules without reading TASK",()=>{
 for(const[text,days,hours,review]of cases){const p=monitorDuration(text);assert.equal(p.totalDays,days,text);assert.equal(p.hoursPerDay,hours,text);assert.equal(p.durationNeedsReview,review,text);}
 assert.equal(monitorDuration("8hours x7").durationDisplay,"8 jam × 7 hari");
 const state={order_ref:"X500",duration:"8hours x7",total_days:7,hours_per_day:8,completed_days:1,revision:2,cycle_id:admin,phase:"waiting" as const,uncertain:false};
 assert.equal(dailyWorkflow(state,true,true).dayNumber,2);assert.equal(dailyWorkflow(state,true,true).canStart,true);
 assert.equal(dailyWorkflow({...state,uncertain:true},true,true).canStart,false);
 assert.equal(dailyWorkflow({...state,phase:"paused"},true,true).canDone,false);
 assert.equal(dailyWorkflow(state,true,false).canStart,false);
});

test("daily journal enforces day1..7/day30, confirmed photos, transfers, legacy guards and immutable Payroll",async()=>{
 const db=new PGlite();let message=800;
 type Claim={eventId:string;caption:string;alreadySent?:boolean;replyToMessageId:number};
 type State={order_ref:string;duration:string;total_days:number;hours_per_day:number|null;completed_days:number;revision:number;cycle_id:string;phase:string;uncertain:boolean};
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   alter default privileges in schema public grant all on tables to service_role;
   create table profiles(id uuid primary key,role text,username text,email text);
   create schema auth;create table auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz);
   create table cp_payroll_workspace(id int primary key,payload jsonb,revision bigint default 0,updated_at timestamptz default now());
   insert into cp_payroll_workspace(id,payload) values(1,'{}');`);
  for(const file of files.slice(0,-1))await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),"utf8"));
  const payload={"cp-ofs-demo-user-orders-v3":[{id:"sale:X701",externalReference:"X701",team:"FH3",orderType:"boosting",operationalStatus:"assignment_pending",workerAssignments:[],quantity:1,financeStatus:"pending"}],
   "cp-ofs-demo-employees-v2":[{id:"e1",code:"F001",name:"Adit",team:"FH3",workforceStatus:"SHIFT"},{id:"e2",code:"F002",name:"Budi",team:"FH3",workforceStatus:"FULL"}],
   "cp-ofs-demo-closing-v1":[{id:"legacy-closing",net:250000}],salaries:[{id:"salary",amount:999000}]};
  await db.query("update cp_payroll_workspace set payload=$1::jsonb where id=1",[JSON.stringify(payload)]);
  for(const[id,role,name]of[[admin,"admin","owner"],[shared,"buyer","shared"],[personal,"buyer","adit"]])await db.query("insert into profiles values($1,$2,$3,$4)",[id,role,name,`${name}@example.test`]);
  await db.query("select cp_monitor_set_account_scope($1,$2,'shared',null,true)",[admin,shared]);
  await db.query("select cp_monitor_bind_account($1,$2,'F001',true)",[admin,personal]);
  const snapshot=async()=>(await db.query<{v:unknown}>("select to_jsonb(w) v from cp_payroll_workspace w")).rows[0].v;
  const before=await snapshot();await db.exec(readFileSync(new URL(`../supabase/migrations/${files.at(-1)}`,import.meta.url),"utf8"));
  assert.deepEqual(await snapshot(),before,"additive migration does not rewrite existing data");
  for(const[text,days,hours,review]of cases){
   const p=(await db.query<{v:{totalDays:number|null;hoursPerDay:number|null;durationNeedsReview:boolean}}>("select cp_monitor_duration($1) v",[text])).rows[0].v;
   assert.deepEqual(p,{totalDays:days,hoursPerDay:hours,daily:!review&&(days??0)>1,durationNeedsReview:review},text);
  }
  await db.exec("insert into cp_payroll_telegram_divisions(division,chat_id,chat_title) values('FH3',-100123,'EVO Ilham FH3')");
  const receipt=async(ref:string,duration:string)=>db.query("select cp_fh3_telegram_save_manual($1,-100123,$2,22,'AION','', $3,'Task',now(),now(),$4,true,'evogamings')",[ref,message++,duration,message++]);
  const take=async(ref:string,code="F001")=>{
   await db.query("select cp_mobile_assign_fh3($1,$2,$3)",[ref,code,shared]);
   const c=(await db.query<{v:Claim}>("select cp_mobile_take_begin($1,$2,$3) v",[ref,code,shared])).rows[0].v;
   await db.query("select cp_mobile_take_finish($1,$2,$3)",[c.eventId,shared,message++]);return c;
  };
  const state=async(ref:string)=>(await db.query<State>("select * from cp_monitor_daily_states(array[$1])",[ref])).rows[0];
  const claim=async(ref:string,action:string,s:State,code="F001",actor=shared)=>(await db.query<{v:Claim}>("select cp_monitor_daily_begin($1,$2,$3,$4,$5,$6,$7) v",[ref,code,action,actor,s.completed_days+1,s.revision,s.cycle_id])).rows[0].v;
  const finish=async(c:Claim)=>(await db.query<{v:{status:string}}>("select cp_monitor_daily_finish($1,$2,$3,'fixture-image') v",[c.eventId,shared,message++])).rows[0].v;
  const manage=async(ref:string,action:string,employee:string|null=null,wage:number|null=null)=>{
   const version=(await db.query<{v:number}>("select coalesce((select version from cp_fh3_monitor_controls where order_ref=$1),0) v",[ref])).rows[0].v;
   return db.query("select cp_monitor_manage_order($1,$2,$3,$4,'Fixture reason',null,$5,$6)",[admin,ref,version,action,wage,employee]);
  };
  for(const[ref,duration,total]of[["X700","8hours x7",7],["X701","sebulan",30]] as const){
   await receipt(ref,duration);await take(ref);
   assert.equal((await state(ref)).total_days,total);
   await assert.rejects(db.query("select cp_mobile_proof_begin($1,'F001','done',$2)",[ref,shared]),/aplikasi terbaru/);
   for(let day=1;day<=total;day++){
    let s=await state(ref);assert.equal(s.completed_days,day-1);assert.equal(s.phase,"waiting");
    await assert.rejects(claim(ref,"done",s),/Urutan/);
    await assert.rejects(claim(ref,"start",s,"F002",personal),/ditolak/);
    const start=await claim(ref,"start",s);assert.equal(start.caption,`${ref.toLowerCase()}/adit/day${day}/start`);
    assert.equal((await state(ref)).uncertain,true);await assert.rejects(claim(ref,"start",s),/belum pasti/);
    await finish(start);assert.equal((await claim(ref,"start",s)).alreadySent,true);
    if(day===1){
     s=await state(ref);let p=await claim(ref,"pause",s);await finish(p);assert.equal((await state(ref)).phase,"paused");
     await assert.rejects(claim(ref,"done",await state(ref)),/Urutan/);
     p=await claim(ref,"continue",await state(ref));await finish(p);
    }
    s=await state(ref);const done=await claim(ref,"done",s);assert.equal(done.caption,`${ref.toLowerCase()}/adit/day${day}/done`);
    const result=await finish(done);assert.equal(result.status,day===total?"completed":"assigned");
    assert.equal((await claim(ref,"done",s)).alreadySent,true,"replaying an old day cannot advance the next day");
    if(day<total){
     assert.equal((await db.query("select * from cp_mobile_order_proof where order_ref=$1 and action='done'",[ref])).rows.length,0);
     await assert.rejects(manage(ref,"price",null,100000),/DONE/);
    }
   }
   assert.equal((await state(ref)).phase,"completed");
   assert.equal((await db.query("select * from cp_mobile_order_proof where order_ref=$1 and action='done' and status='sent'",[ref])).rows.length,1);
   await manage(ref,"price",null,100000);
  }
  const eligible=(await db.query<{v:unknown}>("select jsonb_agg(jsonb_build_object('orderRef',order_ref,'version',version,'wageRupiah',wage_rupiah) order by order_ref) v from cp_fh3_monitor_controls where order_ref in ('X700','X701')")).rows[0].v;
  const closing=(await db.query<{v:{orderCount:number;totalRupiah:number}}>("select cp_monitor_close_book($1,$2,'Daily fixture closing',$3::jsonb) v",[admin,"00000000-0000-4000-8000-000000000077",JSON.stringify(eligible)])).rows[0].v;
  assert.equal(closing.orderCount,2);assert.equal(closing.totalRupiah,200000,"one order wage is not multiplied by its number of days");
  assert.equal((await db.query("select * from cp_fh3_monitor_closing_items")).rows.length,2);
  assert.deepEqual(await snapshot(),before,"all daily work, including linked sales, leaves Payroll salaries and Closing unchanged");
  await receipt("X702","8h x3");await take("X702");
  await finish(await claim("X702","start",await state("X702")));await finish(await claim("X702","done",await state("X702")));
  const old=await state("X702");let c=await claim("X702","start",old);
  await db.query("select cp_monitor_daily_mark($1,$2,'failed')",[c.eventId,shared]);
  assert.equal((await claim("X702","start",old)).eventId,c.eventId);await finish(c);
  await manage("X702","transfer","F002");await take("X702","F002");
  const moved=await state("X702");assert.equal(moved.completed_days,1);assert.notEqual(moved.cycle_id,old.cycle_id);
  await assert.rejects(claim("X702","start",old,"F002"),/Penugasan berubah/);
  c=await claim("X702","start",moved,"F002");assert.equal(c.caption,"x702/budi/day2/start");
  await db.query("select cp_monitor_daily_mark($1,$2,'unknown')",[c.eventId,shared]);
  await assert.rejects(claim("X702","start",moved,"F002"),/belum pasti/);
  await assert.rejects(manage("X702","archive"),/belum pasti/);await assert.rejects(manage("X702","transfer","F001"),/belum pasti/);
  assert.equal((await db.query("select * from cp_monitor_daily_events where order_ref='X702' and day_no=1 and action='done' and status='sent'")).rows.length,1,"history remains with its original worker after transfer");
  await receipt("X703","12H");await take("X703");assert.equal(await state("X703"),undefined);
  const ordinary=(await db.query<{v:Claim}>("select cp_mobile_proof_begin('X703','F001','start',$1) v",[shared])).rows[0].v;
  assert.equal(ordinary.caption,"x703/adit/start","single-day captions stay compatible");
  await receipt("X704","8h x7");await manage("X704","transfer","F001");
  assert.equal((await state("X704")).total_days,7,"admin assigning a future queue item also freezes its daily plan");
  await take("X704");const competing=await state("X704");
  const concurrent=await Promise.allSettled([claim("X704","start",competing),claim("X704","start",competing)]);
  assert.equal(concurrent.filter(r=>r.status==="fulfilled").length,1,"two computers cannot claim a second daily photo while one is sending");
  assert.equal(concurrent.filter(r=>r.status==="rejected").length,1);
  for(const role of["anon","authenticated"]){
   for(const table of["cp_monitor_daily_plans","cp_monitor_daily_events"])
    assert.equal((await db.query<{ok:boolean}>("select has_table_privilege($1,$2,'SELECT') ok",[role,table])).rows[0].ok,false);
   assert.equal((await db.query<{ok:boolean}>("select has_function_privilege($1,'cp_monitor_daily_begin(text,text,text,uuid,integer,bigint,uuid)','EXECUTE') ok",[role])).rows[0].ok,false);
  }
  assert.equal((await db.query<{ok:boolean}>("select has_table_privilege('service_role','cp_monitor_daily_events','INSERT') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
