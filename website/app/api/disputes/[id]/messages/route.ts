import { NextResponse } from "next/server";
import {
  FINAL_DISPUTE_STATUSES,
  disputeErrorStatus,
  notifyDisputeParty,
  requireDisputeAccess,
} from "@/lib/disputeServer";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const disputeId = Number(id);

    if (!Number.isInteger(disputeId) || disputeId <= 0) {
      return NextResponse.json({ error: "Invalid dispute ID." }, { status: 400 });
    }

    const access = await requireDisputeAccess(request, disputeId);
    const body = (await request.json()) as {
      message?: string;
      internal?: boolean;
    };
    const message = String(body.message || "").trim();

    if (message.length < 1 || message.length > 5000) {
      return NextResponse.json(
        { error: "Message must be between 1 and 5000 characters." },
        { status: 400 }
      );
    }

    const status = String(access.dispute.status || "open").toLowerCase();
    if (FINAL_DISPUTE_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "This dispute is already resolved and is read-only." },
        { status: 400 }
      );
    }

    const isInternal = Boolean(body.internal) && access.isAdmin;
    const { data: created, error: insertError } = await access.supabaseAdmin
      .from("dispute_messages")
      .insert({
        dispute_id: disputeId,
        sender_id: access.user.id,
        sender_role: access.role,
        message,
        is_internal: isInternal,
      })
      .select("id,dispute_id,sender_id,sender_role,message,is_internal,created_at,edited_at")
      .single();

    if (insertError) throw new Error(insertError.message);

    const nowIso = new Date().toISOString();
    const nextStatus =
      access.role === "buyer"
        ? "awaiting_seller"
        : access.role === "seller"
          ? "awaiting_buyer"
          : status;

    const updatePayload: Record<string, unknown> = {
      last_activity_at: nowIso,
      updated_at: nowIso,
    };

    if (!access.isAdmin && ["open", "awaiting_buyer", "awaiting_seller"].includes(status)) {
      updatePayload.status = nextStatus;
    }

    const { error: updateError } = await access.supabaseAdmin
      .from("disputes")
      .update(updatePayload)
      .eq("id", disputeId);

    if (updateError) throw new Error(updateError.message);

    const { error: eventError } = await access.supabaseAdmin
      .from("dispute_events")
      .insert({
        dispute_id: disputeId,
        actor_id: access.user.id,
        event_type: isInternal ? "internal_note_added" : "message_added",
        old_status: status,
        new_status: String(updatePayload.status || status),
        note: isInternal ? "Admin added an internal note." : "New message added.",
        metadata: { sender_role: access.role },
      });

    if (eventError) {
      console.error("Dispute event insert failed:", eventError.message);
    }

    if (!isInternal) {
      const buyerId = String(access.dispute.buyer_id || "");
      const sellerId = String(access.dispute.seller_id || "");
      const recipients = [buyerId, sellerId].filter(
        (recipient) => recipient && recipient !== access.user.id
      );

      for (const recipient of recipients) {
        await notifyDisputeParty({
          supabaseAdmin: access.supabaseAdmin,
          userId: recipient,
          title: "New Dispute Message",
          message: `A new message was posted in dispute #${disputeId}.`,
          disputeId,
        });
      }
    }

    return NextResponse.json({ ok: true, message: created });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected dispute message error.";
    return NextResponse.json(
      { error: message },
      { status: disputeErrorStatus(error) }
    );
  }
}
