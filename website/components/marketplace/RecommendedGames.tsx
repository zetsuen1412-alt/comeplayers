"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FaArrowRight, FaBolt, FaGamepad, FaTags } from "react-icons/fa";
import { supabase } from "@/lib/supabase";

type GameMaster = {
  id: number;
  name: string;
  slug: string;
  image_url: string | null;
  cover_image_url: string | null;
  background_image: string | null;
  offer_count: number | null;
  is_trending: boolean | null;
  is_featured: boolean | null;
  rating: number | null;
  metacritic: number | null;
};

type ProductSignal = {
  id: number;
  game_category_id: number | null;
  game_name: string | null;
  category: string | null;
  stock: number | string | null;
  status: string | null;
};

type RecentlyViewedProduct = {
  product_id: number;
  viewed_at: string;
  products: {
    game_category_id: number | null;
    game_name: string | null;
    category: string | null;
  } | null;
};

type RecentlyViewedGame = {
  game_id: number | null;
  game_slug: string | null;
  game_name: string | null;
  viewed_at: string;
};

type RecommendedGame = GameMaster & {
  recommended_score: number;
  reason: string;
  active_offer_count: number;
};

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function numberValue(value: number | string | null | undefined) {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function incrementCounter(counter: Map<string, number>, key: string, amount = 1) {
  if (!key) return;
  counter.set(key, (counter.get(key) || 0) + amount);
}

function fallbackImage(gameName: string) {
  return `https://placehold.co/900x600/020617/22d3ee?text=${encodeURIComponent(
    gameName || "ComePlayers Game"
  )}`;
}

function gameImage(game: GameMaster) {
  return game.cover_image_url || game.background_image || game.image_url || fallbackImage(game.name);
}

export default function RecommendedGames() {
  const [games, setGames] = useState<GameMaster[]>([]);
  const [products, setProducts] = useState<ProductSignal[]>([]);
  const [recentProducts, setRecentProducts] = useState<RecentlyViewedProduct[]>([]);
  const [recentGames, setRecentGames] = useState<RecentlyViewedGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRecommendedGames() {
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      const baseRequests = [
        supabase
          .from("game_master")
          .select(
            "id,name,slug,image_url,cover_image_url,background_image,offer_count,is_trending,is_featured,rating,metacritic"
          )
          .eq("status", "active")
          .eq("is_active", true)
          .range(0, 4999),
        supabase
          .from("products")
          .select("id,game_category_id,game_name,category,stock,status")
          .eq("status", "active")
          .range(0, 9999),
      ] as const;

      const userRequests = user
        ? ([
            supabase
              .from("recently_viewed")
              .select(
                `
                product_id,
                viewed_at,
                products:product_id (
                  game_category_id,
                  game_name,
                  category
                )
              `
              )
              .eq("user_id", user.id)
              .order("viewed_at", { ascending: false })
              .limit(40),
            supabase
              .from("recently_viewed_games")
              .select("game_id,game_slug,game_name,viewed_at")
              .eq("user_id", user.id)
              .order("viewed_at", { ascending: false })
              .limit(30),
          ] as const)
        : ([] as const);

      const [gamesResult, productsResult, recentProductResult, recentGameResult] =
        await Promise.all([...baseRequests, ...userRequests]);

      if (cancelled) return;

      if (gamesResult.error) {
        console.warn("Failed to load recommended games:", gamesResult.error.message);
        setGames([]);
      } else {
        setGames((gamesResult.data || []) as GameMaster[]);
      }

      if (productsResult.error) {
        console.warn("Failed to load game offer signals:", productsResult.error.message);
        setProducts([]);
      } else {
        setProducts((productsResult.data || []) as ProductSignal[]);
      }

      if (recentProductResult && "error" in recentProductResult && recentProductResult.error) {
        console.warn("Failed to load viewed product game signals:", recentProductResult.error.message);
        setRecentProducts([]);
      } else if (recentProductResult && "data" in recentProductResult) {
        setRecentProducts((recentProductResult.data || []) as unknown as RecentlyViewedProduct[]);
      } else {
        setRecentProducts([]);
      }

      if (recentGameResult && "error" in recentGameResult && recentGameResult.error) {
        console.warn("Failed to load viewed game signals:", recentGameResult.error.message);
        setRecentGames([]);
      } else if (recentGameResult && "data" in recentGameResult) {
        setRecentGames((recentGameResult.data || []) as RecentlyViewedGame[]);
      } else {
        setRecentGames([]);
      }

      setLoading(false);
    }

    loadRecommendedGames();

    return () => {
      cancelled = true;
    };
  }, []);

  const recommendations = useMemo(() => {
    const activeOfferCountByGameId = new Map<number, number>();
    const categorySignalByGameId = new Map<number, Map<string, number>>();
    const gameNameToGameId = new Map<string, number>();
    const viewedGameIds = new Set<number>();
    const viewedGameSlugCounter = new Map<string, number>();
    const viewedGameNameCounter = new Map<string, number>();
    const categoryInterestCounter = new Map<string, number>();

    for (const game of games) {
      gameNameToGameId.set(normalize(game.name), game.id);
    }

    products.forEach((product) => {
      const gameId = Number(product.game_category_id);
      if (!Number.isFinite(gameId) || gameId <= 0) return;
      if (numberValue(product.stock) <= 0) return;

      activeOfferCountByGameId.set(gameId, (activeOfferCountByGameId.get(gameId) || 0) + 1);

      const categoryKey = normalize(product.category);
      if (!categoryKey) return;

      const categoryMap = categorySignalByGameId.get(gameId) || new Map<string, number>();
      categoryMap.set(categoryKey, (categoryMap.get(categoryKey) || 0) + 1);
      categorySignalByGameId.set(gameId, categoryMap);
    });

    recentGames.forEach((game, index) => {
      const weight = Math.max(1, 8 - Math.floor(index / 3));
      const gameId = Number(game.game_id);

      if (Number.isFinite(gameId) && gameId > 0) {
        viewedGameIds.add(gameId);
      }

      incrementCounter(viewedGameSlugCounter, normalize(game.game_slug), weight);
      incrementCounter(viewedGameNameCounter, normalize(game.game_name), weight);
    });

    recentProducts.forEach((row, index) => {
      const product = row.products;
      if (!product) return;

      const weight = Math.max(1, 7 - Math.floor(index / 4));
      const gameId = Number(product.game_category_id);

      if (Number.isFinite(gameId) && gameId > 0) {
        viewedGameIds.add(gameId);
      }

      incrementCounter(viewedGameNameCounter, normalize(product.game_name), weight);
      incrementCounter(categoryInterestCounter, normalize(product.category), weight);
    });

    return games
      .map((game) => {
        const activeOfferCount = activeOfferCountByGameId.get(game.id) || 0;
        const categoryMap = categorySignalByGameId.get(game.id) || new Map<string, number>();
        const categoryMatchScore = Array.from(categoryInterestCounter.entries()).reduce(
          (total, [category, weight]) => total + Math.min(categoryMap.get(category) || 0, 8) * weight * 3,
          0
        );
        const exactGameScore =
          (viewedGameIds.has(game.id) ? 80 : 0) +
          (viewedGameSlugCounter.get(normalize(game.slug)) || 0) * 12 +
          (viewedGameNameCounter.get(normalize(game.name)) || 0) * 12;
        const offerScore = Math.min(activeOfferCount, 40) * 2;
        const featuredScore = game.is_featured ? 25 : 0;
        const trendingScore = game.is_trending ? 18 : 0;
        const ratingScore = numberValue(game.rating) * 3;
        const metacriticScore = numberValue(game.metacritic) / 10;

        const recommendedScore =
          exactGameScore +
          categoryMatchScore +
          offerScore +
          featuredScore +
          trendingScore +
          ratingScore +
          metacriticScore;

        let reason = "Popular marketplace game";
        if (exactGameScore > 0) {
          reason = "Based on games and products you viewed";
        } else if (categoryMatchScore > 0) {
          reason = "Matches your favorite marketplace categories";
        } else if (game.is_featured) {
          reason = "Featured game with active offers";
        } else if (game.is_trending) {
          reason = "Trending across ComePlayers";
        } else if (activeOfferCount > 0) {
          reason = "Active offers available now";
        }

        return {
          ...game,
          active_offer_count: activeOfferCount,
          recommended_score: recommendedScore,
          reason,
        };
      })
      .filter((game) => game.recommended_score > 0)
      .sort((a, b) => {
        return (
          b.recommended_score - a.recommended_score ||
          b.active_offer_count - a.active_offer_count ||
          normalize(a.name).localeCompare(normalize(b.name))
        );
      })
      .slice(0, 8);
  }, [games, products, recentGames, recentProducts]);

  if (loading) return null;
  if (recommendations.length === 0) return null;

  return (
    <section className="relative isolate overflow-hidden px-4 pb-12 pt-3 sm:px-6 lg:px-8 lg:pb-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-20 h-[620px] bg-[radial-gradient(circle_at_84%_20%,rgba(255,196,0,0.08),transparent_27rem),radial-gradient(circle_at_22%_72%,rgba(20,241,190,0.055),transparent_31rem)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] opacity-25 [background-image:linear-gradient(rgba(255,196,0,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.028)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_94%)]"
      />

      <div className="mx-auto w-full max-w-[1760px]">
        <div className="mb-8 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="relative mb-4 inline-flex items-center gap-2.5 overflow-hidden rounded-full border border-emerald-300/35 bg-[linear-gradient(110deg,rgba(16,185,129,0.16),rgba(255,196,0,0.08))] px-5 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-emerald-200 shadow-[0_0_28px_rgba(16,185,129,0.08)] sm:text-sm">
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-1 bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.8)]"
              />
              <FaGamepad className="text-emerald-300" />
              Game Recommendations
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <h2 className="bg-[linear-gradient(180deg,#ffffff_0%,#d8dbe1_72%,#9299a5_100%)] bg-clip-text text-4xl font-black leading-none tracking-[-0.045em] text-transparent drop-shadow-[0_5px_18px_rgba(0,0,0,0.45)] sm:text-5xl lg:text-6xl">
                Recommended Games
              </h2>
              <span
                aria-hidden="true"
                className="hidden h-1 w-20 bg-[repeating-linear-gradient(115deg,#ffc400_0_9px,transparent_9px_14px)] sm:block"
              />
            </div>

            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">
              Personalized from your viewed games, product interests, and active marketplace offers.
            </p>
          </div>

          <Link
            href="/games"
            className="group relative inline-flex min-h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-md border border-[#ffc400]/75 bg-[linear-gradient(145deg,rgba(28,23,7,0.96),rgba(7,8,10,0.98))] px-7 font-black text-[#ffd64a] shadow-[0_0_0_1px_rgba(255,196,0,0.08),0_12px_34px_rgba(255,196,0,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-[#ffe275] hover:text-white hover:shadow-[0_0_28px_rgba(255,196,0,0.18)] sm:w-auto"
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-1 bg-[#ffc400] shadow-[0_0_15px_rgba(255,196,0,0.8)]"
            />
            <FaGamepad className="text-[#ffc400]" />
            Browse All Games
            <FaArrowRight className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {recommendations.map((game, index) => {
            const imageUrl = gameImage(game);
            const warmAccent = index % 4 === 0 || index % 4 === 3;

            return (
              <Link
                key={game.id}
                href={`/games/${game.slug}`}
                className={`group relative flex min-h-full flex-col overflow-hidden rounded-[24px] border bg-[linear-gradient(180deg,rgba(13,16,20,0.98),rgba(4,6,8,0.99))] shadow-[0_22px_60px_rgba(0,0,0,0.38)] transition duration-300 hover:-translate-y-1.5 ${
                  warmAccent
                    ? "border-[#b98b00]/65 hover:border-[#ffc400] hover:shadow-[0_22px_70px_rgba(255,196,0,0.12)]"
                    : "border-cyan-300/35 hover:border-emerald-300/80 hover:shadow-[0_22px_70px_rgba(45,212,191,0.12)]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-9 top-0 z-20 h-px transition-opacity duration-300 group-hover:opacity-100 ${
                    warmAccent
                      ? "bg-[linear-gradient(90deg,transparent,#ffc400,transparent)] opacity-60"
                      : "bg-[linear-gradient(90deg,transparent,#5eead4,transparent)] opacity-45"
                  }`}
                />

                <div className="relative h-52 overflow-hidden bg-black sm:h-56">
                  <Image
                    src={imageUrl}
                    alt={game.name}
                    fill
                    className="object-cover transition duration-700 group-hover:scale-[1.055]"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.06)_0%,rgba(0,0,0,0.02)_48%,rgba(4,6,8,0.96)_100%)]" />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 opacity-0 ring-1 ring-inset ring-white/10 transition-opacity duration-300 group-hover:opacity-100"
                  />

                  <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-emerald-200/50 bg-[#07120f]/90 px-3.5 py-1.5 text-xs font-black text-emerald-300 shadow-[0_8px_24px_rgba(0,0,0,0.34)] backdrop-blur-md">
                    <FaBolt className="text-emerald-300" /> Recommended
                  </span>
                </div>

                <div className="relative flex flex-1 flex-col p-5 sm:p-6">
                  <div
                    aria-hidden="true"
                    className={`absolute left-5 top-0 h-px w-20 ${
                      warmAccent
                        ? "bg-[linear-gradient(90deg,#ffc400,transparent)]"
                        : "bg-[linear-gradient(90deg,#5eead4,transparent)]"
                    }`}
                  />

                  <h3 className="line-clamp-2 min-h-[3.5rem] text-xl font-black leading-tight tracking-[-0.025em] text-slate-100 transition group-hover:text-white sm:text-2xl">
                    {game.name}
                  </h3>

                  <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-slate-400">
                    {game.reason}
                  </p>

                  <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-inner shadow-black/40">
                    <div className="flex items-center gap-3 p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-300">
                        <FaTags />
                      </span>
                      <span className="min-w-0">
                        <small className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                          Offers
                        </small>
                        <strong className="mt-0.5 block truncate text-lg font-black text-cyan-300">
                          {game.active_offer_count}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs font-black text-emerald-300 transition group-hover:text-emerald-200 sm:text-sm">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <FaTags className="shrink-0" />
                      <span className="truncate">Explore marketplace categories</span>
                    </span>
                    <FaArrowRight className="shrink-0 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
