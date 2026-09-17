const TRUSTED_PAYPAL_HOSTS = new Set([
  "paypal.com",
  "www.paypal.com",
  "sandbox.paypal.com",
  "www.sandbox.paypal.com",
]);

export function isTrustedPayPalCheckoutUrl(value: string) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();

    return (
      parsed.protocol === "https:" &&
      (TRUSTED_PAYPAL_HOSTS.has(hostname) || hostname.endsWith(".paypal.com"))
    );
  } catch {
    return false;
  }
}

/** PayPal checkout amounts use exact USD cents; never accept another currency. */
function usdCents(value: unknown): number | null {
  if ((typeof value !== "string" && typeof value !== "number") ||
      !/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function matchesPayPalUsdAmount(value: unknown, currency: unknown, expectedUsd: unknown) {
  const actual = usdCents(value);
  return currency === "USD" && actual !== null && actual === usdCents(expectedUsd);
}

export type PayPalCheckoutReview = {
  approveUrl: string;
  amountUsd: number;
  amountIdr: number;
};

export function readPayPalCheckoutReview(
  payload: { approveUrl?: unknown; amountUsd?: unknown; amountIdr?: unknown; currency?: unknown },
  expectedAmountIdr: number,
): PayPalCheckoutReview {
  if (typeof payload.approveUrl !== "string" || !isTrustedPayPalCheckoutUrl(payload.approveUrl) ||
      !matchesPayPalUsdAmount(payload.amountUsd, payload.currency, payload.amountUsd) ||
      typeof payload.amountIdr !== "number" || !Number.isSafeInteger(payload.amountIdr) ||
      payload.amountIdr <= 0 || payload.amountIdr !== expectedAmountIdr) {
    throw new Error("PayPal returned an invalid payment quote. Refresh the order and try again.");
  }
  return { approveUrl: payload.approveUrl, amountUsd: Number(payload.amountUsd), amountIdr: payload.amountIdr };
}

