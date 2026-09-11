import { notFound } from "next/navigation";
import MarketplaceCategoryLanding, {
  type MarketplaceCategoryGame,
} from "@/components/marketplace/MarketplaceCategoryLanding";
import {
  canonicalMarketplaceCategory,
  marketplaceCategoryDefinition,
  normalizeMarketplaceValue,
} from "@/lib/marketplaceTaxonomy";
import { supabase } from "@/lib/supabase";

type PageProps = { params: Promise<{ slug: string }> };

type GameRow = {
  id: number;
  name: string;
  slug: string;
  image_url?: string | null;
  cover_image_url?: string | null;
  background_image?: string | null;
  is_featured?: boolean | null;
  is_trending?: boolean | null;
};

type ProductRow = {
  id: number;
  category?: string | null;
  game_category_id?: number | null;
  game_slug?: string | null;
  game_name?: string | null;
  seller_id?: string | null;
  price?: number | string | null;
  min_variant_price?: number | string | null;
};

function positivePrice(product: ProductRow) {
  const values = [product.min_variant_price, product.price]
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.min(...values) : 0;
}

export default async function MarketplaceCategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const category = canonicalMarketplaceCategory(slug);
  const definition = marketplaceCategoryDefinition(category);
  if (!category || !definition) notFound();

  const [{ data: gameRows, error: gameError }, { data: productRows, error: productError }] = await Promise.all([
    supabase
      .from("game_master")
      .select("id,name,slug,image_url,cover_image_url,background_image,is_featured,is_trending")
      .eq("status", "active")
      .eq("is_active", true)
      .limit(1500),
    supabase
      .from("products")
      .select("id,category,game_category_id,game_slug,game_name,seller_id,price,min_variant_price")
      .eq("status", "active")
      .limit(5000),
  ]);

  if (gameError) console.error("Category game query failed:", gameError.message);
  if (productError) console.error("Category product query failed:", productError.message);

  const games = (gameRows || []) as GameRow[];
  const products = (productRows || []) as ProductRow[];
  const gameById = new Map(games.map((game) => [Number(game.id), game]));
  const gameBySlug = new Map(games.map((game) => [normalizeMarketplaceValue(game.slug), game]));
  const gameByName = new Map(games.map((game) => [normalizeMarketplaceValue(game.name), game]));
  const aggregates = new Map<number, { game: GameRow; count: number; minimumPrice: number; sellers: Set<string> }>();

  for (const product of products) {
    if (canonicalMarketplaceCategory(product.category) !== category) continue;
    const game =
      (product.game_category_id ? gameById.get(Number(product.game_category_id)) : undefined) ||
      (product.game_slug ? gameBySlug.get(normalizeMarketplaceValue(product.game_slug)) : undefined) ||
      (product.game_name ? gameByName.get(normalizeMarketplaceValue(product.game_name)) : undefined);
    if (!game) continue;
    const current = aggregates.get(game.id) || { game, count: 0, minimumPrice: 0, sellers: new Set<string>() };
    current.count += 1;
    if (product.seller_id) current.sellers.add(product.seller_id);
    const price = positivePrice(product);
    if (price > 0 && (current.minimumPrice <= 0 || price < current.minimumPrice)) current.minimumPrice = price;
    aggregates.set(game.id, current);
  }

  const categoryGames: MarketplaceCategoryGame[] = Array.from(aggregates.values())
    .map(({ game, count, minimumPrice, sellers }) => ({
      id: game.id,
      name: game.name,
      slug: game.slug,
      imageUrl: game.background_image || game.cover_image_url || game.image_url || null,
      offerCount: count,
      sellerCount: sellers.size,
      minimumPrice,
      featured: Boolean(game.is_featured),
      trending: Boolean(game.is_trending),
    }))
    .sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if (a.trending !== b.trending) return a.trending ? -1 : 1;
      if (b.offerCount !== a.offerCount) return b.offerCount - a.offerCount;
      return a.name.localeCompare(b.name);
    });

  return <MarketplaceCategoryLanding category={category} title={definition.label} description={definition.description} games={categoryGames} />;
}
