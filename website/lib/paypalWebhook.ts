import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/observability";

export type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    invoice_id?: string;
    amount?: {
      currency_code?: string;
      value?: string;
    };
    supplementary_data?: {
      related_ids?: {
        order_id?: string;
        capture_id?: string;
      };
    };
  };
};

export type PayPalWebhookProcessingResult = {
  status: "processed" | "ignored";
  eventType: string;
  orderId: number | null;
  action: string;
  alreadyPaid?: boolean;
  reason?: string;
};

export function getMarketplaceOrderId(event: PayPalWebhookEvent) {
  const customId = String(event.resource?.custom_id || "");
  const customMatch = customId.match(/^(\d+):/);
  if (customMatch) return Number(customMatch[1]);

  const invoiceId = String(event.resource?.invoice_id || "");
  const invoiceMatch = invoiceId.match(/^CP-(\d+)-/);
  return invoiceMatch ? Number(invoiceMatch[1]) : null;
}

export function getPayPalEventIdentity(event: PayPalWebhookEvent) {
  return {
    eventId: String(event.id || "").trim().slice(0, 200),
    eventType: String(event.event_type || "").trim().slice(0, 200),
  };
}

export function capturePayPalWebhookHeaders(request: Request) {
  return {
    auth_algo: request.headers.get("paypal-auth-algo"),
    cert_url: request.headers.get("paypal-cert-url"),
    transmission_id: request.headers.get("paypal-transmission-id"),
    transmission_time: request.headers.get("paypal-transmission-time"),
  };
}

async function notifyUsers(
  supabaseAdmin: SupabaseClient,
  params: {
    orderId: number;
    buyerId?: string | null;
    sellerId?: string | null;
    type: string;
    title: string;
    message: string;
  }
) {
  const notifications = [];

  if (params.buyerId) {
    notifications.push({
      user_id: params.buyerId,
      type: params.type,
      title: params.title,
      message: params.message,
      link_url: `/orders/${params.orderId}`,
      is_read: false,
    });
  }

  if (params.sellerId) {
    notifications.push({
      user_id: params.sellerId,
      type: params.type,
      title: params.title,
      message: params.message,
      link_url: `/orders/${params.orderId}`,
      is_read: false,
    });
  }

  if (notifications.length === 0) return;

  const { error } = await supabaseAdmin.from("notifications").insert(notifications);
  if (error) {
    logEvent("error", "paypal.webhook.notification_failed", {
      orderId: params.orderId,
      error,
    });
  }
}

export async function processVerifiedPayPalWebhookEvent(input: {
  supabaseAdmin: SupabaseClient;
  event: PayPalWebhookEvent;
}): Promise<PayPalWebhookProcessingResult> {
  const eventType = String(input.event.event_type || "");
  const paypalOrderId =
    input.event.resource?.supplementary_data?.related_ids?.order_id || null;
  const captureId =
    input.event.resource?.id ||
    input.event.resource?.supplementary_data?.related_ids?.capture_id ||
    null;

  let orderQuery = input.supabaseAdmin
    .from("orders")
    .select(
      "id,buyer_id,seller_id,status,payment_status,paypal_order_id,paypal_capture_id,paypal_amount_usd"
    );

  const marketplaceOrderId = getMarketplaceOrderId(input.event);

  if (paypalOrderId) {
    orderQuery = orderQuery.eq("paypal_order_id", paypalOrderId);
  } else if (marketplaceOrderId) {
    orderQuery = orderQuery.eq("id", marketplaceOrderId);
  } else if (captureId) {
    orderQuery = orderQuery.eq("paypal_capture_id", captureId);
  } else {
    return {
      status: "ignored",
      eventType,
      orderId: null,
      action: "no_order_reference",
      reason: "Webhook does not contain a marketplace order reference.",
    };
  }

  const { data: order, error: orderError } = await orderQuery.maybeSingle();
  if (orderError) throw new Error(orderError.message);

  if (!order) {
    return {
      status: "ignored",
      eventType,
      orderId: marketplaceOrderId,
      action: "order_not_found",
      reason: "Order not found.",
    };
  }

  let action = "unsupported_event_type";
  let alreadyPaid = false;

  if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
    if (!order.buyer_id) throw new Error("Paid order is missing buyer_id.");

    const amountUsd = Number(input.event.resource?.amount?.value || 0);
    const expectedAmountUsd = Number(order.paypal_amount_usd || 0);

    if (
      !Number.isFinite(amountUsd) ||
      amountUsd <= 0 ||
      (expectedAmountUsd > 0 && Math.abs(amountUsd - expectedAmountUsd) > 0.01)
    ) {
      throw Object.assign(
        new Error("PayPal webhook amount does not match the marketplace order."),
        {
          status: 400,
          details: { amountUsd, expectedAmountUsd },
        }
      );
    }

    const resolvedPayPalOrderId = paypalOrderId || order.paypal_order_id;
    if (!resolvedPayPalOrderId) {
      throw new Error("Paid order is missing paypal_order_id.");
    }

    const paymentProof = `PayPal webhook confirmed payment. Order: ${resolvedPayPalOrderId}. Capture: ${
      captureId || "-"
    }. USD ${amountUsd.toFixed(2)}.`;

    const { data, error } = await input.supabaseAdmin.rpc(
      "finalize_paypal_order_payment",
      {
        p_order_id: order.id,
        p_buyer_id: order.buyer_id,
        p_paypal_order_id: resolvedPayPalOrderId,
        p_paypal_capture_id: captureId || order.paypal_capture_id,
        p_amount_usd: amountUsd,
        p_payment_proof: paymentProof,
      }
    );

    if (error) throw new Error(error.message);
    const result = (data || {}) as { already_paid?: boolean };
    alreadyPaid = Boolean(result.already_paid);
    action = alreadyPaid ? "payment_already_finalized" : "payment_finalized";

    if (!alreadyPaid) {
      await notifyUsers(input.supabaseAdmin, {
        orderId: order.id,
        buyerId: order.buyer_id,
        sellerId: order.seller_id,
        type: "payment_success",
        title: `Payment Confirmed for Order #${order.id}`,
        message: "PayPal confirmed the payment. The order is now protected by escrow.",
      });
    }
  } else if (
    eventType === "PAYMENT.CAPTURE.DENIED" ||
    eventType === "CHECKOUT.PAYMENT-APPROVAL.REVERSED"
  ) {
    const { error } = await input.supabaseAdmin
      .from("orders")
      .update({
        status: "pending_payment",
        payment_status: "denied",
        escrow_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .neq("payment_status", "paid");
    if (error) throw new Error(error.message);

    await notifyUsers(input.supabaseAdmin, {
      orderId: order.id,
      buyerId: order.buyer_id,
      sellerId: order.seller_id,
      type: "payment_failed",
      title: `Payment Failed for Order #${order.id}`,
      message: "PayPal reported that the payment was denied or approval was reversed.",
    });
    action = "payment_denied";
  } else if (
    eventType === "PAYMENT.CAPTURE.REFUNDED" ||
    eventType === "PAYMENT.CAPTURE.REVERSED"
  ) {
    const { error } = await input.supabaseAdmin
      .from("orders")
      .update({
        status: "disputed",
        payment_status:
          eventType === "PAYMENT.CAPTURE.REFUNDED" ? "refunded" : "reversed",
        escrow_status: "disputed",
        seller_payout_status: "review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    if (error) throw new Error(error.message);

    await notifyUsers(input.supabaseAdmin, {
      orderId: order.id,
      buyerId: order.buyer_id,
      sellerId: order.seller_id,
      type: "payment_review",
      title: `Payment Review Required for Order #${order.id}`,
      message: "PayPal reported a refund or reversal. The order was moved to dispute review.",
    });
    action = "payment_moved_to_review";
  }

  const { error: transactionError } = await input.supabaseAdmin
    .from("paypal_transactions")
    .update({
      raw_response: input.event,
      status: eventType.toLowerCase(),
    })
    .eq("order_id", order.id);
  if (transactionError) throw new Error(transactionError.message);

  if (action === "unsupported_event_type") {
    return {
      status: "ignored",
      eventType,
      orderId: Number(order.id),
      action,
      reason: "Verified event type is not handled by the marketplace.",
    };
  }

  return {
    status: "processed",
    eventType,
    orderId: Number(order.id),
    action,
    alreadyPaid,
  };
}
