import {
  CURRENCY_OPTIONS,
  FALLBACK_EXCHANGE_RATES,
  type ExchangeRate,
  type SupportedCurrency,
} from "@/lib/localization";

export const FRANKFURTER_API_URL = "https://api.frankfurter.dev/v2";
export const FRANKFURTER_REVALIDATE_SECONDS = 60 * 60 * 6;

export type ExchangeRateMap = Partial<Record<SupportedCurrency, ExchangeRate>>;

type FrankfurterRateRow = {
  date?: unknown;
  base?: unknown;
  quote?: unknown;
  rate?: unknown;
};

export function fallbackExchangeRateMap(): ExchangeRateMap {
  return Object.fromEntries(
    Object.entries(FALLBACK_EXCHANGE_RATES).map(([currency, rate]) => [
      currency,
      { ...rate },
    ])
  ) as ExchangeRateMap;
}

export function convertCurrencyToUsd(
  amount: number,
  currency: SupportedCurrency,
  rates: ExchangeRateMap
) {
  if (!Number.isFinite(amount) || amount <= 0) return Number.NaN;

  const rate = rates[currency] || FALLBACK_EXCHANGE_RATES[currency];
  const unitsPerUsd = Number(rate?.units_per_usd);
  if (!Number.isFinite(unitsPerUsd) || unitsPerUsd <= 0) return Number.NaN;

  return Number((amount / unitsPerUsd).toFixed(4));
}

export function parseFrankfurterRates(payload: unknown) {
  if (!Array.isArray(payload)) {
    throw new Error("Frankfurter returned an invalid rates payload.");
  }

  const rates: ExchangeRateMap = {
    USD: { currency: "USD", units_per_usd: 1, margin_percent: 0 },
  };
  let asOf: string | null = null;

  for (const rawRow of payload) {
    const row = (rawRow || {}) as FrankfurterRateRow;
    const currency = String(row.quote || "").toUpperCase() as SupportedCurrency;
    const unitsPerUsd = Number(row.rate);
    const supported = CURRENCY_OPTIONS.some(
      (option) => option.currency === currency
    );

    if (
      String(row.base || "").toUpperCase() !== "USD" ||
      !supported ||
      !Number.isFinite(unitsPerUsd) ||
      unitsPerUsd <= 0
    ) {
      continue;
    }

    rates[currency] = {
      currency,
      units_per_usd: unitsPerUsd,
      margin_percent: 0,
    };

    const date = String(row.date || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && (!asOf || date > asOf)) {
      asOf = date;
    }
  }

  if (Object.keys(rates).length < 2) {
    throw new Error("Frankfurter returned no supported exchange rates.");
  }

  return { rates, asOf };
}

export async function fetchFrankfurterRates() {
  const quotes = CURRENCY_OPTIONS.map((option) => option.currency)
    .filter((currency) => currency !== "USD")
    .join(",");
  const response = await fetch(
    `${FRANKFURTER_API_URL}/rates?base=USD&quotes=${encodeURIComponent(quotes)}`,
    {
      headers: { Accept: "application/json" },
      next: { revalidate: FRANKFURTER_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(8_000),
    }
  );

  if (!response.ok) {
    throw new Error(`Frankfurter request failed with HTTP ${response.status}.`);
  }

  return parseFrankfurterRates(await response.json());
}
