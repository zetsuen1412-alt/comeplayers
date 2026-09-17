"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  FaCheckCircle,
  FaClock,
  FaHome,
  FaReceipt,
  FaShieldAlt,
  FaShoppingBag,
  FaStore,
} from "react-icons/fa";
import { orderTotalIdr, storedMoney } from "@/lib/money";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";

type Order = {
  id: number;
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  product?: string | null;
  product_title?: string | null;
  product_id?: number | null;
  seller_name?: string | null;
  quantity?: number | null;
  total_amount?: string | number | null;
  total_price?: string | number | null;
  price?: string | number | null;
  game_name?: string | null;
  category?: string | null;
  escrow_status?: string | null;
};

type Product = {
  id: number;
  title?: string | null;
  price?: string | number | null;
  seller?: string | null;
  seller_name?: string | null;
  game_name?: string | null;
  category?: string | null;
};

const numberPrice = storedMoney;

function prettyStatus(value?: string | null) {
  return String(value || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function OrderSuccessPage() {
  const params = useParams();
  const orderId = Number(params?.id || 0);
  const { formatIdrPrice: formatPrice } = useCurrency();
  const [order, setOrder] = useState<Order | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOrder() {
      setLoading(true);
      setError("");

      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;

        if (sessionError || !accessToken) {
          throw new Error("Please login again to view this order.");
        }

        const response = await fetch(`/api/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error || "Failed to load order.");
        }

        setOrder(json.order as Order);
        setProduct((json.product || null) as Product | null);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load order."
        );
      } finally {
        setLoading(false);
      }
    }

    if (orderId > 0) loadOrder();
  }, [orderId]);

  const total = useMemo(
    () =>
      orderTotalIdr(order),
    [order, product]
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-20 text-center text-slate-900">
        Loading order confirmation...
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-white px-4 py-20 text-center text-slate-900">
        <h1 className="text-4xl font-black">Order Confirmation Unavailable</h1>
        <p className="mt-4 text-red-300">{error || "Order not found."}</p>
        <Link
          href="/my-orders"
          className="mt-8 inline-flex rounded-xl bg-cyan-400 px-6 py-4 font-black text-black"
        >
          My Orders
        </Link>
      </main>
    );
  }

  const productTitle =
    order.product_title || order.product || product?.title || "Product";
  const sellerName =
    order.seller_name || product?.seller_name || product?.seller || "Seller";
  const gameName = order.game_name || product?.game_name || "-";
  const category = order.category || product?.category || "Game Product";

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_top,rgba(34,211,238,.14),transparent_38%)]">
        <div className="mx-auto max-w-5xl px-4 py-14 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10">
            <FaCheckCircle className="text-5xl text-emerald-600" />
          </div>

          <h1 className="mt-8 text-5xl font-black md:text-6xl">
            Payment Successful
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-slate-600">
            Payment is recorded and held in escrow. The seller can now deliver
            your digital product securely inside ComePlayers.
          </p>
          <div className="mt-6 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-5 py-2 text-sm font-black text-cyan-700">
            Order #{order.id}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-3 text-2xl font-black">
              <FaReceipt className="text-cyan-600" /> Order Summary
            </h2>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="text-2xl font-black">{productTitle}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-700">
                  {category}
                </span>
                <span className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600">
                  {gameName}
                </span>
                <span className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600">
                  Qty: {Number(order.quantity || 1)}
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-sm text-slate-500">Seller</p>
                  <p className="mt-1 font-black">{sellerName}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-sm text-slate-500">Total Paid</p>
                  <p className="mt-1 text-2xl font-black text-cyan-600">
                    {formatPrice(total)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black">What Happens Next?</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <Step
                icon={<FaCheckCircle />}
                title="1. Payment Held"
                text="Payment is secured in marketplace escrow."
              />
              <Step
                icon={<FaStore />}
                title="2. Seller Delivers"
                text="The seller sends the account, key, or digital item."
              />
              <Step
                icon={<FaShieldAlt />}
                title="3. Confirm Safely"
                text="Check delivery before releasing payment to the seller."
              />
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-6 shadow-sm">
            <h3 className="text-xl font-black">Status</h3>
            <div className="mt-5 space-y-4 text-sm">
              <StatusRow label="Order" value={prettyStatus(order.status)} />
              <StatusRow
                label="Payment"
                value={prettyStatus(order.payment_status)}
              />
              <StatusRow
                label="Escrow"
                value={prettyStatus(order.escrow_status)}
              />
              <StatusRow
                label="Method"
                value={prettyStatus(order.payment_method)}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-xl font-black">
              <FaClock className="text-yellow-500" /> Track Delivery
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Open the order detail page to receive delivery information and
              confirm completion.
            </p>
            <div className="mt-6 space-y-3">
              <Link
                href={`/orders/${order.id}`}
                className="flex items-center justify-center gap-3 rounded-xl bg-cyan-400 px-5 py-4 font-black text-black hover:bg-cyan-300"
              >
                <FaShoppingBag /> Open Order
              </Link>
              <Link
                href="/games"
                className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 font-black text-slate-800 hover:border-cyan-400"
              >
                <FaHome /> Browse More Games
              </Link>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-200 pb-3 last:border-0 last:pb-0">
      <span className="text-slate-600">{label}</span>
      <span className="text-right font-black text-cyan-700">{value}</span>
    </div>
  );
}

function Step({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="text-3xl text-emerald-600">{icon}</div>
      <h3 className="mt-4 font-black">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{text}</p>
    </div>
  );
}
