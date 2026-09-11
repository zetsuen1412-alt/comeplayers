import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import {
  requireApprovedSeller,
  sellerErrorStatus,
} from "@/lib/sellerSecurity";

const PROFILE_FIELDS = [
  "id",
  "email",
  "username",
  "seller_name",
  "avatar_url",
  "seller_status",
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
  "image_url",
  "game_name",
  "category",
  "price",
  "stock",
  "status",
  "has_variants",
  "min_variant_price",
  "max_variant_price",
  "product_rating",
  "product_review_count",
  "created_at",
].join(",");

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "account",
  "seller",
  "sellers",
  "store",
  "marketplace",
  "support",
  "help",
  "about",
  "login",
  "signup",
]);

function clean(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function optionalUrl(value: unknown) {
  const input = clean(value, 1000);
  if (!input) return "";

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("Banner and logo must use a valid http or https URL.");
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("Banner and logo must use a valid http or https URL.");
  }

  return parsed.toString();
}

function normalizeSlug(value: unknown) {
  return clean(value, 40)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeFeatured(value: unknown) {
  if (!Array.isArray(value)) return [] as number[];

  const ids = Array.from(
    new Set(
      value
        .map((item) => Math.floor(Number(item)))
        .filter((item) => Number.isFinite(item) && item > 0)
    )
  );

  if (ids.length > 8) {
    throw new Error("Select at most 8 featured products.");
  }

  return ids;
}

function normalizePolicies(value: unknown) {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    delivery: clean(input.delivery, 1500),
    refund: clean(input.refund, 1500),
    support: clean(input.support, 1500),
  };
}

function validateBody(body: Record<string, unknown>) {
  const storeSlug = normalizeSlug(body.storeSlug);
  const storeName = clean(body.storeName, 80);
  const storeTagline = clean(body.storeTagline, 120);
  const storeDescription = clean(body.storeDescription, 2000);
  const storeBannerUrl = optionalUrl(body.storeBannerUrl);
  const storeLogoUrl = optionalUrl(body.storeLogoUrl);
  const storeAnnouncement = clean(body.storeAnnouncement, 280);
  const storeVacationMessage = clean(body.storeVacationMessage, 500);
  const storeAccentColor = clean(body.storeAccentColor || "#22d3ee", 7);
  const storeVacationMode = Boolean(body.storeVacationMode);
  const storeIsPublished = body.storeIsPublished !== false;
  const featuredProductIds = normalizeFeatured(body.featuredProductIds);
  const storePolicies = normalizePolicies(body.storePolicies);

  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(storeSlug)) {
    throw new Error("Store slug must be 3-40 lowercase letters, numbers, or dashes.");
  }
  if (RESERVED_SLUGS.has(storeSlug)) {
    throw new Error("This store URL is reserved.");
  }
  if (storeName.length < 3) {
    throw new Error("Store name must contain at least 3 characters.");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(storeAccentColor)) {
    throw new Error("Accent color must use a 6-digit hex value, for example #22d3ee.");
  }

  let storeReopensAt: string | null = null;
  if (body.storeReopensAt) {
    const date = new Date(String(body.storeReopensAt));
    if (Number.isNaN(date.getTime())) {
      throw new Error("Vacation reopen time is invalid.");
    }
    storeReopensAt = date.toISOString();
  }

  return {
    storeSlug,
    storeName,
    storeTagline,
    storeDescription,
    storeBannerUrl,
    storeLogoUrl,
    storeAccentColor: storeAccentColor.toLowerCase(),
    storeAnnouncement,
    storePolicies,
    storeVacationMode,
    storeVacationMessage,
    storeReopensAt,
    storeIsPublished,
    featuredProductIds,
  };
}

export async function GET(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);

    const [profileResult, productsResult, featuredResult] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select(PROFILE_FIELDS)
        .eq("id", user.id)
        .single(),
      supabaseAdmin
        .from("products")
        .select(PRODUCT_FIELDS)
        .eq("seller_id", user.id)
        .neq("status", "archived")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("seller_store_featured_products")
        .select("product_id,sort_order")
        .eq("seller_id", user.id)
        .order("sort_order", { ascending: true }),
    ]);

    if (profileResult.error) throw new Error(profileResult.error.message);
    if (productsResult.error) throw new Error(productsResult.error.message);
    if (featuredResult.error) throw new Error(featuredResult.error.message);

    return NextResponse.json({
      profile: profileResult.data,
      products: productsResult.data || [],
      featuredProductIds: (featuredResult.data || []).map((row) => Number(row.product_id)),
    });
  } catch (error) {
    const status = sellerErrorStatus(error);
    console.error("Seller storefront read failed:", error);
    return NextResponse.json(
      {
        error: safeApiErrorMessage(
          error,
          "Unable to load the seller storefront.",
          status,
        ),
      },
      { status },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as Record<string, unknown>;
    const input = validateBody(body);

    const { error: rpcError } = await supabaseAdmin.rpc(
      "cp_update_seller_storefront_v16",
      {
        p_seller_id: user.id,
        p_store_slug: input.storeSlug,
        p_store_name: input.storeName,
        p_store_tagline: input.storeTagline || null,
        p_store_description: input.storeDescription || null,
        p_store_banner_url: input.storeBannerUrl || null,
        p_store_logo_url: input.storeLogoUrl || null,
        p_store_accent_color: input.storeAccentColor,
        p_store_announcement: input.storeAnnouncement || null,
        p_store_policies: input.storePolicies,
        p_store_vacation_mode: input.storeVacationMode,
        p_store_vacation_message: input.storeVacationMessage || null,
        p_store_reopens_at: input.storeReopensAt,
        p_store_is_published: input.storeIsPublished,
        p_featured_product_ids: input.featuredProductIds,
      }
    );

    if (rpcError) throw new Error(rpcError.message);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select(PROFILE_FIELDS)
      .eq("id", user.id)
      .single();

    if (profileError) throw new Error(profileError.message);

    return NextResponse.json({
      success: true,
      profile,
      featuredProductIds: input.featuredProductIds,
      publicUrl: `/store/${input.storeSlug}`,
    });
  } catch (error) {
    const status = sellerErrorStatus(error);
    console.error("Seller storefront update failed:", error);
    return NextResponse.json(
      {
        error: safeApiErrorMessage(
          error,
          "Unable to save the seller storefront.",
          status,
        ),
      },
      { status },
    );
  }
}
