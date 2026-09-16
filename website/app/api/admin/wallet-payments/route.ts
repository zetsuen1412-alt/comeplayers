import { NextResponse } from "next/server";
import { requireAdmin, adminErrorStatus } from "@/lib/adminSecurity";

export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requireAdmin(request);
    const { data, error } = await supabaseAdmin.from("cp_wallet_topup_intents")
      .select("id,user_id,provider,status,amount_idr,charge_currency,charge_amount,provider_order_id,provider_capture_id,created_at,credited_at,review_reason")
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return NextResponse.json({ payments: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: "Unable to load CPWallet payments." }, { status: adminErrorStatus(error) }); }
}
