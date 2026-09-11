import assert from "node:assert/strict";
import test from "node:test";
import { quoteFx } from "@/lib/fx";

test("identity FX keeps amount and rate one", () => {
  assert.deepEqual(quoteFx({ sourceAmount: 100_000, sourceCurrency: "IDR", payoutCurrency: "IDR" }), {
    sourceAmount: 100_000,
    sourceCurrency: "IDR",
    payoutCurrency: "IDR",
    rate: 1,
    payoutAmount: 100_000,
    identity: true,
  });
});

test("cross-currency FX rounds payout to two decimals", () => {
  const result = quoteFx({ sourceAmount: 150_000, sourceCurrency: "IDR", payoutCurrency: "USD", rate: 0.00006123 });
  assert.equal(result.payoutAmount, 9.18);
  assert.equal(result.identity, false);
});
