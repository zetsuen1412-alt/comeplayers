import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { requireOwnEmployee } from '../lib/monitorAccess';
import { workspaceKeys } from '../features/payroll/lib/workspace-model';

const guest = '00000000-0000-4000-8000-0000000000f3';
const owner = 'e120c2e4-99bb-42b0-9d08-a8e71ebef76a';
const migrations = [
 '20260926030000_payroll_telegram_operations.sql','20260926030001_payroll_telegram_durable_workflow.sql',
 '20260926030002_payroll_telegram_leader_dispatch.sql','20260926035622_payroll_telegram_item_workflow.sql',
 '20260926041704_payroll_telegram_strict_division_routing.sql','20261006060224_payroll_website_archive_telegram_guard.sql',
 '20261018090000_payroll_telegram_buyer_snapshot.sql','20261019220000_cp_boost_monitor_mobile_assignment.sql',
 '20261019220001_cp_boost_monitor_direct_fh3_routing.sql','20261019220002_cp_boost_monitor_mobile_telegram_proof.sql',
 '20261020140000_fh3_take_before_photo_start.sql','20261022002214_fh3_monitor_source_guards.sql',
 '20261022070000_fh3_manual_telegram_intake.sql','20261022093000_fh3_monitor_delivery_consistency.sql',
 '20261022100000_fh3_monitor_operational_jobs.sql','20261022103000_fh3_monitor_job_permissions.sql',
 '20261022103001_fh3_monitor_discord.sql','20261024034347_fh3_monitor_accounts_closing.sql',
 '20261025141943_fh3_monitor_shared_workstations.sql','20261026110043_fh3_monitor_pause_continue.sql',
 '20261026172128_fh3_monitor_daily_duration.sql','20261027060739_fh3_open_monitor_workspace.sql',
];
function load(path: string, mocks: Record<string, unknown>) {
 const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
 runInNewContext(ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url),'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
 }).outputText,{exports,Request,Response,URL,Buffer,AbortSignal,require:(name:string)=>{assert.ok(name in mocks,name);return mocks[name];}});
 return exports;
}

test('worker mode skips Auth entirely, is explicit, and can never select an admin actor', async () => {
 let calls=0;
 const snapshot={payload:{[workspaceKeys.employees]:[
  {id:'e1',code:'F001',team:'FH3',workforceStatus:'FULL'},
  {id:'e2',code:'F002',team:'FH3',workforceStatus:'RESIGN'},
  {id:'e3',code:'F003',team:'FH1',workforceStatus:'FULL'},
 ]},revision:10,updated_at:'2026-10-27T00:00:00Z'};
 const openModule=load('lib/monitorOpenWorkspace.ts',{
  'node:crypto':await import('node:crypto'),
  '@/features/payroll/lib/workspace-model':{workspaceKeys},
  './serverSupabase':{createSupabaseAdmin:()=>({rpc:async(name:string,input:{p_key:string})=>{
   calls++;assert.equal(name,'cp_monitor_public_context');assert.match(input.p_key,/^[a-f0-9]{64}$/);
   return {data:{enabled:true,snapshot}};
  }}),createSupabaseAuthClient:()=>{throw new Error('Worker mode must not call Auth');}},
 });
 const request=(path:string,method='GET',headers:Record<string,string>={})=>new Request('https://test/api/admin/payroll/mobile/'+path,{method,headers:{'x-monitor-mode':'public',...headers}});
 const context=await openModule.openMonitorContext(request('roster')) as {
  actor:{id:string;isAdmin:boolean};canOperateAll:boolean;operableEmployeeCodes:string[];employeeCode:string;
 };
 assert.equal(context.actor.id,guest);assert.equal(context.actor.isAdmin,false);
 assert.deepEqual(Array.from(context.operableEmployeeCodes),['F001']);requireOwnEmployee(context,'F001');
 assert.throws(()=>requireOwnEmployee(context,'F003'));
 for(const [path,method]of[['management','POST'],['accounts','POST'],['books','POST'],['earnings','GET']])
  await assert.rejects(openModule.openMonitorContext(request(path,method)),{status:403});
 assert.equal(calls,1,'forbidden paths never get service data');
 assert.equal(await openModule.openMonitorContext(new Request('https://test/roster')),null);
 assert.equal(await openModule.openMonitorContext(request('roster','GET',{authorization:'Bearer invalid-token'})),null,'invalid private tokens cannot downgrade to worker mode');
});

test('open workspace migration keeps Payroll intact, limits anonymous operations and preserves daily Telegram guards',async()=>{
 const db=new PGlite();let message=500;
 type Claim={eventId:string;caption:string;alreadySent?:boolean};
 type State={completed_days:number;revision:number;cycle_id:string;phase:string;uncertain:boolean};
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   alter default privileges in schema public grant all on tables to service_role;
   create table profiles(id uuid primary key,role text,username text,email text);
   create schema auth;create table auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz);
   create table cp_payroll_workspace(id int primary key,payload jsonb,revision bigint default 0,updated_at timestamptz default now());
   insert into cp_payroll_workspace(id,payload) values(1,'{}');`);
  for(const file of migrations.slice(0,-1))await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const original={
   [workspaceKeys.employees]:[
    {id:'e1',code:'F001',name:'Adit',team:'FH3',workforceStatus:'FULL',bankAccount:'PRIVATE_BANK'},
    {id:'e2',code:'F002',name:'Budi',team:'FH3',workforceStatus:'SHIFT'},
    {id:'e3',code:'F003',name:'Other',team:'FH1',workforceStatus:'FULL'},
   ],
   [workspaceKeys.orders]:[{id:'legacy',externalReference:'X9999',team:'FH1',operationalStatus:'completed',grossMinor:999999,employeeName:'Other',quantity:1}],
   [workspaceKeys.closings]:[{id:'old-close',salary:'PRIVATE_PAYROLL',archive:'x'.repeat(2_500_000)}],
  };
  await db.query('update cp_payroll_workspace set payload=$1::jsonb,revision=10 where id=1',[JSON.stringify(original)]);
  await db.query("insert into profiles values($1,'admin','owner','owner@example.test')",[owner]);
  const before=(await db.query<{v:unknown}>('select to_jsonb(w) v from cp_payroll_workspace w')).rows[0].v;
  await db.exec(readFileSync(new URL('../supabase/migrations/'+migrations.at(-1),import.meta.url),'utf8'));
  const roster=(await db.query<{v:{payload:Record<string,unknown>}}>('select cp_monitor_workspace_snapshot(false) v')).rows[0].v;
  assert.deepEqual(Object.keys(roster.payload),[workspaceKeys.employees]);
  assert.doesNotMatch(JSON.stringify(roster),/PRIVATE_BANK|PRIVATE_PAYROLL|archive|grossMinor/);
  assert.ok(JSON.stringify(roster).length<2000,'roster response does not transfer the 2.5 MB archive');
  const operations=(await db.query<{v:{payload:Record<string,unknown[]>}}>('select cp_monitor_workspace_snapshot(true) v')).rows[0].v;
  assert.equal(operations.payload[workspaceKeys.orders].length,1,'all cross-team refs remain for collision detection');
  assert.doesNotMatch(JSON.stringify(operations),/grossMinor|PRIVATE_/);
  const privileges=await db.query<{r:string;allowed:boolean}>("select r,has_function_privilege(r,'public.cp_monitor_public_context(text,boolean,boolean)','execute') allowed from unnest(array['anon','authenticated','service_role']) r");
  assert.deepEqual(privileges.rows,[{r:'anon',allowed:false},{r:'authenticated',allowed:false},{r:'service_role',allowed:true}]);
  assert.equal((await db.query<{v:boolean}>("select has_table_privilege('service_role','public.cp_monitor_open_mode','UPDATE') v")).rows[0].v,false);
  for(let i=0;i<100;i++)await db.query('select cp_monitor_public_context($1,true,false)',['a'.repeat(64)]);
  await assert.rejects(db.query('select cp_monitor_public_context($1,true,false)',['a'.repeat(64)]),/Terlalu banyak/);
  await db.exec("insert into cp_payroll_telegram_divisions(division,chat_id,chat_title) values('FH3',-100123,'EVO Ilham FH3')");
  await db.query("select cp_fh3_telegram_save_manual('X800',-100123,$1,22,'AION','','8hours x7','Task',now(),now(),$2,true,'evogamings')",[message++,message++]);
  await assert.rejects(db.query("select cp_mobile_assign_fh3('X800','F003',$1)",[guest]),/Karyawan|ditolak/);
  await db.query("select cp_mobile_assign_fh3('X800','F001',$1)",[guest]);
  let take=(await db.query<{v:Claim}>("select cp_mobile_take_begin('X800','F001',$1) v",[guest])).rows[0].v;
  await db.query('select cp_mobile_take_finish($1,$2,$3)',[take.eventId,guest,message++]);
  await assert.rejects(db.query("select cp_mobile_assign_fh3('X800','F002',$1)",[guest]),'a worker cannot transfer an already taken order to another employee');
  const state=async()=>(await db.query<State>("select * from cp_monitor_daily_states(array['X800'])")).rows[0];
  const claim=async(action:string,s:State)=>(await db.query<{v:Claim}>("select cp_monitor_daily_begin('X800','F001',$1,$2,$3,$4,$5) v",[action,guest,s.completed_days+1,s.revision,s.cycle_id])).rows[0].v;
  for(const action of ['start','pause','continue','done']){
   const s=await state();const event=await claim(action,s);
   assert.equal(event.caption,`x800/adit/day1/${action}`);
   if(action==='pause')await assert.rejects(claim('done',s),/belum pasti|Urutan|berubah/);
   await db.query("select cp_monitor_daily_finish($1,$2,$3,'fixture-photo')",[event.eventId,guest,message++]);
  }
  assert.equal((await state()).completed_days,1);assert.equal((await state()).phase,'waiting');
  assert.equal((await db.query<{v:string}>("select actor_id::text v from cp_fh3_monitor_jobs where order_ref='X800'")).rows[0].v,guest);
  await db.query("select cp_fh3_telegram_save_manual('X801',-100123,$1,22,'AION','','48H','Task',now(),now(),$2,true,'evogamings')",[message++,message++]);
  await db.query("select cp_mobile_assign_fh3('X801','F002',$1)",[guest]);
  take=(await db.query<{v:Claim}>("select cp_mobile_take_begin('X801','F002',$1) v",[guest])).rows[0].v;
  await db.query('select cp_mobile_take_finish($1,$2,$3)',[take.eventId,guest,message++]);
  for(const action of ['start','done']){
   const event=(await db.query<{v:Claim}>("select cp_mobile_proof_begin('X801','F002',$1,$2) v",[action,guest])).rows[0].v;
   assert.equal(event.caption,`x801/budi/${action}`);
   await db.query("select cp_mobile_proof_finish($1,$2,$3,'fixture-photo')",[event.eventId,guest,message++]);
  }
  await assert.rejects(db.query("select cp_monitor_manage_order($1,'X800',0,'archive','Fixture reason',null,null,null)",[guest]),/admin|ditolak/i);
  await assert.rejects(db.query("select cp_monitor_close_book($1,$2,'Fixture closing','[]'::jsonb)",[guest,owner]),/admin|ditolak/i);
  await assert.rejects(db.query('select cp_monitor_set_open_mode($1,false)',[guest]),/admin|ditolak/i);
  await db.query('select cp_monitor_set_open_mode($1,false)',[owner]);
  await assert.rejects(db.query("select cp_mobile_take_begin('X800','F001',$1)",[guest]),/admin|ditolak/i);
  const disabled=(await db.query<{v:{enabled:boolean}}>('select cp_monitor_public_context($1,false,false) v',['b'.repeat(64)])).rows[0].v;
  assert.equal(disabled.enabled,false);
  const after=(await db.query<{v:unknown}>('select to_jsonb(w) v from cp_payroll_workspace w')).rows[0].v;
  assert.deepEqual(after,before,'public jobs do not rewrite Payroll, salaries or Closing');
 }finally{await db.close();}
});
