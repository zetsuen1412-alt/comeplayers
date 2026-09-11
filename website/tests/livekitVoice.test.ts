import assert from "node:assert/strict";
import test from "node:test";
import {
  createCommunityVoiceRoomName,
  createCommunityVoiceToken,
} from "../lib/livekitServer";

const communityId = "11111111-1111-4111-8111-111111111111";
const channelId = "22222222-2222-4222-8222-222222222222";

test("LiveKit voice room names are deterministic and scoped to a community channel", () => {
  assert.equal(
    createCommunityVoiceRoomName({ communityId, channelId }),
    `cp-community-${communityId}-voice-${channelId}`,
  );
  assert.throws(
    () => createCommunityVoiceRoomName({ communityId: "invalid", channelId }),
    /Invalid community voice room identifiers/,
  );
});

test("LiveKit voice tokens only allow microphone publishing", async () => {
  const previousKey = process.env.LIVEKIT_API_KEY;
  const previousSecret = process.env.LIVEKIT_API_SECRET;
  process.env.LIVEKIT_API_KEY = "APIcomeplayers-test";
  process.env.LIVEKIT_API_SECRET = "this-is-a-test-secret-that-is-long-enough-for-jwt";
  try {
    const roomName = createCommunityVoiceRoomName({ communityId, channelId });
    const token = await createCommunityVoiceToken({
      userId: "33333333-3333-4333-8333-333333333333",
      participantName: "Test User",
      roomName,
      roomId: "44444444-4444-4444-8444-444444444444",
      communityId,
      channelId,
    });
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    ) as {
      video?: {
        room?: string;
        roomJoin?: boolean;
        canPublish?: boolean;
        canPublishData?: boolean;
        canPublishSources?: string[];
        canSubscribe?: boolean;
      };
    };
    assert.equal(payload.video?.room, roomName);
    assert.equal(payload.video?.roomJoin, true);
    assert.equal(payload.video?.canPublish, true);
    assert.equal(payload.video?.canPublishData, false);
    assert.equal(payload.video?.canSubscribe, true);
    assert.deepEqual(payload.video?.canPublishSources, ["microphone"]);
  } finally {
    if (previousKey === undefined) delete process.env.LIVEKIT_API_KEY;
    else process.env.LIVEKIT_API_KEY = previousKey;
    if (previousSecret === undefined) delete process.env.LIVEKIT_API_SECRET;
    else process.env.LIVEKIT_API_SECRET = previousSecret;
  }
});
