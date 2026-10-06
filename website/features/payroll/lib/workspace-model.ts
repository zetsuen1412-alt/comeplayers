import { manualOrderCode } from './manual-order-code';
import { analyzeOrderQuantityIssues } from './order-quantity';
import { buildLivePayrollRows, isPayrollEligible } from './payroll-live';
import { createDailyPayrollSlice, dailySegmentsForPeriod, getDailyAssignments, getDailyPayrollValidationError, hasCompleteDailySchedule, isDailySettlementOrder } from './daily-orders';
import { jakartaDateTimeInputToISO } from './date';
import type { Order, Employee } from '../types/domain';
import type { PayrollSettings } from './demo-payroll-settings-store';
import type { KasbonRecord } from './demo-advance-store';
import type { DemoPeriodLock } from './demo-period-lock-store';

export const workspaceKeys = {
  orders: 'cp-ofs-demo-user-orders-v3', employees: 'cp-ofs-demo-employees-v2',
  advances: 'cp-ofs-demo-kasbon-v2', settings: 'cp-ofs-demo-payroll-settings-v3',
  inventory: 'cp-ofs-demo-inventory-v4', movements: 'cp-ofs-demo-inventory-movements-v1',
  products: 'cp-ofs-demo-product-games-v1', history: 'cp-ofs-demo-mutation-history-v1',
  closings: 'cp-ofs-demo-closing-v1', lock: 'cp-ofs-demo-period-lock-v1',
} as const;
export type WorkspaceState = Record<string, unknown>;
export function payrollFailure(message: string, status = 400): never { throw Object.assign(new Error(message), {status}); }
export function canonical(value: unknown): string {
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if(value && typeof value === 'object') return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value) ?? 'null';
}
function recordedClosingReferences(state: WorkspaceState) {
  const references=new Set<string>();
  for(const record of (state[workspaceKeys.closings]??[]) as Array<{orderRefs?:unknown;ordersSnapshot?:unknown}>) {
    for(const reference of Array.isArray(record.orderRefs)?record.orderRefs:[]) {
      if(typeof reference==='string') references.add(reference.trim().toLowerCase());
    }
    for(const snapshot of Array.isArray(record.ordersSnapshot)?record.ordersSnapshot:[]) {
      if(snapshot&&typeof snapshot.externalReference==='string') references.add(snapshot.externalReference.trim().toLowerCase());
    }
  }
  return references;
}
function hasLegacyWholeClosing(order: Order, references: Set<string>) {
  return references.has(order.externalReference.trim().toLowerCase())
    &&(!isDailySettlementOrder(order)||!(order.dailyWork??[]).some(day=>day.payrollClosedAt||day.payrollPeriodId));
}
export function validateWorkspace(value: unknown): WorkspaceState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) payrollFailure('Data payroll tidak valid.');
  const state=value as WorkspaceState, allowed=new Set<string>(Object.values(workspaceKeys));
  let count=0;
  function visit(v: unknown, depth=0) {
    if(++count>250000 || depth>16) payrollFailure('Data payroll terlalu besar.',413);
    if(typeof v==='number' && (!Number.isFinite(v)||Math.abs(v)>1e13)) payrollFailure('Nilai angka payroll tidak valid.');

    if(Array.isArray(v)) { if(v.length>20000) payrollFailure('Batas jumlah data tercapai.',413); for(const item of v) visit(item,depth+1); }
    else if(v && typeof v==='object') for(const [k,item] of Object.entries(v)) {
      if(['__proto__','constructor','prototype'].includes(k)) payrollFailure('Nama field tidak valid.'); visit(item,depth+1);
    }
  }
  for(const [key,data] of Object.entries(state)) {
    if(!allowed.has(key)) payrollFailure('Jenis data payroll tidak dikenal.');
    if(key!==workspaceKeys.settings && key!==workspaceKeys.lock && !Array.isArray(data)) payrollFailure('Daftar payroll tidak valid.');
    visit(data);
  }
  const list=(key:string)=> (state[key]??[]) as Array<Record<string,unknown>>;
  for(const key of [workspaceKeys.orders,workspaceKeys.employees,workspaceKeys.advances,workspaceKeys.inventory,workspaceKeys.movements,workspaceKeys.products,workspaceKeys.history,workspaceKeys.closings]) {
    const ids=new Set<string>();
    for(const row of list(key)) {
      if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id||ids.has(row.id)) payrollFailure('Identitas baris payroll tidak valid atau duplikat.');
      ids.add(row.id);
    }
  }
  const teams=['FH1','FH2','FH3','ADMIN','BANDAR'];
  const employeeCodes=new Set<string>();
  for(const e of list(workspaceKeys.employees)) {
    if(typeof e.code!=='string'||!e.code||employeeCodes.has(e.code)||typeof e.name!=='string'||!teams.includes(String(e.team))||!['NEW','SHIFT','FULL','SAKIT','IJIN','RESIGN'].includes(String(e.workforceStatus))) payrollFailure('Data karyawan tidak valid.');
    employeeCodes.add(e.code);
  }
  const references=new Set<string>();
  for(const row of list(workspaceKeys.orders)) {
    if(row.assignmentMode!==undefined&&(!['leader','direct'].includes(String(row.assignmentMode))||!teams.includes(String(row.team)))) payrollFailure('Pilih divisi dan cara penentuan karyawan yang valid.');
    if(row.assignmentMode!==undefined&&row.orderType==='gold'&&!['FH1','FH2','FH3'].includes(String(row.team))) payrollFailure('Divisi Gold harus FH1, FH2, atau FH3.');
    if(row.sheetSyncLocked!==undefined&&typeof row.sheetSyncLocked!=='boolean') payrollFailure('Kunci sinkronisasi tidak valid.');
    if(row.sheetDeletedAt!==undefined&&(typeof row.sheetDeletedAt!=='string'||!Number.isFinite(Date.parse(row.sheetDeletedAt)))) payrollFailure('Arsip spreadsheet tidak valid.');
    if(row.websiteDeletedAt!==undefined&&(typeof row.websiteDeletedAt!=='string'||!Number.isFinite(Date.parse(row.websiteDeletedAt)))) payrollFailure('Arsip website tidak valid.');
    if(row.websiteDeletedBy!==undefined&&(typeof row.websiteDeletedBy!=='string'||row.websiteDeletedBy.length>200)) payrollFailure('Nama pengarsip tidak valid.');
    if(typeof row.externalReference!=='string'||!row.externalReference.trim()||references.has(row.externalReference.trim().toLowerCase())) payrollFailure('Kode order kosong atau duplikat.');
    references.add(row.externalReference.trim().toLowerCase());
    for(const key of ['grossMinor','quantity','expectedPaymentMinor','matchedPaymentMinor']) if(typeof row[key]!=='number'||Number(row[key])<0) payrollFailure('Angka order tidak valid.');
    if(!Number.isFinite(Date.parse(String(row.orderedAt)))) payrollFailure('Tanggal order tidak valid.');
    const validateAssignments=(assignments: unknown)=>{
      if(assignments!==undefined&&!Array.isArray(assignments)) payrollFailure('Penugasan order tidak valid.');
      for(const assignment of (assignments??[]) as Array<Record<string,unknown>>) {
        if(!assignment||typeof assignment.employeeCode!=='string'||typeof assignment.employeeName!=='string'||typeof assignment.quantity!=='number'||assignment.quantity<0||!teams.includes(String(assignment.team))) payrollFailure('Penugasan order tidak valid.');
      }
    };
    validateAssignments(row.workerAssignments);
    if(row.scheduleTotalDays!==undefined&&(!Number.isInteger(row.scheduleTotalDays)||Number(row.scheduleTotalDays)<1||Number(row.scheduleTotalDays)>366)) payrollFailure('Jumlah hari paket tidak valid.');
    if(row.dailyHours!==undefined&&(typeof row.dailyHours!=='number'||row.dailyHours<=0||row.dailyHours>24)) payrollFailure('Jam kerja harian tidak valid.');
    if(row.dailyWork!==undefined&&!Array.isArray(row.dailyWork)) payrollFailure('Daftar pekerjaan harian tidak valid.');
    const dailyIds=new Set<string>(), dailySequences=new Set<number>();
    for(const day of (row.dailyWork??[]) as Array<Record<string,unknown>>) {
      if(!day||typeof day.id!=='string'||!day.id||!Number.isInteger(day.sequence)||Number(day.sequence)<1||Number(day.sequence)>366) payrollFailure('Identitas hari pekerjaan tidak valid.');
      if(dailyIds.has(day.id)||dailySequences.has(Number(day.sequence))
        ||(row.scheduleTotalDays!==undefined&&Number(day.sequence)>Number(row.scheduleTotalDays))) payrollFailure('Identitas atau urutan hari pekerjaan duplikat/di luar paket.');
      dailyIds.add(day.id); dailySequences.add(Number(day.sequence));
      if(typeof day.workDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day.workDate)||!Number.isFinite(Date.parse(day.workDate+'T12:00:00+07:00'))) payrollFailure('Tanggal pekerjaan harian tidak valid.');
      if(typeof day.grossMinor!=='number'||day.grossMinor<0||!['pending','in_progress','verified','on_hold'].includes(String(day.status))) payrollFailure('Nilai atau status pekerjaan harian tidak valid.');
      if(day.quantity!==undefined&&(typeof day.quantity!=='number'||day.quantity<=0)) payrollFailure('Jumlah pekerjaan harian tidak valid.');
      if(day.hours!==undefined&&(typeof day.hours!=='number'||day.hours<=0||day.hours>24)) payrollFailure('Jam kerja harian tidak valid.');
      validateAssignments(day.workerAssignments);
    }
  }
  for(const row of list(workspaceKeys.advances)) if(typeof row.amountMinor!=='number'||typeof row.remainingMinor!=='number'||row.amountMinor<0||row.remainingMinor<0||row.remainingMinor>row.amountMinor) payrollFailure('Saldo kasbon tidak valid.');
  const settings=state[workspaceKeys.settings] as PayrollSettings|undefined;
  if(settings) {
    if(typeof settings!=='object'||Array.isArray(settings)||!settings.employeeSharePercent||!settings.adjustments) payrollFailure('Pengaturan gaji tidak valid.');
    for(const p of [settings.defaultSharePercent,...Object.values(settings.employeeSharePercent)]) if(typeof p!=='number'||p<0||p>100) payrollFailure('Persentase gaji harus 0 sampai 100.');
    for(const a of Object.values(settings.adjustments)) for(const n of [a.operationalMinor,a.penaltyMinor,a.bonusTipsMinor]) if(!Number.isSafeInteger(n)||n<0) payrollFailure('Potongan/bonus harus bilangan rupiah yang valid.');
  }
  const lock=state[workspaceKeys.lock] as DemoPeriodLock|undefined;
  if(lock) {
    if(typeof lock.from!=='string'||typeof lock.to!=='string') payrollFailure('Periode kunci tidak valid.');
    const from=Date.parse(jakartaDateTimeInputToISO(lock.from)),to=Date.parse(jakartaDateTimeInputToISO(lock.to));
    if(!Number.isFinite(from)||!Number.isFinite(to)||from>to) payrollFailure('Rentang kunci tidak valid.');
  }
  return state;
}
export function validateWorkspaceEdit(previous: WorkspaceState, next: WorkspaceState) {
  validateWorkspace(next);
  if(previous[workspaceKeys.lock]) {
    const before={...previous},after={...next}; delete before[workspaceKeys.lock]; delete after[workspaceKeys.lock];
    if(canonical(before)!==canonical(after)) payrollFailure('Sistem dikunci. Buka kunci sebelum mengedit.',423);
  }
  if(canonical(previous[workspaceKeys.closings]??[])!==canonical(next[workspaceKeys.closings]??[])) payrollFailure('Closing hanya dapat dibuat melalui proses tutup buku.',409);
  const oldOrders=(previous[workspaceKeys.orders]??[]) as Order[], newOrders=(next[workspaceKeys.orders]??[]) as Order[];
  const closingReferences=recordedClosingReferences(previous);
  for(const old of oldOrders) if(hasLegacyWholeClosing(old,closingReferences)
    &&canonical(old)!==canonical(newOrders.find(order=>order.id===old.id))) payrollFailure('Pesanan sudah tercatat di Closing lama dan tidak dapat diubah atau dihapus.',409);
  for(const old of oldOrders.filter(o=>o.payrollClosedAt||o.payrollPeriodId||o.financeStatus==='closed')) if(canonical(old)!==canonical(newOrders.find(o=>o.id===old.id))) payrollFailure('Order yang sudah Closing tidak dapat diubah atau dihapus.',409);
  for(const old of oldOrders) {
    const current=newOrders.find(o=>o.id===old.id);
    const closedDays=(old.dailyWork??[]).filter(day=>day.payrollClosedAt||day.payrollPeriodId);
    if(!current) {
      if(closedDays.length) payrollFailure('Pesanan dengan hari yang sudah masuk Closing tidak dapat dihapus.',409);
      continue;
    }
    for(const closedDay of closedDays) {
      const nextDay=(current.dailyWork??[]).find(day=>day.id===closedDay.id);
      if(canonical(closedDay)!==canonical(nextDay)) payrollFailure('Hari pekerjaan yang sudah masuk Closing tidak dapat diubah atau dihapus.',409);
      if(nextDay&&canonical(getDailyAssignments(old,closedDay))!==canonical(getDailyAssignments(current,nextDay))) payrollFailure('Karyawan hari yang sudah masuk Closing tidak dapat diubah.',409);
    }
  }
  for(const order of newOrders) {
    const old=oldOrders.find(row=>row.id===order.id);
    if(!old||old.externalReference!==order.externalReference) {
      try { if(manualOrderCode(order.externalReference)!==order.externalReference) payrollFailure('Kode order tidak boleh diawali/diakhiri spasi.'); }
      catch(e) { payrollFailure(e instanceof Error?e.message:'Kode order tidak valid.'); }
    }
  }
  for(const order of newOrders) if(order.payrollClosedAt&&!oldOrders.some(old=>old.id===order.id&&old.payrollClosedAt===order.payrollClosedAt)) payrollFailure('Status Closing harus diproses di server.',409);
  for(const order of newOrders) {
    const old=oldOrders.find(row=>row.id===order.id);
    if(order.operationalStatus==='verified' && canonical(old)!==canonical(order)) assertOrderQuantityReady(order);
    for(const day of order.dailyWork??[]) {
      const oldDay=old?.dailyWork?.find(oldDay=>oldDay.id===day.id);
      if(day.status==='verified' && canonical(oldDay)!==canonical(day)) {
        const error=getDailyPayrollValidationError(order,day);
        if(error) payrollFailure(`Pesanan ${order.externalReference}: ${error}`,409);
      }
      if((day.payrollClosedAt&&oldDay?.payrollClosedAt!==day.payrollClosedAt)
        || (day.payrollPeriodId&&oldDay?.payrollPeriodId!==day.payrollPeriodId)) payrollFailure('Status Closing harian harus diproses di server.',409);
    }
  }
}
export function closeWorkspace(previous: WorkspaceState, now=new Date().toISOString()) {
  const next=structuredClone(validateWorkspace(previous)), lock=next[workspaceKeys.lock] as DemoPeriodLock|undefined;
  if(!lock) payrollFailure('Kunci periode sebelum Closing.',409);
  const orders=(next[workspaceKeys.orders]??[]) as Order[], employees=(next[workspaceKeys.employees]??[]) as Employee[], advances=(next[workspaceKeys.advances]??[]) as KasbonRecord[];
  const settings=(next[workspaceKeys.settings]??{defaultSharePercent:50,employeeSharePercent:{},adjustments:{}}) as PayrollSettings;
  const closingReferences=recordedClosingReferences(next);
  const from=Date.parse(jakartaDateTimeInputToISO(lock.from)), to=Date.parse(jakartaDateTimeInputToISO(lock.to));
  const eligible:Order[]=[];
  const dailyByOrder=new Map<string,ReturnType<typeof dailySegmentsForPeriod>>();
  for(const order of orders) {
    if(order.sheetDeletedAt || order.websiteDeletedAt || order.payrollClosedAt || order.payrollPeriodId
      || order.financeStatus==='closed' || hasLegacyWholeClosing(order,closingReferences)) continue;
    if(isDailySettlementOrder(order)) {
      const segments=dailySegmentsForPeriod(order,from,to);
      if(segments.length) {
        for(const day of segments) {
          const error=getDailyPayrollValidationError(order,day);
          if(error) payrollFailure(`Pesanan ${order.externalReference}: ${error} Koreksi hari ini sebelum Closing.`,409);
        }
        eligible.push(createDailyPayrollSlice(order,segments));
        dailyByOrder.set(order.id,segments);
      }
      continue;
    }
    const t=Date.parse(order.verifiedAt??order.completedAt??order.orderedAt);
    if(isPayrollEligible(order)&&t>=from&&t<=to) eligible.push(order);
  }
  if(!eligible.length) payrollFailure('Tidak ada order atau pekerjaan harian selesai yang dapat di-Closing pada periode ini.',409);
  for(const order of eligible) assertOrderQuantityReady(order);
  const kasbonByEmployee:Record<string,number>={};
  for(const a of advances) if(a.status==='active') kasbonByEmployee[a.employeeCode]=(kasbonByEmployee[a.employeeCode]??0)+a.remainingMinor;
  const payroll=buildLivePayrollRows(eligible,{...settings,employees,kasbonByEmployee}).filter(r=>r.orderRefs.length);
  const record={id:crypto.randomUUID(),from:lock.from,to:lock.to,closedAt:now,orderRefs:eligible.map(o=>o.externalReference),totalOrderMinor:eligible.reduce((s,o)=>s+o.grossMinor,0),totalPayrollMinor:payroll.reduce((s,r)=>s+r.net,0),payrollSnapshot:payroll,ordersSnapshot:eligible};
  next[workspaceKeys.closings]=[record,...(next[workspaceKeys.closings]??[]) as unknown[]];
  const ids=new Set(eligible.filter(o=>!isDailySettlementOrder(o)).map(o=>o.id));
  next[workspaceKeys.orders]=orders.map(order=>{
    const daily=dailyByOrder.get(order.id);
    if(daily) {
      const closingIds=new Set(daily.map(day=>day.id));
      const dailyWork=(order.dailyWork??[]).map(day=>closingIds.has(day.id)?{...day,payrollClosedAt:now,payrollPeriodId:record.id}:day);
      const fullyClosed=hasCompleteDailySchedule(dailyWork,order.scheduleTotalDays??dailyWork.length)
        &&dailyWork.every(day=>Boolean(day.payrollClosedAt||day.payrollPeriodId));
      return {...order,dailyWork,payrollClosedAt:fullyClosed?now:undefined,payrollPeriodId:fullyClosed?record.id:undefined,financeStatus:fullyClosed?'closed':order.financeStatus};
    }
    return ids.has(order.id)?{...order,payrollClosedAt:now,payrollPeriodId:record.id,financeStatus:'closed'}:order;
  });
  for(const row of payroll) {
    let payment=row.kasbon;
    for(const advance of advances) if(advance.employeeCode===row.employeeCode&&advance.status==='active'&&payment>0) {
      const paid=Math.min(payment,advance.remainingMinor);payment-=paid;advance.remainingMinor-=paid;if(!advance.remainingMinor)advance.status='paid';
    }
    delete settings.adjustments[row.employeeCode];
  }
  next[workspaceKeys.advances]=advances; next[workspaceKeys.settings]=settings;
  validateWorkspace(next);
  return {state:next,record,payroll,orders:eligible};
}

function assertOrderQuantityReady(order: Order) {
  const issues=analyzeOrderQuantityIssues(order);
  if(issues.length) payrollFailure(`Pesanan ${order.externalReference} bermasalah. ${issues.map(issue=>issue.description).join(' ')} Koreksi jumlah sebelum menyelesaikan pesanan atau Closing.`,409);
}
