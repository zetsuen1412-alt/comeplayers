import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrations = ["20260926030000_payroll_telegram_operations.sql","20260926030001_payroll_telegram_durable_workflow.sql",
 "20260926030002_payroll_telegram_leader_dispatch.sql","20260926035622_payroll_telegram_item_workflow.sql",
 "20260926041704_payroll_telegram_strict_division_routing.sql","20261006060224_payroll_website_archive_telegram_guard.sql",
 "20261018090000_payroll_telegram_buyer_snapshot.sql","20261019220000_cp_boost_monitor_mobile_assignment.sql",
 "20261019220001_cp_boost_monitor_direct_fh3_routing.sql","20261019220002_cp_boost_monitor_mobile_telegram_proof.sql",
 "20261020140000_fh3_take_before_photo_start.sql","20261022002214_fh3_monitor_source_guards.sql",
 "20261022070000_fh3_manual_telegram_intake.sql","20261022093000_fh3_monitor_delivery_consistency.sql",
 "20261022100000_fh3_monitor_operational_jobs.sql","20261022103000_fh3_monitor_job_permissions.sql",
 "20261022103001_fh3_monitor_discord.sql","20261024034347_fh3_monitor_accounts_closing.sql"];
const admin="e120c2e4-99bb-42b0-9d08-a8e71ebef76a",a="e120c2e4-99bb-42b0-9d08-a8e71ebef76b",b="e120c2e4-99bb-42b0-9d08-a8e71ebef76c";
test("Monitor accounts, transfers, Refund/archive and immutable Tutup Buku preserve all Payroll",async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   alter default privileges in schema public grant all on tables to service_role;
   create table profiles(id uuid primary key,role text,username text,email text);
   create table cp_payroll_workspace(id int primary key,payload jsonb,revision bigint default 0,updated_at timestamptz default now());
   insert into cp_payroll_workspace(id,payload) values(1,'{}');`);
  for(const file of migrations) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),"utf8").replace(/\r\n/g,"\n"));
  for(const [id,role,name] of [[admin,"admin","owner"],[a,"buyer","adit"],[b,"buyer","budi"]])
   await db.query("insert into profiles values($1,$2,$3,$4)",[id,role,name,`${name}@example.test`]);
  const payload={"cp-ofs-demo-user-orders-v3":[],"cp-ofs-demo-employees-v2":[
   {id:"e1",code:"F001",name:"Adit",team:"FH3",workforceStatus:"SHIFT"},
   {id:"e2",code:"F002",name:"Budi",team:"FH3",workforceStatus:"FULL"}],
   "cp-ofs-demo-closing-v1":[{id:"old",net:250000}],"salaries":[{id:"salary",amount:999000}]};
  await db.query("update cp_payroll_workspace set payload=$1::jsonb where id=1",[JSON.stringify(payload)]);
  await db.exec("insert into cp_payroll_telegram_divisions(division,chat_id,chat_title) values('FH3',-100123,'EVO Ilham FH3')");
  const row=async(sql:string,params:unknown[]=[]) => (await db.query<{value:Record<string,unknown>}>(sql,params)).rows[0].value;
  const before=await row("select jsonb_build_object('payload',payload,'revision',revision) value from cp_payroll_workspace");
  const bind=(actor:string,user:string,code:string,active=true)=>db.query("select cp_monitor_bind_account($1,$2,$3,$4)",[actor,user,code,active]);
  await assert.rejects(bind(a,a,"F001"),/ditolak/);
  await bind(admin,a,"F001");await bind(admin,b,"F002");
  await assert.rejects(bind(admin,a,"F002"),/terikat/);
  await db.query("select cp_fh3_telegram_save_manual('X500',-100123,42,22,'AION','','12H','Task',now(),now(),100,true,'evogamings')");
  const assign=(who:string,code:string)=>db.query("select cp_mobile_assign_fh3('X500',$1,$2)",[code,who]);
  await assert.rejects(assign(a,"F002"),/ditolak/);await assign(a,"F001");
  const manage=(action:string,version:number,extra:{actor?:string,state?:string,wage?:number,employee?:string}={})=>
   db.query("select cp_monitor_manage_order($1,'X500',$2,$3,'Fixture reason',$4,$5,$6)",
    [extra.actor ?? admin,version,action,extra.state ?? null,extra.wage ?? null,extra.employee ?? null]);
  await assert.rejects(manage("price",0,{actor:a,wage:100}),/ditolak/);
  await assert.rejects(manage("price",0,{wage:100}),/DONE/);
  const take=async(who:string,code:string)=>{
   const claim=await row("select cp_mobile_take_begin('X500',$1,$2) value",[code,who]);
   await db.query("select cp_mobile_take_finish($1,$2,501)",[claim.eventId,who]);
  };
  const proof=async(who:string,code:string,action:string)=>{
   const claim=await row("select cp_mobile_proof_begin('X500',$1,$2,$3) value",[code,action,who]);
   await db.query("select cp_mobile_proof_finish($1,$2,$3,'fixture')",[claim.eventId,who,action==="start"?502:503]);
  };
  await take(a,"F001");await proof(a,"F001","start");
  await manage("transfer",0,{employee:"F002"});
  const job=await row("select to_jsonb(j) value from cp_fh3_monitor_jobs j where order_ref='X500'");
  assert.equal(job.employee_code,"F002");assert.equal(job.status,"assigned");
  assert.equal((await db.query<{n:number}>("select count(*)::int n from cp_mobile_order_proof")).rows[0].n,0);
  const history=await row("select before_data value from cp_fh3_monitor_audit where action='transfer_delivery_history'");
  assert.equal((history.proofs as unknown[]).length,1,"prior START retained verbatim in transfer history");
  await assert.rejects(proof(a,"F001","done"),/ditolak|Karyawan tidak cocok/);
  await assert.rejects(manage("archive",0),/Order berubah/);
  await take(b,"F002");await proof(b,"F002","start");await proof(b,"F002","done");
  await manage("price",1,{wage:125000});
  const close=(id:string,expected:unknown,who=admin)=>db.query("select cp_monitor_close_book($1,$2,'Tutup Buku fixture',$3) value",[who,id,JSON.stringify(expected)]);
  const id="720c2e4f-99bb-42b0-9d08-a8e71ebef761";
  await assert.rejects(close(id,[{orderRef:"X500",version:1,wageRupiah:125000}]),/berubah/);
  await assert.rejects(close(id,[],a),/ditolak/);
  await manage("status",2,{state:"refund"});
  await assert.rejects(assign(b,"F002"),/Refund/);await assert.rejects(close(id,[]),/Belum ada/);
  await manage("status",3,{state:"normal"});await manage("archive",4);
  await assert.rejects(close(id,[]),/Belum ada/);await manage("restore",5);
  await db.query("select cp_fh3_telegram_save_manual('X501',-100123,43,22,'AION','','12H','Task',now(),now(),101,true,'evogamings')");
  await db.query("select cp_mobile_assign_fh3('X501','F002',$1)",[b]);
  const take2=await row("select cp_mobile_take_begin('X501','F002',$1) value",[b]);
  await db.query("select cp_mobile_take_finish($1,$2,601)",[take2.eventId,b]);
  for(const [action,message] of [["start",602],["done",603]]) {
   const claim=await row("select cp_mobile_proof_begin('X501','F002',$1,$2) value",[action,b]);
   await db.query("select cp_mobile_proof_finish($1,$2,$3,'fixture')",[claim.eventId,b,message]);
  }
  await db.query("select cp_monitor_manage_order($1,'X501',0,'price','Fixture reason',null,50000,null)",[admin]);
  const expected=[{orderRef:"X500",version:6,wageRupiah:125000},{orderRef:"X501",version:1,wageRupiah:50000}];
  await assert.rejects(close(id,[...expected].reverse()),/berubah/);
  await close(id,expected);await close(id,expected);
  await db.query("update profiles set role='admin' where id=$1",[b]);
  await assert.rejects(close(id,expected,b),/akun lain/);
  await db.query("update profiles set role='buyer' where id=$1",[b]);
  assert.equal((await db.query<{n:number}>("select count(*)::int n from cp_fh3_monitor_closings")).rows[0].n,1,"retry is idempotent");
  const item=await row("select to_jsonb(i) value from cp_fh3_monitor_closing_items i where order_ref='X500'");
  assert.equal(Number((await row("select to_jsonb(c) value from cp_fh3_monitor_closings c")).total_rupiah),175000);
  assert.equal(item.employee_name,"Budi");assert.equal(Number(item.wage_rupiah),125000);
  await assert.rejects(manage("price",6,{wage:1}),/Tutup Buku/);
  await assert.rejects(manage("transfer",6,{employee:"F001"}),/Tutup Buku/);
  await manage("archive",6);await manage("status",7,{state:"refund"});
  assert.deepEqual(await row("select to_jsonb(i) value from cp_fh3_monitor_closing_items i where order_ref='X500'"),item,"archive/refund never rewrites closed earnings");
  await bind(admin,b,"F002",false);await assert.rejects(assign(b,"F002"),/ditolak/);
  assert.deepEqual(await row("select jsonb_build_object('payload',payload,'revision',revision) value from cp_payroll_workspace"),before);
  for(const table of ["accounts","controls","audit","closings","closing_items","login_limits"]){
   for(const role of ["anon","authenticated"]) assert.equal((await db.query<{allowed:boolean}>("select has_table_privilege($1,$2,'SELECT') allowed",[role,`cp_fh3_monitor_${table}`])).rows[0].allowed,false);
   for(const privilege of ["DELETE","TRUNCATE","UPDATE"]) assert.equal((await db.query<{allowed:boolean}>("select has_table_privilege('service_role',$1,$2) allowed",[`cp_fh3_monitor_${table}`,privilege])).rows[0].allowed,false);
  }
  for(const signature of ["cp_monitor_bind_account(uuid,uuid,text,boolean)","cp_monitor_close_book(uuid,uuid,text,jsonb)",
   "cp_monitor_manage_order(uuid,text,bigint,text,text,text,bigint,text)","cp_monitor_login_limit(text)"])
   for(const role of ["anon","authenticated"]) assert.equal((await db.query<{allowed:boolean}>(
    "select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed,false);
  assert.equal((await db.query<{n:number}>("select count(*)::int n from pg_class where relname like 'cp_fh3_monitor_%' and relkind='r' and not relrowsecurity")).rows[0].n,0);
  for(let i=0;i<16;i++)assert.equal((await db.query<{allowed:boolean}>("select cp_monitor_login_limit($1) allowed",["a".repeat(64)])).rows[0].allowed,i<15);
 } finally {await db.close();}
});
