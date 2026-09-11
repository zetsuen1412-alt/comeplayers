"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCurrency } from "@/components/CurrencyProvider";
import { calculateSellerReputation } from "@/lib/sellerReputation";
import { supabase } from "@/lib/supabase";

type SellerProfile = {
  id: string;
  email: string | null;
  username: string | null;
  seller_name: string | null;
  seller_status: string | null;
  avatar_url: string | null;
  bio: string | null;
  seller_rating?: string | number | null;
  seller_review_count?: string | number | null;
  created_at?: string | null;
};

type SellerReview = {
  id: number;
  seller_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
};

type Order = {
  id: number;
  seller_id: string | null;
  product: string | null;
  price: string | number | null;
  total_price: string | number | null;
  status: string | null;
  created_at: string;
};

type LeaderboardSeller = {
  profile: SellerProfile;
  averageRating: number;
  reviewCount: number;
  completedOrders: number;
  totalRevenue: number;
  score: number;
};

type SortMode = "reputation" | "rating" | "reviews" | "orders" | "revenue";

function normalizeStatus(status: string | null) {
  if (status === "pending") return "Pending Payment";
  if (status === "pending_payment") return "Pending Payment";
  if (status === "Menunggu Pembayaran") return "Pending Payment";
  if (status === "Menunggu Cek Pembayaran") return "Payment Verification";
  if (status === "Diproses") return "Processing";
  if (status === "Selesai") return "Completed";
  if (status === "Dibatalkan") return "Cancelled";

  return status || "Pending Payment";
}

function renderStars(rating: number) {
  const safeRating = Math.max(0, Math.min(5, Math.round(rating)));

  return "★★★★★"
    .split("")
    .map((star, index) => (index < safeRating ? "★" : "☆"))
    .join("");
}

function getSellerName(profile: SellerProfile) {
  return (
    profile.seller_name || profile.username || profile.email || "Unknown Seller"
  );
}

function getRankBadge(index: number) {
  if (index === 0) return "🏆 #1";
  if (index === 1) return "🥈 #2";
  if (index === 2) return "🥉 #3";

  return `#${index + 1}`;
}

function getRankClass(index: number) {
  if (index === 0) {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-300";
  }

  if (index === 1) {
    return "border-gray-300/30 bg-gray-300/10 text-gray-200";
  }

  if (index === 2) {
    return "border-orange-400/30 bg-orange-400/10 text-orange-300";
  }

  return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
}

export default function SellerLeaderboardPage() {
  const { formatPrice, currency } = useCurrency();

  const [sellers, setSellers] = useState<LeaderboardSeller[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("reputation");
  const [search, setSearch] = useState("");

  const filteredSellers = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = sellers.filter((item) => {
      const name = getSellerName(item.profile).toLowerCase();
      const email = (item.profile.email || "").toLowerCase();
      const bio = (item.profile.bio || "").toLowerCase();

      return (
        !query ||
        name.includes(query) ||
        email.includes(query) ||
        bio.includes(query)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === "reputation") {
        return (
          b.score - a.score ||
          b.averageRating - a.averageRating ||
          b.completedOrders - a.completedOrders ||
          b.reviewCount - a.reviewCount
        );
      }

      if (sortMode === "rating") {
        return (
          b.averageRating - a.averageRating ||
          b.reviewCount - a.reviewCount ||
          b.completedOrders - a.completedOrders ||
          b.totalRevenue - a.totalRevenue
        );
      }

      if (sortMode === "reviews") {
        return (
          b.reviewCount - a.reviewCount ||
          b.averageRating - a.averageRating ||
          b.completedOrders - a.completedOrders
        );
      }

      if (sortMode === "orders") {
        return (
          b.completedOrders - a.completedOrders ||
          b.averageRating - a.averageRating ||
          b.reviewCount - a.reviewCount
        );
      }

      return (
        b.totalRevenue - a.totalRevenue ||
        b.completedOrders - a.completedOrders ||
        b.averageRating - a.averageRating
      );
    });
  }, [sellers, sortMode, search]);

  const topSeller = filteredSellers[0] || null;

  const totalCompletedOrders = useMemo(() => {
    return sellers.reduce((sum, seller) => sum + seller.completedOrders, 0);
  }, [sellers]);

  const totalReviews = useMemo(() => {
    return sellers.reduce((sum, seller) => sum + seller.reviewCount, 0);
  }, [sellers]);

  const totalRevenue = useMemo(() => {
    return sellers.reduce((sum, seller) => sum + seller.totalRevenue, 0);
  }, [sellers]);

  useEffect(() => {
    async function loadLeaderboard() {
      setLoading(true);

      const [profilesResult, reviewsResult, ordersResult] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id,email,username,seller_name,seller_status,avatar_url,bio,seller_rating,seller_review_count,created_at"
          )
          .eq("seller_status", "approved"),
        supabase
          .from("seller_reviews")
          .select("id,seller_id,rating,review_text,created_at"),
        supabase
          .from("orders")
          .select("id,seller_id,product,price,total_price,status,created_at"),
      ]);

      if (profilesResult.error) {
        alert(profilesResult.error.message);
        setLoading(false);
        return;
      }

      if (reviewsResult.error) {
        alert(reviewsResult.error.message);
        setLoading(false);
        return;
      }

      if (ordersResult.error) {
        alert(ordersResult.error.message);
        setLoading(false);
        return;
      }

      const profiles = (profilesResult.data || []) as SellerProfile[];
      const reviews = (reviewsResult.data || []) as SellerReview[];
      const orders = (ordersResult.data || []) as Order[];

      const leaderboard = profiles.map((profile) => {
        const sellerReviews = reviews.filter(
          (review) => review.seller_id === profile.id
        );

        const reviewCount =
          sellerReviews.length || Number(profile.seller_review_count || 0);

        const averageRating =
          sellerReviews.length > 0
            ? sellerReviews.reduce(
                (sum, review) => sum + Number(review.rating || 0),
                0
              ) / sellerReviews.length
            : Number(profile.seller_rating || 0);

        const completedOrders = orders.filter(
          (order) =>
            order.seller_id === profile.id &&
            normalizeStatus(order.status) === "Completed"
        );

        const totalRevenue = completedOrders.reduce(
          (sum, order) => sum + Number(order.total_price || order.price || 0),
          0
        );

        const reputation = calculateSellerReputation({
          averageRating,
          reviewCount,
          completedOrders: completedOrders.length,
          activeProducts: 0,
          followersCount: 0,
          sellerStatus: profile.seller_status,
        });

        return {
          profile,
          averageRating,
          reviewCount,
          completedOrders: completedOrders.length,
          totalRevenue,
          score: reputation.score,
        };
      });

      setSellers(
        leaderboard.sort(
          (a, b) =>
            b.score - a.score ||
            b.averageRating - a.averageRating ||
            b.completedOrders - a.completedOrders ||
            b.reviewCount - a.reviewCount
        )
      );

      setLoading(false);
    }

    loadLeaderboard();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading seller leaderboard...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-8 py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,211,238,.16),transparent_34%)]" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <div className="mb-4 flex flex-wrap gap-3">
              <p className="inline-flex rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-sm font-black text-yellow-300">
                Seller Leaderboard
              </p>

              <p className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
                Display: {currency}
              </p>
            </div>

            <h1 className="text-5xl font-black md:text-7xl">Top Sellers</h1>

            <p className="mt-5 max-w-3xl text-gray-300">
              Discover the best ComePlayers sellers based on rating, reviews,
              completed orders, and marketplace revenue.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-400 px-6 font-bold text-cyan-300 transition hover:bg-cyan-400 hover:text-black"
            >
              Browse Marketplace
            </Link>

            <Link
              href="/seller"
              className="inline-flex h-12 items-center justify-center rounded-full border border-yellow-400 px-6 font-bold text-yellow-300 transition hover:bg-yellow-400 hover:text-black"
            >
              Seller Dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-6">
            <p className="text-sm text-gray-300">Approved Sellers</p>
            <p className="mt-2 text-4xl font-black text-yellow-300">
              {sellers.length}
            </p>
          </div>

          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-6">
            <p className="text-sm text-gray-300">Total Reviews</p>
            <p className="mt-2 text-4xl font-black text-cyan-300">
              {totalReviews}
            </p>
          </div>

          <div className="rounded-3xl border border-green-400/20 bg-green-400/10 p-6">
            <p className="text-sm text-gray-300">Completed Orders</p>
            <p className="mt-2 text-4xl font-black text-green-300">
              {totalCompletedOrders}
            </p>
          </div>

          <div className="rounded-3xl border border-purple-400/20 bg-purple-400/10 p-6">
            <p className="text-sm text-gray-300">Seller Revenue</p>
            <p className="mt-2 text-3xl font-black text-purple-300">
              {formatPrice(totalRevenue)}
            </p>
          </div>
        </div>

        {topSeller ? (
          <div className="mb-8 rounded-3xl border border-yellow-400/30 bg-yellow-400/10 p-7 shadow-2xl shadow-black/30">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div className="flex flex-col gap-5 md:flex-row md:items-center">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-yellow-400/40 bg-black/30">
                  {topSeller.profile.avatar_url ? (
                    <img
                      src={topSeller.profile.avatar_url}
                      alt={getSellerName(topSeller.profile)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl font-black text-yellow-300">
                      {getSellerName(topSeller.profile).charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                <div>
                  <p className="mb-2 inline-flex rounded-full border border-yellow-400/30 bg-black/30 px-4 py-2 text-sm font-black text-yellow-300">
                    🏆 Current #1 Seller
                  </p>

                  <h2 className="text-4xl font-black">
                    {getSellerName(topSeller.profile)}
                  </h2>

                  <p className="mt-2 max-w-2xl text-gray-300">
                    {topSeller.profile.bio ||
                      "Top ranked seller based on rating, review count, completed orders, and revenue."}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-5 lg:w-[640px]">
                <StatBox label="Score" value={Math.round(topSeller.score)} />
                <StatBox
                  label="Rating"
                  value={topSeller.averageRating.toFixed(1)}
                />
                <StatBox label="Reviews" value={topSeller.reviewCount} />
                <StatBox label="Orders" value={topSeller.completedOrders} />
                <StatBox
                  label="Revenue"
                  value={formatPrice(topSeller.totalRevenue)}
                  small
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="mb-8 grid gap-4 xl:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search seller by name, email, or bio..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
          />

          <div className="flex flex-wrap gap-3">
            {[
              { value: "reputation", label: "Best Reputation" },
              { value: "rating", label: "Top Rated" },
              { value: "reviews", label: "Most Reviews" },
              { value: "orders", label: "Most Orders" },
              { value: "revenue", label: "Highest Revenue" },
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => setSortMode(item.value as SortMode)}
                className={`rounded-full px-5 py-3 text-sm font-bold transition ${
                  sortMode === item.value
                    ? "bg-yellow-400 text-black"
                    : "border border-white/10 bg-white/[0.04] text-gray-300 hover:border-yellow-400 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {filteredSellers.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-12 text-center">
            <h2 className="text-3xl font-black">No sellers found.</h2>

            <p className="mt-3 text-gray-400">
              Approved sellers with marketplace activity will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredSellers.map((item, index) => (
              <Link
                key={item.profile.id}
                href={`/seller-profile/${item.profile.id}`}
                className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 transition hover:-translate-y-1 hover:border-yellow-400"
              >
                <div className="grid gap-6 lg:grid-cols-[1fr_520px] lg:items-center">
                  <div className="flex flex-col gap-5 md:flex-row md:items-center">
                    <div className="relative">
                      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-cyan-400/30 bg-cyan-400/10">
                        {item.profile.avatar_url ? (
                          <img
                            src={item.profile.avatar_url}
                            alt={getSellerName(item.profile)}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-3xl font-black text-cyan-300">
                            {getSellerName(item.profile)
                              .charAt(0)
                              .toUpperCase()}
                          </span>
                        )}
                      </div>

                      <span
                        className={`absolute -bottom-2 -right-3 rounded-full border px-3 py-1 text-xs font-black ${getRankClass(
                          index
                        )}`}
                      >
                        {getRankBadge(index)}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <h2 className="truncate text-3xl font-black">
                        {getSellerName(item.profile)}
                      </h2>

                      <p className="mt-2 text-yellow-300">
                        {renderStars(item.averageRating)}{" "}
                        <span className="font-black">
                          {item.averageRating.toFixed(1)}
                        </span>
                      </p>

                      <p className="mt-2 line-clamp-2 text-sm text-gray-400">
                        {item.profile.bio ||
                          "Verified ComePlayers seller with marketplace activity."}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-5">
                    <StatBox label="Score" value={Math.round(item.score)} />
                    <StatBox
                      label="Rating"
                      value={item.averageRating.toFixed(1)}
                    />
                    <StatBox label="Reviews" value={item.reviewCount} />
                    <StatBox label="Orders" value={item.completedOrders} />
                    <StatBox
                      label="Revenue"
                      value={formatPrice(item.totalRevenue)}
                      small
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function StatBox({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
      <p
        className={`font-black text-yellow-300 ${
          small ? "text-lg" : "text-2xl"
        }`}
      >
        {value}
      </p>

      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}