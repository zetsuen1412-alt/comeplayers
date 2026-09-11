import assert from "node:assert/strict";
import test from "node:test";
import {
  SELLER_SALES_TAX_RATE_PERCENT,
  calculateSellerSaleSettlement,
  calculateWithdrawalTaxQuote,
} from "@/lib/tax";

test("buyer total excludes seller sales tax while seller bears five percent", () => {
  const result = calculateSellerSaleSettlement({
    subtotal: 100_000,
    discount: 10_000,
    paymentFee: 4_500,
    marketplaceFeeRate: 0.05,
  });

  assert.equal(result.buyerTotal, 94_500);
  assert.equal(result.buyerTax, 0);
  assert.equal(result.sellerGross, 90_000);
  assert.equal(result.marketplaceFee, 4_500);
  assert.equal(result.sellerSalesTaxRatePercent, SELLER_SALES_TAX_RATE_PERCENT);
  assert.equal(result.sellerSalesTax, 4_500);
  assert.equal(result.sellerNet, 81_000);
});

test("withdrawal tax combines jurisdiction percentage and fixed withholding", () => {
  const result = calculateWithdrawalTaxQuote({
    amount: 1_000_000,
    ratePercent: 2.5,
    fixedAmount: 5_000,
    providerFee: 10_000,
  });

  assert.equal(result.taxAmount, 30_000);
  assert.equal(result.netAmount, 960_000);
});

test("withdrawal deductions never produce a negative payout", () => {
  const result = calculateWithdrawalTaxQuote({
    amount: 10_000,
    ratePercent: 100,
    fixedAmount: 5_000,
    providerFee: 2_000,
  });

  assert.equal(result.taxAmount, 10_000);
  assert.equal(result.netAmount, 0);
});
