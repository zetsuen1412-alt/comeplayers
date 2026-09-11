import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type GameRow = {
  id: number;
  name: string;
  slug: string;
  image_url: string | null;
  cover_image_url: string | null;
  background_image: string | null;
  offer_count: number | null;
  is_trending: boolean | null;
  rating: number | null;
};

type ProductRow = {
  id: number;
  title: string;
  slug: string | null;
  price: number | string | null;
  image_url: string | null;
  category: string | null;
  game_name: string | null;
  game_category_id: number | null;
  seller_name: string | null;
  created_at: string;
  min_variant_price?: number | string | null;
  stock?: number | null;
  delivery_eta_minutes?: number | null;
  offer_region?: string | null;
  offer_platform?: string | null;
  offer_server?: string | null;
  offer_tags?: string[] | null;
};

type GameImageRow = {
  id: number;
  name: string;
  image_url: string | null;
  cover_image_url: string | null;
  background_image: string | null;
};

type CategoryRow = {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
};

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeIlike(value: string) {
  return value.replace(/[%_]/g, "\\$&").replace(/,/g, " ");
}

function productHref(product: ProductRow) {
  return `/product/${product.slug || product.id}`;
}

function fallbackProductImage(title: string | null) {
  return `https://placehold.co/900x600/020617/22d3ee?text=${encodeURIComponent(
    title || "ComePlayers Product"
  )}`;
}

function scoreProduct(product: ProductRow, rawQuery: string, rawCategory: string) {
  const query = rawQuery.trim().toLowerCase();
  const categoryQuery = rawCategory.trim().toLowerCase();

  const title = (product.title || "").toLowerCase();
  const game = (product.game_name || "").toLowerCase();
  const category = (product.category || "").toLowerCase();
  const seller = (product.seller_name || "").toLowerCase();
  const discovery = [
    product.offer_region,
    product.offer_platform,
    product.offer_server,
    ...(product.offer_tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;

  if (query) {
    if (title === query) score += 100;
    if (title.startsWith(query)) score += 70;
    if (title.includes(query)) score += 45;

    if (game === query) score += 55;
    if (game.includes(query)) score += 35;

    if (category === query) score += 35;
    if (category.includes(query)) score += 25;

    if (seller.includes(query)) score += 10;
    if (discovery.includes(query)) score += 20;
  }

  if (categoryQuery) {
    const normalizedCategoryQuery = normalizeSearch(categoryQuery);
    const normalizedProductCategory = normalizeSearch(category);

    if (normalizedProductCategory === normalizedCategoryQuery) score += 45;
    if (normalizedProductCategory.includes(normalizedCategoryQuery)) score += 25;
  }

  const createdAt = new Date(product.created_at).getTime();
  if (Number.isFinite(createdAt)) {
    const ageDays = Math.max(0, (Date.now() - createdAt) / 86_400_000);
    score += Math.max(0, 15 - ageDays * 0.5);
  }

  return Math.round(score);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q")?.trim() || "";
  const rawCategory = searchParams.get("category")?.trim() || "";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 8), 1), 20);
  const productFetchLimit = Math.min(limit * 4, 60);

  if (rawQuery.length < 2 && rawCategory.length < 2) {
    return NextResponse.json({
      query: rawQuery,
      games: [],
      products: [],
      categories: [],
    });
  }

  const normalizedQuery = normalizeSearch(rawQuery);
  const searchText = escapeIlike(rawQuery.toLowerCase());
  const normalizedCategory = normalizeSearch(rawCategory);
  const categoryNameCandidate = normalizedCategory.replace(/-/g, " ");

  let categoryFilter: CategoryRow | null = null;

  if (normalizedCategory) {
    const { data: categoryData, error: categoryError } = await supabase
      .from("categories")
      .select("id,name,slug,icon")
      .or(`slug.eq.${normalizedCategory},name.ilike.%${categoryNameCandidate}%`)
      .maybeSingle();

    if (categoryError) {
      console.error("Marketplace category lookup failed:", categoryError.message);
      return NextResponse.json(
        { error: "Unable to search the marketplace." },
        { status: 500 },
      );
    }

    categoryFilter = categoryData || null;
  }

  const productCategoryValues = categoryFilter
    ? Array.from(
        new Set(
          [
            categoryFilter.name,
            categoryFilter.slug,
            normalizeSearch(categoryFilter.name),
            categoryNameCandidate,
          ].filter(Boolean)
        )
      )
    : [];

  const gamesQuery = supabase
    .from("game_master")
    .select(
      "id,name,slug,image_url,cover_image_url,background_image,offer_count,is_trending,rating"
    )
    .eq("status", "active")
    .eq("is_active", true)
    .or(
      `normalized_name.ilike.%${searchText}%,name.ilike.%${searchText}%,slug.ilike.%${normalizedQuery}%`
    )
    .order("is_trending", { ascending: false })
    .order("offer_count", { ascending: false })
    .limit(limit);

  let productsQuery = supabase
    .from("products")
    .select(
      "id,title,slug,price,min_variant_price,image_url,category,game_name,game_category_id,seller_name,created_at,category_id,stock,delivery_eta_minutes,offer_region,offer_platform,offer_server,offer_tags"
    )
    .eq("status", "active")
    .or(
      `title.ilike.%${searchText}%,description.ilike.%${searchText}%,game_name.ilike.%${searchText}%,category.ilike.%${searchText}%,offer_region.ilike.%${searchText}%,offer_platform.ilike.%${searchText}%,offer_server.ilike.%${searchText}%`
    )
    .order("created_at", { ascending: false })
    .limit(productFetchLimit);

  if (categoryFilter) {
    const productCategoryList = productCategoryValues
      .map((value) => `"${String(value).replace(/"/g, '\\"')}"`)
      .join(",");

    productsQuery = productsQuery.or(
      `category_id.eq.${categoryFilter.id},category.in.(${productCategoryList})`
    );
  }

  const categoriesQuery = supabase
    .from("categories")
    .select("id,name,slug,icon")
    .or(`name.ilike.%${searchText}%,slug.ilike.%${normalizedQuery}%`)
    .order("id", { ascending: true })
    .limit(6);

  const [gamesResult, productsResult, categoriesResult] = await Promise.all([
    gamesQuery,
    productsQuery,
    categoriesQuery,
  ]);

  if (gamesResult.error) {
    console.error("Marketplace game search failed:", gamesResult.error.message);
    return NextResponse.json(
      { error: "Unable to search the marketplace." },
      { status: 500 },
    );
  }

  if (productsResult.error) {
    console.error("Marketplace product search failed:", productsResult.error.message);
    return NextResponse.json(
      { error: "Unable to search the marketplace." },
      { status: 500 },
    );
  }

  if (categoriesResult.error) {
    console.error("Marketplace category search failed:", categoriesResult.error.message);
    return NextResponse.json(
      { error: "Unable to search the marketplace." },
      { status: 500 },
    );
  }

  const games = ((gamesResult.data || []) as GameRow[]).map((game) => ({
    ...game,
    href: categoryFilter
      ? `/games/${game.slug}/offers?category=${encodeURIComponent(categoryFilter.slug)}`
      : `/games/${game.slug}`,
  }));

  const productRows = (productsResult.data || []) as ProductRow[];
  const productGameIds = Array.from(
    new Set(productRows.map((product) => product.game_category_id).filter((id): id is number => Number.isFinite(id)))
  );
  const productGameNames = Array.from(
    new Set(productRows.map((product) => product.game_name).filter((name): name is string => Boolean(name?.trim())))
  );
  const emptyGameImages = Promise.resolve({ data: [] as GameImageRow[], error: null });
  const [gameImagesByIdResult, gameImagesByNameResult] = await Promise.all([
    productGameIds.length
      ? supabase
          .from("game_master")
          .select("id,name,image_url,cover_image_url,background_image")
          .in("id", productGameIds)
      : emptyGameImages,
    productGameNames.length
      ? supabase
          .from("game_master")
          .select("id,name,image_url,cover_image_url,background_image")
          .in("name", productGameNames)
      : emptyGameImages,
  ]);

  if (gameImagesByIdResult.error) {
    console.error("Marketplace product image lookup by game id failed:", gameImagesByIdResult.error.message);
  }
  if (gameImagesByNameResult.error) {
    console.error("Marketplace product image lookup by game name failed:", gameImagesByNameResult.error.message);
  }

  const productImageByGameId = new Map<number, string>();
  const productImageByGameName = new Map<string, string>();
  const gameImageRows = [
    ...((gameImagesByIdResult.data || []) as GameImageRow[]),
    ...((gameImagesByNameResult.data || []) as GameImageRow[]),
  ];
  for (const game of gameImageRows) {
    const image = game.image_url || game.cover_image_url || game.background_image;
    if (!image) continue;
    productImageByGameId.set(game.id, image);
    productImageByGameName.set(normalizeSearch(game.name), image);
  }

  const products = productRows
    .map((product) => ({
      ...product,
      price: product.min_variant_price || product.price,
      image_url:
        product.image_url ||
        (product.game_category_id
          ? productImageByGameId.get(product.game_category_id)
          : undefined) ||
        productImageByGameName.get(normalizeSearch(product.game_name || "")) ||
        fallbackProductImage(product.title),
      href: productHref(product),
      relevance_score: scoreProduct(product, rawQuery, rawCategory),
    }))
    .sort((a, b) => {
      if (b.relevance_score !== a.relevance_score) {
        return b.relevance_score - a.relevance_score;
      }

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, limit);

  const categories = ((categoriesResult.data || []) as CategoryRow[]).map((category) => ({
    ...category,
    href: `/games?category=${encodeURIComponent(category.slug)}${
      rawQuery ? `&q=${encodeURIComponent(rawQuery)}` : ""
    }`,
  }));

  return NextResponse.json({
    query: rawQuery,
    category: categoryFilter,
    games,
    products,
    categories,
  });
}
