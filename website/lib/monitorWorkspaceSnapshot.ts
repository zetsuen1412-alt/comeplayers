import type { createSupabaseAdmin } from './serverSupabase';

export type MonitorWorkspaceSnapshot = { payload: Record<string, unknown>; revision: number; updated_at: string };

/** Project operational fields in Postgres instead of transferring Payroll/Closing archives per poll. */
export async function loadMonitorWorkspace(service: ReturnType<typeof createSupabaseAdmin>, orders = true) {
  const { data, error } = await service.rpc('cp_monitor_workspace_snapshot', { p_orders: orders });
  if (error || !data?.payload || !Number.isSafeInteger(Number(data.revision)))
    throw Object.assign(new Error('Data Monitor belum tersedia. Coba perbarui.'), { status: 503 });
  return data as MonitorWorkspaceSnapshot;
}
