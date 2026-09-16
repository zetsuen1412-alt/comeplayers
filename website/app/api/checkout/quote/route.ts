import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/serverSupabase";
import { fallbackExchangeRateMap, fetchFrankfurterRates } from "@/lib/frankfurter";
import { parseCheckoutInput, type CheckoutQuote } from "@/lib/checkoutInput";
import { signCheckoutQuote } from "@/lib/checkoutQuote";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let input;
  try { input = parseCheckoutInput(await request.json()); }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid checkout input." }, { status: 400 });
  }
  try {
    const rates = await fetchFrankfurterRates().then(result => result.rates).catch(() => fallbackExchangeRateMap());
    const idrPerUsd = Number(rates.IDR?.units_per_usd);
    const { data, error } = await createSupabaseAdmin().rpc("cp_quote_marketplace_order_usd_v1", {
      p_product_id: input.productId, p_variant_id: input.variantId, p_quantity: input.quantity,
      p_coupon_code: input.couponCode, p_idr_per_usd: idrPerUsd,
    });
    if (error) {
      if (error.code === "P0001") return NextResponse.json({ error: error.message }, { status: 400 });
      throw error;
    }
    const quote = data as CheckoutQuote;
    const quoteToken = signCheckoutQuote({ input, quote, idrPerUsd }, process.env.SUPABASE_SERVICE_ROLE_KEY || "");
    return NextResponse.json({ quote, quoteToken }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Checkout quote failed:", error);
    return NextResponse.json({ error: "Unable to load the order price. Please retry." }, { status: 503 });
  }
}
