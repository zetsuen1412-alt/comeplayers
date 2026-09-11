"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";

type Product = {
  id: number;
  title: string | null;
  price: string | number | null;
  image_url: string | null;
  category: string | null;
  game_name: string | null;
  stock: number | null;
  status: string | null;
  seller_name: string | null;
};

type FlashSale = {
  id: number;
  product_id: number;
  title: string;
  description: string | null;
  original_price: string | number;
  flash_price: string | number;
  stock_limit: number | null;
  sold_count: number;
  start_at: string;
  end_at: string;
  status: "active" | "inactive";
  created_at: string;
  products: Product | null;
};

const filters = ["all", "running", "upcoming", "ended"];


function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

function getFlashState(item: FlashSale) {
  const now = Date.now();
  const start = new Date(item.start_at).getTime();
  const end = new Date(item.end_at).getTime();

  if (item.status !== "active") return "inactive";
  if (now < start) return "upcoming";
  if (now > end) return "ended";
  return "running";
}

function getStateClass(state: string) {
  if (state === "running") {
    return "border-green-400/20 bg-green-400/10 text-green-300";
  }

  if (state === "upcoming") {
    return "border-blue-400/20 bg-blue-400/10 text-blue-300";
  }

  if (state === "ended") {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }

  return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
}

function getTimeLeft(endAt: string) {
  const distance = new Date(endAt).getTime() - Date.now();

  if (distance <= 0) {
    return {
      expired: true,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
  }

  return {
    expired: false,
    days: Math.floor(distance / (1000 * 60 * 60 * 24)),
    hours: Math.floor((distance / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((distance / (1000 * 60)) % 60),
    seconds: Math.floor((distance / 1000) % 60),
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export default function FlashSalePageV1() {
  const { formatPrice, currency } = useCurrency();
  const [flashSales, setFlashSales] = useState<FlashSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("running");
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);

  const filteredFlashSales = useMemo(() => {
    const query = search.trim().toLowerCase();

    return flashSales.filter((item) => {
      const state = getFlashState(item);
      const product = item.products;

      const matchesFilter =
        activeFilter === "all" ||
        state === activeFilter ||
        item.status === activeFilter;

      const matchesSearch =
        !query ||
        item.title.toLowerCase().includes(query) ||
        (item.description || "").toLowerCase().includes(query) ||
        (product?.title || "").toLowerCase().includes(query) ||
        (product?.category || "").toLowerCase().includes(query) ||
        (product?.game_name || "").toLowerCase().includes(query) ||
        (product?.seller_name || "").toLowerCase().includes(query) ||
        String(item.id).includes(query) ||
        String(item.product_id).includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [flashSales, activeFilter, search, tick]);

  const runningCount = flashSales.filter(
    (item) => getFlashState(item) === "running"
  ).length;

  const upcomingCount = flashSales.filter(
    (item) => getFlashState(item) === "upcoming"
  ).length;

  const endedCount = flashSales.filter(
    (item) => getFlashState(item) === "ended"
  ).length;

  async function loadFlashSales() {
    const { data, error } = await supabase
      .from("flash_sales")
      .select(
        `
        *,
        products:product_id (
          id,
          title,
          price,
          image_url,
          category,
          game_name,
          stock,
          status,
          seller_name
        )
      `
      )
      .eq("status", "active")
      .order("id", { ascending: false });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setFlashSales((data || []) as unknown as FlashSale[]);
    setLoading(false);
  }

  useEffect(() => {
    loadFlashSales();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-yellow-300">
          Loading flash sales...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,.24),transparent_32%),radial-gradient(circle_at_top_right,rgba(239,68,68,.18),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-sm font-black text-yellow-300">
              ⚡ ComePlayers Flash Sale
            </p>

            <h1 className="text-5xl font-black md:text-7xl">
              Flash Sale Deals
            </h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Limited-time gaming marketplace deals with discounted prices,
              countdown timers, and limited stock availability.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 px-6 font-bold text-gray-300 transition hover:bg-white hover:text-black"
            >
              Home
            </Link>

            <Link
              href="/wallet/topup"
              className="inline-flex h-12 items-center justify-center rounded-full border border-green-400 px-6 font-bold text-green-300 transition hover:bg-green-400 hover:text-black"
            >
              Top Up Wallet
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-3">
          <div className="rounded-3xl border border-green-400/20 bg-green-400/10 p-6">
            <p className="text-sm text-gray-300">Running Deals</p>
            <p className="mt-2 text-4xl font-black text-green-300">
              {runningCount}
            </p>
          </div>

          <div className="rounded-3xl border border-blue-400/20 bg-blue-400/10 p-6">
            <p className="text-sm text-gray-300">Upcoming Deals</p>
            <p className="mt-2 text-4xl font-black text-blue-300">
              {upcomingCount}
            </p>
          </div>

          <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-6">
            <p className="text-sm text-gray-300">Ended Deals</p>
            <p className="mt-2 text-4xl font-black text-red-300">
              {endedCount}
            </p>
          </div>
        </div>

        <div className="mb-8 grid gap-4 xl:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search flash sales by product, game, category, seller, or deal name..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
          />

          <div className="flex flex-wrap gap-3">
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                  activeFilter === filter
                    ? "bg-yellow-400 text-black"
                    : "border border-white/10 bg-white/[0.04] text-gray-300 hover:border-yellow-400 hover:text-white"
                }`}
              >
                {filter === "all" ? "All" : filter}
              </button>
            ))}
          </div>
        </div>

        {filteredFlashSales.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-12 text-center shadow-2xl shadow-black/30">
            <h2 className="text-3xl font-black">No flash sales found.</h2>

            <p className="mt-3 text-gray-400">
              There are no deals matching your filter right now.
            </p>

            <Link
              href="/"
              className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-yellow-400 px-6 font-black text-black hover:bg-yellow-300"
            >
              Browse Marketplace
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {filteredFlashSales.map((item) => {
              const product = item.products;
              const state = getFlashState(item);
              const timeLeft = getTimeLeft(item.end_at);

              const originalPrice = Number(item.original_price || 0);
              const flashPrice = Number(item.flash_price || 0);

              const discountPercent =
                originalPrice > 0
                  ? Math.round(
                      ((originalPrice - flashPrice) / originalPrice) * 100
                    )
                  : 0;

              const soldPercent =
                item.stock_limit && item.stock_limit > 0
                  ? Math.min((item.sold_count / item.stock_limit) * 100, 100)
                  : 0;

              const isClickable = state === "running" && product?.status === "active";

              const card = (
                <div
                  className={`group h-full overflow-hidden rounded-3xl border bg-white/[0.035] shadow-2xl shadow-black/30 transition ${
                    isClickable
                      ? "border-white/10 hover:-translate-y-1 hover:border-yellow-400"
                      : "border-white/10 opacity-70"
                  }`}
                >
                  <div className="relative flex h-52 items-center justify-center bg-black">
                    {product?.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.title || item.title}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <span className="text-6xl">🎮</span>
                    )}

                    <span className="absolute left-3 top-3 rounded-full bg-red-500 px-3 py-1 text-xs font-black text-white">
                      -{discountPercent}%
                    </span>

                    <span
                      className={`absolute right-3 top-3 rounded-full border px-3 py-1 text-xs font-black ${getStateClass(
                        state
                      )}`}
                    >
                      {state}
                    </span>
                  </div>

                  <div className="p-5">
                    <p className="text-xs font-black text-cyan-300">
                      {product?.category || "Marketplace"} /{" "}
                      {product?.game_name || "Game"}
                    </p>

                    <h3 className="mt-2 line-clamp-2 min-h-[56px] text-xl font-black group-hover:text-yellow-300">
                      {product?.title || item.title}
                    </h3>

                    <p className="mt-2 text-sm text-gray-400">
                      Seller: {product?.seller_name || "-"}
                    </p>

                    <div className="mt-4">
                      <p className="text-sm font-bold text-gray-500 line-through">
                        {formatPrice(item.original_price)}
                      </p>

                      <p className="text-3xl font-black text-yellow-300">
                        {formatPrice(item.flash_price)}
                      </p>
                    </div>

                    {state === "running" ? (
                      <div className="mt-5 grid grid-cols-4 gap-2 text-center">
                        <div className="rounded-xl border border-white/10 bg-black/40 p-2">
                          <p className="text-lg font-black">
                            {timeLeft.days}
                          </p>
                          <p className="text-[10px] text-gray-500">D</p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/40 p-2">
                          <p className="text-lg font-black">
                            {pad(timeLeft.hours)}
                          </p>
                          <p className="text-[10px] text-gray-500">H</p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/40 p-2">
                          <p className="text-lg font-black">
                            {pad(timeLeft.minutes)}
                          </p>
                          <p className="text-[10px] text-gray-500">M</p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/40 p-2">
                          <p className="text-lg font-black">
                            {pad(timeLeft.seconds)}
                          </p>
                          <p className="text-[10px] text-gray-500">S</p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-sm text-gray-400">
                          {state === "upcoming" ? "Starts at" : "Ended at"}
                        </p>
                        <p className="mt-1 font-black">
                          {state === "upcoming"
                            ? formatDate(item.start_at)
                            : formatDate(item.end_at)}
                        </p>
                      </div>
                    )}

                    {item.stock_limit && (
                      <div className="mt-4">
                        <div className="mb-2 flex justify-between text-xs text-gray-400">
                          <span>Sold</span>
                          <span>
                            {item.sold_count}/{item.stock_limit}
                          </span>
                        </div>

                        <div className="h-3 overflow-hidden rounded-full bg-black/60">
                          <div
                            className="h-full rounded-full bg-yellow-400"
                            style={{ width: `${soldPercent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div
                      className={`mt-5 rounded-2xl py-3 text-center font-black ${
                        isClickable
                          ? "bg-yellow-400 text-black"
                          : "border border-white/10 text-gray-400"
                      }`}
                    >
                      {isClickable ? "Buy Now" : "Unavailable"}
                    </div>
                  </div>
                </div>
              );

              if (!isClickable) {
                return <div key={item.id}>{card}</div>;
              }

              return (
                <Link key={item.id} href={`/product/${item.product_id}`}>
                  {card}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}