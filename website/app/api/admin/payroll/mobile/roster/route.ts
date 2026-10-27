export const maxDuration = 25;
import { withMonitorSessionDeadline } from '@/lib/monitorSessionDeadline';
import { requireMonitorAccess } from '@/lib/monitorAccess';
import { adminErrorStatus } from '@/lib/adminSecurity';
import { workspaceKeys } from '@/features/payroll/lib/workspace-model';
import type { Employee } from '@/features/payroll/types/domain';
import { mobilePayrollRoster } from '@/features/payroll/lib/mobile-roster';
import { loadMonitorWorkspace } from '@/lib/monitorWorkspaceSnapshot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const response = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' },
});

/** Read-only employee roster. Deliberately excludes earnings, advances, bank info, orders, and payroll payload. */
export async function GET(request: Request) {
  try {
    return await withMonitorSessionDeadline(async signal => {
    const { actor, supabaseAdmin, employeeCode, accessScope, canOperateAll, operableEmployeeCodes, workspaceSnapshot } = await requireMonitorAccess(request, { allowPublic: true, rosterOnly: true, signal });
    const { data, error } = { data: workspaceSnapshot ?? await loadMonitorWorkspace(supabaseAdmin, false), error: null };
    if (error || !data) throw error ?? new Error('Workspace tidak ditemukan');
    const source = (data.payload as Record<string, unknown>)?.[workspaceKeys.employees];
    if (!Array.isArray(source)) return response({ error: 'Daftar karyawan payroll belum tersedia.' }, 503);
    const employees = mobilePayrollRoster(source as Employee[]).filter(e => actor.isAdmin
      || (canOperateAll ? operableEmployeeCodes.includes(e.code) : e.code === employeeCode));
    return response({ schema: 1, scope: 'FH3', revision: data.revision, updatedAt: data.updated_at,
      canOperate: true, isAdmin: actor.isAdmin, accessScope, employeeCode, username: actor.name, accountId: actor.id, employees });
    }, 18_000);
  } catch (error) {
    const status = adminErrorStatus(error);
    return response({ error: status === 401 ? 'Sesi habis; silakan login ulang.'
      : status === 403 ? 'Akses payroll tidak diizinkan.' : 'Daftar karyawan belum dapat dimuat.' },
    status === 401 || status === 403 || status === 429 ? status : 503);
  }
}
