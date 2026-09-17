import { getFallbackExchangeRate } from "./localization";
import { storedMoney, type MoneyValue } from "./money";

export function quotePayPalUsd(amountIdr: MoneyValue, currentIdrPerUsd?: number) {
  const sourceAmountIdr = storedMoney(amountIdr);
  const configuredRate = process.env.PAYPAL_IDR_PER_USD;
  const idrPerUnit = configuredRate ? Number(configuredRate) : currentIdrPerUsd ?? getFallbackExchangeRate("IDR").units_per_usd;
  const marginValue = process.env.PAYPAL_FX_MARGIN_PERCENT ?? process.env.CHECKOUT_FX_MARGIN_PERCENT ?? "0";
  const marginPercent = Number(marginValue);
  if (!Number.isFinite(sourceAmountIdr) || sourceAmountIdr <= 0 || !Number.isFinite(idrPerUnit) || idrPerUnit < 1000 || idrPerUnit > 100000 || !Number.isFinite(marginPercent) || marginPercent < 0) {
    throw new Error("PayPal currency conversion is unavailable.");
  }
  const cents = sourceAmountIdr / idrPerUnit * (1 + marginPercent / 100) * 100;
  const amount = Math.ceil(Number(cents.toFixed(8))) / 100;
  return { sourceAmountIdr, currency: "USD" as const, amount, idrPerUnit, marginPercent };
}
