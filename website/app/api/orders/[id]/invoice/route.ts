import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const [{ data: order, error: orderError }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("id,buyer_id,seller_id,product_title,product,quantity,status,payment_status,created_at,paid_at")
        .eq("id", orderId)
        .maybeSingle(),
      supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    ]);
    if (orderError) throw new Error(orderError.message);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    const isAdmin = String(profile?.role || "").toLowerCase() === "admin";
    const isSeller = order.seller_id === user.id;
    if (order.buyer_id !== user.id && !isSeller && !isAdmin) {
      return NextResponse.json({ error: "Invoice access denied." }, { status: 403 });
    }

    const [{ data: invoiceRow, error }, { data: pricingSnapshot, error: snapshotError }] =
      await Promise.all([
        supabaseAdmin
          .from("order_invoices")
          .select("id,invoice_number,order_id,currency_code,subtotal_amount,discount_amount,payment_fee_amount,taxable_amount,tax_amount,total_amount,tax_country_code,tax_rate_percent,seller_gross_amount,seller_marketplace_fee_amount,seller_marketplace_fee_rate_percent,seller_sales_tax_rate_percent,seller_sales_tax_amount,seller_net_amount,status,issued_at,voided_at,created_at,updated_at")
          .eq("order_id", orderId)
          .maybeSingle(),
        supabaseAdmin
          .from("order_pricing_snapshots")
          .select("id,order_id,marketplace_fee_rate_percent,seller_sales_tax_rate_percent,captured_at")
          .eq("order_id", orderId)
          .maybeSingle(),
      ]);
    if (error) throw new Error(error.message);
    if (snapshotError) throw new Error(snapshotError.message);
    if (!invoiceRow) {
      return NextResponse.json(
        { error: "Invoice is not available. Apply the latest commerce migration and recalculate the unpaid order." },
        { status: 404 }
      );
    }

    const {
      seller_gross_amount,
      seller_marketplace_fee_amount,
      seller_marketplace_fee_rate_percent,
      seller_sales_tax_rate_percent,
      seller_sales_tax_amount,
      seller_net_amount,
      ...invoice
    } = invoiceRow;

    const usesV23Snapshot = Boolean(pricingSnapshot);
    const hasSellerSettlement =
      Number(seller_gross_amount || 0) > 0 || Number(seller_net_amount || 0) > 0;

    return NextResponse.json({
      invoice,
      order,
      viewerRole: isAdmin ? "admin" : isSeller ? "seller" : "buyer",
      taxModel: usesV23Snapshot ? "seller_v23" : "legacy",
      sellerSettlement: (isSeller || isAdmin) && (usesV23Snapshot || hasSellerSettlement)
        ? {
            seller_gross_amount,
            seller_marketplace_fee_amount,
            seller_marketplace_fee_rate_percent: usesV23Snapshot
              ? Number(pricingSnapshot?.marketplace_fee_rate_percent || seller_marketplace_fee_rate_percent || 0)
              : Number(seller_marketplace_fee_rate_percent || 0),
            seller_sales_tax_rate_percent: usesV23Snapshot
              ? Number(pricingSnapshot?.seller_sales_tax_rate_percent || seller_sales_tax_rate_percent || 0)
              : Number(seller_sales_tax_rate_percent || 0),
            seller_sales_tax_amount: Number(seller_sales_tax_amount || 0),
            seller_net_amount,
            pricing_snapshot_id: pricingSnapshot?.id || null,
            pricing_captured_at: pricingSnapshot?.captured_at || null,
            tax_bearer: usesV23Snapshot ? "seller" : "legacy",
          }
        : null,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "";
    const status = authErrorStatus(rawMessage);
    console.error("Order invoice route failed:", error);
    return NextResponse.json(
      {
        error: safeApiErrorMessage(
          error,
          "Unable to load the invoice.",
          status,
        ),
      },
      { status },
    );
  }
}
