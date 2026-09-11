import {
  getFallbackExchangeRate,
  parseIdrAmount,
  type SupportedCurrency,
} from "@/lib/localization";

function envNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function quotePayPalUsd(amountIdr: string | number | null | undefined) {
  const sourceAmountIdr = parseIdrAmount(amountIdr);
  const fallback = getFallbackExchangeRate("USD");
  const idrPerUnit = envNumber(process.env.PAYPAL_IDR_PER_USD, fallback.units_per_usd);
  const marginPercent = envNumber(
    process.env.PAYPAL_FX_MARGIN_PERCENT || process.env.CHECKOUT_FX_MARGIN_PERCENT,
    fallback.margin_percent
  );
  const amount = Math.ceil(
    ((sourceAmountIdr / idrPerUnit) * (1 + Math.max(0, marginPercent) / 100) + Number.EPSILON) * 100
  ) / 100;

  return {
    sourceAmountIdr,
    currency: "USD" as SupportedCurrency,
    amount,
    idrPerUnit,
    marginPercent,
  };
}
