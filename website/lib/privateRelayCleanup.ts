import { createSupabaseAdmin } from "./serverSupabase";
import { deleteR2Object } from "./r2Server";

/** Compatibility cleanup for calls created before the retained-history switch. */
export async function cleanupPrivateRelay(): Promise<void> {
  const db = createSupabaseAdmin();
  // v1 encrypted envelopes are no longer required after a call ends. v2 call
  // rows contain only a reference to retained E2EE history, never the key.
  const ended = await db.from("cp_calls").update({ encryption_envelope: null }).not("encryption_envelope", "is", null).not("status", "in", "(ringing,accepted,scheduled)");
  if (ended.error) throw ended.error;
}

/** Remove only uploads that were never attached to signed retained history. */
export async function cleanupUnattachedSecureHistory(): Promise<void> {
  const db = createSupabaseAdmin(), now = new Date().toISOString();
  const stale = await db.from("cp_secure_blobs").select("id,object_key").is("attached_event_id", null).lte("prepare_expires_at", now).order("prepare_expires_at").limit(200);
  if (stale.error) throw stale.error;
  for (const blob of stale.data || []) {
    await deleteR2Object(blob.object_key);
    const removed = await db.from("cp_secure_blobs").delete().eq("id", blob.id).is("attached_event_id", null).lte("prepare_expires_at", now);
    if (removed.error) throw removed.error;
  }
}
