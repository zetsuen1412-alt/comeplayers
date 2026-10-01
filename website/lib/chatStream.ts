import type { ChatRoomRow } from "@/lib/chatServer";

export type PublicChatStreamState = {
  room_id: string;
  status: "idle" | "live";
  is_live: boolean;
  host_id: string | null;
  title: string;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string | null;
  watch_url: string;
  embed_url: string;
  playback_url: string | null;
  signaling_channel: string;
  platforms: ["web", "desktop", "android", "ios"];
  fallback_text: string;
};

export type StreamIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

function splitUrls(value?: string | null): string[] {
  return String(value || "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function clampPositiveInteger(
  value: string | number | null | undefined,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number(value || 0);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function createStreamIceServers(input: {
  stunUrls?: string | null;
  turnUrls?: string | null;
  turnUsername?: string | null;
  turnCredential?: string | null;
} = {}): StreamIceServer[] {
  const stunUrls = splitUrls(input.stunUrls);
  const turnUrls = splitUrls(input.turnUrls);
  const servers: StreamIceServer[] = [
    {
      urls: stunUrls.length ? stunUrls : ["stun:stun.l.google.com:19302"],
    },
  ];

  if (turnUrls.length) {
    const username = String(input.turnUsername || "").trim();
    const credential = String(input.turnCredential || "").trim();
    servers.push({
      urls: turnUrls,
      ...(username ? { username } : {}),
      ...(credential ? { credential } : {}),
    });
  }

  return servers;
}

export function createPublicChatStreamState(
  room: Pick<
    ChatRoomRow,
    | "id"
    | "stream_status"
    | "stream_host_id"
    | "stream_title"
    | "stream_started_at"
    | "stream_ended_at"
    | "stream_updated_at"
  >,
  origin = ""
): PublicChatStreamState {
  const roomId = String(room.id || "");
  const isLive = String(room.stream_status || "").toLowerCase() === "live";
  const path = `/cpcommunity?room=${encodeURIComponent(roomId)}&live=1`;
  const base = origin.replace(/\/$/, "");
  const url = base ? `${base}${path}` : path;

  return {
    room_id: roomId,
    status: isLive ? "live" : "idle",
    is_live: isLive,
    host_id: isLive ? String(room.stream_host_id || "") || null : null,
    title: room.stream_title || (isLive ? "Live gameplay" : ""),
    started_at: room.stream_started_at || null,
    ended_at: room.stream_ended_at || null,
    updated_at: room.stream_updated_at || null,
    watch_url: url,
    embed_url: url,
    playback_url: null,
    signaling_channel: `group-stream:${roomId}`,
    platforms: ["web", "desktop", "android", "ios"],
    fallback_text: isLive
      ? "The live stream is active. If the video has not appeared, reopen the live room from the Watch button."
      : "There is no active live stream in this room yet.",
  };
}
