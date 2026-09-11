"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FaArrowLeft, FaPrint } from "react-icons/fa";
import { supabase } from "@/lib/supabase";

type InvoicePayload = {
  invoice: {
    invoice_number: string;
    currency_code: string;
    subtotal_amount: number | string;
    discount_amount: number | string;
    payment_fee_amount: number | string;
    tax_amount: number | string;
    total_amount: number | string;
    status: string;
    issued_at: string;
  };
  sellerSettlement?: {
    seller_gross_amount: number | string;
    seller_marketplace_fee_amount: number | string;
    seller_marketplace_fee_rate_percent: number | string;
    seller_sales_tax_rate_percent: number | string;
    seller_sales_tax_amount: number | string;
    seller_net_amount: number | string;
    tax_bearer: string;
  } | null;
  viewerRole: "buyer" | "seller" | "admin";
  taxModel: "seller_v23" | "legacy";
  order: {
    id: number;
    product_title?: string | null;
    product?: string | null;
    quantity?: number | null;
    payment_status?: string | null;
    status?: string | null;
    created_at?: string | null;
    paid_at?: string | null;
  };
};

function money(value: unknown, currency = "IDR") {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "IDR" ? 0 : 2,
  }).format(Number(value || 0));
}

export default function OrderInvoicePage() {
  const params = useParams();
  const orderId = Number(params?.id || 0);
  const [payload, setPayload] = useState<InvoicePayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInvoice() {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Please login to view this invoice.");
        const response = await fetch(`/api/orders/${orderId}/invoice`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Failed to load invoice.");
        setPayload(json);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load invoice.");
      } finally {
        setLoading(false);
      }
    }
    void loadInvoice();
  }, [orderId]);

  if (loading) {
    return <main className="min-h-screen bg-slate-950 p-10 text-center text-white">Loading invoice...</main>;
  }
  if (!payload) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-center text-white">
        <h1 className="text-4xl font-black">Invoice unavailable</h1>
        <p className="mt-4 text-red-300">{error}</p>
        <Link href={`/orders/${orderId}`} className="mt-8 inline-flex rounded-xl bg-cyan-400 px-6 py-3 font-black text-black">
          Back to order
        </Link>
      </main>
    );
  }

  const { invoice, order, sellerSettlement } = payload;
  const usesV23SellerTax = payload.taxModel === "seller_v23";
  const currency = invoice.currency_code || "IDR";
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white print:bg-white print:text-black">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href={`/orders/${orderId}`} className="inline-flex items-center gap-2 font-black text-cyan-300">
            <FaArrowLeft /> Back to order
          </Link>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-black text-black">
            <FaPrint /> Print / Save PDF
          </button>
        </div>

        <article className="rounded-3xl border border-white/10 bg-white p-8 text-slate-900 shadow-2xl md:p-12">
          <header className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-8 md:flex-row">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.25em] text-cyan-700">ComePlayers</p>
              <h1 className="mt-2 text-4xl font-black">Purchase Invoice</h1>
              <p className="mt-2 text-slate-500">{invoice.invoice_number}</p>
            </div>
            <div className="text-left md:text-right">
              <p className="font-bold">Issued</p>
              <p className="text-slate-600">{new Date(invoice.issued_at).toLocaleString("id-ID")}</p>
              <p className="mt-3 font-bold">Status</p>
              <p className="capitalize text-slate-600">{invoice.status}</p>
            </div>
          </header>

          <section className="grid gap-6 border-b border-slate-200 py-8 md:grid-cols-2">
            <div>
              <h2 className="font-black">Order</h2>
              <p className="mt-2">#{order.id}</p>
              <p className="text-slate-600">{order.product_title || order.product || "Digital product"}</p>
              <p className="text-slate-600">Quantity: {Number(order.quantity || 1)}</p>
            </div>
            <div>
              <h2 className="font-black">Tax responsibility</h2>
              <p className="mt-2 text-slate-600">Buyer tax: {money(invoice.tax_amount, currency)}</p>
              <p className="text-slate-600">
                {usesV23SellerTax
                  ? "ComePlayers seller tax is withheld from seller proceeds using the immutable rate snapshot captured for this order."
                  : "This is a historical invoice and keeps the tax treatment recorded when the order was paid."}
              </p>
            </div>
          </section>

          <section className="py-8">
            <div className="ml-auto max-w-md space-y-3">
              <Row label="Subtotal" value={money(invoice.subtotal_amount, currency)} />
              <Row label="Discount" value={`-${money(invoice.discount_amount, currency)}`} />
              <Row label="Payment fee" value={money(invoice.payment_fee_amount, currency)} />
              <Row label="Buyer tax" value={money(invoice.tax_amount, currency)} />
              <div className="mt-5 flex justify-between border-t-2 border-slate-900 pt-5 text-xl font-black">
                <span>Total paid</span>
                <span>{money(invoice.total_amount, currency)}</span>
              </div>
            </div>
          </section>

          {sellerSettlement ? (
            <section className="mb-8 rounded-2xl border border-cyan-200 bg-cyan-50 p-6">
              <h2 className="text-xl font-black">Seller settlement statement</h2>
              <p className="mt-2 text-sm text-slate-600">Visible only to the seller and administrators.</p>
              <div className="mt-5 space-y-3">
                <Row label="Seller gross proceeds" value={money(sellerSettlement.seller_gross_amount, currency)} />
                <Row label={`Marketplace fee (${Number(sellerSettlement.seller_marketplace_fee_rate_percent ?? 0).toFixed(2)}%)`} value={`-${money(sellerSettlement.seller_marketplace_fee_amount, currency)}`} />
                <Row label={`Seller sales tax (${Number(sellerSettlement.seller_sales_tax_rate_percent ?? 0).toFixed(2)}%)`} value={`-${money(sellerSettlement.seller_sales_tax_amount, currency)}`} />
                <div className="flex justify-between border-t border-cyan-300 pt-3 font-black">
                  <span>Seller wallet credit</span>
                  <span>{money(sellerSettlement.seller_net_amount, currency)}</span>
                </div>
              </div>
            </section>
          ) : null}

          <footer className="border-t border-slate-200 pt-6 text-xs leading-5 text-slate-500">
            {usesV23SellerTax
              ? "Buyer tax is zero under the seller-borne model. Marketplace fee and seller sales-tax rates are frozen when the order is created, so later rate changes do not alter this settlement. Withdrawal taxes and FX are snapshotted separately when payout is requested."
              : "Historical invoices are not retroactively rewritten. Their original buyer-tax treatment remains part of the financial audit trail."}
          </footer>
        </article>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="text-slate-500">{label}</span><span className="font-bold">{value}</span></div>;
}
