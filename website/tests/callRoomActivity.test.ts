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
      const filter = url.searchParams.get("last_message_at");
      const newer = filter?.startsWith("lt.") && room.last_message_at !== null && room.last_message_at < filter.slice(3);
      const first = filter === "is.null" && room.last_message_at === null;
      if (newer || first) Object.assign(room, JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    },
  }) as unknown as SupabaseClient;
  const call = (occurredAt: string) => recordCallRoomActivity(client, { roomId: "room", actorId: "caller", occurredAt, media: "video", status: "ended" });

  await call("2026-09-29T10:10:00.000Z");
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
  assert.ok(requests.some(url => url.searchParams.get("last_message_at")?.startsWith("lt.")));
  assert.ok(requests.some(url => url.searchParams.get("last_message_at") === "is.null"));
});

test("only a recognized call marker gets a public call preview", () => {
  assert.equal(callActivityPreview("[comeplayers:call-activity:v1:audio:ringing]"), "Panggilan suara");
  assert.equal(callActivityPreview("Encrypted message"), null);
  assert.equal(callActivityPreview("[comeplayers:call-activity:v1:audio:unknown]"), null);
});
