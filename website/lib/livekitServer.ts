import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";

function configurationError(message: string) {
  const error = new Error(message);
  Object.assign(error, { status: 503 });
  return error;
}

export function getLiveKitServerUrl() {
  const serverUrl = String(process.env.LIVEKIT_URL || "").trim();
  if (!serverUrl) {
    throw configurationError("LiveKit is not configured. Add LIVEKIT_URL in the server environment.");
  }
  if (!/^wss?:\/\//i.test(serverUrl)) {
    throw configurationError("LIVEKIT_URL must start with wss:// (or ws:// for local development).");
  }
  return serverUrl;
}

export function getLiveKitApiUrl() {
  return getLiveKitServerUrl().replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
}

function getLiveKitCredentials() {
  const apiKey = String(process.env.LIVEKIT_API_KEY || "").trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || "").trim();
  if (!apiKey || !apiSecret) {
    throw configurationError(
      "LiveKit credentials are not configured. Add LIVEKIT_API_KEY and LIVEKIT_API_SECRET in the server environment.",
    );
  }
  return { apiKey, apiSecret };
}

export async function createDirectCallToken(input: { userId: string; name: string; roomName: string; video: boolean }) {
  const { apiKey, apiSecret } = getLiveKitCredentials();
  const token = new AccessToken(apiKey, apiSecret, { identity: input.userId, name: input.name.slice(0, 80), ttl: "1m" });
  token.addGrant({ roomJoin: true, room: input.roomName, canPublish: true, canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: false, canPublishSources: input.video ? [TrackSource.MICROPHONE, TrackSource.CAMERA] : [TrackSource.MICROPHONE] });
  return token.toJwt();
}

export function createLiveKitRoomServiceClient() {
  const { apiKey, apiSecret } = getLiveKitCredentials();
  return new RoomServiceClient(getLiveKitApiUrl(), apiKey, apiSecret);
}

export function createCommunityVoiceRoomName(input: {
  communityId: string;
  channelId: string;
}) {
  const communityId = String(input.communityId || "").trim().toLowerCase();
  const channelId = String(input.channelId || "").trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(communityId) || !/^[0-9a-f-]{36}$/.test(channelId)) {
    const error = new Error("Invalid community voice room identifiers.");
    Object.assign(error, { status: 400 });
    throw error;
  }
  return `cp-community-${communityId}-voice-${channelId}`;
}

export async function createCommunityVoiceToken(input: {
  userId: string;
  participantName: string;
  roomName: string;
  roomId: string;
  communityId: string;
  channelId: string;
  canPublishVideo?: boolean;
  canShareScreen?: boolean;
  canModerateVoice?: boolean;
}) {
  const { apiKey, apiSecret } = getLiveKitCredentials();
  const publishSources = [TrackSource.MICROPHONE];
  if (input.canPublishVideo) publishSources.push(TrackSource.CAMERA);
  if (input.canShareScreen) {
    publishSources.push(TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: input.userId,
    name: input.participantName.slice(0, 80),
    ttl: "10m",
    metadata: JSON.stringify({
      app: "comeplayers",
      roomId: input.roomId,
      communityId: input.communityId,
      channelId: input.channelId,
      canModerateVoice: Boolean(input.canModerateVoice),
    }),
    attributes: {
      app: "comeplayers",
      community_id: input.communityId,
      channel_id: input.channelId,
      can_moderate_voice: input.canModerateVoice ? "true" : "false",
    },
  });

  token.addGrant({
    roomJoin: true,
    room: input.roomName,
    canPublish: true,
    canPublishSources: publishSources,
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });

  return token.toJwt();
}
