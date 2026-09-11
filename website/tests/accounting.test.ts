import assert from "node:assert/strict";
import test from "node:test";
import { accountingMonthBounds, summarizeTaxLedger } from "@/lib/accounting";

test("accounting month uses UTC half-open bounds", () => {
  assert.deepEqual(accountingMonthBounds("2026-02"), {
    periodKey: "2026-02",
    start: "2026-02-01T00:00:00.000Z",
    end: "2026-03-01T00:00:00.000Z",
  });
});

test("summarizes sales and withdrawal withholding separately", () => {
  const summary = summarizeTaxLedger([
    { tax_type: "sales_tax", taxable_amount: 100_000, tax_amount: 5_000 },
    { tax_type: "withdrawal_tax", taxable_amount: 90_000, tax_amount: 1_800 },
  ]);
  assert.deepEqual(summary, {
    salesTaxable: 100_000,
    salesTax: 5_000,
    withdrawalTaxable: 90_000,
    withdrawalTax: 1_800,
    totalTax: 6_800,
    lineCount: 2,
  });
});
