import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { createClient } from "@supabase/supabase-js";

const PAYPAL_API =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const TOPUP_RATE = 15000;

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
        amount?: {
          currency_code?: string;
          value?: string;
        };
      }>;
    };
  }>;
};

function getSupabaseAuthClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing Supabase auth env.");
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase server env.");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

async function getAuthenticatedUserId(request: Request) {
  const token = getBearerToken(request);

  if (!token) {
    throw new Error("Authentication required.");
  }

  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Invalid authentication token.");
  }

  return data.user.id;
}

async function getPayPalAccessToken() {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal env is missing.");
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

  if (!response.ok) {
    throw new Error("Failed to get PayPal access token.");
  }

  const data = (await response.json()) as { access_token?: string };

  if (!data.access_token) {
    throw new Error("PayPal access token is missing.");
  }

  return data.access_token;
}

async function getPayPalOrder(orderId: string, accessToken: string) {
  const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const data = (await response.json()) as PayPalOrderResponse;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data,
    };
  }

  return {
    ok: true,
    status: response.status,
    data,
  };
}

function getPayPalCustomUserId(data: PayPalOrderResponse) {
  return data.purchase_units?.[0]?.custom_id || "";
}

function getCapturedAmountUsd(data: PayPalOrderResponse) {
  const capturedAmount =
    data.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ||
    data.purchase_units?.[0]?.amount?.value ||
    "0";

  const amount = Number(capturedAmount);
  return Number.isFinite(amount) ? amount : 0;
}

function getPayerName(data: PayPalOrderResponse) {
  const givenName = data.payer?.name?.given_name || "";
  const surname = data.payer?.name?.surname || "";
  const fullName = `${givenName} ${surname}`.trim();

  return fullName || "PayPal User";
}

export async function POST(request: Request) {
  try {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    const body = (await request.json()) as { orderId?: string };
    const orderId = String(body.orderId || "").trim();

    if (!orderId) {
      return NextResponse.json(
        { error: "Missing PayPal order ID." },
        { status: 400 }
      );
    }

    const accessToken = await getPayPalAccessToken();
    const orderLookup = await getPayPalOrder(orderId, accessToken);

    if (!orderLookup.ok) {
      return NextResponse.json(
        { error: "Failed to verify PayPal order.", details: orderLookup.data },
        { status: orderLookup.status }
      );
    }

    const customUserId = getPayPalCustomUserId(orderLookup.data);

    if (customUserId !== authenticatedUserId) {
      return NextResponse.json(
        { error: "PayPal order does not belong to the authenticated user." },
        { status: 403 }
      );
    }

    const captureResponse = await fetch(
      `${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    const capturedData = (await captureResponse.json()) as PayPalOrderResponse;

    if (!captureResponse.ok) {
      console.error("PayPal top-up capture failed:", {
        status: captureResponse.status,
      });
      return NextResponse.json(
        { error: "PayPal could not complete the payment." },
        { status: captureResponse.status },
      );
    }

    if (capturedData.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "PayPal payment is not completed." },
        { status: 400 },
      );
    }

    if (getPayPalCustomUserId(capturedData) !== authenticatedUserId) {
      return NextResponse.json(
        { error: "Captured PayPal order owner mismatch." },
        { status: 403 }
      );
    }

    const paypalAmountUsd = getCapturedAmountUsd(capturedData);

    if (!paypalAmountUsd || paypalAmountUsd <= 0) {
      return NextResponse.json(
        { error: "Invalid captured PayPal amount." },
        { status: 400 }
      );
    }

    const amountIdr = Math.round(paypalAmountUsd * TOPUP_RATE);
    const supabaseAdmin = getSupabaseAdmin();

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      "credit_wallet_paypal_topup",
      {
        p_user_id: authenticatedUserId,
        p_paypal_order_id: orderId,
        p_amount_idr: amountIdr,
        p_paypal_amount_usd: paypalAmountUsd,
        p_payer_name: getPayerName(capturedData),
        p_payer_email: capturedData.payer?.email_address || null,
      }
    );

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    const { error: notificationError } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: authenticatedUserId,
        type: "wallet_topup_success",
        title: "Wallet Top Up Successful",
        message: `Your wallet balance increased by Rp ${amountIdr.toLocaleString(
          "id-ID"
        )} via PayPal.`,
        link_url: "/wallet/topup",
        is_read: false,
      });

    if (notificationError) {
      console.error("Notification insert error:", notificationError.message);
    }

    return NextResponse.json({
      id: capturedData.id,
      status: capturedData.status,
      paypalAmountUsd,
      amountIdr,
      rpcResult,
      payer: capturedData.payer || null,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "";
    const status = rawMessage.includes("Authentication") ? 401 : 500;
    console.error("PayPal top-up capture route failed:", error);
    return NextResponse.json(
      {
        error: safeApiErrorMessage(
          error,
          "Unable to complete the PayPal payment.",
          status,
        ),
      },
      { status },
    );
  }
}
