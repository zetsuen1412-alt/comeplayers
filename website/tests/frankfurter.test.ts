import assert from "node:assert/strict";
import test from "node:test";
import {
  convertCurrencyToUsd,
  fallbackExchangeRateMap,
  parseFrankfurterRates,
} from "../lib/frankfurter";
import { formatLocalizedPrice } from "../lib/localization";

test("uses USD as the internal exchange-rate base", () => {
  const result = parseFrankfurterRates([
    { date: "2026-09-03", base: "USD", quote: "IDR", rate: 17742 },
    { date: "2026-09-03", base: "USD", quote: "EUR", rate: 0.86 },
  ]);

  assert.equal(result.asOf, "2026-09-03");
  assert.equal(result.rates.USD?.units_per_usd, 1);
  assert.equal(result.rates.IDR?.units_per_usd, 17742);
  assert.equal(result.rates.USD?.margin_percent, 0);
  assert.equal(
    formatLocalizedPrice(1, "en-US", "USD", result.rates.USD),
    "$1.00"
  );
});

test("ignores unsupported or malformed Frankfurter rows", () => {
  const result = parseFrankfurterRates([
    { date: "2026-09-03", base: "EUR", quote: "USD", rate: 1.2 },
    { date: "2026-09-03", base: "USD", quote: "ABC", rate: 4 },
    { date: "2026-09-03", base: "USD", quote: "SGD", rate: 1.28 },
  ]);

  assert.equal(result.rates.IDR, undefined);
  assert.equal(result.rates.SGD?.units_per_usd, 1.28);
});

test("keeps all supported currencies available as a fallback", () => {
  const rates = fallbackExchangeRateMap();
  assert.equal(Object.keys(rates).length, 13);
  assert.equal(rates.USD?.units_per_usd, 1);
  assert.ok(Number(rates.JPY?.units_per_usd) > 0);
});

test("converts a seller-entered currency amount into the USD base price", () => {
  const rates = parseFrankfurterRates([
    { date: "2026-09-03", base: "USD", quote: "IDR", rate: 17742 },
  ]).rates;

  assert.equal(convertCurrencyToUsd(25, "USD", rates), 25);
  assert.equal(convertCurrencyToUsd(17742, "IDR", rates), 1);
});
