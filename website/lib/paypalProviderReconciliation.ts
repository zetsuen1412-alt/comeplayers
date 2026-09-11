import type { PayPalCaptureDetails } from "@/lib/paypalProvider";

export type LocalPayPalRecord = {
  transactionId: string;
  marketplaceOrderId: string;
  captureId: string;
  amountUsd: number;
  transactionStatus: string;
  orderPaymentStatus: string;
  orderStatus: string;
};

export type ProviderMismatch = {
  field: string;
  expected: unknown;
  actual: unknown;
  severity: "high" | "critical";
};

function normalize(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function comparePayPalProviderCapture(
  local: LocalPayPalRecord,
  provider: PayPalCaptureDetails
) {
  const mismatches: ProviderMismatch[] = [];

  if (normalize(provider.id) !== normalize(local.captureId)) {
    mismatches.push({
      field: "capture_id",
      expected: local.captureId,
      actual: provider.id || null,
      severity: "critical",
    });
  }

  if (normalize(provider.amount?.currency_code) !== "USD") {
    mismatches.push({
      field: "currency",
      expected: "USD",
      actual: provider.amount?.currency_code || null,
      severity: "critical",
    });
  }

  if (Math.abs(numeric(provider.amount?.value) - numeric(local.amountUsd)) > 0.01) {
    mismatches.push({
      field: "amount_usd",
      expected: numeric(local.amountUsd),
      actual: numeric(provider.amount?.value),
      severity: "critical",
    });
  }

  const localPaymentStatus = normalize(local.orderPaymentStatus);
  const localOrderStatus = normalize(local.orderStatus);
  const localTransactionStatus = normalize(local.transactionStatus);
  const localRefunded = [localPaymentStatus, localOrderStatus, localTransactionStatus].some(
    (value) => value.includes("REFUND")
  );
  const localPaid =
    localPaymentStatus === "PAID" ||
    ["PAID", "DELIVERED", "COMPLETED"].includes(localOrderStatus);
  const providerStatus = normalize(provider.status);
  const acceptedStatuses = localRefunded
    ? ["PARTIALLY_REFUNDED", "REFUNDED"]
    : localPaid
      ? ["COMPLETED"]
      : ["PENDING", "COMPLETED"];

  if (!acceptedStatuses.includes(providerStatus)) {
    mismatches.push({
      field: "provider_status",
      expected: acceptedStatuses,
      actual: provider.status || null,
      severity: localPaid ? "critical" : "high",
    });
  }

  return {
    status: mismatches.length === 0 ? ("matched" as const) : ("mismatch" as const),
    severity: mismatches.some((mismatch) => mismatch.severity === "critical")
      ? ("critical" as const)
      : mismatches.length > 0
        ? ("high" as const)
        : ("info" as const),
    mismatches,
    providerSummary: {
      id: provider.id || null,
      status: provider.status || null,
      currency: provider.amount?.currency_code || null,
      amount: provider.amount?.value || null,
      paypalOrderId: provider.supplementary_data?.related_ids?.order_id || null,
      updatedAt: provider.update_time || provider.create_time || null,
      grossAmount: provider.seller_receivable_breakdown?.gross_amount || null,
      fee: provider.seller_receivable_breakdown?.paypal_fee || null,
      netAmount: provider.seller_receivable_breakdown?.net_amount || null,
    },
  };
}
