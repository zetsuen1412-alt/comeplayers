import type { ExchangeRateMap } from "./frankfurter";
import { CURRENCY_OPTIONS, type SupportedCurrency } from "./localization";

export const CPW_MIN_IDR = 10_000;
export const CPW_MAX_IDR = 10_000_000;
export const CPW_QUOTE_MINUTES = 15;
export type WalletProvider = "doku" | "paypal";
export type WalletQuote = {
  amount_idr: number;
  display_amount: number;
  display_currency: string;
  idr_per_unit: number;
  rate_date: string;
  charge_amount: number;
  charge_currency: "IDR" | "USD";
};

export function quoteWalletTopup(input: {
  amount: unknown; currency: unknown; provider: unknown;
  rates: ExchangeRateMap; asOf: string | null; now?: number;
}): WalletQuote {
  const currency = String(input.currency || "").toUpperCase();
  if (!CURRENCY_OPTIONS.some(item => item.currency === currency)) throw new Error("Choose a supported currency.");
  if (input.provider !== "doku" && input.provider !== "paypal") throw new Error("Choose an available payment provider.");
  const raw = String(input.amount ?? "");
  const zeroDecimal = ["IDR", "JPY", "KRW", "VND"].includes(currency);
  if (!(zeroDecimal ? /^\d{1,12}$/ : /^\d{1,12}(\.\d{1,2})?$/).test(raw)) {
    throw new Error(zeroDecimal ? "Enter a positive whole amount." : "Enter an amount with up to two decimal places.");
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a positive amount.");
  const needsRates = currency !== "IDR" || input.provider === "paypal";
  const now = input.now ?? Date.now();
  const date = Date.parse(input.asOf || "");
  if (needsRates && (!Number.isFinite(date) || now - date > 7 * 86400_000 || date > now + 86400_000)) {
    throw new Error("A current exchange rate is unavailable. Please try again later.");
  }
  const idrPerUsd = Number(input.rates.IDR?.units_per_usd);
  const unitsPerUsd = currency === "USD" ? 1 : Number(input.rates[currency as SupportedCurrency]?.units_per_usd);
  const rate = currency === "IDR" ? 1 : idrPerUsd / unitsPerUsd;
  if (!Number.isFinite(rate) || rate <= 0 || (input.provider === "paypal" && !(idrPerUsd > 0))) {
    throw new Error("The selected exchange rate is unavailable.");
  }
  const credit = Math.floor(amount * rate + 1e-8);
  if (!Number.isSafeInteger(credit) || credit < CPW_MIN_IDR || credit > CPW_MAX_IDR) {
    throw new Error("Top up between IDR 10,000 and IDR 10,000,000 (or the equivalent in your currency).");
  }
  const charge = input.provider === "paypal" ? Math.ceil((credit / idrPerUsd) * 100 - 1e-8) / 100 : credit;
  if (input.provider === "paypal" && charge < 1) throw new Error("PayPal requires a minimum charge of USD 1.00.");
  return {
    amount_idr: credit, display_amount: amount, display_currency: currency,
    idr_per_unit: rate, rate_date: input.asOf || new Date(now).toISOString().slice(0, 10),
    charge_amount: charge, charge_currency: input.provider === "paypal" ? "USD" : "IDR",
  };
}

export function walletInvoice(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Invalid top-up reference.");
  return `CPW-${id.replaceAll("-", "")}`;
}

export function walletIdFromInvoice(value: string) {
  const match = /^CPW-([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i.exec(value);
  return match ? match.slice(1).join("-").toLowerCase() : null;
}

export function matchesWalletCharge(value: unknown, currency: unknown, expected: { charge_amount: number | string; charge_currency: string }) {
  const decimals = expected.charge_currency === "IDR" ? 0 : 2;
  const text = String(value ?? "");
  if (!/^\d+(\.\d{1,2})?$/.test(text) || currency !== expected.charge_currency) return false;
  const amount = Number(text);
  const units = amount * 10 ** decimals;
  return amount > 0 && Math.abs(units - Math.round(units)) < 1e-7 &&
    Math.round(units) === Math.round(Number(expected.charge_amount) * 10 ** decimals);
}

export function walletTransactionLabel(type: string) {
  return ({ deposit: "Top-up", topup: "Top-up", buyer_order_payment: "Purchase", purchase: "Purchase", order_refund: "Product refund", refund: "Refund", seller_order_payout: "Seller earnings", sale_release: "Seller earnings", withdraw_paid: "Withdrawal", withdraw_request: "Withdrawal request", topup_rejected: "Top-up rejected" } as Record<string, string>)[type] || type.replaceAll("_", " ");
}

export type WalletPayPalOrder = {
  id?: string; status?: string;
  purchase_units?: Array<{ custom_id?: string; amount?: { value?: string; currency_code?: string }; payments?: { captures?: Array<{ id?: string; status?: string; amount?: { value?: string; currency_code?: string } }> } }>;
};

export function readWalletPayPalCapture(result: WalletPayPalOrder, expected: { id: string; provider_order_id: string | null; charge_amount: number | string; charge_currency: string }) {
  const units = result.purchase_units;
  const captures = units?.[0]?.payments?.captures;
  if (result.id !== expected.provider_order_id || result.status !== "COMPLETED" || units?.length !== 1 ||
      (units[0].custom_id !== undefined && units[0].custom_id !== walletInvoice(expected.id)) ||
      captures?.length !== 1 || captures[0].status !== "COMPLETED" || !captures[0].id ||
      !matchesWalletCharge(captures[0].amount?.value, captures[0].amount?.currency_code, expected)) {
    throw new Error("PayPal has not confirmed the expected payment. Your top-up remains pending.");
  }
  return { id: captures[0].id, amount: Number(captures[0].amount!.value) };
}
