"use client";

import { useCurrency } from "@/components/CurrencyProvider";

export function CardPaymentTotal({ amountIdr, className }: { amountIdr: number; className?: string }) {
  const { currency, formatIdrPrice, formatIdrAmount } = useCurrency();
  return (
    <div className={className}>
      <small>Total in {currency}</small>
      <strong>{formatIdrPrice(amountIdr)}</strong>
      <p>DOKU charges <b>{formatIdrAmount(amountIdr)} (IDR)</b>.</p>
      {currency !== "IDR" ? <p>Your card issuer determines any conversion to your card&apos;s currency.</p> : null}
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
