"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  formatLocalizedPrice,
  normalizeCountry,
  normalizeCurrency,
  normalizeLocale,
  translate,
  translateCategoryLabel,
  type ExchangeRate,
  type SupportedCurrency,
  type TranslationKey,
} from "@/lib/localization";
import type { ExchangeRateMap } from "@/lib/frankfurter";

type CurrencyContextValue = {
  country: string;
  locale: string;
  currency: string;
  rateSource: "live" | "backup";
  rateUpdatedAt: string | null;
  ratesLoading: boolean;
  formatPrice: (amountUsd: string | number | null | undefined) => string;
  formatBasePrice: (amountUsd: string | number | null | undefined) => string;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  translateCategory: (label: string | null | undefined) => string;
  setPreferences: (preferences: {
    country?: string;
    locale?: string;
    currency?: string;
  }) => void;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function writePreferenceCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function normalizePreferences(input: {
  country?: string;
  locale?: string;
  currency?: string;
}) {
  return {
    country: normalizeCountry(input.country),
    locale: normalizeLocale(input.locale),
    currency: normalizeCurrency(input.currency),
  };
}

export function CurrencyProvider({
  children,
  country,
  locale,
  currency,
}: {
  children: ReactNode;
  country: string;
  locale: string;
  currency: string;
}) {
  const [preferences, setPreferencesState] = useState(() =>
    normalizePreferences({ country, locale, currency })
  );
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateMap>({});
  const [rateSource, setRateSource] = useState<"live" | "backup">(
    "backup"
  );
  const [rateUpdatedAt, setRateUpdatedAt] = useState<string | null>(null);
  const [ratesLoading, setRatesLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRates() {
      try {
        const response = await fetch("/api/exchange-rates", {
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          source?: "live" | "backup";
          asOf?: string | null;
          rates?: ExchangeRateMap;
        };
        if (!response.ok || !payload.rates) return;
        setExchangeRates(payload.rates);
        setRateSource(payload.source === "live" ? "live" : "backup");
        setRateUpdatedAt(payload.asOf || null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      } finally {
        if (!controller.signal.aborted) setRatesLoading(false);
      }
    }

    void loadRates();
    return () => controller.abort();
  }, []);

  const setPreferences = useCallback(
    (next: { country?: string; locale?: string; currency?: string }) => {
      const normalized = normalizePreferences({
        country: next.country || preferences.country,
        locale: next.locale || preferences.locale,
        currency: next.currency || preferences.currency,
      });

      writePreferenceCookie("cp_country", normalized.country);
      writePreferenceCookie("cp_locale", normalized.locale);
      writePreferenceCookie("cp_currency", normalized.currency);
      writePreferenceCookie("cp_currency_source", "manual");
      document.documentElement.lang = normalized.locale;
      try {
        window.localStorage.setItem("cp_preferences", JSON.stringify(normalized));
      } catch {
        // Cookies remain the canonical preference store when storage is blocked.
      }
      setPreferencesState(normalized);
    },
    [preferences.country, preferences.currency, preferences.locale]
  );

  const value = useMemo<CurrencyContextValue>(() => {
    return {
      country: preferences.country,
      locale: preferences.locale,
      currency: preferences.currency,
      rateSource,
      rateUpdatedAt,
      ratesLoading,
      formatPrice: (amountUsd) =>
        formatLocalizedPrice(
          amountUsd,
          preferences.locale,
          preferences.currency,
          exchangeRates[
            normalizeCurrency(preferences.currency) as SupportedCurrency
          ] as ExchangeRate | undefined
        ),
      formatBasePrice: (amountUsd) =>
        formatLocalizedPrice(amountUsd, "en-US", "USD"),
      t: (key, values) => translate(preferences.locale, key, values),
      translateCategory: (label) =>
        translateCategoryLabel(preferences.locale, label),
      setPreferences,
    };
  }, [
    exchangeRates,
    preferences.country,
    preferences.currency,
    preferences.locale,
    rateSource,
    rateUpdatedAt,
    ratesLoading,
    setPreferences,
  ]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);

  if (!context) {
    return {
      country: "ID",
      locale: "en-US",
      currency: "IDR",
      rateSource: "backup" as const,
      rateUpdatedAt: null,
      ratesLoading: false,
      formatPrice: (amountUsd: string | number | null | undefined) =>
        formatLocalizedPrice(amountUsd, "en-US", "USD"),
      formatBasePrice: (amountUsd: string | number | null | undefined) =>
        formatLocalizedPrice(amountUsd, "en-US", "USD"),
      t: (key: TranslationKey, values?: Record<string, string | number>) =>
        translate("en-US", key, values),
      translateCategory: (label: string | null | undefined) =>
        translateCategoryLabel("en-US", label),
      setPreferences: () => undefined,
    };
  }

  return context;
}
