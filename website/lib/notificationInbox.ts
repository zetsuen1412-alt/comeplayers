import type { SupabaseClient } from "@supabase/supabase-js";

export const NOTIFICATION_INBOX_CHANGED = "cp:notification-inbox-changed";

function requireUserId(userId: string) {
  if (!userId.trim()) throw new Error("Authentication is required.");
}

function requireId(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Invalid notification ID.");
  }
}

// Notification targets must stay inside the application, including router.push.
export function notificationHref(value: string | null | undefined) {
  const path = value?.trim() || "";
  return path.startsWith("/") && !path.startsWith("//") && !/[\\\u0000-\u0020]/.test(path)
    ? path
    : "/notifications";
}

export async function markNotificationRead(
  client: SupabaseClient,
  userId: string,
  id: number
) {
  requireUserId(userId);
  requireId(id);
  const { data, error } = await client
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  // A successful HTTP response with no accessible row is not a successful read.
  if (!data) throw new Error("The notification could not be marked as read.");
}

export async function clearNotificationsThrough(
  client: SupabaseClient,
  userId: string,
  latestId: number
) {
  requireUserId(userId);
  requireId(latestId);
  const { error } = await client
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false)
    .lte("id", latestId);

  if (error) throw new Error(error.message);
  // Only the inbox snapshot is cleared. Newer arrivals remain unread.
}

export async function markAnnouncementsRead(
  client: SupabaseClient,
  userId: string,
  ids: number[]
) {
  requireUserId(userId);
  const uniqueIds = [...new Set(ids)];
  uniqueIds.forEach(requireId);
  if (!uniqueIds.length) return;

  const readAt = new Date().toISOString();
  const { error } = await client.from("announcement_reads").upsert(
    uniqueIds.map((id) => ({
      announcement_id: id,
      user_id: userId,
      read_at: readAt,
    })),
    { onConflict: "announcement_id,user_id", ignoreDuplicates: true }
  );
  if (error) throw new Error(error.message);
}

export function announceInboxChange(userId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(NOTIFICATION_INBOX_CHANGED, { detail: { userId } })
  );
}
