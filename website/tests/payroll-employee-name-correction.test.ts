import assert from "node:assert/strict";
import test from "node:test";
import {prepareEmployeeNameCorrection,listPendingSheetNameCorrections} from "../features/payroll/lib/employee-name-correction";
import {mergeGoogleSheetRoster} from "../features/payroll/lib/google-sheet-roster";
import {validateWorkspace,validateWorkspaceEdit,workspaceKeys as K} from "../features/payroll/lib/workspace-model";
import type {Employee} from "../features/payroll/types/domain";

const base:Employee={id:"stable-1",code:"EMP-SHEET-AAAA",name:"LUTFI3",team:"FH3",
 workforceStatus:"SHIFT",utilization:0,earningsMinor:0,
 sheetRosterSource:{spreadsheetId:"source-namespace",sheetName:"PAYROLL-3",rowNumber:53}};
const actor={id:"admin-1",name:"Admin"};
const time="2026-10-13T04:00:00Z";
const requestId="a8b4aeb1-0912-47e4-86fb-4265905beb1b";
const request=(state:Record<string,unknown>,name:string)=>
 prepareEmployeeNameCorrection(state,base.id,"LUTFI3",name,actor,time,requestId);
const roster=(name:string,row=53)=>({complete:true as const,sheets:[
 {sheetName:"PAYROLL-1" as const,rows:[]},
 {sheetName:"PAYROLL-2" as const,rows:[]},
 {sheetName:"PAYROLL-3" as const,rows:[{rowNumber:row,name}]},
]});

test("website admin requests a rename without immediately replacing Sheet-owned name",()=>{
 const state={[K.employees]:[base]};
 const next=request(state,"LUTFI BENAR3");
 assert.equal(next.pendingSheet,true);
 assert.equal((state[K.employees] as Employee[])[0].sheetNameCorrection,undefined);
 assert.equal(next.employee.name,"LUTFI3");
 assert.equal(next.employee.sheetNameCorrection?.newName,"LUTFI BENAR3");
 assert.equal(listPendingSheetNameCorrections(next.state,"other").length,0);
 assert.deepEqual(listPendingSheetNameCorrections(next.state,"source-namespace").map(x=>[x.sheetName,x.rowNumber,x.oldName,x.newName]),[["PAYROLL-3",53,"LUTFI3","LUTFI BENAR3"]]);
 assert.doesNotThrow(()=>validateWorkspace(next.state));
 assert.doesNotThrow(()=>validateWorkspaceEdit(state,next.state,"admin"));
 assert.throws(()=>validateWorkspaceEdit(state,next.state),/koreksi nama Sheet/i);
});

test("source sync accepts only exact authorized rename at the original Sheet row, keeping id and code",()=>{
 const original={[K.employees]:[base]};
 const pending=request(original,"LUTFI BENAR3").state;
 mergeGoogleSheetRoster(pending,roster("LUTFI BENAR3"),"source-namespace","2026-10-13T04:01:00Z");
 const result=(pending[K.employees] as Employee[])[0];
 assert.equal(result.id,base.id);assert.equal(result.code,base.code);
 assert.equal(result.name,"LUTFI BENAR3");assert.equal(result.sheetNameCorrection,undefined);
 assert.doesNotThrow(()=>validateWorkspaceEdit(request(original,"LUTFI BENAR3").state,pending,"sync"));
});

test("moving source row without a matching old name does not let a wrong row claim the rename",()=>{
 const pending=request({[K.employees]:[base]},"LUTFI BENAR3").state;
 mergeGoogleSheetRoster(pending,roster("LUTFI BENAR3",54),"source-namespace","2026-10-13T04:01:00Z");
 const all=(pending[K.employees] as Employee[]);
 assert.notEqual(all.find(e=>e.name==="LUTFI BENAR3")?.code,base.code);
});

test("wrong password-style or spreadsheet-formula names and duplicates fail before queuing",()=>{
 assert.throws(()=>request({[K.employees]:[base]},"=HYPERLINK(1)"),/tidak aman/);
 assert.throws(()=>request({[K.employees]:[base]},""),/tidak aman/);
 assert.throws(()=>request({[K.employees]:[base]},"LUTFI3"),/tidak berubah/);
 assert.throws(()=>request({[K.employees]:[base,{...base,id:"other",code:"OTHER",name:"LUTFI BENAR3"}]},"LUTFI BENAR3"),/sudah ada/);
});

test("manual employee rename is immediate, with unchanged ID, code, payroll and order history",()=>{
 const manual={...base,id:"manual-1",code:"EMP-0001",name:"Tono",sheetRosterSource:undefined};
 const state={[K.employees]:[manual],[K.closings]:[{id:"c1",employeeCode:"EMP-0001",employeeName:"Tono"}]};
 const changed=prepareEmployeeNameCorrection(state,manual.id,"Tono","Tono Benar",actor,time,requestId);
 assert.equal(changed.pendingSheet,false);
 assert.equal(changed.employee.code,"EMP-0001");
 assert.equal((changed.state[K.closings] as {employeeName:string}[])[0].employeeName,"Tono");
 assert.doesNotThrow(()=>validateWorkspaceEdit(state,changed.state,"admin"));
});
