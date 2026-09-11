import { NextResponse } from "next/server";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

type OrderListRow = {
  id: number;
  created_at?: string | null;
  product?: string | null;
  buyer?: string | null;
  price?: string | number | null;
  status?: string | null;
  product_id?: number | null;
  variant_id?: number | null;
  variant_name?: string | null;
  variant_sku?: string | null;
  quantity?: number | null;
  total_amount?: string | number | null;
  total_price?: string | number | null;
  payment_status?: string | null;
  payment_method?: string | null;
  product_title?: string | null;
  seller_name?: string | null;
  game_name?: string | null;
  category?: string | null;
  escrow_status?: string | null;
  delivered_at?: string | null;
  completed_at?: string | null;
  paid_at?: string | null;
  seller_gross_amount?: string | number | null;
  marketplace_fee_amount?: string | number | null;
  seller_sales_tax_rate_percent?: string | number | null;
  seller_sales_tax_amount?: string | number | null;
  seller_earning_amount?: string | number | null;
  seller_payout_status?: string | null;
  reservation_status?: string | null;
  reservation_expires_at?: string | null;
  expired_at?: string | null;
  delivery_sla_minutes?: number | null;
  delivery_due_at?: string | null;
  delivery_late_at?: string | null;
  delivery_sla_status?: string | null;
  seller_service_level_snapshot?: string | null;
};

const ORDER_LIST_FIELDS = [
  "id",
  "created_at",
  "product",
  "buyer",
  "price",
  "status",
  "product_id",
  "variant_id",
  "variant_name",
  "variant_sku",
  "quantity",
  "total_amount",
  "total_price",
  "payment_status",
  "payment_method",
  "product_title",
  "seller_name",
  "game_name",
  "category",
  "escrow_status",
  "delivered_at",
  "completed_at",
  "paid_at",
  "seller_gross_amount",
  "marketplace_fee_amount",
  "seller_sales_tax_rate_percent",
  "seller_sales_tax_amount",
  "seller_earning_amount",
  "seller_payout_status",
  "reservation_status",
  "reservation_expires_at",
  "expired_at",
  "delivery_sla_minutes",
  "delivery_due_at",
  "delivery_late_at",
  "delivery_sla_status",
  "seller_service_level_snapshot",
].join(",");

function maskEmail(value?: string | null) {
  const email = String(value || "").trim();
  const [local, domain] = email.split("@");

  if (!local || !domain) return email || "Buyer";

  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") === "seller" ? "seller" : "buyer";
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 100)));
    const supabaseAdmin = createSupabaseAdmin();

    let query = supabaseAdmin
      .from("orders")
      .select(ORDER_LIST_FIELDS)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (scope === "seller") {
      query = query.eq("seller_id", user.id);
    } else if (user.email) {
      query = query.or(`buyer_id.eq.${user.id},buyer.eq.${user.email}`);
    } else {
      query = query.eq("buyer_id", user.id);
    }

    const { data: orderRows, error: orderError } = await query;

    if (orderError) {
      throw new Error(orderError.message);
    }

    const orders = ((orderRows || []) as unknown as OrderListRow[]).map(
      (order) => ({
        ...order,
        buyer: scope === "seller" ? maskEmail(order.buyer) : null,
        seller_gross_amount:
          scope === "seller" ? order.seller_gross_amount || null : null,
        marketplace_fee_amount:
          scope === "seller" ? order.marketplace_fee_amount || null : null,
        seller_sales_tax_rate_percent:
          scope === "seller"
            ? order.seller_sales_tax_rate_percent || null
            : null,
        seller_sales_tax_amount:
          scope === "seller" ? order.seller_sales_tax_amount || null : null,
        seller_earning_amount:
          scope === "seller" ? order.seller_earning_amount || null : null,
        seller_payout_status:
          scope === "seller" ? order.seller_payout_status || null : null,
      })
    );

    const productIds = Array.from(
      new Set(
        orders
          .map((order) => Number(order.product_id || 0))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    let products: Array<Record<string, unknown>> = [];

    if (productIds.length > 0) {
      const { data: productRows, error: productError } = await supabaseAdmin
        .from("products")
        .select("id,title,image_url,price,game_name,category,seller_name")
        .in("id", productIds);

      if (productError) {
        throw new Error(productError.message);
      }

      products = productRows || [];
    }

    return NextResponse.json({
      scope,
      userId: user.id,
      orders,
      products,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected order list error.";

    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(message) }
    );
  }
}
