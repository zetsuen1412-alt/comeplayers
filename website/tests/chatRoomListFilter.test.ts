import assert from "node:assert/strict";
import test from "node:test";
import { PostgrestClient } from "@supabase/postgrest-js";
import { chatRoomListFilter, type ChatRoomListScope } from "../lib/chatRoomListFilter";

const viewer = "11111111-1111-4111-8111-111111111111";

async function requestFor(scope: ChatRoomListScope) {
  let requested: URL | null = null;
  const client = new PostgrestClient("https://example.test", {
    fetch: async (input) => {
      requested = new URL(String(input));
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const result = await client.from("chat_rooms").select("id,room_type,product_id,order_id")
    .or(chatRoomListFilter(viewer, scope)).limit(100);
  assert.equal(result.error, null);
  assert.ok(requested);
  return requested as URL;
}

test("PostgREST receives one participant-bound transaction filter before pagination", async () => {
  const url = await requestFor("transaction");
  assert.deepEqual(url.searchParams.getAll("or"), [
    `(and(or(buyer_id.eq.${viewer},seller_id.eq.${viewer}),or(product_id.not.is.null,order_id.not.is.null,room_type.in.(product,order))))`,
  ]);
  assert.equal(url.searchParams.get("limit"), "100");
});

test("social inbox includes ordinary direct and group rooms but excludes product and order rooms", async () => {
  const url = await requestFor("social");
  assert.deepEqual(url.searchParams.getAll("or"), [
    `(and(or(buyer_id.eq.${viewer},seller_id.eq.${viewer}),product_id.is.null,order_id.is.null,or(room_type.is.null,room_type.not.in.(product,order))))`,
  ]);
});

test("raw PostgREST filter rejects an invalid participant identifier", () => {
  assert.throws(() => chatRoomListFilter(`${viewer},seller_id.eq.attacker`, "transaction"), /Invalid chat participant/);
});
