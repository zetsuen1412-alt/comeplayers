import "server-only";

type PayPalErrorDetail = {
  issue?: string;
  description?: string;
};

type PayPalRefundResponse = {
  id?: string;
  status?: string;
  details?: PayPalErrorDetail[];
  message?: string;
  name?: string;
};

function getPayPalApiBase() {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getPayPalAccessToken() {
  const clientId =
    process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal server credentials are missing.");
  }

  const authorization = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const response = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || "Unable to obtain a PayPal access token."
    );
  }

  return payload.access_token;
}

export async function refundPayPalCapture(input: {
  captureId: string;
  idempotencyKey: string;
}) {
  const captureId = input.captureId.trim();

  if (!captureId) {
    throw new Error("PayPal capture ID is missing on this order.");
  }

  const accessToken = await getPayPalAccessToken();
  const response = await fetch(
    `${getPayPalApiBase()}/v2/payments/captures/${encodeURIComponent(
      captureId
    )}/refund`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": input.idempotencyKey.slice(0, 38),
      },
      body: JSON.stringify({}),
      cache: "no-store",
    }
  );

  const payload = (await response.json().catch(() => ({}))) as PayPalRefundResponse;
  const issue = payload.details?.[0]?.issue || "";

  if (!response.ok) {
    if (issue === "CAPTURE_FULLY_REFUNDED") {
      return {
        id: `already-refunded:${captureId}`,
        status: "COMPLETED",
        alreadyRefunded: true,
        raw: payload,
      };
    }

    throw new Error(
      payload.details?.[0]?.description ||
        payload.message ||
        "PayPal rejected the refund request."
    );
  }

  if (!payload.id || !payload.status) {
    throw new Error("PayPal returned an incomplete refund response.");
  }

  return {
    id: payload.id,
    status: payload.status,
    alreadyRefunded: false,
    raw: payload,
  };
}
