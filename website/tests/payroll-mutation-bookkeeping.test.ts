import assert from "node:assert/strict";
import {test} from "node:test";
import { activeMutationRows, bookkeepingEntries, isBookedMutationRow, type BookkeepingClosing } from "../features/payroll/lib/mutation-bookkeeping";
import { expandMutationRows } from "../features/payroll/lib/mutation-rows";
import type { Order } from "../features/payroll/types/domain";

const orderedAt="2026-10-06T18:15:00.000Z";
function daily(): Order {
  return {
    id:"sheet:X2754", orderNumber:"X2754", externalReference:"X2754", source:"G2G",
    buyerName:"Customer 2754",orderName:"7 Days Package",game:"AION",service:"Boosting",
    scheduleMode:"daily",scheduleTotalDays:7,orderType:"boosting",
    quantity:7,grossMinor:700000,expectedPaymentMinor:700000,matchedPaymentMinor:0,
    operationalStatus:"partially_completed",financeStatus:"pending",orderedAt,dueAt:orderedAt,
    dailyWork:Array.from({length:7},(_,i)=>({
      id:`day-${i+1}`,sequence:i+1,workDate:`2026-10-${String(7+i).padStart(2,"0")}`,
      sourceTransferStatus:i<3?"DELIVERED":"PENDING",quantity:1,grossMinor:100000,rateMinor:100000,
      status:i<3?"verified" as const:"pending" as const,
      workerAssignments:[{id:`w-${i+1}`,employeeCode:"EMP-A",employeeName:"RANGGA",team:"FH3" as const,process:"JOKI",quantity:1}],
      ...(i<3?{payrollPeriodId:"closing-old",payrollClosedAt:"2026-10-13T05:00:00Z"}:{}),
    }))
  };
}
function simple(id:string,code:string): Order {
  return {id,orderNumber:code,externalReference:code,source:"G2G",buyerName:"Buyer",orderName:"Boosting",game:"AION",
    service:"Boosting",quantity:1,grossMinor:125200,expectedPaymentMinor:125200,matchedPaymentMinor:0,
    operationalStatus:"verified",financeStatus:"pending",orderedAt,dueAt:orderedAt};
}
const period=(id="closing-old"):BookkeepingClosing=>({
 id,from:"2026-10-06T01:15",to:"2026-10-13T23:59",closedAt:"2026-10-13T05:00:00Z",orderRefs:["X2754"],
});
test("only the three paid DAYs disappear, unclosed days of same X2754 stay in Mutasi",()=>{
 const order=daily();
 const open=activeMutationRows([order],[period()]);
 assert.deepEqual(open.map(row=>row.day?.sequence),[4,5,6,7]);
 assert.equal(open.reduce((n,row)=>n+row.grossMinor,0),400000);
 assert.equal(expandMutationRows([order]).length,7,"source order remains complete");
 const history=bookkeepingEntries([period()],[order]);
 assert.deepEqual(history.map(row=>row.row.day?.sequence),[1,2,3]);
 assert.equal(history.reduce((n,row)=>n+row.row.grossMinor,0),300000);
});
test("same DAY in a trusted immutable snapshot is hidden even when current order markers were lost",()=>{
 const order=daily();
 const latest={...order,dailyWork:order.dailyWork?.map(d=>({...d,payrollClosedAt:undefined,payrollPeriodId:undefined}))};
 const snap={...order,dailyWork:order.dailyWork?.slice(0,2).map(d=>({...d,payrollClosedAt:undefined,payrollPeriodId:undefined}))};
 const closing={...period(),ordersSnapshot:[snap]};
 assert.deepEqual(activeMutationRows([latest],[closing]).map(row=>row.day?.sequence),[3,4,5,6,7]);
 assert.deepEqual(bookkeepingEntries([closing],[latest]).map(entry=>entry.row.day?.sequence),[1,2]);
 assert.ok(bookkeepingEntries([closing],[latest]).every(entry=>entry.hasSnapshot));
});
test("legacy closing reference of daily order without DAY markers or snapshot NEVER archives all its days",()=>{
 const order=daily();
 order.dailyWork=order.dailyWork?.map(day=>({...day,payrollClosedAt:undefined,payrollPeriodId:undefined}));
 assert.equal(activeMutationRows([order],[period()]).length,7);
 assert.equal(bookkeepingEntries([period()],[order]).length,0);
});
test("already-closed ordinary order is removed and restored only in bookkeeping",()=>{
 const order={...simple("id-2","X2800"),payrollClosedAt:"2026-10-13T05:00:00Z",payrollPeriodId:"closing-other"};
 const closing:BookkeepingClosing={...period("closing-other"),orderRefs:["X2800"],ordersSnapshot:[{...order,payrollClosedAt:undefined,payrollPeriodId:undefined}]};
 assert.equal(activeMutationRows([order],[closing]).length,0);
 const rows=bookkeepingEntries([closing],[order]);
 assert.equal(rows.length,1);
 assert.equal(rows[0].row.order.externalReference,"X2800");
 assert.equal(rows[0].hasSnapshot,true);
});
test("an order before code X2754 is NOT automatically archived without proof of Closing",()=>{
 const before=simple("id-legacy","X2753");
 assert.equal(isBookedMutationRow(expandMutationRows([before])[0],[]),false);
 assert.equal(activeMutationRows([before],[]).length,1);
 assert.equal(bookkeepingEntries([],[before]).length,0);
});
test("repeated rendering or Sheet reimport cannot change visibility when Closing markers remain",()=>{
 const order=daily(),copy=JSON.parse(JSON.stringify(order)) as Order;
 assert.deepEqual(activeMutationRows([copy],[period()]).map(row=>row.id),activeMutationRows([order],[period()]).map(row=>row.id));
 assert.equal(copy.dailyWork?.length,7);
});
