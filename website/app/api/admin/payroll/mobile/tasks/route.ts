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

const activeTelegramStates = ["assigned", "in_progress", "paused", "problem"] as const;
const taskLimit = 15000;
const pageSize = 1000;

function key(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

/** Keep spreadsheet text from creating extra lines or control characters in the APK card. */
function display(value: unknown, fallback: string, limit: number) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
  return text || fallback;
}

async function readPages<T>(read: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; from <= taskLimit; from += pageSize) {
    const { data, error } = await read(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    if (from >= taskLimit && page.length > 0) throw new Error("Terlalu banyak tugas aktif untuk satu snapshot.");
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new Error("Terlalu banyak tugas aktif untuk satu snapshot.");
}

/**
 * Minimal FH3 work projection for CP Boost Monitor. Telegram credentials,
 * payroll amounts, mutation history, and raw spreadsheet rows never leave the server.
 */
export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requirePayrollAccess(request);
    const [{ data: workspace, error: workspaceError }, assignmentsResult, telegramOrdersResult] = await Promise.all([
      supabaseAdmin.from("cp_payroll_workspace").select("payload,revision,updated_at").eq("id", 1).single(),
      readPages((from, to) => supabaseAdmin.from("cp_payroll_telegram_assignments")
        .select("order_ref,employee_code,division,status,quantity,updated_at")
        .eq("division", "FH3")
        .in("status", [...activeTelegramStates])
        .order("updated_at", { ascending: false })
        .order("order_ref", { ascending: true })
        .order("employee_code", { ascending: true })
        .range(from, to)),
      readPages((from, to) => supabaseAdmin.from("cp_payroll_telegram_orders")
        .select("order_ref,state")
        .in("state", [...activeTelegramStates])
        .order("order_ref", { ascending: true })
        .range(from, to)),
    ]);
    if (workspaceError || !workspace) throw workspaceError ?? new Error("Workspace tidak ditemukan");
    const assignments = assignmentsResult;
    const telegramOrders = telegramOrdersResult;

    const payload = workspace.payload as Record<string, unknown>;
    const employees = (Array.isArray(payload[workspaceKeys.employees]) ? payload[workspaceKeys.employees] : []) as Employee[];
    const orders = (Array.isArray(payload[workspaceKeys.orders]) ? payload[workspaceKeys.orders] : []) as Order[];
    const employeeByCode = new Map(employees
      .filter(employee => employee.team === "FH3" && !employee.sheetRosterMissingAt && employee.workforceStatus !== "RESIGN")
      .map(employee => [key(employee.code), employee]));
    const orderByRef = new Map(orders.map(order => [key(order.externalReference), order]));
    const telegramOrderByRef = new Map((telegramOrders ?? []).map(order => [key(order.order_ref), order]));

    const tasks = (assignments ?? []).flatMap(assignment => {
      const employee = employeeByCode.get(key(assignment.employee_code));
      const order = orderByRef.get(key(assignment.order_ref));
      const telegramOrder = telegramOrderByRef.get(key(assignment.order_ref));
      if (!employee || !order || !telegramOrder || order.sheetDeletedAt || order.websiteDeletedAt
        || order.operationalStatus === "cancelled" || order.operationalStatus === "verified"
        || order.financeStatus === "closed" || order.verifiedAt || order.payrollClosedAt || order.payrollPeriodId) return [];
      return [{
        id: `${display(order.externalReference, "order", 180)}:${employee.code}`,
        employeeId: employee.id,
        employeeCode: employee.code,
        employeeName: employee.name,
        orderRef: display(order.externalReference, "—", 180),
        orderName: display(order.orderName || order.service, "—", 500),
        game: display(order.gameName || order.game, "—", 200),
        buyer: display(order.buyerName, "—", 240),
        task: display(order.task, "—", 500),
        division: "FH3",
        quantity: assignment.quantity == null || !Number.isFinite(Number(assignment.quantity)) ? null : Number(assignment.quantity),
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
