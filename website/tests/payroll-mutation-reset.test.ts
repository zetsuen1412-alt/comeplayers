import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { mutationResetConfirmation, mutationResetPreview, rejectUnauditedOrderRemoval, validateMutationResetRequest } from '../features/payroll/lib/mutation-reset';
import { workspaceKeys as K } from '../features/payroll/lib/workspace-model';
const order = { id:'one',externalReference:'X1',grossMinor:5000,operationalStatus:'completed',financeStatus:'under_review',matchedPaymentMinor:0 };
const state = { [K.orders]: [order], [K.employees]: [{ id:'employee' }], [K.products]: [{ id:'game' }] };
const request = { expectedRevision:5,expectedCount:1,requestId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',confirmation:mutationResetConfirmation };
test('the preview counts all orders and sources without filtering or mutating the workspace', () => {
  const input={...state,[K.orders]:[order,{...order,id:'two',externalReference:'X2',source:'Other',grossMinor:9000}]};
  const before=JSON.stringify(input), result=mutationResetPreview(input,5);
  assert.equal(result.count,2); assert.equal(result.totalMinor,14000); assert.equal(result.canReset,true); assert.equal(JSON.stringify(input),before);
});
test('empty workspace cannot be reset',()=>assert.equal(mutationResetPreview({},1).canReset,false));
test('locked workspace cannot be reset',()=>assert.equal(mutationResetPreview({...state,[K.lock]:{from:'old'}},5).canReset,false));
test('closed order markers block a reset',()=>{
  for(const patch of [{payrollClosedAt:'2026-09-01'},{payrollPeriodId:'period'},{financeStatus:'closed'}]) assert.equal(mutationResetPreview({...state,[K.orders]:[{...order,...patch}]},5).closedCount,1);
});
test('closing snapshots and references protect orders even without order flags',()=>{
  for(const closing of [{orderRefs:[' x1 ']},{ordersSnapshot:[{id:'one'}]}]) assert.equal(mutationResetPreview({...state,[K.closings]:[closing]},5).closedCount,1);
});
test('inventory allocations, consumed stock and linked movements block a reset',()=>{
  for(const patch of [{inventoryAllocations:[{id:'allocation'}]},{inventoryConsumedAt:'2026-09-01'}]) assert.equal(mutationResetPreview({...state,[K.orders]:[{...order,...patch}]},5).stockLinkedCount,1);
  assert.equal(mutationResetPreview({...state,[K.movements]:[{orderReference:' x1 '}]},5).stockLinkedCount,1);
});
test('matched and reconciled payments are protected',()=>{
  for(const patch of [{matchedPaymentMinor:1},{financeStatus:'reconciled'},{financeStatus:'ready_to_close'}]) assert.equal(mutationResetPreview({...state,[K.orders]:[{...order,...patch}]},5).paymentLinkedCount,1);
});
test('unpaid verified work is counted and clearly previewed',()=>{
  const result=mutationResetPreview({...state,[K.orders]:[{...order,operationalStatus:'verified'}]},5);
  assert.equal(result.payrollReadyCount,1);assert.equal(result.canReset,true);
});
test('confirmation, positive count, revision and request ID are mandatory',()=>{
  assert.deepEqual(validateMutationResetRequest(request),request);
  for(const patch of [{confirmation:''},{confirmation:'hapus semua mutasi'},{confirmation:mutationResetConfirmation+' '},{expectedCount:0},{expectedCount:1.5},{expectedRevision:-1},{expectedRevision:'5'},{requestId:'bad'}]) assert.throws(()=>validateMutationResetRequest({...request,...patch}));
});
test('caller cannot supply replacement state, user identity, filters or arbitrary fields',()=>{
  for(const field of ['state','actor','filter','ids','__proto__']) assert.throws(()=>validateMutationResetRequest({...request,[field]:'not allowed'}));
  for(const value of [null,[],false,'yes']) assert.throws(()=>validateMutationResetRequest(value));
});
test('normal autosave cannot remove one or all orders',()=>{
  assert.throws(()=>rejectUnauditedOrderRemoval(state,{...state,[K.orders]:[]}),/Hapus Semua Mutasi/);
  assert.throws(()=>rejectUnauditedOrderRemoval(state,{}),/Hapus Semua Mutasi/);
  assert.doesNotThrow(()=>rejectUnauditedOrderRemoval(state,{...state,[K.orders]:[{...order,orderName:'Edited'}]}));
});
test('API authenticates admins, caps the body and uses the dedicated atomic RPC',()=>{
  const source=readFileSync('app/api/admin/payroll/mutations/reset/route.ts','utf8');
  assert.match(source,/if \(!access.actor.isAdmin\)/);assert.match(source,/size > 2048/);
  assert.match(source,/rpc\('cp_reset_payroll_mutations'/);assert.match(source,/p_actor: user.id/);
  const save=readFileSync('app/api/admin/payroll/workspace/route.ts','utf8');
  assert.match(save,/rejectUnauditedOrderRemoval\(current.payload,state\)/);
});
test('persistence updates all views only after a confirmed server snapshot',()=>{
  const source=readFileSync('features/payroll/lib/workspace-store.ts','utf8').split('export async function resetPayrollMutations')[1];
  assert.ok(source);assert.match(source,/exclusive = true/);assert.match(source,/await flushPayroll/);
  assert.match(source,/revision !== request.expectedRevision/);assert.match(source,/state = result.state; revision = result.revision/);
});
