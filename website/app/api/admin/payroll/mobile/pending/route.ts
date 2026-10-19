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
const key = (value: unknown) => String(value ?? "").trim().toUpperCase();

/** Read only unassigned FH3 Boosting/Item orders. Never expose spreadsheet or finance data. */
export async function GET(request: Request) {
  try {
    const { actor, supabaseAdmin } = await requirePayrollAccess(request);
    if (!actor.isAdmin) return respond({ error: "Hanya admin dapat melihat order baru." }, 403);
    const [{ data: workspace, error: workspaceError }, { data: waiting, error: waitingError }] = await Promise.all([
      supabaseAdmin.from("cp_payroll_workspace").select("payload,revision").eq("id", 1).single(),
      supabaseAdmin.from("cp_payroll_telegram_orders").select("order_ref,order_type,state")
        .eq("division", "FH3").eq("state", "waiting")
        .in("order_type", ["boosting", "item"]).order("created_at", { ascending: false }).limit(201),
    ]);
    if (workspaceError || waitingError || !workspace) throw workspaceError ?? waitingError ?? new Error("Missing workspace");
    if ((waiting ?? []).length > 200) return respond({ error: "Terlalu banyak order baru, buka Payroll Website." }, 503);
    const payload = workspace.payload as Record<string, unknown>;
    const orders = (Array.isArray(payload[workspaceKeys.orders]) ? payload[workspaceKeys.orders] : []) as Order[];
    const byRef = new Map(orders.map(order => [key(order.externalReference), order]));
    const pending = (waiting ?? []).flatMap(row => {
      const order = byRef.get(key(row.order_ref));
      if (!order || order.team !== "FH3" || order.orderType !== row.order_type
        || order.sheetDeletedAt || order.websiteDeletedAt || order.verifiedAt
        || order.payrollClosedAt || order.payrollPeriodId || order.financeStatus === "closed"
        || order.operationalStatus === "cancelled" || order.operationalStatus === "verified") return [];
      return [{
        orderRef: clean(row.order_ref, 180),
        orderType: row.order_type,
        orderName: clean(order.orderName || order.service, 300),
        game: clean(order.gameName || order.game, 150),
        buyer: clean(order.buyerName, 180),
        task: clean(order.task, 400),
        division: "FH3",
      }];
    });
    return respond({ schema: 1, scope: "FH3", revision: workspace.revision, pending });
  } catch (error) {
    const status = adminErrorStatus(error);
    return respond({ error: status === 401 ? "Sesi habis, silakan login ulang."
      : status === 403 ? "Akses Payroll ditolak." : "Order baru belum dapat dimuat." },
      status === 401 || status === 403 ? status : 503);
  }
}
