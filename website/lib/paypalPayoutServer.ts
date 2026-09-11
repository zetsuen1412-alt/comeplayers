import "server-only";
import { buildPayPalPayoutRequest, normalizePayPalPayoutStatus } from "@/lib/paypalPayout";

const PAYPAL_API = process.env.PAYPAL_ENV === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

function timeoutMs() {
  const value = Number(process.env.PAYPAL_PAYOUT_TIMEOUT_MS || 12000);
  return Number.isFinite(value) ? Math.min(30000, Math.max(2000, value)) : 12000;
}

async function accessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PayPal server credentials are missing.");
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(timeoutMs()),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(body.error_description || "Unable to obtain a PayPal access token.");
  return body.access_token;
}

export type PayPalPayoutResult = {
  batchId: string;
  itemId: string | null;
  providerStatus: string;
  marketplaceStatus: "paid" | "failed" | "processing" | "unknown";
  feeAmount: number;
  raw: Record<string, unknown>;
};

function normalizePayload(payload: Record<string, unknown>): PayPalPayoutResult {
  const batch = (payload.batch_header || {}) as Record<string, unknown>;
  const batchStatus = String(batch.batch_status || payload.batch_status || "");
  const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
  const first = items[0] || {};
  const transactionStatus = String(first.transaction_status || batchStatus);
  const fee = (first.payout_item_fee || {}) as Record<string, unknown>;
  return {
    batchId: String(batch.payout_batch_id || payload.payout_batch_id || ""),
    itemId: String(first.payout_item_id || "") || null,
    providerStatus: transactionStatus || batchStatus || "UNKNOWN",
    marketplaceStatus: normalizePayPalPayoutStatus(transactionStatus || batchStatus),
    feeAmount: Number(fee.value || 0) || 0,
    raw: payload,
  };
}

export async function createPayPalPayout(input: {
  batchId: string;
  withdrawalId: number;
  receiver: string;
  amount: number;
  currency: string;
}) {
  const token = await accessToken();
  const body = buildPayPalPayoutRequest({
    batchId: input.batchId,
    recipient: {
      withdrawalId: input.withdrawalId,
      receiver: input.receiver,
      amount: input.amount,
      currency: input.currency,
    },
  });
  const response = await fetch(`${PAYPAL_API}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": input.batchId.slice(0, 38),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs()),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown> & { message?: string };
  if (!response.ok) throw new Error(String(payload.message || `PayPal payout returned HTTP ${response.status}.`));
  return normalizePayload(payload);
}

export async function getPayPalPayoutBatch(batchId: string) {
  const id = String(batchId || "").trim();
  if (!id) throw new Error("PayPal payout batch ID is required.");
  const token = await accessToken();
  const response = await fetch(`${PAYPAL_API}/v1/payments/payouts/${encodeURIComponent(id)}?page_size=100&page=1&total_required=true`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs()),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown> & { message?: string };
  if (!response.ok) throw new Error(String(payload.message || `PayPal payout lookup returned HTTP ${response.status}.`));
  return normalizePayload(payload);
}
