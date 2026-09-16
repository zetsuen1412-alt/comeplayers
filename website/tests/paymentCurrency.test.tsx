import assert from "node:assert/strict";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CurrencyProvider } from "../components/CurrencyProvider";
import { CardPaymentTotal, PayPalPaymentReview } from "../components/marketplace/PaymentCurrencyAmounts";
import { matchesPayPalUsdAmount, readPayPalCheckoutReview } from "../lib/paypalCheckout";
import { processVerifiedPayPalWebhookEvent, type PayPalWebhookEvent } from "../lib/paypalWebhook";

function renderCurrency(currency: string, child: ReactNode, locale = "en-US") {
  return renderToStaticMarkup(<CurrencyProvider country="ID" locale={locale} currency={currency}>{child}</CurrencyProvider>);
}

test("card modal retains USD as its primary total and discloses the IDR charge", () => {
  const html = renderCurrency("USD", <CardPaymentTotal amountIdr={349310} />);
  assert.match(html, /<small>Total in USD<\/small>/);
  assert.match(html, /<strong>\$21\.50<\/strong>/);
  assert.match(html, /The USD amount is an estimate\. Your bank may apply currency conversion and fees\./);
  assert.match(html, /Your card will be charged IDR 349,310\./);
});

test("card modal retains SGD instead of unexpectedly switching its primary total to IDR", () => {
  const html = renderCurrency("SGD", <CardPaymentTotal amountIdr={349310} />);
  assert.match(html, /<small>Total in SGD<\/small>/);
  assert.match(html, /<strong>SGD[^<]+<\/strong>/);
  assert.match(html, /The SGD amount is an estimate\. Your bank may apply currency conversion and fees\./);
  assert.match(html, /Your card will be charged IDR 349,310\./);
});

test("Indonesian IDR card display uses the original order amount", () => {
  const html = renderCurrency("IDR", <CardPaymentTotal amountIdr={349310} />, "id-ID");
  assert.match(html, /<strong>Rp[^<]*349\.310<\/strong>/);
  assert.doesNotMatch(html, /amount is an estimate|currency conversion/);
});

test("PayPal review shows the exact server USD amount even with SGD selected", () => {
  const html = renderCurrency("SGD", <PayPalPaymentReview amountUsd={19.73} />);
  assert.match(html, /<strong>\$19\.73<\/strong>/);
  assert.match(html, /display currency is SGD/);
  assert.match(html, /PayPal will charge \(USD\)/);
});

test("PayPal only accepts exact positive USD cents", () => {
  assert.equal(matchesPayPalUsdAmount("19.73", "USD", 19.73), true);
  for (const [value, currency, expected] of [
    ["19.73", "SGD", 19.73], ["19.73", "IDR", 19.73],
    ["19.72", "USD", 19.73], ["19.74", "USD", 19.73],
    ["19.731", "USD", 19.73], ["NaN", "USD", 19.73],
    ["19.73", "USD", null], ["19.73", "USD", 0], ["0", "USD", 0],
  ]) assert.equal(matchesPayPalUsdAmount(value, currency, expected), false);
});

test("PayPal review validates the provider URL, billing currency and saved IDR order", () => {
  const payload = { approveUrl: "https://www.paypal.com/checkoutnow?token=fixture", amountUsd: 19.73, amountIdr: 349310, currency: "USD" };
  assert.equal(readPayPalCheckoutReview(payload, 349310).amountUsd, 19.73);
  for (const change of [
    { approveUrl: "https://paypal.com.attacker.example" }, { currency: "SGD" },
    { amountUsd: 19.731 }, { amountUsd: 0 }, { amountIdr: 349311 },
  ]) assert.throws(() => readPayPalCheckoutReview({ ...payload, ...change }, 349310));
});

function webhookFixture(expectedUsd: number | null) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const order = { id: 80, buyer_id: "fixture-buyer", seller_id: null, paypal_order_id: "fixture-paypal-order", paypal_amount_usd: expectedUsd };
  const query = {
    select() { return this; }, eq() { return this; },
    update() { return this; }, maybeSingle: async () => ({ data: order, error: null }),
    error: null,
  };
  const admin = {
    from: () => query,
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: { already_paid: true }, error: null };
    },
  } as unknown as Parameters<typeof processVerifiedPayPalWebhookEvent>[0]["supabaseAdmin"];
  return { admin, calls };
}

function paidEvent(currency: string, value: string): PayPalWebhookEvent {
  return { event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {
    id: "fixture-capture", status: "COMPLETED", custom_id: "80:fixture-buyer",
    amount: { currency_code: currency, value },
    supplementary_data: { related_ids: { order_id: "fixture-paypal-order" } },
  }};
}

test("verified PayPal webhook cannot finalize another currency, cent amount or missing quote", async () => {
  for (const [currency, amount, expected] of [
    ["SGD", "19.73", 19.73], ["USD", "19.72", 19.73],
    ["USD", "19.74", 19.73], ["USD", "19.73", null],
  ] as const) {
    const { admin, calls } = webhookFixture(expected);
    await assert.rejects(processVerifiedPayPalWebhookEvent({ supabaseAdmin: admin, event: paidEvent(currency, amount) }), /amount does not match/);
    assert.equal(calls.length, 0);
  }
});

test("verified matching USD webhook finalizes the exact saved amount once", async () => {
  const { admin, calls } = webhookFixture(19.73);
  const result = await processVerifiedPayPalWebhookEvent({ supabaseAdmin: admin, event: paidEvent("USD", "19.73") });
  assert.equal(result.status, "processed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "finalize_paypal_order_payment");
  assert.equal(calls[0].args.p_amount_usd, 19.73);
});
