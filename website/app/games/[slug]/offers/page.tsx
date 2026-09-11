import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import RecentlyViewedGameTracker from "@/components/marketplace/RecentlyViewedGameTracker";
import {
  normalizeLocale,
  translate,
  type TranslationKey,
} from "@/lib/localization";
import {
  MARKETPLACE_CATEGORY_DEFINITIONS,
  canonicalMarketplaceCategory,
  type MarketplaceCategoryCode,
} from "@/lib/marketplaceTaxonomy";
import { supabase } from "@/lib/supabase";
import GameOffersClient from "./GameOffersClient";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ category?: string; server?: string; region?: string; faction?: string }>;
};

const CATEGORY_KEYS: Record<MarketplaceCategoryCode, TranslationKey> = {
  coin: "offers.category.coin",
  boosting: "offers.category.boosting",
  item: "offers.category.item",
  account: "offers.category.account",
};

const TITLE_KEYS: Record<MarketplaceCategoryCode, TranslationKey> = {
  coin: "offers.title.coin",
  boosting: "offers.title.boosting",
  item: "offers.title.item",
  account: "offers.title.account",
};

function imageFor(game: {
  background_image?: string | null;
  cover_image_url?: string | null;
  image_url?: string | null;
  name: string;
}) {
  return (
    game.background_image ||
    game.cover_image_url ||
    game.image_url ||
    `https://placehold.co/1400x800/020617/22d3ee?text=${encodeURIComponent(game.name)}`
  );
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const category = canonicalMarketplaceCategory(query.category) || "coin";
  const gameQuery = supabase
    .from("game_master")
    .select("name,slug,background_image,cover_image_url,image_url")
    .eq("slug", slug)
    .eq("status", "active")
    .eq("is_active", true)
    .maybeSingle();
  const [cookieStore, { data: game }] = await Promise.all([
    cookies(),
    gameQuery,
  ]);
  const locale = normalizeLocale(cookieStore.get("cp_locale")?.value);
  if (!game) {
    return {
      title: translate(locale, "offers.notFound"),
      robots: { index: false },
    };
  }
  const label = translate(locale, CATEGORY_KEYS[category]);
  const title = translate(locale, TITLE_KEYS[category], { game: game.name });
  return {
    title,
    description: translate(locale, "offers.metaDescription", {
      category: label,
      game: game.name,
    }),
    openGraph: { images: [{ url: imageFor(game), alt: title }] },
  };
}

export default async function GameOffersPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const activeCategory = canonicalMarketplaceCategory(query.category) || "coin";
  const selectedServer = String(query.server || "").trim();

  // Game Coin listings show the server selector first.
  // Legacy /offers?category=Game+Coins URLs are redirected to the server page.
  if (activeCategory === "coin" && !selectedServer) {
    redirect(`/games/${encodeURIComponent(slug)}?category=coin`);
  }

  const { data: game } = await supabase
    .from("game_master")
    .select("id,name,slug,background_image,cover_image_url,image_url,offer_count,rating")
    .eq("slug", slug)
    .eq("status", "active")
    .eq("is_active", true)
    .maybeSingle();
  if (!game) notFound();

  const { data: categoryRows, error } = await supabase
    .from("products")
    .select("category")
    .eq("game_category_id", Number(game.id))
    .eq("status", "active")
    .limit(5000);
  if (error) console.error("Marketplace category count failed:", error.message);

  const categoryCounts = MARKETPLACE_CATEGORY_DEFINITIONS.reduce(
    (counts, definition) => {
      counts[definition.code] = 0;
      return counts;
    },
    {} as Record<MarketplaceCategoryCode, number>
  );
  for (const row of categoryRows || []) {
    const category = canonicalMarketplaceCategory(row.category);
    if (category) categoryCounts[category] += 1;
  }

  const heroImage = imageFor(game);
  return (
    <>
      <RecentlyViewedGameTracker
        gameId={game.id}
        gameSlug={game.slug}
        gameName={game.name}
        imageUrl={heroImage}
      />
      <Suspense fallback={<main className="min-h-screen bg-[#050816]" />}>
        <GameOffersClient
          key={activeCategory}
          game={game}
          activeCategory={activeCategory}
          categoryCounts={categoryCounts}
        />
      </Suspense>
    </>
  );
}
