import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

const migration = read(
  "supabase/migrations/20260708130000_discord_community_foundation_v27.sql",
).toLowerCase();

test("V27 adds Discord-style community structure without replacing legacy groups", () => {
  for (const table of [
    "chat_communities",
    "chat_channel_categories",
    "chat_channels",
    "chat_community_roles",
    "chat_community_member_roles",
    "chat_channel_permission_overrides",
    "chat_channel_read_states",
    "chat_community_invites",
    "chat_community_bans",
    "chat_community_audit_logs",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(migration, /alter table public\.chat_messages[\s\S]*add column if not exists channel_id/);
  assert.match(migration, /where lower\(coalesce\(room\.room_type, ''\)\) = 'group'/);
  assert.equal(migration.includes("drop table public.chat_rooms"), false);
  assert.equal(migration.includes("cp_create_group_chat_v27"), false);
  assert.equal(migration.includes("cp_start_group_stream_v27"), false);
});

test("V27 isolates private channel messages with RLS permission checks", () => {
  assert.match(migration, /cp_can_view_chat_channel_v27/);
  assert.match(migration, /cp_can_send_chat_channel_v27/);
  assert.match(migration, /drop policy if exists cp_chat_messages_participant_read/);
  assert.match(migration, /chat_messages\.channel_id is null/);
  assert.match(migration, /cp_can_view_chat_channel_v27\(chat_messages\.channel_id/);
  assert.equal(migration.includes("with check (true)"), false);
});

test("community APIs and UI use channel-scoped messages", () => {
  const roomRoute = read("app/api/messages/rooms/[id]/route.ts");
  const sendRoute = read("app/api/messages/rooms/[id]/messages/route.ts");
  const readRoute = read("app/api/messages/rooms/[id]/read/route.ts");
  const page = read("app/messages/page.tsx");
  const sidebar = read("components/messages/CommunityChannelSidebar.tsx");

  assert.match(roomRoute, /searchParams\.get\("channel"\)/);
  assert.match(roomRoute, /\.eq\("channel_id", selectedChannel\.id\)/);
  assert.match(sendRoute, /channel_id: selectedChannel\?\.id \|\| null/);
  assert.match(readRoute, /chat_channel_read_states/);
  assert.match(page, /CommunityChannelSidebar/);
  assert.match(page, /channelId: selectedChannelId \|\| undefined/);
  assert.match(sidebar, /chat_channel_categories|categories/);
  assert.match(sidebar, /chat_channels|channels/);
});

test("group creation and livestream remain on the original API flow", () => {
  const groupsRoute = read("app/api/messages/groups/route.ts");
  const streamRoute = read("app/api/messages/rooms/[id]/stream/route.ts");

  assert.match(groupsRoute, /\.from\("chat_rooms"\)[\s\S]*?\.insert\(/);
  assert.match(groupsRoute, /\.from\("chat_room_members"\)[\s\S]*?\.insert\(/);
  assert.match(streamRoute, /\.from\("chat_rooms"\)[\s\S]*?\.update\(/);
  assert.equal(groupsRoute.includes("cp_create_group_chat_v27"), false);
  assert.equal(streamRoute.includes("cp_start_group_stream_v27"), false);
});

test("CPCommunity does not render the global Alexia pet", () => {
  const conditionalChrome = read("app/components/ConditionalChrome.tsx");

  assert.match(
    conditionalChrome,
    /cpCommunityRoute = pathname\.startsWith\("\/cpcommunity"\)/,
  );
  assert.match(
    conditionalChrome,
    /!focusedPaymentRoute && !cpCommunityRoute \? <AlexiaPet \/>/,
  );
});

test("CPCommunity login returns to community and does not open a trade chat implicitly", () => {
  const loginGate = read("components/messages/ChatMessagesLoginGate.tsx");
  const page = read("app/messages/page.tsx");

  assert.match(loginGate, /redirectPath="\/cpcommunity"/);
  assert.match(
    page,
    /if \(initialRoom && isTradeRoom\(initialRoom\)\) \{[\s\S]*if \(hasExplicitConversationTarget\)[\s\S]*setSelectedRoomId\(""\)/,
  );
});


test("private channel previews and interactions stay permission-scoped", () => {
  const sendRoute = read("app/api/messages/rooms/[id]/messages/route.ts");
  const interactionRoute = read(
    "app/api/messages/rooms/[id]/messages/[messageId]/route.ts",
  );
  const reactionRoute = read(
    "app/api/messages/rooms/[id]/messages/[messageId]/reactions/route.ts",
  );
  const readRoute = read("app/api/messages/rooms/[id]/read/route.ts");

  assert.match(sendRoute, /cp_can_view_chat_channel_v27/);
  assert.match(sendRoute, /New message in a private channel/);
  assert.match(interactionRoute, /requireCommunityChannel/);
  assert.match(reactionRoute, /requireCommunityChannel/);
  assert.match(readRoute, /The read position does not belong to this channel/);
});
