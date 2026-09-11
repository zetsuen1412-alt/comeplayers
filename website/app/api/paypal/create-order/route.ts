import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { createClient } from "@supabase/supabase-js";

const PAYPAL_API =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const TOPUP_RATE = 15000;
const MIN_PAYPAL_TOPUP_USD = 1;
const MAX_PAYPAL_TOPUP_USD = 1000;

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

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = (await request.json()) as { amountUsd?: number | string };

    const amountUsd = Number(body.amountUsd || 0);
    const amountIdr = Math.round(amountUsd * TOPUP_RATE);

    if (!Number.isFinite(amountUsd) || amountUsd < MIN_PAYPAL_TOPUP_USD) {
      return NextResponse.json(
        { error: `Minimum PayPal top up is USD ${MIN_PAYPAL_TOPUP_USD}.` },
        { status: 400 }
      );
    }

    if (amountUsd > MAX_PAYPAL_TOPUP_USD) {
      return NextResponse.json(
        { error: `Maximum PayPal top up is USD ${MAX_PAYPAL_TOPUP_USD}.` },
        { status: 400 }
      );
    }

    const accessToken = await getPayPalAccessToken();

    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: userId,
            description: `ComePlayers Wallet Top Up - Rp ${amountIdr.toLocaleString("id-ID")}`,
            amount: {
              currency_code: "USD",
              value: amountUsd.toFixed(2),
            },
          },
        ],
        application_context: {
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
        },
      }),
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("PayPal top-up order creation failed:", {
        status: response.status,
      });
      return NextResponse.json(
        { error: "PayPal could not create the payment order." },
        { status: response.status },
      );
    }

    return NextResponse.json({
      id: data.id,
      status: data.status,
      amountUsd,
      amountIdr,
      rate: TOPUP_RATE,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "";
    const status = rawMessage.includes("Authentication") ? 401 : 500;
    console.error("PayPal top-up order route failed:", error);
    return NextResponse.json(
      {
        error: safeApiErrorMessage(
          error,
          "Unable to start the PayPal payment.",
          status,
        ),
      },
      { status },
    );
  }
}
