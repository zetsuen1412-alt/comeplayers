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
      .select("id,email,username,role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);

    if (String(profile?.role || "").toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const [
      usersResult,
      productsResult,
      ordersResult,
      applicationsResult,
      disputesResult,
      withdrawalsResult,
      ticketsResult,
      recentOrdersResult,
      completedOrdersResult,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("seller_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabaseAdmin
        .from("disputes")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "investigating"]),
      supabaseAdmin
        .from("withdrawal_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabaseAdmin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "waiting_admin"]),
      supabaseAdmin
        .from("orders")
        .select(
          "id,product_title,product,buyer_id,seller_id,total_amount,total_price,status,payment_status,escrow_status,created_at"
        )
        .order("created_at", { ascending: false })
        .limit(8),
      supabaseAdmin
        .from("orders")
        .select("total_amount,total_price,marketplace_fee_amount,status")
        .eq("status", "completed")
        .range(0, 9999),
    ]);

    const completedOrders = completedOrdersResult.data || [];
    const grossVolume = completedOrders.reduce(
      (sum, order) =>
        sum +
        numberValue(order.total_amount || order.total_price),
      0
    );
    const feeRevenue = completedOrders.reduce(
      (sum, order) => sum + numberValue(order.marketplace_fee_amount),
      0
    );

    return NextResponse.json({
      profile,
      metrics: {
        users: usersResult.count || 0,
        products: productsResult.count || 0,
        orders: ordersResult.count || 0,
        pendingSellerApplications: applicationsResult.count || 0,
        activeDisputes: disputesResult.count || 0,
        pendingWithdrawals: withdrawalsResult.count || 0,
        supportQueue: ticketsResult.count || 0,
        grossVolume,
        feeRevenue,
      },
      recentOrders: recentOrdersResult.data || [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected admin overview error.";

    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(message) }
    );
  }
}
