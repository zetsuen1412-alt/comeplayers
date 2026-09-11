import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { accountApiError } from "@/lib/accountApi";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const db = createSupabaseAdmin();
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const [conversations, products, statuses, orders] = await Promise.all([
      db.from("chat_rooms").select("id", { count: "exact", head: true }).or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`).gte("last_message_at", since),
      db.from("products").select("id", { count: "exact", head: true }).eq("seller_id", user.id).eq("status", "active"),
      db.from("cp_statuses").select("id", { count: "exact", head: true }).eq("author_id", user.id).gte("created_at", since),
      db.from("orders").select("id,product_title,total_amount,total_price,currency_code,status,payment_status,created_at,buyer_id,seller_id").or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(50),
    ]);
    for (const r of [conversations, products, statuses, orders]) if (r.error) throw r.error;
    return NextResponse.json({ metrics: { conversations: conversations.count || 0, products: products.count || 0, statuses: statuses.count || 0 }, orders: orders.data || [] });
  } catch (error) { return accountApiError(error); }
}
