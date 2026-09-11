import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { accountApiError, inputError } from "@/lib/accountApi";
import { requireChatRoomAccess } from "@/lib/chatServer";
import { requireCommunityChannel } from "@/lib/communityServer";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const db = createSupabaseAdmin();
    const [prefs, stars] = await Promise.all([
      db.from("cp_chat_preferences").select("room_id,pinned,archived,muted,list_name,cleared_before").eq("user_id", user.id),
      db.from("cp_starred_messages").select("message_id").eq("user_id", user.id).limit(1000),
    ]);
    if (prefs.error) throw prefs.error;
    if (stars.error) throw stars.error;
    return NextResponse.json({ preferences: prefs.data, starred: stars.data.map(s => s.message_id) });
  } catch (error) { return accountApiError(error); }
}
export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const db = createSupabaseAdmin();
    const body = await request.json();
    const roomId = String(body.roomId || "");
    await requireChatRoomAccess({ roomId, userId: user.id, supabaseAdmin: db, allowAdmin: false });
    if (body.action === "star") {
      const messageId = String(body.messageId || "");
      const message = await db.from("chat_messages").select("id,channel_id").eq("id", messageId).eq("room_id", roomId).is("deleted_at", null).maybeSingle();
      if (message.error) throw message.error;
      if (!message.data) throw inputError("Message not found.", 404);
      if (message.data.channel_id) await requireCommunityChannel({ supabaseAdmin: db, userId: user.id, roomId, channelId: message.data.channel_id });
      const result = body.starred === false
        ? await db.from("cp_starred_messages").delete().eq("user_id", user.id).eq("message_id", messageId)
        : await db.from("cp_starred_messages").upsert({ user_id: user.id, message_id: messageId }, { onConflict: "user_id,message_id" });
      if (result.error) throw result.error;
    } else {
      const next: Record<string, unknown> = { user_id: user.id, room_id: roomId };
      for (const key of ["pinned", "archived", "muted"]) if (typeof body[key] === "boolean") next[key] = body[key];
      if (typeof body.listName === "string") next.list_name = body.listName.trim().slice(0, 40);
      if (body.action === "clear") next.cleared_before = new Date().toISOString();
      const result = await db.from("cp_chat_preferences").upsert(next, { onConflict: "user_id,room_id" });
      if (result.error) throw result.error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return accountApiError(error); }
}
