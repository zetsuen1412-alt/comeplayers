import { getFallbackExchangeRate, normalizeCurrency, type ExchangeRate } from "./localization";

export type MoneyValue = string | number | null | undefined;

/** Database numeric values are unformatted decimal amounts, never digit strings. */
export function storedMoney(value: MoneyValue): number {
  if (value === null || value === undefined || value === "") return 0;
  const amount = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(amount) ? amount : 0;
}

export function orderTotalIdr(order: {
  total_amount?: MoneyValue;
  total_price?: MoneyValue;
  price?: MoneyValue;
} | null | undefined): number {
  // A zero total is meaningful; a current USD listing is never an order snapshot.
  return storedMoney(order?.total_amount ?? order?.total_price ?? order?.price);
}

export function formatIdrAmount(amount: MoneyValue, locale = "id-ID") {
  return new Intl.NumberFormat(locale, {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(storedMoney(amount));
}

export function formatIdrInCurrency(
  amount: MoneyValue,
  locale: string,
  currency: string,
  rates: Partial<Record<string, ExchangeRate>> = {},
) {
  const target = normalizeCurrency(currency);
  const idr = storedMoney(amount);
  const idrRate = rates.IDR || getFallbackExchangeRate("IDR");
  const targetRate = rates[target] || getFallbackExchangeRate(target);
  // Display conversion must not add a second checkout margin or convert IDR twice.
  const converted = target === "IDR" ? idr : idr / idrRate.units_per_usd * targetRate.units_per_usd;
  return new Intl.NumberFormat(locale, {
    style: "currency", currency: target,
    maximumFractionDigits: ["IDR", "JPY", "KRW", "VND"].includes(target) ? 0 : 2,
  }).format(converted);
}
