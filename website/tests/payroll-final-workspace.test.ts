import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeWorkspace, validateWorkspace, validateWorkspaceEdit, workspaceKeys as K } from '../features/payroll/lib/workspace-model';
import type { Order } from '../features/payroll/types/domain';
import { auditMutations, auditPayroll, auditClosing, answerLocalBusinessQuestion } from '../features/payroll/lib/ai-auditor';
const order:Order={id:'o1',orderNumber:'CP1',externalReference:'X1',source:'Direct',buyerName:'Buyer',orderName:'Order',game:'Game',service:'JOKI',employeeCode:'E1',employeeName:'Employee',team:'FH1',quantity:1,grossMinor:640000,workerShareBps:5000,transferStatus:'PENDING',operationalStatus:'verified',financeStatus:'pending',expectedPaymentMinor:640000,matchedPaymentMinor:0,orderedAt:'2026-09-10T09:15:00+07:00',dueAt:'2026-09-11T09:15:00+07:00'};
const locked=()=>({[K.orders]:[structuredClone(order)], [K.lock]:{id:'l1',from:'2026-09-10T00:00',to:'2026-09-10T23:59',lockedAt:'2026-09-10T00:00:00Z',lockedBy:'Admin'},[K.advances]:[{id:'a1',employeeCode:'E1',employeeName:'Employee',team:'FH1',amountMinor:50000,remainingMinor:50000,status:'active',note:'',createdAt:'2026-09-09T00:00:00Z'}]});
test('closing snapshots salary, repays advance, and never counts a closed order twice',()=>{const before=locked();const result=closeWorkspace(before);assert.equal(result.payroll[0].earning,320000);assert.equal(result.payroll[0].net,270000);assert.equal(result.record.totalPayrollMinor,270000);assert.equal((result.state[K.advances] as {remainingMinor:number}[])[0].remainingMinor,0);assert.equal(result.record.payrollSnapshot[0].net,270000);assert.throws(()=>closeWorkspace(result.state),/Tidak ada order/);assert.equal(before[K.orders][0].payrollClosedAt,undefined);});
test('locked workspace rejects edits and accepts unlocking',()=>{const before=locked();assert.throws(()=>validateWorkspaceEdit(before,{...before,[K.orders]:[]}),/dikunci/);const after:Record<string,unknown>={...before};delete after[K.lock];assert.doesNotThrow(()=>validateWorkspaceEdit(before,after));});
test('closed history cannot be forged or deleted',()=>{assert.throws(()=>validateWorkspaceEdit({}, {[K.closings]:[{id:'fake'}]}),/Closing/);const closed=closeWorkspace(locked()).state;delete closed[K.lock];assert.throws(()=>validateWorkspaceEdit(closed,{...closed,[K.orders]:[]}),/dihapus/);});
test('rejects unknown storage keys, invalid money and malformed assignments',()=>{assert.throws(()=>validateWorkspace({secret:[]}),/dikenal/);assert.throws(()=>validateWorkspace({[K.orders]:[{...order,grossMinor:-1}]}),/Angka/);assert.throws(()=>validateWorkspace({[K.orders]:[{...order,workerAssignments:[null]}]}),/Penugasan/);});
test('auditor uses explicit operational fixtures, not removed demo records',()=>{
  const overpaid={...order,matchedPaymentMinor:order.expectedPaymentMinor+576000};
  assert.ok(auditMutations([overpaid],[]).some(f=>f.exposureMinor===576000));
  const completed={...order,operationalStatus:'completed' as const};
  assert.ok(auditPayroll([completed]).some(f=>f.area==='gaji'&&f.entity==='X1'));
  assert.ok(auditClosing([completed],[]).some(f=>f.entity==='X1'));
  assert.match(answerLocalBusinessQuestion('Berapa omzet?',[order],[]),/total nilai order/i);
});
