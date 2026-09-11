import "server-only";

const PAYPAL_API =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export type PayPalCaptureDetails = {
  id?: string;
  status?: string;
  amount?: { currency_code?: string; value?: string };
  invoice_id?: string;
  custom_id?: string;
  create_time?: string;
  update_time?: string;
  supplementary_data?: {
    related_ids?: { order_id?: string };
  };
  seller_receivable_breakdown?: {
    gross_amount?: { currency_code?: string; value?: string };
    paypal_fee?: { currency_code?: string; value?: string };
    net_amount?: { currency_code?: string; value?: string };
  };
};

function requestTimeoutMs() {
  const value = Number(process.env.PAYPAL_RECONCILIATION_TIMEOUT_MS || 10000);
  return Number.isFinite(value) ? Math.min(30000, Math.max(2000, value)) : 10000;
}

let cachedAccessToken = "";
let cachedAccessTokenExpiresAt = 0;

async function getPayPalAccessToken() {
  if (cachedAccessToken && cachedAccessTokenExpiresAt > Date.now() + 60_000) {
    return cachedAccessToken;
  }
  const clientId =
    process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PayPal server credentials are missing.");
  }

  const authorization = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(requestTimeoutMs()),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || "Unable to obtain a PayPal access token."
    );
  }
  cachedAccessToken = payload.access_token;
  cachedAccessTokenExpiresAt =
    Date.now() + Math.max(60, Number(payload.expires_in || 300)) * 1000;
  return cachedAccessToken;
}

export async function getPayPalCaptureDetails(captureId: string) {
  const normalizedCaptureId = captureId.trim();
  if (!normalizedCaptureId) throw new Error("PayPal capture ID is required.");
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(
    `${PAYPAL_API}/v2/payments/captures/${encodeURIComponent(normalizedCaptureId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(requestTimeoutMs()),
      cache: "no-store",
    }
  );
  const payload = (await response.json().catch(() => ({}))) as PayPalCaptureDetails & {
    message?: string;
    details?: Array<{ description?: string }>;
  };
  if (!response.ok) {
    throw new Error(
      payload.details?.[0]?.description ||
        payload.message ||
        `PayPal capture lookup returned HTTP ${response.status}.`
    );
  }
  return payload;
}
