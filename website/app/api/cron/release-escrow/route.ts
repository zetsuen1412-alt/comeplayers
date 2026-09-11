import { NextResponse } from "next/server";
import { requestId } from "@/lib/observability";
import { runTrackedOperation } from "@/lib/operationalRuns";
import { createSupabaseAdmin } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

const AUTO_COMPLETE_HOURS = Math.max(
  1,
  Number(process.env.AUTO_COMPLETE_HOURS || 72)
);

type OrderRow = {
  id: number;
  buyer_id: string | null;
  seller_id: string | null;
  delivered_at: string | null;
};

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string;
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
    console.error("Cron notification error:", error.message);
  }
}

async function handleAutoComplete(request: Request) {
  const currentRequestId = requestId(request);
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized cron request." },
      { status: 401, headers: { "x-request-id": currentRequestId } }
    );
  }

  const supabaseAdmin = createSupabaseAdmin();

  try {
    const result = await runTrackedOperation({
      supabaseAdmin,
      jobName: "release_escrow",
      runKey: `cron:release-escrow:${new Date().toISOString().slice(0, 13)}`,
      source: "cron",
      requestId: currentRequestId,
      execute: async () => {
        const deliveredBefore = new Date(
          Date.now() - AUTO_COMPLETE_HOURS * 60 * 60 * 1000
        ).toISOString();

        const { data, error } = await supabaseAdmin
          .from("orders")
          .select("id,buyer_id,seller_id,delivered_at")
          .eq("status", "delivered")
          .eq("payment_status", "paid")
          .eq("escrow_status", "holding")
          .not("buyer_id", "is", null)
          .not("seller_id", "is", null)
          .not("delivered_at", "is", null)
          .lte("delivered_at", deliveredBefore)
          .order("delivered_at", { ascending: true })
          .limit(50);

        if (error) throw new Error(error.message);

        const results: Array<{
          orderId: number;
          completed: boolean;
          reason?: string;
        }> = [];

        for (const order of (data || []) as OrderRow[]) {
          if (!order.buyer_id || !order.seller_id) continue;

          const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
            "complete_order_and_release_escrow_v23",
            {
              p_order_id: order.id,
              p_buyer_id: order.buyer_id,
            }
          );

          if (rpcError) {
            results.push({
              orderId: order.id,
              completed: false,
              reason: rpcError.message,
            });
            continue;
          }

          const rpcResult = (rpcData || {}) as {
            already_completed?: boolean;
            seller_earning?: number;
          };

          results.push({
            orderId: order.id,
            completed: true,
            reason: rpcResult.already_completed
              ? "Already completed."
              : "Auto completed.",
          });

          await Promise.all([
            createNotification({
              userId: order.buyer_id,
              type: "order_auto_completed",
              title: `Order #${order.id} Auto-Completed`,
              message:
                "The inspection window expired, so the order was completed automatically.",
              linkUrl: `/orders/${order.id}`,
            }),
            createNotification({
              userId: order.seller_id,
              type: "seller_payout_released",
              title: `Payout Released for Order #${order.id}`,
              message: `${Number(rpcResult.seller_earning || 0).toLocaleString(
                "id-ID"
              )} IDR was released to your seller wallet.`,
              linkUrl: "/wallet",
            }),
          ]);
        }

        return {
          autoCompleteHours: AUTO_COMPLETE_HOURS,
          scanned: data?.length || 0,
          completed: results.filter((item) => item.completed).length,
          failed: results.filter((item) => !item.completed).length,
          results,
        };
      },
      summarize: (value) => ({
        scanned: value.scanned,
        completed: value.completed,
        failed: value.failed,
      }),
    });

    return NextResponse.json(
      { success: true, ...result },
      { headers: { "x-request-id": currentRequestId } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Escrow release cron failed.",
      },
      { status: 500, headers: { "x-request-id": currentRequestId } }
    );
  }
}

export async function GET(request: Request) {
  return handleAutoComplete(request);
}

export async function POST(request: Request) {
  return handleAutoComplete(request);
}
