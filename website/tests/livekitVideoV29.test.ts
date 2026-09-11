import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  createCommunityVoiceRoomName,
  createCommunityVoiceToken,
} from "../lib/livekitServer";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

const communityId = "11111111-1111-4111-8111-111111111111";
const channelId = "22222222-2222-4222-8222-222222222222";

async function withTestCredentials(run: () => Promise<void>) {
  const previousKey = process.env.LIVEKIT_API_KEY;
  const previousSecret = process.env.LIVEKIT_API_SECRET;
  process.env.LIVEKIT_API_KEY = "APIcomeplayers-v29-test";
  process.env.LIVEKIT_API_SECRET = "this-is-a-test-secret-that-is-long-enough-for-jwt";
  try {
    await run();
  } finally {
    if (previousKey === undefined) delete process.env.LIVEKIT_API_KEY;
    else process.env.LIVEKIT_API_KEY = previousKey;
    if (previousSecret === undefined) delete process.env.LIVEKIT_API_SECRET;
    else process.env.LIVEKIT_API_SECRET = previousSecret;
  }
}

test("V29 LiveKit token grants camera and screen sources only when permitted", async () => {
  await withTestCredentials(async () => {
    const token = await createCommunityVoiceToken({
      userId: "33333333-3333-4333-8333-333333333333",
      participantName: "Video Tester",
      roomName: createCommunityVoiceRoomName({ communityId, channelId }),
      roomId: "44444444-4444-4444-8444-444444444444",
      communityId,
      channelId,
      canPublishVideo: true,
      canShareScreen: true,
      canModerateVoice: true,
    });
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    ) as {
      video?: { canPublishSources?: string[] };
      attributes?: Record<string, string>;
    };
    assert.deepEqual(payload.video?.canPublishSources, [
      "microphone",
      "camera",
      "screen_share",
      "screen_share_audio",
    ]);
    assert.equal(payload.attributes?.can_moderate_voice, "true");
  });
});

test("V29 includes server-side moderation, role permissions, and video UI", () => {
  const migration = read(
    "supabase/migrations/20260708160000_messages_livekit_video_moderation_v29.sql",
  ).toLowerCase();
  const tokenRoute = read("app/api/messages/livekit/token/route.ts");
  const moderationRoute = read("app/api/messages/livekit/moderate/route.ts");
  const panel = read("components/messages/CommunityVoicePanel.tsx");
  const communityServer = read("lib/communityServer.ts");
  const streamRoute = read("app/api/messages/rooms/[id]/stream/route.ts");

  for (const permission of ["publish_video", "share_screen", "moderate_voice"]) {
    assert.match(migration, new RegExp(permission));
    assert.match(communityServer, new RegExp(permission));
  }
  assert.match(tokenRoute, /canPublishVideo/);
  assert.match(tokenRoute, /canShareScreen/);
  assert.match(tokenRoute, /canModerateVoice/);
  assert.match(moderationRoute, /mutePublishedTrack/);
  assert.match(moderationRoute, /removeParticipant/);
  assert.match(moderationRoute, /You can only moderate members below your highest role/);
  assert.match(panel, /setCameraEnabled/);
  assert.match(panel, /setScreenShareEnabled/);
  assert.match(panel, /VideoTrackView/);
  assert.match(panel, /ParticipantTile/);
  assert.match(streamRoute, /\.from\("chat_rooms"\)[\s\S]*?\.update\(/);
  assert.equal(streamRoute.includes("livekit/moderate"), false);
});
