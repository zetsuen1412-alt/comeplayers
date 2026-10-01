import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordSecureRoomActivity } from "../lib/secureRoomActivity";

type Room = {
  last_message: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
};

function database(room: Room, events: Record<string, string>) {
  const db = {
    from(table: string) {
      if (table === "cp_secure_events") {
        const filters = new Map<string, string>();
        const lookup = {
          select() { return lookup; },
          eq(field: string, value: string) { filters.set(field, value); return lookup; },
          async single() {
            const at = events[filters.get("id") || ""];
            return filters.get("room_id") === "room" && at
              ? { data: { created_at: at }, error: null }
              : { data: null, error: new Error("Event missing") };
          },
        };
        return lookup;
      }
      if (table === "chat_rooms") {
        return {
          update(next: Room) {
            let selected = false;
            const update = {
              eq(field: string, value: string) { selected = field === "id" && value === "room"; return update; },
              async lt(field: string, value: string) {
                if (selected && field === "last_message_at" && room.last_message_at && room.last_message_at < value) Object.assign(room, next);
                return { error: null };
              },
              async is(field: string, value: null) {
                if (selected && field === "last_message_at" && value === null && room.last_message_at === null) Object.assign(room, next);
                return { error: null };
              },
            };
            return update;
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
  return db;
}

test("encrypted message activity reorders a room without storing plaintext or regressing on retry", async () => {
  const room: Room = { last_message: "old preview", last_message_at: null, last_message_sender_id: null };
  const db = database(room, { older: "2026-09-29T04:00:00Z", newer: "2026-09-29T04:25:00Z" });
  await recordSecureRoomActivity(db, "older", "room", "sender-a");
  assert.deepEqual(room, { last_message: null, last_message_at: "2026-09-29T04:00:00Z", last_message_sender_id: "sender-a" });
  await recordSecureRoomActivity(db, "newer", "room", "sender-b");
  await recordSecureRoomActivity(db, "older", "room", "sender-a");
  assert.deepEqual(room, { last_message: null, last_message_at: "2026-09-29T04:25:00Z", last_message_sender_id: "sender-b" });
});
