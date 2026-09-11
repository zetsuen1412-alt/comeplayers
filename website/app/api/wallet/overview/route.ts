import { NextResponse } from "next/server";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();

    await supabaseAdmin.from("wallets").upsert(
      {
        user_id: user.id,
        balance: 0,
        pending_balance: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id", ignoreDuplicates: true }
    );

    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("wallets")
      .select(
        "id,user_id,balance,pending_balance,total_earned,total_spent,total_withdrawn,status,created_at,updated_at"
      )
      .eq("user_id", user.id)
      .single();

    if (walletError) throw new Error(walletError.message);

    const { data: transactions, error: transactionError } = await supabaseAdmin
      .from("wallet_transactions")
      .select(
        "id,order_id,type,transaction_type,amount,balance_before,balance_after,status,description,metadata,created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (transactionError) throw new Error(transactionError.message);

    return NextResponse.json({
      wallet,
      transactions: transactions || [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected wallet overview error.";

    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(message) }
    );
  }
}
