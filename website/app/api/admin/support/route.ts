import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";

const allowedStatuses = new Set([
  "open",
  "waiting_admin",
  "waiting_user",
  "resolved",
  "closed",
]);

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as {
      ticketId?: number | string;
      status?: string;
      message?: string;
    };

    const ticketId = Number(body.ticketId || 0);
    const status = String(body.status || "").trim().toLowerCase();
    const customMessage = String(body.message || "").trim();

    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return NextResponse.json({ error: "Invalid support ticket ID." }, { status: 400 });
    }
    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Invalid support status." }, { status: 400 });
    }

    const { data: before, error: beforeError } = await supabaseAdmin
      .from("support_tickets")
      .select("*")
      .eq("id", ticketId)
      .maybeSingle();

    if (beforeError) throw new Error(beforeError.message);
    if (!before) {
      return NextResponse.json({ error: "Support ticket not found." }, { status: 404 });
    }

    const systemMessage =
      customMessage ||
      (status === "resolved"
        ? `Your support ticket #${ticketId} has been marked as resolved.`
        : status === "closed"
          ? `Your support ticket #${ticketId} has been closed.`
          : `Your support ticket #${ticketId} status changed to ${status}.`);

    const now = new Date().toISOString();
    const { data: after, error: updateError } = await supabaseAdmin
      .from("support_tickets")
      .update({
        status,
        last_message: systemMessage,
        last_message_at: now,
        updated_at: now,
      })
      .eq("id", ticketId)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);

    const { error: messageError } = await supabaseAdmin
      .from("support_ticket_messages")
      .insert({
        ticket_id: ticketId,
        sender_id: user.id,
        sender_role: "admin",
        message: systemMessage,
        attachment_url: null,
      });

    if (messageError) throw new Error(messageError.message);

    const { error: notificationError } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: before.user_id,
        type: "support",
        title:
          status === "resolved"
            ? "Support Ticket Resolved"
            : status === "closed"
              ? "Support Ticket Closed"
              : "Support Ticket Updated",
        message: systemMessage,
        link_url: `/support/${ticketId}`,
        is_read: false,
      });

    if (notificationError) {
      console.error("Support notification failed:", notificationError.message);
    }

    await recordAdminAudit({
      adminId: user.id,
      action: "support.status.update",
      entityType: "support_ticket",
      entityId: ticketId,
      beforeData: before,
      afterData: after,
      metadata: { message: systemMessage },
    });

    return NextResponse.json({ ok: true, ticket: after });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected support update error.";
    return NextResponse.json(
      { error: message },
      { status: adminErrorStatus(error) }
    );
  }
}
