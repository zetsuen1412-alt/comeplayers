import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { authErrorStatus, createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { requireCheckoutAccess, runtimeControlErrorCode, runtimeControlErrorStatus } from "@/lib/runtimeControls";
import { parseCheckoutInput } from "@/lib/checkoutInput";
import { verifyCheckoutQuote } from "@/lib/checkoutQuote";

export const runtime = "nodejs";
const RESERVATION_MINUTES = Math.min(60, Math.max(5, Number(process.env.CHECKOUT_RESERVATION_MINUTES || 20)));

export async function POST(request: Request) {
  try {
    const buyer = await requireAuthenticatedUser(request);
    let input;
    let quote;
    try {
      const body = await request.json();
      input = parseCheckoutInput(body);
      if (body.paymentMethod !== "doku") throw new Error("Unsupported payment method.");
      quote = verifyCheckoutQuote(String(body.quoteToken || ""), input, process.env.SUPABASE_SERVICE_ROLE_KEY || "");
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid checkout input." }, { status: 400 });
    }
    const supabaseAdmin = createSupabaseAdmin();
    await requireCheckoutAccess({ supabaseAdmin, userId: buyer.id });
    // Pricing, stock reservation, coupon usage and seller-tax snapshot are one transaction.
    const { data, error } = await supabaseAdmin.rpc("cp_create_quoted_marketplace_order_v1", {
      p_buyer_id: buyer.id, p_product_id: input.productId, p_variant_id: input.variantId,
      p_quantity: input.quantity, p_coupon_code: input.couponCode,
      p_reservation_minutes: RESERVATION_MINUTES, p_idr_per_usd: quote.idrPerUsd,
      p_expected_quote: quote.quote,
    });
    if (error) {
      const message = String(error.message || "").toLowerCase();
      const status = error.code === "P0001"
        ? message.includes("price changed") ? 409 : message.includes("own product") ? 403 : 400
        : 500;
      if (status >= 500) console.error("Checkout order RPC failed:", error);
      return NextResponse.json({ error: safeApiErrorMessage(error, "Unable to create the order.", status) }, { status });
    }
    return NextResponse.json({ ok: true, order: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = runtimeControlErrorStatus(error) || authErrorStatus(message);
    console.error("Checkout order creation failed:", error);
    return NextResponse.json({ error: safeApiErrorMessage(error, "Unable to create the order.", status), code: runtimeControlErrorCode(error) }, { status });
  }
}
