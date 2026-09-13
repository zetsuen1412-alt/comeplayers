type RecordValue = Record<string, unknown>;
const time = (value: unknown) => typeof value === "string" ? Date.parse(value) || 0 : 0;
const revision = (value: RecordValue) => Math.max(time(value.created_at), time(value.edited_at), time(value.deleted_at), time(value.ended_at), time(value.answered_at));
// Restore must not undo an edit, a deletion, or a received/read receipt merely
// because the current phone has an older copy of the same message.
export function mergeRestoredValue(kind: string, current: unknown, backup: unknown): unknown {
  if (!backup || typeof backup !== "object" || !current || typeof current !== "object") return current;
  const a = current as RecordValue, b = backup as RecordValue;
  if (kind === "message" || kind === "message-v2") {
    const chosen = a.deleted_at ? a : b.deleted_at ? b : revision(a) >= revision(b) ? a : b;
    const delivery = ["queued", "sent", "received", "read"];
    const rank = Math.max(delivery.indexOf(String(a.delivery)), delivery.indexOf(String(b.delivery)));
    return { ...chosen, is_read: !!a.is_read || !!b.is_read, ...(rank >= 0 ? { delivery: delivery[rank] } : {}),
      starred: time(a.local_updated_at) >= time(b.local_updated_at) ? a.starred : b.starred };
  }
  if (kind === "call-history") return revision(a) >= revision(b) ? a : b;
  if (kind === "room") return time(a.last_message_at) >= time(b.last_message_at) ? a : b;
  return current;
}
