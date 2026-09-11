"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FaBoxOpen,
  FaChartLine,
  FaShieldAlt,
  FaStar,
  FaStore,
  FaTrophy,
} from "react-icons/fa";

type FeaturedSeller = {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  average_rating: number;
  review_count: number;
  completed_orders: number;
  active_products: number;
  conversion_rate: number;
  featured_score: number;
  is_featured: boolean;
};

type FeaturedSellersProps = {
  title?: string;
  subtitle?: string;
  gameSlug?: string;
  limit?: number;
  compact?: boolean;
};

function formatCount(value: number | null | undefined) {
  return new Intl.NumberFormat("id-ID", {
    notation: Number(value || 0) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function formatRating(value: number | null | undefined) {
  if (!value) return "New";
  return Number(value).toFixed(1);
}

function sellerInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "S";
}

export default function FeaturedSellers({
  title = "Featured Sellers",
  subtitle = "Top marketplace sellers ranked by orders, reviews, listings, and buyer conversion.",
  gameSlug,
  limit = 8,
  compact = false,
}: FeaturedSellersProps) {
  const [sellers, setSellers] = useState<FeaturedSeller[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadFeaturedSellers() {
      setLoading(true);

      try {
        const params = new URLSearchParams({ limit: String(limit) });

        if (gameSlug) {
          params.set("game", gameSlug);
        }

        const response = await fetch(
          `/api/sellers/featured?${params.toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error || "Failed to load featured sellers.");
        }

        setSellers(Array.isArray(json.sellers) ? json.sellers : []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Load featured sellers failed:", error);
          setSellers([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadFeaturedSellers();

    return () => controller.abort();
  }, [gameSlug, limit]);

  if (loading) {
    return (
      <section className="px-8 pb-16">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-slate-400">
          Loading featured sellers...
        </div>
      </section>
    );
  }

  if (sellers.length === 0) return null;

  return (
    <section className={compact ? "" : "px-8 pb-16"}>
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-xs font-black text-yellow-300">
            <FaTrophy /> Seller Ranking
          </p>

          <h2 className="mt-4 text-4xl font-black">{title}</h2>

          <p className="mt-2 max-w-2xl text-gray-300">{subtitle}</p>
        </div>

        <Link
          href="/sellers/leaderboard"
          className="font-black text-cyan-300 hover:text-cyan-200"
        >
          View leaderboard →
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {sellers.map((seller, index) => (
          <Link
            key={seller.id}
            href={`/seller-profile/${seller.id}`}
            className="group rounded-3xl border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/30 transition hover:-translate-y-1 hover:border-yellow-400 hover:bg-yellow-950/10"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-cyan-400/10 bg-cover bg-center text-xl font-black text-cyan-300"
                  style={
                    seller.avatar_url
                      ? { backgroundImage: `url(${seller.avatar_url})` }
                      : undefined
                  }
                >
                  {!seller.avatar_url && sellerInitial(seller.name)}
                </div>

                <div className="min-w-0">
                  <h3 className="truncate text-lg font-black group-hover:text-yellow-300">
                    {seller.name}
                  </h3>

                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-emerald-300">
                    <FaShieldAlt /> Verified marketplace seller
                  </p>
                </div>
              </div>

              <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-xs font-black text-yellow-300">
                #{index + 1}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                <p className="text-xs text-slate-400">Rating</p>

                <p className="mt-1 flex items-center gap-1 font-black text-yellow-300">
                  <FaStar /> {formatRating(seller.average_rating)}
                </p>

                <p className="mt-1 text-xs text-yellow-100/70">
                  {formatCount(seller.review_count)} reviews
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                <p className="text-xs text-slate-400">Orders</p>

                <p className="mt-1 font-black text-emerald-300">
                  {formatCount(seller.completed_orders)}
                </p>

                <p className="mt-1 text-xs text-emerald-100/70">completed</p>
              </div>

              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3">
                <p className="text-xs text-slate-400">Listings</p>

                <p className="mt-1 flex items-center gap-1 font-black text-cyan-300">
                  <FaBoxOpen /> {formatCount(seller.active_products)}
                </p>
              </div>

              <div className="rounded-2xl border border-purple-400/20 bg-purple-400/10 p-3">
                <p className="text-xs text-slate-400">Conversion</p>

                <p className="mt-1 flex items-center gap-1 font-black text-purple-300">
                  <FaChartLine />{" "}
                  {seller.conversion_rate
                    ? `${seller.conversion_rate}%`
                    : "New"}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-black">
              <span className="inline-flex items-center gap-2 text-white">
                <FaStore className="text-cyan-300" /> View Store
              </span>

              <span className="text-cyan-300">→</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}