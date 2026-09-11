import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type TrustedMarketplaceEventType = "payment_success" | "order_complete";

type TrustedEventInput = {
  supabaseAdmin: SupabaseClient;
  eventType: TrustedMarketplaceEventType;
  orderId: number;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

type OrderEventRow = {
  id: number | string;
  buyer_id: string | null;
  seller_id: string | null;
  product_id: number | string | null;
};

type ProductEventRow = {
  id: number | string;
  seller_id: string | null;
  game_name: string | null;
  category: string | null;
};

function slugify(value: string | null | undefined) {
  const normalized = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || null;
}

/**
 * Records payment/order conversion events only after the related server-side
 * business operation has succeeded. Analytics failures never fail checkout.
 */
export async function recordTrustedMarketplaceEvent(
  input: TrustedEventInput
): Promise<boolean> {
  try {
    const { data: orderData, error: orderError } = await input.supabaseAdmin
      .from("orders")
      .select("id,buyer_id,seller_id,product_id")
      .eq("id", input.orderId)
      .maybeSingle();

    if (orderError || !orderData) {
      console.error("Trusted marketplace event order lookup failed:", {
        orderId: input.orderId,
        message: orderError?.message || "Order not found",
      });
      return false;
    }

    const order = orderData as OrderEventRow;
    const productId = Number(order.product_id || 0);
    let product: ProductEventRow | null = null;

    if (Number.isFinite(productId) && productId > 0) {
      const { data: productData, error: productError } =
        await input.supabaseAdmin
          .from("products")
          .select("id,seller_id,game_name,category")
          .eq("id", productId)
          .maybeSingle();

      if (productError) {
        console.error("Trusted marketplace event product lookup failed:", {
          orderId: input.orderId,
          productId,
          message: productError.message,
        });
      } else {
        product = (productData || null) as ProductEventRow | null;
      }
    }

    const { error: insertError } = await input.supabaseAdmin
      .from("marketplace_events")
      .insert({
        event_type: input.eventType,
        user_id: input.userId || order.buyer_id || null,
        session_id: null,
        seller_id: order.seller_id || product?.seller_id || null,
        product_id: productId > 0 ? productId : null,
        order_id: Number(order.id),
        game_slug: slugify(product?.game_name),
        game_name: product?.game_name || null,
        category_slug: slugify(product?.category),
        category_name: product?.category || null,
        page_path: null,
        referrer: null,
        metadata: {
          trusted: true,
          source: "server",
          ...(input.metadata || {}),
        },
      });

    if (insertError) {
      console.error("Trusted marketplace event insert failed:", {
        orderId: input.orderId,
        eventType: input.eventType,
        message: insertError.message,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error("Trusted marketplace event failed:", {
      orderId: input.orderId,
      eventType: input.eventType,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}
