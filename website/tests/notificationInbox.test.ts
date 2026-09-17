import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clearNotificationsThrough,
  markAnnouncementsRead,
  markNotificationRead,
  notificationHref,
} from "../lib/notificationInbox";

function mockClient(result: { data?: unknown; error?: { message: string } | null } = {}) {
  const calls: unknown[][] = [];
  const builder = {
    from: (...args: unknown[]) => { calls.push(["from", ...args]); return builder; },
    update: (...args: unknown[]) => { calls.push(["update", ...args]); return builder; },
    eq: (...args: unknown[]) => { calls.push(["eq", ...args]); return builder; },
    lte: (...args: unknown[]) => { calls.push(["lte", ...args]); return builder; },
    select: (...args: unknown[]) => { calls.push(["select", ...args]); return builder; },
    maybeSingle: () => Promise.resolve(result),
    upsert: (...args: unknown[]) => { calls.push(["upsert", ...args]); return Promise.resolve(result); },
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return { client: builder as unknown as SupabaseClient, calls };
}

test("mark read persists a user-scoped update and verifies the affected row", async () => {
  const { client, calls } = mockClient({ data: { id: 66 }, error: null });
  await markNotificationRead(client, "user-a", 66);
  assert.deepEqual(calls, [
    ["from", "notifications"], ["update", { is_read: true }],
    ["eq", "user_id", "user-a"], ["eq", "id", 66], ["select", "id"],
  ]);
});

test("an inaccessible notification is not reported as successfully read", async () => {
  const { client } = mockClient({ data: null, error: null });
  await assert.rejects(markNotificationRead(client, "user-a", 66), /could not be marked/);
});

test("database failures are surfaced instead of hiding notifications", async () => {
  const { client } = mockClient({ error: { message: "Permission denied" } });
  await assert.rejects(markNotificationRead(client, "user-a", 66), /Permission denied/);
  await assert.rejects(clearNotificationsThrough(client, "user-a", 66), /Permission denied/);
  await assert.rejects(markAnnouncementsRead(client, "user-a", [2]), /Permission denied/);
});

test("clear all covers the backlog, but not other users or newer arrivals", async () => {
  const { client, calls } = mockClient({ error: null });
  await clearNotificationsThrough(client, "user-a", 68);
  assert.deepEqual(calls, [
    ["from", "notifications"], ["update", { is_read: true }],
    ["eq", "user_id", "user-a"], ["eq", "is_read", false], ["lte", "id", 68],
  ]);
  const rows = [
    { id: 1, user_id: "user-a", is_read: false },
    { id: 68, user_id: "user-a", is_read: false },
    { id: 69, user_id: "user-a", is_read: false },
    { id: 4, user_id: "user-b", is_read: false },
    { id: 5, user_id: "user-a", is_read: true },
  ];
  const filters = calls.filter(([method]) => method === "eq" || method === "lte");
  const matched = rows.filter((row) => filters.every(([method, key, value]) => {
    const actual = row[key as keyof typeof row];
    return method === "eq" ? actual === value : Number(actual) <= Number(value);
  }));
  assert.deepEqual(matched.map((row) => row.id), [1, 68]);
  assert.equal(rows.length, 5); // No DELETE: history is preserved.
});

test("announcement reads are per-user, deduplicated, and idempotent", async () => {
  const { client, calls } = mockClient({ error: null });
  await markAnnouncementsRead(client, "user-a", [2, 2, 3]);
  const [, rows, options] = calls[1] as [string, { announcement_id: number; user_id: string; read_at: string }[], unknown];
  assert.deepEqual(calls[0], ["from", "announcement_reads"]);
  assert.deepEqual(rows.map(({ announcement_id, user_id }) => ({ announcement_id, user_id })), [
    { announcement_id: 2, user_id: "user-a" }, { announcement_id: 3, user_id: "user-a" },
  ]);
  assert.ok(rows.every((row) => Number.isFinite(Date.parse(row.read_at))));
  assert.deepEqual(options, { onConflict: "announcement_id,user_id", ignoreDuplicates: true });
});

test("an empty announcement inbox performs no write", async () => {
  const { client, calls } = mockClient();
  await markAnnouncementsRead(client, "user-a", []);
  assert.deepEqual(calls, []);
});

test("missing accounts and invalid IDs cannot create broad mutations", async () => {
  const { client, calls } = mockClient();
  await assert.rejects(markNotificationRead(client, "", 66), /Authentication/);
  await assert.rejects(clearNotificationsThrough(client, "user-a", NaN), /Invalid/);
  await assert.rejects(markAnnouncementsRead(client, "user-a", [-1]), /Invalid/);
  assert.deepEqual(calls, []);
});

test("notification navigation accepts local paths and rejects unsafe destinations", () => {
  assert.equal(notificationHref("/seller/orders/66?tab=details"), "/seller/orders/66?tab=details");
  for (const value of [null, undefined, "", "javascript:alert(1)", "//evil.example", "/\\evil.example", "https://evil.example", "/\nevil.example"]) {
    assert.equal(notificationHref(value), "/notifications");
  }
});
