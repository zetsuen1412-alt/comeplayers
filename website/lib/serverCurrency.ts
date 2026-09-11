import { cookies } from "next/headers";
import { fetchFrankfurterRates } from "@/lib/frankfurter";
import {
  formatLocalizedPrice,
  normalizeCurrency,
  normalizeLocale,
  type SupportedCurrency,
} from "@/lib/localization";

export async function getServerCurrencyFormatter() {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get("cp_locale")?.value);
  const currency = normalizeCurrency(cookieStore.get("cp_currency")?.value);
  const liveRates = await fetchFrankfurterRates().catch(() => null);
  const rate = liveRates?.rates[currency as SupportedCurrency];

  return (amount: string | number | null | undefined) =>
    formatLocalizedPrice(amount, locale, currency, rate);
}

export async function serverFormatPrice(
  amount: string | number | null | undefined
) {
  const formatPrice = await getServerCurrencyFormatter();
  return formatPrice(amount);
}
