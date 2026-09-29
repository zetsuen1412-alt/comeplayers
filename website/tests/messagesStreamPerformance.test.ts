import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function readWebsite(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

function readApps(file: string) {
  return fs.readFileSync(path.join(process.cwd(), "..", "comeplayers-apps", file), "utf8");
}

test("messages stream state is shared by web desktop and android", () => {
  const helper = readWebsite("lib/chatStream.ts");
  const streamRoute = readWebsite("app/api/messages/rooms/[id]/stream/route.ts");
  const coreClient = readApps("packages/chat-core/src/client.ts");
  const coreTypes = readApps("packages/chat-core/src/types.ts");

  assert.match(helper, /platforms: \["web", "desktop", "android", "ios"\]/);
  assert.match(helper, /watch_url/);
  assert.match(helper, /signaling_channel/);
  assert.match(streamRoute, /export async function GET/);
  assert.match(streamRoute, /createPublicChatStreamState/);
  assert.match(streamRoute, /stream:/);
  assert.match(coreClient, /getStreamState/);
  assert.match(coreClient, /\/stream`/);
  assert.match(coreTypes, /export type ChatStreamState/);
  assert.match(coreTypes, /stream\?: ChatStreamState/);
});

test("messages payloads and polling stay lightweight", () => {
  const roomsRoute = readWebsite("app/api/messages/rooms/route.ts");
  const roomDetailRoute = readWebsite("app/api/messages/rooms/[id]/route.ts");
  const messagesPage = readWebsite("app/messages/page.tsx");
  const envExample = readWebsite(".env.example");
  const coreClient = readApps("packages/chat-core/src/client.ts");
  const desktopApp = readApps("apps/desktop/src/App.tsx");
  const mobileApp = readApps("apps/mobile/App.tsx");

  assert.match(roomsRoute, /clampPositiveInteger\(searchParams\.get\("limit"\), 60, 20, 100\)/);
  assert.doesNotMatch(roomsRoute, /\.limit\(200\)/);
  assert.match(roomDetailRoute, /clampPositiveInteger\(searchParams\.get\("limit"\), 80, 20, 120\)/);
  assert.doesNotMatch(roomDetailRoute, /\.limit\(300\)/);
  assert.match(roomDetailRoute, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(roomDetailRoute, /\.in\("message_id", visibleMessageIds\)/);
  assert.match(messagesPage, /\/api\/messages\/rooms\?scope=social&limit=60/);
  assert.match(messagesPage, /\?limit=80/);
  assert.match(messagesPage, /}, 15000\)/);
  assert.match(envExample, /NEXT_PUBLIC_WEBRTC_STUN_URLS/);
  assert.match(envExample, /NEXT_PUBLIC_WEBRTC_TURN_URLS/);
  assert.match(coreClient, /listRooms: async \(limit = 60\)/);
  assert.match(coreClient, /getConversation: \(roomId: string, limit = 80,/);
  assert.match(desktopApp, /createAppUrl/);
  assert.match(mobileApp, /InboxProvider/);
  assert.match(readApps("apps/mobile/src/screens/ConversationScreen.tsx"), /getConversation\(room.id, 40/);
});

test("live panels avoid blank black screens while video warms up", () => {
  const messagesPage = readWebsite("app/messages/page.tsx");
  const desktopShell = readApps("apps/desktop/src/App.tsx");

  assert.match(messagesPage, /STREAM_ICE_SERVERS/);
  assert.match(messagesPage, /StreamVideoFallback/);
  assert.match(messagesPage, /onPlaying=\{\(\) => setRemoteVideoReady\(true\)\}/);
  assert.match(messagesPage, /Waiting for the first video frame/);
  // Desktop now hosts the same web stream UI, so it inherits this fallback.
  assert.match(desktopShell, /createAppUrl/);
});
