import assert from "node:assert/strict";
import {test} from "node:test";
import {mergeGoogleSheetPayroll,type GoogleSheetSyncPayload,type GoogleSheetSyncRow} from "../features/payroll/lib/google-sheet-sync";
import {workspaceKeys as K,validateWorkspace,validateWorkspaceEdit,closeWorkspace} from "../features/payroll/lib/workspace-model";
import {activeMutationRows,bookkeepingEntries} from "../features/payroll/lib/mutation-bookkeeping";
import {isPayrollEligible,buildLivePayrollRows} from "../features/payroll/lib/payroll-live";
import {getPayrollEligibleGrossMinor,dailySegmentsForPeriod} from "../features/payroll/lib/daily-orders";
import {FH_NEW_BOOK_ROW,isPreX2754SheetOrder,legacyRowId,type LegacyMutationSnapshot} from "../features/payroll/lib/legacy-fh-cutover";
import type {Employee,Order} from "../features/payroll/types/domain";

const employee:Employee={id:"worker-1",code:"EMP-DEDE",name:"DEDE",team:"FH3",workforceStatus:"SHIFT",utilization:0,earningsMinor:0};
const headers=["TANGGAL","KODE","GATE","NAMA BUYER","NAMA ORDER","BOOSTER","FH","STATUS","GAME","PROSES","JUMLAH","RATE","TOTAL","STATUS TRANSFER"];
function item(n:number,code:string,status="DELIVERED"):GoogleSheetSyncRow {
  const values=[n===5848?"06/10/2026 1:15":"06/10/2026 1:14",code,"G2G","G2G Buyer"+n,"12 Hours Package", "DEDE","3","START","ANII","JOKI",1,336000,336000,status];
  return {rowNumber:n,values,display:values.map(String)};
}
function base():Record<string,unknown> {
  return {[K.orders]:[],[K.employees]:[employee],[K.products]:[{id:"g1",code:"ANII",name:"ANII",regions:[],active:true}]};
}
function send(rows:GoogleSheetSyncRow[]):GoogleSheetSyncPayload {
  return {version:1,spreadsheetId:"source-sheet",sheetName:"MUTASI FH",headerRow:2,headers,syncMode:"reconcile",
    newOrdersStartRow:FH_NEW_BOOK_ROW,sentAt:"2026-10-13T08:00:00.000Z",rows};
}
const archive=(state:Record<string,unknown>)=>(state[K.legacyFhArchive]??[]) as LegacyMutationSnapshot[];
const orders=(state:Record<string,unknown>)=>(state[K.orders]??[]) as Order[];

test("all distinct old spreadsheet ROWS are archived without live orders or fresh Closing, including duplicate KODE",()=>{
 const old1=item(3,"EGX8365"),old2=item(4,"EGX8365","MOVED"),old3=item(5846,"X2780","PENDING");
 const result=mergeGoogleSheetPayroll(base(),send([old1,old2,old3]));
 assert.equal(result.legacyArchived,3);
 assert.equal(archive(result.state).length,3);
 assert.deepEqual(archive(result.state).map(x=>x.sourceRow),[3,4,5846]);
 assert.equal(archive(result.state)[1].transferStatus,"MOVED");
 assert.equal(archive(result.state)[0].id,legacyRowId("source-sheet",3));
 assert.equal(orders(result.state).length,0);
 assert.equal(result.state[K.closings],undefined);
 assert.doesNotThrow(()=>validateWorkspace(result.state));
 assert.doesNotThrow(()=>validateWorkspaceEdit(base(),result.state,"sync"));
 assert.throws(()=>validateWorkspaceEdit(base(),result.state),/Arsip Mutasi FH/);
});
test("X2754 on row 5848 and all rows below remain LIVE; Delivered can pay and Pending cannot",()=>{
 const state=mergeGoogleSheetPayroll(base(),send([item(5846,"OLD-X"),item(5848,"X2754"),item(5849,"X3085","PENDING")])).state;
 assert.equal(archive(state).length,1);
 const live=orders(state);
 assert.equal(live.length,2);
 assert.deepEqual(activeMutationRows(live,[]).map(x=>x.order.externalReference),["X2754","X3085"]);
 assert.equal(live.find(x=>x.externalReference==="X2754")?.operationalStatus,"verified");
 assert.equal(isPayrollEligible(live.find(x=>x.externalReference==="X2754")!),true);
 assert.equal(isPayrollEligible(live.find(x=>x.externalReference==="X3085")!),false);
});
test("historic snapshot is immutable across later Sheet edits and the re-import is idempotent",()=>{
 const first=mergeGoogleSheetPayroll(base(),send([item(5846,"OLD-X")]));
 assert.equal(first.legacyArchived,1);
 const changed=item(5846,"NEW-WRONG");
 const next=mergeGoogleSheetPayroll(first.state,send([changed]));
 assert.equal(next.legacyArchived,0);
 assert.equal(archive(next.state)[0].code,"OLD-X");
 assert.equal(archive(next.state)[0].grossMinor,336000);
});
test("existing imported pre-X2754 order disappears from Mutasi and cannot be paid again",()=>{
 const old=mergeGoogleSheetPayroll(base(),{...send([item(5846,"OLD-X")]),newOrdersStartRow:undefined}).state;
 const historical=orders(old)[0];
 assert.ok(historical);
 assert.equal(isPreX2754SheetOrder(historical),true);
 assert.equal(activeMutationRows([historical],[]).length,0);
 assert.equal(getPayrollEligibleGrossMinor(historical),0);
 assert.equal(isPayrollEligible(historical),false);
 assert.equal(buildLivePayrollRows([historical],{employees:[employee]}).filter(row=>row.orderRefs.length).length,0);
});
test("daily boosting spanning X2754 pays only the new DAY; old DAY stays hidden",()=>{
 const sourceOrder=mergeGoogleSheetPayroll(base(),send([item(5848,"X2754")])).state;
 const order=orders(sourceOrder)[0];
 const oldDay={id:"old-day",sequence:1,sourceRow:5845,workDate:"2026-10-05",status:"verified" as const,verifiedAt:"2026-10-05T07:15:00Z",grossMinor:120000,rateMinor:120000,quantity:1,sourceTransferStatus:"DELIVERED",workerAssignments:[{id:"old-worker",employeeCode:"EMP-DEDE",employeeName:"DEDE",team:"FH3" as const,process:"JOKI",quantity:1}]};
 const newDay={...oldDay,id:"new-day",sequence:2,sourceRow:5848,workDate:"2026-10-06",grossMinor:336000,rateMinor:336000,verifiedAt:"2026-10-05T18:15:00Z"};
 const mixed:Order={...order,scheduleMode:"daily",scheduleTotalDays:2,dailyWork:[oldDay,newDay],operationalStatus:"verified",grossMinor:456000};
 assert.deepEqual(activeMutationRows([mixed],[]).map(row=>row.day?.sourceRow),[5848]);
 assert.equal(getPayrollEligibleGrossMinor(mixed),336000);
 assert.deepEqual(dailySegmentsForPeriod(mixed,0,Date.parse("2026-10-13T00:00:00Z")).map(row=>row.sourceRow),[5848]);
 assert.equal(buildLivePayrollRows([mixed],{employees:[employee]})[0].gross,336000);
 assert.equal(bookkeepingEntries([], [mixed]).length,0, "legacy is not a fabricated paid Closing");
});
test("manual order with same or older numeric KODE is never archived based on KODE",()=>{
 const manual:Order={id:"manual-order",orderNumber:"1",externalReference:"X100",source:"Manual",buyerName:"Buyer",
  orderName:"Boost",game:"ANII",service:"JOKI",quantity:1,grossMinor:50000,expectedPaymentMinor:50000,
  matchedPaymentMinor:0,operationalStatus:"verified",financeStatus:"pending",orderedAt:"2026-10-05T18:00:00Z",
  dueAt:"2026-10-05T18:00:00Z"};
 assert.equal(isPreX2754SheetOrder(manual),false);
 assert.equal(activeMutationRows([manual],[]).length,1);
});
