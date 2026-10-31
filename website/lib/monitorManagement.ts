import type { createSupabaseAdmin } from "@/lib/serverSupabase";
import { loadCompletedMonitorEvidence } from "@/lib/fh3MonitorCompletedData";
import { loadFH3MonitorJobs } from "@/lib/fh3MonitorJobs";
import { buildMobileCompleted } from "@/lib/payrollMobileCompleted";
import { loadMonitorWorkspace, type MonitorWorkspaceSnapshot } from './monitorWorkspaceSnapshot';
import { allocateMonitorWage, loadMonitorTeams, parseMonitorTeamInput } from './monitorTeams';

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
    if ((data?.length ?? 0) < 1000) return hydrateMonitorClosingShares(service, items);
  }
  throw new Error("Data Tutup Buku tidak lengkap.");
}

type LedgerItem = { order_ref: string; closing_id: string; employee_id: string; employee_code: string;
  employee_name: string; wage_rupiah: number; completed_at: string; game: string; discord: string; task: string;
  share_bps?: number; joined_at?: string; team_version?: number; order_wage_rupiah?: number };
type ClosingShare = { order_ref: string; closing_id: string; employee_id: string; employee_code: string;
  employee_name: string; share_bps: number; wage_rupiah: number; joined_at: string; team_version: number };

/** The old closing row remains the order-level lock; additive immutable shares supply beneficiaries. */
export async function hydrateMonitorClosingShares(service: Service, items: LedgerItem[]): Promise<LedgerItem[]> {
  if (items.length === 0) return items;
  const shares: ClosingShare[] = [];
  for (let offset = 0; offset <= 60000; offset += 1000) {
    const { data, error } = await service.from('cp_fh3_monitor_closing_shares').select('*')
      .order('order_ref').order('employee_code').range(offset, offset + 999);
    if (error) {
      if (['42P01', 'PGRST205'].includes(error.code ?? '')) return items;
      throw error;
    }
    shares.push(...(data ?? []));
    if (shares.length > 60000) throw new Error('Data bagian Tutup Buku terlalu besar.');
    if ((data?.length ?? 0) < 1000) break;
    if (offset === 60000) throw new Error('Data bagian Tutup Buku belum lengkap.');
  }
  const byRef = new Map<string, ClosingShare[]>();
  for (const share of shares) {
    const group = byRef.get(share.order_ref) ?? []; group.push(share); byRef.set(share.order_ref, group);
  }
  return items.flatMap(item => {
    const group = byRef.get(item.order_ref);
    if (!group?.length) return [item];
    const participants = group.map(share => ({ employeeCode: share.employee_code, shareBps: Number(share.share_bps) }));
    parseMonitorTeamInput(participants);
    const amounts = allocateMonitorWage(Number(item.wage_rupiah), participants);
    if (group.some((share, index) => share.closing_id !== item.closing_id
      || !share.employee_id || !share.employee_name || Number(share.wage_rupiah) !== amounts[index])
      || new Set(group.map(share => share.employee_id)).size !== group.length)
      throw new Error('Snapshot pembagian Tutup Buku tidak sesuai.');
    return group.map(share => ({ ...item, ...share, order_wage_rupiah: Number(item.wage_rupiah) }));
  });
}
export async function monitorBookData(service: Service, employeeId = "", includeArchived = false, snapshot?: MonitorWorkspaceSnapshot) {
  const [workspace, evidence, jobs, controls, items] = await Promise.all([
    snapshot ?? loadMonitorWorkspace(service),
    loadCompletedMonitorEvidence(service), loadFH3MonitorJobs(service), loadMonitorControls(service), loadMonitorLedger(service),
  ]);
  const teams = await loadMonitorTeams(service, evidence.receipts.map(receipt => receipt.order_ref));
  const completed = buildMobileCompleted(workspace.payload, evidence.receipts, evidence.proofs,
    [...jobs.values()], "", 0, [...controls.values()], true, includeArchived, [...teams.teams.values()]);
  const closed = new Map<string, LedgerItem>();
  for (const item of items) {
    const previous = closed.get(item.order_ref);
    closed.set(item.order_ref, previous ? { ...previous, wage_rupiah: Number(previous.wage_rupiah) + Number(item.wage_rupiah),
      employee_name: previous.employee_name + ' + ' + item.employee_name } : { ...item });
  }
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
      totalRupiah: work.reduce((s,i)=>s+Number(i.wage_rupiah),0), orderCount: new Set(work.map(item => item.order_ref)).size,
      employees:[...perEmployee.values()].sort((a,b)=>a.employeeName.localeCompare(b.employeeName,"id")),
      work: work.map(i=>({orderRef:i.order_ref,employeeId:i.employee_id,employeeCode:i.employee_code,employeeName:i.employee_name,
        wageRupiah:Number(i.wage_rupiah),shareBps:i.share_bps ?? 10000,orderWageRupiah:i.order_wage_rupiah ?? Number(i.wage_rupiah),
        teamVersion:i.team_version ?? 0,closed:true,
        completedAt:i.completed_at,game:i.game,discord:i.discord,task:i.task})) };
  });
  const eligible = [...new Map(open.filter(i => i.adminState === "normal" && !i.monitorArchived && i.wageRupiah !== null)
    .map(item => [item.orderRef, { ...item, wageRupiah: item.orderWageRupiah }])).values()];
  return { open, closings, eligible, controls, evidence, jobs, closed, teams: teams.teams };
}

