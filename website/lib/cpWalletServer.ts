import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDokuCheckout, DOKU_NOTIFICATION_TARGET } from "./dokuServer";
import { isTrustedPayPalCheckoutUrl } from "./paypalCheckout";
import { matchesWalletCharge, readWalletPayPalCapture, walletIdFromInvoice, walletInvoice, type WalletQuote } from "./cpWallet";

export type WalletIntent = WalletQuote & {
  id: string; user_id: string; wallet_id: number; provider: "doku" | "paypal";
  status: "quoted" | "starting" | "pending" | "credited" | "review";
  provider_order_id: string | null; provider_capture_id: string | null;
  checkout_url: string | null; quote_expires_at: string; payment_expires_at: string | null;
  created_at: string; credited_at: string | null; start_claimed?: boolean;
};

export function walletPaymentMethods() {
  return {
    doku: Boolean(process.env.DOKU_CLIENT_ID && process.env.DOKU_SECRET_KEY),
    paypal: process.env.PAYPAL_CHECKOUT_ENABLED === "true" && Boolean((process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID) && process.env.PAYPAL_CLIENT_SECRET),
  };
}

export function publicWalletIntent(t: WalletIntent) {
  return {
    id: t.id, provider: t.provider, status: t.status, amount_idr: Number(t.amount_idr),
    display_amount: Number(t.display_amount), display_currency: t.display_currency,
    charge_amount: Number(t.charge_amount), charge_currency: t.charge_currency,
    idr_per_unit: Number(t.idr_per_unit), rate_date: t.rate_date,
    quote_expires_at: t.quote_expires_at, payment_expires_at: t.payment_expires_at,
    created_at: t.created_at, credited_at: t.credited_at, checkout_url: t.checkout_url,
  };
}

export async function getWalletIntent(db: SupabaseClient, id: string, userId?: string) {
  walletInvoice(id);
  let query = db.from("cp_wallet_topup_intents").select("*").eq("id", id);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Top-up not found."), { status: 404 });
  return data as WalletIntent;
}

async function paypalRequest(path: string, method = "GET", body?: unknown, requestId?: string) {
  const base = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const clientId = process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PayPal is unavailable.");
  const tokenResponse = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials", cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) throw new Error("PayPal is temporarily unavailable.");
  const response = await fetch(`${base}${path}`, {
    method, headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json", ...(requestId ? { "PayPal-Request-Id": requestId, Prefer: "return=representation" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(12000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error("PayPal could not complete this request. Check your top-up status before retrying.");
  return data;
}

export async function startWalletPayment(db: SupabaseClient, id: string, userId: string, origin: string, mobile = false) {
  const current = await getWalletIntent(db, id, userId);
  if (!walletPaymentMethods()[current.provider]) throw Object.assign(new Error("This payment provider is unavailable."), { status: 503 });
  const { data, error } = await db.rpc("cp_start_wallet_topup", { p_id: id, p_user_id: userId });
  if (error) throw Object.assign(new Error(error.message), { status: 409 });
  const t = data as WalletIntent;
  if (!t.start_claimed) return t;
  const invoice = walletInvoice(id);
  const returnUrl = `${origin}${mobile ? "/app/payment-return" : "/wallet/topup"}?topup=${id}`;
  let paymentUrl: string;
  let providerId: string;
  if (t.provider === "doku") {
    // Omitting payment_method_types exposes the channels enabled by the merchant.
    const payment = await createDokuCheckout({
      order: { amount: Number(t.amount_idr), invoice_number: invoice, currency: "IDR", callback_url: returnUrl, callback_url_result: returnUrl, auto_redirect: true, language: "EN" },
      payment: { payment_due_date: 50 },
      additional_info: { override_notification_url: `${origin}${DOKU_NOTIFICATION_TARGET}` },
    });
    paymentUrl = payment.paymentUrl;
    providerId = invoice;
  } else {
    const result = await paypalRequest("/v2/checkout/orders", "POST", {
      intent: "CAPTURE",
      purchase_units: [{ custom_id: invoice, invoice_id: invoice, description: "ComePlayers CPWallet top-up", amount: { currency_code: "USD", value: Number(t.charge_amount).toFixed(2) } }],
      application_context: { brand_name: "ComePlayers", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW", return_url: `${returnUrl}&paypalReturn=1`, cancel_url: `${returnUrl}&cancelled=1` },
    }, `cpwc-${id.replaceAll("-", "")}`);
    providerId = String(result.id || "");
    paymentUrl = String(result.links?.find((link: { rel?: string }) => ["approve", "payer-action"].includes(link.rel || ""))?.href || "");
    if (!/^[A-Z0-9]+$/.test(providerId) || !isTrustedPayPalCheckoutUrl(paymentUrl)) throw new Error("PayPal did not return a valid approval page.");
  }
  const saved = await db.from("cp_wallet_topup_intents").update({ provider_order_id: providerId, checkout_url: paymentUrl, status: "pending", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "starting");
  if (saved.error) throw saved.error;
  // A webhook can credit the intent before this update. Never overwrite its state.
  return getWalletIntent(db, id, userId);
}

export async function captureWalletPayPal(db: SupabaseClient, t: WalletIntent, returnedToken: string) {
  if (t.provider !== "paypal" || !t.provider_order_id || returnedToken !== t.provider_order_id) throw Object.assign(new Error("PayPal reference does not match this top-up."), { status: 400 });
  if (t.status === "credited") return t;
  if (t.status !== "pending") throw Object.assign(new Error("This top-up is not ready for capture."), { status: 409 });
  const path = `/v2/checkout/orders/${encodeURIComponent(t.provider_order_id)}`;
  let result = await paypalRequest(path);
  const validOrder = (value: typeof result) => value.id === t.provider_order_id && value.purchase_units?.length === 1 && value.purchase_units[0].custom_id === walletInvoice(t.id) && matchesWalletCharge(value.purchase_units[0].amount?.value, value.purchase_units[0].amount?.currency_code, t);
  if (!validOrder(result)) throw new Error("PayPal order does not match the saved top-up.");
  if (result.status !== "COMPLETED") {
    if (result.status !== "APPROVED") throw Object.assign(new Error("Approve the payment in PayPal before continuing."), { status: 409, code: "PAYPAL_APPROVAL_REQUIRED" });
    result = await paypalRequest(`${path}/capture`, "POST", {}, `cpwx-${t.id.replaceAll("-", "")}`);
  }
  const captured = readWalletPayPalCapture(result, t);
  const { error } = await db.rpc("cp_credit_wallet_topup", { p_id: t.id, p_provider: "paypal", p_provider_order_id: t.provider_order_id, p_capture_id: captured.id, p_amount: captured.amount, p_currency: "USD" });
  if (error) throw error;
  return getWalletIntent(db, t.id, t.user_id);
}

export async function processWalletPayPalWebhook(db: SupabaseClient, event: {
  event_type?: string; resource?: { id?: string; status?: string; custom_id?: string; invoice_id?: string; amount?: { currency_code?: string; value?: string }; supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } } };
}) {
  const r = event.resource;
  const id = walletIdFromInvoice(String(r?.custom_id || r?.invoice_id || ""));
  const providerOrder = r?.supplementary_data?.related_ids?.order_id;
  const captureId = r?.supplementary_data?.related_ids?.capture_id || r?.id;
  let t: WalletIntent | null = null;
  if (id) t = await getWalletIntent(db, id);
  else if (providerOrder || captureId) {
    let query = db.from("cp_wallet_topup_intents").select("*").eq("provider", "paypal");
    query = providerOrder ? query.eq("provider_order_id", providerOrder) : query.eq("provider_capture_id", captureId!);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    t = data as WalletIntent | null;
  }
  if (!t) return false;
  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    if (r?.status !== "COMPLETED" || !r.id || !providerOrder || !matchesWalletCharge(r.amount?.value, r.amount?.currency_code, t)) throw new Error("PayPal top-up confirmation does not match the saved quote.");
    const { error } = await db.rpc("cp_credit_wallet_topup", { p_id: t.id, p_provider: "paypal", p_provider_order_id: providerOrder, p_capture_id: r.id, p_amount: Number(r.amount?.value), p_currency: "USD" });
    if (error) throw error;
  } else if (["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"].includes(event.event_type || "")) {
    const { error } = await db.rpc("cp_review_wallet_topup", { p_id: t.id, p_reason: event.event_type });
    if (error) throw error;
  }
  return true;
}
