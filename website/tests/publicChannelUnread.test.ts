import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicChannelUnreadByRoom } from "../lib/publicChannelUnread";

test("aggregate returns exact room totals over 5000 without fetching messages or read states", async () => {
  let calls = 0;
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls++; assert.equal(name, "cp_public_channel_unread_counts"); assert.equal(args.p_user_id, "actor");
      assert.deepEqual(args.p_channel_ids, ["c1", "c2", "c3"]);
      return {data: [{channel_id: "c1", unread_count: 6001}, {channel_id: "c2", unread_count: "5"}, {channel_id: "c3", unread_count: 0}], error: null};
    },
    from: () => { throw new Error("Aggregate must not hydrate message rows"); },
  };
  const result = await publicChannelUnreadByRoom(db as unknown as SupabaseClient, "actor", [{id: "c1", roomId: "r1"}, {id: "c1", roomId: "r1"}, {id: "c2", roomId: "r1"}, {id: "c3", roomId: "r2"}]);
  assert.deepEqual(result, new Map([["r1", 6006], ["r2", 0]])); assert.equal(calls, 1);
});

test("older database uses bounded exact HEAD counts with per-channel read boundaries", async () => {
  let running = 0, peak = 0, heads = 0;
  const db = {
    rpc: async () => ({data: null, error: {code: "PGRST202", message: "Function missing"}}),
    from(table: string) {
      const filters = new Map<string, unknown>();
      const query = {
        select(_columns: string, options?: unknown) { if (table === "chat_messages") { assert.deepEqual(options, {count: "exact", head: true}); heads++; } return query; },
        eq(key: string, value: unknown) { filters.set(key, value); return query; },
        in(key: string, values: unknown) { assert.equal(key, "channel_id"); assert.ok(Array.isArray(values)); return query; },
        neq(key: string, value: unknown) { assert.equal(key, "sender_id"); assert.equal(value, "actor"); return query; },
        is(key: string, value: unknown) { assert.equal(key, "deleted_at"); assert.equal(value, null); return query; },
        gt(key: string, value: unknown) { filters.set(key, value); return query; },
        then(resolve: (result: unknown) => void, reject: (error: unknown) => void) {
          return (async () => {
            if (table === "chat_channel_read_states") { assert.equal(filters.get("user_id"), "actor"); return {data: [{channel_id: "c0", last_read_at: "2026-01-01T00:00:00Z"}], error: null}; }
            assert.equal(table, "chat_messages");
            if (filters.get("channel_id") === "c0") assert.equal(filters.get("created_at"), "2026-01-01T00:00:00Z");
            else assert.equal(filters.has("created_at"), false);
            running++; peak = Math.max(peak, running); await new Promise(done => setTimeout(done, 1)); running--;
            return {data: null, count: 6001, error: null};
          })().then(resolve, reject);
        },
      };
      return query;
    },
  };
  const channels = Array.from({length: 20}, (_, n) => ({id: `c${n}`, roomId: "room"}));
  const result = await publicChannelUnreadByRoom(db as unknown as SupabaseClient, "actor", channels);
  assert.equal(result?.get("room"), 20 * 6001); assert.equal(heads, 20); assert.equal(peak, 8);
});

test("real RPC errors fail rather than triggering fallback or reporting zero", async () => {
  const db = {rpc: async () => ({data: null, error: {code: "42501", message: "Permission denied"}}), from: () => {throw new Error("Unexpected fallback");}};
  await assert.rejects(publicChannelUnreadByRoom(db as unknown as SupabaseClient, "actor", [{id: "c1", roomId: "r1"}]), /Permission denied/);
});

test("empty channel list does not contact database", async () => {
  assert.deepEqual(await publicChannelUnreadByRoom({} as SupabaseClient, "actor", []), new Map());
});
