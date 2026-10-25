import type { FH3MonitorJob } from "@/lib/fh3MonitorJobs";
import type { Order } from "@/features/payroll/types/domain";
import { workspaceKeys } from "@/features/payroll/lib/workspace-model";

/** Resolve the *current* FH3 worker, not the worker at notification time. */
export function currentDiscordRecipients(
  ref: string, jobs: Map<string, FH3MonitorJob>, payrollOrders: Order[],
): string[] {
  const job=jobs.get(ref);
  if (job) return job.status==="completed" || job.source_active===false
    ? [] : [job.employee_code.trim().toUpperCase()].filter(Boolean);
  const candidates=payrollOrders.filter(row=>String(row.externalReference??"").trim().toUpperCase()===ref);
  if(candidates.length!==1) return [];
  const order=candidates[0];
  if(order.team!=="FH3" || !["assigned","in_progress","on_hold"].includes(order.operationalStatus??"")
    || order.websiteDeletedAt || order.sheetDeletedAt || order.payrollClosedAt || order.completedAt) return [];
  const codes=(order.workerAssignments?.length
    ? order.workerAssignments.filter(a=>a.team==="FH3").map(a=>a.employeeCode)
    : [order.employeeCode]).filter(Boolean).map(code=>String(code).trim().toUpperCase());
  return [...new Set(codes)];
}
export function extractFH3PayrollOrders(payload: unknown): Order[] {
  if(!payload || typeof payload!=="object") return [];
  const stored=(payload as Record<string,unknown>)[workspaceKeys.orders];
  return Array.isArray(stored) ? stored as Order[] : [];
}
