import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";
import {
  requireCheckoutAccess,
  runtimeControlErrorCode,
  runtimeControlErrorStatus,
} from "@/lib/runtimeControls";
import { fallbackExchangeRateMap, fetchFrankfurterRates } from "@/lib/frankfurter";

const ALLOWED_PAYMENT_METHODS = new Set(["doku"]);
const RESERVATION_MINUTES = Math.min(
  60,
  Math.max(5, Number(process.env.CHECKOUT_RESERVATION_MINUTES || 20))
);

export async function POST(request: Request) {
  try {
    const buyer = await requireAuthenticatedUser(request);
    const body = (await request.json()) as {
      productId?: number | string;
      quantity?: number | string;
      variantId?: number | string | null;
      paymentMethod?: string;
      couponCode?: string | null;
    };

    const productId = Number(body.productId || 0);
    const quantity = Math.floor(Number(body.quantity || 1));
    const variantId = body.variantId === null || body.variantId === undefined || body.variantId === ""
      ? null
      : Number(body.variantId);
    const paymentMethod = String(body.paymentMethod || "").toLowerCase();
    const couponCode = String(body.couponCode || "").trim() || null;

    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });
    }

    if (variantId !== null && (!Number.isInteger(variantId) || variantId <= 0)) {
      return NextResponse.json({ error: "Invalid product variant ID." }, { status: 400 });
    }

    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 100) {
      return NextResponse.json(
        { error: "Quantity must be between 1 and 100." },
        { status: 400 }
      );
    }

    if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
      return NextResponse.json(
        { error: "Unsupported payment method." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    await requireCheckoutAccess({ supabaseAdmin, userId: buyer.id });
    const rates = await fetchFrankfurterRates()
      .then((result) => result.rates)
      .catch(() => fallbackExchangeRateMap());
    const idrPerUsd = Number(rates.IDR?.units_per_usd || 0);
    if (!Number.isFinite(idrPerUsd) || idrPerUsd <= 0) {
      throw new Error("Unable to prepare the product price.");
    }

    const rpcName =
      paymentMethod === "doku"
        ? "create_marketplace_order_doku_usd_v1"
        : "create_marketplace_order_usd_v1";
    const rpcParams =
      paymentMethod === "doku"
        ? {
            p_buyer_id: buyer.id,
            p_product_id: productId,
            p_variant_id: variantId,
            p_quantity: quantity,
            p_coupon_code: couponCode,
            p_reservation_minutes: RESERVATION_MINUTES,
            p_idr_per_usd: idrPerUsd,
          }
        : {
            p_buyer_id: buyer.id,
            p_product_id: productId,
            p_variant_id: variantId,
            p_quantity: quantity,
            p_payment_method: paymentMethod,
            p_coupon_code: couponCode,
            p_payment_fee_rate: 0,
            p_reservation_minutes: RESERVATION_MINUTES,
            p_idr_per_usd: idrPerUsd,
          };

    const { data, error } = await supabaseAdmin.rpc(rpcName, rpcParams);

    if (error) {
      const message = error.message || "Failed to create order.";
      const normalized = message.toLowerCase();
      const status =
        normalized.includes("not found") ? 404 :
        normalized.includes("own product") ? 403 :
        normalized.includes("stock") ||
        normalized.includes("coupon") ||
        normalized.includes("quantity") ||
        normalized.includes("inactive") ||
        normalized.includes("reservation") ||
        normalized.includes("expired") ||
        normalized.includes("invalid") ? 400 : 500;

      if (status >= 500) {
        console.error("Checkout order RPC failed:", error.message);
      }
      return NextResponse.json(
        {
          error: safeApiErrorMessage(
            error,
            "Unable to create the order.",
            status,
          ),
        },
        { status },
      );
    }

    const createdOrder = (data || {}) as Record<string, unknown>;
    const createdOrderId = Number(createdOrder.id || 0);
    if (!Number.isInteger(createdOrderId) || createdOrderId <= 0) {
      throw new Error("Order was created without a valid identifier.");
    }

    const { data: sellerTaxQuote, error: taxError } = await supabaseAdmin.rpc(
      "cp_apply_seller_tax_v23",
      {
        p_order_id: createdOrderId,
        p_buyer_id: buyer.id,
      }
    );
    if (taxError) {
      await supabaseAdmin.rpc("cp_release_order_reservation", {
        p_order_id: createdOrderId,
        p_reason: "seller_tax_calculation_failed",
      });
      await supabaseAdmin
        .from("orders")
        .update({
          status: "cancelled",
          reservation_status: "released",
          updated_at: new Date().toISOString(),
        })
        .eq("id", createdOrderId)
        .eq("buyer_id", buyer.id);
      throw new Error(`Seller tax calculation failed: ${taxError.message}`);
    }

    return NextResponse.json({
      ok: true,
      order: { ...createdOrder, ...((sellerTaxQuote || {}) as Record<string, unknown>) },
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "";
    const runtimeStatus = runtimeControlErrorStatus(error);
    const status = runtimeStatus || authErrorStatus(rawMessage);
    console.error("Checkout order creation failed:", error);
    return NextResponse.json(
      {
        error: safeApiErrorMessage(
          error,
          "Unable to create the order.",
          status,
        ),
        code: runtimeControlErrorCode(error),
      },
      { status },
    );
  }
}
