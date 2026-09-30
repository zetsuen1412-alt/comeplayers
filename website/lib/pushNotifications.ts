import type { SupabaseClient } from "@supabase/supabase-js";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_TOKEN_PATTERN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

type PushTokenRow = { id: number; user_id: string; expo_push_token: string };
type ExpoPushTicket = { status?: "ok" | "error"; details?: { error?: string } };
type PushKind = "message" | "call";
export type ChatPushInput = {
  supabaseAdmin: SupabaseClient; receiverIds: string[]; senderName: string;
  roomId: string; preview: string; channelId?: string;
};
export type NotificationPreference = {
  message_notifications?: boolean; call_notifications?: boolean; allow_calls?: boolean;
  muted?: boolean; notification_level?: string; muted_until?: string | null;
};

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && value.length <= 512 && EXPO_PUSH_TOKEN_PATTERN.test(value.trim());
}

export function allowsNotification(kind: PushKind, preference: NotificationPreference, now = Date.now()) {
  if (kind === "call") return preference.call_notifications !== false && preference.allow_calls !== false;
  if (preference.message_notifications === false || preference.muted) return false;
  if (preference.muted_until && Date.parse(preference.muted_until) > now) return false;
  // A mentions-only channel must not ring for ordinary messages.
  return !preference.notification_level || preference.notification_level === "all";
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function notificationRecipients(input: {
  supabaseAdmin: SupabaseClient; receiverIds: string[]; roomId: string; kind: PushKind; channelId?: string;
}): Promise<string[]> {
  const ids = [...new Set(input.receiverIds.map(id => String(id || "").trim()).filter(Boolean))];
  const allowed: string[] = [];
  for (const batch of chunks(ids, 100)) {
    const [settings, rooms, channels] = await Promise.all([
      input.supabaseAdmin.from("cp_messaging_settings")
        .select("user_id,message_notifications,call_notifications,allow_calls").in("user_id", batch),
      input.kind === "message" ? input.supabaseAdmin.from("cp_chat_preferences")
        .select("user_id,muted").eq("room_id", input.roomId).in("user_id", batch) : { data: [], error: null },
      input.kind === "message" && input.channelId ? input.supabaseAdmin.from("chat_channel_read_states")
        .select("user_id,notification_level,muted_until").eq("channel_id", input.channelId).in("user_id", batch) : { data: [], error: null },
    ]);
    if (settings.error || rooms.error || channels.error) {
      // Do not override a user's mute preference when its lookup is unavailable.
      console.warn("Notification preference lookup failed.");
      continue;
    }
    for (const id of batch) {
      const preference = {
        ...settings.data?.find(row => row.user_id === id),
        ...rooms.data?.find(row => row.user_id === id),
        ...channels.data?.find(row => row.user_id === id),
      };
      if (allowsNotification(input.kind, preference)) allowed.push(id);
    }
  }
  return allowed;
}

async function deliver(input: {
  supabaseAdmin: SupabaseClient; receiverIds: string[];
  payload: (row: PushTokenRow) => Record<string, unknown>;
  beforeBatch?: () => Promise<boolean>;
}) {
  if (!input.receiverIds.length) return;
  for (const users of chunks(input.receiverIds, 100)) {
    const { data, error } = await input.supabaseAdmin.from("chat_push_tokens")
      .select("id,user_id,expo_push_token").in("user_id", users).eq("enabled", true);
    if (error) { console.warn("Notification device lookup failed."); continue; }
    const seen = new Set<string>();
    const rows = ((data || []) as PushTokenRow[]).filter(row => {
      if (!isExpoPushToken(row.expo_push_token) || seen.has(row.expo_push_token)) return false;
      seen.add(row.expo_push_token); return true;
    });
    for (const batch of chunks(rows, 100)) {
      try {
        if (input.beforeBatch && !await input.beforeBatch()) return;
        const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
        const accessToken = String(process.env.EXPO_ACCESS_TOKEN || "").trim();
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const response = await fetch(EXPO_PUSH_ENDPOINT, {
          method: "POST", headers, body: JSON.stringify(batch.map(input.payload)), signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) { console.error("Push provider rejected the request:", response.status); continue; }
        const result = await response.json() as { data?: ExpoPushTicket | ExpoPushTicket[] };
        const tickets = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
        const invalidTokenIds = tickets.flatMap((ticket, index) =>
          ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered" && batch[index] ? [batch[index].id] : []);
        if (invalidTokenIds.length) {
          const cleanup = await input.supabaseAdmin.from("chat_push_tokens")
            .update({ enabled: false, updated_at: new Date().toISOString() }).in("id", invalidTokenIds);
          if (cleanup.error) console.warn("Push device cleanup failed.");
        }
        const errors = tickets.filter(ticket => ticket.status === "error" && ticket.details?.error !== "DeviceNotRegistered");
        if (errors.length) console.warn("Push provider could not deliver notifications:", errors.map(ticket => ticket.details?.error || "unknown"));
      } catch (error) {
        console.warn("Push delivery unavailable:", error instanceof Error ? error.name : "unknown");
      }
    }
  }
}

export async function sendChatPushNotifications(input: ChatPushInput) {
  const receiverIds = await notificationRecipients({ ...input, kind: "message" });
  await deliver({ ...input, receiverIds, payload: row => ({
    to: row.expo_push_token, sound: "comeplayers_message.wav", priority: "high", channelId: "messages",
    title: (input.senderName || "ComePlayers").slice(0, 120), body: (input.preview || "Pesan baru").slice(0, 500),
    data: { type: "chat_message", roomId: input.roomId, channelId: input.channelId, userId: row.user_id },
  }) });
}

export async function sendCallPushNotifications(input: {
  supabaseAdmin: SupabaseClient; callId: string; senderName: string;
}) {
  // Re-read immediately before delivery: a canceled/answered call must not wake another device.
  const { data: call, error } = await input.supabaseAdmin.from("cp_calls")
    .select("id,room_id,callee_id,created_at,status,media").eq("id", input.callId).maybeSingle();
  if (error || !call || call.status !== "ringing") return;
  const expiresAt = Date.parse(call.created_at) + 60_000;
  let ttl = Math.min(60, Math.ceil((expiresAt - Date.now()) / 1000));
  if (!Number.isFinite(ttl) || ttl <= 0) return;
  const receiverIds = await notificationRecipients({
    supabaseAdmin: input.supabaseAdmin, receiverIds: [call.callee_id], roomId: call.room_id, kind: "call",
  });
  await deliver({ ...input, receiverIds, beforeBatch: async () => {
    const latest = await input.supabaseAdmin.from("cp_calls").select("status").eq("id", call.id).maybeSingle();
    ttl = Math.min(60, Math.ceil((expiresAt - Date.now()) / 1000));
    return !latest.error && latest.data?.status === "ringing" && ttl > 0;
  }, payload: row => ({
    to: row.expo_push_token, sound: "comeplayers_call.wav", priority: "high", channelId: "calls",
    ttl, expiration: Math.floor(expiresAt / 1000), categoryId: "incoming_call",
    title: (input.senderName || "ComePlayers").slice(0, 120),
    body: call.media === "video" ? "Panggilan video masuk" : "Panggilan suara masuk",
    data: { type: "incoming_call", roomId: call.room_id, callId: call.id, userId: row.user_id, expiresAt },
  }) });
}
