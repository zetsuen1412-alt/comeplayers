import { loadMonitorControls } from "@/lib/monitorManagement";
import { requireMonitorAccess } from "@/lib/monitorAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import { workspaceKeys } from "@/features/payroll/lib/workspace-model";
import type { Employee, Order } from "@/features/payroll/types/domain";
import { loadFH3ManualOrders, manualFH3OrderTitle } from "@/lib/fh3ManualTelegramQueue";
import { mobileWorkflow, type MobileDelivery } from "@/lib/payrollMobileWorkflow";
import { loadFH3MonitorJobs } from "@/lib/fh3MonitorJobs";
import { monitorPauseWorkflow, type MonitorPauseState } from "@/lib/monitorPauseWorkflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const respond = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
});
const clean = (value: unknown, fallback: string, limit: number) => String(value ?? "")
  .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0,limit) || fallback;

/** Payroll supplies assignments; verified admin Telegram posts supply operational TASK. */
export async function GET(request: Request) {
  try {
    const { actor, supabaseAdmin, employeeCode, canOperateAll, operableEmployeeCodes } = await requireMonitorAccess(request);
    const { data, error } = await supabaseAdmin.from("cp_payroll_workspace")
      .select("payload,revision,updated_at").eq("id", 1).single();
    if (error || !data) throw error ?? new Error("Workspace tidak ditemukan");
    const payload = data.payload as Record<string, unknown>;
    const employees = (Array.isArray(payload[workspaceKeys.employees]) ? payload[workspaceKeys.employees] : []) as Employee[];
    const orders = (Array.isArray(payload[workspaceKeys.orders]) ? payload[workspaceKeys.orders] : []) as Order[];
    const verified = await loadFH3ManualOrders(supabaseAdmin);
    const jobs = await loadFH3MonitorJobs(supabaseAdmin);
    const controls = await loadMonitorControls(supabaseAdmin);
    const refCounts = new Map<string, number>();
    for (const order of orders) {
      const ref = String(order.externalReference ?? "").trim().toUpperCase();
      refCounts.set(ref, (refCounts.get(ref) ?? 0) + 1);
    }
    const byCode = new Map(employees.filter(employee => employee.team === "FH3"
      && !employee.sheetRosterMissingAt
      && ["NEW","SHIFT","FULL"].includes(employee.workforceStatus)
    ).map(employee => [employee.code.trim().toUpperCase(), employee]));

    const tasks = orders.flatMap(order => {
      const manual = verified.get(String(order.externalReference ?? "").trim().toUpperCase());
      if (!manual || refCounts.get(String(order.externalReference ?? "").trim().toUpperCase()) !== 1) return [];
      if (jobs.has(String(order.externalReference).trim().toUpperCase())) return [];
      if (order.team !== "FH3" || order.sheetDeletedAt || order.websiteDeletedAt || order.importNeedsReview
        || !["boosting", "item"].includes(order.orderType ?? "")
        || !["assigned","in_progress","on_hold"].includes(order.operationalStatus)
        || order.verifiedAt || order.completedAt || order.payrollClosedAt || order.payrollPeriodId
        || order.financeStatus === "closed"
        || order.scheduleMode === "daily") return [];
      const assignments = order.workerAssignments?.length
        ? order.workerAssignments : (order.employeeCode && order.employeeName
          ? [{ employeeCode: order.employeeCode, employeeName: order.employeeName, team: order.team, quantity: order.quantity }] : []);
      return assignments.flatMap(assignment => {
        const employee = byCode.get(String(assignment.employeeCode).trim().toUpperCase());
        if (!employee || assignment.team !== "FH3") return [];
        return [{
          id: `${clean(order.externalReference,"order",180)}:${employee.code}`,
          employeeId: employee.id, employeeCode: employee.code, employeeName: employee.name,
          orderRef: clean(order.externalReference, "—", 180),
          orderName: clean(manualFH3OrderTitle(manual), "Order manual Telegram", 500),
          game: clean(manual.game, "—", 200),
          discord: clean(manual.discord, "", 150),
          buyer: "",
          task: clean(manual.task, "—", 500), division: "FH3",
          quantity: Number.isFinite(assignment.quantity) ? assignment.quantity : null,
          status: order.operationalStatus, updatedAt: data.updated_at,
        }];
      });
    });
    for (const job of jobs.values()) {
      const manual = verified.get(job.order_ref);
      const employee = byCode.get(job.employee_code.toUpperCase());
      if (!manual || String(manual.chat_id) !== String(job.chat_id) || !employee
        || employee.id !== job.employee_id || job.status === "completed") continue;
      tasks.push({
        id: `telegram:${job.order_ref}:${employee.code}`, employeeId: employee.id, employeeCode: employee.code,
        employeeName: employee.name, orderRef: job.order_ref,
        orderName: clean(manualFH3OrderTitle(manual), "Order manual Telegram", 500), game: clean(manual.game, "—", 200),
        discord: clean(manual.discord, "", 150),
        buyer: "", task: clean(manual.task, "—", 500), division: "FH3", quantity: 1,
        status: job.status, updatedAt: job.completed_at ?? job.started_at ?? job.created_at,
      });
    }
    if (tasks.length > 15000) throw new Error("Terlalu banyak tugas aktif");
    // Fetch only delivery metadata for the visible refs, in bounded URL batches.
    // A missing audit table must not unlock START or fabricate a successful TAKE.
    const takes: MobileDelivery[] = [], proofs: MobileDelivery[] = [];
    const pauseStates = new Map<string, MonitorPauseState>();
    let pauseSupported = true;
    const refs = [...new Set(tasks.map(task => task.orderRef))];
    for (let index = 0; index < refs.length; index += 80) {
      const batch = refs.slice(index, index + 80);
      const [takeResult, proofResult, pauseResult] = await Promise.all([
        supabaseAdmin.from("cp_mobile_order_take")
          .select("order_ref,employee_code,chat_id,status,sent_at").in("order_ref", batch),
        supabaseAdmin.from("cp_mobile_order_proof")
          .select("order_ref,employee_code,chat_id,status,action,sent_at").in("order_ref", batch),
        supabaseAdmin.rpc("cp_monitor_pause_states", { p_refs: batch }),
      ]);
      if (takeResult.error || proofResult.error) throw takeResult.error ?? proofResult.error;
      // Preserve read-only compatibility before the additive migration is applied.
      if (pauseResult.error) {
        if (["PGRST202", "42883"].includes(pauseResult.error.code ?? "")) pauseSupported = false;
        else throw pauseResult.error;
      } else for (const state of (pauseResult.data ?? []) as MonitorPauseState[]) pauseStates.set(state.order_ref, state);
      takes.push(...(takeResult.data ?? [])); proofs.push(...(proofResult.data ?? []));
    }
    const byRef = new Map(orders.map(order => [clean(order.externalReference, "—", 180), order]));
    const groupDeliveries = (rows: MobileDelivery[]) => {
      const groups = new Map<string, MobileDelivery[]>();
      for (const row of rows) {
        const group = groups.get(row.order_ref) ?? []; group.push(row); groups.set(row.order_ref, group);
      }
      return groups;
    };
    const takesByRef = groupDeliveries(takes), proofsByRef = groupDeliveries(proofs);
    const actionableTasks = tasks.filter(t => (actor.isAdmin || t.employeeCode === employeeCode
      || (canOperateAll && operableEmployeeCodes.includes(t.employeeCode))) && !controls.get(t.orderRef)?.archived).map(task => {
      const job = jobs.get(task.orderRef);
      const workOrder = job ? { externalReference: job.order_ref, operationalStatus: job.status,
        workerAssignments: [{ id: `mobile:telegram:${job.order_ref}`, employeeCode: job.employee_code,
          employeeName: job.employee_name, team: "FH3" as const, process: "JOKI", quantity: 1 }] } : byRef.get(task.orderRef)!;
      const workflow = mobileWorkflow(workOrder, task.employeeCode,
        verified.get(task.orderRef.toUpperCase())!.chat_id,
        takesByRef.get(task.orderRef) ?? [], proofsByRef.get(task.orderRef) ?? []);
      const pause = monitorPauseWorkflow(workflow, task.status, pauseStates.get(task.orderRef), pauseSupported);
      const normal = (controls.get(task.orderRef)?.state ?? "normal") === "normal";
      return { ...task, ...workflow, ...pause, status: pause.paused ? "paused" : task.status, source: job ? "telegram_job" : "payroll",
        needsValuation: !!job && !byRef.has(task.orderRef),
        canTake: (controls.get(task.orderRef)?.state ?? "normal") === "normal" && workflow.canTake,
        canStart: normal && !pause.deliveryUncertain && workflow.canStart, canDone: normal && pause.canDone,
        canPause: normal && pause.canPause, canContinue: normal && pause.canContinue,
        actionMessage: normal ? pause.actionMessage : "Order Refund atau Bermasalah. Hubungi admin.",
      };
    });
    return respond({ schema: 1, source: "payroll", sourceOfTruth: "telegram_fh3_manual", scope: "FH3", revision: data.revision,
      updatedAt: data.updated_at, workflowSchema: 1, pauseSchema: pauseSupported ? 1 : 0, complete: true, tasks: actionableTasks });
  } catch (error) {
    const status = adminErrorStatus(error);
    return respond({ error: status === 401 ? "Sesi habis; silakan login ulang."
      : status === 403 ? "Akses payroll tidak diizinkan." : "Tugas order belum dapat dimuat." },
      status === 401 || status === 403 ? status : 503);
  }
}
