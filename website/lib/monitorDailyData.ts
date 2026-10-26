import type { createSupabaseAdmin } from "./serverSupabase";
import type { MonitorDailyState } from "./monitorDuration";

/** Small, indexed metadata batches; never load the Payroll workspace again. */
export async function loadMonitorDailyStates(service: ReturnType<typeof createSupabaseAdmin>, refs: string[]) {
  const states = new Map<string, MonitorDailyState>();
  let supported = true;
  for (let offset = 0; offset < refs.length; offset += 80) {
    const { data, error } = await service.rpc("cp_monitor_daily_states", { p_refs: refs.slice(offset, offset + 80) });
    if (error) {
      if (["PGRST202", "42883"].includes(error.code ?? "")) { supported = false; break; }
      throw error;
    }
    for (const row of (data ?? []) as MonitorDailyState[]) states.set(row.order_ref, row);
  }
  return { states, supported };
}
