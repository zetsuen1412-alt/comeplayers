import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin, createSupabaseAuthClient } from "@/lib/serverSupabase";

type ProfileRow = {
  id: string;
  username: string | null;
  seller_name: string | null;
  seller_status: string | null;
  avatar_url: string | null;
  bio: string | null;
  seller_rating?: number | string | null;
  seller_review_count?: number | string | null;
};

type ProductRow = {
  id: number | string;
  seller_id: string | null;
  seller_name: string | null;
  status: string | null;
  game_name: string | null;
};

type ReviewRow = {
  seller_id: string | null;
  rating: number | string | null;
};

type OrderRow = {
  seller_id: string | null;
  status: string | null;
};

type MarketplaceEventRow = {
  seller_id?: string | null;
  event_type: string | null;
};

function numberValue(value: number | string | null | undefined) {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeStatus(status: string | null | undefined) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function isCompletedStatus(status: string | null | undefined) {
  const normalizedStatus = normalizeStatus(status);

  return [
    "completed",
    "complete",
    "selesai",
    "done",
    "paid",
    "delivered",
  ].includes(normalizedStatus);
}

function sellerDisplayName(profile: ProfileRow, fallback?: string | null) {
  return (
    profile.seller_name ||
    profile.username ||
    fallback ||
    "ComePlayers Seller"
  );
}

function calculateSellerScore(input: {
  averageRating: number;
  reviewCount: number;
  completedOrders: number;
  activeProducts: number;
  conversionRate: number;
}) {
  return Math.round(
    input.completedOrders * 5 +
      input.averageRating * 20 +
      input.reviewCount * 2 +
      input.activeProducts * 3 +
      input.conversionRate * 10
  );
}

export async function GET(request: NextRequest) {
  const publicSupabase = createSupabaseAuthClient();
  const supabaseAdmin = createSupabaseAdmin();
  const { searchParams } = new URL(request.url);

  const gameSlug = searchParams.get("game")?.trim() || "";
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") || 8), 1),
    24
  );

  let productQuery = publicSupabase
    .from("products")
    .select("id,seller_id,seller_name,status,game_name")
    .eq("status", "active")
    .not("seller_id", "is", null)
    .range(0, 9999);

  if (gameSlug) {
    const gameSearch = gameSlug.replace(/-/g, " ");
    productQuery = productQuery.ilike("game_name", `%${gameSearch}%`);
  }

  const productsResult = await productQuery;

  if (productsResult.error) {
    return NextResponse.json(
      { error: "Featured sellers are temporarily unavailable." },
      { status: 500 }
    );
  }

  const products = (productsResult.data || []) as ProductRow[];

  const sellerIds = Array.from(
    new Set(
      products
        .map((product) => product.seller_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  if (sellerIds.length === 0) {
    return NextResponse.json({ sellers: [] });
  }

  const profilesResult = await publicSupabase
    .from("profiles")
    .select(
      "id,username,seller_name,seller_status,avatar_url,bio,seller_rating,seller_review_count"
    )
    .in("id", sellerIds);

  if (profilesResult.error) {
    return NextResponse.json(
      { error: "Featured sellers are temporarily unavailable." },
      { status: 500 }
    );
  }

  let reviewsResult = await publicSupabase
    .from("seller_reviews")
    .select("seller_id,rating")
    .in("seller_id", sellerIds);

  if (reviewsResult.error) {
    reviewsResult = await publicSupabase
      .from("reviews")
      .select("seller_id,rating")
      .in("seller_id", sellerIds);
  }

  const ordersResult = await supabaseAdmin
    .from("orders")
    .select("seller_id,status")
    .in("seller_id", sellerIds)
    .range(0, 9999);

  const eventsResult = await supabaseAdmin
    .from("marketplace_events")
    .select("seller_id,event_type")
    .in("seller_id", sellerIds)
    .in("event_type", ["product_view", "checkout_start"])
    .range(0, 9999);

  if (ordersResult.error) {
    return NextResponse.json(
      { error: "Featured sellers are temporarily unavailable." },
      { status: 500 }
    );
  }

  const profilesById = new Map<string, ProfileRow>();

  for (const profile of (profilesResult.data || []) as ProfileRow[]) {
    profilesById.set(profile.id, profile);
  }

  const statsBySellerId = new Map<
    string,
    {
      fallbackName: string | null;
      activeProducts: number;
      ratingTotal: number;
      reviewCount: number;
      completedOrders: number;
      productViews: number;
      checkoutStarts: number;
    }
  >();

  function ensureStats(sellerId: string) {
    const existing = statsBySellerId.get(sellerId);

    if (existing) return existing;

    const created = {
      fallbackName: null,
      activeProducts: 0,
      ratingTotal: 0,
      reviewCount: 0,
      completedOrders: 0,
      productViews: 0,
      checkoutStarts: 0,
    };

    statsBySellerId.set(sellerId, created);

    return created;
  }

  for (const product of products) {
    if (!product.seller_id) continue;

    const stats = ensureStats(product.seller_id);

    stats.activeProducts += 1;
    stats.fallbackName = stats.fallbackName || product.seller_name;
  }

  for (const profile of profilesById.values()) {
    const stats = ensureStats(profile.id);

    const profileRating = numberValue(profile.seller_rating);
    const profileReviewCount = numberValue(profile.seller_review_count);

    if (profileRating > 0 && profileReviewCount > 0) {
      stats.ratingTotal += profileRating * profileReviewCount;
      stats.reviewCount += profileReviewCount;
    }
  }

  if (!reviewsResult.error) {
    for (const review of (reviewsResult.data || []) as ReviewRow[]) {
      if (!review.seller_id) continue;

      const stats = ensureStats(review.seller_id);

      stats.ratingTotal += numberValue(review.rating);
      stats.reviewCount += 1;
    }
  }

  for (const order of (ordersResult.data || []) as OrderRow[]) {
    if (!order.seller_id || !isCompletedStatus(order.status)) continue;

    const stats = ensureStats(order.seller_id);

    stats.completedOrders += 1;
  }

  if (!eventsResult.error) {
    for (const event of (eventsResult.data || []) as MarketplaceEventRow[]) {
      if (!event.seller_id) continue;

      const stats = ensureStats(event.seller_id);

      if (event.event_type === "product_view") stats.productViews += 1;
      if (event.event_type === "checkout_start") stats.checkoutStarts += 1;
    }
  }

  const sellers = Array.from(statsBySellerId.entries())
    .map(([sellerId, stats]) => {
      const profile = profilesById.get(sellerId) || {
        id: sellerId,
        username: null,
        seller_name: null,
        seller_status: null,
        avatar_url: null,
        bio: null,
      };

      const averageRating = stats.reviewCount
        ? Number((stats.ratingTotal / stats.reviewCount).toFixed(1))
        : 0;

      const conversionRate = stats.productViews
        ? Number(((stats.checkoutStarts / stats.productViews) * 100).toFixed(1))
        : 0;

      const score = calculateSellerScore({
        averageRating,
        reviewCount: stats.reviewCount,
        completedOrders: stats.completedOrders,
        activeProducts: stats.activeProducts,
        conversionRate,
      });

      return {
        id: sellerId,
        name: sellerDisplayName(profile, stats.fallbackName),
        avatar_url: profile.avatar_url || null,
        bio: profile.bio || null,
        seller_status: profile.seller_status || null,
        average_rating: averageRating,
        review_count: stats.reviewCount,
        completed_orders: stats.completedOrders,
        active_products: stats.activeProducts,
        product_views: stats.productViews,
        checkout_starts: stats.checkoutStarts,
        conversion_rate: conversionRate,
        featured_score: score,
        is_featured:
          score >= 50 || stats.completedOrders >= 5 || averageRating >= 4.5,
      };
    })
    .filter((seller) => seller.active_products > 0)
    .sort((a, b) => {
      return (
        b.featured_score - a.featured_score ||
        b.completed_orders - a.completed_orders ||
        b.average_rating - a.average_rating ||
        b.active_products - a.active_products ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, limit);

  return NextResponse.json({ sellers });
}