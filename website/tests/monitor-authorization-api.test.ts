import { monitorFixtureImports } from './monitor-fixture-imports';
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {test} from "node:test";
import ts from "typescript";
import {requireOwnEmployee} from "../lib/monitorAccess";
import {monitorReply,monitorError,monitorBody} from "../lib/monitorHttp";
import {withMonitorSessionDeadline} from "../lib/monitorSessionDeadline";
function load(path:string,mocks:Record<string,unknown>){
 const exports:Record<string,(...args:unknown[])=>Promise<unknown>>={};
 runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
 }).outputText,{exports,Request,Response,URL,Buffer,require:(name:string)=>{assert.ok(name in { ...monitorFixtureImports, ...mocks },name);return mocks[name] ?? monitorFixtureImports[name];}});
 return exports;
}
test("Monitor checks stored role, stable employee binding and fresh revocation; user metadata cannot grant admin",async()=>{
 let admin=false,active=true,employeeActive=true,ambiguous=false;
 const modules={"@/lib/serverSupabase":{
  requireAccountIdentity:async()=>({id:"user-1",user_metadata:{role:"admin"}}),
  requireAuthenticatedUser:async()=>({id:"user-1"}),
  createSupabaseAdmin:()=>({from:(table:string)=>{
   const data=table==="profiles"?{id:"user-1",role:admin?"admin":"user",username:"adit"}:
    table==="cp_fh3_monitor_accounts"?{employee_id:"e1",employee_code:"F001",active}:
    {payload:{employees:[{id:"e1",code:"F001",team:"FH3",workforceStatus:employeeActive?"FULL":"RESIGN"},
      ...(ambiguous?[{id:"e1",code:"F002",team:"FH3",workforceStatus:"FULL"}]:[])]}};
   const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data}),single:async()=>({data})};return q;
  }}),
 },"@/lib/auth/accountSessionConfig":{singleDeviceSessionsEnabled:()=>false},
 "@/features/payroll/lib/workspace-model":{workspaceKeys:{employees:"employees"}}};
 const api=load("lib/monitorAccess.ts",modules);
 const context=await api.requireMonitorAccess(new Request("https://test/")) as {actor:{isAdmin:boolean};employeeCode:string};
 assert.equal(context.actor.isAdmin,false);assert.equal(context.employeeCode,"F001");
 assert.throws(()=>requireOwnEmployee(context,"F002"),/miliknya/);
 active=false;await assert.rejects(api.requireMonitorAccess(new Request("https://test/")),/dinonaktifkan/);
 active=true;employeeActive=false;await assert.rejects(api.requireMonitorAccess(new Request("https://test/")),/dinonaktifkan/);
 employeeActive=true;ambiguous=true;await assert.rejects(api.requireMonitorAccess(new Request("https://test/")),/dinonaktifkan/);ambiguous=false;
 admin=true;const owner=await api.requireMonitorAccess(new Request("https://test/")) as {actor:{isAdmin:boolean}};assert.equal(owner.actor.isAdmin,true);
});
test("management/accounts/closing writes deny employee accounts before any service operation",async()=>{
 let reads=0;
 for(const shared of [false,true]) for(const page of ["management","accounts","books"]){
  const route=load(`app/api/admin/payroll/mobile/${page}/route.ts`,{
   "@/lib/monitorAccess":{requireMonitorAccess:async()=>({actor:{id:"staff",isAdmin:false},canOperateAll:shared,accessScope:shared?"shared":"employee",employeeId:"e1",supabaseAdmin:{from:()=>{reads++;throw new Error();},rpc:()=>{reads++;throw new Error();}}})},
   "@/lib/monitorHttp":{monitorBody,monitorError,monitorReply},"@/lib/monitorManagement":{},
   "@/features/payroll/lib/workspace-model":{workspaceKeys:{}},
  });
  assert.equal((await route.POST(new Request("https://test/",{method:"POST",body:"{}"})) as Response).status,403);
 }assert.equal(reads,0);
});
test("owner-approved team books are visible to bound members and ignore client-supplied authority",async()=>{
 let chosen="unset";
 const route=load("app/api/admin/payroll/mobile/books/route.ts",{
  "@/lib/monitorAccess":{requireMonitorAccess:async()=>({actor:{isAdmin:false},employeeId:"e1",supabaseAdmin:{}})},
  "@/lib/monitorManagement":{monitorBookData:async(_service:unknown,id="")=>{chosen=id;return {open:[],closings:[{title:"Tutup Buku",totalRupiah:12000}]};}},
  "@/lib/monitorHttp":{monitorReply,monitorError,monitorBody},
 });
 const response=await route.GET(new Request("https://test/books?employeeId=someone-else")) as Response;
 assert.equal(response.status,200);assert.equal(chosen,"");assert.equal(response.headers.get("cache-control"),"no-store");
});
test("username resolves case-insensitively on the server; password and tokens never return before authorization",async()=>{
 let email="",pattern="",allowed=true,limited=false;
 const service={rpc:async()=>({data:!limited}),from:()=>({select:()=>({ilike:(_key:string,value:string)=>{pattern=value;return {maybeSingle:async()=>({data:{email:"internal@example.test"}})};}})})};
 const route=load("app/api/admin/payroll/mobile/session/route.ts",{
  "@/lib/monitorSessionDeadline":{withMonitorSessionDeadline},
  "next/server":{NextResponse:{json:(body:unknown,init:ResponseInit)=>Response.json(body,init)}},"node:crypto":await import("node:crypto"),
  "@/lib/serverSupabase":{createSupabaseAdmin:()=>service,createSupabaseAuthClient:()=>({auth:{signInWithPassword:async(input:{email:string})=>{email=input.email;return {data:{session:{access_token:"private-access",refresh_token:"private-refresh",expires_at:999999}}};}}})},
  "@/lib/auth/accountSessionConfig":{singleDeviceSessionsEnabled:()=>false},
  "@/lib/monitorAccess":{requireMonitorAccess:async()=>{if(!allowed)throw Object.assign(new Error("Denied"),{status:403});}},
  "@/lib/adminSecurity":{adminErrorStatus:(e:{status?:number})=>e.status??503},
 });
 const login=()=>route.POST(new Request("https://test/session",{method:"POST",body:JSON.stringify({action:"login",username:"ADIT_3",password:"fixture-password"})})) as Promise<Response>;
 let response=await login();assert.equal(response.status,200);assert.equal(email,"internal@example.test");assert.equal(pattern,"adit\\_3");
 allowed=false;response=await login();assert.equal(response.status,403);assert.doesNotMatch(await response.text(),/private-access|private-refresh|fixture-password|internal@/);
 limited=true;response=await login();assert.equal(response.status,429);
});
test("management returns the exact canonical closing order for both native clients",async()=>{
 const route=load("app/api/admin/payroll/mobile/management/route.ts",{
  "@/lib/monitorAccess":{requireMonitorAccess:async()=>({actor:{isAdmin:true},supabaseAdmin:{}})},
  "@/lib/monitorHttp":{monitorReply,monitorError,monitorBody},
  "@/lib/monitorManagement":{monitorBookData:async()=>({open:[],evidence:{receipts:[]},controls:new Map(),jobs:new Map(),closed:new Map(),
   eligible:[{orderRef:"X90",version:2,wageRupiah:200},{orderRef:"X100",version:1,wageRupiah:100}]})},
 });
 const response=await route.GET(new Request("https://test/management")) as Response;
 assert.equal(response.status,200);const data=await response.json();
 assert.deepEqual(data.eligible,[{orderRef:"X100",version:1,wageRupiah:100},{orderRef:"X90",version:2,wageRupiah:200}]);
});
test("book earnings group stable employees separately even when display names match",async()=>{
 const ledger=[{order_ref:"X100",employee_id:"e1",employee_name:"Adit",wage_rupiah:100},
  {order_ref:"X101",employee_id:"e1",employee_name:"Adit",wage_rupiah:200},
  {order_ref:"X102",employee_id:"e2",employee_name:"Adit",wage_rupiah:50}].map(i=>({...i,closing_id:"book-1",game:"AION",task:"Task",discord:"DC",completed_at:"2026-10-24T01:00:00Z"}));
 const service={from:(table:string)=>{
  const q={select:()=>q,eq:()=>q,order:()=>q,single:async()=>({data:{payload:{}}}),
   range:async()=>({data:table==="cp_fh3_monitor_closing_items"?ledger:[]}),
   in:async()=>({data:[{id:"book-1",title:"Tutup Buku",created_at:"2026-10-24T02:00:00Z"}]})};return q;
 }};
 const bookModule=load("lib/monitorManagement.ts",{
  "@/lib/fh3MonitorCompletedData":{loadCompletedMonitorEvidence:async()=>({receipts:[],proofs:[]})},
  "@/lib/fh3MonitorJobs":{loadFH3MonitorJobs:async()=>new Map()},
  "@/lib/payrollMobileCompleted":{buildMobileCompleted:()=>({work:[]})},
 });
 const data=await bookModule.monitorBookData(service) as {closings:{totalRupiah:number;employees:{employeeId:string;totalRupiah:number;orderCount:number}[];work:{closed:boolean}[]}[]};
 const book=data.closings[0];assert.equal(book.totalRupiah,350);assert.equal(book.employees.length,2);
 assert.equal(book.employees.find(i=>i.employeeId==="e1")?.totalRupiah,300);assert.equal(book.employees.find(i=>i.employeeId==="e1")?.orderCount,2);
 assert.equal(book.employees.find(i=>i.employeeId==="e2")?.totalRupiah,50);assert.ok(book.work.every(w=>w.closed));
});
