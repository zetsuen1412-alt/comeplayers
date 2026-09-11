import { NextResponse } from "next/server";
import {
  disputeErrorStatus,
  requireDisputeAccess,
} from "@/lib/disputeServer";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const disputeId = Number(id);

    if (!Number.isInteger(disputeId) || disputeId <= 0) {
      return NextResponse.json({ error: "Invalid dispute ID." }, { status: 400 });
    }

    const access = await requireDisputeAccess(request, disputeId);
    const { supabaseAdmin, dispute, isAdmin, role, user } = access;

    const [{ data: order, error: orderError }, messagesResult, evidenceResult, eventsResult] =
      await Promise.all([
        supabaseAdmin
          .from("orders")
          .select(
            "id,product_id,product,product_title,seller_name,game_name,category,status,payment_status,payment_method,escrow_status,total_amount,total_price,quantity,created_at,paid_at,delivered_at,completed_at,delivery_due_at,delivery_sla_status"
          )
          .eq("id", Number(dispute.order_id || 0))
          .maybeSingle(),
        supabaseAdmin
          .from("dispute_messages")
          .select("id,dispute_id,sender_id,sender_role,message,is_internal,created_at,edited_at")
          .eq("dispute_id", disputeId)
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("dispute_evidence")
          .select("id,dispute_id,uploaded_by,file_name,mime_type,size_bytes,caption,created_at")
          .eq("dispute_id", disputeId)
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("dispute_events")
          .select("id,dispute_id,actor_id,event_type,old_status,new_status,note,metadata,created_at")
          .eq("dispute_id", disputeId)
          .order("created_at", { ascending: true }),
      ]);

    if (orderError) throw new Error(orderError.message);
    if (messagesResult.error) throw new Error(messagesResult.error.message);
    if (evidenceResult.error) throw new Error(evidenceResult.error.message);
    if (eventsResult.error) throw new Error(eventsResult.error.message);

    const allMessages = messagesResult.data || [];
    const messages = isAdmin
      ? allMessages
      : allMessages.filter((message) => !message.is_internal);
    const evidence = evidenceResult.data || [];
    const events = eventsResult.data || [];

    const profileIds = Array.from(
      new Set(
        [
          String(dispute.buyer_id || ""),
          String(dispute.seller_id || ""),
          String(dispute.opened_by || ""),
          ...messages.map((message) => String(message.sender_id || "")),
          ...evidence.map((item) => String(item.uploaded_by || "")),
          ...events.map((event) => String(event.actor_id || "")),
        ].filter(Boolean)
      )
    );

    const profileMap: Record<string, { display_name: string; role: string | null }> = {};

    if (profileIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id,email,username,seller_name,role")
        .in("id", profileIds);

      if (profilesError) throw new Error(profilesError.message);

      for (const profile of profiles || []) {
        const displayName =
          String(profile.seller_name || "").trim() ||
          String(profile.username || "").trim() ||
          String(profile.email || "").split("@")[0] ||
          "User";

        profileMap[String(profile.id)] = {
          display_name: displayName,
          role: profile.role || null,
        };
      }
    }

    const nowIso = new Date().toISOString();
    if (role === "buyer") {
      await supabaseAdmin
        .from("disputes")
        .update({ buyer_last_read_at: nowIso })
        .eq("id", disputeId);
    } else if (role === "seller") {
      await supabaseAdmin
        .from("disputes")
        .update({ seller_last_read_at: nowIso })
        .eq("id", disputeId);
    }

    return NextResponse.json({
      dispute,
      order,
      messages: messages.map((message) => ({
        ...message,
        sender_display:
          profileMap[String(message.sender_id || "")]?.display_name ||
          message.sender_role ||
          "User",
      })),
      evidence: evidence.map((item) => ({
        ...item,
        uploader_display:
          profileMap[String(item.uploaded_by || "")]?.display_name || "User",
      })),
      events: events.map((event) => ({
        ...event,
        actor_display: event.actor_id
          ? profileMap[String(event.actor_id)]?.display_name || "User"
          : "System",
      })),
      role,
      isAdmin,
      currentUserId: user.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected dispute detail error.";
    return NextResponse.json(
      { error: message },
      { status: disputeErrorStatus(error) }
    );
  }
}
