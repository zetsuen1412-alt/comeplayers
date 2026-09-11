import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type GameMasterRow = {
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

type ProductRow = {
  game_category_id: number | null;
  stock: number | string | null;
};

function numberValue(value: number | string | null | undefined) {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function calculateTrendScore(game: GameMasterRow, activeOfferCount: number) {
  const ratingScore = numberValue(game.rating) * 3;
  const metacriticScore = numberValue(game.metacritic) / 10;
  const offerScore = activeOfferCount * 8;
  const featuredScore = game.is_featured ? 50 : 0;
  const manualTrendingScore = game.is_trending ? 40 : 0;

  return Math.round(
    offerScore + featuredScore + manualTrendingScore + ratingScore + metacriticScore
  );
}

export async function GET() {
  const [gamesResult, productsResult] = await Promise.all([
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
      .select("game_category_id,stock")
      .eq("status", "active")
      .not("game_category_id", "is", null)
      .range(0, 9999),
  ]);

  if (gamesResult.error) {
    return NextResponse.json({ error: gamesResult.error.message }, { status: 500 });
  }

  if (productsResult.error) {
    return NextResponse.json({ error: productsResult.error.message }, { status: 500 });
  }

  const activeOfferCountByGameId = (productsResult.data || []).reduce(
    (map, product: ProductRow) => {
      const gameId = Number(product.game_category_id);

      if (!Number.isFinite(gameId) || gameId <= 0) return map;
      if (numberValue(product.stock) <= 0) return map;

      map.set(gameId, (map.get(gameId) || 0) + 1);
      return map;
    },
    new Map<number, number>()
  );

  const games = ((gamesResult.data || []) as GameMasterRow[])
    .map((game) => {
      const activeOfferCount = activeOfferCountByGameId.get(Number(game.id)) || 0;
      const fallbackOfferCount = numberValue(game.offer_count);
      const offerCount = activeOfferCount || fallbackOfferCount;
      const trendScore = calculateTrendScore(game, offerCount);

      return {
        ...game,
        offer_count: offerCount,
        trend_score: trendScore,
        is_trending: Boolean(game.is_trending || game.is_featured || trendScore >= 40),
      };
    })
    .sort((a, b) => {
      return (
        b.trend_score - a.trend_score ||
        Number(b.is_featured) - Number(a.is_featured) ||
        Number(b.is_trending) - Number(a.is_trending) ||
        numberValue(b.rating) - numberValue(a.rating) ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, 24);

  return NextResponse.json({ games });
}
