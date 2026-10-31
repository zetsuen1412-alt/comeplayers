import type { Employee, Order } from "@/features/payroll/types/domain";
import { workspaceKeys, type WorkspaceState } from "@/features/payroll/lib/workspace-model";
import { getOrderAssignments } from "@/features/payroll/lib/order-workers";
import type { FH3MonitorJob } from "@/lib/fh3MonitorJobs";
import type { MonitorControl } from "@/lib/monitorManagement";
import { allocateMonitorWage, type MonitorTeam } from './monitorTeams';

export type CompletedReceipt = { order_ref: string; chat_id: string | number; game: string; duration: string; discord?: string; task: string; active: boolean };
export type CompletedProof = { order_ref: string; employee_code: string; chat_id: string | number;
  action: string; status: string; telegram_message_id: string | number | null; sent_at: string | null };
const clean = (value: unknown, max = 160) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const ref = (value: unknown) => clean(value).toUpperCase();
const stamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;

/** Count actual confirmed DONE reports once per order, without reading any salary fields. */
export function buildMobileCompleted(state: WorkspaceState, receipts: CompletedReceipt[], proofs: CompletedProof[],
  jobs: FH3MonitorJob[], employeeCode = "", offset = 0, controls: MonitorControl[] = [], includeAll = false, includeArchived = false,
  teams: MonitorTeam[] = []) {
  const employees = (Array.isArray(state[workspaceKeys.employees]) ? state[workspaceKeys.employees] : []) as Employee[];
  const orders = (Array.isArray(state[workspaceKeys.orders]) ? state[workspaceKeys.orders] : []) as Order[];
  const roster = employees.filter(employee => employee.team === "FH3");
  const byCode = new Map(roster.map(employee => [employee.code, employee]));
  if (byCode.size !== roster.length) throw new Error("Identitas karyawan FH3 ambigu.");
  if (employeeCode && !byCode.has(employeeCode)) throw Object.assign(new Error("Karyawan FH3 tidak ditemukan."), { status: 404 });
  const sources = new Map(receipts.map(source => [ref(source.order_ref), source]));
  const journal = new Map(jobs.map(job => [ref(job.order_ref), job]));
  const controlByRef = new Map(controls.map(c => [c.order_ref,c]));
  const financialByRef = new Map<string, Order[]>();
  for (const order of orders) {
    const key = ref(order.externalReference); const records = financialByRef.get(key) ?? [];
    records.push(order); financialByRef.set(key, records);
  }
  const completed = new Map<string, { orderRef: string; employeeCode: string; employeeName: string;
    employeeId: string; game: string; duration: string; discord: string; task: string; completedAt: string; telegramMessageUrl: string | null;
    archived: boolean; monitorArchived: boolean; adminState: string; wageRupiah: number | null; version: number }>();
  for (const proof of proofs) {
    const key = ref(proof.order_ref), source = sources.get(key), employee = byCode.get(proof.employee_code);
    const doneAt = stamp(proof.sent_at);
    if (!source || !employee || !doneAt || !/^X\d{2,12}$/.test(key)
      || proof.action !== "done" || proof.status !== "sent"
      || !/^[1-9]\d*$/.test(String(proof.telegram_message_id ?? ""))
      || String(source.chat_id) !== String(proof.chat_id)) continue;
    const job = journal.get(key);
    if (job) {
      if (job.status !== "completed" || job.employee_id !== employee.id || job.employee_code !== employee.code
        || String(job.chat_id) !== String(source.chat_id)) continue;
    } else {
      const candidates = financialByRef.get(key) ?? [];
      if (candidates.length !== 1 || candidates[0].team !== "FH3"
        || !["completed", "verified"].includes(candidates[0].operationalStatus)
        || !getOrderAssignments(candidates[0]).some(assignment => assignment.employeeCode === employee.code)) continue;
    }
    const chat = String(source.chat_id);
    const control = controlByRef.get(key);
    if (control?.archived && !includeArchived) continue;
    const credited = control?.beneficiary_id ? roster.find(e => e.id === control.beneficiary_id && e.code === control.beneficiary_code) : employee;
    if (!credited) throw new Error("Identitas penerima upah tidak ditemukan.");
    const previous = completed.get(key);
    if (previous && Date.parse(previous.completedAt) <= Date.parse(doneAt)) continue;
    completed.set(key, { orderRef: key, employeeId: credited.id, employeeCode: clean(credited.code), employeeName: clean(credited.name),
      game: clean(source.game), duration: clean(source.duration), discord: clean(source.discord, 150), task: clean(source.task, 500), completedAt: doneAt,
      telegramMessageUrl: /^-100\d+$/.test(chat) ? `https://t.me/c/${chat.slice(4)}/${proof.telegram_message_id}` : null,
      archived: !source.active, monitorArchived: control?.archived ?? false, adminState: control?.state ?? "normal",
      wageRupiah: control?.wage_rupiah == null ? null : Number(control.wage_rupiah), version: control?.version ?? 0 });
  }
  const teamByRef = new Map(teams.map(team => [team.orderRef, team]));
  const work = [...completed.values()].flatMap(item => {
    const team = teamByRef.get(item.orderRef);
    if (!team) return [{ ...item, shareBps: 10000, orderWageRupiah: item.wageRupiah, teamVersion: 0, participants: [] }];
    const job = journal.get(item.orderRef);
    if (job && team.primaryEmployeeCode !== job.employee_code) throw new Error('Penanggung jawab order berubah.');
    const participants = team.participants.map(member => {
      const employee = byCode.get(member.employeeCode);
      if (!employee || employee.id !== member.employeeId) throw new Error('Identitas anggota tim tidak ditemukan.');
      return { ...member, employeeName: clean(employee.name) };
    });
    const wages = allocateMonitorWage(item.wageRupiah, participants);
    return participants.map((member, index) => ({ ...item, employeeId: member.employeeId,
      employeeCode: member.employeeCode, employeeName: member.employeeName, shareBps: member.shareBps,
      wageRupiah: wages[index], orderWageRupiah: item.wageRupiah, teamVersion: team.teamVersion, participants }));
  }).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)
    || a.orderRef.localeCompare(b.orderRef) || a.employeeCode.localeCompare(b.employeeCode));
  const counts = new Map<string, { count: number; last: string }>();
  for (const item of work) {
    const count = counts.get(item.employeeCode) ?? { count: 0, last: item.completedAt };
    count.count++; counts.set(item.employeeCode, count);
  }
  const people = roster.map(employee => ({ employeeCode: clean(employee.code), employeeName: clean(employee.name),
    completedCount: counts.get(employee.code)?.count ?? 0, lastCompletedAt: counts.get(employee.code)?.last ?? null,
  })).sort((a, b) => b.completedCount - a.completedCount || a.employeeName.localeCompare(b.employeeName, "id") || a.employeeCode.localeCompare(b.employeeCode));
  const selected = employeeCode ? work.filter(item => item.employeeCode === employeeCode) : includeAll ? work : [];
  return { employees: people, selectedEmployeeCode: employeeCode || null,
    totals: { completedCount: completed.size, employeeCount: people.length, contributors: counts.size,
      lastCompletedAt: stamp(work[0]?.completedAt) },
    work: includeAll ? selected : selected.slice(offset, offset + 50), workTotal: selected.length,
    nextOffset: offset + 50 < selected.length ? offset + 50 : null,
    notice: "Jumlah dihitung dari order Telegram FH3 dengan laporan DONE terkonfirmasi. Pilih nama untuk membuka daftar order selesai.",
  };
}

