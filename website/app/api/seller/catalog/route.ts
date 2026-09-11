import { NextResponse } from "next/server";
import {
  requireApprovedSeller,
  sellerErrorStatus,
} from "@/lib/sellerSecurity";
import {
  createProductPolicyReview,
  evaluateProductPolicyWithDatabase,
  supersedePendingProductPolicyReviews,
} from "@/lib/productPolicyServer";
import {
  convertCurrencyToUsd,
  fallbackExchangeRateMap,
  fetchFrankfurterRates,
} from "@/lib/frankfurter";
import { normalizeCurrency, type SupportedCurrency } from "@/lib/localization";

function clean(value: unknown, maxLength = 5000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function integer(value: unknown, fallback = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanTags(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim());

  const unique = new Map<string, string>();
  for (const item of source) {
    const tag = clean(item, 40).replace(/\s+/g, " ");
    const key = tag.toLowerCase();
    if (!key || unique.has(key)) continue;
    unique.set(key, tag);
    if (unique.size >= 12) break;
  }
  return Array.from(unique.values());
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function uniqueSlug(
  supabaseAdmin: ReturnType<typeof import("@/lib/serverSupabase").createSupabaseAdmin>,
  requested: string,
  productId?: number
) {
  const base = slugify(requested) || `listing-${Date.now()}`;
  let candidate = base;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    let query = supabaseAdmin.from("products").select("id").eq("slug", candidate);
    if (productId) query = query.neq("id", productId);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
    candidate = `${base}-${attempt + 2}`;
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function validateProduct(body: Record<string, unknown>, partial = false) {
  const title = clean(body.title, 180);
  const description = clean(body.description, 10000);
  const price = money(body.price);
  const priceCurrency = normalizeCurrency(String(body.priceCurrency || "USD")) as SupportedCurrency;
  const stock = integer(body.stock);
  const deliveryEtaMinutes = integer(body.deliveryEtaMinutes, 60);
  const category = clean(body.category, 120);
  const categoryId = integer(body.categoryId);
  const gameName = clean(body.gameName, 160);
  const gameId = integer(body.gameId);
  const imageUrl = clean(body.imageUrl, 1000);
  const offerRegion = clean(body.offerRegion || "Global", 80) || "Global";
  const offerPlatform = clean(body.offerPlatform || "Any", 80) || "Any";
  const offerServer = clean(body.offerServer, 100);
  const offerFaction = clean(body.offerFaction, 80);
  const offerTags = cleanTags(body.offerTags);
  const slug = clean(body.slug || title, 220);

  if (!partial || "title" in body) {
    if (title.length < 4) throw new Error("Product title must contain at least 4 characters.");
  }
  if (!partial || "description" in body) {
    if (description.length < 20) throw new Error("Product description must contain at least 20 characters.");
  }
  if (!partial || "price" in body) {
    if (price <= 0 || price > 1_000_000_000) throw new Error("Product price is invalid.");
  }
  if (!partial || "stock" in body) {
    if (stock < 0 || stock > 1_000_000) throw new Error("Product stock is invalid.");
  }
  if (!partial || "deliveryEtaMinutes" in body) {
    if (deliveryEtaMinutes < 15 || deliveryEtaMinutes > 10080) {
      throw new Error("Delivery ETA must be between 15 minutes and 7 days.");
    }
  }
  if (!partial || "categoryId" in body) {
    if (categoryId <= 0 || !category) throw new Error("A valid category is required.");
  }
  if (!partial || "gameId" in body) {
    if (gameId <= 0 || !gameName) throw new Error("A valid game is required.");
  }

  return {
    title,
    description,
    price,
    priceCurrency,
    stock,
    deliveryEtaMinutes,
    category,
    categoryId,
    gameName,
    gameId,
    imageUrl,
    offerRegion,
    offerPlatform,
    offerServer,
    offerFaction,
    offerTags,
    slug,
  };
}

async function canonicalPrice(amount: number, currency: SupportedCurrency) {
  const rates = await fetchFrankfurterRates()
    .then((result) => result.rates)
    .catch(() => fallbackExchangeRateMap());
  const value = convertCurrencyToUsd(amount, currency, rates);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Product price is invalid.");
  return value;
}

async function sendListingNotifications({
  supabaseAdmin,
  sellerId,
  productId,
  title,
  slug,
}: {
  supabaseAdmin: ReturnType<typeof import("@/lib/serverSupabase").createSupabaseAdmin>;
  sellerId: string;
  productId: number;
  title: string;
  slug: string;
}) {
  const { data: followerRows } = await supabaseAdmin
    .from("seller_followers")
    .select("user_id")
    .eq("seller_id", sellerId);

  const followers = Array.from(
    new Set((followerRows || []).map((row) => String(row.user_id || "")).filter(Boolean))
  );

  if (followers.length === 0) return;

  await supabaseAdmin.from("notifications").insert(
    followers.map((userId) => ({
      user_id: userId,
      type: "seller_new_product",
      title: "New Seller Listing",
      message: `${title} is now available.`,
      link_url: `/product/${slug || productId}`,
      is_read: false,
    }))
  );
}

async function notifyWishlistChanges({
  supabaseAdmin,
  productId,
  title,
  slug,
  oldPrice,
  newPrice,
  oldStock,
  newStock,
}: {
  supabaseAdmin: ReturnType<typeof import("@/lib/serverSupabase").createSupabaseAdmin>;
  productId: number;
  title: string;
  slug: string;
  oldPrice: number;
  newPrice: number;
  oldStock: number;
  newStock: number;
}) {
  const priceDrop = oldPrice > 0 && newPrice < oldPrice;
  const backInStock = oldStock <= 0 && newStock > 0;
  if (!priceDrop && !backInStock) return;

  const { data: rows } = await supabaseAdmin
    .from("wishlists")
    .select("user_id")
    .eq("product_id", productId);

  const userIds = Array.from(
    new Set((rows || []).map((row) => String(row.user_id || "")).filter(Boolean))
  );
  if (userIds.length === 0) return;

  const notifications: Array<Record<string, unknown>> = [];
  for (const userId of userIds) {
    if (priceDrop) {
      notifications.push({
        user_id: userId,
        type: "wishlist_price_drop",
        title: "Wishlist Price Drop",
        message: `${title} now has a lower price.`,
        link_url: `/product/${slug || productId}`,
        is_read: false,
      });
    }
    if (backInStock) {
      notifications.push({
        user_id: userId,
        type: "wishlist_back_in_stock",
        title: "Back In Stock",
        message: `${title} is available again.`,
        link_url: `/product/${slug || productId}`,
        is_read: false,
      });
    }
  }

  await supabaseAdmin.from("notifications").insert(notifications);
}

export async function GET(request: Request) {
  try {
    const { user, profile, supabaseAdmin } = await requireApprovedSeller(request);
    const { data, error } = await supabaseAdmin
      .from("products")
      .select(
        "id,title,description,price,seller_price_currency,seller_price_amount,stock,image_url,status,category,category_id,game_name,game_category_id,slug,delivery_eta_minutes,has_variants,variant_count,min_variant_price,max_variant_price,offer_region,offer_platform,offer_server,offer_faction,offer_tags,policy_status,policy_reasons,policy_checked_at,policy_review_id,created_at,updated_at"
      )
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      profile: {
        id: user.id,
        email: user.email || null,
        seller_name: profile.seller_name || null,
        username: profile.username || null,
      },
      products: data || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected catalog error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const { user, profile, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as Record<string, unknown>;
    const input = validateProduct(body);
    const price = await canonicalPrice(input.price, input.priceCurrency);
    const sellerName = clean(profile.seller_name || profile.username || user.email || "Seller", 160);
    const slug = await uniqueSlug(supabaseAdmin, input.slug || input.title);
    const policy = await evaluateProductPolicyWithDatabase({
      supabaseAdmin,
      title: input.title,
      description: input.description,
      category: input.category,
      gameName: input.gameName,
      tags: input.offerTags,
    });
    const policyStatus = policy.decision === "allow"
      ? "allowed"
      : policy.decision === "review"
        ? "pending_review"
        : "blocked";

    const { data, error } = await supabaseAdmin
      .from("products")
      .insert({
        title: input.title,
        description: input.description,
        price,
        seller_price_currency: input.priceCurrency,
        seller_price_amount: input.price,
        stock: input.stock,
        delivery_eta_minutes: input.deliveryEtaMinutes,
        category: input.category,
        category_id: input.categoryId,
        game_name: input.gameName,
        game_category_id: input.gameId,
        seller: sellerName,
        seller_id: user.id,
        seller_name: sellerName,
        image_url: input.imageUrl || null,
        offer_region: input.offerRegion,
        offer_platform: input.offerPlatform,
        offer_server: input.offerServer || null,
        offer_faction: input.offerFaction || null,
        offer_tags: input.offerTags,
        slug,
        status: policy.decision === "allow" ? "active" : "inactive",
        policy_status: policyStatus,
        policy_reasons: policy.reasons,
        policy_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error || !data) throw new Error(error?.message || "Failed to create product.");

    let policyReviewId: number | null = null;
    if (policy.decision !== "allow") {
      policyReviewId = await createProductPolicyReview({
        supabaseAdmin,
        productId: Number(data.id),
        sellerId: user.id,
        decision: policy.decision,
        severity: policy.severity === "info" ? "medium" : policy.severity,
        matchedRules: policy.matchedRules,
        reasons: policy.reasons,
        listingSnapshot: data as Record<string, unknown>,
      });
    } else {
      await sendListingNotifications({
        supabaseAdmin,
        sellerId: user.id,
        productId: Number(data.id),
        title: String(data.title || input.title),
        slug: String(data.slug || slug),
      });
    }

    return NextResponse.json(
      { product: data, policy: { ...policy, reviewId: policyReviewId } },
      { status: policy.decision === "allow" ? 201 : 202 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected product creation error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, profile, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as Record<string, unknown>;
    const productId = integer(body.productId);
    const action = clean(body.action || "update", 30).toLowerCase();

    if (productId <= 0) throw new Error("Invalid product ID.");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("seller_id", user.id)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (!existing) throw new Error("Product not found.");

    if (action === "status") {
      const status = clean(body.status, 20).toLowerCase();
      if (!["active", "inactive"].includes(status)) throw new Error("Invalid product status.");
      if (status === "active" && Number(existing.stock || 0) <= 0) {
        throw new Error("Add stock before activating this product.");
      }
      if (
        status === "active" &&
        ["pending_review", "blocked", "rejected"].includes(String(existing.policy_status || ""))
      ) {
        throw new Error("This product cannot be activated until compliance review is completed.");
      }

      const { data, error } = await supabaseAdmin
        .from("products")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", productId)
        .eq("seller_id", user.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ product: data });
    }

    const input = validateProduct(body);
    const price = await canonicalPrice(input.price, input.priceCurrency);
    const sellerName = clean(profile.seller_name || profile.username || user.email || "Seller", 160);
    const slug = await uniqueSlug(supabaseAdmin, input.slug || input.title, productId);
    const effectiveStock = Boolean(existing.has_variants) ? Number(existing.stock || 0) : input.stock;
    const effectivePrice = Boolean(existing.has_variants) ? Number(existing.price || 0) : price;
    const policy = await evaluateProductPolicyWithDatabase({
      supabaseAdmin,
      title: input.title,
      description: input.description,
      category: input.category,
      gameName: input.gameName,
      tags: input.offerTags,
    });
    const policyStatus = policy.decision === "allow"
      ? "allowed"
      : policy.decision === "review"
        ? "pending_review"
        : "blocked";

    const { data, error } = await supabaseAdmin
      .from("products")
      .update({
        title: input.title,
        description: input.description,
        price: effectivePrice,
        ...(!Boolean(existing.has_variants)
          ? {
              seller_price_currency: input.priceCurrency,
              seller_price_amount: input.price,
            }
          : {}),
        stock: effectiveStock,
        delivery_eta_minutes: input.deliveryEtaMinutes,
        category: input.category,
        category_id: input.categoryId,
        game_name: input.gameName,
        game_category_id: input.gameId,
        seller_name: sellerName,
        seller: sellerName,
        image_url: input.imageUrl || null,
        offer_region: input.offerRegion,
        offer_platform: input.offerPlatform,
        offer_server: input.offerServer || null,
        offer_faction: input.offerFaction || null,
        offer_tags: input.offerTags,
        slug,
        status:
          policy.decision === "allow" && effectiveStock > 0
            ? String(existing.status || "active")
            : "inactive",
        policy_status: policyStatus,
        policy_reasons: policy.reasons,
        policy_checked_at: new Date().toISOString(),
        policy_review_id: policy.decision === "allow" ? null : existing.policy_review_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId)
      .eq("seller_id", user.id)
      .select("*")
      .single();

    if (error || !data) throw new Error(error?.message || "Failed to update product.");

    let policyReviewId: number | null = null;
    if (policy.decision !== "allow") {
      policyReviewId = await createProductPolicyReview({
        supabaseAdmin,
        productId,
        sellerId: user.id,
        decision: policy.decision,
        severity: policy.severity === "info" ? "medium" : policy.severity,
        matchedRules: policy.matchedRules,
        reasons: policy.reasons,
        listingSnapshot: data as Record<string, unknown>,
      });
    }

    if (policy.decision === "allow") {
      await supersedePendingProductPolicyReviews({
        supabaseAdmin,
        productId,
      });
      await notifyWishlistChanges({
        supabaseAdmin,
        productId,
        title: input.title,
        slug,
        oldPrice: Number(existing.price || 0),
        newPrice: Number(data.price || 0),
        oldStock: Number(existing.stock || 0),
        newStock: Number(data.stock || 0),
      });
    }

    return NextResponse.json({
      product: data,
      policy: { ...policy, reviewId: policyReviewId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected product update error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as Record<string, unknown>;
    const productId = integer(body.productId);
    if (productId <= 0) throw new Error("Invalid product ID.");

    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id,title")
      .eq("id", productId)
      .eq("seller_id", user.id)
      .maybeSingle();
    if (productError) throw new Error(productError.message);
    if (!product) throw new Error("Product not found.");

    const { count, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);
    if (orderError) throw new Error(orderError.message);

    if ((count || 0) > 0) {
      const { error } = await supabaseAdmin
        .from("products")
        .update({ status: "inactive", updated_at: new Date().toISOString() })
        .eq("id", productId)
        .eq("seller_id", user.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, archived: true });
    }

    const { error } = await supabaseAdmin
      .from("products")
      .delete()
      .eq("id", productId)
      .eq("seller_id", user.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, archived: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected product delete error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}
