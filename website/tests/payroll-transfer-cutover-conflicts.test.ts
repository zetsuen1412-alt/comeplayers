import assert from "node:assert/strict";
import {test} from "node:test";
import {mergeGoogleSheetPayroll,type GoogleSheetSyncPayload,type GoogleSheetSyncRow} from "../features/payroll/lib/google-sheet-sync";
import {workspaceKeys as K,validateWorkspace,validateWorkspaceEdit,closeWorkspace} from "../features/payroll/lib/workspace-model";
import {isPayrollEligible,buildLivePayrollRows} from "../features/payroll/lib/payroll-live";
import {bookForOrder,PAYROLL_NEW_BOOK_START_ISO} from "../features/payroll/lib/sheet-transfer-payroll";
import {unrelatedCodeIdentity} from "../features/payroll/lib/sheet-code-collision";
import type {Order,Employee} from "../features/payroll/types/domain";

const emp:Employee={id:"e1",code:"EMP-RANGGA",name:"RANGGA",team:"FH3",workforceStatus:"SHIFT",utilization:0,earningsMinor:0};
const base=()=>({[K.orders]:[] as Order[],[K.employees]:[emp],[K.products]:[{id:"g1",code:"ANII",name:"ANII",regions:[],active:true}]});
const headers=["TANGGAL","KODE","GATE","NAMA BUYER","NAMA ORDER","BOOSTER","FH","STATUS","GAME","PROSES","JUMLAH","RATE","TOTAL","STATUS TRANSFER"];
function row(rowNumber:number,transfer:string,code="X3180",buyer="G2G Customer Rahmat",title="Leveling 30-60",booster="RANGGA",date="06/10/2026 1:15"):GoogleSheetSyncRow {
 const values=[date,code,"G2G",buyer,title,booster,"3","START","ANII","JOKI",1,125200,125200,transfer];
 return {rowNumber,values,display:values.map(String),boosterBlack:false};
}
function payload(rows:GoogleSheetSyncRow[]):GoogleSheetSyncPayload {
 return {version:1,syncMode:"reconcile",spreadsheetId:"book-source",sheetName:"MUTASI FH",headers,
  sentAt:"2026-10-13T06:00:00.000Z",rows};
}
const orders=(state:Record<string,unknown>)=>state[K.orders] as Order[];
test("cutover places exactly 06/10/2026 01.15 WIB in new book, one second earlier in old",()=>{
 assert.equal(PAYROLL_NEW_BOOK_START_ISO,"2026-10-05T18:15:00.000Z");
 assert.equal(bookForOrder("2026-10-05T18:14:59.000Z"),"old");
 assert.equal(bookForOrder(PAYROLL_NEW_BOOK_START_ISO),"new");
 const found=mergeGoogleSheetPayroll(base(),payload([row(5848,"DELIVERED")]));
 assert.equal(orders(found.state)[0].orderedAt,PAYROLL_NEW_BOOK_START_ISO);
 assert.equal(bookForOrder(orders(found.state)[0].orderedAt),"new");
});
test("DELIVERED automatically enters live salary if order has a known game, valid employee and allocations",()=>{
 const first=mergeGoogleSheetPayroll(base(),payload([row(5848,"Delivered")]));
 const order=orders(first.state)[0];
 assert.equal(order.transferStatus,"DELIVERED");
 assert.equal(order.operationalStatus,"verified");
 assert.equal(isPayrollEligible(order),true);
 assert.equal(buildLivePayrollRows([order],{employees:[emp],defaultSharePercent:50})[0].gross,125200);
 assert.doesNotThrow(()=>validateWorkspace(first.state));
 assert.doesNotThrow(()=>validateWorkspaceEdit(base(),first.state,"sync"));
});
test("PENDING never enters salary even when a website user sets verified",()=>{
 const first=mergeGoogleSheetPayroll(base(),payload([row(5848,"Pending")]));
 const order=orders(first.state)[0];
 assert.equal(order.transferStatus,"PENDING");
 assert.equal(order.operationalStatus,"draft");
 assert.equal(isPayrollEligible(order),false);
 assert.equal(isPayrollEligible({...order,operationalStatus:"verified",verifiedAt:order.orderedAt}),false);
 assert.equal(buildLivePayrollRows([{...order,operationalStatus:"verified"}],{employees:[emp]}).filter(r=>r.orderRefs.length).length,0);
});
test("DELIVERED with unmatched employee is marked problematic and excluded from salary",()=>{
 const first=mergeGoogleSheetPayroll(base(),payload([row(5848,"Delivered","X3180","Buyer","Leveling 30-60","NOT A WORKER")]));
 const order=orders(first.state)[0];
 assert.equal(order.operationalStatus,"on_hold");
 assert.equal(isPayrollEligible(order),false);
 assert.ok(order.importIssues?.some(issue=>issue.code==="sheet_delivered_needs_review"));
});
test("reused KODE with unrelated buyer or order title is not overwritten and appears in Sheet conflicts",()=>{
 const old=mergeGoogleSheetPayroll(base(),payload([row(5848,"Pending")]));
 const different=mergeGoogleSheetPayroll(old.state,payload([row(5848,"Delivered","X3180","G2G someone else","Buy 90M FFXIV")]));
 assert.equal(different.skippedConflicts,1);
 assert.equal(orders(different.state)[0].buyerName,"G2G Customer Rahmat");
 assert.equal(orders(different.state)[0].operationalStatus,"on_hold");
 assert.ok(orders(different.state)[0].importIssues?.some(issue=>issue.code==="sheet_code_collision"));
 const alerts=different.state[K.sheetCodeConflicts] as {code:string;message:string}[];
 assert.equal(alerts.length,1);
 assert.match(alerts[0].message,/buyer atau nama order/);
 assert.equal(isPayrollEligible(orders(different.state)[0]),false);
 const again=mergeGoogleSheetPayroll(different.state,payload([row(5848,"Delivered","X3180","G2G someone else","Buy 90M FFXIV")]));
 assert.equal(again.conflictsUpdated,0);
 const repaired=mergeGoogleSheetPayroll(different.state,payload([row(5848,"DELIVERED")]));
 assert.equal((repaired.state[K.sheetCodeConflicts] as unknown[]).length,0);
 assert.equal(repaired.conflictsUpdated,1);
 assert.equal(orders(repaired.state)[0].operationalStatus,"verified");
});
test("same KODE with mismatched buyers in one batch has alert without creating a fake transaction",()=>{
 const a=row(5848,"Delivered");a.duplicateCode=true;
 const b=row(5849,"Pending","X3180","G2G Totally Different","Gold Delivery");b.duplicateCode=true;
 const result=mergeGoogleSheetPayroll(base(),payload([a,b]));
 assert.equal(result.skippedConflicts,2);
 assert.equal(orders(result.state).length,0);
 assert.equal((result.state[K.sheetCodeConflicts] as unknown[]).length,1);
});
test("a repeated code with matching buyer and title stays the same identity",()=>{
 const one=row(5848,"Pending");
 const next=row(5848,"Delivered","X3180","Customer Rahmat","Leveling 30-60");
 assert.equal(unrelatedCodeIdentity({buyerName:"G2G Customer Rahmat",orderName:"Leveling 30-60",service:"Leveling 30-60"},
  {buyerName:"Customer Rahmat",orderName:"Leveling 30-60",service:"Leveling 30-60"}),false);
 const first=mergeGoogleSheetPayroll(base(),payload([one]));
 const result=mergeGoogleSheetPayroll(first.state,payload([next]));
 assert.equal(result.skippedConflicts,0);
 assert.equal(result.added,0);
 assert.equal(orders(result.state)[0].id,orders(first.state)[0].id);
});
test("mixed daily transfers only put DELIVERED day in payroll, never the PENDING day",()=>{
 const first=row(5900,"Delivered","DAILY-X","Customer Rahmat","1 Week Package (6 Hours/Day)","RANGGA D1");
 const second=row(5901,"Pending","DAILY-X","Customer Rahmat","1 Week Package (6 Hours/Day)","RANGGA D2","07/10/2026 1:15");
 const group={...first,codeOccurrences:2,dailyPackage:{complete:true as const,rows:[first,second]}};
 const result=mergeGoogleSheetPayroll(base(),payload([group]));
 const order=orders(result.state)[0];
 assert.equal(order.scheduleMode,"daily");
 assert.deepEqual(order.dailyWork?.map(day=>[day.sequence,day.status,day.sourceTransferStatus]),[[1,"verified","DELIVERED"],[2,"pending","PENDING"]]);
 assert.equal(isPayrollEligible(order),true);
 assert.equal(buildLivePayrollRows([order],{employees:[emp],defaultSharePercent:50})[0].gross,125200);
 const allDone={...group,dailyPackage:{complete:true as const,rows:[first,{...second,values:[...second.values.slice(0,-1),"DELIVERED"],display:[...second.display!.slice(0,-1),"DELIVERED"]}]}};
 const later=mergeGoogleSheetPayroll(result.state,payload([allDone]));
 assert.equal(orders(later.state)[0].dailyWork?.filter(day=>day.status==="verified").length,2);
});

test("closing old book before 01.15 keeps exact-boundary DELIVERED in the new live book and PENDING outside salary",()=>{
 const old=row(5847,"DELIVERED","OLD-X","Customer Rahmat","Leveling 30-60","RANGGA","06/10/2026 1:14");
 const newOrder=row(5848,"DELIVERED","NEW-X","Customer Rahmat","Leveling 30-60","RANGGA","06/10/2026 1:15");
 const pending=row(5849,"PENDING","WAIT-X","Customer Rahmat","Leveling 30-60","RANGGA","06/10/2026 1:16");
 const state=mergeGoogleSheetPayroll(base(),payload([old,newOrder,pending])).state;
 state[K.lock]={id:"lock-historical",from:"2026-10-01T00:00",to:"2026-10-06T01:14:59",
   lockedBy:"Admin",lockedAt:"2026-10-13T06:00:00Z"};
 state[K.advances]=[];
 state[K.settings]={defaultSharePercent:50,employeeSharePercent:{},adjustments:{}};
 const closed=closeWorkspace(state,"2026-10-13T06:05:00Z");
 assert.deepEqual(closed.record.orderRefs,["OLD-X"]);
 const after=orders(closed.state);
 assert.ok(after.find(x=>x.externalReference==="OLD-X")?.payrollClosedAt);
 assert.equal(after.find(x=>x.externalReference==="NEW-X")?.payrollClosedAt,undefined);
 assert.equal(isPayrollEligible(after.find(x=>x.externalReference==="NEW-X")!),true);
 assert.equal(isPayrollEligible(after.find(x=>x.externalReference==="WAIT-X")!),false);
});
test("unresolved duplicate code cannot be paid even if original source order was DELIVERED",()=>{
 const initial=mergeGoogleSheetPayroll(base(),payload([row(5848,"DELIVERED")])).state;
 initial[K.sheetCodeConflicts]=[{id:"sheet-code-conflict:book-source:X3180",spreadsheetId:"book-source",code:"X3180",
   sourceRow:5849,message:"Buyer dan order lain memakai kode ini",detectedAt:"2026-10-13T06:00:00Z"}];
 initial[K.lock]={id:"book-lock",from:"2026-10-06T01:15",to:"2026-10-13T23:59",
   lockedBy:"Admin",lockedAt:"2026-10-13T06:00:00Z"};
 assert.throws(()=>closeWorkspace(initial,"2026-10-13T06:05:00Z"),/Tidak ada order/);
});
