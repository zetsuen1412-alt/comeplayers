import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requireAdmin(request);
    const [eventsResult, reportsResult] = await Promise.all([
      supabaseAdmin
        .from("chat_moderation_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("chat_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (eventsResult.error) throw new Error(eventsResult.error.message);
    if (reportsResult.error) throw new Error(reportsResult.error.message);

    const events = eventsResult.data || [];
    const reports = reportsResult.data || [];
    const messageIds = Array.from(
      new Set(
        [...events, ...reports]
          .map((item) => String(item.message_id || ""))
          .filter(Boolean)
      )
    );
    const roomIds = Array.from(
      new Set([...events, ...reports].map((item) => String(item.room_id || "")).filter(Boolean))
    );
    const userIds = Array.from(
      new Set(
        [
          ...events.map((item) => String(item.user_id || "")),
          ...reports.map((item) => String(item.reported_by || "")),
        ].filter(Boolean)
      )
    );

    const [messagesResult, roomsResult, profilesResult] = await Promise.all([
      messageIds.length
        ? supabaseAdmin
            .from("chat_messages")
            .select("id,room_id,sender_id,receiver_id,message,message_type,moderation_status,risk_score,risk_flags,attachment_id,created_at,deleted_at")
            .in("id", messageIds)
        : Promise.resolve({ data: [], error: null }),
      roomIds.length
        ? supabaseAdmin
            .from("chat_rooms")
            .select("id,buyer_id,seller_id,product_id,order_id,status,room_type")
            .in("id", roomIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabaseAdmin
            .from("profiles")
            .select("id,email,username,full_name,role")
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (messagesResult.error) throw new Error(messagesResult.error.message);
    if (roomsResult.error) throw new Error(roomsResult.error.message);
    if (profilesResult.error) throw new Error(profilesResult.error.message);

    const messageMap = new Map((messagesResult.data || []).map((item) => [String(item.id), item]));
    const roomMap = new Map((roomsResult.data || []).map((item) => [String(item.id), item]));
    const profileMap = new Map((profilesResult.data || []).map((item) => [String(item.id), item]));

    return NextResponse.json({
      events: events.map((event) => ({
        ...event,
        message: event.message_id ? messageMap.get(String(event.message_id)) || null : null,
        room: event.room_id ? roomMap.get(String(event.room_id)) || null : null,
        profile: profileMap.get(String(event.user_id)) || null,
      })),
      reports: reports.map((report) => {
        const message = messageMap.get(String(report.message_id)) || null;
        return {
          ...report,
          message,
          room: roomMap.get(String(report.room_id)) || null,
          reporter: profileMap.get(String(report.reported_by)) || null,
        };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected chat moderation error.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();
    const note = String(body.note || "").trim().slice(0, 1000);
    const now = new Date().toISOString();

    if (["resolve_event", "dismiss_event"].includes(action)) {
      const eventId = Number(body.eventId || 0);
      if (!Number.isInteger(eventId) || eventId <= 0) throw new Error("Valid event ID is required.");
      const { data: before, error: beforeError } = await supabaseAdmin
        .from("chat_moderation_events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle();
      if (beforeError) throw new Error(beforeError.message);
      if (!before) throw new Error("Moderation event not found.");
      const { data: after, error } = await supabaseAdmin
        .from("chat_moderation_events")
        .update({
          status: action === "dismiss_event" ? "dismissed" : "resolved",
          reviewed_by: user.id,
          reviewed_at: now,
          review_note: note || null,
          updated_at: now,
        })
        .eq("id", eventId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await recordAdminAudit({
        adminId: user.id,
        action,
        entityType: "chat_moderation_event",
        entityId: eventId,
        beforeData: before,
        afterData: after,
      });
      return NextResponse.json({ ok: true, event: after });
    }

    if (["resolve_report", "dismiss_report"].includes(action)) {
      const reportId = Number(body.reportId || 0);
      if (!Number.isInteger(reportId) || reportId <= 0) throw new Error("Valid report ID is required.");
      const { data: before, error: beforeError } = await supabaseAdmin
        .from("chat_reports")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();
      if (beforeError) throw new Error(beforeError.message);
      if (!before) throw new Error("Chat report not found.");
      const { data: after, error } = await supabaseAdmin
        .from("chat_reports")
        .update({
          status: action === "dismiss_report" ? "dismissed" : "resolved",
          reviewed_by: user.id,
          reviewed_at: now,
          resolution_note: note || null,
          updated_at: now,
        })
        .eq("id", reportId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await recordAdminAudit({
        adminId: user.id,
        action,
        entityType: "chat_report",
        entityId: reportId,
        beforeData: before,
        afterData: after,
      });
      return NextResponse.json({ ok: true, report: after });
    }

    if (action === "remove_message") {
      const messageId = String(body.messageId || "").trim();
      if (!messageId) throw new Error("Message ID is required.");
      const { data: before, error: beforeError } = await supabaseAdmin
        .from("chat_messages")
        .select("*")
        .eq("id", messageId)
        .maybeSingle();
      if (beforeError) throw new Error(beforeError.message);
      if (!before) throw new Error("Message not found.");
      const { data: after, error } = await supabaseAdmin
        .from("chat_messages")
        .update({
          message: "[Message removed by moderation]",
          moderation_status: "removed",
          deleted_at: now,
        })
        .eq("id", messageId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      if (before.attachment_id) {
        await supabaseAdmin
          .from("chat_attachments")
          .update({ moderation_status: "removed", deleted_at: now })
          .eq("id", before.attachment_id);
      }
      await recordAdminAudit({
        adminId: user.id,
        action,
        entityType: "chat_message",
        entityId: messageId,
        beforeData: before,
        afterData: after,
      });
      return NextResponse.json({ ok: true, message: after });
    }

    if (["lock_room", "unlock_room"].includes(action)) {
      const roomId = String(body.roomId || "").trim();
      if (!roomId) throw new Error("Room ID is required.");
      const { data: before, error: beforeError } = await supabaseAdmin
        .from("chat_rooms")
        .select("*")
        .eq("id", roomId)
        .maybeSingle();
      if (beforeError) throw new Error(beforeError.message);
      if (!before) throw new Error("Chat room not found.");
      const { data: after, error } = await supabaseAdmin
        .from("chat_rooms")
        .update({ status: action === "lock_room" ? "locked" : "active", updated_at: now })
        .eq("id", roomId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await recordAdminAudit({
        adminId: user.id,
        action,
        entityType: "chat_room",
        entityId: roomId,
        beforeData: before,
        afterData: after,
      });
      return NextResponse.json({ ok: true, room: after });
    }

    if (action === "suspend_chat") {
      const userId = String(body.userId || "").trim();
      const hours = Math.min(720, Math.max(1, Number(body.hours || 24)));
      if (!userId) throw new Error("User ID is required.");
      const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      const { data: after, error } = await supabaseAdmin
        .from("user_account_settings")
        .upsert(
          {
            user_id: userId,
            chat_suspended_until: until,
            chat_suspension_reason: note || "Chat safety review",
            updated_at: now,
          },
          { onConflict: "user_id" }
        )
        .select("user_id,chat_suspended_until,chat_suspension_reason")
        .single();
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("notifications").insert({
        user_id: userId,
        type: "chat_moderation",
        title: "Chat access temporarily suspended",
        message: `Your chat access is suspended until ${until}. ${note || "Please follow marketplace safety rules."}`,
        link_url: "/cpcommunity",
        is_read: false,
      });
      await recordAdminAudit({
        adminId: user.id,
        action,
        entityType: "user_chat_access",
        entityId: userId,
        afterData: after,
      });
      return NextResponse.json({ ok: true, suspension: after });
    }

    if (action === "restore_chat") {
      const userId = String(body.userId || "").trim();
      if (!userId) throw new Error("User ID is required.");
      const { data: after, error } = await supabaseAdmin
        .from("user_account_settings")
        .upsert(
          {
            user_id: userId,
            chat_suspended_until: null,
            chat_suspension_reason: null,
            updated_at: now,
          },
          { onConflict: "user_id" }
        )
        .select("user_id,chat_suspended_until,chat_suspension_reason")
        .single();
      if (error) throw new Error(error.message);
      await recordAdminAudit({
        adminId: user.id,
        action,
        entityType: "user_chat_access",
        entityId: userId,
        afterData: after,
      });
      return NextResponse.json({ ok: true, suspension: after });
    }

    throw new Error("Unsupported chat moderation action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected chat moderation error.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}
