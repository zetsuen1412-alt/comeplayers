import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrations=["20260926030000_payroll_telegram_operations.sql","20260926030001_payroll_telegram_durable_workflow.sql",
 "20260926030002_payroll_telegram_leader_dispatch.sql","20260926035622_payroll_telegram_item_workflow.sql",
 "20260926041704_payroll_telegram_strict_division_routing.sql","20261006060224_payroll_website_archive_telegram_guard.sql",
 "20261018090000_payroll_telegram_buyer_snapshot.sql","20261019220000_cp_boost_monitor_mobile_assignment.sql",
 "20261019220001_cp_boost_monitor_direct_fh3_routing.sql","20261019220002_cp_boost_monitor_mobile_telegram_proof.sql",
 "20261020140000_fh3_take_before_photo_start.sql","20261022002214_fh3_monitor_source_guards.sql",
 "20261022070000_fh3_manual_telegram_intake.sql","20261022093000_fh3_monitor_delivery_consistency.sql",
 "20261022100000_fh3_monitor_operational_jobs.sql","20261022103000_fh3_monitor_job_permissions.sql",
 "20261022103001_fh3_monitor_discord.sql","20261024034347_fh3_monitor_accounts_closing.sql",
 "20261025141943_fh3_monitor_shared_workstations.sql","20261026110043_fh3_monitor_pause_continue.sql"];
const admin="e120c2e4-99bb-42b0-9d08-a8e71ebef76a",shared="e120c2e4-99bb-42b0-9d08-a8e71ebef76b",personal="e120c2e4-99bb-42b0-9d08-a8e71ebef76c";
type Claim={eventId:string;alreadySent?:boolean;caption:string;replyToMessageId:number};
type State={order_ref:string;start_event_id:string;revision:number;paused:boolean;uncertain:boolean};
test("repeated PAUSE/CONTINUE is durable, worker-scoped, isolated after transfer and never changes Payroll/Closing",async()=>{
 const db=new PGlite();let message=700;
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   alter default privileges in schema public grant all on tables to service_role;
   create table profiles(id uuid primary key,role text,username text,email text);
   create schema auth;create table auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz);
   create table cp_payroll_workspace(id int primary key,payload jsonb,revision bigint default 0,updated_at timestamptz default now());
   insert into cp_payroll_workspace(id,payload) values(1,'{}');`);
  for(const file of migrations.slice(0,-1))await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),"utf8"));
  for(const [id,role,name]of[[admin,"admin","owner"],[shared,"buyer","shared"],[personal,"buyer","adit"]])
   await db.query("insert into profiles values($1,$2,$3,$4)",[id,role,name,`${name}@example.test`]);
  const payload={"cp-ofs-demo-user-orders-v3":[{id:"manual:X800",externalReference:"X800",team:"FH3",orderType:"boosting",operationalStatus:"assignment_pending",financeStatus:"pending",workerAssignments:[],quantity:1,orderedAt:"2026-10-26T00:00:00Z"}],
   "cp-ofs-demo-employees-v2":[{id:"e1",code:"F001",name:"Adit",team:"FH3",workforceStatus:"SHIFT"},{id:"e2",code:"F002",name:"Budi",team:"FH3",workforceStatus:"FULL"}],
   "cp-ofs-demo-closing-v1":[{id:"legacy-closing",net:250000}],salaries:[{id:"legacy-salary",amount:999000}]};
  await db.query("update cp_payroll_workspace set payload=$1::jsonb where id=1",[JSON.stringify(payload)]);
  await db.query("select cp_monitor_set_account_scope($1,$2,'shared',null,true)",[admin,shared]);
  await db.query("select cp_monitor_bind_account($1,$2,'F001',true)",[admin,personal]);
  const snapshot=async()=> (await db.query<{value:unknown}>("select jsonb_build_object('payload',payload,'revision',revision) value from cp_payroll_workspace")).rows[0].value;
  const beforeMigration=await snapshot();await db.exec(readFileSync(new URL(`../supabase/migrations/${migrations.at(-1)}`,import.meta.url),"utf8"));
  assert.deepEqual(await snapshot(),beforeMigration);
  await db.exec("insert into cp_payroll_telegram_divisions(division,chat_id,chat_title) values('FH3',-100123,'EVO Ilham FH3')");
  const start=async(ref:string,code="F001")=>{
   await db.query("select cp_fh3_telegram_save_manual($1,-100123,$2,22,'AION','','12H','Task',now(),now(),$3,true,'evogamings')",[ref,message++,message++]);
   await db.query("select cp_mobile_assign_fh3($1,$2,$3)",[ref,code,shared]);
   const take=(await db.query<{v:Claim}>("select cp_mobile_take_begin($1,$2,$3) v",[ref,code,shared])).rows[0].v;
   await db.query("select cp_mobile_take_finish($1,$2,$3)",[take.eventId,shared,message++]);
   const initial=(await db.query<{v:Claim}>("select cp_mobile_proof_begin($1,$2,'start',$3) v",[ref,code,shared])).rows[0].v;
   await db.query("select cp_mobile_proof_finish($1,$2,$3,'fixture-start')",[initial.eventId,shared,message++]);return initial.eventId;
  };
  const state=async(ref:string)=>(await db.query<State>("select * from cp_monitor_pause_states(array[$1])",[ref])).rows[0];
  const claim=async(ref:string,cycle:string,action:string,revision:number,code="F001",actor=shared)=>(await db.query<{v:Claim}>("select cp_monitor_pause_begin($1,$2,$3,$4,$5,$6) v",[ref,code,action,actor,cycle,revision])).rows[0].v;
  const finish=async(event:Claim)=>{const id=message++;await db.query("select cp_monitor_pause_finish($1,$2,$3,'fixture-pause')",[event.eventId,shared,id]);return id;};
  const manage=async(ref:string,action:string,employee:string|null=null)=>{
   const version=(await db.query<{v:number}>("select coalesce((select version from cp_fh3_monitor_controls where order_ref=$1),0) v",[ref])).rows[0].v;
   return db.query("select cp_monitor_manage_order($1,$2,$3,$4,'Fixture reason',null,null,$5)",[admin,ref,version,action,employee]);
  };
  for(const ref of["X800","X900"]){
   const cycle=await start(ref);const beforePause=await snapshot();
   await assert.rejects(claim(ref,cycle,"continue",0),/Urutan/);
   await assert.rejects(claim(ref,cycle,"pause",0,"F002",personal),/ditolak/);
   let event=await claim(ref,cycle,"pause",0);assert.equal(event.caption,`${ref.toLowerCase()}/adit/pause`);
   assert.equal((await state(ref)).paused,false);assert.equal((await state(ref)).uncertain,true);
   await assert.rejects(claim(ref,cycle,"pause",0),/belum pasti/);
   await assert.rejects(db.query("select cp_mobile_proof_begin($1,'F001','done',$2)",[ref,shared]),/belum pasti/);
   await assert.rejects(manage(ref,"archive"),/belum pasti/);
   await db.query("select cp_monitor_pause_mark($1,$2,'failed')",[event.eventId,shared]);
   assert.equal((await claim(ref,cycle,"pause",0)).eventId,event.eventId);
   const pauseMessage=await finish(event);assert.equal((await state(ref)).paused,true);assert.equal(Number((await state(ref)).revision),1);
   assert.equal((await claim(ref,cycle,"pause",0)).alreadySent,true);
   await assert.rejects(claim(ref,cycle,"pause",1),/Urutan/);
   await assert.rejects(db.query("select cp_mobile_proof_begin($1,'F001','done',$2)",[ref,shared]),/CONTINUE/);
   event=await claim(ref,cycle,"continue",1);assert.equal(Number(event.replyToMessageId),pauseMessage);await finish(event);
   assert.equal((await state(ref)).paused,false);assert.equal(Number((await state(ref)).revision),2);
   await finish(await claim(ref,cycle,"pause",2));await finish(await claim(ref,cycle,"continue",3));
   await assert.rejects(claim(ref,cycle,"pause",0),/Status PAUSE berubah/);
   assert.deepEqual(await snapshot(),beforePause,"PAUSE/CONTINUE leaves the entire Payroll workspace unchanged");
   if(ref==="X900"){
    const eventsBefore=(await db.query("select * from cp_monitor_pause_events where order_ref=$1 order by sequence_no",[ref])).rows;
    await manage(ref,"transfer","F002");const newCycle=await start(ref,"F002");assert.notEqual(newCycle,cycle);
    assert.equal(Number((await state(ref)).revision),0);assert.equal((await state(ref)).paused,false);
    await assert.rejects(claim(ref,cycle,"pause",0,"F002"),/START/);
    await finish(await claim(ref,newCycle,"pause",0,"F002"));
    assert.deepEqual((await db.query("select * from cp_monitor_pause_events where order_ref=$1 and start_event_id=$2 order by sequence_no",[ref,cycle])).rows,eventsBefore);
   }else{
    const done=(await db.query<{v:Claim}>("select cp_mobile_proof_begin($1,'F001','done',$2) v",[ref,shared])).rows[0].v;
    await db.query("select cp_mobile_proof_finish($1,$2,$3,'fixture-done')",[done.eventId,shared,message++]);
    await assert.rejects(claim(ref,cycle,"pause",4),/DONE/);
   }
  }
  const unknownCycle=await start("X901");const unknown=await claim("X901",unknownCycle,"pause",0);
  await db.query("select cp_monitor_pause_mark($1,$2,'unknown')",[unknown.eventId,shared]);
  await assert.rejects(claim("X901",unknownCycle,"pause",0),/belum pasti/);
  assert.equal((await state("X901")).paused,false);assert.equal((await state("X901")).uncertain,true);
  await assert.rejects(manage("X901","transfer","F002"),/belum pasti/);
  const finalPayload=(await db.query<{payload:typeof payload}>("select payload from cp_payroll_workspace")).rows[0].payload;
  assert.deepEqual(finalPayload.salaries,payload.salaries);assert.deepEqual(finalPayload["cp-ofs-demo-closing-v1"],payload["cp-ofs-demo-closing-v1"]);
  for(const role of["anon","authenticated"]){
   assert.equal((await db.query<{ok:boolean}>("select has_table_privilege($1,'cp_monitor_pause_events','SELECT') ok",[role])).rows[0].ok,false);
   assert.equal((await db.query<{ok:boolean}>("select has_function_privilege($1,'cp_monitor_pause_begin(text,text,text,uuid,uuid,bigint)','EXECUTE') ok",[role])).rows[0].ok,false);
  }
 }finally{await db.close();}
});
