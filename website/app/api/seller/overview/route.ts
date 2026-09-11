import { NextResponse } from "next/server";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

function numberValue(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select(
        "id,email,username,role,seller_status,seller_name,avatar_url,seller_rating,seller_review_count,seller_presence_mode,seller_last_seen_at,seller_delivery_sla_minutes,seller_avg_delivery_minutes,seller_on_time_rate,seller_total_deliveries,seller_late_deliveries,seller_service_level,seller_service_metrics_updated_at"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);

    const role = String(profile?.role || "").toLowerCase();
    const sellerStatus = String(profile?.seller_status || "").toLowerCase();
    const approved =
      role === "admin" || role === "seller" || sellerStatus === "approved";

    if (!approved) {
      return NextResponse.json(
        {
          error: "Approved seller access required.",
          sellerStatus: sellerStatus || "not_applied",
        },
        { status: 403 }
      );
    }

    const [
      productsResult,
      activeProductsResult,
      ordersResult,
      recentOrdersResult,
      walletResult,
      followersResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", user.id),
      supabaseAdmin
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", user.id)
        .eq("status", "active"),
      supabaseAdmin
        .from("orders")
        .select(
          "id,status,payment_status,escrow_status,total_amount,total_price,seller_earning_amount,delivery_due_at,delivery_sla_status,delivered_at"
        )
        .eq("seller_id", user.id)
        .range(0, 9999),
      supabaseAdmin
        .from("orders")
        .select(
          "id,product_title,product,buyer_id,total_amount,total_price,status,payment_status,escrow_status,created_at,delivery_due_at,delivery_sla_status,delivered_at"
        )
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabaseAdmin
        .from("wallets")
        .select("balance,pending_balance,total_earned,total_withdrawn,status")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("seller_followers")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", user.id),
    ]);

    const orders = ordersResult.data || [];
    const paidOrders = orders.filter(
      (order) =>
        String(order.payment_status || "").toLowerCase() === "paid"
    );
    const awaitingDelivery = orders.filter(
      (order) =>
        String(order.status || "").toLowerCase() === "paid" &&
        String(order.escrow_status || "").toLowerCase() === "holding"
    );
    const completedOrders = orders.filter(
      (order) => String(order.status || "").toLowerCase() === "completed"
    );
    const lateOrders = orders.filter((order) => {
      if (order.delivered_at) {
        return String(order.delivery_sla_status || "").toLowerCase() === "completed_late";
      }

      const dueAt = order.delivery_due_at
        ? Date.parse(String(order.delivery_due_at))
        : Number.NaN;

      return (
        String(order.payment_status || "").toLowerCase() === "paid" &&
        Number.isFinite(dueAt) &&
        dueAt < Date.now()
      );
    });
    const lifetimeEarnings = completedOrders.reduce(
      (sum, order) =>
        sum +
        numberValue(
          order.seller_earning_amount ||
            order.total_amount ||
            order.total_price
        ),
      0
    );

    return NextResponse.json({
      profile,
      wallet: walletResult.data || {
        balance: 0,
        pending_balance: 0,
        total_earned: 0,
        total_withdrawn: 0,
        status: "active",
      },
      metrics: {
        products: productsResult.count || 0,
        activeProducts: activeProductsResult.count || 0,
        orders: orders.length,
        paidOrders: paidOrders.length,
        awaitingDelivery: awaitingDelivery.length,
        completedOrders: completedOrders.length,
        lateOrders: lateOrders.length,
        followers: followersResult.count || 0,
        lifetimeEarnings,
      },
      recentOrders: recentOrdersResult.data || [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected seller overview error.";

    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(message) }
    );
  }
}
