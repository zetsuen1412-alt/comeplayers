import { NextRequest, NextResponse } from "next/server";
import {
  applyCuratedOfferCounts,
  filterCuratedMarketplaceCatalog,
  getCuratedCategoryMeta,
  getCuratedMarketplaceCatalog,
  isCuratedMarketplaceCategory,
  normalizeCategorySlug,
  paginateCuratedMarketplaceCatalog,
  type MarketplaceCatalogProduct,
} from "@/lib/marketplaceCatalog";
import { supabase } from "@/lib/supabase";

type GameMasterRow = {
  id: number;
  name: string;
  slug: string;
  first_letter: string | null;
  image_url: string | null;
  cover_image_url: string | null;
  background_image: string | null;
  offer_count: number | null;
  is_trending: boolean | null;
  is_featured: boolean | null;
  rating: number | null;
  metacritic: number | null;
};
type CategoryRow = { id: number; name: string; slug: string };
type ProductRow = { game_category_id: number | null; stock: number | string | null };

const GAME_COLUMNS = "id,name,slug,first_letter,image_url,cover_image_url,background_image,offer_count,is_trending,is_featured,rating,metacritic";

function numberValue(value: number | string | null | undefined) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}
function escapePostgrest(value: string) {
  return value.replace(/[%_,()"'\\]/g, " ").trim();
}
function positiveInteger(value: string | null, fallback: number, max: number) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}
function searchFilter(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // The view intentionally exposes only public catalog fields, not provider payloads.
  return `normalized_name.ilike.%${value.toLowerCase()}%,name.ilike.%${value}%,slug.ilike.%${slug || value}%`;
}
function normalizeGame(game: GameMasterRow) {
  return {
    ...game,
    first_letter: game.first_letter || game.name.trim().charAt(0).toUpperCase() || "#",
    offer_count: numberValue(game.offer_count),
    is_trending: Boolean(game.is_trending),
    is_featured: Boolean(game.is_featured),
    rating: numberValue(game.rating),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = positiveInteger(searchParams.get("page"), 1, 1000000);
  const limit = positiveInteger(searchParams.get("limit"), 48, 100);
  const queryText = escapePostgrest(searchParams.get("q") || "");
  const letter = String(searchParams.get("letter") || "").toUpperCase();
  const categoryValue = String(searchParams.get("category") || "").trim();
  const offset = (page - 1) * limit;
  let activeCategory: CategoryRow | null = null;

  if (categoryValue) {
    const normalizedCategory = normalizeCategorySlug(categoryValue);
    const { data: category, error: categoryError } = await supabase.from("categories")
      .select("id,name,slug")
      .or(`slug.eq.${normalizedCategory},name.ilike.%${escapePostgrest(categoryValue)}%`)
      .maybeSingle();
    if (categoryError) {
      console.error("Game category lookup failed:", categoryError.message);
      return NextResponse.json({ error: "Unable to load the selected game category." }, { status: 500 });
    }
    if (!category) {
      const meta = getCuratedCategoryMeta(normalizedCategory);
      if (meta) activeCategory = { id: 0, name: meta.name, slug: meta.slug };
      else return NextResponse.json({ games: [], count: 0, page, limit, totalPages: 0 });
    } else activeCategory = category as CategoryRow;
  }

  if (activeCategory && isCuratedMarketplaceCategory(activeCategory.slug)) {
    const catalog = getCuratedMarketplaceCatalog(activeCategory.slug);
    const productFilters = [
      `category.ilike.%${escapePostgrest(activeCategory.name)}%`,
      `category.ilike.%${escapePostgrest(activeCategory.slug)}%`,
    ];
    if (activeCategory.id > 0) productFilters.unshift(`category_id.eq.${activeCategory.id}`);
    const { data: products, error: productsError } = await supabase.from("products")
      .select("title,game_name,category,stock").eq("status", "active").or(productFilters.join(",")).range(0, 9999);
    const catalogWithCounts = productsError ? catalog : applyCuratedOfferCounts(catalog, (products || []) as MarketplaceCatalogProduct[]);
    const filteredCatalog = filterCuratedMarketplaceCatalog(catalogWithCounts, queryText, letter);
    const pagedCatalog = paginateCuratedMarketplaceCatalog(filteredCatalog, page, limit);

    // Keep the existing curated entries and append explicitly mapped local games.
    // Paginate in SQL instead of loading only the first 1,000 local rows.
    let mappedGames: GameMasterRow[] = [];
    let mappedCount = 0;
    if (activeCategory.id > 0) {
      let mappedQuery = supabase.from("game_master_marketplace_catalog")
        .select(GAME_COLUMNS, { count: "exact" }).eq("status", "active").eq("is_active", true)
        .contains("marketplace_category_ids", [activeCategory.id]);
      if (catalog.length > 0) mappedQuery = mappedQuery.not("slug", "in", `(${catalog.map((entry) => JSON.stringify(entry.slug)).join(",")})`);
      if (queryText) mappedQuery = mappedQuery.or(searchFilter(queryText));
      if (letter === "0-9") mappedQuery = mappedQuery.in("first_letter", [..."0123456789"]);
      else if (/^[A-Z]$/.test(letter)) mappedQuery = mappedQuery.eq("first_letter", letter);
      const mappedOffset = Math.max(0, offset - filteredCatalog.length);
      const capacity = Math.max(0, limit - pagedCatalog.length);
      const result = await mappedQuery.order("name").order("id")
        .range(mappedOffset, mappedOffset + Math.max(1, capacity) - 1);
      if (result.error) {
        console.error("Mapped catalog query failed:", result.error.message);
        return NextResponse.json({ error: "Unable to load the game catalog." }, { status: 500 });
      }
      mappedGames = ((result.data || []) as unknown as GameMasterRow[]).slice(0, capacity);
      mappedCount = result.count || 0;
    }
    const total = filteredCatalog.length + mappedCount;
    return NextResponse.json({
      games: [...pagedCatalog, ...mappedGames.map(normalizeGame)], count: total, page, limit,
      totalPages: Math.ceil(total / limit), catalogType: activeCategory.slug,
      isCuratedCategory: true, category: activeCategory,
    });
  }

  const categoryProductGameIds = new Set<number>();
  if (activeCategory) {
    const productFilters = [
      `category_id.eq.${activeCategory.id}`,
      `category.ilike.%${escapePostgrest(activeCategory.name)}%`,
      `category.ilike.%${escapePostgrest(activeCategory.slug)}%`,
    ];
    const { data: categoryProducts, error: categoryProductsError } = await supabase.from("products")
      .select("game_category_id,stock").eq("status", "active").or(productFilters.join(",")).range(0, 9999);
    if (categoryProductsError) {
      console.error("Category game product lookup failed:", categoryProductsError.message);
      return NextResponse.json({ error: "Unable to load the selected game category." }, { status: 500 });
    }
    for (const product of (categoryProducts || []) as ProductRow[]) {
      const gameId = Number(product.game_category_id);
      if (!Number.isFinite(gameId) || gameId <= 0 || numberValue(product.stock) <= 0) continue;
      categoryProductGameIds.add(gameId);
    }
  }

  let gamesQuery = supabase.from("game_master_marketplace_catalog")
    .select(GAME_COLUMNS, { count: "exact" }).eq("status", "active").eq("is_active", true);
  if (queryText) gamesQuery = gamesQuery.or(searchFilter(queryText));
  if (letter && letter !== "ALL") {
    if (letter === "0-9") gamesQuery = gamesQuery.in("first_letter", [..."0123456789"]);
    else if (/^[A-Z]$/.test(letter)) gamesQuery = gamesQuery.eq("first_letter", letter);
  }
  if (activeCategory) {
    const categoryGameIds = Array.from(categoryProductGameIds);
    if (categoryGameIds.length > 0) {
      gamesQuery = gamesQuery.or(`marketplace_category_ids.cs.{${activeCategory.id}},id.in.(${categoryGameIds.join(",")})`);
    } else gamesQuery = gamesQuery.contains("marketplace_category_ids", [activeCategory.id]);
  }
  const { data, error, count } = await gamesQuery.order("name").order("id").range(offset, offset + limit - 1);
  if (error) {
    console.error("Game catalog query failed:", error.message);
    return NextResponse.json({ error: "Unable to load the game catalog." }, { status: 500 });
  }
  const games = (data || []) as unknown as GameMasterRow[];
  const gameIds = games.map((game) => game.id);
  const offerCountByGame = new Map<number, number>();
  if (gameIds.length > 0) {
    let productsQuery = supabase.from("products").select("game_category_id,stock")
      .eq("status", "active").in("game_category_id", gameIds).range(0, 9999);
    if (activeCategory) productsQuery = productsQuery.or(`category_id.eq.${activeCategory.id},category.ilike.%${escapePostgrest(activeCategory.name)}%`);
    const { data: products, error: productsError } = await productsQuery;
    if (!productsError) {
      for (const product of (products || []) as ProductRow[]) {
        const gameId = Number(product.game_category_id);
        if (!Number.isFinite(gameId) || gameId <= 0 || numberValue(product.stock) <= 0) continue;
        offerCountByGame.set(gameId, (offerCountByGame.get(gameId) || 0) + 1);
      }
    }
  }
  const result = games.map((game) => ({ ...normalizeGame(game), offer_count: offerCountByGame.get(game.id) ?? numberValue(game.offer_count) }));
  const total = count || 0;
  return NextResponse.json({ games: result, count: total, page, limit, totalPages: Math.ceil(total / limit) });
}
