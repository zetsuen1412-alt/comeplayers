import type { SupabaseClient } from "@supabase/supabase-js";

// Chat lists may use this routing metadata, but encrypted message content must
// remain on each participant's device. Use the database arrival time so a
// delayed retry or an incorrect device clock cannot move a room backwards.
export async function recordSecureRoomActivity(
  db: SupabaseClient,
  eventId: string,
  roomId: string,
  senderId: string,
): Promise<void> {
  const persisted = await db.from("cp_secure_events")
    .select("created_at")
    .eq("id", eventId)
    .eq("room_id", roomId)
    .eq("sender_id", senderId)
    .single();
  if (persisted.error || !persisted.data?.created_at) {
    throw persisted.error || new Error("The saved message has no timestamp.");
  }
  const activity = {
    last_message: null,
    last_message_at: persisted.data.created_at,
    last_message_sender_id: senderId,
  };
  const newer = await db.from("chat_rooms").update(activity)
    .eq("id", roomId).lt("last_message_at", activity.last_message_at);
  if (newer.error) throw newer.error;
  const first = await db.from("chat_rooms").update(activity)
    .eq("id", roomId).is("last_message_at", null);
  if (first.error) throw first.error;
}
