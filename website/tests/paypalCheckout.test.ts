import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedPayPalCheckoutUrl } from "../lib/paypalCheckout";

test("PayPal checkout allowlist accepts only HTTPS PayPal hosts", () => {
  assert.equal(
    isTrustedPayPalCheckoutUrl("https://www.paypal.com/checkoutnow?token=test"),
    true,
  );
  assert.equal(
    isTrustedPayPalCheckoutUrl(
      "https://www.sandbox.paypal.com/checkoutnow?token=test",
    ),
    true,
  );
  assert.equal(
    isTrustedPayPalCheckoutUrl("https://checkout.paypal.com/session/test"),
    true,
  );
  assert.equal(
    isTrustedPayPalCheckoutUrl("https://paypal.com.attacker.example/checkout"),
    false,
  );
  assert.equal(
    isTrustedPayPalCheckoutUrl("http://www.paypal.com/checkoutnow"),
    false,
  );
  assert.equal(isTrustedPayPalCheckoutUrl("not a URL"), false);
});
