import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import GameCategoryServerBrowser from "@/components/marketplace/GameCategoryServerBrowser";
import GameMarketplaceCategoryTabs from "@/components/marketplace/GameMarketplaceCategoryTabs";
import MarketplaceBreadcrumbs from "@/components/marketplace/MarketplaceBreadcrumbs";
import RecentlyViewedGameTracker from "@/components/marketplace/RecentlyViewedGameTracker";
import {
  MARKETPLACE_CATEGORY_DEFINITIONS,
  canonicalMarketplaceCategory,
  type MarketplaceCategoryCode,
} from "@/lib/marketplaceTaxonomy";
import {
  groupCoinServers,
  type MarketplaceServerProduct,
  type MarketplaceServerVariant,
} from "@/lib/marketplaceServerGrouping";
import { supabase } from "@/lib/supabase";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ category?: string }>;
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
    `https://placehold.co/1400x800/050505/facc15?text=${encodeURIComponent(game.name)}`
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { data: game } = await supabase
    .from("game_master")
    .select("name,slug,background_image,cover_image_url,image_url")
    .eq("slug", slug)
    .eq("status", "active")
    .eq("is_active", true)
    .maybeSingle();

  if (!game) return { title: "Game not found | ComePlayers", robots: { index: false } };
  return {
    title: `${game.name} Coins | ComePlayers`,
    description: `Select a server, region, and faction to compare ${game.name} Game Coin sellers.`,
    alternates: { canonical: `/games/${game.slug}?category=coin` },
    openGraph: { images: [{ url: imageFor(game), alt: game.name }] },
  };
}

export default async function GameDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const selected = canonicalMarketplaceCategory(query.category) || "coin";
  if (selected !== "coin") {
    redirect(`/games/${encodeURIComponent(slug)}/offers?category=${selected}`);
  }

  const { data: game } = await supabase
    .from("game_master")
    .select("id,name,slug,image_url,cover_image_url,background_image,offer_count,rating")
    .eq("slug", slug)
    .eq("status", "active")
    .eq("is_active", true)
    .maybeSingle();
  if (!game) notFound();

  const { data: productRows, error: productError } = await supabase
    .from("products")
    .select(
      "id,category,seller_id,offer_server,offer_region,offer_platform,offer_faction,price,min_variant_price,stock"
    )
    .eq("game_category_id", Number(game.id))
    .eq("status", "active")
    .limit(2500);

  if (productError) {
    console.error("Game marketplace products failed:", productError.message);
  }

  const products = (productRows || []) as MarketplaceServerProduct[];
  const productIds = products.map((product) => Number(product.id)).filter(Number.isFinite);
  const { data: variantRows, error: variantError } = productIds.length
    ? await supabase
        .from("product_variants")
        .select("product_id,attributes,price,stock,status")
        .in("product_id", productIds)
        .eq("status", "active")
        .limit(5000)
    : { data: [], error: null };

  if (variantError) console.error("Game marketplace variants failed:", variantError.message);
  const variants = (variantRows || []) as MarketplaceServerVariant[];

  const categoryCounts = MARKETPLACE_CATEGORY_DEFINITIONS.reduce(
    (counts, definition) => {
      counts[definition.code] = 0;
      return counts;
    },
    {} as Record<MarketplaceCategoryCode, number>
  );
  for (const product of products) {
    const category = canonicalMarketplaceCategory(product.category);
    if (category) categoryCounts[category] += 1;
  }

  // A generic game link should open an available category instead of an empty coin tab.
  if (!query.category && categoryCounts.coin === 0) {
    const availableCategory = MARKETPLACE_CATEGORY_DEFINITIONS
      .filter(definition => categoryCounts[definition.code] > 0)
      .sort((a, b) => categoryCounts[b.code] - categoryCounts[a.code])[0];
    if (availableCategory) redirect(`/games/${encodeURIComponent(slug)}/offers?category=${availableCategory.code}`);
  }
  const servers = groupCoinServers(products, variants);
  const heroImage = imageFor(game);

  return (
    <main className="min-h-screen border-b border-yellow-500/40 bg-[#07090c] text-white">
      <RecentlyViewedGameTracker
        gameId={game.id}
        gameSlug={game.slug}
        gameName={game.name}
        imageUrl={heroImage}
      />

      <section className="mx-auto max-w-[1540px] px-4 pb-12 pt-8 md:px-8 md:pb-14 md:pt-10">
        <MarketplaceBreadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Game Coins", href: "/categories/game-coins" },
            { label: game.name },
          ]}
        />

        <div className="mt-7">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-400">
            Game Coins
          </p>
          <h1 className="mt-3 max-w-6xl text-3xl font-black leading-tight md:text-5xl">
            {game.name}
          </h1>
          <p className="mt-3 max-w-3xl text-base text-slate-400 md:text-lg">
            Select a server, region, and faction before viewing the seller list.
          </p>
        </div>

        <div className="mt-8">
          <GameMarketplaceCategoryTabs
            gameSlug={game.slug}
            activeCategory="coin"
            counts={categoryCounts}
          />
        </div>

        <Suspense
          fallback={
            <div className="mt-7 h-64 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]" />
          }
        >
          <GameCategoryServerBrowser gameSlug={game.slug} servers={servers} />
        </Suspense>
      </section>
    </main>
  );
}
