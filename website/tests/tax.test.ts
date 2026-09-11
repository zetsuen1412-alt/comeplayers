import assert from "node:assert/strict";
import test from "node:test";
import { calculateTaxQuote, normalizeCountryCode } from "@/lib/tax";

test("exclusive tax is added after discount and before the final total", () => {
  const quote = calculateTaxQuote({
    subtotal: 100_000,
    discount: 10_000,
    paymentFee: 5_000,
    rule: { countryCode: "ID", ratePercent: 10, inclusive: false },
  });
  assert.equal(quote.taxableAmount, 90_000);
  assert.equal(quote.taxAmount, 9_000);
  assert.equal(quote.totalAmount, 104_000);
});

test("inclusive tax is extracted without increasing the taxable price", () => {
  const quote = calculateTaxQuote({
    subtotal: 110,
    rule: { countryCode: "GB", ratePercent: 10, inclusive: true },
  });
  assert.equal(quote.taxAmount, 10);
  assert.equal(quote.totalAmount, 110);
});

test("country codes are normalized and invalid input falls back", () => {
  assert.equal(normalizeCountryCode(" id "), "ID");
  assert.equal(normalizeCountryCode("Indonesia"), "ID");
});
