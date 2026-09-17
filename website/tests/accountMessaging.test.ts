import test from "node:test";
import assert from "node:assert/strict";
import { requireChatRoomAccess, type ChatRoomRow } from "../lib/chatServer";
import { accountMessagingUpgradeRequired } from "../lib/accountMessagingUpgrade";

const room: ChatRoomRow = {
  id: "33333333-3333-4333-8333-333333333333",
  buyer_id: "11111111-1111-4111-8111-111111111111",
  seller_id: "22222222-2222-4222-8222-222222222222",
  room_type: "direct", product_id: null, order_id: null,
};

function database() {
  const tables: string[] = [];
  const client = { from(table: string) {
    tables.push(table);
    const chain = {
      select: () => chain, eq: () => chain,
      maybeSingle: async () => ({ data: table === "chat_rooms" ? room : { role: "admin" }, error: null }),
    };
    return chain;
  }};
  return { client: client as never, tables };
}

test("either account participant can open the same private history without a device identity", async () => {
  for (const userId of [room.buyer_id, room.seller_id]) {
    const db = database();
    const access = await requireChatRoomAccess({ roomId: room.id, userId, supabaseAdmin: db.client, allowAdmin: false });
    assert.equal(access.room.id, room.id);
    assert.deepEqual(db.tables, ["chat_rooms"]);
  }
});

test("another signed-in account cannot read private history, including an administrator", async () => {
  const db = database();
  await assert.rejects(requireChatRoomAccess({
    roomId: room.id, userId: "44444444-4444-4444-8444-444444444444",
    supabaseAdmin: db.client, allowAdmin: false,
  }), (error: Error & { status?: number }) => error.status === 403);
  assert.deepEqual(db.tables, ["chat_rooms"]);
});

test("retired enrollment requires authentication and never creates a key or backup", async () => {
  const response = await accountMessagingUpgradeRequired(new Request("https://example.test/api/messages/secure/account"));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("ordinary verified login receives an explicit upgrade, without database enrollment", async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const previousSingle = process.env.SINGLE_DEVICE_SESSIONS_ENABLED;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-key";
  process.env.SINGLE_DEVICE_SESSIONS_ENABLED = "false";
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input); requests.push(url);
    assert.equal(new URL(url).pathname, "/auth/v1/user");
    return Response.json({ id: room.buyer_id, aud: "authenticated", factors: [] });
  };
  try {
    const response = await accountMessagingUpgradeRequired(new Request("https://example.test/api/messages/secure/account", {
      method: "POST", headers: { Authorization: "Bearer fixture-access" }, body: "{}",
    }));
    assert.equal(response.status, 426);
    assert.equal((await response.json()).code, "ACCOUNT_MESSAGES_UPDATE_REQUIRED");
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries({
      NEXT_PUBLIC_SUPABASE_URL: previousUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: previousKey,
      SINGLE_DEVICE_SESSIONS_ENABLED: previousSingle,
    })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
