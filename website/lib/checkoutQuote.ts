import { createHmac, timingSafeEqual } from "node:crypto";
import type { CheckoutInput, CheckoutQuote } from "./checkoutInput";

type QuotePayload = { input: CheckoutInput; quote: CheckoutQuote; idrPerUsd: number; expiresAt: number };
const MAX_AGE_MS = 10 * 60 * 1000;

function signature(payload: string, secret: string) {
  if (!secret) throw new Error("Checkout quote signing is unavailable.");
  return createHmac("sha256", secret).update(`comeplayers-checkout-v1:${payload}`).digest("base64url");
}

export function signCheckoutQuote(
  value: Omit<QuotePayload, "expiresAt">, secret: string, now = Date.now(),
) {
  const payload = Buffer.from(JSON.stringify({ ...value, expiresAt: now + MAX_AGE_MS })).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyCheckoutQuote(token: string, input: CheckoutInput, secret: string, now = Date.now()): QuotePayload {
  if (!token || token.length > 5000) throw new Error("Refresh the order summary before continuing.");
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra) throw new Error("Invalid checkout quote.");
  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(supplied);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid checkout quote.");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as QuotePayload;
  if (!Number.isFinite(decoded.expiresAt) || decoded.expiresAt <= now || decoded.expiresAt > now + MAX_AGE_MS) {
    throw new Error("The order summary expired. Refresh the price before continuing.");
  }
  if (decoded.input.productId !== input.productId || decoded.input.variantId !== input.variantId ||
      decoded.input.quantity !== input.quantity || decoded.input.couponCode !== input.couponCode) {
    throw new Error("The order changed. Refresh the price before continuing.");
  }
  return decoded;
}
