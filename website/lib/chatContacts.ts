import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeRedisRateLimit, isUpstashRedisConfigured } from "@/lib/upstashRedis";
import { parseContactIdentifier } from "./cpNumbers";

export const CONTACT_PROFILE_SELECT = "id,username,full_name,avatar_url,role,cp_number";
const localSearchWindows = new Map<string, { until: number; count: number }>();
export function contactError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}
export async function assertContactAllowed(db: SupabaseClient, actor: string, target: string) {
  const { data, error } = await db.from("chat_user_blocks").select("blocker_id")
    .or(`and(blocker_id.eq.${actor},blocked_id.eq.${target}),and(blocker_id.eq.${target},blocked_id.eq.${actor})`).limit(1);
  if (error) throw new Error(error.message);
  if (data?.length) throw contactError("Messaging is unavailable for this contact.", 403);
}
export async function limitContactSearch(userId: string) {
  if (!isUpstashRedisConfigured()) {
    const now = Date.now();
    for (const [key, value] of localSearchWindows) if (value.until <= now) localSearchWindows.delete(key);
    const window = localSearchWindows.get(userId) || { until: now + 60_000, count: 0 };
    if (++window.count > 30) throw contactError("Too many searches. Please try again in a minute.", 429);
    if (localSearchWindows.size >= 5000 && !localSearchWindows.has(userId)) throw contactError("Search is busy. Please try again shortly.", 429);
    localSearchWindows.set(userId, window);
    return;
  }
  const result = await consumeRedisRateLimit({ scope: "contact-search", identifier: userId, limit: 30, windowSeconds: 60 });
  if (!result.allowed) throw contactError("Too many searches. Please try again in a minute.", 429);
}
export async function searchContacts(db: SupabaseClient, userId: string, raw: unknown, exact = false) {
  const identifier = parseContactIdentifier(raw);
  if (identifier.kind === "invalid") return [];
  const { data: blocks, error: blockError } = await db.from("chat_user_blocks").select("blocker_id,blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  if (blockError) throw new Error(blockError.message);
  const excluded = new Set([userId, ...(blocks || []).map(b => b.blocker_id === userId ? b.blocked_id : b.blocker_id)]);
  let ids: string[] | null = null;
  if (identifier.kind === "recent") {
    const { data, error } = await db.from("chat_rooms").select("buyer_id,seller_id")
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).neq("room_type", "group")
      .not("last_message", "is", null).order("last_message_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    ids = Array.from(new Set((data || []).map(r => r.buyer_id === userId ? r.seller_id : r.buyer_id)));
  }
  if (ids && !ids.length) return [];
  let lookup = db.from("profiles").select(CONTACT_PROFILE_SELECT).is("anonymized_at", null).limit(30);
  if (ids) lookup = lookup.in("id", ids);
  else if (identifier.kind === "cp_number") lookup = lookup.eq("cp_number", identifier.value);
  else if (identifier.kind === "username") {
    const query = identifier.value.replace(/_/g, "\\_");
    lookup = lookup.ilike("username", exact ? query : `%${query}%`);
  }
  const { data, error } = await lookup;
  if (error) throw new Error(error.message);
  const profiles = (data || []).filter(p => !excluded.has(p.id));
  return ids ? profiles.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)) : profiles;
}

export async function resolveContact(db: SupabaseClient, actor: string, identifier: string) {
  if (!identifier.trim()) return null;
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(identifier)) {
    await assertContactAllowed(db, actor, identifier);
    const { data, error } = await db.from("profiles").select(CONTACT_PROFILE_SELECT).eq("id", identifier).is("anonymized_at", null).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }
  const result = await searchContacts(db, actor, identifier, true);
  return result.length === 1 ? result[0] : null;
}
