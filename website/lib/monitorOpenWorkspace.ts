import { createHash } from 'node:crypto';
import { workspaceKeys } from '@/features/payroll/lib/workspace-model';
import type { Employee } from '@/features/payroll/types/domain';
import { createSupabaseAdmin } from './serverSupabase';
import type { MonitorWorkspaceSnapshot } from './monitorWorkspaceSnapshot';

export const OPEN_MONITOR_ACTOR = '00000000-0000-4000-8000-0000000000f3';
const reads = new Set(['roster', 'pending', 'tasks', 'completed', 'proof-setup', 'books']);
const writes = new Set(['assign', 'take', 'progress']);

/** Explicitly public worker access, approved by the owner. This header is a protocol selector, not a secret. */
export async function openMonitorContext(request: Request, signal?: AbortSignal) {
  const url = new URL(request.url), path = url.pathname.split('/').pop() ?? '';
  if (request.headers.get('x-monitor-mode') !== 'public' || request.headers.has('authorization')) return null;
  if (!((request.method === 'GET' && reads.has(path)) || (request.method === 'POST' && writes.has(path))))
    throw Object.assign(new Error('Fitur ini memerlukan login admin dari Pengaturan.'), { status: 403 });
  const service = createSupabaseAdmin({ signal: signal ?? AbortSignal.timeout(10_000) });
  const ip = (request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const key = createHash('sha256').update('fh3-open:' + ip).digest('hex');
  const { data, error } = await service.rpc('cp_monitor_public_context', {
    p_key: key, p_write: request.method !== 'GET', p_orders: ['pending', 'tasks', 'completed', 'books'].includes(path),
  });
  if (error) throw Object.assign(new Error(error.message?.includes('Terlalu banyak')
    ? 'Terlalu banyak permintaan. Tunggu sebentar lalu perbarui.' : 'Mode karyawan belum dapat dihubungkan.'),
  { status: error.message?.includes('Terlalu banyak') ? 429 : 503 });
  const snapshot = data?.snapshot as MonitorWorkspaceSnapshot | undefined;
  const roster = snapshot?.payload?.[workspaceKeys.employees];
  if (data?.enabled !== true || !Array.isArray(roster))
    throw Object.assign(new Error('Mode karyawan sedang tidak tersedia.'), { status: 503 });
  const all = roster as Employee[];
  const codes = all.filter(e => e.team === 'FH3' && ['NEW', 'SHIFT', 'FULL'].includes(e.workforceStatus)
    && !e.sheetRosterMissingAt && all.filter(x => x.id === e.id).length === 1 && all.filter(x => x.code === e.code).length === 1).map(e => e.code);
  return { user: null, profile: null, actor: { id: OPEN_MONITOR_ACTOR, name: 'Mode Karyawan', email: '', isAdmin: false },
    // Mutation transport must not inherit the preflight's expiring timer: a
    // Telegram send/finish has its own once-only, uncertain-delivery handling.
    supabaseAdmin: signal ? service : createSupabaseAdmin(), employeeCode: '', employeeId: '', accessScope: 'public' as const,
    canOperateAll: true, operableEmployeeCodes: codes, workspaceSnapshot: snapshot };
}
