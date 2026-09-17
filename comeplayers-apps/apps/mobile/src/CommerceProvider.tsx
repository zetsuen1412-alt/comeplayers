import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { request } from "./api";
import { COMMERCE_CURRENCIES, money, type CommerceCurrency } from "./commercePolicy";
type Rates = Record<string, { units_per_usd: number }>;
type ContextValue = { ensureRates: () => void; currency: CommerceCurrency; setCurrency: (value: CommerceCurrency) => void; formatIdr: (value: number) => string; formatUsd: (value: number) => string; rateNote: string };
const Context = createContext<ContextValue | null>(null);
let cachedRates: { rates: Rates; fetched: number; source: string } | null = null;
let pendingRates: Promise<{ rates: Rates; source: string }> | null = null;
function loadRates() {
  if (cachedRates && Date.now() - cachedRates.fetched < 3_600_000) return Promise.resolve(cachedRates);
  if (!pendingRates) pendingRates = request<{ rates: Rates; source: string }>("/api/exchange-rates").then(value => {
    cachedRates = { ...value, fetched: Date.now() }; return value;
  }).finally(() => { pendingRates = null; });
  return pendingRates;
}
export function CommerceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [currency, setValue] = useState<CommerceCurrency>("USD");
  const [rates, setRates] = useState<Rates>(cachedRates?.rates || {});
  const [source, setSource] = useState(cachedRates?.source || "");
  const selected = useRef(false);
  const [needed, setNeeded] = useState(false);
  const ensureRates = useCallback(() => setNeeded(true), []);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(`cp-commerce-currency-v1:${userId}`).then(value => {
      if (active && !selected.current && COMMERCE_CURRENCIES.includes(value as CommerceCurrency)) setValue(value as CommerceCurrency);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    if (!needed) return;
    let active = true;
    void loadRates().then(value => { if (active) { setRates(value.rates); setSource(value.source); } }).catch(() => undefined);
    return () => { active = false; };
  }, [needed]);
  const value = useMemo<ContextValue>(() => {
    const idr = Number(rates.IDR?.units_per_usd), target = currency === "USD" ? 1 : Number(rates[currency]?.units_per_usd);
    const ready = idr > 0 && target > 0;
    return {
      ensureRates, currency, setCurrency: next => { selected.current = true; setValue(next); void AsyncStorage.setItem(`cp-commerce-currency-v1:${userId}`, next).catch(() => undefined); },
      formatIdr: amount => currency === "IDR" || !ready ? money(amount, "IDR") : money(amount / idr * target, currency),
      formatUsd: amount => target > 0 ? money(amount * target, currency) : money(amount, "USD"),
      rateNote: currency === "IDR" ? "Balance is recorded in IDR." : !ready ? "Exchange rates unavailable. IDR amounts are shown." : source === "backup" ? "Estimated display using backup rates. Payment uses a confirmed quote." : "Converted display estimate. Payment uses a confirmed quote.",
    };
  }, [currency, rates, source, userId, ensureRates]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCommerceCurrency() {
  const value = useContext(Context);
  useEffect(() => { value?.ensureRates(); }, [value?.ensureRates]);
  if (!value) throw new Error("Commerce account context is unavailable.");
  return value;
}
