import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  const { data, error } = await input.supabaseAdmin.rpc("cp_refund_order_to_wallet", {
    p_order_id: input.orderId, p_admin_id: input.adminId, p_reason: input.reason,
  });
  if (error) throw new Error(error.message);
  return {
    alreadyProcessed: Boolean((data as { already_refunded?: boolean } | null)?.already_refunded),
    pending: false, externalReference: `CPW-REFUND-${input.orderId}`, result: data, order,
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
