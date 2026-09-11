import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "@/lib/serverSupabase";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") || "").trim().slice(0, 100).replace(/[(),%_\\]/g, " ");
  const category = (params.get("category") || "").trim();
  const cursor = Number(params.get("cursor") || 0);
  const limit = 32;
  const db = createSupabaseAuthClient();
  let lookup = db.from("products").select("id,title,slug,price,min_variant_price,image_url,category,game_name,seller_name,stock,created_at")
    .eq("status", "active").order("id", { ascending: false }).limit(limit + 1);
  if (params.get("images") !== "all") lookup = lookup.not("image_url", "is", null).neq("image_url", "");
  if (Number.isSafeInteger(cursor) && cursor > 0) lookup = lookup.lt("id", cursor);
  if (query) lookup = lookup.or(`title.ilike.%${query}%,game_name.ilike.%${query}%,category.ilike.%${query}%`);
  if (category) {
    const result = await db.from("categories").select("id,name,slug").eq("slug", category).maybeSingle();
    if (result.error) return NextResponse.json({ error: "Could not load categories." }, { status: 503 });
    if (!result.data) return NextResponse.json({ products: [], nextCursor: null });
    lookup = lookup.eq("category_id", result.data.id);
  }
  const { data, error } = await lookup;
  if (error) return NextResponse.json({ error: "Could not load the marketplace." }, { status: 503 });
  const rows = (data || []).slice(0, limit);
  return NextResponse.json({
    products: rows.map(row => ({ ...row, price: row.min_variant_price ?? row.price, href: `/product/${row.slug || row.id}` })),
    nextCursor: (data || []).length > limit ? rows.at(-1)?.id : null,
  });
}
