import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { redisKey } from "../lib/upstashRedis";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

test("V30 Redis keys are namespaced and sanitize unsafe characters", () => {
  assert.equal(redisKey("presence", "room", "abc/def"), "cp:v30:presence:room:abc_def");
});

test("V30 keeps Redis credentials server-only and provides safe fallbacks", () => {
  const env = read(".env.example");
  const redis = read("lib/upstashRedis.ts");
  const page = read("app/messages/page.tsx");
  const sendRoute = read("app/api/messages/rooms/[id]/messages/route.ts");
  const unreadRoute = read("app/api/messages/unread/route.ts");

  assert.match(env, /UPSTASH_REDIS_REST_URL/);
  assert.match(env, /UPSTASH_REDIS_REST_TOKEN/);
  assert.equal(env.includes("NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN"), false);
  assert.match(redis, /safeRedis/);
  assert.match(redis, /SETEX/);
  assert.match(redis, /ZREMRANGEBYSCORE/);
  assert.match(page, /useMessagesRedisRealtime/);
  assert.match(page, /onlineUserIds/);
  assert.match(sendRoute, /consumeRedisRateLimit/);
  assert.match(sendRoute, /invalidateUnreadCache/);
  assert.match(unreadRoute, /getUnreadCache/);
  assert.match(unreadRoute, /setUnreadCache/);
});

test("V30 presence and typing APIs require room authorization", () => {
  const presence = read("app/api/messages/presence/route.ts");
  const typing = read("app/api/messages/typing/route.ts");
  assert.match(presence, /requireAuthenticatedUser/);
  assert.match(presence, /requireChatRoomAccess/);
  assert.match(typing, /requireAuthenticatedUser/);
  assert.match(typing, /requireChatRoomAccess/);
  assert.match(typing, /requireCommunityChannel/);
});
