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

/** Only manually posted and verified FH3 Telegram orders are eligible for the mobile queue. */
export async function GET(request: Request) {
  try {
    const { actor, supabaseAdmin } = await requirePayrollAccess(request);
    if (!actor.isAdmin) return respond({ error: "Hanya admin dapat melihat order baru." }, 403);
    const { data: workspace, error } = await supabaseAdmin.from("cp_payroll_workspace")
      .select("payload,revision").eq("id", 1).single();
    if (error || !workspace) throw error ?? new Error("Workspace tidak ditemukan");
    const payload = workspace.payload as Record<string, unknown>;
    const orders = (Array.isArray(payload[workspaceKeys.orders]) ? payload[workspaceKeys.orders] : []) as Order[];
    // Fail closed if group binding/intake is missing. Never fall back to
    // showing the full Payroll queue (which includes non-Telegram orders).
    const { data: group, error: groupError } = await supabaseAdmin
      .from("cp_payroll_telegram_divisions")
      .select("chat_id").eq("division", "FH3").eq("active", true).maybeSingle();
    if (groupError || !group || Number(group.chat_id) >= 0) {
      return respond({ error: "Grup Telegram FH3 belum terverifikasi." }, 503);
    }
    const { data: manual, error: manualError } = await supabaseAdmin
      .from("cp_fh3_telegram_manual_orders")
      .select("order_ref,chat_id,message_id,game,server_name,duration,task")
      .eq("chat_id", group.chat_id).limit(1000);
    if (manualError) throw manualError; // Missing migration = no orders, not a fallback.
    const verified = new Map((manual ?? []).map(item => [String(item.order_ref).toUpperCase(), item]));
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
      && verified.has(String(order.externalReference).trim().toUpperCase())
    ).sort((left, right) =>
      Date.parse(right.orderedAt || "") - Date.parse(left.orderedAt || "")
    );
    if (pending.length > 200) return respond({ error: "Terlalu banyak order baru, periksa Payroll Website." }, 503);
    return respond({
      // source remains "payroll" for existing Windows v1.6 clients;
      // only Telegram-verified order refs are included.
      schema: 2, scope: "FH3", source: "payroll", sourceOfTruth: "telegram_fh3_manual", revision: workspace.revision,
      pending: pending.map(order => ({
        orderRef: clean(order.externalReference, 180),
        orderType: order.orderType,
        // Never forward Telegram passwords/buyer credentials into the queue.
        orderName: clean(verified.get(order.externalReference.trim().toUpperCase())?.duration || "Order manual Telegram", 300),
        game: clean(verified.get(order.externalReference.trim().toUpperCase())?.game || "", 150),
        buyer: "",
        task: clean(verified.get(order.externalReference.trim().toUpperCase())?.task || "", 400),
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
