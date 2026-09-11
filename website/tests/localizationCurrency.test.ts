import assert from "node:assert/strict";
import test from "node:test";
import {
  convertFromBaseCurrency,
  convertFromBaseCurrencyForCheckout,
  countryFlagEmoji,
  formatLocalizedPrice,
  resolveRequestPreferences,
  translate,
  translateCategoryLabel,
} from "../lib/localization";
import { quotePayPalUsd } from "../lib/checkoutCurrency";

test("foreign checkout conversion protects marketplace FX spread", () => {
  const preview = convertFromBaseCurrency(1, "EUR", {
    units_per_usd: 0.86,
    margin_percent: 2.5,
  });

  assert.equal(preview.toFixed(3), "0.881");
  assert.equal(
    convertFromBaseCurrencyForCheckout(1, "EUR", {
      units_per_usd: 0.86,
      margin_percent: 2.5,
    }),
    0.89
  );
});

test("localized price formatting uses supported currency fallback", () => {
  assert.match(formatLocalizedPrice(1, "id-ID", "IDR"), /^Rp\s?16\.250$/u);
  assert.match(formatLocalizedPrice(1, "en-US", "USD"), /\$1\.00/);
});

test("paypal checkout quote uses protected USD amount", () => {
  const previousRate = process.env.PAYPAL_IDR_PER_USD;
  const previousMargin = process.env.PAYPAL_FX_MARGIN_PERCENT;

  process.env.PAYPAL_IDR_PER_USD = "16250";
  process.env.PAYPAL_FX_MARGIN_PERCENT = "2.5";

  try {
    const quote = quotePayPalUsd(16250);

    assert.equal(quote.currency, "USD");
    assert.equal(quote.amount, 1.03);
    assert.equal(quote.idrPerUnit, 16250);
    assert.equal(quote.marginPercent, 2.5);
  } finally {
    if (previousRate === undefined) delete process.env.PAYPAL_IDR_PER_USD;
    else process.env.PAYPAL_IDR_PER_USD = previousRate;

    if (previousMargin === undefined) delete process.env.PAYPAL_FX_MARGIN_PERCENT;
    else process.env.PAYPAL_FX_MARGIN_PERCENT = previousMargin;
  }
});

test("locale settings expose flags and translated interface labels", () => {
  assert.notEqual(countryFlagEmoji("US"), "US");
  assert.equal(translate("en-US", "locale.title"), "Language Settings");
  assert.equal(translate("id-ID", "locale.title"), "Pengaturan Bahasa");
  assert.equal(translateCategoryLabel("ja-JP", "Software"), "ソフトウェア");
});

test("request preferences honor a supported browser language and keep country currency", () => {
  assert.deepEqual(
    resolveRequestPreferences({
      country: "US",
      acceptLanguage: "ja-JP,ja;q=0.9,en-US;q=0.8",
    }),
    {
      country: "US",
      locale: "ja-JP",
      currency: "USD",
    }
  );

  assert.deepEqual(
    resolveRequestPreferences({
      country: "DE",
      acceptLanguage: "de-DE,de;q=0.9",
    }),
    {
      country: "DE",
      locale: "en-US",
      currency: "EUR",
    }
  );

  assert.deepEqual(
    resolveRequestPreferences({
      country: "US",
      acceptLanguage: "id-ID,id;q=0.9,en-US;q=0.8",
    }),
    {
      country: "US",
      locale: "id-ID",
      currency: "USD",
    }
  );
});
