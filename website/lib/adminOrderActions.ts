import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refundPayPalCapture } from "@/lib/paypalServer";

type OrderRecord = {
  id: number;
  buyer_id: string | null;
  seller_id: string | null;
  payment_method: string | null;
  payment_status: string | null;
  status: string | null;
  paypal_capture_id: string | null;
  payment_proof: string | null;
  escrow_status: string | null;
  seller_payout_status: string | null;
};

export async function getAdminOrder(
  supabaseAdmin: SupabaseClient,
  orderId: number
) {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Order not found.");
  return data as OrderRecord & Record<string, unknown>;
}

export async function refundMarketplaceOrder(input: {
  supabaseAdmin: SupabaseClient;
  adminId: string;
  orderId: number;
  reason: string;
  manualReference?: string | null;
}) {
  const order = await getAdminOrder(input.supabaseAdmin, input.orderId);
  const paymentProof = String(order.payment_proof || "").toLowerCase();
  const method = String(
    order.payment_method ||
      (order.paypal_capture_id ? "paypal" : paymentProof.includes("wallet") ? "wallet" : "manual")
  )
    .trim()
    .toLowerCase();
  let externalReference = input.manualReference?.trim() || null;
  let externalStatus = "completed";

  if (
    String(order.status || "").toLowerCase() === "refunded" ||
    String(order.payment_status || "").toLowerCase() === "refunded"
  ) {
    return { alreadyProcessed: true, order };
  }

  if (
    String(order.escrow_status || "").toLowerCase() === "released" ||
    String(order.seller_payout_status || "").toLowerCase() === "released"
  ) {
    throw new Error(
      "Escrow has already been released. Reverse the seller payout before refunding."
    );
  }

  if (method === "paypal") {
    const refund = await refundPayPalCapture({
      captureId: String(order.paypal_capture_id || ""),
      idempotencyKey: `cp-order-${input.orderId}-refund`,
    });

    externalReference = refund.id;
    externalStatus = refund.status.toLowerCase();

    if (!new Set(["completed", "pending"]).has(externalStatus)) {
      throw new Error(`PayPal refund status is ${refund.status}.`);
    }
  } else if (method !== "wallet") {
    if (!externalReference) {
      throw new Error(
        "A bank, QRIS, or manual refund reference is required for this payment method."
      );
    }
  }

  if (externalStatus === "pending") {
    const { error } = await input.supabaseAdmin
      .from("orders")
      .update({
        status: "refund_pending",
        payment_status: "refund_pending",
        refund_reason: input.reason,
        refund_reference: externalReference,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.orderId);

    if (error) throw new Error(error.message);

    return {
      alreadyProcessed: false,
      pending: true,
      externalReference,
      order,
    };
  }

  const { data, error } = await input.supabaseAdmin.rpc(
    "cp_admin_finalize_order_refund",
    {
      p_order_id: input.orderId,
      p_admin_id: input.adminId,
      p_reason: input.reason,
      p_refund_channel: method,
      p_external_reference: externalReference,
    }
  );

  if (error) throw new Error(error.message);

  return {
    alreadyProcessed: Boolean(
      (data as { already_refunded?: boolean } | null)?.already_refunded
    ),
    pending: false,
    externalReference,
    result: data,
    order,
  };
}

export async function completeMarketplaceOrderAsAdmin(input: {
  supabaseAdmin: SupabaseClient;
  orderId: number;
}) {
  const order = await getAdminOrder(input.supabaseAdmin, input.orderId);

  if (!order.buyer_id) {
    throw new Error("Buyer ID is missing on this order.");
  }

  const { data, error } = await input.supabaseAdmin.rpc(
    "complete_order_and_release_escrow_v23",
    {
      p_order_id: input.orderId,
      p_buyer_id: order.buyer_id,
    }
  );

  if (error) throw new Error(error.message);
  return { order, result: data };
}
