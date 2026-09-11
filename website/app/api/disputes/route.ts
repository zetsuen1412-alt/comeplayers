import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";
import {
  disputeErrorStatus,
  notifyDisputeParty,
} from "@/lib/disputeServer";

export const runtime = "nodejs";

const ALLOWED_CATEGORIES = new Set([
  "item_not_received",
  "invalid_credentials",
  "item_not_as_described",
  "unauthorized_recovery",
  "payment_issue",
  "seller_issue",
  "buyer_issue",
  "other",
]);

const ALLOWED_RESOLUTIONS = new Set([
  "refund",
  "replacement",
  "complete_order",
  "other",
]);

function asCleanString(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);

    const isAdmin = String(profile?.role || "").trim().toLowerCase() === "admin";

    let query = supabaseAdmin
      .from("disputes")
      .select(
        `
        id,
        order_id,
        buyer_id,
        seller_id,
        opened_by,
        reason,
        description,
        category,
        requested_resolution,
        priority,
        status,
        admin_note,
        response_due_at,
        last_activity_at,
        resolved_at,
        created_at,
        updated_at,
        orders:order_id (
          id,
          product,
          product_title,
          seller_name,
          status,
          payment_status,
          escrow_status,
          total_amount,
          total_price,
          created_at
        )
      `
      )
      .order("last_activity_at", { ascending: false });

    if (!isAdmin) {
      query = query.or(
        `buyer_id.eq.${user.id},seller_id.eq.${user.id},opened_by.eq.${user.id}`
      );
    }

    const { data, error } = await query.limit(100);
    if (error) throw new Error(error.message);

    return NextResponse.json({
      disputes: data || [],
      isAdmin,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected dispute list error.";
    return NextResponse.json(
      { error: message },
      { status: disputeErrorStatus(error) }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as {
      orderId?: number | string;
      reason?: string;
      description?: string;
      category?: string;
      requestedResolution?: string;
    };

    const orderId = Number(body.orderId || 0);
    const reason = asCleanString(body.reason);
    const description = asCleanString(body.description);
    const category = asCleanString(body.category).toLowerCase() || "other";
    const requestedResolution =
      asCleanString(body.requestedResolution).toLowerCase() || "other";

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
    }

    if (reason.length < 5 || reason.length > 160) {
      return NextResponse.json(
        { error: "Reason must be between 5 and 160 characters." },
        { status: 400 }
      );
    }

    if (description.length < 20 || description.length > 5000) {
      return NextResponse.json(
        { error: "Description must be between 20 and 5000 characters." },
        { status: 400 }
      );
    }

    if (!ALLOWED_CATEGORIES.has(category)) {
      return NextResponse.json(
        { error: "Unsupported dispute category." },
        { status: 400 }
      );
    }

    if (!ALLOWED_RESOLUTIONS.has(requestedResolution)) {
      return NextResponse.json(
        { error: "Unsupported requested resolution." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      "cp_open_dispute_v9",
      {
        p_order_id: orderId,
        p_actor_id: user.id,
        p_reason: reason,
        p_description: description,
        p_category: category,
        p_requested_resolution: requestedResolution,
      }
    );

    if (rpcError) throw new Error(rpcError.message);

    const result = (rpcResult || {}) as {
      dispute_id?: number | string;
      existing?: boolean;
    };
    const disputeId = Number(result.dispute_id || 0);

    if (!Number.isInteger(disputeId) || disputeId <= 0) {
      throw new Error("Dispute creation did not return a valid dispute ID.");
    }

    const { data: dispute, error: disputeError } = await supabaseAdmin
      .from("disputes")
      .select("*")
      .eq("id", disputeId)
      .single();

    if (disputeError) throw new Error(disputeError.message);

    if (!result.existing) {
      const counterpartId =
        String(dispute.buyer_id || "") === user.id
          ? String(dispute.seller_id || "")
          : String(dispute.buyer_id || "");

      await notifyDisputeParty({
        supabaseAdmin,
        userId: counterpartId || null,
        title: "New Order Dispute",
        message: `A dispute was opened for order #${orderId}: ${reason}`,
        disputeId,
      });
    }

    return NextResponse.json({
      ok: true,
      dispute,
      existing: Boolean(result.existing),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected dispute creation error.";
    return NextResponse.json(
      { error: message },
      { status: disputeErrorStatus(error) }
    );
  }
}
