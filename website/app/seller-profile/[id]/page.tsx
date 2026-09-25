"use client";
import { useLiveQuery } from '@/lib/live/use-live-query';

import { useCallback, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useCurrency } from "@/components/CurrencyProvider";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/lib/createNotification";
import { calculateSellerReputation } from "@/lib/sellerReputation";
import {
  effectivePresence,
  formatDeliveryEta,
  serviceLevelClass,
  serviceLevelDescription,
  serviceLevelLabel,
} from "@/lib/sellerServiceLevel";

type SellerProfile = {
  id: string;
  email: string | null;
  username: string | null;
  seller_name: string | null;
  seller_status: string | null;
  avatar_url: string | null;
  bio: string | null;
  discord: string | null;
  created_at: string;
  seller_presence_mode?: string | null;
  seller_last_seen_at?: string | null;
  seller_delivery_sla_minutes?: number | null;
  seller_avg_delivery_minutes?: number | string | null;
  seller_on_time_rate?: number | string | null;
  seller_total_deliveries?: number | null;
  seller_late_deliveries?: number | null;
  seller_service_level?: string | null;
  store_slug?: string | null;
  store_name?: string | null;
  store_is_published?: boolean | null;
};

type Product = {
  id: number;
  title: string | null;
  price: string | number | null;
  image_url: string | null;
  category: string | null;
  game_name: string | null;
  stock: number | null;
  status: string | null;
  created_at: string;
};

type Review = {
  id: number;
  order_id: number;
  product_id: number | null;
  seller_id: string;
  buyer_id: string;
  title?: string | null;
  rating: number;
  communication_rating?: number | null;
  delivery_rating?: number | null;
  accuracy_rating?: number | null;
  value_rating?: number | null;
  review_text: string | null;
  status?: string | null;
  is_verified_purchase?: boolean | null;
  seller_response?: string | null;
  seller_responded_at?: string | null;
  helpful_count?: number | null;
  created_at: string;
};

type Order = {
  id: number;
  seller_id: string | null;
  status: string | null;
};

type FollowRow = {
  id: number;
  follower_id: string;
  seller_id: string;
};


function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function normalizeStatus(status: string | null) {
  if (status === "Selesai") return "Completed";
  return status || "";
}

function renderStars(rating: number) {
  return "★★★★★".slice(0, rating) + "☆☆☆☆☆".slice(0, 5 - rating);
}

const PRODUCT_CATEGORY_ORDER = [
  "Game Accounts",
  "Boosting",
  "Game Coins",
  "Items",
  "Top Up",
  "Gift Cards",
  "Software",
  "Other",
];
const PRODUCT_PAGE_SIZE = 12;

function formatProductCategory(category: string | null) {
  const normalized = category?.trim().toLowerCase() || "";
  const categoryAliases: Record<string, string> = {
    account: "Game Accounts",
    accounts: "Game Accounts",
    "akun game": "Game Accounts",
    "game account": "Game Accounts",
    "game accounts": "Game Accounts",
    boosting: "Boosting",
    "jasa joki": "Boosting",
    coin: "Game Coins",
    coins: "Game Coins",
    "game coin": "Game Coins",
    "game coins": "Game Coins",
    "koin game": "Game Coins",
    item: "Items",
    items: "Items",
    topup: "Top Up",
    "top up": "Top Up",
    "gift card": "Gift Cards",
    "gift cards": "Gift Cards",
    software: "Software",
  };

  return categoryAliases[normalized] || category?.trim() || "Other";
}

export default function SellerProfileV3NotificationFollowerPage() {
  const { formatPrice } = useCurrency();
  const params = useParams();
  const sellerId = String(params.id || "");

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);

  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [followRow, setFollowRow] = useState<FollowRow | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [reviewActionId, setReviewActionId] = useState<number | null>(null);
  const [selectedProductCategory, setSelectedProductCategory] = useState<string | null>(null);
  const [visibleProductCount, setVisibleProductCount] = useState(PRODUCT_PAGE_SIZE);

  const sellerDisplayName = useMemo(() => {
    return seller?.seller_name || seller?.username || seller?.email || "Seller";
  }, [seller]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;

    const total = reviews.reduce(
      (sum, review) => sum + Number(review.rating),
      0,
    );

    return total / reviews.length;
  }, [reviews]);

  const completedOrders = useMemo(() => {
    return orders.filter(
      (order) => normalizeStatus(order.status) === "Completed",
    ).length;
  }, [orders]);

  const activeProducts = useMemo(() => {
    return products.filter((product) => product.status === "active");
  }, [products]);

  const productGroups = useMemo(() => {
    const groups = new Map<string, Product[]>();

    activeProducts.forEach((product) => {
      const category = formatProductCategory(product.category);
      const categoryProducts = groups.get(category) || [];
      categoryProducts.push(product);
      groups.set(category, categoryProducts);
    });

    return Array.from(groups.entries())
      .sort(([categoryA], [categoryB]) => {
        const orderA = PRODUCT_CATEGORY_ORDER.indexOf(categoryA);
        const orderB = PRODUCT_CATEGORY_ORDER.indexOf(categoryB);
        const rankA = orderA === -1 ? PRODUCT_CATEGORY_ORDER.length - 1 : orderA;
        const rankB = orderB === -1 ? PRODUCT_CATEGORY_ORDER.length - 1 : orderB;

        return rankA - rankB || categoryA.localeCompare(categoryB);
      })
      .map(([category, categoryProducts]) => ({
        category,
        products: [...categoryProducts].sort(
          (productA, productB) =>
            (productA.game_name || "").localeCompare(productB.game_name || "") ||
            (productA.title || "").localeCompare(productB.title || ""),
        ),
      }));
  }, [activeProducts]);

  const selectedProductGroup = useMemo(() => {
    return (
      productGroups.find((group) => group.category === selectedProductCategory) ||
      productGroups[0] ||
      null
    );
  }, [productGroups, selectedProductCategory]);

  const visibleProducts = useMemo(() => {
    return selectedProductGroup?.products.slice(0, visibleProductCount) || [];
  }, [selectedProductGroup, visibleProductCount]);

  const sellerReputation = useMemo(() => {
    return calculateSellerReputation({
      averageRating,
      reviewCount: reviews.length,
      completedOrders,
      activeProducts: activeProducts.length,
      followersCount,
      sellerStatus: seller?.seller_status || null,
    });
  }, [
    averageRating,
    reviews.length,
    completedOrders,
    activeProducts.length,
    followersCount,
    seller?.seller_status,
  ]);

  const isOwnProfile = currentUser?.id === sellerId;
  const isFollowing = Boolean(followRow);

  const loadSellerProfile = useCallback(async () => {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const loggedInUser = userData.user || null;
    setCurrentUser(loggedInUser);

    const { data: sellerData, error: sellerError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", sellerId)
      .maybeSingle();

    if (sellerError) {
      alert(sellerError.message);
      setLoading(false);
      return;
    }

    if (!sellerData) {
      setSeller(null);
      setLoading(false);
      return;
    }

    setSeller(sellerData);

    const { data: productData, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("status", "active")
      .order("id", { ascending: false });

    if (productError) {
      alert(productError.message);
      setLoading(false);
      return;
    }

    setProducts(productData || []);

    const { data: reviewData, error: reviewError } = await supabase
      .from("seller_reviews")
      .select(
        "id,order_id,product_id,seller_id,buyer_id,rating,review_text,created_at"
      )
      .eq("seller_id", sellerId)
      .order("id", { ascending: false });

    if (reviewError) {
      console.error("Seller reviews load failed:", reviewError.message);
    }

    setReviews(reviewData || []);

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id,seller_id,status")
      .eq("seller_id", sellerId);

    if (orderError) {
      alert(orderError.message);
      setLoading(false);
      return;
    }

    setOrders(orderData || []);

    const { count: followerCountResult } = await supabase
      .from("seller_followers")
      .select("*", { count: "exact", head: true })
      .eq("seller_id", sellerId);

    setFollowersCount(followerCountResult || 0);

    if (loggedInUser && loggedInUser.id !== sellerId) {
      const { data: followData } = await supabase
        .from("seller_followers")
        .select("id,follower_id,seller_id")
        .eq("follower_id", loggedInUser.id)
        .eq("seller_id", sellerId)
        .maybeSingle();

      setFollowRow(followData || null);
    }

    setLoading(false);
  }, [sellerId]);

  useLiveQuery(() => {
    if (sellerId) {
      // Loading is intentionally tied to the dynamic seller route.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadSellerProfile();
    }
  }, [loadSellerProfile, sellerId], { topics: 'catalog,account' });

  async function toggleHelpful(reviewId: number) {
    if (!currentUser) {
      alert("Please login before voting on a review.");
      return;
    }

    setReviewActionId(reviewId);
    try {
      const result = await authenticatedFetchJson<{
        helpful: boolean;
        helpfulCount: number;
      }>(`/api/reviews/${reviewId}/helpful`, { method: "POST" });

      setReviews((current) =>
        current.map((review) =>
          review.id === reviewId
            ? { ...review, helpful_count: result.helpfulCount }
            : review
        )
      );
      alert(result.helpful ? "Marked as helpful." : "Helpful vote removed.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to vote on review.");
    } finally {
      setReviewActionId(null);
    }
  }

  async function reportReview(reviewId: number) {
    if (!currentUser) {
      alert("Please login before reporting a review.");
      return;
    }

    const reason = window.prompt(
      "Report reason: spam, abusive, personal_information, fake_review, off_platform_contact, or other"
    );
    if (!reason) return;
    const details = window.prompt("Add optional details (maximum 500 characters):") || "";

    setReviewActionId(reviewId);
    try {
      await authenticatedFetchJson(`/api/reviews/${reviewId}/report`, {
        method: "POST",
        body: JSON.stringify({ reason, details }),
      });
      alert("Review report submitted to ComePlayers moderation.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to report review.");
    } finally {
      setReviewActionId(null);
    }
  }

  async function toggleFollow() {
    if (!currentUser) {
      alert("Please login before following seller.");
      window.location.href = "/";
      return;
    }

    if (currentUser.id === sellerId) {
      alert("You cannot follow your own seller profile.");
      return;
    }

    setFollowLoading(true);

    if (followRow) {
      const { error } = await supabase
        .from("seller_followers")
        .delete()
        .eq("id", followRow.id)
        .eq("follower_id", currentUser.id);

      if (error) {
        alert(error.message);
        setFollowLoading(false);
        return;
      }

      setFollowRow(null);
      setFollowersCount((value) => Math.max(value - 1, 0));
      setFollowLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("seller_followers")
      .insert({
        follower_id: currentUser.id,
        seller_id: sellerId,
      })
      .select("id,follower_id,seller_id")
      .single();

    if (error) {
      alert(error.message);
      setFollowLoading(false);
      return;
    }

    setFollowRow(data);
    setFollowersCount((value) => value + 1);

    await createNotification({
      userId: sellerId,
      type: "follower",
      title: "New Follower",
      message: `${
        currentUser.email || "A buyer"
      } started following your seller profile.`,
      linkUrl: "/seller/followers",
    });

    setFollowLoading(false);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">
          Loading seller profile...
        </p>
      </main>
    );
  }

  if (!seller) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-black text-red-300">Seller Not Found</h1>

          <Link
            href="/"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-6 font-black text-black hover:bg-cyan-300"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  const roundedRating =
    averageRating > 0 ? Math.round(averageRating * 10) / 10 : 0;
  const sellerPresence = effectivePresence(
    seller.seller_presence_mode,
    seller.seller_last_seen_at
  );
  const sellerServiceLevel = serviceLevelLabel(seller.seller_service_level);

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <section className="border-b border-white/10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
                {seller.avatar_url ? (
                  <Image
                    src={seller.avatar_url}
                    alt={sellerDisplayName}
                    fill
                    sizes="80px"
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <span className="text-3xl font-black text-cyan-300">
                    {sellerDisplayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
                  Seller profile
                </p>
                <h1 className="mt-1 truncate text-3xl font-black sm:text-4xl">
                  {sellerDisplayName}
                </h1>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
                    {seller.seller_status === "approved" ? "Verified" : "Seller"}
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-bold capitalize ${
                      sellerPresence === "online"
                        ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                        : sellerPresence === "away"
                          ? "border-yellow-400/20 bg-yellow-400/10 text-yellow-300"
                          : "border-slate-400/20 bg-slate-400/10 text-slate-300"
                    }`}
                  >
                    {sellerPresence}
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${serviceLevelClass(
                      seller.seller_service_level
                    )}`}
                  >
                    {sellerServiceLevel} service
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${sellerReputation.colorClass}`}
                  >
                    {sellerReputation.badge} {sellerReputation.tierLabel} · {sellerReputation.score}/100
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                {!isOwnProfile && (
                  <button
                    type="button"
                    onClick={toggleFollow}
                    disabled={followLoading}
                    className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-bold transition disabled:opacity-60 ${
                      isFollowing
                        ? "bg-emerald-400 text-black hover:bg-emerald-300"
                        : "border border-emerald-400/50 text-emerald-300 hover:bg-emerald-400 hover:text-black"
                    }`}
                  >
                    {followLoading
                      ? "Updating..."
                      : isFollowing
                        ? "✓ Following"
                        : "+ Follow"}
                  </button>
                )}

                {seller.store_slug && seller.store_is_published !== false && (
                  <Link
                    href={`/store/${seller.store_slug}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-cyan-400 px-4 text-sm font-bold text-black transition hover:bg-cyan-300"
                  >
                    Storefront
                  </Link>
                )}

                <Link
                  href="/following"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-bold text-gray-300 transition hover:border-cyan-400/50 hover:text-cyan-300"
                >
                  Following
                </Link>
              </div>
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="max-w-3xl text-sm leading-6 text-gray-300">
                {seller.bio ||
                  "Trusted ComePlayers seller offering gaming products and services."}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>Joined {formatDate(seller.created_at)}</span>
                {seller.discord && <span>Discord: {seller.discord}</span>}
                <span>{serviceLevelDescription(seller.seller_service_level)}</span>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-black/20 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Rating", `${roundedRating || "0.0"} / 5`],
                ["Reviews", reviews.length],
                ["Completed", completedOrders],
                ["Products", activeProducts.length],
                ["Followers", followersCount],
                ["Delivery", formatDeliveryEta(seller.seller_delivery_sla_minutes || 60)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="border-b border-r border-white/10 p-3 last:border-r-0 sm:p-4 lg:border-b-0"
                >
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="mt-1 text-base font-black text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
                Catalog
              </p>
              <h2 className="mt-1 text-2xl font-black">Seller products</h2>
            </div>
            <p className="text-sm text-gray-500">
              {activeProducts.length} active {activeProducts.length === 1 ? "product" : "products"}
            </p>
          </div>

          {productGroups.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-white/15 px-5 py-12 text-center text-sm text-gray-400">
              No active products.
            </div>
          ) : (
            <div className="mt-5">
              <div
                className="flex gap-2 overflow-x-auto pb-2"
                aria-label="Product categories"
              >
                {productGroups.map((group) => {
                  const isSelected = selectedProductGroup?.category === group.category;

                  return (
                    <button
                      key={group.category}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelectedProductCategory(group.category);
                        setVisibleProductCount(PRODUCT_PAGE_SIZE);
                      }}
                      className={`shrink-0 rounded-xl border px-3.5 py-2 text-sm font-bold transition ${
                        isSelected
                          ? "border-cyan-400 bg-cyan-400 text-black"
                          : "border-white/10 bg-white/[0.035] text-gray-400 hover:border-cyan-400/40 hover:text-cyan-300"
                      }`}
                    >
                      {group.category}
                      <span className="ml-2 opacity-70">{group.products.length}</span>
                    </button>
                  );
                })}
              </div>

              {selectedProductGroup && (
                <div className="mt-5">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h3 className="text-lg font-black">
                      {selectedProductGroup.category}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Showing {visibleProducts.length} of {selectedProductGroup.products.length}
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleProducts.map((product) => (
                      <Link
                        key={product.id}
                        href={`/product/${product.id}`}
                        className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] transition hover:border-cyan-400/50 hover:bg-white/[0.055]"
                      >
                        <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-black/40">
                          {product.image_url ? (
                            <Image
                              src={product.image_url}
                              alt={product.title || "Product"}
                              fill
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                              unoptimized
                              className="object-cover transition duration-300 group-hover:scale-[1.02]"
                            />
                          ) : (
                            <span className="text-4xl" aria-hidden="true">🎮</span>
                          )}
                        </div>

                        <div className="p-4">
                          <p className="truncate text-xs font-bold text-cyan-300">
                            {product.game_name || "Game"}
                          </p>
                          <h4 className="mt-1 line-clamp-2 min-h-12 text-base font-black leading-6 group-hover:text-cyan-300">
                            {product.title || "Untitled Product"}
                          </h4>
                          <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/10 pt-3">
                            <p className="text-xl font-black text-cyan-300">
                              {formatPrice(product.price)}
                            </p>
                            <p className="text-xs text-gray-500">
                              Stock {product.stock || 0}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>

                  {visibleProducts.length < selectedProductGroup.products.length && (
                    <div className="mt-6 flex justify-center">
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleProductCount((count) => count + PRODUCT_PAGE_SIZE)
                        }
                        className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-bold text-gray-300 transition hover:border-cyan-400/50 hover:text-cyan-300"
                      >
                        Show more
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="mt-10 border-t border-white/10 pt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-yellow-300">
                Feedback
              </p>
              <h2 className="mt-1 text-2xl font-black">Reviews</h2>
            </div>
            <p className="text-sm text-gray-500">
              {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
            </p>
          </div>

          {reviews.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-white/15 px-5 py-10 text-center text-sm text-gray-400">
              No reviews yet.
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {reviews.slice(0, 8).map((review) => (
                <article
                  key={review.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-black text-yellow-300">
                      {renderStars(review.rating)}
                    </p>
                    <time className="text-xs text-gray-500">
                      {formatDate(review.created_at)}
                    </time>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {review.is_verified_purchase ? (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                        Verified purchase
                      </span>
                    ) : null}
                    <span className="text-xs text-gray-500">
                      Order #{review.order_id}
                    </span>
                  </div>

                  {review.title ? (
                    <h3 className="mt-3 font-black">{review.title}</h3>
                  ) : null}

                  <p className="mt-2 text-sm leading-6 text-gray-300">
                    {review.review_text || "No written review."}
                  </p>

                  {review.seller_response ? (
                    <div className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                        Seller response
                      </p>
                      <p className="mt-2 text-sm leading-6 text-gray-300">
                        {review.seller_response}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleHelpful(review.id)}
                      disabled={reviewActionId === review.id}
                      className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-gray-400 hover:border-cyan-400/40 hover:text-cyan-300 disabled:opacity-50"
                    >
                      Helpful ({Number(review.helpful_count || 0)})
                    </button>
                    <button
                      type="button"
                      onClick={() => reportReview(review.id)}
                      disabled={reviewActionId === review.id}
                      className="rounded-lg px-3 py-2 text-xs font-bold text-red-300/80 hover:bg-red-400/10 disabled:opacity-50"
                    >
                      Report
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
