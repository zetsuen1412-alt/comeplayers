import { requirePayrollAccess } from "@/lib/payrollAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import { workspaceKeys } from "@/features/payroll/lib/workspace-model";
import type { Employee, Order } from "@/features/payroll/types/domain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const respond = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
});
const clean = (value: unknown, fallback: string, limit: number) => String(value ?? "")
  .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0,limit) || fallback;

/** FH3 active tasks are projected directly from Payroll, without Telegram assignment tables. */
export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requirePayrollAccess(request);
    const { data, error } = await supabaseAdmin.from("cp_payroll_workspace")
      .select("payload,revision,updated_at").eq("id", 1).single();
    if (error || !data) throw error ?? new Error("Workspace tidak ditemukan");
    const payload = data.payload as Record<string, unknown>;
    const employees = (Array.isArray(payload[workspaceKeys.employees]) ? payload[workspaceKeys.employees] : []) as Employee[];
    const orders = (Array.isArray(payload[workspaceKeys.orders]) ? payload[workspaceKeys.orders] : []) as Order[];
    const byCode = new Map(employees.filter(employee => employee.team === "FH3"
      && !employee.sheetRosterMissingAt
      && ["NEW","SHIFT","FULL"].includes(employee.workforceStatus)
    ).map(employee => [employee.code.trim().toUpperCase(), employee]));

    const tasks = orders.flatMap(order => {
      if (order.team !== "FH3" || order.sheetDeletedAt || order.websiteDeletedAt
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
          orderName: clean(order.orderName || order.service, "—", 500),
          game: clean(order.gameName || order.game, "—", 200),
          buyer: clean(order.buyerName, "—", 240),
          task: clean(order.task, "—", 500), division: "FH3",
          quantity: Number.isFinite(assignment.quantity) ? assignment.quantity : null,
          status: order.operationalStatus, updatedAt: data.updated_at,
        }];
      });
    });
    if (tasks.length > 15000) throw new Error("Terlalu banyak tugas aktif");
    return respond({ schema: 1, source: "payroll", scope: "FH3", revision: data.revision,
      updatedAt: data.updated_at, complete: true, tasks });
  } catch (error) {
    const status = adminErrorStatus(error);
    return respond({ error: status === 401 ? "Sesi habis; silakan login ulang."
      : status === 403 ? "Akses payroll tidak diizinkan." : "Tugas order belum dapat dimuat." },
      status === 401 || status === 403 ? status : 503);
  }
}
