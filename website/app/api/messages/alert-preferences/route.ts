import { NextResponse } from "next/server";
import { accountApiError } from "@/lib/accountApi";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const db = createSupabaseAdmin();
    const [settings, muted] = await Promise.all([
      db.from("cp_messaging_settings").select("message_notifications,call_notifications,allow_calls").eq("user_id", user.id).maybeSingle(),
      db.from("cp_chat_preferences").select("room_id").eq("user_id", user.id).eq("muted", true),
    ]);
    if (settings.error) throw settings.error;
    if (muted.error) throw muted.error;
    return NextResponse.json({
      settings: settings.data || { message_notifications: true, call_notifications: true },
      mutedRoomIds: (muted.data || []).map(row => row.room_id),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return accountApiError(error, "Notification preferences could not be loaded."); }
}
