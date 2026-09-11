import { NextResponse } from "next/server";
import { requestId } from "@/lib/observability";
import { runTrackedOperation } from "@/lib/operationalRuns";
import { createSupabaseAdmin } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

type LateOrderRow = {
  order_id: number;
  buyer_id: string | null;
  seller_id: string | null;
  delivery_due_at: string | null;
};

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function insertNotification(params: {
  userId: string;
  title: string;
  message: string;
  linkUrl: string;
  type: string;
}) {
  const supabaseAdmin = createSupabaseAdmin();
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    link_url: params.linkUrl,
    is_read: false,
  });

  if (error) {
    console.error("Late-order notification failed:", error.message);
  }
}

async function run(request: Request) {
  const currentRequestId = requestId(request);
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized cron request." },
      { status: 401, headers: { "x-request-id": currentRequestId } }
    );
  }

  const supabaseAdmin = createSupabaseAdmin();

  try {
    const result = await runTrackedOperation({
      supabaseAdmin,
      jobName: "mark_late_orders",
      runKey: `cron:mark-late-orders:${new Date().toISOString().slice(0, 13)}`,
      source: "cron",
      requestId: currentRequestId,
      execute: async () => {
        const { data, error } = await supabaseAdmin.rpc(
          "cp_mark_late_delivery_orders",
          { p_limit: 500 }
        );
        if (error) throw new Error(error.message);

        const lateOrders = (data || []) as LateOrderRow[];

        for (const order of lateOrders) {
          const linkUrl = `/orders/${order.order_id}`;
          const dueText = order.delivery_due_at
            ? new Intl.DateTimeFormat("id-ID", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "UTC",
              }).format(new Date(order.delivery_due_at))
            : "the configured deadline";

          const notifications: Promise<void>[] = [];

          if (order.seller_id) {
            notifications.push(
              insertNotification({
                userId: order.seller_id,
                type: "delivery_sla_late",
                title: `Order #${order.order_id} Is Late`,
                message: `The delivery deadline (${dueText} UTC) has passed. Deliver the order as soon as possible.`,
                linkUrl,
              })
            );
          }

          if (order.buyer_id) {
            notifications.push(
              insertNotification({
                userId: order.buyer_id,
                type: "delivery_sla_late_buyer",
                title: `Order #${order.order_id} Delivery Is Delayed`,
                message:
                  "The seller missed the delivery estimate. Your payment remains protected in escrow.",
                linkUrl,
              })
            );
          }

          await Promise.all(notifications);
        }

        return {
          markedLate: lateOrders.length,
          orders: lateOrders.map((order) => order.order_id),
        };
      },
      summarize: (value) => ({ markedLate: value.markedLate }),
    });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "x-request-id": currentRequestId } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Late-order cron failed.",
      },
      { status: 500, headers: { "x-request-id": currentRequestId } }
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
