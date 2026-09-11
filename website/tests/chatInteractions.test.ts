import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_REACTION_EMOJIS,
  canModerateChatMessage,
  normalizeChatReaction,
} from "../lib/chatInteractions";

test("only the Discord-style reaction allowlist is accepted", () => {
  for (const emoji of CHAT_REACTION_EMOJIS) {
    assert.equal(normalizeChatReaction(emoji), emoji);
  }
  assert.equal(normalizeChatReaction("  🔥  "), "🔥");
  assert.equal(normalizeChatReaction("😈"), null);
  assert.equal(normalizeChatReaction(null), null);
});

test("chat moderation is limited to trusted room roles", () => {
  assert.equal(canModerateChatMessage("admin"), true);
  assert.equal(canModerateChatMessage("GROUP_OWNER"), true);
  assert.equal(canModerateChatMessage("group_moderator"), true);
  assert.equal(canModerateChatMessage("member"), false);
  assert.equal(canModerateChatMessage(undefined), false);
});
