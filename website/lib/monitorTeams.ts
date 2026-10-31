import type { createSupabaseAdmin } from './serverSupabase';

export type MonitorTeamParticipant = {
  employeeId: string; employeeCode: string; employeeName: string;
  shareBps: number; joinedAt: string | null;
};
export type MonitorTeam = {
  orderRef: string; teamVersion: number; primaryEmployeeCode: string;
  participants: MonitorTeamParticipant[];
};
export type MonitorTeamInput = { employeeCode: string; shareBps: number };
type Service = ReturnType<typeof createSupabaseAdmin>;
const invalid = () => Object.assign(new Error('Pilih 1–4 karyawan berbeda dengan total bagian 100%.'), { status: 400 });
const codeValid = (value: unknown): value is string => typeof value === 'string' && value.length > 0
  && value.length <= 100 && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);

/** Percentages use integer basis points: 1% = 100, with no floating-point money. */
export function parseMonitorTeamInput(value: unknown): MonitorTeamInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) throw invalid();
  const codes = new Set<string>();
  let total = 0;
  const result = value.map(row => {
    if (!row || typeof row !== 'object' || !codeValid(row.employeeCode)
      || !Number.isSafeInteger(row.shareBps) || row.shareBps < 1 || row.shareBps > 10000) throw invalid();
    const key = row.employeeCode.toUpperCase();
    if (codes.has(key)) throw invalid();
    codes.add(key); total += row.shareBps;
    return { employeeCode: row.employeeCode, shareBps: row.shareBps };
  });
  if (total !== 10000) throw invalid();
  return result;
}

export function readMonitorTeam(value: unknown): MonitorTeam {
  const row = value as MonitorTeam | null;
  if (!row || !/^X\d{2,12}$/.test(row.orderRef) || !Number.isSafeInteger(row.teamVersion) || row.teamVersion < 0
    || typeof row.primaryEmployeeCode !== 'string' || !Array.isArray(row.participants))
    throw new Error('Format tim Monitor tidak valid.');
  if (row.participants.length === 0 && row.teamVersion === 0 && row.primaryEmployeeCode === '')
    return { orderRef: row.orderRef, teamVersion: 0, primaryEmployeeCode: '', participants: [] };
  parseMonitorTeamInput(row.participants);
  const ids = new Set<string>();
  for (const member of row.participants) {
    if (!codeValid(member.employeeId) || ids.has(member.employeeId) || typeof member.employeeName !== 'string'
      || !member.employeeName.trim() || member.employeeName.length > 500
      || !(member.joinedAt === null && row.teamVersion === 0)
        && (typeof member.joinedAt !== 'string' || !Number.isFinite(Date.parse(member.joinedAt))))
      throw new Error('Identitas tim Monitor tidak valid.');
    ids.add(member.employeeId);
  }
  if (!row.participants.some(member => member.employeeCode === row.primaryEmployeeCode))
    throw new Error('Penanggung jawab tim Monitor tidak ditemukan.');
  return { orderRef: row.orderRef, teamVersion: row.teamVersion, primaryEmployeeCode: row.primaryEmployeeCode,
    participants: row.participants.map(member => ({ employeeId: member.employeeId, employeeCode: member.employeeCode,
      employeeName: member.employeeName.replace(/[\u0000-\u001f\u007f]/g, ' ').trim(),
      shareBps: member.shareBps, joinedAt: member.joinedAt })) };
}

/** Bounded batches keep polling small and make incomplete reads fail closed. */
export async function loadMonitorTeams(service: Service, refs?: string[]) {
  const teams = new Map<string, MonitorTeam>();
  const unique = refs ? [...new Set(refs)] : undefined;
  const batches = unique ? Array.from({ length: Math.max(1, Math.ceil(unique.length / 80)) }, (_, index) => unique.slice(index * 80, index * 80 + 80)) : [null];
  for (const batch of batches) {
    const { data, error } = await service.rpc('cp_monitor_team_states', { p_refs: batch });
    if (error) {
      if (['PGRST202', '42883'].includes(error.code ?? '')) return { teams: new Map<string, MonitorTeam>(), supported: false };
      throw error;
    }
    if (!Array.isArray(data)) throw new Error('Daftar tim Monitor belum lengkap.');
    for (const value of data) {
      const team = readMonitorTeam(value);
      if (teams.has(team.orderRef) || (batch && !batch.includes(team.orderRef))) throw new Error('Daftar tim Monitor ambigu.');
      teams.set(team.orderRef, team);
    }
  }
  return { teams, supported: true };
}

/** Same deterministic rounding as the closing RPC, including tiny/zero wages. */
export function allocateMonitorWage(wage: number | null, participants: Pick<MonitorTeamParticipant, 'employeeCode' | 'shareBps'>[]) {
  parseMonitorTeamInput(participants);
  if (wage === null) return participants.map(() => null);
  if (!Number.isSafeInteger(wage) || wage < 0 || wage > 1e9) throw new Error('Upah order tidak valid.');
  const allocated = participants.map(member => Math.floor(wage * member.shareBps / 10000));
  const remainder = wage - allocated.reduce((sum, amount) => sum + amount, 0);
  const sorted = participants.map((member, index) => ({ code: member.employeeCode, index }))
    .sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  for (let index = 0; index < remainder; index++) allocated[sorted[index].index]++;
  return allocated;
}
