"use client";
import { useCurrency } from "@/components/CurrencyProvider";
import { CURRENCY_OPTIONS } from "@/lib/localization";

export default function WalletCurrencySelect() {
  const { currency, setPreferences } = useCurrency();
  return <label className="cpw-currency">Display currency
    <select value={currency} onChange={event => setPreferences({ currency: event.target.value })}>
      {CURRENCY_OPTIONS.map(option => <option key={option.currency} value={option.currency}>{option.currency}</option>)}
    </select>
  </label>;
}
