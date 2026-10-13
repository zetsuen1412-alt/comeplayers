import type { Order, OrderDailyWork, OrderIssue } from "../types/domain";
import { getOrderAssignments } from "./order-workers";
import { getDailyPayrollValidationError } from "./daily-orders";
import { analyzeOrderQuantityIssues } from "./order-quantity";

export const PAYROLL_NEW_BOOK_START = "2026-10-06T01:15";
export const PAYROLL_NEW_BOOK_START_ISO = "2026-10-05T18:15:00.000Z";

export type SheetTransferStatus = "DELIVERED" | "PENDING" | "UNKNOWN";
export function sheetTransferStatus(value: unknown): SheetTransferStatus {
  const text=String(value??"").trim().toUpperCase();
  return text==="DELIVERED"?"DELIVERED":text==="PENDING"?"PENDING":"UNKNOWN";
}
function issue(code: string, description: string): OrderIssue {
  return {code,title:"Perlu pemeriksaan admin",description,severity:"high",source:"import"};
}
const criticalImportIssues = new Set([
 "sheet_game_unmatched","sheet_order_type_unknown","sheet_booster_unmatched",
 "sheet_workers_review","sheet_workers_empty","sheet_daily_workers_review",
 "sheet_daily_worker_share_review",
]);

/** Read-only payroll cutover partition. It NEVER performs a financial Closing. */
export function bookForOrder(orderedAt:string) {
  const epoch=Date.parse(orderedAt);
  return Number.isFinite(epoch)&&epoch<Date.parse(PAYROLL_NEW_BOOK_START_ISO)?"old":"new";
}
export function automaticSingleDelivery(order: Order): Order {
  if(sheetTransferStatus(order.transferStatus)!=="DELIVERED")return order;
  const assignments=getOrderAssignments(order);
  const blocked=order.grossMinor<=0 || !order.orderType || !order.game?.trim() ||
    !assignments.length || assignments.some(row=>!row.employeeCode||!row.employeeName||row.quantity<=0) ||
    (order.importIssues??[]).some(row=>criticalImportIssues.has(row.code)||row.severity==="high"||row.severity==="critical") ||
    analyzeOrderQuantityIssues(order).length>0;
  if(blocked) {
    return {...order,operationalStatus:"on_hold",importNeedsReview:true,
      importIssues:[...(order.importIssues??[]),issue("sheet_delivered_needs_review",
      "STATUS TRANSFER = DELIVERED, tetapi karyawan, jenis order, nilai atau pembagiannya belum valid. Belum masuk gaji.")]};
  }
  // Sheet does not record a delivery timestamp: use the source order timestamp
  // ONLY for period placement, never claim it is the real delivery time.
  return {...order,operationalStatus:"verified",completedAt:order.orderedAt,verifiedAt:order.orderedAt};
}
export function automaticDailyDelivery(order: Order): Order {
  if(order.scheduleMode!=="daily")return order;
  const dailyWork=(order.dailyWork??[]).map(day=>{
    const status=sheetTransferStatus(day.sourceTransferStatus);
    if(status!=="DELIVERED")return {...day,status:"pending" as const,completedAt:undefined,verifiedAt:undefined};
    const error=getDailyPayrollValidationError(order,day);
    const blocked=Boolean(error)||day.grossMinor<=0||!order.orderType||
      (day.issues??[]).some(entry=>criticalImportIssues.has(entry.code)||entry.severity==="high"||entry.severity==="critical");
    if(blocked)return {...day,status:"on_hold" as const,issues:[
      ...(day.issues??[]),issue("sheet_daily_delivered_needs_review",
        `Hari ${day.sequence} DELIVERED tetapi belum valid: ${error??"periksa RATE, nilai dan karyawan"}.`)]};
    return {...day,status:"verified" as const,completedAt:day.sourceOrderedAt??order.orderedAt,
      verifiedAt:day.sourceOrderedAt??order.orderedAt};
  });
  // Keep only source-proven rows. This does not fabricate the missing days.
  const completed=dailyWork.filter(day=>day.status==="verified").length;
  const isComplete=completed>0 && completed===order.scheduleTotalDays && dailyWork.length===order.scheduleTotalDays;
  return {...order,dailyWork,operationalStatus:isComplete?"verified":completed?"partially_completed":"assigned",
    verifiedAt:isComplete?dailyWork.at(-1)?.verifiedAt:undefined,
    completedAt:isComplete?dailyWork.at(-1)?.completedAt:undefined};
}
export function eligibleTransferForPayroll(order: Order, day?: OrderDailyWork) {
  const status=sheetTransferStatus(day?day.sourceTransferStatus:order.transferStatus);
  // Legacy/manual orders lacking a transfer field preserve their established
  // admin-verification workflow; a KNOWN PENDING must never become salary.
  return status!=="PENDING";
}
