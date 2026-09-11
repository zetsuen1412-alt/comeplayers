import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";
import {
  completeMarketplaceOrderAsAdmin,
  refundMarketplaceOrder,
} from "@/lib/adminOrderActions";
import { recordDisputeRiskFeedback } from "@/lib/riskFeedbackServer";

const allowedActions = new Set([
  "investigating",
  "buyer_win",
  "seller_win",
  "closed",
]);

async function insertNotification(
  supabaseAdmin: Awaited<ReturnType<typeof requireAdmin>>["supabaseAdmin"],
  input: {
    userId: string | null;
    title: string;
    message: string;
    orderId: number;
    disputeId?: number;
  }
) {
  if (!input.userId) return;

  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: input.userId,
    type: "dispute",
    title: input.title,
    message: input.message,
    link_url: input.disputeId
      ? `/resolution-center/${input.disputeId}`
      : `/orders/${input.orderId}`,
    is_read: false,
  });

  if (error) {
    console.error("Dispute notification failed:", error.message);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as {
      disputeId?: number | string;
      action?: string;
      note?: string;
      manualReference?: string;
    };

    const disputeId = Number(body.disputeId || 0);
    const action = String(body.action || "").trim().toLowerCase();
    const note = String(body.note || "").trim();

    if (!Number.isInteger(disputeId) || disputeId <= 0) {
      return NextResponse.json({ error: "Invalid dispute ID." }, { status: 400 });
    }

    if (!allowedActions.has(action)) {
      return NextResponse.json(
        { error: "Unsupported dispute action." },
        { status: 400 }
      );
    }

    if (!note) {
      return NextResponse.json(
        { error: "An admin resolution note is required." },
        { status: 400 }
      );
    }

    const { data: dispute, error: disputeError } = await supabaseAdmin
      .from("disputes")
      .select("*,orders:order_id(*)")
      .eq("id", disputeId)
      .maybeSingle();

    if (disputeError) throw new Error(disputeError.message);
    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found." }, { status: 404 });
    }

    const orderId = Number(dispute.order_id || 0);
    let financialResult: unknown = null;

    if (action === "buyer_win") {
      financialResult = await refundMarketplaceOrder({
        supabaseAdmin,
        adminId: user.id,
        orderId,
        reason: note,
        manualReference: body.manualReference,
      });
    }

    if (action === "seller_win") {
      const relatedOrder = dispute.orders as
        | { delivered_at?: string | null; payment_status?: string | null }
        | null;

      if (relatedOrder?.delivered_at) {
        const { error: restoreError } = await supabaseAdmin
          .from("orders")
          .update({ status: "delivered", updated_at: new Date().toISOString() })
          .eq("id", orderId);
        if (restoreError) throw new Error(restoreError.message);

        financialResult = await completeMarketplaceOrderAsAdmin({
          supabaseAdmin,
          orderId,
        });
      } else {
        const { data, error } = await supabaseAdmin.rpc(
          "cp_admin_override_order_status",
          {
            p_order_id: orderId,
            p_admin_id: user.id,
            p_status: "processing",
            p_note: note,
          }
        );
        if (error) throw new Error(error.message);
        financialResult = { continued: true, result: data };
      }
    }

    if (action === "investigating") {
      const { error } = await supabaseAdmin.rpc(
        "cp_admin_override_order_status",
        {
          p_order_id: orderId,
          p_admin_id: user.id,
          p_status: "disputed",
          p_note: note,
        }
      );
      if (error) throw new Error(error.message);
    }

    if (action === "closed") {
      const relatedOrder = dispute.orders as
        | { delivered_at?: string | null; payment_status?: string | null }
        | null;
      const nextStatus = relatedOrder?.delivered_at
        ? "delivered"
        : String(relatedOrder?.payment_status || "").toLowerCase() === "paid"
          ? "processing"
          : "cancelled";

      const { error } = await supabaseAdmin.rpc(
        "cp_admin_override_order_status",
        {
          p_order_id: orderId,
          p_admin_id: user.id,
          p_status: nextStatus,
          p_note: note,
        }
      );
      if (error) throw new Error(error.message);
    }

    const resolved = new Set(["buyer_win", "seller_win", "closed"]).has(action);
    const changedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("disputes")
      .update({
        status: action,
        admin_note: note,
        resolved_by: resolved ? user.id : null,
        resolved_at: resolved ? changedAt : null,
        closed_at: resolved ? changedAt : null,
        last_activity_at: changedAt,
        updated_at: changedAt,
      })
      .eq("id", disputeId)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);

    const readable = action.replace("_", " ");
    const { error: messageError } = await supabaseAdmin
      .from("dispute_messages")
      .insert({
        dispute_id: disputeId,
        sender_id: user.id,
        sender_role: "admin",
        message: `Admin update: ${readable}. ${note}`,
        is_internal: false,
      });

    if (messageError) {
      console.error("Dispute admin message failed:", messageError.message);
    }

    const { error: eventError } = await supabaseAdmin
      .from("dispute_events")
      .insert({
        dispute_id: disputeId,
        actor_id: user.id,
        event_type: resolved ? "dispute_resolved" : "status_changed",
        old_status: dispute.status || null,
        new_status: action,
        note,
        metadata: {
          order_id: orderId,
          financial_result: financialResult,
          manual_reference: body.manualReference || null,
        },
      });

    if (eventError) {
      console.error("Dispute admin event failed:", eventError.message);
    }

    if (resolved) {
      try {
        await recordDisputeRiskFeedback({
          supabaseAdmin,
          disputeId,
          orderId,
          buyerId: dispute.buyer_id,
          sellerId: dispute.seller_id,
          action,
          actorId: user.id,
        });
      } catch (feedbackError) {
        console.error("Dispute risk feedback failed:", feedbackError);
      }
    }

    await insertNotification(supabaseAdmin, {
      userId: dispute.buyer_id,
      title: "Dispute Updated",
      message: `Dispute for order #${orderId} is now ${readable}. ${note}`,
      orderId,
      disputeId,
    });
    await insertNotification(supabaseAdmin, {
      userId: dispute.seller_id,
      title: "Dispute Updated",
      message: `Dispute for order #${orderId} is now ${readable}. ${note}`,
      orderId,
      disputeId,
    });

    await recordAdminAudit({
      adminId: user.id,
      action: `dispute.${action}`,
      entityType: "dispute",
      entityId: disputeId,
      beforeData: dispute,
      afterData: updated,
      metadata: {
        order_id: orderId,
        manual_reference: body.manualReference || null,
        financial_result: financialResult,
      },
    });

    return NextResponse.json({
      ok: true,
      dispute: updated,
      financialResult,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected dispute error.";
    return NextResponse.json(
      { error: message },
      { status: adminErrorStatus(error) }
    );
  }
}
