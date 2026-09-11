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
