import type { requirePayrollAccess } from "@/lib/payrollAccess";

export type FH3MonitorJob = {
  order_ref: string; chat_id: number | string; source_message_id: number | string;
  employee_id: string; employee_code: string; employee_name: string;
  status: "assigned" | "in_progress" | "completed";
  created_at: string; started_at: string | null; completed_at: string | null;
  source_active?: boolean;
};
type Service = Awaited<ReturnType<typeof requirePayrollAccess>>["supabaseAdmin"];

/** Complete, bounded pages: PostgREST's default row limit must not silently lose history. */
export async function loadFH3MonitorJobs(service: Service): Promise<Map<string, FH3MonitorJob>> {
  const jobs = new Map<string, FH3MonitorJob>();
  for (let offset = 0; offset <= 15000; offset += 1000) {
    const { data, error } = await service.from("cp_fh3_monitor_jobs")
      .select("order_ref,chat_id,source_message_id,employee_id,employee_code,employee_name,status,created_at,started_at,completed_at,cp_fh3_telegram_manual_orders(active)")
      .order("order_ref").range(offset, offset + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      const relation: unknown = row.cp_fh3_telegram_manual_orders;
      const source = Array.isArray(relation) ? (relation.length === 1 ? relation[0] : null) : relation;
      jobs.set(row.order_ref, { ...row, source_active: !!source && typeof source === "object"
        && "active" in source && source.active === true } as FH3MonitorJob);
    }
    if (jobs.size > 15000) throw new Error("Riwayat Monitor terlalu besar; perlu filter periode.");
    if ((data?.length ?? 0) < 1000) return jobs;
  }
  throw new Error("Riwayat Monitor belum terbaca lengkap.");
}
