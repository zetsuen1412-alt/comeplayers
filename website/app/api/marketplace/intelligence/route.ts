import { NextResponse } from "next/server";
import { createSupabaseAdmin, createSupabaseAuthClient } from "@/lib/serverSupabase";

type ProductRow = {
  id: number | string;
  title: string | null;
  slug: string | null;
  price: string | number | null;
  image_url: string | null;
  category: string | null;
  category_id: number | null;
  game_name: string | null;
  game_category_id: number | null;
  seller_id: string | null;
  seller_name: string | null;
  status: string | null;
  stock: string | number | null;
  created_at: string | null;
};

type MarketplaceEventRow = {
  event_type: string | null;
  product_id: number | string | null;
  seller_id: string | null;
  game_slug: string | null;
  game_name: string | null;
  category_slug: string | null;
  category_name: string | null;
  created_at: string | null;
};

type OrderRow = {
  id: number | string;
  product_id: number | string | null;
  seller_id: string | null;
  price: string | number | null;
  total_price: string | number | null;
  status: string | null;
  created_at: string | null;
};

type GameRow = {
  id: number;
  name: string;
  slug: string;
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

function numberValue(value: string | number | null | undefined) {
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
  return ["completed", "complete", "selesai", "done", "paid"].includes(
    normalizeStatus(status)
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function toId(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function imageForProduct(product: ProductRow | undefined) {
  return product?.image_url || "/hero-bg.webp";
}

export async function GET() {
  const publicSupabase = createSupabaseAuthClient();
  const supabaseAdmin = createSupabaseAdmin();
  const now = new Date();
  const sevenDaysAgo = daysAgo(7);
  const fourteenDaysAgo = daysAgo(14);
  const thirtyDaysAgo = daysAgo(30);

  const [productsResult, eventsResult, previousEventsResult, ordersResult, gamesResult, categoriesResult] =
    await Promise.all([
      publicSupabase
        .from("products")
        .select(
          "id,title,slug,price,image_url,category,category_id,game_name,game_category_id,seller_id,seller_name,status,stock,created_at"
        )
        .eq("status", "active")
        .range(0, 9999),
      supabaseAdmin
        .from("marketplace_events")
        .select("event_type,product_id,seller_id,game_slug,game_name,category_slug,category_name,created_at")
        .gte("created_at", thirtyDaysAgo.toISOString())
        .range(0, 9999),
      supabaseAdmin
        .from("marketplace_events")
        .select("event_type,product_id,seller_id,game_slug,game_name,category_slug,category_name,created_at")
        .gte("created_at", fourteenDaysAgo.toISOString())
        .lt("created_at", sevenDaysAgo.toISOString())
        .range(0, 9999),
      supabaseAdmin
        .from("orders")
        .select("id,product_id,seller_id,price,total_price,status,created_at")
        .gte("created_at", thirtyDaysAgo.toISOString())
        .range(0, 9999),
      publicSupabase
        .from("game_master")
        .select("id,name,slug,image_url,cover_image_url,background_image")
        .eq("status", "active")
        .range(0, 4999),
      publicSupabase.from("categories").select("id,name,slug,icon").order("id", { ascending: true }),
    ]);

  if (productsResult.error || eventsResult.error || ordersResult.error) {
    console.error("Marketplace intelligence query failed:", {
      products: productsResult.error?.message,
      events: eventsResult.error?.message,
      orders: ordersResult.error?.message,
    });
    return NextResponse.json(
      { error: "Marketplace intelligence is temporarily unavailable." },
      { status: 500 }
    );
  }

  const products = (productsResult.data || []) as ProductRow[];
  const events = (eventsResult.data || []) as MarketplaceEventRow[];
  const previousEvents = previousEventsResult.error
    ? []
    : ((previousEventsResult.data || []) as MarketplaceEventRow[]);
  const orders = (ordersResult.data || []) as OrderRow[];
  const games = gamesResult.error ? [] : ((gamesResult.data || []) as GameRow[]);
  const categories = categoriesResult.error ? [] : ((categoriesResult.data || []) as CategoryRow[]);

  const productsById = new Map<number, ProductRow>();
  for (const product of products) {
    const productId = toId(product.id);
    if (productId) productsById.set(productId, product);
  }

  const gamesById = new Map<number, GameRow>();
  const gamesBySlug = new Map<string, GameRow>();
  for (const game of games) {
    gamesById.set(Number(game.id), game);
    gamesBySlug.set(game.slug, game);
  }

  const categoriesById = new Map<number, CategoryRow>();
  const categoriesBySlug = new Map<string, CategoryRow>();
  for (const category of categories) {
    categoriesById.set(Number(category.id), category);
    categoriesBySlug.set(category.slug, category);
  }

  const recentEvents = events.filter((event) => {
    if (!event.created_at) return false;
    return new Date(event.created_at) >= sevenDaysAgo;
  });

  const completedOrders = orders.filter((order) => isCompletedStatus(order.status));
  const recentCompletedOrders = completedOrders.filter((order) => {
    if (!order.created_at) return false;
    return new Date(order.created_at) >= sevenDaysAgo;
  });

  const summary = {
    active_products: products.length,
    offer_views_7d: recentEvents.filter((event) => event.event_type === "offer_view").length,
    product_views_7d: recentEvents.filter((event) => event.event_type === "product_view").length,
    checkout_starts_7d: recentEvents.filter((event) => event.event_type === "checkout_start").length,
    completed_orders_7d: recentCompletedOrders.length,
    revenue_30d: completedOrders.reduce(
      (sum, order) => sum + numberValue(order.total_price || order.price),
      0
    ),
  };

  const productStats = new Map<
    number,
    {
      views: number;
      checkouts: number;
      orders: number;
      revenue: number;
    }
  >();

  function ensureProductStats(productId: number) {
    const existing = productStats.get(productId);
    if (existing) return existing;

    const created = { views: 0, checkouts: 0, orders: 0, revenue: 0 };
    productStats.set(productId, created);
    return created;
  }

  for (const event of recentEvents) {
    const productId = toId(event.product_id);
    if (!productId) continue;
    const stats = ensureProductStats(productId);

    if (event.event_type === "product_view" || event.event_type === "offer_view") {
      stats.views += 1;
    }

    if (event.event_type === "checkout_start") {
      stats.checkouts += 1;
    }
  }

  for (const order of recentCompletedOrders) {
    const productId = toId(order.product_id);
    if (!productId) continue;
    const stats = ensureProductStats(productId);
    stats.orders += 1;
    stats.revenue += numberValue(order.total_price || order.price);
  }

  const hot_offers = Array.from(productStats.entries())
    .map(([productId, stats]) => {
      const product = productsById.get(productId);
      if (!product) return null;

      const score = stats.views + stats.checkouts * 4 + stats.orders * 12;
      const game = product.game_category_id ? gamesById.get(Number(product.game_category_id)) : null;
      const category = product.category_id ? categoriesById.get(Number(product.category_id)) : null;

      return {
        id: productId,
        title: product.title || "Untitled offer",
        slug: product.slug || String(productId),
        price: numberValue(product.price),
        image_url: imageForProduct(product),
        seller_name: product.seller_name || "ComePlayers Seller",
        game_name: game?.name || product.game_name || "Game",
        game_slug: game?.slug || slugify(product.game_name || "game"),
        category_name: category?.name || product.category || "Marketplace",
        category_slug: category?.slug || slugify(product.category || "marketplace"),
        views: stats.views,
        checkout_starts: stats.checkouts,
        orders: stats.orders,
        revenue: stats.revenue,
        score,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (!a || !b) return 0;
      return b.score - a.score || b.orders - a.orders || b.checkout_starts - a.checkout_starts;
    })
    .slice(0, 8);

  const gameStats = new Map<
    string,
    {
      game_name: string;
      game_slug: string;
      game_id: number | null;
      views: number;
      checkouts: number;
      orders: number;
      active_offers: number;
    }
  >();

  function gameKeyFromProduct(product: ProductRow | undefined, event?: MarketplaceEventRow) {
    const gameId = product?.game_category_id ? Number(product.game_category_id) : null;
    const game = gameId ? gamesById.get(gameId) : null;
    const name = game?.name || product?.game_name || event?.game_name || "Game";
    const slug = game?.slug || event?.game_slug || slugify(name);
    return { key: slug, name, slug, gameId };
  }

  function ensureGameStats(input: { key: string; name: string; slug: string; gameId: number | null }) {
    const existing = gameStats.get(input.key);
    if (existing) return existing;

    const created = {
      game_name: input.name,
      game_slug: input.slug,
      game_id: input.gameId,
      views: 0,
      checkouts: 0,
      orders: 0,
      active_offers: 0,
    };
    gameStats.set(input.key, created);
    return created;
  }

  for (const product of products) {
    const key = gameKeyFromProduct(product);
    ensureGameStats(key).active_offers += 1;
  }

  for (const event of recentEvents) {
    const product = toId(event.product_id) ? productsById.get(toId(event.product_id) || 0) : undefined;
    const stats = ensureGameStats(gameKeyFromProduct(product, event));

    if (event.event_type === "offer_view" || event.event_type === "product_view") stats.views += 1;
    if (event.event_type === "checkout_start") stats.checkouts += 1;
  }

  for (const order of recentCompletedOrders) {
    const product = toId(order.product_id) ? productsById.get(toId(order.product_id) || 0) : undefined;
    const stats = ensureGameStats(gameKeyFromProduct(product));
    stats.orders += 1;
  }

  const trending_games = Array.from(gameStats.values())
    .map((game) => {
      const fullGame = game.game_id ? gamesById.get(game.game_id) : gamesBySlug.get(game.game_slug);
      return {
        ...game,
        image_url: fullGame?.image_url || fullGame?.cover_image_url || fullGame?.background_image || "/hero-bg.webp",
        score: game.views + game.checkouts * 5 + game.orders * 15 + game.active_offers * 2,
      };
    })
    .filter((game) => game.active_offers > 0 || game.views > 0 || game.orders > 0)
    .sort((a, b) => b.score - a.score || b.orders - a.orders || b.active_offers - a.active_offers)
    .slice(0, 6);

  function categoryIdentityFromEvent(event: MarketplaceEventRow) {
    const product = toId(event.product_id) ? productsById.get(toId(event.product_id) || 0) : undefined;
    const category = product?.category_id ? categoriesById.get(Number(product.category_id)) : null;
    const name = category?.name || product?.category || event.category_name || "Marketplace";
    const slug = category?.slug || event.category_slug || slugify(name);
    return { name, slug, icon: category?.icon || "🎮" };
  }

  function countCategoryEvents(inputEvents: MarketplaceEventRow[]) {
    const counts = new Map<string, { name: string; slug: string; icon: string; count: number }>();
    for (const event of inputEvents) {
      const category = categoryIdentityFromEvent(event);
      const current = counts.get(category.slug) || { ...category, count: 0 };
      current.count += 1;
      counts.set(category.slug, current);
    }
    return counts;
  }

  const currentCategoryCounts = countCategoryEvents(recentEvents);
  const previousCategoryCounts = countCategoryEvents(previousEvents);

  const fast_growing_categories = Array.from(currentCategoryCounts.values())
    .map((category) => {
      const previousCount = previousCategoryCounts.get(category.slug)?.count || 0;
      const growth = category.count - previousCount;
      const growthRate = previousCount > 0 ? Math.round((growth / previousCount) * 100) : category.count > 0 ? 100 : 0;
      return {
        name: category.name,
        slug: category.slug,
        icon: category.icon,
        activity_7d: category.count,
        previous_activity_7d: previousCount,
        growth,
        growth_rate: growthRate,
        href: `/games?category=${encodeURIComponent(category.slug)}`,
      };
    })
    .filter((category) => category.activity_7d > 0)
    .sort((a, b) => b.growth - a.growth || b.activity_7d - a.activity_7d)
    .slice(0, 6);

  return NextResponse.json({
    generated_at: now.toISOString(),
    window: {
      current_7d_from: sevenDaysAgo.toISOString(),
      previous_7d_from: fourteenDaysAgo.toISOString(),
      thirty_days_from: thirtyDaysAgo.toISOString(),
    },
    summary,
    trending_games,
    hot_offers,
    fast_growing_categories,
  });
}
