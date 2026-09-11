"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrency } from "@/components/CurrencyProvider";
import { FaBolt, FaChartLine, FaFire, FaShoppingCart, FaTags, FaTrophy } from "react-icons/fa";

type IntelligenceSummary = {
  active_products: number;
  offer_views_7d: number;
  product_views_7d: number;
  checkout_starts_7d: number;
  completed_orders_7d: number;
  revenue_30d: number;
};

type IntelligenceGame = {
  game_name: string;
  game_slug: string;
  image_url: string;
  views: number;
  checkouts: number;
  orders: number;
  active_offers: number;
  score: number;
};

type IntelligenceOffer = {
  id: number;
  title: string;
  slug: string;
  price: number;
  image_url: string;
  seller_name: string;
  game_name: string;
  game_slug: string;
  category_name: string;
  category_slug: string;
  views: number;
  checkout_starts: number;
  orders: number;
  revenue: number;
  score: number;
};

type IntelligenceCategory = {
  name: string;
  slug: string;
  icon: string;
  activity_7d: number;
  previous_activity_7d: number;
  growth: number;
  growth_rate: number;
  href: string;
};

type IntelligencePayload = {
  summary: IntelligenceSummary;
  trending_games: IntelligenceGame[];
  hot_offers: IntelligenceOffer[];
  fast_growing_categories: IntelligenceCategory[];
};

function formatCount(value: number | null | undefined) {
  return new Intl.NumberFormat("id-ID", {
    notation: Number(value || 0) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function formatPrice(value: number | null | undefined) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

function metricLabel(value: number) {
  if (value <= 0) return "New signal";
  return `+${formatCount(value)} this week`;
}

export default function MarketplaceIntelligence() {
  const { formatPrice, currency } = useCurrency();
  const [data, setData] = useState<IntelligencePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadIntelligence() {
      try {
        setError("");
        const response = await fetch("/api/marketplace/intelligence", {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error || "Failed to load marketplace intelligence.");
        }

        setData(json);
      } catch (requestError) {
        if ((requestError as Error).name === "AbortError") return;
        console.error("Marketplace intelligence error:", requestError);
        setError("Marketplace intelligence is unavailable right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadIntelligence();

    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <section className="px-4 pb-12 sm:px-6 lg:px-8 lg:pb-16">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-center text-slate-400 sm:p-8">
          Loading marketplace intelligence...
        </div>
      </section>
    );
  }

  if (error || !data) {
    return null;
  }

  const hasIntelligence =
    data.trending_games.length > 0 ||
    data.hot_offers.length > 0 ||
    data.fast_growing_categories.length > 0;

  if (!hasIntelligence) return null;

  return (
    <section className="px-4 pb-12 sm:px-6 lg:px-8 lg:pb-16">
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-300">
            <FaChartLine /> Marketplace Intelligence
          </p>
          <h2 className="mt-4 text-3xl font-black sm:text-4xl">
            What Buyers Are Doing Now
          </h2>
          <p className="mt-2 max-w-2xl text-gray-300">
            Live marketplace signals from views, checkout starts, completed orders, and active listings.
          </p>
        </div>

        <Link
          href="/games"
          className="inline-flex w-full justify-center rounded-full border border-cyan-400/30 px-5 py-3 font-black text-cyan-300 hover:bg-cyan-400 hover:text-black sm:w-auto sm:border-0 sm:p-0 sm:hover:bg-transparent sm:hover:text-cyan-200"
        >
          Explore catalog →
        </Link>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-5">
          <p className="text-sm font-bold text-slate-300">Product views</p>
          <p className="mt-2 text-3xl font-black text-cyan-300">
            {formatCount(data.summary.product_views_7d)}
          </p>
          <p className="mt-1 text-xs text-cyan-100/70">last 7 days</p>
        </div>

        <div className="rounded-3xl border border-purple-400/20 bg-purple-400/10 p-5">
          <p className="text-sm font-bold text-slate-300">Checkout starts</p>
          <p className="mt-2 text-3xl font-black text-purple-300">
            {formatCount(data.summary.checkout_starts_7d)}
          </p>
          <p className="mt-1 text-xs text-purple-100/70">buyer intent</p>
        </div>

        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5">
          <p className="text-sm font-bold text-slate-300">Completed orders</p>
          <p className="mt-2 text-3xl font-black text-emerald-300">
            {formatCount(data.summary.completed_orders_7d)}
          </p>
          <p className="mt-1 text-xs text-emerald-100/70">last 7 days</p>
        </div>

        <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5">
          <p className="text-sm font-bold text-slate-300">30D GMV signal</p>
          <p className="mt-2 text-3xl font-black text-yellow-300">
            {formatPrice(data.summary.revenue_30d)}
          </p>
          <p className="mt-1 text-xs text-yellow-100/70">completed order value</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/30 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 text-xl font-black sm:text-2xl">
                <FaFire className="text-orange-300" /> Trending This Week
              </h3>
              <p className="mt-1 text-sm text-gray-400">Ranked by views, checkouts, orders, and listings.</p>
            </div>
          </div>

          <div className="space-y-3">
            {data.trending_games.slice(0, 5).map((game, index) => (
              <Link
                key={game.game_slug}
                href={`/games/${game.game_slug}`}
                className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-3 transition hover:border-cyan-400 hover:bg-cyan-950/20 sm:gap-4"
              >
                <div
                  className="h-12 w-12 shrink-0 rounded-2xl bg-slate-900 bg-cover bg-center sm:h-14 sm:w-14"
                  style={{ backgroundImage: `url(${game.image_url})` }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black group-hover:text-cyan-300">
                    #{index + 1} {game.game_name}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {formatCount(game.active_offers)} offers • {formatCount(game.orders)} orders
                  </p>
                </div>
                <span className="hidden rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-300 sm:inline-flex">
                  {formatCount(game.score)} score
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/30 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 text-xl font-black sm:text-2xl">
                <FaBolt className="text-yellow-300" /> Hot Offers
              </h3>
              <p className="mt-1 text-sm text-gray-400">Offers getting strong buyer intent right now.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {data.hot_offers.slice(0, 4).map((offer) => (
              <Link
                key={offer.id}
                href={`/product/${offer.slug}`}
                className="group rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:border-yellow-400 hover:bg-yellow-950/10"
              >
                <div className="flex gap-4">
                  <div
                    className="h-16 w-16 shrink-0 rounded-2xl bg-slate-900 bg-cover bg-center"
                    style={{ backgroundImage: `url(${offer.image_url})` }}
                  />
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-black group-hover:text-yellow-300">{offer.title}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {offer.game_name} • {offer.category_name}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-black text-cyan-300">{formatPrice(offer.price)}</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-purple-400/20 bg-purple-400/10 px-3 py-1 text-xs font-black text-purple-300">
                    <FaShoppingCart /> {formatCount(offer.checkout_starts)} starts
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {data.fast_growing_categories.length > 0 && (
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/30 sm:p-6">
          <div className="mb-5">
            <h3 className="flex items-center gap-2 text-xl font-black sm:text-2xl">
              <FaTags className="text-cyan-300" /> Fast Growing Categories
            </h3>
            <p className="mt-1 text-sm text-gray-400">Categories with the strongest activity change this week.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.fast_growing_categories.map((category) => (
              <Link
                key={category.slug}
                href={category.href}
                className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:border-cyan-400 hover:bg-cyan-950/20 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-2xl">
                    {category.icon || "🎮"}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-black group-hover:text-cyan-300">{category.name}</p>
                    <p className="mt-1 text-xs text-gray-400">{formatCount(category.activity_7d)} signals</p>
                  </div>
                </div>

                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">
                  {metricLabel(category.growth)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-3 text-sm font-black sm:flex sm:flex-wrap">
        <Link
          href="/sellers/leaderboard"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-5 py-3 text-yellow-300 hover:bg-yellow-400 hover:text-black"
        >
          <FaTrophy /> Seller Leaderboard
        </Link>
        <Link
          href="/search"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-5 py-3 text-cyan-300 hover:bg-cyan-400 hover:text-black"
        >
          <FaChartLine /> Marketplace Search
        </Link>
      </div>
    </section>
  );
}
