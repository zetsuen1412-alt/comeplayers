import test from "node:test";
import assert from "node:assert/strict";
import { assertLegacyDirectMessagingAllowed, type ChatRoomRow } from "../lib/chatServer";

const direct: ChatRoomRow = {
  id: "33333333-3333-4333-8333-333333333333",
  buyer_id: "11111111-1111-4111-8111-111111111111",
  seller_id: "22222222-2222-4222-8222-222222222222",
  product_id: null,
  order_id: null,
  room_type: "direct",
};

function database(result: { data: unknown[] | null; error: { message: string } | null }) {
  let queried = false;
  const promise = Promise.resolve(result);
  const chain = { select: () => chain, in: () => chain, limit: () => { queried = true; return promise; } };
  return { client: { from: () => chain }, queried: () => queried };
}

test("legacy plaintext writes are blocked after either direct participant enrolls E2EE", async () => {
  const db = database({ data: [{ user_id: direct.buyer_id }], error: null });
  await assert.rejects(assertLegacyDirectMessagingAllowed(db.client as never, direct), (error: Error & { status?: number }) => {
    assert.equal(error.status, 426);
    assert.match(error.message, /encrypted identity/i);
    return true;
  });
  assert.equal(db.queried(), true);
});

test("legacy direct writes remain available before enrollment and Community bypasses the direct gate", async () => {
  const open = database({ data: [], error: null });
  await assertLegacyDirectMessagingAllowed(open.client as never, direct);
  const community = database({ data: [{ user_id: direct.buyer_id }], error: null });
  await assertLegacyDirectMessagingAllowed(community.client as never, { ...direct, room_type: "group" });
  assert.equal(community.queried(), false);
});

test("the gate tolerates only the migration rollout's missing-table response", async () => {
  await assertLegacyDirectMessagingAllowed(database({ data: null, error: { message: "relation cp_secure_accounts does not exist" } }).client as never, direct);
  await assert.rejects(assertLegacyDirectMessagingAllowed(database({ data: null, error: { message: "database unavailable" } }).client as never, direct));
});
