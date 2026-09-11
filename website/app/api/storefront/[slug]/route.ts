import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/serverSupabase";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type StoreProfileRow = {
  id: string;
  seller_status?: string | null;
  [key: string]: unknown;
};

type ProductRow = {
  id: number | string;
  [key: string]: unknown;
};

const PROFILE_FIELDS = [
  "id",
  "username",
  "seller_name",
  "seller_status",
  "avatar_url",
  "created_at",
  "seller_presence_mode",
  "seller_last_seen_at",
  "seller_delivery_sla_minutes",
  "seller_avg_delivery_minutes",
  "seller_on_time_rate",
  "seller_total_deliveries",
  "seller_late_deliveries",
  "seller_service_level",
  "seller_rating",
  "seller_review_count",
  "seller_response_rate",
  "store_slug",
  "store_name",
  "store_tagline",
  "store_description",
  "store_banner_url",
  "store_logo_url",
  "store_accent_color",
  "store_announcement",
  "store_policies",
  "store_vacation_mode",
  "store_vacation_message",
  "store_reopens_at",
  "store_is_published",
  "store_updated_at",
].join(",");

const PRODUCT_FIELDS = [
  "id",
  "title",
  "slug",
  "description",
  "image_url",
  "game_name",
  "category",
  "price",
  "stock",
  "status",
  "delivery_eta_minutes",
  "offer_region",
  "offer_platform",
  "offer_server",
  "has_variants",
  "variant_count",
  "min_variant_price",
  "max_variant_price",
  "product_rating",
  "product_review_count",
  "created_at",
].join(",");

function normalizeSlug(value: string) {
  return value.trim().toLowerCase();
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug: slugParam } = await context.params;
    const slug = normalizeSlug(decodeURIComponent(slugParam || ""));

    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(slug)) {
      return NextResponse.json({ error: "Storefront not found." }, { status: 404 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select(PROFILE_FIELDS)
      .ilike("store_slug", slug)
      .eq("store_is_published", true)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);
    if (!profile) {
      return NextResponse.json({ error: "Storefront not found." }, { status: 404 });
    }

    const storeProfile = profile as unknown as StoreProfileRow;
    const sellerStatus = String(storeProfile.seller_status || "").toLowerCase();
    if (sellerStatus && sellerStatus !== "approved") {
      return NextResponse.json({ error: "Storefront not found." }, { status: 404 });
    }

    const sellerId = String(storeProfile.id);
    const [productsResult, featuredResult, followersResult, completedResult] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select(PRODUCT_FIELDS)
        .eq("seller_id", sellerId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .range(0, 199),
      supabaseAdmin
        .from("seller_store_featured_products")
        .select("product_id,sort_order")
        .eq("seller_id", sellerId)
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("seller_followers")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", sellerId),
      supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", sellerId)
        .in("status", ["completed", "Completed", "Selesai"]),
    ]);

    if (productsResult.error) throw new Error(productsResult.error.message);
    if (featuredResult.error) throw new Error(featuredResult.error.message);
    if (followersResult.error) throw new Error(followersResult.error.message);
    if (completedResult.error) throw new Error(completedResult.error.message);

    const products = (productsResult.data || []) as unknown as ProductRow[];
    const featuredIds = (featuredResult.data || []).map((row) => Number(row.product_id));
    const productById = new Map(products.map((product) => [Number(product.id), product]));
    const featuredProducts = featuredIds
      .map((id) => productById.get(id))
      .filter(Boolean);

    return NextResponse.json({
      store: storeProfile,
      products,
      featuredProducts,
      stats: {
        followers: followersResult.count || 0,
        completedOrders: completedResult.count || 0,
        activeProducts: products.length,
      },
    });
  } catch (error) {
    console.error("Public storefront route failed:", error);
    return NextResponse.json(
      { error: "Unable to load this storefront." },
      { status: 500 },
    );
  }
}
