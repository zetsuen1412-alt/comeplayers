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

type CategoryRow = {
  id: number;
  name: string;
  slug: string;
};

type ProductRow = {
  game_category_id: number | null;
  stock: number | string | null;
};

function numberValue(value: number | string | null | undefined) {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function escapePostgrest(value: string) {
  return value.replace(/[%_,]/g, " ").trim();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") || 48), 1),
    100
  );
  const queryText = escapePostgrest(searchParams.get("q") || "");
  const letter = String(searchParams.get("letter") || "").toUpperCase();
  const categoryValue = String(searchParams.get("category") || "").trim();
  const offset = (page - 1) * limit;

  let activeCategory: CategoryRow | null = null;

  if (categoryValue) {
    const normalizedCategory = normalizeCategorySlug(categoryValue);

    const { data: category, error: categoryError } = await supabase
      .from("categories")
      .select("id,name,slug")
      .or(
        `slug.eq.${normalizedCategory},name.ilike.%${escapePostgrest(
          categoryValue
        )}%`
      )
      .maybeSingle();

    if (categoryError) {
      console.error("Game category lookup failed:", categoryError.message);
      return NextResponse.json(
        { error: "Unable to load the selected game category." },
        { status: 500 },
      );
    }

    if (!category) {
      const categoryMeta = getCuratedCategoryMeta(normalizedCategory);

      if (categoryMeta) {
        activeCategory = {
          id: 0,
          name: categoryMeta.name,
          slug: categoryMeta.slug,
        };
      } else {
        return NextResponse.json({
          games: [],
          count: 0,
          page,
          limit,
          totalPages: 0,
        });
      }
    } else {
      activeCategory = category as CategoryRow;
    }
  }

  if (activeCategory && isCuratedMarketplaceCategory(activeCategory.slug)) {
    const catalog = getCuratedMarketplaceCatalog(activeCategory.slug);
    const productFilters = [
      `category.ilike.%${escapePostgrest(activeCategory.name)}%`,
      `category.ilike.%${escapePostgrest(activeCategory.slug)}%`,
    ];

    if (activeCategory.id > 0) {
      productFilters.unshift(`category_id.eq.${activeCategory.id}`);
    }

    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("title,game_name,category,stock")
      .eq("status", "active")
      .or(productFilters.join(","))
      .range(0, 9999);

    const catalogWithCounts = productsError
      ? catalog
      : applyCuratedOfferCounts(
          catalog,
          (products || []) as MarketplaceCatalogProduct[]
        );
    const filteredCatalog = filterCuratedMarketplaceCatalog(
      catalogWithCounts,
      queryText,
      letter
    );
    const pagedCatalog = paginateCuratedMarketplaceCatalog(
      filteredCatalog,
      page,
      limit
    );

    return NextResponse.json({
      games: pagedCatalog,
      count: filteredCatalog.length,
      page,
      limit,
      totalPages: Math.ceil(filteredCatalog.length / limit),
      catalogType: activeCategory.slug,
      isCuratedCategory: true,
      category: activeCategory,
    });
  }

  const categoryProductGameIds = new Set<number>();

  if (activeCategory) {
    const productFilters = [
      `category_id.eq.${activeCategory.id}`,
      `category.ilike.%${escapePostgrest(activeCategory.name)}%`,
      `category.ilike.%${escapePostgrest(activeCategory.slug)}%`,
    ];

    const { data: categoryProducts, error: categoryProductsError } = await supabase
      .from("products")
      .select("game_category_id,stock")
      .eq("status", "active")
      .or(productFilters.join(","))
      .range(0, 9999);

    if (categoryProductsError) {
      console.error(
        "Category game product lookup failed:",
        categoryProductsError.message
      );
      return NextResponse.json(
        { error: "Unable to load the selected game category." },
        { status: 500 },
      );
    }

    for (const product of (categoryProducts || []) as ProductRow[]) {
      const gameId = Number(product.game_category_id);
      if (!Number.isFinite(gameId) || numberValue(product.stock) <= 0) continue;
      categoryProductGameIds.add(gameId);
    }
  }

  let gamesQuery = supabase
    .from("game_master")
    .select(
      "id,name,slug,first_letter,image_url,cover_image_url,background_image,offer_count,is_trending,is_featured,rating,metacritic",
      { count: "exact" }
    )
    .eq("status", "active")
    .eq("is_active", true);

  if (queryText) {
    const normalized = queryText
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    gamesQuery = gamesQuery.or(
      `normalized_name.ilike.%${queryText.toLowerCase()}%,name.ilike.%${queryText}%,slug.ilike.%${normalized}%`
    );
  }

  if (letter && letter !== "ALL") {
    if (letter === "0-9") {
      gamesQuery = gamesQuery.in("first_letter", [
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
      ]);
    } else if (/^[A-Z]$/.test(letter)) {
      gamesQuery = gamesQuery.eq("first_letter", letter);
    }
  }

  if (activeCategory) {
    const categoryGameIds = Array.from(categoryProductGameIds);

    if (categoryGameIds.length > 0) {
      gamesQuery = gamesQuery.or(
        `category_id.eq.${activeCategory.id},id.in.(${categoryGameIds.join(",")})`
      );
    } else {
      gamesQuery = gamesQuery.eq("category_id", activeCategory.id);
    }
  }

  const { data, error, count } = await gamesQuery
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Game catalog query failed:", error.message);
    return NextResponse.json(
      { error: "Unable to load the game catalog." },
      { status: 500 },
    );
  }

  const games = (data || []) as GameMasterRow[];
  const gameIds = games.map((game) => game.id);
  const offerCountByGame = new Map<number, number>();

  if (gameIds.length > 0) {
    let productsQuery = supabase
      .from("products")
      .select("game_category_id,stock")
      .eq("status", "active")
      .in("game_category_id", gameIds)
      .range(0, 9999);

    if (activeCategory) {
      productsQuery = productsQuery.or(
        `category_id.eq.${activeCategory.id},category.ilike.%${escapePostgrest(
          activeCategory.name
        )}%`
      );
    }

    const { data: products, error: productsError } = await productsQuery;

    if (!productsError) {
      for (const product of (products || []) as ProductRow[]) {
        const gameId = Number(product.game_category_id);
        if (!Number.isFinite(gameId) || numberValue(product.stock) <= 0) continue;
        offerCountByGame.set(gameId, (offerCountByGame.get(gameId) || 0) + 1);
      }
    }
  }

  const result = games.map((game) => ({
    ...game,
    first_letter:
      game.first_letter || game.name.trim().charAt(0).toUpperCase() || "#",
    offer_count:
      offerCountByGame.get(game.id) ?? numberValue(game.offer_count),
    is_trending: Boolean(game.is_trending),
    is_featured: Boolean(game.is_featured),
    rating: numberValue(game.rating),
  }));

  const total = count || 0;

  return NextResponse.json({
    games: result,
    count: total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
