import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requireChatRoomAccess, type ChatRoomRow } from "../lib/chatServer";

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

test("either account participant can resolve the direct room before E2EE key checks", async () => {
  for (const userId of [room.buyer_id, room.seller_id]) {
    const db = database();
    const access = await requireChatRoomAccess({ roomId: room.id, userId, supabaseAdmin: db.client, allowAdmin: false });
    assert.equal(access.room.id, room.id);
    assert.deepEqual(db.tables, ["chat_rooms"]);
  }
});

test("another signed-in account cannot read the direct room, including an administrator", async () => {
  const db = database();
  await assert.rejects(requireChatRoomAccess({
    roomId: room.id, userId: "44444444-4444-4444-8444-444444444444",
    supabaseAdmin: db.client, allowAdmin: false,
  }), (error: Error & { status?: number }) => error.status === 403);
  assert.deepEqual(db.tables, ["chat_rooms"]);
});

test("secure account routes are active again and do not use the retired server-readable upgrade response", () => {
  const account = readFileSync(new URL("../app/api/messages/secure/account/route.ts", import.meta.url), "utf8");
  const passkey = readFileSync(new URL("../app/api/messages/secure/account/passkey/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(account, /accountMessagingUpgradeRequired/);
  assert.doesNotMatch(passkey, /accountMessagingUpgradeRequired/);
  assert.match(account, /cp_secure_authorize_account_recovery/);
  assert.match(passkey, /passkey/i);
});
