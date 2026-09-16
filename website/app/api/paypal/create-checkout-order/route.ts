import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { orderTotalIdr } from "@/lib/money";
import { fetchFrankfurterRates } from "@/lib/frankfurter";
import { quotePayPalUsd } from "@/lib/checkoutCurrency";
import { isTrustedPayPalCheckoutUrl } from "@/lib/paypalCheckout";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";
import {
  requireCheckoutAccess,
  runtimeControlErrorCode,
  runtimeControlErrorStatus,
} from "@/lib/runtimeControls";

const PAYPAL_API =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
const PAYPAL_CHECKOUT_ENABLED =
  process.env.PAYPAL_CHECKOUT_ENABLED === "true";

const MIN_USD = 1;
const RESERVATION_MINUTES = Math.min(
  60,
  Math.max(5, Number(process.env.CHECKOUT_RESERVATION_MINUTES || 20))
);

type OrderRow = {
  id: number;
  buyer_id: string | null;
  seller_id: string | null;
  product_id: number | null;
  quantity: number | null;
  total_amount: string | number | null;
  total_price: string | number | null;
  price: string | number | null;
  product_title: string | null;
  status: string | null;
  payment_status: string | null;
  currency_code: string | null;
};

type PayPalCreateResponse = {
  id?: string;
  status?: string;
  links?: Array<{ rel?: string; href?: string }>;
  error_description?: string;
};

function normalize(value?: string | null) {
  return String(value || "").trim().toLowerCase();
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
      data.error_description || "Failed to get PayPal access token."
    );
  }

  return data.access_token;
}

export async function POST(request: Request) {
  if (!PAYPAL_CHECKOUT_ENABLED) {
    return NextResponse.json(
      { error: "PayPal payment is no longer available." },
      { status: 410 },
    );
  }

  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as { orderId?: string | number };
    const marketplaceOrderId = Number(body.orderId || 0);

    if (!Number.isSafeInteger(marketplaceOrderId) || marketplaceOrderId <= 0) {
      return NextResponse.json(
        { error: "Invalid marketplace order ID." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    await requireCheckoutAccess({ supabaseAdmin, userId: user.id });

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id,buyer_id,seller_id,product_id,quantity,total_amount,total_price,price,product_title,status,payment_status,currency_code"
      )
      .eq("id", marketplaceOrderId)
      .maybeSingle();

    if (orderError) {
      console.error("PayPal checkout order lookup failed:", orderError.message);
      return NextResponse.json(
        { error: "Unable to load the order." },
        { status: 500 },
      );
    }
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const orderRow = order as OrderRow;

    if (orderRow.buyer_id !== user.id) {
      return NextResponse.json(
        { error: "You can only pay your own order." },
        { status: 403 }
      );
    }

    if (
      normalize(orderRow.payment_status) === "paid" ||
      ["paid", "delivered", "completed"].includes(normalize(orderRow.status))
    ) {
      return NextResponse.json(
        { error: "This order has already been paid." },
        { status: 409 }
      );
    }

    if (normalize(orderRow.currency_code || "IDR") !== "idr") {
      return NextResponse.json({ error: "PayPal checkout requires an IDR order." }, { status: 400 });
    }
    const { data: reservation, error: reservationError } =
      await supabaseAdmin.rpc("cp_prepare_order_payment", {
        p_order_id: marketplaceOrderId,
        p_buyer_id: user.id,
        p_extension_minutes: RESERVATION_MINUTES,
      });

    if (reservationError) {
      const normalizedMessage = reservationError.message.toLowerCase();
      if (normalizedMessage.includes("expired")) {
        return NextResponse.json(
          { error: "The checkout reservation has expired." },
          { status: 409 },
        );
      }
      if (normalizedMessage.includes("stock")) {
        return NextResponse.json(
          { error: "Product stock is no longer available." },
          { status: 409 },
        );
      }
      if (normalizedMessage.includes("active")) {
        return NextResponse.json(
          { error: "This order is not active for payment." },
          { status: 409 },
        );
      }

      console.error("PayPal checkout reservation failed:", reservationError.message);
      return NextResponse.json(
        { error: "Unable to reserve this order for payment." },
        { status: 500 },
      );
    }

    const totalIdr = orderTotalIdr(orderRow);

    if (!totalIdr || totalIdr <= 0) {
      return NextResponse.json(
        { error: "Order total is invalid." },
        { status: 400 }
      );
    }

    const liveRate = await fetchFrankfurterRates().then(result => result.rates.IDR?.units_per_usd).catch(() => undefined);
    const paypalQuote = quotePayPalUsd(totalIdr, liveRate);
    const amountUsd = paypalQuote.amount;
    if (amountUsd < MIN_USD) {
      return NextResponse.json({ error: "This order is below the PayPal minimum. Choose another payment method." }, { status: 400 });
    }
    const accessToken = await getPayPalAccessToken();
    const origin = new URL(request.url).origin;

    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `cp-order-${marketplaceOrderId}-${Date.now()}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: `${marketplaceOrderId}:${user.id}`,
            invoice_id: `CP-${marketplaceOrderId}-${Date.now()}`.slice(0, 127),
            description: `ComePlayers Order #${marketplaceOrderId}`,
            amount: {
              currency_code: "USD",
              value: amountUsd.toFixed(2),
            },
          },
        ],
        application_context: {
          brand_name: "ComePlayers",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: `${origin}/payment/${marketplaceOrderId}?method=paypal&paypalReturn=1`,
          cancel_url: `${origin}/payment/${marketplaceOrderId}?method=paypal&paypalCancel=1`,
        },
      }),
      cache: "no-store",
    });

    const data = (await response.json()) as PayPalCreateResponse;

    if (!response.ok || !data.id) {
      console.error("PayPal checkout order creation failed:", {
        status: response.status,
      });
      return NextResponse.json(
        { error: "PayPal could not create the checkout order." },
        { status: response.status || 500 },
      );
    }

    const approveUrl =
      data.links?.find((link) => link.rel === "approve")?.href ||
      data.links?.find((link) => link.rel === "payer-action")?.href ||
      "";

    if (!approveUrl || !isTrustedPayPalCheckoutUrl(approveUrl)) {
      console.error("PayPal approval URL was not returned.");
      return NextResponse.json(
        { error: "PayPal approval is temporarily unavailable." },
        { status: 500 },
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        status: "pending_payment",
        payment_status: "paypal_created",
        payment_method: "paypal",
        paypal_order_id: data.id,
        paypal_amount_usd: amountUsd,
        escrow_status: "pending",
        payment_proof: `PayPal checkout created: ${data.id}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", marketplaceOrderId)
      .eq("buyer_id", user.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({
      paypalOrderId: data.id,
      approveUrl,
      currency: "USD",
      amountUsd,
      amountIdr: totalIdr,
      rate: paypalQuote.idrPerUnit,
      marginPercent: paypalQuote.marginPercent,
      reservation,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "";
    const runtimeStatus = runtimeControlErrorStatus(error);
    const status = runtimeStatus || authErrorStatus(rawMessage);
    console.error("PayPal checkout order route failed:", error);
    return NextResponse.json(
      {
        error: safeApiErrorMessage(
          error,
          "Unable to start the PayPal checkout.",
          status,
        ),
        code: runtimeControlErrorCode(error),
      },
      { status },
    );
  }
}
