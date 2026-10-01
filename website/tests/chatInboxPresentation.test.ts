import assert from "node:assert/strict";
import test from "node:test";
import { chatRoomPreview, sortInboxRooms } from "../lib/chatInboxPresentation";

test("an encrypted message moves its chat above older chats without exposing a plaintext preview", () => {
  const rooms = [
    { id: "older", created_at: "2026-09-29T10:00:00Z", last_message_at: "2026-09-29T10:01:00Z", last_message: "Halo" },
    { id: "encrypted", created_at: "2026-09-28T10:00:00Z", last_message_at: "2026-09-29T10:02:00Z", last_message: null },
    { id: "empty", created_at: "2026-09-27T10:00:00Z", last_message_at: null, last_message: null },
  ];
  assert.deepEqual(sortInboxRooms(rooms).map(room => room.id), ["encrypted", "older", "empty"]);
  assert.deepEqual(rooms.map(room => room.id), ["older", "encrypted", "empty"]);
  assert.equal(chatRoomPreview(rooms[1]), "Pesan baru");
  assert.equal(chatRoomPreview(rooms[2]), "Belum ada pesan");
  assert.equal(chatRoomPreview(rooms[0]), "Halo");
  assert.equal(chatRoomPreview({ id: "call", last_message: null, last_message_at: "2026-09-29T10:03:00Z", activity_kind: "call", activity_preview: "Panggilan video berakhir" }), "Panggilan video berakhir");
});
