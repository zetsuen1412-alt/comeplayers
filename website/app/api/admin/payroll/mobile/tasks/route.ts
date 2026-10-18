import { requirePayrollAccess } from "@/lib/payrollAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import { workspaceKeys } from "@/features/payroll/lib/workspace-model";
import type { Employee, Order } from "@/features/payroll/types/domain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const response = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
});

/**
 * Minimal FH3 work projection for CP Boost Monitor. Telegram credentials,
 * payroll amounts, mutation history, and raw spreadsheet rows never leave the server.
 */
export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requirePayrollAccess(request);
    const [{ data: workspace, error: workspaceError }, { data: assignments, error: assignmentError }] = await Promise.all([
      supabaseAdmin.from("cp_payroll_workspace").select("payload,revision,updated_at").eq("id", 1).single(),
      supabaseAdmin.from("cp_payroll_telegram_assignments")
        .select("order_ref,employee_code,division,status,quantity,updated_at")
        .eq("division", "FH3")
        .in("status", ["assigned", "in_progress", "paused", "problem"])
        .order("updated_at", { ascending: false })
        .limit(500),
    ]);
    if (workspaceError || !workspace) throw workspaceError ?? new Error("Workspace tidak ditemukan");
    if (assignmentError) throw assignmentError;

    const payload = workspace.payload as Record<string, unknown>;
    const employees = (Array.isArray(payload[workspaceKeys.employees]) ? payload[workspaceKeys.employees] : []) as Employee[];
    const orders = (Array.isArray(payload[workspaceKeys.orders]) ? payload[workspaceKeys.orders] : []) as Order[];
    const employeeByCode = new Map(employees
      .filter(employee => employee.team === "FH3" && !employee.sheetRosterMissingAt && employee.workforceStatus !== "RESIGN")
      .map(employee => [employee.code, employee]));
    const orderByRef = new Map(orders.map(order => [order.externalReference.trim().toLowerCase(), order]));

    const tasks = (assignments ?? []).flatMap(assignment => {
      const employee = employeeByCode.get(String(assignment.employee_code));
      const order = orderByRef.get(String(assignment.order_ref).trim().toLowerCase());
      if (!employee || !order || order.sheetDeletedAt || order.websiteDeletedAt) return [];
      return [{
        id: `${order.externalReference}:${employee.code}`,
        employeeId: employee.id,
        employeeCode: employee.code,
        employeeName: employee.name,
        orderRef: order.externalReference,
        orderName: order.orderName || order.service || "—",
        game: order.gameName || order.game || "—",
        buyer: order.buyerName || "—",
        task: order.task || "—",
        division: "FH3",
        quantity: assignment.quantity == null ? null : Number(assignment.quantity),
        status: assignment.status,
        updatedAt: assignment.updated_at,
      }];
    });

    return response({ schema: 1, scope: "FH3", revision: workspace.revision, updatedAt: workspace.updated_at, complete: true, tasks });
  } catch (error) {
    const status = adminErrorStatus(error);
    return response({ error: status === 401 ? "Sesi habis; silakan login ulang."
      : status === 403 ? "Akses payroll tidak diizinkan." : "Tugas order belum dapat dimuat." },
    status === 401 || status === 403 ? status : 503);
  }
}
