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
  const activity = {
    last_message: callActivityMarker(input.media, input.status),
    last_message_at: input.occurredAt,
    last_message_sender_id: input.actorId,
  };
  const newer = await db.from("chat_rooms").update(activity)
    .eq("id", input.roomId).lt("last_message_at", input.occurredAt);
  if (newer.error) throw newer.error;
  const first = await db.from("chat_rooms").update(activity)
    .eq("id", input.roomId).is("last_message_at", null);
  if (first.error) throw first.error;
}
