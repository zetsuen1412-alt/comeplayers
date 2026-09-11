import { createSupabaseAdmin } from "./serverSupabase";
import { deleteR2Object } from "./r2Server";
export async function cleanupExpiredStatuses() {
  const db = createSupabaseAdmin();
  const rows = await db.from("cp_statuses").select("id,storage_path").lte("expires_at", new Date().toISOString()).not("storage_path", "is", null).order("expires_at").limit(500);
  if (rows.error) throw rows.error;
  let deleted = 0;
  for (const row of rows.data) {
    try { await deleteR2Object(row.storage_path); const update = await db.from("cp_statuses").update({ storage_path: null, mime_type: null, body: "[Expired status]" }).eq("id", row.id); if (update.error) throw update.error; deleted++; }
    catch { /* Keep the object key for the next scheduled retry. */ }
  }
  const removed = await db.from("cp_statuses").delete().lt("created_at", new Date(Date.now() - 7 * 86400000).toISOString()).is("storage_path", null);
  if (removed.error) throw removed.error;
  return { imagesRemoved: deleted, imagesPending: rows.data.length - deleted };
}
