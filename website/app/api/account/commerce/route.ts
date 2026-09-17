import { NextResponse } from "next/server";
import { authErrorStatus, createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { buyerOrderFilter, orderBucket, ORDER_BUCKETS } from "@/lib/accountCommerce";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const db = createSupabaseAdmin();
    const owner = buyerOrderFilter(user);
    const [wallet, recent, ...counts] = await Promise.all([
      db.from("wallets").select("balance,pending_balance,status").eq("user_id", user.id).maybeSingle(),
      db.from("orders").select("id,product_title,product,total_amount,total_price,status,payment_status,created_at,delivered_at,completed_at")
        .or(owner).order("id", { ascending: false }).limit(4),
      ...Object.values(ORDER_BUCKETS).map(statuses => db.from("orders").select("id", { count: "exact", head: true }).or(owner).in("status", [...statuses])),
    ]);
    for (const result of [wallet, recent, ...counts]) if (result.error) throw result.error;
    return NextResponse.json({
      userId: user.id, ledgerCurrency: "IDR", updatedAt: new Date().toISOString(),
      wallet: wallet.data || { balance: 0, pending_balance: 0, status: "active" },
      counts: Object.fromEntries(Object.keys(ORDER_BUCKETS).map((key, index) => [key, counts[index].count || 0])),
      recentOrders: (recent.data || []).map(order => ({ ...order, bucket: orderBucket(order.status) })),
    }, { headers });
  } catch (error) {
    const status = authErrorStatus(error instanceof Error ? error.message : "");
    return NextResponse.json({ error: status < 500 && error instanceof Error ? error.message : "Unable to load your wallet and orders. Please retry." }, { status, headers });
  }
}
