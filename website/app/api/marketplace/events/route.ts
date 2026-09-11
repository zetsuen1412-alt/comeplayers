import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  createSupabaseAuthClient,
  getBearerToken,
} from "@/lib/serverSupabase";

const PUBLIC_EVENT_TYPES = new Set([
  "offer_view",
  "product_view",
  "checkout_start",
]);

const MAX_EVENTS_PER_MINUTE = 60;

type ProductAnalyticsRow = {
  id: number | string;
  seller_id: string | null;
  game_name: string | null;
  category: string | null;
  status: string | null;
};

type GameAnalyticsRow = {
  name: string;
  slug: string;
};

type CategoryAnalyticsRow = {
  name: string;
  slug: string;
};

function nullableString(value: unknown, maxLength = 250) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function slugify(value: string | null | undefined) {
  const normalized = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || null;
}

function validSessionId(value: unknown) {
  const sessionId = nullableString(value, 100);
  if (!sessionId) return null;
  return /^[a-zA-Z0-9._:-]{8,100}$/.test(sessionId) ? sessionId : null;
}

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > 3000) return null;

  return JSON.parse(serialized) as Record<string, unknown>;
}

async function authenticatedUserId(request: Request) {
  const token = getBearerToken(request);
  if (!token) return null;

  const supabase = createSupabaseAuthClient();
  const { data } = await supabase.auth.getUser(token);
  return data.user?.id || null;
}

async function isRateLimited(input: {
  userId: string | null;
  sessionId: string | null;
}) {
  const supabaseAdmin = createSupabaseAdmin();
  const since = new Date(Date.now() - 60_000).toISOString();

  const baseQuery = supabaseAdmin
    .from("marketplace_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since)
    .in("event_type", Array.from(PUBLIC_EVENT_TYPES));

  const result = input.userId
    ? await baseQuery.eq("user_id", input.userId)
    : await baseQuery.eq("session_id", input.sessionId);

  if (result.error) {
    console.error("Marketplace event rate-limit lookup failed:", result.error.message);
    return false;
  }

  return Number(result.count || 0) >= MAX_EVENTS_PER_MINUTE;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const eventType = nullableString(body.event_type, 50);

    if (!eventType || !PUBLIC_EVENT_TYPES.has(eventType)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported public marketplace event." },
        { status: 400 }
      );
    }

    const metadata = safeMetadata(body.metadata);
    if (!metadata) {
      return NextResponse.json(
        { ok: false, error: "Marketplace event metadata is too large." },
        { status: 400 }
      );
    }

    const userId = await authenticatedUserId(request);
    const sessionId = validSessionId(body.session_id);

    if (!userId && !sessionId) {
      return NextResponse.json(
        { ok: false, error: "A valid analytics session is required." },
        { status: 400 }
      );
    }

    if (await isRateLimited({ userId, sessionId })) {
      return NextResponse.json(
        { ok: false, error: "Too many marketplace events." },
        { status: 429 }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    let sellerId: string | null = null;
    let productId: number | null = null;
    let gameSlug: string | null = null;
    let gameName: string | null = null;
    let categorySlug: string | null = null;
    let categoryName: string | null = null;

    if (eventType === "offer_view") {
      const requestedGameSlug = nullableString(body.game_slug, 150);
      if (!requestedGameSlug) {
        return NextResponse.json(
          { ok: false, error: "Game is required for offer views." },
          { status: 400 }
        );
      }

      const { data: gameData, error: gameError } = await supabaseAdmin
        .from("game_master")
        .select("name,slug")
        .eq("slug", requestedGameSlug)
        .eq("status", "active")
        .maybeSingle();

      if (gameError) {
        console.error("Marketplace event game lookup failed:", gameError.message);
        return NextResponse.json(
          { ok: false, error: "Unable to validate marketplace event." },
          { status: 500 }
        );
      }

      if (!gameData) {
        return NextResponse.json(
          { ok: false, error: "Active game was not found." },
          { status: 404 }
        );
      }

      const game = gameData as GameAnalyticsRow;
      gameSlug = game.slug;
      gameName = game.name;

      const requestedCategorySlug = nullableString(body.category_slug, 150);
      if (requestedCategorySlug) {
        const { data: categoryData, error: categoryError } = await supabaseAdmin
          .from("categories")
          .select("name,slug")
          .eq("slug", requestedCategorySlug)
          .maybeSingle();

        if (categoryError) {
          console.error(
            "Marketplace event category lookup failed:",
            categoryError.message
          );
        } else if (categoryData) {
          const category = categoryData as CategoryAnalyticsRow;
          categorySlug = category.slug;
          categoryName = category.name;
        }
      }
    } else {
      productId = positiveInteger(body.product_id);
      if (!productId) {
        return NextResponse.json(
          { ok: false, error: "Product is required for this event." },
          { status: 400 }
        );
      }

      const { data: productData, error: productError } = await supabaseAdmin
        .from("products")
        .select("id,seller_id,game_name,category,status")
        .eq("id", productId)
        .eq("status", "active")
        .maybeSingle();

      if (productError) {
        console.error("Marketplace event product lookup failed:", productError.message);
        return NextResponse.json(
          { ok: false, error: "Unable to validate marketplace event." },
          { status: 500 }
        );
      }

      if (!productData) {
        return NextResponse.json(
          { ok: false, error: "Active product was not found." },
          { status: 404 }
        );
      }

      const product = productData as ProductAnalyticsRow;
      sellerId = product.seller_id;
      gameName = product.game_name;
      gameSlug = slugify(product.game_name);
      categoryName = product.category;
      categorySlug = slugify(product.category);
    }

    const { error } = await supabaseAdmin.from("marketplace_events").insert({
      event_type: eventType,
      user_id: userId,
      session_id: sessionId,
      seller_id: sellerId,
      product_id: productId,
      order_id: null,
      game_slug: gameSlug,
      game_name: gameName,
      category_slug: categorySlug,
      category_name: categoryName,
      page_path: nullableString(body.page_path, 500),
      referrer: nullableString(body.referrer, 500),
      metadata: {
        ...metadata,
        trusted: false,
        source: "browser",
      },
    });

    if (error) {
      console.error("Marketplace event insert failed:", error.message);
      return NextResponse.json(
        { ok: false, error: "Unable to record marketplace event." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Marketplace event route failed:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { ok: false, error: "Unable to record marketplace event." },
      { status: 500 }
    );
  }
}
