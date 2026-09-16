import { NextResponse } from "next/server";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";
import { recordTrustedMarketplaceEvent } from "@/lib/marketplaceEventsServer";
import {
  requireCheckoutAccess,
  runtimeControlErrorCode,
  runtimeControlErrorStatus,
} from "@/lib/runtimeControls";

export async function POST(request: Request) {
  try {
    const buyer = await requireAuthenticatedUser(request);
    const body = (await request.json()) as { orderId?: number | string };
    const orderId = Number(body.orderId || 0);

    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    await requireCheckoutAccess({ supabaseAdmin, userId: buyer.id });

    const { data, error: rpcError } = await supabaseAdmin.rpc(
      "pay_order_with_wallet",
      {
        p_order_id: orderId,
        p_buyer_id: buyer.id,
      },
    );

    if (rpcError) {
      const normalized = String(rpcError.message || "").toLowerCase();
      console.error("Wallet payment RPC failed:", rpcError.message);
      if (rpcError.code === "P0001" && ["frozen", "external payment", "expired", "not active"].some(text => normalized.includes(text))) {
        return NextResponse.json({ error: rpcError.message }, { status: 409 });
      }

      if (normalized.includes("not found")) {
        return NextResponse.json(
          { error: "Order not found." },
          { status: 404 },
        );
      }
      if (
        normalized.includes("buyer mismatch") ||
        normalized.includes("own order")
      ) {
        return NextResponse.json(
          { error: "You cannot pay this order." },
          { status: 403 },
        );
      }
      if (normalized.includes("insufficient")) {
        return NextResponse.json(
          { error: "Wallet balance is insufficient." },
          { status: 400 },
        );
      }
      if (normalized.includes("stock")) {
        return NextResponse.json(
          { error: "Product stock is no longer available." },
          { status: 409 },
        );
      }
      if (normalized.includes("invalid")) {
        return NextResponse.json(
          { error: "This order cannot be paid with wallet." },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { error: "Wallet payment could not be completed." },
        { status: 500 },
      );
    }

    const result = (data || {}) as {
      already_paid?: boolean;
      seller_id?: string;
      total?: number;
    };

    if (!result.already_paid) {
      const notifications = [
        {
          user_id: buyer.id,
          type: "payment_success",
          title: "Wallet Payment Successful",
          message: `Your payment for Order #${orderId} was completed.`,
          link_url: `/order-success/${orderId}`,
          is_read: false,
        },
      ];

      if (result.seller_id) {
        notifications.push({
          user_id: result.seller_id,
          type: "seller_new_paid_order",
          title: "New Paid Order",
          message: `Order #${orderId} has been paid with ComePlayers Wallet.`,
          link_url: `/orders/${orderId}`,
          is_read: false,
        });
      }

      const { error: notificationError } = await supabaseAdmin
        .from("notifications")
        .insert(notifications);

      if (notificationError) {
        console.error(
          "Wallet payment notification failed:",
          notificationError.message,
        );
      }

      await recordTrustedMarketplaceEvent({
        supabaseAdmin,
        eventType: "payment_success",
        orderId,
        userId: buyer.id,
        metadata: { payment_method: "wallet" },
      });
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const runtimeStatus = runtimeControlErrorStatus(error);
    const authStatus = authErrorStatus(message);

    console.error("Wallet payment route failed:", message || error);

    if (runtimeStatus) {
      return NextResponse.json(
        {
          error: "Checkout is temporarily unavailable.",
          code: runtimeControlErrorCode(error),
        },
        { status: runtimeStatus },
      );
    }

    return NextResponse.json(
      {
        error:
          authStatus === 401
            ? "Authentication required."
            : "Wallet payment could not be completed.",
      },
      { status: authStatus },
    );
  }
}
