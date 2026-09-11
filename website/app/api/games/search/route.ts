import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAuthClient } from "@/lib/serverSupabase";

function clampLimit(value: string | null) {
  const parsed = Number(value || 12);
  if (!Number.isFinite(parsed)) return 12;
  return Math.min(Math.max(Math.floor(parsed), 1), 50);
}

function normalizeSearchTerm(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSlugTerm(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control":
        status >= 400
          ? "no-store"
          : "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const slug = normalizeSlugTerm(searchParams.get("slug") || "");
  const id = Number(searchParams.get("id") || 0);
  const limit = clampLimit(searchParams.get("limit"));
  const supabase = createSupabaseAuthClient();

  let query = supabase
    .from("game_master")
    .select(
      [
        "id",
        "name",
        "slug",
        "first_letter",
        "image_url",
        "cover_image_url",
        "background_image",
        "offer_count",
        "is_trending",
        "rating",
        "category_id",
      ].join(",")
    )
    .eq("status", "active")
    .eq("is_active", true);

  if (Number.isFinite(id) && id > 0) {
    query = query.eq("id", Math.floor(id)).limit(1);
  } else if (slug) {
    query = query.eq("slug", slug).limit(1);
  } else if (q.length >= 2) {
    const normalizedQuery = normalizeSearchTerm(q);
    const slugQuery = normalizeSlugTerm(q);

    if (!normalizedQuery && !slugQuery) {
      return jsonResponse({ games: [] });
    }

    query = query
      .or(
        [
          `normalized_name.ilike.%${normalizedQuery}%`,
          `name.ilike.%${normalizedQuery}%`,
          `slug.ilike.%${slugQuery}%`,
        ].join(",")
      )
      .order("is_trending", { ascending: false })
      .order("offer_count", { ascending: false })
      .order("name", { ascending: true })
      .limit(limit);
  } else {
    query = query
      .order("is_trending", { ascending: false })
      .order("offer_count", { ascending: false })
      .order("name", { ascending: true })
      .limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ games: data || [] });
}
