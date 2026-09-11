import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";
import {
  completeMarketplaceOrderAsAdmin,
  getAdminOrder,
  refundMarketplaceOrder,
} from "@/lib/adminOrderActions";

const allowedStatuses = new Set([
  "processing",
  "cancelled",
  "disputed",
  "delivered",
]);

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as {
      orderId?: number | string;
      action?: string;
      status?: string;
      note?: string;
      manualReference?: string;
    };

    const orderId = Number(body.orderId || 0);
    const action = normalizeStatus(body.action || "status");
    const note = String(body.note || "").trim();

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
    }

    const before = await getAdminOrder(supabaseAdmin, orderId);
    let result: unknown = null;

    if (action === "confirm_payment") {
      const { data, error } = await supabaseAdmin.rpc(
        "cp_admin_confirm_manual_payment",
        {
          p_order_id: orderId,
          p_admin_id: user.id,
          p_note: note || null,
        }
      );
      if (error) throw new Error(error.message);
      result = data;
    } else if (action === "refund") {
      if (!note) {
        return NextResponse.json(
          { error: "A refund reason is required." },
          { status: 400 }
        );
      }

      result = await refundMarketplaceOrder({
        supabaseAdmin,
        adminId: user.id,
        orderId,
        reason: note,
        manualReference: body.manualReference,
      });
    } else if (action === "complete") {
      result = await completeMarketplaceOrderAsAdmin({
        supabaseAdmin,
        orderId,
      });
    } else {
      const status = normalizeStatus(body.status);

      if (!allowedStatuses.has(status)) {
        return NextResponse.json(
          { error: "Unsupported admin order status." },
          { status: 400 }
        );
      }

      if ((status === "cancelled" || status === "disputed") && !note) {
        return NextResponse.json(
          { error: "An admin note is required for this action." },
          { status: 400 }
        );
      }

      const { data, error } = await supabaseAdmin.rpc(
        "cp_admin_override_order_status",
        {
          p_order_id: orderId,
          p_admin_id: user.id,
          p_status: status,
          p_note: note || null,
        }
      );

      if (error) throw new Error(error.message);
      result = data;
    }

    const after = await getAdminOrder(supabaseAdmin, orderId);

    await recordAdminAudit({
      adminId: user.id,
      action: `order.${action}`,
      entityType: "order",
      entityId: orderId,
      beforeData: before,
      afterData: after,
      metadata: {
        note: note || null,
        manual_reference: body.manualReference || null,
        result,
      },
    });

    return NextResponse.json({ ok: true, order: after, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected admin order error.";
    return NextResponse.json(
      { error: message },
      { status: adminErrorStatus(error) }
    );
  }
}
