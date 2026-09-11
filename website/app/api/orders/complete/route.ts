import { NextResponse } from "next/server";
import { recordTrustedMarketplaceEvent } from "@/lib/marketplaceEventsServer";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export async function POST(request: Request) {
  try {
    const buyer = await requireAuthenticatedUser(request);
    const body = (await request.json()) as { orderId?: number | string };
    const orderId = Number(body.orderId || 0);

    if (!Number.isFinite(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data, error: rpcError } = await supabaseAdmin.rpc(
      "complete_order_and_release_escrow_v23",
      {
        p_order_id: orderId,
        p_buyer_id: buyer.id,
      },
    );

    if (rpcError) {
      const normalized = String(rpcError.message || "").toLowerCase();
      console.error("Order completion RPC failed:", rpcError.message);

      if (normalized.includes("not found")) {
        return NextResponse.json(
          { error: "Order not found." },
          { status: 404 },
        );
      }
      if (
        normalized.includes("only the buyer") ||
        normalized.includes("buyer mismatch")
      ) {
        return NextResponse.json(
          { error: "Only the buyer can complete this order." },
          { status: 403 },
        );
      }
      if (normalized.includes("must be delivered")) {
        return NextResponse.json(
          { error: "The order must be delivered before it can be completed." },
          { status: 409 },
        );
      }
      if (
        normalized.includes("must be paid") ||
        normalized.includes("invalid")
      ) {
        return NextResponse.json(
          { error: "This order cannot be completed in its current state." },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { error: "The order could not be completed." },
        { status: 500 },
      );
    }

    const result = (data || {}) as {
      already_completed?: boolean;
      seller_id?: string;
      seller_earning?: number;
      marketplace_fee?: number;
      seller_sales_tax?: number;
      seller_sales_tax_rate_percent?: number;
      seller_gross?: number;
    };

    if (!result.already_completed && result.seller_id) {
      const sellerEarning = Number(result.seller_earning || 0);
      const { error: notificationError } = await supabaseAdmin
        .from("notifications")
        .insert([
          {
            user_id: buyer.id,
            type: "order_completed",
            title: `Order #${orderId} Completed`,
            message: "You confirmed receipt and released the escrow payment.",
            link_url: `/orders/${orderId}`,
            is_read: false,
          },
          {
            user_id: result.seller_id,
            type: "seller_payout_released",
            title: `Payout Released for Order #${orderId}`,
            message:
              Number(result.seller_sales_tax_rate_percent || 0) > 0
                ? `${sellerEarning.toLocaleString(
                    "id-ID",
                  )} IDR has been added after marketplace fee and ${Number(
                    result.seller_sales_tax_rate_percent || 0,
                  )}% seller sales tax.`
                : `${sellerEarning.toLocaleString(
                    "id-ID",
                  )} IDR has been added after marketplace fee. This historical paid order keeps the tax treatment captured before the current immutable pricing model.`,
            link_url: "/wallet",
            is_read: false,
          },
        ]);

      if (notificationError) {
        console.error(
          "Order completion notification failed:",
          notificationError.message,
        );
      }

      await recordTrustedMarketplaceEvent({
        supabaseAdmin,
        eventType: "order_complete",
        orderId,
        userId: buyer.id,
      });
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = authErrorStatus(message);
    console.error("Order completion route failed:", message || error);

    return NextResponse.json(
      {
        error:
          status === 401
            ? "Authentication required."
            : "The order could not be completed.",
      },
      { status },
    );
  }
}
