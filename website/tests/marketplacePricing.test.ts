import assert from "node:assert/strict";
import test from "node:test";
import { formatIdrAmount, formatIdrInCurrency, orderTotalIdr, storedMoney } from "../lib/money";
import { quotePayPalUsd } from "../lib/checkoutCurrency";
import { parseCheckoutInput, type CheckoutQuote } from "../lib/checkoutInput";
import { signCheckoutQuote, verifyCheckoutQuote } from "../lib/checkoutQuote";

test("numeric database strings preserve decimals instead of multiplying by 100", () => {
  assert.equal(storedMoney("71859.00"), 71859);
  assert.equal(storedMoney("12.50"), 12.5);
  assert.equal(storedMoney("-12.50"), -12.5);
  assert.equal(storedMoney("Infinity"), 0);
});
test("order totals use the saved IDR snapshot, including zero", () => {
  assert.equal(orderTotalIdr({ total_amount: "0.00", total_price: 100 }), 0);
  assert.equal(orderTotalIdr({ total_amount: "71859.00", price: 72000 }), 71859);
  assert.equal(orderTotalIdr({ price: "1234.50" }), 1234.5);
  assert.equal(orderTotalIdr(null), 0);
});
test("IDR payment formatting never treats the amount as USD", () => {
  assert.match(formatIdrAmount("71859.00"), /71\.859/);
  assert.match(formatIdrInCurrency(16250, "en-US", "USD"), /\$1\.00/);
  assert.match(formatIdrInCurrency(16250, "en-US", "IDR"), /16,250/);
});
test("order display conversion uses the live cross rate without an extra margin", () => {
  assert.match(formatIdrInCurrency(18000, "en-US", "EUR", {
    IDR: { currency: "IDR", units_per_usd: 18000, margin_percent: 0 },
    EUR: { currency: "EUR", units_per_usd: 0.9, margin_percent: 2.5 },
  }), /0\.90/);
});
function withPayPalEnv(values: Record<string, string | undefined>, run: () => void) {
  const keys = ["PAYPAL_IDR_PER_USD", "PAYPAL_FX_MARGIN_PERCENT", "CHECKOUT_FX_MARGIN_PERCENT"];
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) { if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key]; }
    run();
  } finally {
    for (const key of keys) { if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key]; }
  }
}
test("PayPal fallback divides by the IDR-per-USD rate, never by 1", () => {
  withPayPalEnv({}, () => assert.equal(quotePayPalUsd("16250.00").amount, 1));
});
test("PayPal supports live exchange rates and an explicit zero margin", () => {
  withPayPalEnv({ PAYPAL_FX_MARGIN_PERCENT: "0", CHECKOUT_FX_MARGIN_PERCENT: "5" }, () => {
    assert.equal(quotePayPalUsd(18000, 18000).amount, 1);
    assert.equal(quotePayPalUsd(18001, 18000).amount, 1.01);
  });
});
test("PayPal honors a configured valid rate and rounds the quote up to cents", () => {
  withPayPalEnv({ PAYPAL_IDR_PER_USD: "16250", PAYPAL_FX_MARGIN_PERCENT: "2.5" }, () => {
    assert.equal(quotePayPalUsd("16250.00", 18000).amount, 1.03);
  });
});
test("invalid PayPal configuration fails instead of producing a dangerous quote", () => {
  for (const rate of ["1", "0", "bad", "100001"]) {
    withPayPalEnv({ PAYPAL_IDR_PER_USD: rate }, () => assert.throws(() => quotePayPalUsd(16250)));
  }
  withPayPalEnv({ PAYPAL_FX_MARGIN_PERCENT: "-1" }, () => assert.throws(() => quotePayPalUsd(16250)));
});
test("checkout rejects fractional, zero and excessive quantities", () => {
  for (const quantity of [0, -1, 1.5, 101, "bad", null, ""]) {
    assert.throws(() => parseCheckoutInput({ productId: 443, quantity }));
  }
  assert.equal(parseCheckoutInput({ productId: 443, quantity: "100" }).quantity, 100);
});
test("checkout rejects non-integer IDs and normalizes coupon codes", () => {
  assert.throws(() => parseCheckoutInput({ productId: 1.5 }));
  assert.throws(() => parseCheckoutInput({ productId: 443, variantId: 2.5 }));
  assert.equal(parseCheckoutInput({ productId: "443", couponCode: " welcome " }).couponCode, "WELCOME");
});
const input = parseCheckoutInput({ productId: 443, quantity: 2 });
const quote: CheckoutQuote = { product_id: 443, variant_id: null, quantity: 2, unit_price: 71859, subtotal: 143718, discount: 0, payment_fee: 0, total: 143718, currency: "IDR", coupon_code: null };
const secret = "isolated-test-secret-not-a-production-credential";
test("signed checkout quote preserves the exact rate and total", () => {
  const token = signCheckoutQuote({ input, quote, idrPerUsd: 17706 }, secret, 1000);
  assert.deepEqual(verifyCheckoutQuote(token, input, secret, 2000).quote, quote);
});
test("modified prices, wrong keys and mismatched quantities cannot use a quote", () => {
  const token = signCheckoutQuote({ input, quote, idrPerUsd: 17706 }, secret, 1000);
  const [payload, signature] = token.split(".");
  const changed = JSON.parse(Buffer.from(payload, "base64url").toString());
  changed.quote.total = 1;
  assert.throws(() => verifyCheckoutQuote(`${Buffer.from(JSON.stringify(changed)).toString("base64url")}.${signature}`, input, secret, 2000));
  assert.throws(() => verifyCheckoutQuote(token, input, "wrong", 2000));
  assert.throws(() => verifyCheckoutQuote(token, { ...input, quantity: 1 }, secret, 2000));
  assert.throws(() => verifyCheckoutQuote(token, { ...input, couponCode: "OTHER" }, secret, 2000));
});
test("expired quotes must be refreshed", () => {
  const token = signCheckoutQuote({ input, quote, idrPerUsd: 17706 }, secret, 1000);
  assert.throws(() => verifyCheckoutQuote(token, input, secret, 601000));
});
