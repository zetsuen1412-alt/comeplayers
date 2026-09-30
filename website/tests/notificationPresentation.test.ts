import assert from "node:assert/strict";
import test from "node:test";
import { callsAllowedBySettings, notificationChannelId, notificationRoomId, shouldAlertNotification, type NotificationRow } from "../lib/notificationPresentation";

const now = Date.parse("2026-09-29T12:00:00Z");
const row: NotificationRow = { id: 12, user_id: "bob", type: "chat_message", title: "Pesan baru", message: "Hello", link_url: "/cpcommunity?room=room-1", is_read: false, created_at: new Date(now - 1000).toISOString() };
const context = { row, userId: "bob", startedAt: now - 10_000, settings: {}, mutedRoomIds: new Set<string>(), visible: true };

test("new messages alert from another conversation and while the window is hidden", () => {
  assert.equal(shouldAlertNotification({ ...context, activeRoomId: "room-2" }, now), true);
  assert.equal(shouldAlertNotification({ ...context, activeRoomId: "room-1", visible: false }, now), true);
  assert.equal(shouldAlertNotification({ ...context, activeRoomId: "room-1" }, now), false);
});

test("notification sound respects account settings and muted chat", () => {
  assert.equal(shouldAlertNotification({ ...context, settings: { message_notifications: false } }, now), false);
  assert.equal(shouldAlertNotification({ ...context, mutedRoomIds: new Set(["room-1"]) }, now), false);
});

test("viewing one community channel does not suppress another channel's notification", () => {
  const group = { ...context, row: { ...row, link_url: "/cpcommunity?room=room-1&channel=general" }, activeRoomId: "room-1", activeChannelId: "general" };
  assert.equal(shouldAlertNotification(group, now), false);
  assert.equal(shouldAlertNotification({ ...group, activeChannelId: "news" }, now), true);
  assert.equal(shouldAlertNotification({ ...group, activeChannelId: null }, now), true);
});

test("history, stale/read events and previous accounts never produce fresh alerts", () => {
  for (const change of [
    { user_id: "alice" }, { is_read: true }, { created_at: "invalid" },
    { created_at: new Date(now - 12_000).toISOString() }, { created_at: new Date(now + 31_000).toISOString() },
  ]) assert.equal(shouldAlertNotification({ ...context, row: { ...row, ...change } }, now), false);
  assert.equal(shouldAlertNotification({ ...context, startedAt: now - 300_000, row: { ...row, created_at: new Date(now - 121_000).toISOString() } }, now), false);
});

test("call inbox entries cannot create duplicate generic call alerts", () => {
  for (const type of ["call", "incoming_call", "missed_call"]) assert.equal(shouldAlertNotification({ ...context, row: { ...row, type } }, now), false);
});

test("only relative in-app links are interpreted as chat targets", () => {
  assert.equal(notificationRoomId("/chat?room=abc"), "abc");
  assert.equal(notificationRoomId("https://evil.example/?room=abc"), null);
  assert.equal(notificationRoomId("//evil.example/?room=abc"), null);
});


test("call alerts fail closed before settings arrive and respect disabled calling", () => {
  assert.equal(callsAllowedBySettings(null), false);
  assert.equal(callsAllowedBySettings(undefined), false);
  assert.equal(callsAllowedBySettings({}), true);
  assert.equal(callsAllowedBySettings({ call_notifications: false }), false);
  assert.equal(callsAllowedBySettings({ allow_calls: false }), false);
});

test("channel links keep exact notification targets without accepting external links", () => {
  assert.equal(notificationChannelId("/cpcommunity?room=room-1&channel=news"), "news");
  assert.equal(notificationChannelId("/cpcommunity/servers/server-1/channels/general"), "general");
  assert.equal(notificationChannelId("https://evil.example/?channel=news"), null);
  assert.equal(notificationChannelId("//evil.example/?channel=news"), null);
  const group = { ...context, row: { ...row, link_url: "/cpcommunity?room=room-1&channel=general" }, activeRoomId: "room-1", activeChannelId: "general", visible: false };
  assert.equal(shouldAlertNotification(group, now), true);
  assert.equal(shouldAlertNotification({ ...context, activeRoomId: "room-1", activeChannelId: "general" }, now), true);
});
