import { NextRequest, NextResponse } from "next/server";
import {
  effectiveProductPrice,
  median,
  normalizeFacet,
  rankOffer,
  type OfferProduct,
  type OfferProfile,
  type OfferVariant,
  type RankedOffer,
} from "@/lib/offerRanking";
import {
  canonicalMarketplaceCategory,
  marketplaceCategoryLabel,
  marketplaceCategoryMatches,
} from "@/lib/marketplaceTaxonomy";
import { supabase } from "@/lib/supabase";

type FacetItem = {
  value: string;
  label: string;
  count: number;
};

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanParam(value: string | null, fallback = false) {
  if (value === null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function containsNormalized(values: string[], selected: string) {
  if (!selected) return true;
  const target = normalizeFacet(selected);
  return values.some((value) => normalizeFacet(value) === target);
}

function buildFacet(values: string[]) {
  const map = new Map<string, FacetItem>();

  for (const rawValue of values) {
    const label = String(rawValue || "").trim();
    const value = normalizeFacet(label);
    if (!value) continue;

    const existing = map.get(value);
    if (existing) existing.count += 1;
    else map.set(value, { value, label, count: 1 });
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}

function matchesQuery(offer: RankedOffer, query: string) {
  const search = query.trim().toLowerCase();
  if (!search) return true;

  return [
    offer.title,
    offer.category,
    offer.game_name,
    offer.seller_display_name,
    ...offer.regions,
    ...offer.platforms,
    ...offer.servers,
    ...offer.factions,
    ...offer.searchable_tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(search);
}

function compareCreatedAtDesc(a: RankedOffer, b: RankedOffer) {
  return (
    Date.parse(b.created_at || "1970-01-01") -
    Date.parse(a.created_at || "1970-01-01")
  );
}

function stableOfferId(offer: RankedOffer) {
  return Number(offer.id || 0);
}

function sortOffers(offers: RankedOffer[], sort: string) {
  const list = [...offers];

  switch (sort) {
    case "price_asc":
      return list.sort((a, b) => {
        if (a.effective_price !== b.effective_price) {
          return a.effective_price - b.effective_price;
        }
        if (a.ranking_score !== b.ranking_score) {
          return b.ranking_score - a.ranking_score;
        }
        return stableOfferId(a) - stableOfferId(b);
      });
    case "price_desc":
      return list.sort((a, b) => {
        if (a.effective_price !== b.effective_price) {
          return b.effective_price - a.effective_price;
        }
        if (a.ranking_score !== b.ranking_score) {
          return b.ranking_score - a.ranking_score;
        }
        return stableOfferId(a) - stableOfferId(b);
      });
    case "delivery_asc":
      return list.sort((a, b) => {
        if (a.delivery_eta !== b.delivery_eta) return a.delivery_eta - b.delivery_eta;
        if (a.ranking_score !== b.ranking_score) {
          return b.ranking_score - a.ranking_score;
        }
        return a.effective_price - b.effective_price;
      });
    case "rating_desc":
      return list.sort((a, b) => {
        if (a.seller_rating !== b.seller_rating) return b.seller_rating - a.seller_rating;
        if (a.seller_review_count !== b.seller_review_count) {
          return b.seller_review_count - a.seller_review_count;
        }
        return a.effective_price - b.effective_price;
      });
    case "orders_desc":
      return list.sort((a, b) => {
        if (a.seller_completed_orders !== b.seller_completed_orders) {
          return b.seller_completed_orders - a.seller_completed_orders;
        }
        return a.effective_price - b.effective_price;
      });
    case "newest":
      return list.sort((a, b) => {
        const dateDifference = compareCreatedAtDesc(a, b);
        return dateDifference || stableOfferId(b) - stableOfferId(a);
      });
    case "stock_desc":
      return list.sort((a, b) => {
        if (a.effective_stock !== b.effective_stock) {
          return b.effective_stock - a.effective_stock;
        }
        return a.effective_price - b.effective_price;
      });
    default:
      return list.sort((a, b) => {
        if (a.ranking_score !== b.ranking_score) {
          return b.ranking_score - a.ranking_score;
        }
        if (a.seller_completed_orders !== b.seller_completed_orders) {
          return b.seller_completed_orders - a.seller_completed_orders;
        }
        if (a.effective_price !== b.effective_price) {
          return a.effective_price - b.effective_price;
        }
        const dateDifference = compareCreatedAtDesc(a, b);
        return dateDifference || stableOfferId(a) - stableOfferId(b);
      });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const gameSlug = searchParams.get("game")?.trim() || "";
  const categoryParam = searchParams.get("category")?.trim() || "";
  const query = searchParams.get("q")?.trim() || "";
  const region = searchParams.get("region")?.trim() || "";
  const server = searchParams.get("server")?.trim() || "";
  const platform = searchParams.get("platform")?.trim() || "";
  const faction = searchParams.get("faction")?.trim() || "";
  const serviceLevel = searchParams.get("serviceLevel")?.trim() || "";
  const sort = searchParams.get("sort")?.trim() || "recommended";
  const minPrice = Math.max(0, numberParam(searchParams.get("minPrice"), 0));
  const maxPrice = Math.max(0, numberParam(searchParams.get("maxPrice"), 0));
  const minRating = Math.max(0, Math.min(5, numberParam(searchParams.get("minRating"), 0)));
  const maxDelivery = Math.max(0, numberParam(searchParams.get("maxDelivery"), 0));
  const onlineOnly = booleanParam(searchParams.get("onlineOnly"));
  const inStockOnly = booleanParam(searchParams.get("inStockOnly"), true);
  const page = Math.max(1, Math.floor(numberParam(searchParams.get("page"), 1)));
  const pageSize = Math.min(
    48,
    Math.max(8, Math.floor(numberParam(searchParams.get("pageSize") || searchParams.get("limit"), 24)))
  );

  if (!gameSlug) {
    return NextResponse.json({
      products: [],
      facets: { categories: [], regions: [], servers: [], factions: [], platforms: [], serviceLevels: [], price: { min: 0, max: 0, median: 0 } },
      pagination: { page: 1, pageSize, total: 0, totalPages: 0 },
    });
  }

  const { data: gameData, error: gameError } = await supabase
    .from("game_master")
    .select("id,name,slug")
    .eq("slug", gameSlug)
    .eq("status", "active")
    .eq("is_active", true)
    .maybeSingle();

  if (gameError) {
    console.error("Offer game lookup failed:", gameError.message);
    return NextResponse.json(
      { error: "Unable to load marketplace offers." },
      { status: 500 },
    );
  }

  if (!gameData) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  let productQuery = supabase
    .from("products")
    .select(`
      id,
      title,
      slug,
      price,
      min_variant_price,
      max_variant_price,
      image_url,
      category,
      status,
      seller_id,
      seller_name,
      created_at,
      updated_at,
      game_name,
      game_category_id,
      stock,
      delivery_eta_minutes,
      has_variants,
      variant_count,
      offer_region,
      offer_platform,
      offer_server,
      offer_faction,
      offer_tags
    `)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(500);

  if (gameData.id) productQuery = productQuery.eq("game_category_id", Number(gameData.id));
  else productQuery = productQuery.ilike("game_name", gameData.name);

  const { data: productRows, error: productError } = await productQuery;

  if (productError) {
    console.error("Offer product query failed:", productError.message);
    return NextResponse.json(
      { error: "Unable to load marketplace offers." },
      { status: 500 },
    );
  }

  const products = (productRows || []) as OfferProduct[];
  const productIds = products.map((product) => Number(product.id));
  const sellerIds = Array.from(
    new Set(
      products
        .map((product) => product.seller_id)
        .filter((sellerId): sellerId is string => Boolean(sellerId))
    )
  );

  const [profileResult, variantResult] = await Promise.all([
    sellerIds.length
      ? supabase
          .from("profiles")
          .select(`
            id,
            username,
            seller_name,
            avatar_url,
            seller_rating,
            seller_review_count,
            seller_status,
            seller_presence_mode,
            seller_last_seen_at,
            seller_delivery_sla_minutes,
            seller_avg_delivery_minutes,
            seller_on_time_rate,
            seller_total_deliveries,
            seller_service_level
          `)
          .in("id", sellerIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabase
          .from("product_variants")
          .select("product_id,name,sku,attributes,price,stock,status")
          .in("product_id", productIds)
          .eq("status", "active")
          .limit(2000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profileResult.error) {
    console.error("Offer seller profile query failed:", profileResult.error.message);
    return NextResponse.json(
      { error: "Unable to load marketplace offers." },
      { status: 500 },
    );
  }

  if (variantResult.error) {
    console.error("Offer variant query failed:", variantResult.error.message);
    return NextResponse.json(
      { error: "Unable to load marketplace offers." },
      { status: 500 },
    );
  }

  const profiles = new Map<string, OfferProfile>();
  for (const profile of (profileResult.data || []) as OfferProfile[]) {
    profiles.set(profile.id, profile);
  }

  const variantsByProduct = new Map<number, OfferVariant[]>();
  for (const variant of (variantResult.data || []) as OfferVariant[]) {
    const productId = Number(variant.product_id);
    const existing = variantsByProduct.get(productId) || [];
    existing.push(variant);
    variantsByProduct.set(productId, existing);
  }

  const allPrices = products
    .map((product) => effectiveProductPrice(product, variantsByProduct.get(Number(product.id)) || []))
    .filter((price) => price > 0);
  const medianPrice = median(allPrices);

  const ranked = products.map((product) =>
    rankOffer({
      product,
      profile: product.seller_id ? profiles.get(product.seller_id) : null,
      variants: variantsByProduct.get(Number(product.id)) || [],
      medianPrice,
      query,
    })
  );

  const facets = {
    categories: buildFacet(
      ranked.map((offer) => {
        const categoryCode = canonicalMarketplaceCategory(offer.category);
        return categoryCode
          ? marketplaceCategoryLabel(categoryCode)
          : offer.category || "Other";
      })
    ),
    regions: buildFacet(ranked.flatMap((offer) => offer.regions)),
    servers: buildFacet(ranked.flatMap((offer) => offer.servers)),
    factions: buildFacet(ranked.flatMap((offer) => offer.factions)),
    platforms: buildFacet(ranked.flatMap((offer) => offer.platforms)),
    serviceLevels: buildFacet(ranked.map((offer) => offer.seller_service_level)),
    price: {
      min: allPrices.length ? Math.min(...allPrices) : 0,
      max: allPrices.length ? Math.max(...allPrices) : 0,
      median: medianPrice,
    },
  };

  const levelFilter = normalizeFacet(serviceLevel);

  const filtered = ranked.filter((offer) => {
    if (!matchesQuery(offer, query)) return false;
    if (!marketplaceCategoryMatches(offer.category, categoryParam)) return false;
    if (region && !containsNormalized(offer.regions, region)) return false;
    if (server && !containsNormalized(offer.servers, server)) return false;
    if (faction && !containsNormalized(offer.factions, faction)) return false;
    if (platform && !containsNormalized(offer.platforms, platform)) return false;
    if (levelFilter && normalizeFacet(offer.seller_service_level) !== levelFilter) return false;
    if (minPrice > 0 && offer.effective_price < minPrice) return false;
    if (maxPrice > 0 && offer.effective_price > maxPrice) return false;
    if (minRating > 0 && offer.seller_rating < minRating) return false;
    if (maxDelivery > 0 && offer.delivery_eta > maxDelivery) return false;
    if (onlineOnly && offer.seller_presence !== "online") return false;
    if (inStockOnly && offer.effective_stock <= 0) return false;
    return true;
  });

  const sorted = sortOffers(filtered, sort);
  const total = sorted.length;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
  const safePage = totalPages > 0 ? Math.min(page, totalPages) : 1;
  const start = (safePage - 1) * pageSize;
  const paginated = sorted.slice(start, start + pageSize);

  return NextResponse.json({
    game: gameData,
    products: paginated,
    facets,
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
    appliedFilters: {
      query,
      category: categoryParam,
      region,
      server,
      faction,
      platform,
      serviceLevel,
      minPrice,
      maxPrice,
      minRating,
      maxDelivery,
      onlineOnly,
      inStockOnly,
      sort,
    },
    rankingVersion: "v36.0",
  });
}
