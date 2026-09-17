import { NextResponse } from "next/server";
import { recordTrustedMarketplaceEvent } from "@/lib/marketplaceEventsServer";
import { matchesPayPalUsdAmount } from "@/lib/paypalCheckout";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

const PAYPAL_API =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const RESERVATION_MINUTES = Math.min(
  60,
  Math.max(5, Number(process.env.CHECKOUT_RESERVATION_MINUTES || 20)),
);

type PayPalOrderResponse = {
  id?: string;
  status?: string;
  payer?: {
    email_address?: string;
    name?: {
      given_name?: string;
      surname?: string;
    };
  };
  purchase_units?: Array<{
    custom_id?: string;
    amount?: {
      currency_code?: string;
      value?: string;
    };
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
        amount?: {
          currency_code?: string;
          value?: string;
        };
      }>;
    };
  }>;
  details?: Array<{ issue?: string; description?: string }>;
  message?: string;
};

type OrderRow = {
  id: number;
  buyer_id: string | null;
  seller_id: string | null;
  product_id: number | null;
  quantity: number | null;
  total_amount: string | number | null;
  total_price: string | number | null;
  price: string | number | null;
  payment_status: string | null;
  status: string | null;
  paypal_order_id: string | null;
  paypal_amount_usd: string | number | null;
};

function normalize(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function getPayPalAccessToken() {
  const clientId =
    process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal environment variables are missing.");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const data = (await response.json()) as {
    access_token?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description || "Failed to get PayPal access token.",
    );
  }

  return data.access_token;
}

async function readPayPalOrder(orderId: string, accessToken: string) {
  const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const data = (await response.json()) as PayPalOrderResponse;

  if (!response.ok) {
    throw new Error(data.message || "Failed to read PayPal order.");
  }

  return data;
}

function getPayPalCustomId(data: PayPalOrderResponse) {
  return data.purchase_units?.[0]?.custom_id || "";
}

function getCapturedUsd(data: PayPalOrderResponse) {
  const value =
    data.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ||
    data.purchase_units?.[0]?.amount?.value ||
    "0";
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function getCaptureId(data: PayPalOrderResponse) {
  return data.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as {
      paypalOrderId?: string;
      marketplaceOrderId?: string | number;
    };

    const paypalOrderId = String(body.paypalOrderId || "").trim();
    const marketplaceOrderId = Number(body.marketplaceOrderId || 0);

    if (
      !paypalOrderId ||
      !Number.isSafeInteger(marketplaceOrderId) ||
      marketplaceOrderId <= 0
    ) {
      return NextResponse.json(
        { error: "Missing PayPal or marketplace order ID." },
        { status: 400 },
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id,buyer_id,seller_id,product_id,quantity,total_amount,total_price,price,payment_status,status,paypal_order_id,paypal_amount_usd",
      )
      .eq("id", marketplaceOrderId)
      .maybeSingle();

    if (orderError || !order) {
      if (orderError) {
        console.error(
          "PayPal checkout order lookup failed:",
          orderError.message,
        );
      }
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const orderRow = order as OrderRow;

    if (orderRow.buyer_id !== user.id) {
      return NextResponse.json(
        { error: "You can only capture your own order." },
        { status: 403 },
      );
    }

    if (
      normalize(orderRow.payment_status) === "paid" ||
      ["paid", "delivered", "completed"].includes(normalize(orderRow.status))
    ) {
      return NextResponse.json({
        ok: true,
        alreadyCaptured: true,
        marketplaceOrderId,
      });
    }

    if (
      !orderRow.paypal_order_id ||
      orderRow.paypal_order_id !== paypalOrderId
    ) {
      return NextResponse.json(
        { error: "PayPal order ID does not match this marketplace order." },
        { status: 403 },
      );
    }

    const requiredUsd = Number(orderRow.paypal_amount_usd);
    if (!Number.isFinite(requiredUsd) || requiredUsd <= 0) {
      return NextResponse.json({ error: "The saved PayPal quote is missing. Restart payment." }, { status: 409 });
    }

    const { error: reservationError } = await supabaseAdmin.rpc(
      "cp_prepare_order_payment",
      {
        p_order_id: marketplaceOrderId,
        p_buyer_id: user.id,
        p_extension_minutes: RESERVATION_MINUTES,
      },
    );

    if (reservationError) {
      const normalized = String(reservationError.message || "").toLowerCase();
      console.error(
        "PayPal stock reservation failed:",
        reservationError.message,
      );

      if (normalized.includes("expired")) {
        return NextResponse.json(
          { error: "The checkout reservation has expired." },
          { status: 409 },
        );
      }
      if (normalized.includes("stock")) {
        return NextResponse.json(
          { error: "Product stock is no longer available." },
          { status: 409 },
        );
      }
      if (normalized.includes("not found")) {
        return NextResponse.json(
          { error: "Order not found." },
          { status: 404 },
        );
      }

      return NextResponse.json(
        { error: "The order is not ready for payment." },
        { status: 400 },
      );
    }

    const accessToken = await getPayPalAccessToken();
    const approved = await readPayPalOrder(paypalOrderId, accessToken);
    const approvedUnit = approved.purchase_units?.[0];
    if (approved.purchase_units?.length !== 1 || approvedUnit?.custom_id !== `${marketplaceOrderId}:${user.id}` ||
        !matchesPayPalUsdAmount(approvedUnit?.amount?.value, approvedUnit?.amount?.currency_code, requiredUsd)) {
      return NextResponse.json({ error: "PayPal amount or owner does not match this order." }, { status: 409 });
    }
    const captureResponse = await fetch(
      `${PAYPAL_API}/v2/checkout/orders/${paypalOrderId}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": `cp-capture-${marketplaceOrderId}`,
        },
        cache: "no-store",
      },
    );

    let capturedData = (await captureResponse.json()) as PayPalOrderResponse;

    if (!captureResponse.ok) {
      const alreadyCaptured = capturedData.details?.some(
        (detail) => detail.issue === "ORDER_ALREADY_CAPTURED",
      );

      if (!alreadyCaptured) {
        console.error("PayPal checkout capture failed:", {
          status: captureResponse.status,
          message: capturedData.message,
          details: capturedData.details,
        });
        return NextResponse.json(
          { error: "PayPal could not complete this payment." },
          { status: 502 },
        );
      }

      capturedData = await readPayPalOrder(paypalOrderId, accessToken);
    }

    if (capturedData.status !== "COMPLETED") {
      console.error("PayPal checkout was not completed:", {
        paypalOrderId,
        status: capturedData.status,
      });
      return NextResponse.json(
        { error: "PayPal payment is not completed." },
        { status: 409 },
      );
    }

    const customId = getPayPalCustomId(capturedData);
    const expectedCustomId = `${marketplaceOrderId}:${user.id}`;
    const storedIdMatches = orderRow.paypal_order_id === paypalOrderId;
    const validOwner =
      customId === expectedCustomId ||
      (storedIdMatches && (customId === user.id || customId === ""));

    if (!validOwner) {
      console.error("PayPal checkout owner mismatch:", {
        marketplaceOrderId,
        paypalOrderId,
      });
      return NextResponse.json(
        { error: "PayPal order owner mismatch." },
        { status: 403 },
      );
    }

    const capturedUsd = getCapturedUsd(capturedData);

    const captures = capturedData.purchase_units?.[0]?.payments?.captures;
    const completedCapture = captures?.[0];
    if (capturedData.purchase_units?.length !== 1 || captures?.length !== 1 ||
      !completedCapture?.id || completedCapture.status !== "COMPLETED" ||
      !matchesPayPalUsdAmount(completedCapture.amount?.value, completedCapture.amount?.currency_code, requiredUsd)) {
      console.error("PayPal checkout amount mismatch:", {
        marketplaceOrderId,
        capturedUsd,
        requiredUsd,
      });
      return NextResponse.json(
        { error: "Captured PayPal amount does not match the order amount." },
        { status: 400 },
      );
    }

    const captureId = getCaptureId(capturedData);
    const paymentProof = `PayPal paid. Order: ${paypalOrderId}. Capture: ${
      captureId || "-"
    }. USD ${capturedUsd.toFixed(2)}.`;

    const { data: finalizeResult, error: finalizeError } =
      await supabaseAdmin.rpc("finalize_paypal_order_payment", {
        p_order_id: marketplaceOrderId,
        p_buyer_id: user.id,
        p_paypal_order_id: paypalOrderId,
        p_paypal_capture_id: captureId,
        p_amount_usd: capturedUsd,
        p_payment_proof: paymentProof,
      });

    if (finalizeError) {
      throw new Error(finalizeError.message);
    }

    const result = (finalizeResult || {}) as {
      already_paid?: boolean;
      seller_id?: string;
    };

    if (!result.already_paid) {
      const notifications = [
        {
          user_id: user.id,
          type: "payment_success",
          title: "Payment Successful",
          message: `Your PayPal payment for Order #${marketplaceOrderId} was completed.`,
          link_url: `/order-success/${marketplaceOrderId}`,
          is_read: false,
        },
      ];

      if (result.seller_id) {
        notifications.push({
          user_id: result.seller_id,
          type: "seller_new_paid_order",
          title: "New Paid Order",
          message: `Order #${marketplaceOrderId} has been paid via PayPal and is waiting for delivery.`,
          link_url: `/orders/${marketplaceOrderId}`,
          is_read: false,
        });
      }

      const { error: notificationError } = await supabaseAdmin
        .from("notifications")
        .insert(notifications);

      if (notificationError) {
        console.error("PayPal notification failed:", notificationError.message);
      }

      await recordTrustedMarketplaceEvent({
        supabaseAdmin,
        eventType: "payment_success",
        orderId: marketplaceOrderId,
        userId: user.id,
        metadata: { payment_method: "paypal" },
      });
    }

    return NextResponse.json({
      ok: true,
      status: capturedData.status,
      paypalOrderId,
      marketplaceOrderId,
      capturedUsd,
      result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected PayPal checkout capture error.";

    const status = authErrorStatus(message);
    console.error("PayPal checkout capture route failed:", message);

    return NextResponse.json(
      {
        error:
          status === 401
            ? "Authentication required."
            : "Unable to complete PayPal payment.",
      },
      { status },
    );
  }
}
