import type { SupabaseClient } from "@supabase/supabase-js";

type Channel = { id: string; roomId: string };
type DatabaseError = { code?: string; message?: string };
const missingFunction = (error: DatabaseError) => error.code === "PGRST202" || error.code === "42883";
const missingSchema = (error: DatabaseError) => error.code === "42P01" || error.code === "PGRST205";

/** Counts only public channels already resolved from this user's active rooms.
 * The service-only RPC additionally verifies membership. Older databases use
 * bounded concurrent HEAD requests: no message bodies/rows cross the network.
 */
export async function publicChannelUnreadByRoom(
  db: SupabaseClient,
  userId: string,
  channels: Channel[],
): Promise<Map<string, number> | null> {
  const byRoom = new Map<string, number>();
  const unique = [...new Map(channels.map(channel => [channel.id, channel])).values()];
  if (!unique.length) return byRoom;
  const roomByChannel = new Map(unique.map(channel => [channel.id, channel.roomId]));
  const add = (channelId: string, value: unknown) => {
    const roomId = roomByChannel.get(channelId);
    const count = Number(value);
    if (!roomId || !Number.isSafeInteger(count) || count < 0) throw new Error("Invalid channel unread count.");
    byRoom.set(roomId, (byRoom.get(roomId) || 0) + count);
  };
  const aggregate = await db.rpc("cp_public_channel_unread_counts", {
    p_user_id: userId,
    p_channel_ids: unique.map(channel => channel.id),
  });
  if (!aggregate.error) {
    for (const row of aggregate.data || []) add(String(row.channel_id), row.unread_count);
    return byRoom;
  }
  if (!missingFunction(aggregate.error)) throw new Error(aggregate.error.message);

  // Backward-compatible rollout: only an absent RPC enables the fallback.
  // Permission/connection failures never turn into a misleading cached zero.
  const states = await db.from("chat_channel_read_states")
    .select("channel_id,last_read_at").eq("user_id", userId)
    .in("channel_id", unique.map(channel => channel.id));
  if (states.error) {
    if (missingSchema(states.error)) return null;
    throw new Error(states.error.message);
  }
  const readAtByChannel = new Map((states.data || []).map(state => [String(state.channel_id), state.last_read_at]));
  for (let offset = 0; offset < unique.length; offset += 8) {
    const counts = await Promise.all(unique.slice(offset, offset + 8).map(async channel => {
      let query = db.from("chat_messages").select("id", { count: "exact", head: true })
        .eq("channel_id", channel.id).neq("sender_id", userId).is("deleted_at", null);
      const readAt = readAtByChannel.get(channel.id);
      if (readAt) query = query.gt("created_at", readAt);
      const result = await query;
      if (result.error) throw new Error(result.error.message);
      return { id: channel.id, count: result.count || 0 };
    }));
    for (const count of counts) add(count.id, count.count);
  }
  return byRoom;
}
