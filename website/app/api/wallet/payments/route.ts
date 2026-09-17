import { NextResponse } from "next/server";
import { requireAuthenticatedUser, createSupabaseAdmin, authErrorStatus } from "@/lib/serverSupabase";
import { requireCheckoutAccess, runtimeControlErrorStatus } from "@/lib/runtimeControls";
import { fetchFrankfurterRates } from "@/lib/frankfurter";
import { quoteWalletTopup, walletInvoice } from "@/lib/cpWallet";
import { captureWalletPayPal, getWalletIntent, publicWalletIntent, startWalletPayment, walletPaymentMethods, type WalletIntent } from "@/lib/cpWalletServer";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const status = runtimeControlErrorStatus(error) || authErrorStatus(message);
  if (status >= 500) console.error("CPWallet request failed:", message || "Database or provider error");
  return NextResponse.json({ error: status < 500 ? message : "Unable to complete this top-up request. Refresh its status before trying again." }, { status, headers: noStore });
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const db = createSupabaseAdmin();
    const id = new URL(request.url).searchParams.get("id");
    if (id) return NextResponse.json({ intent: publicWalletIntent(await getWalletIntent(db, id, user.id)) }, { headers: noStore });
    const { data, error } = await db.from("cp_wallet_topup_intents").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    return NextResponse.json({ methods: walletPaymentMethods(), intents: (data || []).map(row => publicWalletIntent(row as WalletIntent)) }, { headers: noStore });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => { throw Object.assign(new Error("Invalid request."), { status: 400 }); });
    const db = createSupabaseAdmin();
    if (body.action === "capture" || body.action === "reconcile") {
      const t = await getWalletIntent(db, String(body.id || ""), user.id);
      if (body.action === "reconcile" && (t.provider !== "paypal" || t.status !== "pending")) return NextResponse.json({ intent: publicWalletIntent(t) }, { headers: noStore });
      try {
        const token = body.action === "reconcile" ? t.provider_order_id || "" : String(body.token || "");
        return NextResponse.json({ intent: publicWalletIntent(await captureWalletPayPal(db, t, token)) }, { headers: noStore });
      } catch (error) {
        if (body.action === "reconcile" && (error as { code?: string }).code === "PAYPAL_APPROVAL_REQUIRED") return NextResponse.json({ intent: publicWalletIntent(t) }, { headers: noStore });
        throw error;
      }
    }
    await requireCheckoutAccess({ supabaseAdmin: db, userId: user.id });
    if (body.action === "start") {
      // Only the canonical configured site is used for provider callbacks.
      const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.comeplayers.com").origin;
      return NextResponse.json({ intent: publicWalletIntent(await startWalletPayment(db, String(body.id || ""), user.id, origin, body.returnTo === "mobile")) }, { headers: noStore });
    }
    if (body.action !== "quote") throw Object.assign(new Error("Unsupported wallet action."), { status: 400 });
    try { walletInvoice(String(body.requestKey || "")); } catch { throw Object.assign(new Error("Invalid request reference."), { status: 400 }); }
    const existing = await db.from("cp_wallet_topup_intents").select("*").eq("user_id", user.id).eq("request_key", body.requestKey).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return NextResponse.json({ intent: publicWalletIntent(existing.data as WalletIntent) }, { headers: noStore });
    const methods = walletPaymentMethods();
    if ((body.provider !== "doku" && body.provider !== "paypal") || !methods[body.provider as keyof typeof methods]) throw Object.assign(new Error("Choose an available payment provider."), { status: 400 });
    let quote;
    try {
      const rates = body.currency === "IDR" && body.provider === "doku" ? { rates: {}, asOf: new Date().toISOString().slice(0, 10) } : await fetchFrankfurterRates();
      quote = quoteWalletTopup({ amount: body.amount, currency: body.currency, provider: body.provider, ...rates });
    } catch (error) { throw Object.assign(error instanceof Error ? error : new Error("Exchange rates are unavailable."), { status: 400 }); }
    const { data, error } = await db.rpc("cp_create_wallet_topup_quote", { p_user_id: user.id, p_request_key: body.requestKey, p_provider: body.provider, p_quote: quote });
    if (error) throw Object.assign(new Error(error.message), { status: error.code === "P0001" ? 409 : 500 });
    return NextResponse.json({ intent: publicWalletIntent(data as WalletIntent) }, { headers: noStore });
  } catch (error) { return failure(error); }
}
