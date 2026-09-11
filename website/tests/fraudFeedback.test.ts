import assert from "node:assert/strict";
import test from "node:test";
import { disputeResolutionFeedback } from "@/lib/fraudFeedback";

test("buyer win raises seller risk and rewards the validated buyer", () => {
  const rows = disputeResolutionFeedback({
    action: "buyer_win",
    buyerId: "buyer",
    sellerId: "seller",
  });
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.subjectUserId === "seller")?.scoreDelta, 25);
  assert.equal(rows.find((row) => row.subjectUserId === "buyer")?.scoreDelta, -3);
});

test("non-final dispute state produces no risk feedback", () => {
  assert.deepEqual(
    disputeResolutionFeedback({ action: "investigating", buyerId: "buyer", sellerId: "seller" }),
    []
  );
});
