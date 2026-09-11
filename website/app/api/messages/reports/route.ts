import { NextResponse } from "next/server";
import { chatErrorStatus, requireChatRoomAccess } from "@/lib/chatServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

const ALLOWED_REASONS = new Set([
  "scam",
  "off_platform_payment",
  "external_contact",
  "harassment",
  "spam",
  "suspicious_attachment",
  "other",
]);

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as {
      messageId?: string;
      reason?: string;
      details?: string;
    };
    const messageId = String(body.messageId || "").trim();
    const reason = String(body.reason || "other").trim().toLowerCase();
    const details = String(body.details || "").trim().slice(0, 1000);

    if (!messageId) {
      return NextResponse.json({ error: "Message ID is required." }, { status: 400 });
    }
    if (!ALLOWED_REASONS.has(reason)) {
      return NextResponse.json({ error: "Unsupported report reason." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: message, error } = await supabaseAdmin
      .from("chat_messages")
      .select("id,room_id,sender_id,receiver_id,deleted_at")
      .eq("id", messageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!message || message.deleted_at) {
      const notFound = new Error("Message not found.");
      Object.assign(notFound, { status: 404 });
      throw notFound;
    }

    await requireChatRoomAccess({
      roomId: String(message.room_id),
      userId: user.id,
      supabaseAdmin,
    });
    if (String(message.sender_id) === user.id) {
      return NextResponse.json(
        { error: "You cannot report your own message." },
        { status: 400 }
      );
    }

    const { data: report, error: reportError } = await supabaseAdmin
      .from("chat_reports")
      .upsert(
        {
          room_id: message.room_id,
          message_id: message.id,
          reported_by: user.id,
          reason,
          details: details || null,
          status: "open",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "reported_by,message_id" }
      )
      .select("id,status,created_at")
      .single();
    if (reportError) throw new Error(reportError.message);

    await supabaseAdmin
      .from("chat_messages")
      .update({ moderation_status: "reported" })
      .eq("id", messageId)
      .neq("moderation_status", "removed");

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected report error.";
    return NextResponse.json({ error: message }, { status: chatErrorStatus(error) });
  }
}
