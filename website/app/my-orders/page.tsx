"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  FaBoxOpen,
  FaCheckCircle,
  FaClock,
  FaCreditCard,
  FaReceipt,
  FaSearch,
  FaShieldAlt,
  FaShoppingBag,
  FaStore,
} from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type Order = {
  id: number;
  created_at?: string | null;
  product?: string | null;
  price?: string | number | null;
  status?: string | null;
  product_id?: number | null;
  buyer_id?: string | null;
  quantity?: number | null;
  total_amount?: string | number | null;
  total_price?: string | number | null;
  payment_status?: string | null;
  product_title?: string | null;
  seller_name?: string | null;
  game_name?: string | null;
  category?: string | null;
  escrow_status?: string | null;
};

type Product = {
  id: number;
  title?: string | null;
  image_url?: string | null;
  price?: string | number | null;
  game_name?: string | null;
  category?: string | null;
  seller_name?: string | null;
};

type ProductMap = Record<number, Product>;

const FILTERS = [
  { label: "All Orders", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
  { label: "Delivered", value: "delivered" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

function numberPrice(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number(String(value).replace(/[^\d]/g, "") || 0);
}

function getOrderTotal(order: Order, product?: Product | null) {
  return (
    numberPrice(order.total_amount) ||
    numberPrice(order.total_price) ||
    numberPrice(order.price) ||
    numberPrice(product?.price)
  );
}

function fallbackImage(title: string) {
  return `https://placehold.co/900x600/020617/22d3ee?text=${encodeURIComponent(
    title || "Order"
  )}`;
}

function normalizeStatus(value?: string | null) {
  return String(value || "pending").toLowerCase();
}

function prettyStatus(status?: string | null) {
  return String(status || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isPaid(order: Order) {
  return (
    normalizeStatus(order.payment_status) === "paid" ||
    normalizeStatus(order.status) === "paid" ||
    normalizeStatus(order.status).includes("completed")
  );
}

function statusStyle(status?: string | null) {
  const value = normalizeStatus(status);

  if (value.includes("complete") || value.includes("paid")) {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  }

  if (value.includes("cancel") || value.includes("disputed")) {
    return "border-red-400/30 bg-red-400/10 text-red-300";
  }

  if (value.includes("pending") || value.includes("waiting")) {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
  }

  return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function MyOrdersPage() {
  const { formatPrice, currency } = useCurrency();

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<ProductMap>({});
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOrders() {
      setLoading(true);
      setError("");

      try {
        const result = await authenticatedFetchJson<{
          userId: string;
          orders: Order[];
          products: Product[];
        }>("/api/orders?scope=buyer&limit=200");

        setUserId(result.userId);
        setOrders(result.orders || []);

        const map: ProductMap = {};
        (result.products || []).forEach((product) => {
          map[product.id] = product;
        });
        setProducts(map);
      } catch (loadError) {
        setUserId(null);
        setOrders([]);
        setProducts({});
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load orders."
        );
      } finally {
        setLoading(false);
      }
    }

    loadOrders();
  }, []);

  const stats = useMemo(() => {
    const pending = orders.filter((order) =>
      normalizeStatus(order.status).includes("pending")
    ).length;

    const paid = orders.filter((order) => isPaid(order)).length;

    const completed = orders.filter((order) =>
      normalizeStatus(order.status).includes("completed")
    ).length;

    const totalSpent = orders
      .filter((order) => isPaid(order))
      .reduce((sum, order) => {
        const product = order.product_id ? products[order.product_id] : null;
        return sum + getOrderTotal(order, product);
      }, 0);

    return {
      total: orders.length,
      pending,
      paid,
      completed,
      totalSpent,
    };
  }, [orders, products]);

  const filteredOrders = useMemo(() => {
    let list = [...orders];

    if (filter !== "all") {
      list = list.filter((order) => {
        const orderStatus = normalizeStatus(order.status);
        const paymentStatus = normalizeStatus(order.payment_status);
        const escrowStatus = normalizeStatus(order.escrow_status);

        return (
          orderStatus === filter ||
          paymentStatus === filter ||
          escrowStatus === filter
        );
      });
    }

    if (query.trim()) {
      const q = query.toLowerCase();

      list = list.filter((order) => {
        const product = order.product_id ? products[order.product_id] : null;

        return `${order.id} ${order.product || ""} ${
          order.product_title || ""
        } ${product?.title || ""} ${order.game_name || ""} ${
          product?.game_name || ""
        } ${order.seller_name || ""} ${product?.seller_name || ""}`
          .toLowerCase()
          .includes(q);
      });
    }

    return list;
  }, [orders, products, filter, query]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050816] px-4 py-20 text-center text-white">
        Loading your orders...
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="min-h-screen bg-[#050816] text-white">
        <section className="mx-auto max-w-4xl px-4 py-24 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10">
            <FaShoppingBag className="text-4xl text-cyan-300" />
          </div>

          <h1 className="mt-8 text-5xl font-black">My Orders</h1>

          <p className="mx-auto mt-4 max-w-xl text-slate-300">
            Please login to view your purchases and marketplace order history.
          </p>

          <Link
            href="/"
            className="mt-8 inline-flex rounded-xl bg-cyan-400 px-6 py-4 font-black text-black hover:bg-cyan-300"
          >
            Back Home
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="border-b border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.14),transparent_35%)]">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="flex flex-wrap gap-3">
                <p className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-300">
                  Buyer Orders
                </p>

                <p className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-300">
                  {currency}
                </p>
              </div>

              <h1 className="mt-5 text-5xl font-black">My Orders</h1>

              <p className="mt-3 max-w-2xl text-slate-300">
                Manage purchases, payments, delivery status, and completed
                marketplace transactions.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Orders" value={stats.total} />
              <MiniStat label="Pending" value={stats.pending} tone="yellow" />
              <MiniStat label="Paid" value={stats.paid} tone="cyan" />
              <MiniStat label="Completed" value={stats.completed} tone="green" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by order, product, seller, or game..."
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-11 py-4 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
              />
            </div>

            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-white outline-none focus:border-cyan-400 lg:w-56"
            >
              {FILTERS.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                  className="bg-[#050816]"
                >
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-sm text-slate-400">
            <span>
              Showing{" "}
              <span className="font-black text-cyan-300">
                {filteredOrders.length}
              </span>{" "}
              of {orders.length} orders
            </span>

            <span>
              Total paid value:{" "}
              <span className="font-black text-emerald-300">
                {formatPrice(stats.totalSpent)}
              </span>
            </span>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-5 text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-12 text-center">
              <FaBoxOpen className="mx-auto text-5xl text-cyan-300" />

              <h2 className="mt-6 text-3xl font-black">No orders found</h2>

              <p className="mx-auto mt-3 max-w-xl text-slate-400">
                Your orders will appear here after you buy a product from
                ComePlayers marketplace.
              </p>

              <Link
                href="/games"
                className="mt-8 inline-flex rounded-2xl bg-cyan-400 px-6 py-4 font-black text-black hover:bg-cyan-300"
              >
                Browse Games
              </Link>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const product = order.product_id
                ? products[order.product_id]
                : null;
              const title =
                order.product_title ||
                order.product ||
                product?.title ||
                "Product";
              const seller =
                order.seller_name || product?.seller_name || "Verified Seller";
              const game = order.game_name || product?.game_name || "-";
              const category =
                order.category || product?.category || "Game Product";
              const total = getOrderTotal(order, product);
              const image = product?.image_url || fallbackImage(title);
              const paymentLabel = isPaid(order) ? "Paid" : "Unpaid";

              return (
                <article
                  key={order.id}
                  className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/20 transition hover:border-cyan-400/40"
                >
                  <div className="grid gap-0 lg:grid-cols-[220px_1fr_280px]">
                    <div
                      className="min-h-56 bg-cover bg-center lg:min-h-full"
                      style={{ backgroundImage: `url(${image})` }}
                    />

                    <div className="p-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-black">
                          Order #{order.id}
                        </h2>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${statusStyle(
                            order.status
                          )}`}
                        >
                          {prettyStatus(order.status)}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-slate-500">
                        {formatDate(order.created_at)}
                      </p>

                      <div className="mt-5">
                        <h3 className="text-xl font-black">{title}</h3>

                        <p className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                          <FaStore className="text-cyan-300" />
                          Seller: {seller}
                        </p>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <span className="rounded-full bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-200">
                          {category}
                        </span>

                        <span className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300">
                          {game}
                        </span>

                        <span className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300">
                          Qty: {order.quantity || 1}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-white/10 p-6 lg:border-l lg:border-t-0">
                      <div className="flex flex-wrap justify-between gap-4 lg:block">
                        <div>
                          <p className="text-sm text-slate-400">Total Amount</p>
                          <p className="mt-2 text-3xl font-black text-cyan-300">
                            {formatPrice(total)}
                          </p>
                        </div>

                        <div className="lg:mt-5">
                          <p className="text-sm text-slate-400">
                            Payment Status
                          </p>

                          <p
                            className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusStyle(
                              paymentLabel
                            )}`}
                          >
                            {paymentLabel}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 grid gap-3">
                        {!isPaid(order) ? (
                          <Link
                            href={`/payment/${order.id}`}
                            className="flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 font-black text-black hover:bg-cyan-300"
                          >
                            <FaCreditCard />
                            Pay Now
                          </Link>
                        ) : (
                          <Link
                            href={`/orders/${order.id}`}
                            className="flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 font-black text-black hover:bg-cyan-300"
                          >
                            <FaReceipt />
                            View Details
                          </Link>
                        )}

                        <Link
                          href={`/orders/${order.id}`}
                          className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-5 py-3 font-black text-white hover:border-cyan-400"
                        >
                          <FaReceipt />
                          Order Detail
                        </Link>

                        {product?.id ? (
                          <Link
                            href={`/product/${product.id}`}
                            className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-5 py-3 font-black text-white hover:border-cyan-400"
                          >
                            <FaShoppingBag />
                            Product Page
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <InfoCard
            icon={<FaShieldAlt />}
            title="Secure Transactions"
            description="Payments are protected by marketplace escrow flow."
          />

          <InfoCard
            icon={<FaClock />}
            title="Fast Delivery"
            description="Digital products are delivered directly by sellers."
          />

          <InfoCard
            icon={<FaCheckCircle />}
            title="Buyer Protection"
            description="Track every order status from payment to completion."
          />
        </div>
      </section>
    </main>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "yellow" | "cyan" | "green";
}) {
  const color =
    tone === "yellow"
      ? "text-yellow-300"
      : tone === "green"
      ? "text-emerald-300"
      : "text-cyan-300";

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4">
      <p className="text-xs text-slate-400">{label}</p>

      <p className={`mt-1 text-2xl font-black ${color}`}>
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="text-2xl text-cyan-300">{icon}</div>

      <h3 className="mt-4 font-black">{title}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}