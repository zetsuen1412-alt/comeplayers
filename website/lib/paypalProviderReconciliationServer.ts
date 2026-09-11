import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAlertFingerprint,
  dispatchOperationalAlert,
} from "@/lib/alerting";
import { getPayPalCaptureDetails } from "@/lib/paypalProvider";
import {
  comparePayPalProviderCapture,
  type LocalPayPalRecord,
} from "@/lib/paypalProviderReconciliation";

function clampLimit(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(1, Math.floor(parsed))) : 25;
}

function clampDays(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(90, Math.max(1, Math.floor(parsed))) : 14;
}

async function mapConcurrent<T, R>(
  rows: T[],
  concurrency: number,
  worker: (row: T) => Promise<R>
) {
  const results = new Array<R>(rows.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < rows.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(rows[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, () => runWorker())
  );
  return results;
}

type TransactionRow = {
  id: number | string;
  order_id: number | string | null;
  paypal_capture_id: string | null;
  amount_usd: number | string | null;
  status: string | null;
  created_at: string | null;
};

type OrderRow = {
  id: number | string;
  payment_status: string | null;
  status: string | null;
};

export async function runPayPalProviderReconciliation(input: {
  supabaseAdmin: SupabaseClient;
  limit?: number;
  days?: number;
  requestId?: string;
  source: "admin" | "cron";
}) {
  const limit = clampLimit(input.limit);
  const days = clampDays(input.days);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: transactions, error: transactionError } = await input.supabaseAdmin
    .from("paypal_transactions")
    .select("id,order_id,paypal_capture_id,amount_usd,status,created_at")
    .not("paypal_capture_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (transactionError) throw new Error(transactionError.message);

  const typedTransactions = (transactions || []) as TransactionRow[];
  const orderIds = Array.from(
    new Set(
      typedTransactions
        .map((row) => String(row.order_id || "").trim())
        .filter(Boolean)
    )
  );
  const orders = new Map<string, OrderRow>();

  for (let index = 0; index < orderIds.length; index += 200) {
    const chunk = orderIds.slice(index, index + 200);
    const { data, error } = await input.supabaseAdmin
      .from("orders")
      .select("id,payment_status,status")
      .in("id", chunk);
    if (error) throw new Error(error.message);
    for (const row of (data || []) as OrderRow[]) {
      orders.set(String(row.id), row);
    }
  }

  const outcomes = await mapConcurrent(typedTransactions, 4, async (transaction) => {
    const captureId = String(transaction.paypal_capture_id || "").trim();
    const orderId = String(transaction.order_id || "").trim();
    const order = orders.get(orderId);
    const checkedAt = new Date().toISOString();

    if (!captureId || !order) {
      return {
        captureId,
        orderId,
        status: "error" as const,
        severity: "critical" as const,
        error: !captureId
          ? "Local PayPal transaction has no capture ID."
          : "Marketplace order was not found for the PayPal transaction.",
        checkedAt,
      };
    }

    const local: LocalPayPalRecord = {
      transactionId: String(transaction.id),
      marketplaceOrderId: orderId,
      captureId,
      amountUsd: Number(transaction.amount_usd || 0),
      transactionStatus: String(transaction.status || ""),
      orderPaymentStatus: String(order.payment_status || ""),
      orderStatus: String(order.status || ""),
    };

    try {
      const provider = await getPayPalCaptureDetails(captureId);
      const comparison = comparePayPalProviderCapture(local, provider);
      return {
        captureId,
        orderId,
        transactionId: String(transaction.id),
        checkedAt,
        error: null,
        ...comparison,
      };
    } catch (error) {
      return {
        captureId,
        orderId,
        transactionId: String(transaction.id),
        status: "error" as const,
        severity: "high" as const,
        mismatches: [],
        providerSummary: {},
        checkedAt,
        error:
          error instanceof Error ? error.message : "PayPal provider lookup failed.",
      };
    }
  });

  for (const outcome of outcomes) {
    const { error } = await input.supabaseAdmin
      .from("paypal_provider_checks")
      .upsert(
        {
          capture_id: outcome.captureId || `missing:${outcome.transactionId || outcome.orderId}`,
          paypal_transaction_id: outcome.transactionId || null,
          marketplace_order_id: outcome.orderId || null,
          status: outcome.status,
          severity: outcome.severity,
          mismatches: outcome.mismatches || [],
          provider_summary: outcome.providerSummary || {},
          error_message: outcome.error ? String(outcome.error).slice(0, 1000) : null,
          source: input.source,
          request_id: input.requestId || null,
          checked_at: outcome.checkedAt,
          updated_at: outcome.checkedAt,
        },
        { onConflict: "capture_id" }
      );
    if (error) throw new Error(error.message);
  }

  const mismatchCount = outcomes.filter((row) => row.status === "mismatch").length;
  const errorCount = outcomes.filter((row) => row.status === "error").length;
  const criticalCount = outcomes.filter((row) => row.severity === "critical").length;

  if (mismatchCount > 0 || errorCount > 0) {
    await dispatchOperationalAlert({
      supabaseAdmin: input.supabaseAdmin,
      fingerprint: createAlertFingerprint([
        "paypal-provider-reconciliation",
        new Date().toISOString().slice(0, 10),
      ]),
      source: "paypal_provider_reconciliation",
      severity: criticalCount > 0 ? "critical" : "high",
      title: "PayPal provider reconciliation found discrepancies",
      message: `${mismatchCount} mismatch(es) and ${errorCount} provider lookup error(s) were detected.`,
      context: {
        requestId: input.requestId,
        scanned: outcomes.length,
        mismatchCount,
        errorCount,
        criticalCount,
      },
    });
  }

  return {
    scanned: outcomes.length,
    matched: outcomes.filter((row) => row.status === "matched").length,
    mismatches: mismatchCount,
    errors: errorCount,
    critical: criticalCount,
    outcomes,
  };
}
