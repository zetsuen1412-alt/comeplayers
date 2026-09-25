"use client";
import { useLiveQuery } from '@/lib/live/use-live-query';

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FaBolt, FaChartLine, FaGamepad, FaShoppingCart, FaStar } from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";

type Product = {
  id: number;
  title: string | null;
  slug: string | null;
  price: string | number | null;
  image_url: string | null;
  category: string | null;
  game_name: string | null;
  stock: number | null;
  status: string | null;
  seller_id: string | null;
  seller_name: string | null;
  seller: string | null;
  created_at: string | null;
};

type RecentlyViewedRow = {
  product_id: number;
  viewed_at: string;
  products: Product | null;
};

type RecentlyViewedGameRow = {
  game_slug: string | null;
  game_name: string | null;
  viewed_at: string;
};

type FollowRow = {
  seller_id: string;
};

type MarketplaceEventRow = {
  event_type: string | null;
  product_id: number | null;
  seller_id: string | null;
  game_name: string | null;
  category_name: string | null;
};

type InterestProduct = Product & {
  interest_score: number;
  interest_reason: string;
};

type InterestRecommendationsProps = {
  currentProductId?: number;
  compact?: boolean;
};


function fallbackImage(title: string | null) {
  return `https://placehold.co/900x600/020617/22d3ee?text=${encodeURIComponent(
    title || "ComePlayers Product"
  )}`;
}

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function incrementCounter(counter: Map<string, number>, key: string, amount = 1) {
  if (!key) return;
  counter.set(key, (counter.get(key) || 0) + amount);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export default function InterestRecommendations({
  currentProductId,
  compact = false,
}: InterestRecommendationsProps) {
  const { formatPrice } = useCurrency();
  const [recentRows, setRecentRows] = useState<RecentlyViewedRow[]>([]);
  const [recentGames, setRecentGames] = useState<RecentlyViewedGameRow[]>([]);
  const [followRows, setFollowRows] = useState<FollowRow[]>([]);
  const [events, setEvents] = useState<MarketplaceEventRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useLiveQuery((background) => {
    let cancelled = false;

    async function loadInterestRecommendations() {
      if (!background) setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        if (!cancelled) {
          setIsLoggedIn(false);
          setRecentRows([]);
          setRecentGames([]);
          setFollowRows([]);
          setEvents([]);
          setProducts([]);
          setLoading(false);
        }
        return;
      }

      setIsLoggedIn(true);

      const [recentResult, gamesResult, followResult, eventsResult, productResult] =
        await Promise.all([
          supabase
            .from("recently_viewed")
            .select(
              `
              product_id,
              viewed_at,
              products:product_id (
                id,
                title,
                slug,
                price,
                image_url,
                category,
                game_name,
                stock,
                status,
                seller_id,
                seller_name,
                seller,
                created_at
              )
            `
            )
            .eq("user_id", user.id)
            .order("viewed_at", { ascending: false })
            .limit(40),
          supabase
            .from("recently_viewed_games")
            .select("game_slug,game_name,viewed_at")
            .eq("user_id", user.id)
            .order("viewed_at", { ascending: false })
            .limit(20),
          supabase
            .from("seller_followers")
            .select("seller_id")
            .eq("follower_id", user.id)
            .order("id", { ascending: false })
            .limit(50),
          supabase
            .from("marketplace_events")
            .select("event_type,product_id,seller_id,game_name,category_name")
            .gte("created_at", daysAgo(30))
            .in("event_type", ["product_view", "checkout_start", "payment_success", "order_complete"])
            .limit(1000),
          supabase
            .from("products")
            .select(
              `
              id,
              title,
              slug,
              price,
              image_url,
              category,
              game_name,
              stock,
              status,
              seller_id,
              seller_name,
              seller,
              created_at
            `
            )
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(180),
        ]);

      if (cancelled) return;

      if (recentResult.error) {
        console.warn("Failed to load recent product interests:", recentResult.error.message);
      }

      if (gamesResult.error) {
        console.warn("Failed to load recent game interests:", gamesResult.error.message);
      }

      if (followResult.error) {
        console.warn("Failed to load followed seller interests:", followResult.error.message);
      }

      if (eventsResult.error) {
        console.warn("Failed to load marketplace interest signals:", eventsResult.error.message);
      }

      if (productResult.error) {
        console.warn("Failed to load products for interest recommendations:", productResult.error.message);
        setProducts([]);
      } else {
        setProducts((productResult.data || []) as Product[]);
      }

      setRecentRows((recentResult.data || []) as unknown as RecentlyViewedRow[]);
      setRecentGames((gamesResult.data || []) as RecentlyViewedGameRow[]);
      setFollowRows((followResult.data || []) as FollowRow[]);
      setEvents((eventsResult.data || []) as MarketplaceEventRow[]);
      setLoading(false);
    }

    loadInterestRecommendations();

    return () => {
      cancelled = true;
    };
  }, [], { topics: 'catalog,account' });

  const recommendations = useMemo(() => {
    const viewedIds = new Set<number>();
    const gameCounter = new Map<string, number>();
    const categoryCounter = new Map<string, number>();
    const followedSellerIds = new Set(followRows.map((row) => row.seller_id).filter(Boolean));
    const eventProductScore = new Map<number, number>();
    const eventGameCounter = new Map<string, number>();
    const eventCategoryCounter = new Map<string, number>();
    const eventSellerCounter = new Map<string, number>();

    recentRows.forEach((row, index) => {
      viewedIds.add(row.product_id);

      const weight = Math.max(1, 8 - Math.floor(index / 4));
      const product = row.products;

      if (!product) return;

      incrementCounter(gameCounter, normalize(product.game_name), weight);
      incrementCounter(categoryCounter, normalize(product.category), weight);
    });

    recentGames.forEach((game, index) => {
      const weight = Math.max(1, 7 - Math.floor(index / 3));
      incrementCounter(gameCounter, normalize(game.game_name), weight + 2);
    });

    for (const event of events) {
      const eventWeight =
        event.event_type === "order_complete"
          ? 18
          : event.event_type === "payment_success"
            ? 14
            : event.event_type === "checkout_start"
              ? 9
              : 3;

      if (event.product_id) {
        eventProductScore.set(event.product_id, (eventProductScore.get(event.product_id) || 0) + eventWeight);
      }

      incrementCounter(eventGameCounter, normalize(event.game_name), eventWeight);
      incrementCounter(eventCategoryCounter, normalize(event.category_name), eventWeight);
      incrementCounter(eventSellerCounter, normalize(event.seller_id), eventWeight);
    }

    return products
      .filter((product) => {
        if (product.status !== "active") return false;
        if (currentProductId && product.id === currentProductId) return false;
        if (viewedIds.has(product.id)) return false;
        return true;
      })
      .map((product) => {
        const productGame = normalize(product.game_name);
        const productCategory = normalize(product.category);
        const productSeller = normalize(product.seller_id);

        const sameGameScore = (gameCounter.get(productGame) || 0) * 50;
        const sameCategoryScore = (categoryCounter.get(productCategory) || 0) * 25;
        const followedSellerScore = product.seller_id && followedSellerIds.has(product.seller_id) ? 20 : 0;
        const trendingProductScore = Math.min(eventProductScore.get(product.id) || 0, 120) * 0.55;
        const trendingGameScore = Math.min(eventGameCounter.get(productGame) || 0, 120) * 0.12;
        const trendingCategoryScore = Math.min(eventCategoryCounter.get(productCategory) || 0, 120) * 0.12;
        const trendingSellerScore = Math.min(eventSellerCounter.get(productSeller) || 0, 120) * 0.08;
        const inStockScore = Number(product.stock ?? 1) > 0 ? 8 : -20;

        const score =
          sameGameScore +
          sameCategoryScore +
          followedSellerScore +
          trendingProductScore +
          trendingGameScore +
          trendingCategoryScore +
          trendingSellerScore +
          inStockScore;

        let reason = "Trending in the marketplace";
        if (sameGameScore > 0 && product.game_name) {
          reason = `Trending because you viewed ${product.game_name}`;
        } else if (sameCategoryScore > 0 && product.category) {
          reason = `More ${product.category} offers for your interests`;
        } else if (followedSellerScore > 0) {
          reason = "New offer from a seller you follow";
        } else if (trendingProductScore > 0) {
          reason = "High activity product this month";
        }

        return {
          ...product,
          interest_score: score,
          interest_reason: reason,
        };
      })
      .filter((product) => product.interest_score > 0)
      .sort((a, b) => b.interest_score - a.interest_score)
      .slice(0, compact ? 4 : 8);
  }, [compact, currentProductId, events, followRows, products, recentGames, recentRows]);

  if (loading) return null;
  if (!isLoggedIn) return null;
  if (recommendations.length === 0) return null;

  return (
    <section className={compact ? "mt-8" : "px-4 pb-12 sm:px-6 lg:px-8 lg:pb-16"}>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-400/10 px-4 py-2 text-sm font-black text-orange-300">
            <FaChartLine /> Personal Intelligence
          </p>

          <h2 className={compact ? "text-2xl font-black" : "text-3xl font-black sm:text-4xl"}>
            Trending In Your Interests
          </h2>

          <p className="mt-2 text-gray-300">
            Ranked from your viewed games, followed sellers, categories, and marketplace activity.
          </p>
        </div>

        {!compact ? (
          <Link
            href="/games"
            className="inline-flex w-full justify-center rounded-full border border-orange-400 px-5 py-3 font-black text-orange-300 transition hover:bg-orange-400 hover:text-black sm:w-auto"
          >
            Explore Marketplace
          </Link>
        ) : null}
      </div>

      <div className={compact ? "grid gap-4 md:grid-cols-2" : "grid gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-4"}>
        {recommendations.map((product) => {
          const productHref = `/product/${product.slug || product.id}`;
          const imageUrl = product.image_url || fallbackImage(product.title);
          const sellerName = product.seller_name || product.seller || "Verified Seller";
          const stock = Number(product.stock ?? 1);

          return (
            <Link
              key={product.id}
              href={productHref}
              className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 hover:border-orange-400 hover:bg-orange-950/20"
            >
              <div className={compact ? "relative h-36 bg-black" : "relative h-44 bg-black"}>
                <Image
                  src={imageUrl}
                  alt={product.title || "Interest recommendation"}
                  fill
                  className="object-cover transition group-hover:scale-105"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-orange-400 px-3 py-1 text-xs font-black text-black">
                  <FaBolt /> Smart Pick
                </span>
              </div>

              <div className="p-5">
                <p className="text-xs font-black text-orange-300">
                  {product.game_name || "Game Product"}
                  {product.category ? ` / ${product.category}` : ""}
                </p>

                <h3 className="mt-2 line-clamp-2 text-xl font-black group-hover:text-orange-300">
                  {product.title || "Untitled Product"}
                </h3>

                <p className="mt-3 line-clamp-2 text-sm text-gray-400">
                  {product.interest_reason}
                </p>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-2xl font-black text-cyan-300">
                    {formatPrice(product.price)}
                  </p>

                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-gray-300">
                    <FaShoppingCart /> {stock}
                  </span>
                </div>

                <p className="mt-3 inline-flex items-center gap-2 text-sm text-gray-400">
                  <FaStar className="text-yellow-300" /> {sellerName}
                </p>

                {product.game_name ? (
                  <p className="mt-2 inline-flex items-center gap-2 text-xs text-gray-500">
                    <FaGamepad className="text-orange-300" /> Personalized game signal
                  </p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
