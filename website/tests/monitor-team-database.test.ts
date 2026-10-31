import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const admin="e120c2e4-99bb-42b0-9d08-a8e71ebef76a", staff="e120c2e4-99bb-42b0-9d08-a8e71ebef76b";
const migrations=["20260926030000_payroll_telegram_operations.sql","20260926030001_payroll_telegram_durable_workflow.sql",
 "20260926030002_payroll_telegram_leader_dispatch.sql","20260926035622_payroll_telegram_item_workflow.sql",
 "20260926041704_payroll_telegram_strict_division_routing.sql","20261006060224_payroll_website_archive_telegram_guard.sql",
 "20261018090000_payroll_telegram_buyer_snapshot.sql","20261019220000_cp_boost_monitor_mobile_assignment.sql",
 "20261019220001_cp_boost_monitor_direct_fh3_routing.sql","20261019220002_cp_boost_monitor_mobile_telegram_proof.sql",
 "20261020140000_fh3_take_before_photo_start.sql","20261022002214_fh3_monitor_source_guards.sql",
 "20261022070000_fh3_manual_telegram_intake.sql","20261022093000_fh3_monitor_delivery_consistency.sql",
 "20261022100000_fh3_monitor_operational_jobs.sql","20261022103000_fh3_monitor_job_permissions.sql",
 "20261022103001_fh3_monitor_discord.sql","20261024034347_fh3_monitor_accounts_closing.sql",
 "20261025141943_fh3_monitor_shared_workstations.sql","20261026110043_fh3_monitor_pause_continue.sql",
 "20261026172128_fh3_monitor_daily_duration.sql","20261027060739_fh3_open_monitor_workspace.sql",
 "20261027154318_fh3_monitor_compact_workspace.sql"];
const migration="20261031013816_fh3_monitor_teams.sql";
const sql=(file:string)=>readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),"utf8");

test("Monitor teams preserve the order lifecycle, enforce allocations, and seal exact per-worker wages",async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   alter default privileges in schema public grant all on tables to service_role;
   create table profiles(id uuid primary key,role text,username text,email text);
   create schema auth;create table auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz);
   create table cp_payroll_workspace(id int primary key,payload jsonb,revision bigint default 0,updated_at timestamptz default now());
   insert into cp_payroll_workspace(id,payload) values(1,'{}');`);
  for(const file of migrations) await db.exec(sql(file));
  await db.query("insert into profiles values($1,'admin','owner','owner@example.test'),($2,'buyer','staff','staff@example.test')",[admin,staff]);
  const employees=Array.from({length:5},(_,i)=>({id:`e${i+1}`,code:`F00${i+1}`,name:`Worker ${i+1}`,team:"FH3",workforceStatus:"FULL"}));
  const payload={"cp-ofs-demo-user-orders-v3":[],"cp-ofs-demo-employees-v2":employees,"cp-ofs-demo-closing-v1":[{id:"old",net:250000}],salaries:[{id:"salary",amount:999000}]};
  await db.query("update cp_payroll_workspace set payload=$1::jsonb where id=1",[JSON.stringify(payload)]);
  await db.exec("insert into cp_payroll_telegram_divisions(division,chat_id,chat_title) values('FH3',-100123,'EVO Ilham FH3')");
  const value=async(query:string,params:unknown[]=[]) => (await db.query<{value:any}>(query,params)).rows[0].value;
  const receipt=async(ref:string,id:number)=>db.query("select cp_fh3_telegram_save_manual($1,-100123,$2,22,'AION','','12H','Task',now(),now(),$3,true,'evogamings')",[ref,id,200+id]);
  const take=async(ref:string)=>{
   const claim=await value("select cp_mobile_take_begin($1,'F001',$2) value",[ref,admin]);
   await db.query("select cp_mobile_take_finish($1,$2,700)",[claim.eventId,admin]);return claim;
  };
  const proof=async(ref:string,action:string)=>{
   const claim=await value("select cp_mobile_proof_begin($1,'F001',$2,$3) value",[ref,action,admin]);
   await db.query("select cp_mobile_proof_finish($1,$2,701,'fixture')",[claim.eventId,admin]);return claim;
  };
  // Upgrade a real pre-team immutable closing, rather than only an empty database.
  await receipt("X899",89);
  await db.query("select cp_mobile_assign_fh3('X899','F001',$1)",[admin]);await take("X899");await proof("X899","start");await proof("X899","done");
  await db.query("select cp_monitor_manage_order($1,'X899',0,'price','Old wage',null,999,null)",[admin]);
  const oldBook="720c2e4f-99bb-42b0-9d08-a8e71ebef761";
  await db.query("select cp_monitor_close_book($1,$2,'Old book',$3::jsonb)",[admin,oldBook,JSON.stringify([{orderRef:"X899",version:1,wageRupiah:999}])]);
  const oldRows=(await db.query("select * from cp_fh3_monitor_closing_items where order_ref='X899'")).rows;
  const beforeWorkspace=await value("select jsonb_build_object('payload',payload,'revision',revision) value from cp_payroll_workspace");
  await db.exec(sql(migration));
  assert.deepEqual((await db.query("select * from cp_fh3_monitor_closing_items where order_ref='X899'")).rows,oldRows);
  const team=async(ref="X900")=>value("select cp_monitor_team_snapshot($1) value",[ref]);
  const legacyTeam=await team("X899");assert.equal(legacyTeam.teamVersion,0);assert.equal(legacyTeam.participants[0].shareBps,10000);
  const set=async(version:number,participants:unknown,actor=admin,ref="X900")=>value("select cp_monitor_set_team($1,$2,$3::jsonb,$4) value",[ref,version,JSON.stringify(participants),actor]);
  const assign=async(ref:string,participants:unknown)=>value("select cp_monitor_assign_team($1,0,$2::jsonb,$3) value",[ref,JSON.stringify(participants),admin]);
  await receipt("X900",90);await receipt("X901",91);
  assert.deepEqual((await team()).participants,[]);
  await assert.rejects(assign("X901",employees.map(e=>({employeeCode:e.code,shareBps:2000}))),/1 sampai 4/);
  assert.equal((await db.query("select * from cp_fh3_monitor_jobs where order_ref='X901'")).rows.length,0);
  await assert.rejects(assign("X901",[{employeeCode:"F001",shareBps:5000},{employeeCode:"UNKNOWN",shareBps:5000}]),/tidak aktif/);
  assert.equal((await db.query("select * from cp_fh3_monitor_jobs where order_ref='X901'")).rows.length,0,"atomic assignment rolled back");
  const original=await assign("X900",[{employeeCode:"F001",shareBps:6000},{employeeCode:"F002",shareBps:4000}]);
  assert.equal(original.teamVersion,1);assert.equal(original.primaryEmployeeCode,"F001");assert.equal(original.participants.length,2);
  const firstJoin=original.participants[0].joinedAt, secondJoin=original.participants[1].joinedAt;
  await assert.rejects(set(1,[{employeeCode:"F001",shareBps:10000}],staff),/ditolak/);
  await assert.rejects(set(0,[{employeeCode:"F001",shareBps:6000},{employeeCode:"F002",shareBps:4000}]),/Tim berubah/);
  await assert.rejects(set(1,[{employeeCode:"F001",shareBps:10000}]),/tidak dapat dihapus/);
  for(const participants of [
   [{employeeCode:"F001",shareBps:6000},{employeeCode:"F002",shareBps:3999}],
   [{employeeCode:"F001",shareBps:5000},{employeeCode:"F001",shareBps:5000}],
   [{employeeCode:"F001",shareBps:0},{employeeCode:"F002",shareBps:10000}],
   [{employeeCode:"F001",shareBps:4999.5},{employeeCode:"F002",shareBps:5000.5}],
  ]) await assert.rejects(set(1,participants),/persen|berulang/);
  const takeClaim=await value("select cp_mobile_take_begin('X900','F001',$1) value",[admin]);
  await assert.rejects(set(1,[{employeeCode:"F001",shareBps:5000},{employeeCode:"F002",shareBps:5000}]),/belum pasti/);
  await db.query("select cp_mobile_take_finish($1,$2,710)",[takeClaim.eventId,admin]);
  await proof("X900","start");
  const startBefore=(await db.query<{id:string}>("select * from cp_mobile_order_proof where order_ref='X900' and action='start'")).rows;
  const jobBefore=(await db.query("select * from cp_fh3_monitor_jobs where order_ref='X900'")).rows;
  const three=await set(1,[{employeeCode:"F001",shareBps:5000},{employeeCode:"F002",shareBps:3000},{employeeCode:"F003",shareBps:2000}]);
  assert.equal(three.teamVersion,2);assert.equal(three.participants[0].joinedAt,firstJoin);assert.equal(three.participants[1].joinedAt,secondJoin);
  const pauseClaim=await value("select cp_monitor_pause_begin('X900','F001','pause',$1,$2,0) value",[admin,startBefore[0].id]);
  await assert.rejects(set(2,three.participants),/belum pasti/);
  await db.query("select cp_monitor_pause_finish($1,$2,715,'fixture')",[pauseClaim.eventId,admin]);
  const four=await set(2,[{employeeCode:"F001",shareBps:3000},{employeeCode:"F002",shareBps:2500},{employeeCode:"F003",shareBps:2500},{employeeCode:"F004",shareBps:2000}]);
  assert.equal(four.participants.length,4);assert.equal(four.teamVersion,3);
  assert.deepEqual((await db.query("select * from cp_mobile_order_proof where order_ref='X900' and action='start'")).rows,startBefore);
  assert.deepEqual((await db.query("select * from cp_fh3_monitor_jobs where order_ref='X900'")).rows,jobBefore);
  const repeatedStart=await value("select cp_mobile_proof_begin('X900','F001','start',$1) value",[admin]);assert.equal(repeatedStart.alreadySent,true);
  const continueClaim=await value("select cp_monitor_pause_begin('X900','F001','continue',$1,$2,1) value",[admin,startBefore[0].id]);
  await db.query("select cp_monitor_pause_finish($1,$2,716,'fixture')",[continueClaim.eventId,admin]);
  await assert.rejects(db.query("select cp_mobile_proof_begin('X900','F002','done',$1)",[admin]),/Karyawan tidak cocok/);
  const activeControl=await value("select to_jsonb(c) value from cp_fh3_monitor_controls c where order_ref='X900'");
  await assert.rejects(db.query("select cp_monitor_manage_order($1,'X900',$2,'transfer','Do not reset',null,null,'F003')",[admin,activeControl.version]),/Order tim/);
  await assert.rejects(db.query("update cp_payroll_workspace set payload=jsonb_set(payload,'{cp-ofs-demo-employees-v2}',$1) where id=1",[JSON.stringify(employees.filter(e=>e.code!=="F002"))]),/riwayat tim/);
  const snapshots=await value("select cp_monitor_team_states(array['X900']) value");assert.equal(snapshots.length,1);assert.equal(snapshots[0].participants.length,4);
  await proof("X900","done");
  await assert.rejects(set(3,four.participants),/selesai|Tutup Buku/);
  await db.query("select cp_monitor_manage_order($1,'X900',$2,'price','Net order wage',null,101,null)",[admin,activeControl.version]);
  const book="720c2e4f-99bb-42b0-9d08-a8e71ebef762";
  const expected=[{orderRef:"X900",version:Number(activeControl.version)+1,wageRupiah:101}];
  await assert.rejects(db.query("select cp_monitor_close_book($1,$2,'Team book',$3::jsonb)",[admin,book,JSON.stringify([{...expected[0],version:0}])]),/berubah/);
  const closed=await value("select cp_monitor_close_book($1,$2,'Team book',$3::jsonb) value",[admin,book,JSON.stringify(expected)]);
  assert.equal(closed.orderCount,1);assert.equal(closed.totalRupiah,101);
  const shares=(await db.query<{employee_code:string;wage_rupiah:number|string;share_bps:number;team_version:number|string}>("select employee_code,wage_rupiah,share_bps,team_version from cp_fh3_monitor_closing_shares order by employee_code")).rows;
  assert.deepEqual(shares.map(s=>[s.employee_code,Number(s.wage_rupiah),s.share_bps,Number(s.team_version)]),[["F001",31,3000,3],["F002",25,2500,3],["F003",25,2500,3],["F004",20,2000,3]]);
  assert.equal((await value("select cp_monitor_close_book($1,$2,'Team book',$3::jsonb) value",[admin,book,JSON.stringify(expected)])).alreadyClosed,true);
  assert.deepEqual((await db.query("select employee_code,wage_rupiah,share_bps,team_version from cp_fh3_monitor_closing_shares order by employee_code")).rows,shares);
  assert.equal((await db.query("select * from cp_fh3_monitor_closing_shares where order_ref='X899'")).rows.length,0);
  assert.deepEqual((await db.query("select * from cp_fh3_monitor_closing_items where order_ref='X899'")).rows,oldRows);
  assert.deepEqual(await value("select jsonb_build_object('payload',payload,'revision',revision) value from cp_payroll_workspace"),beforeWorkspace);
  // Daily orders keep their existing one-per-day sequence when someone joins between days.
  await receipt("X902",92);
  await db.exec("update cp_fh3_telegram_manual_orders set duration='6 jam x 2 hari' where order_ref='X902'");
  await assign("X902",[{employeeCode:"F001",shareBps:10000}]);await take("X902");
  const dailyAction=async(action:string)=>{
   const plan=(await db.query<any>("select * from cp_monitor_daily_states(array['X902'])")).rows[0];
   const claim=await value("select cp_monitor_daily_begin('X902','F001',$1,$2,$3,$4,$5) value",[action,admin,plan.completed_days+1,plan.revision,plan.cycle_id]);
   return claim;
  };
  const firstDay=await dailyAction("start");
  await assert.rejects(set(1,[{employeeCode:"F001",shareBps:5000},{employeeCode:"F002",shareBps:5000}],admin,"X902"),/belum pasti/);
  await db.query("select cp_monitor_daily_finish($1,$2,720,'fixture')",[firstDay.eventId,admin]);
  const dayDone=await dailyAction("done");await db.query("select cp_monitor_daily_finish($1,$2,721,'fixture')",[dayDone.eventId,admin]);
  const dayState=(await db.query("select * from cp_monitor_daily_states(array['X902'])")).rows;
  await set(1,[{employeeCode:"F001",shareBps:5000},{employeeCode:"F002",shareBps:5000}],admin,"X902");
  assert.deepEqual((await db.query("select * from cp_monitor_daily_states(array['X902'])")).rows,dayState);
  assert.equal((await team("X902")).participants.length,2);
  for(const role of ["anon","authenticated"]) {
   for(const fn of ["cp_monitor_team_snapshot(text)","cp_monitor_team_states(text[])","cp_monitor_set_team(text,bigint,jsonb,uuid)","cp_monitor_assign_team(text,bigint,jsonb,uuid)","cp_monitor_close_before_team(uuid,uuid,text,jsonb)"])
    assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,fn])).rows[0].allowed,false);
   for(const table of ["cp_fh3_monitor_teams","cp_fh3_monitor_team_members","cp_fh3_monitor_closing_shares"])
    assert.equal((await db.query<{allowed:boolean}>("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",[role,table])).rows[0].allowed,false);
  }
  for(const table of ["cp_fh3_monitor_teams","cp_fh3_monitor_team_members","cp_fh3_monitor_closing_shares"])
   assert.equal((await db.query<{allowed:boolean}>("select has_table_privilege('service_role',$1,'INSERT,UPDATE,DELETE,TRUNCATE') allowed",[table])).rows[0].allowed,false);
 } finally {await db.close();}
});
