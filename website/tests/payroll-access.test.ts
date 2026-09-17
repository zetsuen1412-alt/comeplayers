import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { manualOrderCode } from '../features/payroll/lib/manual-order-code';
import { attributeWorkspaceEdit, diffWorkspace } from '../features/payroll/lib/audit-model';
import * as model from '../features/payroll/lib/workspace-model';
const K=model.workspaceKeys;
const actor={id:'00000000-0000-4000-8000-000000000002',name:'Operator',isAdmin:false,email:'operator@example.test'};
const order={id:'o1',externalReference:'MAN-01',quantity:1,grossMinor:10,expectedPaymentMinor:10,matchedPaymentMinor:0,orderedAt:'2026-09-17T00:00:00Z'};
test('manual references trim, preserve entered case and reject duplicate or unsafe input',()=>{
  assert.equal(manualOrderCode(' G2G-123_A.1 '),'G2G-123_A.1');
  for(const value of ['', '  ', '../abc','a/b','a?b','a b','A'.repeat(65)])assert.throws(()=>manualOrderCode(value));
  assert.throws(()=>manualOrderCode('Man-01',[' man-01 ']));
});
test('server requires valid new codes while preserving unchanged historical codes',()=>{
  assert.throws(()=>model.validateWorkspaceEdit({}, {[K.orders]:[{...order,externalReference:'bad/code'}]}));
  const old={...order,externalReference:'old/code'};
  assert.doesNotThrow(()=>model.validateWorkspaceEdit({[K.orders]:[old]},{[K.orders]:[{...old,grossMinor:20}]}));
  assert.throws(()=>model.validateWorkspace({[K.orders]:[order,{...order,id:'o2',externalReference:' man-01 '}]}));
});
test('server stamps authenticated actor and rejects changing saved annotations',()=>{
  const input={[K.history]:[{id:'h1',editedBy:'Admin forged',editedAt:'1999',reason:'Correction'}],[K.lock]:{id:'l1',lockedBy:'Fake'}};
  const next=attributeWorkspaceEdit({},input,actor,'2026-09-17T00:00:00Z');
  assert.deepEqual((next[K.history] as any[])[0],{id:'h1',editedBy:actor.name,actorId:actor.id,editedAt:'2026-09-17T00:00:00Z',reason:'Correction'});
  assert.equal((next[K.lock] as any).lockedBy,actor.name);
  assert.throws(()=>attributeWorkspaceEdit(next,{...next,[K.history]:[]},actor,'now'));
  assert.throws(()=>attributeWorkspaceEdit(next,input,actor,'now'));
});
test('audit includes additions, edits, removals and settings across workspace sections',()=>{
  const before={[K.orders]:[order],[K.employees]:[{id:'e1',name:'Old'}],[K.settings]:{defaultSharePercent:50}};
  const after={[K.orders]:[{...order,grossMinor:25}],[K.employees]:[],[K.settings]:{defaultSharePercent:60},[K.products]:[{id:'p1',name:'Game'}]};
  const changes=diffWorkspace(before,after);
  assert.equal(changes.length,4);
  assert.ok(changes.some(c=>c.field==='grossMinor'&&c.before==='10'&&c.after==='25'));
  assert.ok(changes.some(c=>c.field==='Dihapus'));
  assert.ok(changes.some(c=>c.field==='Ditambahkan'));
});
function load(file:string,mocks:Record<string,unknown>) {
  const code=ts.transpileModule(fs.readFileSync(path.resolve(file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:Record<string,any>={};
  vm.runInNewContext(code,{exports,require:(name:string)=>{assert.ok(name in mocks,'Unexpected dependency '+name);return mocks[name];},Request,Response,URL,Buffer,Date,Set,Map,structuredClone,setTimeout,clearTimeout,window:{dispatchEvent(){}},Event});
  return exports;
}
const adminErrorStatus=(e:any)=>e.status||500;
function context(role:string|null,active:boolean|null,dbError=false) {
  const db={from:(table:string)=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='profiles'?{...actor,username:actor.name,role}:active===null?null:{active},error:dbError?Error('Database unavailable'):null})})})})};
  const {requirePayrollAccess}=load('lib/payrollAccess.ts',{'@/lib/serverSupabase':{requireAuthenticatedUser:async()=>({id:actor.id,user_metadata:{role:'admin'}}),createSupabaseAdmin:()=>db},'@/features/payroll/lib/workspace-model':model});
  return requirePayrollAccess;
}
test('payroll access accepts admins or explicit active members; metadata and inactive grants do not authorize',async()=>{
  assert.equal((await context('admin',null)()).actor.isAdmin,true);
  assert.equal((await context('buyer',true)()).actor.isAdmin,false);
  for(const role of ['buyer',null])for(const active of [null,false])await assert.rejects(context(role,active)(),(e:any)=>e.status===403);
  await assert.rejects(context('buyer',true,true)());
});
test('save endpoint ignores caller supplied actor and maps a concurrent revocation to 403',async()=>{
  for(const revoked of [false,true]) {
    let call:any;
    const db={from:()=>({select:()=>({eq:()=>({single:async()=>({data:{revision:0,payload:{}},error:null})})})}),rpc:async(_name:string,args:any)=>{call=args;return revoked?{error:{code:'42501'}}:{data:{state:args.p_payload,revision:1}};}};
    const route=load('app/api/admin/payroll/workspace/route.ts',{'@/lib/payrollAccess':{requirePayrollAccess:async()=>({user:{id:actor.id},actor,supabaseAdmin:db})},'@/lib/adminSecurity':{adminErrorStatus},'@/features/payroll/lib/workspace-model':model,'@/features/payroll/lib/audit-model':{attributeWorkspaceEdit}});
    const response=await route.POST(new Request('https://test/api',{method:'POST',body:JSON.stringify({action:'save',expectedRevision:0,actor:'forged',state:{[K.history]:[{id:'h1',editedBy:'Fake'}]}})}));
    assert.equal(response.status,revoked?403:200);assert.equal(call.p_actor,actor.id);assert.equal(call.p_payload[K.history][0].editedBy,actor.name);
  }
});
test('permission administration remains admin-only for reads, searches and writes',async()=>{
  const route=load('app/api/admin/payroll/access/route.ts',{'@/lib/adminSecurity':{adminErrorStatus,requireAdmin:async()=>{throw Object.assign(Error('Forbidden'),{status:403});}},'@/features/payroll/lib/workspace-model':model});
  for(const url of ['https://test/api','https://test/api?q=operator'])assert.equal((await route.GET(new Request(url))).status,403);
  assert.equal((await route.POST(new Request('https://test/api',{method:'POST',body:JSON.stringify({userId:actor.id,active:true})}))).status,403);
});
test('history endpoint rejects unauthorized accounts before querying snapshots',async()=>{
  const route=load('app/api/admin/payroll/workspace/history/route.ts',{'@/lib/adminSecurity':{adminErrorStatus},'@/lib/payrollAccess':{requirePayrollAccess:async()=>{throw Object.assign(Error('Forbidden'),{status:403});}},'@/features/payroll/lib/audit-model':{diffWorkspace},'@/features/payroll/lib/workspace-model':model});
  for(const query of ['', '?revision=1'])assert.equal((await route.GET(new Request('https://test/api'+query))).status,403);
});
test('revocation clears browser workspace and pending export data',async()=>{
  let revoked=false;
  const store=load('features/payroll/lib/workspace-store.ts',{'react':{},'./workspace-model':model,'@/lib/authenticatedFetch':{authenticatedFetchJson:async()=>{if(revoked)throw Object.assign(Error('Revoked'),{status:403});return {state:{[K.orders]:[order]},revision:1,actor};}}});
  await store.loadPayroll();assert.equal(store.payrollStatus().ready,true);
  revoked=true;await assert.rejects(store.loadPayroll());
  assert.equal(store.payrollStatus().ready,false);assert.equal(store.payrollStatus().actor,null);assert.equal(store.payrollStorage.getItem(K.orders),null);
  assert.throws(()=>store.payrollStorage.setItem(K.orders,'[]'));
});
