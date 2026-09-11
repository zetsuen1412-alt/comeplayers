export type DisputeFeedback = {
  subjectUserId: string;
  role: "buyer" | "seller";
  scoreDelta: number;
  outcome: string;
  reason: string;
};

export function disputeResolutionFeedback(input: {
  action: string;
  buyerId?: string | null;
  sellerId?: string | null;
}): DisputeFeedback[] {
  const action = String(input.action || "").toLowerCase();
  const rows: DisputeFeedback[] = [];

  if (action === "buyer_win" && input.sellerId) {
    rows.push({
      subjectUserId: input.sellerId,
      role: "seller",
      scoreDelta: 25,
      outcome: action,
      reason: "dispute_lost_as_seller",
    });
  }
  if (action === "buyer_win" && input.buyerId) {
    rows.push({
      subjectUserId: input.buyerId,
      role: "buyer",
      scoreDelta: -3,
      outcome: action,
      reason: "validated_buyer_claim",
    });
  }
  if (action === "seller_win" && input.buyerId) {
    rows.push({
      subjectUserId: input.buyerId,
      role: "buyer",
      scoreDelta: 15,
      outcome: action,
      reason: "dispute_lost_as_buyer",
    });
  }
  if (action === "seller_win" && input.sellerId) {
    rows.push({
      subjectUserId: input.sellerId,
      role: "seller",
      scoreDelta: -2,
      outcome: action,
      reason: "validated_seller_fulfillment",
    });
  }

  return rows;
}
