export type RateType = "marketplace_fee" | "seller_sales_tax" | "withdrawal_tax";

export type RateProposalInput = {
  rateType: RateType;
  ratePercent: number;
  fixedAmount?: number;
  effectiveFrom: string;
  countryCode?: string;
  payoutMethod?: string;
  currency?: string;
  sourceReference: string;
  reason: string;
};

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeRateProposal(input: RateProposalInput) {
  const rateType = input.rateType;
  if (!(["marketplace_fee", "seller_sales_tax", "withdrawal_tax"] as string[]).includes(rateType)) {
    throw new Error("Unsupported rate type.");
  }
  const ratePercent = Math.round(finite(input.ratePercent) * 10_000) / 10_000;
  const fixedAmount = Math.round(Math.max(0, finite(input.fixedAmount)) * 100) / 100;
  const maximum = rateType === "marketplace_fee" ? 50 : 100;
  if (ratePercent < 0 || ratePercent > maximum) {
    throw new Error(`Rate must be between 0 and ${maximum} percent.`);
  }
  const timestamp = new Date(input.effectiveFrom).getTime();
  if (!Number.isFinite(timestamp)) throw new Error("Effective date is invalid.");
  const sourceReference = String(input.sourceReference || "").trim().slice(0, 500);
  const reason = String(input.reason || "").trim().slice(0, 1000);
  if (!sourceReference) throw new Error("A policy or legal source reference is required.");
  if (!reason) throw new Error("A change reason is required.");

  if (rateType !== "withdrawal_tax") {
    return {
      rateType,
      ratePercent,
      fixedAmount: 0,
      effectiveFrom: new Date(timestamp).toISOString(),
      countryCode: null,
      payoutMethod: null,
      currency: null,
      sourceReference,
      reason,
    };
  }

  const countryCode = String(input.countryCode || "").trim().toUpperCase();
  const payoutMethod = String(input.payoutMethod || "").trim().toLowerCase();
  const currency = String(input.currency || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error("Withdrawal tax requires a two-letter country code.");
  if (!/^[a-z0-9_-]{2,40}$/.test(payoutMethod)) throw new Error("Withdrawal tax requires a payout method.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Withdrawal tax requires a three-letter currency.");
  return {
    rateType,
    ratePercent,
    fixedAmount,
    effectiveFrom: new Date(timestamp).toISOString(),
    countryCode,
    payoutMethod,
    currency,
    sourceReference,
    reason,
  };
}

export function approvalProgress(input: {
  requestedBy: string;
  firstApprovedBy?: string | null;
  secondApprovedBy?: string | null;
}) {
  const requester = String(input.requestedBy || "");
  const approvers = [input.firstApprovedBy, input.secondApprovedBy]
    .map((value) => String(value || ""))
    .filter((value) => value && value !== requester);
  const distinct = new Set(approvers);
  return { approvals: distinct.size, complete: distinct.size >= 2, approvers: [...distinct] };
}
