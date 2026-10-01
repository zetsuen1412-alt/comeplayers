import test from "node:test";
import assert from "node:assert/strict";
import { isSocialChatRoom, isTransactionChatRoom } from "../lib/chatRoomScope";

test("marketplace conversations are excluded from the social inbox", () => {
  for (const room of [
    { room_type: "product", product_id: 51 },
    { room_type: "order", order_id: "82" },
    { room_type: "direct", product_id: 51 },
    { room_type: "direct", order_id: 82 },
    { room_type: "direct", product: { id: 51 } },
    { room_type: "direct", order: { id: 82 } },
    { room_type: "product", product_id: null },
  ]) {
    assert.equal(isTransactionChatRoom(room), true);
    assert.equal(isSocialChatRoom(room), false);
  }
});

test("ordinary direct messages and groups stay in the social inbox", () => {
  for (const room of [
    { room_type: "direct", product_id: null, order_id: null },
    { room_type: "group", product_id: null, order_id: null },
    { room_type: "direct", product_id: 0, order_id: "0" },
  ]) {
    assert.equal(isSocialChatRoom(room), true);
    assert.equal(isTransactionChatRoom(room), false);
  }
});
