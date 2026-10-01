import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  requireAdmin,
} from "@/lib/adminSecurity";
import {
  buildCatalogOpportunity,
  type CatalogOpportunityCategoryCode,
} from "@/lib/catalogOpportunity";

export const runtime = "nodejs";

const CATEGORY_CODES = new Set<CatalogOpportunityCategoryCode>([
  "account",
  "boosting",
  "coin",
  "item",
]);
const MAX_PAGE = 1_000;
const MAX_PAGE_SIZE = 50;

type GameRow = {
  id: number;
  name: string;
  slug: string;
  status: string;
  is_active: boolean;
};

type CategoryRow = {
  game_id: number;
  category_code: CatalogOpportunityCategoryCode;
  source_url: string | null;
  game_master: GameRow | GameRow[] | null;
};

function badRequest(message: string) {
  return Object.assign(new Error(message), { status: 400 });
}

function positiveInteger(value: string | null, fallback: number, name: string) {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw badRequest(`Invalid ${name}.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw badRequest(`Invalid ${name}.`);
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requireAdmin(request);
    const params = new URL(request.url).searchParams;
    const page = positiveInteger(params.get("page"), 1, "page");
    const pageSize = Math.min(
      positiveInteger(params.get("pageSize"), MAX_PAGE_SIZE, "pageSize"),
      MAX_PAGE_SIZE
    );
    if (page > MAX_PAGE) throw badRequest(`Page must be at most ${MAX_PAGE}.`);

    const rawCategory = (params.get("category") || "").trim().toLowerCase();
    if (
      rawCategory &&
      rawCategory !== "all" &&
      !CATEGORY_CODES.has(rawCategory as CatalogOpportunityCategoryCode)
    ) {
      throw badRequest("Invalid category.");
    }
    const category = rawCategory === "all" ? "" : rawCategory as CatalogOpportunityCategoryCode | "";
    // Remove LIKE wildcards and PostgREST filter punctuation from user search.
    const search = (params.get("search") || "")
      .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

    let query = supabaseAdmin
      .from("game_marketplace_categories")
      .select(
        "game_id,category_code,source_url,game_master!inner(id,name,slug,status,is_active)",
        { count: "exact" }
      )
      .eq("source_provider", "g2g")
      .in("category_code", [...CATEGORY_CODES])
      .eq("game_master.status", "active")
      .eq("game_master.is_active", true);

    if (category) query = query.eq("category_code", category);
    if (search) query = query.ilike("game_master.name", `%${search}%`);

    const from = (page - 1) * pageSize;
    const { data, count, error } = await query
      .order("game_id", { ascending: true })
      .order("category_code", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);

    const items = ((data || []) as CategoryRow[]).flatMap((row) => {
      const game = Array.isArray(row.game_master)
        ? row.game_master[0]
        : row.game_master;
      if (!game || !CATEGORY_CODES.has(row.category_code)) return [];

      return [
        buildCatalogOpportunity({
          gameId: game.id,
          gameName: game.name,
          gameSlug: game.slug,
          categoryCode: row.category_code,
          sourceUrl: row.source_url,
        }),
      ];
    });

    return NextResponse.json(
      { items, total: count || 0, page, pageSize },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected catalog error.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}
