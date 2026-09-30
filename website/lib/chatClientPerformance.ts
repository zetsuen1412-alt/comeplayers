/** Keep unchanged transient state referentially stable instead of repainting the chat. */
export function expireTypingEntries<T extends { at: number }>(entries: Record<string, T>, now: number, ttl = 4000): Record<string, T> {
  const expired = Object.keys(entries).filter(id => now - entries[id].at >= ttl);
  if (!expired.length) return entries;
  const next = { ...entries };
  for (const id of expired) delete next[id];
  return next;
}

export function sameUserIds(previous: Set<string>, next: Set<string>): boolean {
  return previous.size === next.size && [...previous].every(id => next.has(id));
}

export function sameTypingEntries<T extends { name: string; at: number }>(previous: Record<string, T>, next: Record<string, T>): boolean {
  const ids = Object.keys(previous);
  return ids.length === Object.keys(next).length && ids.every(id => previous[id].name === next[id]?.name && previous[id].at === next[id]?.at);
}

/** Only acknowledge a new visible message boundary; failed writes remain retryable. */
export class ConversationReadTracker {
  private completed = new Map<string, string>();
  private scope(roomId: string, channelId: string) { return JSON.stringify([roomId, channelId]); }
  needsRead(roomId: string, channelId: string, lastMessageId: string): boolean {
    return this.completed.get(this.scope(roomId, channelId)) !== lastMessageId;
  }
  confirm(roomId: string, channelId: string, lastMessageId: string): void {
    const key = this.scope(roomId, channelId);
    this.completed.delete(key);
    this.completed.set(key, lastMessageId);
    if (this.completed.size > 128) this.completed.delete(this.completed.keys().next().value!);
  }
}

/** Bound unsolicited media work to the newest visible conversation context. */
export function recentAutomaticImages<T extends { deleted_at?: string | null; secureAttachment?: { mime: string } }>(messages: T[]): T[] {
  return messages.slice(-8).filter(message => !message.deleted_at && message.secureAttachment?.mime.startsWith("image/"));
}
