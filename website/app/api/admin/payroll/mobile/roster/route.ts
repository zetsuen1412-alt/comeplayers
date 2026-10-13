import { requirePayrollAccess } from '@/lib/payrollAccess';
import { adminErrorStatus } from '@/lib/adminSecurity';
import { workspaceKeys } from '@/features/payroll/lib/workspace-model';
import type { Employee } from '@/features/payroll/types/domain';
import { mobilePayrollRoster } from '@/features/payroll/lib/mobile-roster';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const response = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' },
});

/** Read-only employee roster. Deliberately excludes earnings, advances, bank info, orders, and payroll payload. */
export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requirePayrollAccess(request);
    const { data, error } = await supabaseAdmin.from('cp_payroll_workspace')
      .select('payload,revision,updated_at').eq('id', 1).single();
    if (error || !data) throw error ?? new Error('Workspace tidak ditemukan');
    const source = (data.payload as Record<string, unknown>)?.[workspaceKeys.employees];
    if (!Array.isArray(source)) return response({ error: 'Daftar karyawan payroll belum tersedia.' }, 503);
    const employees = mobilePayrollRoster(source as Employee[]);
    return response({ schema: 1, revision: data.revision, updatedAt: data.updated_at, employees });
  } catch (error) {
    const status = adminErrorStatus(error);
    return response({ error: status === 401 ? 'Sesi habis; silakan login ulang.'
      : status === 403 ? 'Akses payroll tidak diizinkan.' : 'Daftar karyawan belum dapat dimuat.' },
    status === 401 || status === 403 ? status : 503);
  }
}