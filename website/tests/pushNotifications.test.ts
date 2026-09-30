import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allowsNotification, isExpoPushToken, notificationRecipients, sendCallPushNotifications, sendChatPushNotifications } from "../lib/pushNotifications";

type Row = Record<string, unknown>;
type Table = "cp_messaging_settings" | "cp_chat_preferences" | "chat_channel_read_states" | "chat_push_tokens" | "cp_calls";
type DbResult = { data: Row[] | Row | null; error: Error | null };
type Filter = { field: string; values: unknown[] };
function database(tables: Partial<Record<Table, Row[]>> = {}, errors: Partial<Record<Table, string>> = {}, beforeQuery?: (table: Table) => void) {
  const queries: { table: Table; filters: Filter[]; update: Row | null }[] = [];
  const updates: { table: Table; ids: unknown[]; values: Row }[] = [];
  const db = {
    from(table: Table) {
      const filters: Filter[] = [];
      let update: Row | null = null;
      const execute = (single = false): DbResult => {
        beforeQuery?.(table);
        queries.push({ table, filters: [...filters], update });
        if (errors[table]) return { data: null, error: new Error(errors[table]) };
        const rows = (tables[table] || []).filter(row => filters.every(filter => filter.values.includes(row[filter.field])));
        if (update) {
          updates.push({ table, ids: rows.map(row => row.id), values: update });
          rows.forEach(row => Object.assign(row, update));
        }
        return { data: single ? rows[0] || null : rows, error: null };
      };
      const query = {
        select() { return query; },
        eq(field: string, value: unknown) { filters.push({ field, values: [value] }); return query; },
        in(field: string, values: unknown[]) { filters.push({ field, values }); return query; },
        update(values: Row) { update = values; return query; },
        async maybeSingle() { return execute(true); },
        then<TResult1 = DbResult, TResult2 = never>(
          resolve?: ((value: DbResult) => TResult1 | PromiseLike<TResult1>) | null,
          reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) { return Promise.resolve(execute()).then(resolve, reject); },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { db, queries, updates };
}
function pushProvider(t: TestContext, tickets: Row[] = [{ status: "ok" }]) {
  const requests: { url: string; body: Row[]; headers: Headers }[] = [];
  t.mock.method(globalThis, "fetch", async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) as Row[], headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({ data: tickets }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return requests;
}
const token = (id: number, user = "recipient", extras: Row = {}) => ({ id, user_id: user, enabled: true, expo_push_token: `ExpoPushToken[device_${id}]`, ...extras });
const input = { receiverIds: ["recipient"], senderName: "Teman", roomId: "room", preview: "Pesan baru" };

test("accepts Expo push token formats", () => {
  assert.equal(isExpoPushToken("ExponentPushToken[abcdefghijklmnop]"), true);
  assert.equal(isExpoPushToken("ExpoPushToken[abcdefghijklmnop]"), true);
});

test("rejects malformed push tokens", () => {
  assert.equal(isExpoPushToken(""), false);
  assert.equal(isExpoPushToken("not-a-token"), false);
  assert.equal(isExpoPushToken("ExponentPushToken[]"), false);
});

test("notification preferences distinguish message mutes from call opt-outs", () => {
  const now = Date.parse("2026-09-29T10:00:00Z");
  assert.equal(allowsNotification("message", {}, now), true);
  assert.equal(allowsNotification("message", { message_notifications: false }, now), false);
  assert.equal(allowsNotification("message", { muted: true }, now), false);
  assert.equal(allowsNotification("message", { notification_level: "mentions" }, now), false);
  assert.equal(allowsNotification("message", { notification_level: "none" }, now), false);
  assert.equal(allowsNotification("message", { muted_until: "2026-09-29T10:01:00Z" }, now), false);
  assert.equal(allowsNotification("message", { muted_until: "2026-09-29T09:59:00Z" }, now), true);
  assert.equal(allowsNotification("call", { call_notifications: false }, now), false);
  assert.equal(allowsNotification("call", { allow_calls: false }, now), false);
  assert.equal(allowsNotification("call", { muted: true, message_notifications: false }, now), true);
});

test("recipient selection applies account, room and channel preferences to deduplicated users", async t => {
  t.mock.method(Date, "now", () => Date.parse("2026-09-29T10:00:00Z"));
  const f = database({
    cp_messaging_settings: [{ user_id: "account-muted", message_notifications: false }],
    cp_chat_preferences: [
      { user_id: "room-muted", room_id: "room", muted: true },
      { user_id: "allowed", room_id: "another-room", muted: true },
    ],
    chat_channel_read_states: [
      { user_id: "mentions", channel_id: "channel", notification_level: "mentions" },
      { user_id: "temporary", channel_id: "channel", muted_until: "2026-09-29T10:01:00Z" },
      { user_id: "expired", channel_id: "channel", notification_level: "all", muted_until: "2026-09-29T09:59:00Z" },
    ],
  });
  const recipients = await notificationRecipients({ supabaseAdmin: f.db, roomId: "room", channelId: "channel", kind: "message", receiverIds: ["allowed", " allowed ", "", "account-muted", "room-muted", "mentions", "temporary", "expired"] });
  assert.deepEqual(recipients, ["allowed", "expired"]);
  assert.equal(f.queries.length, 3);
});

for (const table of ["cp_messaging_settings", "cp_chat_preferences", "chat_channel_read_states"] as const) {
  test(`a ${table} lookup failure sends no notification`, async t => {
    const requests = pushProvider(t);
    t.mock.method(console, "warn", () => undefined);
    const f = database({ chat_push_tokens: [token(1)] }, { [table]: "database unavailable" });
    await sendChatPushNotifications({ ...input, supabaseAdmin: f.db, channelId: "channel" });
    assert.equal(requests.length, 0);
    assert.equal(f.queries.some(query => query.table === "chat_push_tokens"), false);
  });
}

test("chat delivery includes only eligible enabled unique device tokens and actionable sound payload", async t => {
  const requests = pushProvider(t);
  const f = database({
    cp_messaging_settings: [{ user_id: "muted", message_notifications: false }],
    chat_push_tokens: [token(1), token(2, "recipient", { enabled: false }), token(3, "outsider"), token(4, "muted"), token(5, "recipient", { expo_push_token: "invalid" }), token(6, "recipient", { expo_push_token: "ExpoPushToken[device_1]" })],
  });
  await sendChatPushNotifications({ ...input, receiverIds: ["recipient", "muted"], supabaseAdmin: f.db, channelId: "channel" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://exp.host/--/api/v2/push/send");
  assert.deepEqual(requests[0].body, [{
    to: "ExpoPushToken[device_1]", sound: "comeplayers_message.wav", priority: "high", channelId: "messages", title: "Teman", body: "Pesan baru",
    data: { type: "chat_message", roomId: "room", channelId: "channel", userId: "recipient" },
  }]);
});

test("only the device matching a DeviceNotRegistered ticket is disabled", async t => {
  pushProvider(t, [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }, { status: "error", details: { error: "MessageRateExceeded" } }]);
  t.mock.method(console, "warn", () => undefined);
  const rows = [token(99, "recipient", { expo_push_token: "invalid" }), token(1), token(2), token(3)];
  const f = database({ chat_push_tokens: rows });
  await sendChatPushNotifications({ ...input, supabaseAdmin: f.db });
  assert.equal(f.updates.length, 1);
  assert.deepEqual(f.updates[0].ids, [2]);
  assert.equal(f.updates[0].values.enabled, false);
  assert.match(String(f.updates[0].values.updated_at), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(rows.find(row => row.id === 1)?.enabled, true);
  assert.equal(rows.find(row => row.id === 3)?.enabled, true);
  const cleanup = f.queries.find(query => query.update);
  assert.deepEqual(cleanup?.filters, [{ field: "id", values: [2] }]);
});

test("canceled, answered, expired and invalid calls cannot enqueue an incoming ringtone", async t => {
  const requests = pushProvider(t);
  const now = Date.parse("2026-09-29T10:00:00Z");
  t.mock.method(Date, "now", () => now);
  for (const row of [
    { status: "canceled", created_at: new Date(now).toISOString() },
    { status: "accepted", created_at: new Date(now).toISOString() },
    { status: "ringing", created_at: new Date(now - 60_000).toISOString() },
    { status: "ringing", created_at: "invalid" },
  ]) {
    const f = database({ cp_calls: [{ id: "call", room_id: "room", callee_id: "recipient", media: "audio", ...row }], chat_push_tokens: [token(1)] });
    await sendCallPushNotifications({ supabaseAdmin: f.db, callId: "call", senderName: "Teman" });
    assert.equal(f.queries.length, 1, "ineligible calls must stop before device lookup");
  }
  assert.equal(requests.length, 0);
});

for (const setting of ["call_notifications", "allow_calls"]) test(`call delivery respects ${setting}`, async t => {
  const requests = pushProvider(t);
  const f = database({
    cp_calls: [{ id: "call", room_id: "room", callee_id: "recipient", created_at: new Date().toISOString(), status: "ringing", media: "audio" }],
    cp_messaging_settings: [{ user_id: "recipient", [setting]: false }], chat_push_tokens: [token(1)],
  });
  await sendCallPushNotifications({ supabaseAdmin: f.db, callId: "call", senderName: "Teman" });
  assert.equal(requests.length, 0);
});

test("a valid ringing call carries only its remaining lifetime and the correct conversation", async t => {
  const requests = pushProvider(t);
  const now = Date.parse("2026-09-29T10:00:00Z");
  t.mock.method(Date, "now", () => now);
  const f = database({ cp_calls: [{ id: "call", room_id: "room", callee_id: "recipient", created_at: new Date(now - 25_000).toISOString(), status: "ringing", media: "video" }], chat_push_tokens: [token(1)] });
  await sendCallPushNotifications({ supabaseAdmin: f.db, callId: "call", senderName: "Teman" });
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body, [{
    to: "ExpoPushToken[device_1]", sound: "comeplayers_call.wav", priority: "high", channelId: "calls", ttl: 35,
    expiration: Math.floor((now + 35_000) / 1000), categoryId: "incoming_call", title: "Teman", body: "Panggilan video masuk",
    data: { type: "incoming_call", roomId: "room", callId: "call", userId: "recipient", expiresAt: now + 35_000 },
  }]);
});

test("a call canceled during device lookup cannot ring a recipient", async t => {
  const requests = pushProvider(t);
  const call = { id: "call", room_id: "room", callee_id: "recipient", created_at: new Date().toISOString(), status: "ringing", media: "audio" };
  const f = database({ cp_calls: [call], chat_push_tokens: [token(1)] }, {}, table => {
    if (table === "chat_push_tokens") call.status = "canceled";
  });
  await sendCallPushNotifications({ supabaseAdmin: f.db, callId: "call", senderName: "Teman" });
  assert.equal(requests.length, 0);
  assert.equal(f.queries.filter(query => query.table === "cp_calls").length, 2, "call status is rechecked after asynchronous lookups");
});

test("a call expiring during device lookup cannot enqueue a stale ringtone", async t => {
  const requests = pushProvider(t);
  const created = Date.parse("2026-09-29T10:00:00Z");
  let now = created + 59_000;
  t.mock.method(Date, "now", () => now);
  const f = database({ cp_calls: [{ id: "call", room_id: "room", callee_id: "recipient", created_at: new Date(created).toISOString(), status: "ringing", media: "audio" }], chat_push_tokens: [token(1)] }, {}, table => {
    if (table === "chat_push_tokens") now += 2_000;
  });
  await sendCallPushNotifications({ supabaseAdmin: f.db, callId: "call", senderName: "Teman" });
  assert.equal(requests.length, 0);
});

test("a slow device lookup reduces the ringtone TTL before delivery", async t => {
  const requests = pushProvider(t);
  const created = Date.parse("2026-09-29T10:00:00Z");
  let now = created + 10_000;
  t.mock.method(Date, "now", () => now);
  const f = database({ cp_calls: [{ id: "call", room_id: "room", callee_id: "recipient", created_at: new Date(created).toISOString(), status: "ringing", media: "audio" }], chat_push_tokens: [token(1)] }, {}, table => {
    if (table === "chat_push_tokens") now += 7_000;
  });
  await sendCallPushNotifications({ supabaseAdmin: f.db, callId: "call", senderName: "Teman" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body[0].ttl, 43);
  assert.equal(requests[0].body[0].expiration, Math.floor((created + 60_000) / 1000));
});
