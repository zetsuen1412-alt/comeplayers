import { requirePayrollAccess } from "@/lib/payrollAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requirePayrollAccess(request);
    const [{ data: orders, error: orderError }, { data: assignments, error: assignmentError }] = await Promise.all([
      supabaseAdmin
        .from("cp_payroll_telegram_orders")
        .select("order_ref,order_type,target_quantity,delivered_quantity,state,dispatch_status,last_event_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(5000),
      supabaseAdmin
        .from("cp_payroll_telegram_assignments")
        .select("id,order_ref,employee_code,division,status,started_at,paused_at,done_at,replaced_at,created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);
    if (orderError) throw orderError;
    if (assignmentError) throw assignmentError;

    const currentAssignments = new Map<string, unknown>();
    for (const row of assignments || []) {
      if (!currentAssignments.has(row.order_ref) && row.status !== "replaced") currentAssignments.set(row.order_ref, row);
    }

    return Response.json({
      orders: (orders || []).map(row => ({
        ...row,
        assignment: currentAssignments.get(row.order_ref) || null,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = adminErrorStatus(error);
    return Response.json(
      { error: status >= 500 ? "Status Telegram belum dapat dimuat." : error instanceof Error ? error.message : "Permintaan tidak valid." },
      { status },
    );
  }
}
