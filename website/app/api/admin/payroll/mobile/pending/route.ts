import { requirePayrollAccess } from "@/lib/payrollAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import { workspaceKeys } from "@/features/payroll/lib/workspace-model";
import type { Order } from "@/features/payroll/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const respond = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
});
const clean = (value: unknown, limit: number) => String(value ?? "")
  .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);

/** The mobile queue reads Payroll workspace directly. It has NO Telegram dependency. */
export async function GET(request: Request) {
  try {
    const { actor, supabaseAdmin } = await requirePayrollAccess(request);
    if (!actor.isAdmin) return respond({ error: "Hanya admin dapat melihat order baru." }, 403);
    const { data: workspace, error } = await supabaseAdmin.from("cp_payroll_workspace")
      .select("payload,revision").eq("id", 1).single();
    if (error || !workspace) throw error ?? new Error("Workspace tidak ditemukan");
    const payload = workspace.payload as Record<string, unknown>;
    const orders = (Array.isArray(payload[workspaceKeys.orders]) ? payload[workspaceKeys.orders] : []) as Order[];
    const pending = orders.filter(order =>
      order.team === "FH3"
      && (order.orderType === "boosting" || order.orderType === "item")
      && ["draft", "confirmed", "assignment_pending"].includes(order.operationalStatus)
      && !order.importNeedsReview && !order.sheetDeletedAt && !order.websiteDeletedAt
      && !order.verifiedAt && !order.payrollClosedAt && !order.payrollPeriodId
      && order.financeStatus !== "closed"
      && order.scheduleMode !== "daily"
      && !(order.workerAssignments?.length) && !order.employeeCode && !order.employeeName
      && !!String(order.externalReference ?? "").trim()
    ).sort((left, right) =>
      Date.parse(right.orderedAt || "") - Date.parse(left.orderedAt || "")
    );
    if (pending.length > 200) return respond({ error: "Terlalu banyak order baru, periksa Payroll Website." }, 503);
    return respond({
      schema: 2, scope: "FH3", source: "payroll", revision: workspace.revision,
      pending: pending.map(order => ({
        orderRef: clean(order.externalReference, 180),
        orderType: order.orderType,
        orderName: clean(order.orderName || order.service, 300),
        game: clean(order.gameName || order.game, 150),
        buyer: clean(order.buyerName, 180),
        task: clean(order.task, 400),
        division: "FH3",
      })),
    });
  } catch (error) {
    const status = adminErrorStatus(error);
    return respond({ error: status === 401 ? "Sesi habis, silakan login ulang."
      : status === 403 ? "Akses Payroll ditolak." : "Order baru belum dapat dimuat." },
      status === 401 || status === 403 ? status : 503);
  }
}
