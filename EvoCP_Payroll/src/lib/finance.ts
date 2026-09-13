import { calculateBps } from "@/lib/money";

export type PaymentStatus = "unpaid" | "partial" | "paid" | "overpaid" | "partially_refunded" | "refunded";

export function derivePaymentStatus(args: {
  expectedMinor: number;
  matchedMinor: number;
  refundedMinor?: number;
}): PaymentStatus {
  const refunded = args.refundedMinor ?? 0;
  if (refunded >= args.expectedMinor && args.expectedMinor > 0) return "refunded";
  if (refunded > 0) return "partially_refunded";
  if (args.matchedMinor === 0) return "unpaid";
  if (args.matchedMinor < args.expectedMinor) return "partial";
  if (args.matchedMinor === args.expectedMinor) return "paid";
  return "overpaid";
}

export function calculateWorkerEarning(allocationGrossMinor: number, workerShareBps: number): number {
  return calculateBps(allocationGrossMinor, workerShareBps);
}

export function calculateContributionProfit(args: {
  netRevenueMinor: number;
  workerCostMinor: number;
  vendorCostMinor: number;
  inventoryCogsMinor: number;
  paymentFeesMinor: number;
}): number {
  return (
    args.netRevenueMinor -
    args.workerCostMinor -
    args.vendorCostMinor -
    args.inventoryCogsMinor -
    args.paymentFeesMinor
  );
}
