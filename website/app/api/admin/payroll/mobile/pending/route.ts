import { loadMonitorControls } from "@/lib/monitorManagement";
import { requireMonitorAccess } from "@/lib/monitorAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import { workspaceKeys } from "@/features/payroll/lib/workspace-model";
import type { Order } from "@/features/payroll/types/domain";
import { loadFH3ManualOrders, manualFH3OrderTitle } from "@/lib/fh3ManualTelegramQueue";
import { loadFH3MonitorJobs } from "@/lib/fh3MonitorJobs";

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
    const { supabaseAdmin, workspaceSnapshot } = await requireMonitorAccess(request);
    const { data: workspace, error } = workspaceSnapshot ? { data: workspaceSnapshot, error: null } : await supabaseAdmin.from("cp_payroll_workspace")
      .select("payload,revision").eq("id", 1).single();
    if (error || !workspace) throw error ?? new Error("Workspace tidak ditemukan");
    const payload = workspace.payload as Record<string, unknown>;
    const orders = (Array.isArray(payload[workspaceKeys.orders]) ? payload[workspaceKeys.orders] : []) as Order[];
    // Fail closed if group binding/intake is missing. Never fall back to
    // showing the full Payroll queue (which includes non-Telegram orders).
    const verified = await loadFH3ManualOrders(supabaseAdmin);
    const jobs = await loadFH3MonitorJobs(supabaseAdmin);
    const controls = await loadMonitorControls(supabaseAdmin);
    for (const [ref,c] of controls) if (c.archived || c.state !== "normal") verified.delete(ref);
    const refCounts = new Map<string, number>();
    for (const order of orders) {
      const ref = String(order.externalReference ?? "").trim().toUpperCase();
      refCounts.set(ref, (refCounts.get(ref) ?? 0) + 1);
    }
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
      && refCounts.get(String(order.externalReference).trim().toUpperCase()) === 1
      && !jobs.has(String(order.externalReference).trim().toUpperCase())
    ).sort((left, right) =>
      Date.parse(right.orderedAt || "") - Date.parse(left.orderedAt || "")
    );
    // Telegram orders without a Payroll sale use the operational journal.
    // An admin enters and verifies their value later; never invent a sale.
    const payrollRefs = new Set(orders.map(order => String(order.externalReference ?? "").trim().toUpperCase()));
    const inboxOnly = [...verified.values()]
      .filter(item => !payrollRefs.has(String(item.order_ref).toUpperCase()) && !jobs.has(String(item.order_ref).toUpperCase()))
      .sort((left, right) => Date.parse(right.posted_at) - Date.parse(left.posted_at));
    if (pending.length + inboxOnly.length > 200)
      return respond({ error: "Terlalu banyak order Telegram FH3, periksa order lama." }, 503);
    return respond({
      // source remains "payroll" for existing Windows v1.6 clients;
      // only Telegram-verified order refs are included.
      schema: 2, scope: "FH3", source: "payroll", sourceOfTruth: "telegram_fh3_manual", revision: workspace.revision,
      pending: [...pending.map(order => ({
        orderRef: clean(order.externalReference, 180),
        orderType: order.orderType,
        // Never forward Telegram passwords/buyer credentials into the queue.
        orderName: clean(manualFH3OrderTitle(verified.get(order.externalReference.trim().toUpperCase())!), 300),
        game: clean(verified.get(order.externalReference.trim().toUpperCase())?.game || "", 150),
        discord: clean(verified.get(order.externalReference.trim().toUpperCase())?.discord || "", 150),
        buyer: "",
        task: clean(verified.get(order.externalReference.trim().toUpperCase())?.task || "", 400),
        division: "FH3",
        canTake: true,
      })), ...inboxOnly.map(item => ({
        orderRef: clean(item.order_ref, 180),
        orderType: "boosting",
        orderName: clean(manualFH3OrderTitle(item), 300),
        game: clean(item.game, 150),
        discord: clean(item.discord, 150),
        buyer: "",
        task: clean(item.task, 400),
        division: "FH3",
        canTake: true,
        canTakeWithoutPayroll: true,
        needsValuation: true,
        unlinkedPayroll: true,
      }))],
    });
  } catch (error) {
    const status = adminErrorStatus(error);
    return respond({ error: status === 401 ? "Sesi habis, silakan login ulang."
      : status === 403 ? "Akses Payroll ditolak." : "Order baru belum dapat dimuat." },
      status === 401 || status === 403 ? status : 503);
  }
}
