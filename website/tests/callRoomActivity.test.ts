import assert from "node:assert/strict";
import test from "node:test";
import { PostgrestClient } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callActivityMarker, callActivityPreview, recordCallRoomActivity } from "../lib/callRoomActivity";
import { recordSecureRoomActivity } from "../lib/secureRoomActivity";

test("a newer call or encrypted message wins the shared inbox clock without exposing message text", async () => {
  const room = { last_message: null as string | null, last_message_at: null as string | null, last_message_sender_id: null as string | null };
  const eventTimes = new Map([
    ["new-message", "2026-09-29T10:11:00.000Z"],
    ["delayed-message", "2026-09-29T10:11:30.000Z"],
  ]);
  const requests: URL[] = [];
  const client = new PostgrestClient("https://example.test", {
    fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/cp_secure_events")) {
        const eventId = url.searchParams.get("id")?.replace(/^eq\./, "") || "";
        return new Response(JSON.stringify({ created_at: eventTimes.get(eventId) }), { status: 200, headers: { "content-type": "application/json" } });
      }
      assert.ok(url.pathname.endsWith("/chat_rooms"));
      assert.equal(url.searchParams.get("id"), "eq.room", "every branch remains scoped to the exact room");
      const combined = url.searchParams.get("or");
      const filter = url.searchParams.get("last_message_at") || (combined?.match(/^\(last_message_at\.(lt\.[^,]+),last_message_at\.is\.null\)$/)?.[1]);
      const newer = filter?.startsWith("lt.") && room.last_message_at !== null && room.last_message_at < filter.slice(3);
      const first = (filter === "is.null" || !!combined) && room.last_message_at === null;
      if (newer || first) Object.assign(room, JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    },
  }) as unknown as SupabaseClient;
  const call = (occurredAt: string) => recordCallRoomActivity(client, { roomId: "room", actorId: "caller", occurredAt, media: "video", status: "ended" });

  await call("2026-09-29T10:10:00.000Z");
  assert.equal(requests.length, 1, "a call activity needs one conditional PATCH, not two round trips");
  assert.equal(room.last_message, callActivityMarker("video", "ended"));
  assert.equal(callActivityPreview(room.last_message), "Panggilan video berakhir");

  await recordSecureRoomActivity(client, "new-message", "room", "sender");
  assert.equal(room.last_message_at, "2026-09-29T10:11:00.000Z");
  assert.equal(room.last_message, null);
  await call("2026-09-29T10:09:00.000Z");
  assert.equal(room.last_message, null, "an older call cannot replace a newer encrypted message");

  await call("2026-09-29T10:12:00.000Z");
  await recordSecureRoomActivity(client, "delayed-message", "room", "sender");
  assert.equal(room.last_message_at, "2026-09-29T10:12:00.000Z");
  assert.equal(room.last_message, callActivityMarker("video", "ended"), "a delayed message retry cannot replace the newer call");
  assert.equal(requests.filter(url => url.searchParams.has("or")).length, 3);
  assert.ok(requests.some(url => url.searchParams.get("or") === "(last_message_at.lt.2026-09-29T10:10:00.000Z,last_message_at.is.null)"));
  assert.ok(requests.some(url => url.searchParams.get("last_message_at")?.startsWith("lt.")));
  assert.ok(requests.some(url => url.searchParams.get("last_message_at") === "is.null"));
});

test("only a recognized call marker gets a public call preview", () => {
  assert.equal(callActivityPreview("[comeplayers:call-activity:v1:audio:ringing]"), "Panggilan suara");
  assert.equal(callActivityPreview("Encrypted message"), null);
  assert.equal(callActivityPreview("[comeplayers:call-activity:v1:audio:unknown]"), null);
});


test("call clock keeps database microseconds and rejects malformed raw filter values before I/O", async () => {
  const requests: Array<{ url: URL; body: Record<string, unknown> }> = [];
  const client = new PostgrestClient("https://example.test", { fetch: async (input, init) => {
    requests.push({ url: new URL(String(input)), body: JSON.parse(String(init?.body)) });
    return new Response(null, { status: 204 });
  } }) as unknown as SupabaseClient;
  const input = { roomId: "room-a", actorId: "actor-a", media: "audio" as const, status: "accepted" as const };
  const timestamp = "2026-09-30T05:10:15.123456+00:00";
  await recordCallRoomActivity(client, { ...input, occurredAt: timestamp });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.last_message_at, timestamp);
  assert.equal(requests[0].url.searchParams.get("id"), "eq.room-a");
  assert.equal(requests[0].url.searchParams.get("or"), `(last_message_at.lt.${timestamp},last_message_at.is.null)`);
  for (const occurredAt of ["invalid", "2026-09-30", "2026-99-99T99:99:99Z", "2026-09-30T05:10:15Z,id.neq.room-a", "2026-09-30T05:10:15Z)"]) {
    await assert.rejects(recordCallRoomActivity(client, { ...input, occurredAt }), /Invalid call activity time/);
  }
  assert.equal(requests.length, 1, "invalid OR filter input must never reach the database");
});

test("single call clock write preserves database failures", async () => {
  const client = new PostgrestClient("https://example.test", { fetch: async () => new Response(JSON.stringify({ message: "db unavailable", code: "PGRST000" }), { status: 503, headers: { "content-type": "application/json" } }) }) as unknown as SupabaseClient;
  await assert.rejects(recordCallRoomActivity(client, { roomId: "room", actorId: "caller", occurredAt: "2026-09-30T05:10:00Z", media: "audio", status: "ringing" }), error => (error as { message?: string }).message === "db unavailable");
});
