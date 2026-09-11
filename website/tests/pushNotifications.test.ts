import assert from "node:assert/strict";
import test from "node:test";
import { isExpoPushToken } from "../lib/pushNotifications";

test("accepts Expo push token formats", () => {
  assert.equal(isExpoPushToken("ExponentPushToken[abcdefghijklmnop]"), true);
  assert.equal(isExpoPushToken("ExpoPushToken[abcdefghijklmnop]"), true);
});

test("rejects malformed push tokens", () => {
  assert.equal(isExpoPushToken(""), false);
  assert.equal(isExpoPushToken("not-a-token"), false);
  assert.equal(isExpoPushToken("ExponentPushToken[]"), false);
});
