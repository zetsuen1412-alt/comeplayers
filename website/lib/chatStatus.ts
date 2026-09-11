import { createSupabaseAdmin } from "./serverSupabase";
import { inputError } from "./accountApi";
import { assertContactAllowed } from "./chatContacts";

export async function requireStatusAccess(viewerId: string, statusId: string) {
  const db = createSupabaseAdmin();
  const status = await db.from("cp_statuses").select("*").eq("id", statusId).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (status.error) throw status.error;
  if (!status.data) throw inputError("This status has expired or was deleted.", 404);
  if (status.data.author_id !== viewerId) {
    await assertContactAllowed(db, viewerId, status.data.author_id);
    const [contact, settings] = await Promise.all([
      db.from("chat_rooms").select("id").neq("room_type", "group").or(`and(buyer_id.eq.${viewerId},seller_id.eq.${status.data.author_id}),and(buyer_id.eq.${status.data.author_id},seller_id.eq.${viewerId})`).not("last_message", "is", null).limit(1),
      db.from("cp_messaging_settings").select("status_audience").eq("user_id", status.data.author_id).maybeSingle(),
    ]);
    if (contact.error) throw contact.error;
    if (settings.error) throw settings.error;
    if (!contact.data?.length || settings.data?.status_audience === "nobody") throw inputError("This status is not available.", 403);
  }
  return status.data;
}
