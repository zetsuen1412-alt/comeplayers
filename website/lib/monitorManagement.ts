import type { createSupabaseAdmin } from "@/lib/serverSupabase";
import { loadCompletedMonitorEvidence } from "@/lib/fh3MonitorCompletedData";
import { loadFH3MonitorJobs } from "@/lib/fh3MonitorJobs";
import { buildMobileCompleted } from "@/lib/payrollMobileCompleted";
import { loadMonitorWorkspace, type MonitorWorkspaceSnapshot } from './monitorWorkspaceSnapshot';

type Service = ReturnType<typeof createSupabaseAdmin>;
export type MonitorControl = { order_ref: string; state: "normal" | "refund" | "problem"; archived: boolean;
  wage_rupiah: number | null; beneficiary_id: string | null; beneficiary_code: string | null;
  beneficiary_name: string | null; version: number };
export async function loadMonitorControls(service: Service) {
  const controls = new Map<string, MonitorControl>();
  for (let offset = 0; offset <= 15000; offset += 1000) {
    const { data, error } = await service.from("cp_fh3_monitor_controls").select("*").order("order_ref").range(offset, offset + 999);
    if (error) throw error;
    for (const row of data ?? []) controls.set(row.order_ref, row as MonitorControl);
    if (controls.size > 15000) throw new Error("Riwayat perlu diarsipkan.");
    if ((data?.length ?? 0) < 1000) return controls;
  }
  throw new Error("Kontrol order tidak lengkap.");
}
export async function loadMonitorLedger(service: Service) {
  const items: { order_ref: string; closing_id: string; employee_id: string; employee_code: string;
    employee_name: string; wage_rupiah: number; completed_at: string; game: string; discord: string; task: string }[] = [];
  for (let offset = 0; offset <= 15000; offset += 1000) {
    const { data, error } = await service.from("cp_fh3_monitor_closing_items").select("*").order("order_ref").range(offset, offset + 999);
    if (error) throw error;
    items.push(...(data ?? []));
    if (items.length > 15000) throw new Error("Data Tutup Buku terlalu besar.");
    if ((data?.length ?? 0) < 1000) return items;
  }
  throw new Error("Data Tutup Buku tidak lengkap.");
}
export async function monitorBookData(service: Service, employeeId = "", includeArchived = false, snapshot?: MonitorWorkspaceSnapshot) {
  const [workspace, evidence, jobs, controls, items] = await Promise.all([
    snapshot ?? loadMonitorWorkspace(service),
    loadCompletedMonitorEvidence(service), loadFH3MonitorJobs(service), loadMonitorControls(service), loadMonitorLedger(service),
  ]);
  const completed = buildMobileCompleted(workspace.payload, evidence.receipts, evidence.proofs,
    [...jobs.values()], "", 0, [...controls.values()], true, includeArchived);
  const closed = new Map(items.map(i => [i.order_ref, i]));
  const open = completed.work.filter(row => !closed.has(row.orderRef) && (!employeeId || row.employeeId === employeeId));
  const visibleItems = items.filter(item => !employeeId || item.employee_id === employeeId);
  const closingIds = [...new Set(visibleItems.map(i => i.closing_id))];
  const books: { id: string; title: string; created_at: string }[] = [];
  for (let i = 0; i < closingIds.length; i += 80) {
    const { data, error } = await service.from("cp_fh3_monitor_closings").select("id,title,created_at").in("id", closingIds.slice(i,i+80));
    if (error) throw error; books.push(...(data ?? []));
  }
  const closings = books.sort((a,b) => b.created_at.localeCompare(a.created_at)).map(book => {
    const work = visibleItems.filter(i => i.closing_id === book.id);
    const perEmployee=new Map<string,{employeeId:string;employeeName:string;orderCount:number;totalRupiah:number}>();
    for(const item of work) {
      const total=perEmployee.get(item.employee_id) ?? {employeeId:item.employee_id,employeeName:item.employee_name,orderCount:0,totalRupiah:0};
      total.orderCount++;total.totalRupiah+=Number(item.wage_rupiah);perEmployee.set(item.employee_id,total);
    }
    return { id: book.id, title: book.title, createdAt: book.created_at,
      totalRupiah: work.reduce((s,i)=>s+Number(i.wage_rupiah),0), orderCount: work.length,
      employees:[...perEmployee.values()].sort((a,b)=>a.employeeName.localeCompare(b.employeeName,"id")),
      work: work.map(i=>({orderRef:i.order_ref,employeeId:i.employee_id,employeeName:i.employee_name,wageRupiah:Number(i.wage_rupiah),closed:true,
        completedAt:i.completed_at,game:i.game,discord:i.discord,task:i.task})) };
  });
  const eligible = open.filter(i => i.adminState === "normal" && !i.monitorArchived && i.wageRupiah !== null);
  return { open, closings, eligible, controls, evidence, jobs, closed };
}
