export type PayPalPayoutRecipient = {
  withdrawalId: number;
  receiver: string;
  amount: number;
  currency: string;
  note?: string;
};

export function buildPayPalPayoutRequest(input: {
  batchId: string;
  recipient: PayPalPayoutRecipient;
}) {
  const batchId = String(input.batchId || "").trim().slice(0, 50);
  const receiver = String(input.recipient.receiver || "").trim();
  const currency = String(input.recipient.currency || "").trim().toUpperCase();
  const amount = Number(input.recipient.amount || 0);
  if (!batchId) throw new Error("PayPal sender batch ID is required.");
  if (!receiver) throw new Error("PayPal payout receiver is required.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("PayPal payout currency is invalid.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("PayPal payout amount must be positive.");
  return {
    sender_batch_header: {
      sender_batch_id: batchId,
      email_subject: "You have a payout from ComePlayers",
      email_message: "Your ComePlayers seller withdrawal has been sent.",
    },
    items: [{
      recipient_type: "EMAIL",
      amount: { value: amount.toFixed(2), currency },
      receiver,
      note: String(input.recipient.note || `ComePlayers withdrawal #${input.recipient.withdrawalId}`).slice(0, 4000),
      sender_item_id: `withdrawal-${input.recipient.withdrawalId}`,
    }],
  };
}

export function normalizePayPalPayoutStatus(value: unknown) {
  const status = String(value || "").trim().toUpperCase();
  if (["SUCCESS", "COMPLETED"].includes(status)) return "paid" as const;
  if (["DENIED", "FAILED", "BLOCKED", "RETURNED", "REFUNDED", "UNCLAIMED", "CANCELED", "CANCELLED"].includes(status)) return "failed" as const;
  if (["PENDING", "PROCESSING", "NEW", "ONHOLD"].includes(status)) return "processing" as const;
  return "unknown" as const;
}
