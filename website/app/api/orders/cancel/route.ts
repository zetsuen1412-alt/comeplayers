import { NextResponse } from "next/server";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export async function POST(request: Request) {
  try {
    const buyer = await requireAuthenticatedUser(request);
    const body = (await request.json()) as {
      orderId?: number | string;
      reason?: string;
    };
    const orderId = Number(body.orderId || 0);

    if (!Number.isFinite(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data, error } = await supabaseAdmin.rpc("cp_cancel_unpaid_order", {
      p_order_id: orderId,
      p_buyer_id: buyer.id,
      p_reason: String(body.reason || "buyer_cancelled").slice(0, 120),
    });

    if (error) {
      const message = error.message || "Failed to cancel order.";
      const normalized = message.toLowerCase();
      return NextResponse.json(
        { error: message },
        {
          status: normalized.includes("not found")
            ? 404
            : normalized.includes("only the buyer")
              ? 403
              : normalized.includes("paid")
                ? 409
                : 400,
        }
      );
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected cancel order error.";
    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(message) }
    );
  }
}
