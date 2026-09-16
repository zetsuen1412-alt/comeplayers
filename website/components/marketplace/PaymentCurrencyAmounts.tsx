"use client";

import { useCurrency } from "@/components/CurrencyProvider";

export function CardPaymentTotal({ amountIdr, className }: { amountIdr: number; className?: string }) {
  const { currency, formatIdrPrice } = useCurrency();
  const chargeIdr = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amountIdr);
  return (
    <div className={className}>
      <small>Total in {currency}</small>
      <strong>{formatIdrPrice(amountIdr)}</strong>
      <p><b>Your card will be charged IDR {chargeIdr}.</b></p>
      {currency !== "IDR" ? <p>The {currency} amount is an estimate. Your bank may apply currency conversion and fees.</p> : null}
    </div>
  );
}

export function PayPalPaymentReview({ amountUsd, className }: { amountUsd: number; className?: string }) {
  const { locale, currency } = useCurrency();
  const formatted = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(amountUsd);
  return (
    <div className={className} role="status">
      <p>PayPal will charge (USD)</p>
      <strong>{formatted}</strong>
      <p>{currency !== "USD" ? `Your display currency is ${currency}. ` : ""}Review this amount, then continue to PayPal to approve payment.</p>
    </div>
  );
}
