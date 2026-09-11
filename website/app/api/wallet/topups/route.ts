import { NextResponse } from "next/server";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

async function ensureWallet(userId: string) {
  const supabaseAdmin = createSupabaseAdmin();

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("wallets")
    .select("id,user_id,balance,pending_balance,total_earned,total_spent,total_withdrawn,status,created_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) return existing;

  const { data: created, error: createError } = await supabaseAdmin
    .from("wallets")
    .insert({
      user_id: userId,
      balance: 0,
      pending_balance: 0,
      total_earned: 0,
      total_spent: 0,
      total_withdrawn: 0,
      status: "active",
    })
    .select("id,user_id,balance,pending_balance,total_earned,total_spent,total_withdrawn,status,created_at,updated_at")
    .single();

  if (createError) {
    if (createError.code === "23505") {
      const { data: racedExisting, error: racedExistingError } =
        await supabaseAdmin
          .from("wallets")
          .select("id,user_id,balance,pending_balance,total_earned,total_spent,total_withdrawn,status,created_at,updated_at")
          .eq("user_id", userId)
          .maybeSingle();

      if (racedExistingError) throw new Error(racedExistingError.message);
      if (racedExisting) return racedExisting;
    }

    throw new Error(createError.message);
  }
  return created;
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const wallet = await ensureWallet(user.id);

    const { data: topups, error: topupError } = await supabaseAdmin
      .from("wallet_topups")
      .select(
        "id,user_id,wallet_id,amount,payment_method,sender_name,sender_account,payment_note,payment_image,status,admin_note,processed_at,created_at"
      )
      .eq("user_id", user.id)
      .order("id", { ascending: false })
      .limit(100);

    if (topupError) throw new Error(topupError.message);

    return NextResponse.json({ wallet, topups: topups || [] });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected wallet top-up error.";

    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(message) }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as {
      action?: string;
      amount?: number | string;
      paymentMethod?: string;
      senderName?: string;
      senderAccount?: string;
      paymentNote?: string;
      paymentImage?: string;
    };

    const wallet = await ensureWallet(user.id);

    if (body.action === "ensure-wallet") {
      return NextResponse.json({ ok: true, wallet });
    }

    if (String(wallet.status || "active").toLowerCase() !== "active") {
      return NextResponse.json({ error: "Wallet is frozen." }, { status: 409 });
    }

    const amount = Number(body.amount || 0);
    const paymentMethod = String(body.paymentMethod || "").trim();
    const senderName = String(body.senderName || "").trim();
    const senderAccount = String(body.senderAccount || "").trim();
    const paymentNote = String(body.paymentNote || "").trim();
    const paymentImage = String(body.paymentImage || "").trim();

    if (!Number.isFinite(amount) || amount < 10000 || amount > 100000000) {
      return NextResponse.json(
        { error: "Top-up amount must be between Rp10,000 and Rp100,000,000." },
        { status: 400 }
      );
    }

    if (!paymentMethod || !senderName || !paymentImage) {
      return NextResponse.json(
        { error: "Payment method, sender name, and payment proof are required." },
        { status: 400 }
      );
    }

    if (senderName.length > 120 || senderAccount.length > 120 || paymentNote.length > 1000) {
      return NextResponse.json({ error: "Top-up details are too long." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: topup, error: topupError } = await supabaseAdmin
      .from("wallet_topups")
      .insert({
        user_id: user.id,
        wallet_id: wallet.id,
        amount,
        payment_method: paymentMethod,
        sender_name: senderName,
        sender_account: senderAccount || null,
        payment_note: paymentNote || null,
        payment_image: paymentImage,
        status: "pending",
      })
      .select("id,status,amount,created_at")
      .single();

    if (topupError) throw new Error(topupError.message);

    return NextResponse.json({ ok: true, topup });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected wallet top-up error.";

    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(message) }
    );
  }
}
