import type { SupabaseClient } from "@supabase/supabase-js";

type CallMedia = "audio" | "video";
export type CallActivityStatus = "scheduled" | "ringing" | "accepted" | "declined" | "cancelled" | "ended";

const MARKER = "[comeplayers:call-activity:v1:";
const PREVIEW: Record<CallActivityStatus, string> = {
  scheduled: " dijadwalkan",
  ringing: "",
  accepted: " tersambung",
  declined: " ditolak",
  cancelled: " dibatalkan",
  ended: " berakhir",
};

export function callActivityMarker(media: CallMedia, status: CallActivityStatus) {
  return `${MARKER}${media}:${status}]`;
}

export function callActivityPreview(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\[comeplayers:call-activity:v1:(audio|video):(scheduled|ringing|accepted|declined|cancelled|ended)\]$/.exec(value);
  if (!match) return null;
  const media = match[1] as CallMedia;
  const status = match[2] as CallActivityStatus;
  return `Panggilan ${media === "video" ? "video" : "suara"}${PREVIEW[status]}`;
}

// Message and call events share the inbox clock. Conditional writes keep a
// delayed call response from moving a newer message or call backwards.
export async function recordCallRoomActivity(db: SupabaseClient, input: {
  roomId: string;
  actorId: string;
  occurredAt: string;
  media: CallMedia;
  status: CallActivityStatus;
}) {
  // The value enters PostgREST's raw OR expression. Accept only a timestamp,
  // preserving database microseconds instead of truncating its ordering clock.
  const occurredAt = input.occurredAt;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(occurredAt) || !Number.isFinite(Date.parse(occurredAt))) throw new Error("Invalid call activity time.");
  const activity = {
    last_message: callActivityMarker(input.media, input.status),
    last_message_at: occurredAt,
    last_message_sender_id: input.actorId,
  };
  const saved = await db.from("chat_rooms").update(activity)
    .eq("id", input.roomId).or(`last_message_at.lt.${occurredAt},last_message_at.is.null`);
  if (saved.error) throw saved.error;
}
