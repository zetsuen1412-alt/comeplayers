import { NextResponse } from "next/server";
import { requireApprovedSeller, sellerErrorStatus } from "@/lib/sellerSecurity";

export async function GET(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const url = new URL(request.url);
    const payoutAccountId = Number(url.searchParams.get("payoutAccountId") || 0);
    const amount = Number(url.searchParams.get("amount") || 0);
    if (!Number.isInteger(payoutAccountId) || payoutAccountId <= 0) throw new Error("Select a payout account.");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Withdrawal amount must be positive.");
    const { data, error } = await supabaseAdmin.rpc("cp_quote_withdrawal_v23", {
      p_user_id: user.id,
      p_payout_account_id: payoutAccountId,
      p_source_amount: amount,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ quote: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to calculate withdrawal quote.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}
