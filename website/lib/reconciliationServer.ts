import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analyzeFinancialRecords,
  type FinancialOrderRecord,
  type PayPalTransactionRecord,
  type WalletTransactionRecord,
  type WithdrawalRecord,
} from "@/lib/reconciliation";
import { logEvent, observeOperation } from "@/lib/observability";
import {
  createAlertFingerprint,
  dispatchOperationalAlert,
} from "@/lib/alerting";

const MAX_SCAN_ROWS = 5000;

function clampDays(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(90, Math.max(1, Math.floor(parsed)));
}

function cleanRequestKey(value: string) {
  const key = value.trim().slice(0, 160);
  if (!key) throw new Error("A reconciliation request key is required.");
  return key;
}


function deduplicateById<T extends { id: number | string }>(rows: T[]) {
  return Array.from(new Map(rows.map((row) => [String(row.id), row])).values());
}

async function fetchOrdersByIds(
  supabaseAdmin: SupabaseClient,
  orderIds: Array<number | string>
) {
  const rows: FinancialOrderRecord[] = [];
  const uniqueIds = Array.from(new Set(orderIds.map(String))).filter(Boolean);

  for (let index = 0; index < uniqueIds.length; index += 200) {
    const chunk = uniqueIds.slice(index, index + 200);
    if (chunk.length === 0) continue;
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id,buyer_id,seller_id,payment_method,payment_status,status,escrow_status,seller_payout_status,total_amount,total_price,paypal_amount_usd,paypal_capture_id,seller_gross_amount,marketplace_fee_amount,seller_sales_tax_rate_percent,seller_sales_tax_amount,seller_earning_amount,paid_at,completed_at,updated_at"
      )
      .in("id", chunk);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as FinancialOrderRecord[]));
  }

  return rows;
}

async function fetchPayPalByOrderIds(
  supabaseAdmin: SupabaseClient,
  orderIds: Array<number | string>
) {
  const rows: PayPalTransactionRecord[] = [];

  for (let index = 0; index < orderIds.length; index += 200) {
    const chunk = orderIds.slice(index, index + 200);
    if (chunk.length === 0) continue;
    const { data, error } = await supabaseAdmin
      .from("paypal_transactions")
      .select("id,order_id,paypal_capture_id,amount_usd,status,created_at")
      .in("order_id", chunk);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as PayPalTransactionRecord[]));
  }

  return rows;
}

async function fetchWalletByOrderIds(
  supabaseAdmin: SupabaseClient,
  orderIds: Array<number | string>
) {
  const rows: WalletTransactionRecord[] = [];

  for (let index = 0; index < orderIds.length; index += 200) {
    const chunk = orderIds.slice(index, index + 200);
    if (chunk.length === 0) continue;
    const { data, error } = await supabaseAdmin
      .from("wallet_transactions")
      .select(
        "id,order_id,type,transaction_type,amount,balance_before,balance_after,status,metadata,created_at"
      )
      .in("order_id", chunk);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as WalletTransactionRecord[]));
  }

  return rows;
}

async function fetchWalletByWithdrawalIds(
  supabaseAdmin: SupabaseClient,
  withdrawalIds: Array<number | string>
) {
  const rows: WalletTransactionRecord[] = [];

  for (let index = 0; index < withdrawalIds.length; index += 150) {
    const chunk = withdrawalIds.slice(index, index + 150).map(String);
    if (chunk.length === 0) continue;
    const { data, error } = await supabaseAdmin
      .from("wallet_transactions")
      .select(
        "id,order_id,type,transaction_type,amount,balance_before,balance_after,status,metadata,created_at"
      )
      .in("metadata->>withdrawal_id", chunk);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as WalletTransactionRecord[]));
  }

  return rows;
}

async function resolveStaleIssues(input: {
  supabaseAdmin: SupabaseClient;
  staleIds: number[];
  runId: string;
  resolvedAt: string;
}) {
  for (let index = 0; index < input.staleIds.length; index += 250) {
    const ids = input.staleIds.slice(index, index + 250);
    const { error } = await input.supabaseAdmin
      .from("reconciliation_issues")
      .update({
        status: "resolved",
        resolved_at: input.resolvedAt,
        resolution_note: "Automatically resolved by a clean reconciliation scan.",
        last_run_id: input.runId,
        updated_at: input.resolvedAt,
      })
      .in("id", ids);

    if (error) throw new Error(error.message);
  }
}

export async function runFinancialReconciliation(input: {
  supabaseAdmin: SupabaseClient;
  days?: number;
  initiatedBy?: string | null;
  requestKey: string;
  source: "admin" | "cron";
  requestId?: string;
}) {
  const days = clampDays(input.days);
  const scopeKey = `financial:${days}d`;
  const requestKey = cleanRequestKey(input.requestKey);
  const now = new Date();
  const startedAt = now.toISOString();
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();

  const { data: existingRun, error: existingError } = await input.supabaseAdmin
    .from("reconciliation_runs")
    .select("*")
    .eq("request_key", requestKey)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existingRun) {
    return { run: existingRun, idempotent: true };
  }

  const { data: activeRun, error: activeError } = await input.supabaseAdmin
    .from("reconciliation_runs")
    .select("id,started_at")
    .eq("scope_key", scopeKey)
    .eq("status", "running")
    .gte("started_at", new Date(now.getTime() - 15 * 60_000).toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError) throw new Error(activeError.message);
  if (activeRun) {
    const conflict = new Error("A reconciliation scan is already running for this scope.");
    Object.assign(conflict, { status: 409, runId: activeRun.id });
    throw conflict;
  }

  const { data: run, error: runError } = await input.supabaseAdmin
    .from("reconciliation_runs")
    .insert({
      scope_key: scopeKey,
      source: input.source,
      status: "running",
      request_key: requestKey,
      initiated_by: input.initiatedBy || null,
      window_started_at: since,
      window_ended_at: startedAt,
      started_at: startedAt,
      summary: {},
    })
    .select("*")
    .single();

  if (runError || !run) {
    throw new Error(runError?.message || "Failed to create reconciliation run.");
  }

  return observeOperation({
    event: "financial_reconciliation.scan",
    requestId: input.requestId,
    context: { runId: run.id, scopeKey, source: input.source },
    run: async () => {
      try {
        const [ordersResult, paypalResult, walletResult, withdrawalsResult] =
          await Promise.all([
            input.supabaseAdmin
              .from("orders")
              .select(
                "id,buyer_id,seller_id,payment_method,payment_status,status,escrow_status,seller_payout_status,total_amount,total_price,paypal_amount_usd,paypal_capture_id,seller_gross_amount,marketplace_fee_amount,seller_sales_tax_rate_percent,seller_sales_tax_amount,seller_earning_amount,paid_at,completed_at,updated_at"
              )
              .gte("updated_at", since)
              .order("updated_at", { ascending: false })
              .limit(MAX_SCAN_ROWS),
            input.supabaseAdmin
              .from("paypal_transactions")
              .select(
                "id,order_id,paypal_capture_id,amount_usd,status,created_at"
              )
              .gte("created_at", since)
              .order("created_at", { ascending: false })
              .limit(MAX_SCAN_ROWS),
            input.supabaseAdmin
              .from("wallet_transactions")
              .select(
                "id,order_id,type,transaction_type,amount,balance_before,balance_after,status,metadata,created_at"
              )
              .gte("created_at", since)
              .order("created_at", { ascending: false })
              .limit(MAX_SCAN_ROWS),
            input.supabaseAdmin
              .from("withdrawal_requests")
              .select(
                "id,amount,fee_amount,tax_amount,net_amount,tax_country_code,tax_payout_method,tax_rule_id,status,payout_reference,provider_status,updated_at"
              )
              .gte("updated_at", since)
              .order("updated_at", { ascending: false })
              .limit(MAX_SCAN_ROWS),
          ]);

        for (const result of [
          ordersResult,
          paypalResult,
          walletResult,
          withdrawalsResult,
        ]) {
          if (result.error) throw new Error(result.error.message);
        }

        const recentPayPal = (paypalResult.data || []) as PayPalTransactionRecord[];
        const recentWallet = (walletResult.data || []) as WalletTransactionRecord[];
        const referencedOrderIds = [
          ...recentPayPal.map((row) => row.order_id),
          ...recentWallet.map((row) => row.order_id),
        ].filter(
          (value): value is number | string =>
            value !== null && value !== undefined && String(value).trim() !== ""
        );
        const linkedOrders = await fetchOrdersByIds(
          input.supabaseAdmin,
          referencedOrderIds
        );
        const orders = deduplicateById([
          ...((ordersResult.data || []) as FinancialOrderRecord[]),
          ...linkedOrders,
        ]);
        const withdrawals = (withdrawalsResult.data || []) as WithdrawalRecord[];
        const orderIds = orders.map((row) => row.id);
        const withdrawalIds = withdrawals.map((row) => row.id);
        const [linkedPayPal, linkedOrderWallet, linkedWithdrawalWallet] =
          await Promise.all([
            fetchPayPalByOrderIds(input.supabaseAdmin, orderIds),
            fetchWalletByOrderIds(input.supabaseAdmin, orderIds),
            fetchWalletByWithdrawalIds(input.supabaseAdmin, withdrawalIds),
          ]);

        const paypalTransactions = deduplicateById([
          ...recentPayPal,
          ...linkedPayPal,
        ]);
        const walletTransactions = deduplicateById([
          ...recentWallet,
          ...linkedOrderWallet,
          ...linkedWithdrawalWallet,
        ]);
        const truncatedSources = [
          orders.length >= MAX_SCAN_ROWS ? "orders" : "",
          (paypalResult.data || []).length >= MAX_SCAN_ROWS
            ? "paypal_transactions"
            : "",
          (walletResult.data || []).length >= MAX_SCAN_ROWS
            ? "wallet_transactions"
            : "",
          withdrawals.length >= MAX_SCAN_ROWS ? "withdrawal_requests" : "",
        ].filter(Boolean);

        const analysis = analyzeFinancialRecords({
          orders,
          paypalTransactions,
          walletTransactions,
          withdrawals,
        });
        const runSummary = {
          ...analysis.summary,
          truncatedSources,
        };

        const { data: existingIssues, error: issueLookupError } =
          await input.supabaseAdmin
            .from("reconciliation_issues")
            .select(
              "id,issue_key,status,occurrence_count,first_detected_at,resolved_at,resolved_by,resolution_note"
            )
            .eq("scope_key", scopeKey)
            .limit(10_000);

        if (issueLookupError) throw new Error(issueLookupError.message);

        const existingByKey = new Map(
          (existingIssues || []).map((row) => [String(row.issue_key), row])
        );
        const detectedKeys = new Set(analysis.issues.map((item) => item.issueKey));
        const issueRows = analysis.issues.map((item) => {
          const existing = existingByKey.get(item.issueKey);
          const ignored = String(existing?.status || "") === "ignored";

          return {
            scope_key: scopeKey,
            issue_key: item.issueKey,
            issue_type: item.issueType,
            severity: item.severity,
            entity_type: item.entityType,
            entity_id: item.entityId,
            title: item.title,
            description: item.description,
            expected: item.expected,
            actual: item.actual,
            status: ignored ? "ignored" : "open",
            first_detected_at: existing?.first_detected_at || startedAt,
            last_detected_at: startedAt,
            last_run_id: run.id,
            occurrence_count: Number(existing?.occurrence_count || 0) + 1,
            resolved_at: ignored ? existing?.resolved_at || startedAt : null,
            resolved_by: ignored ? existing?.resolved_by || null : null,
            resolution_note: ignored
              ? existing?.resolution_note || "Ignored by an administrator."
              : null,
            updated_at: startedAt,
          };
        });

        if (issueRows.length > 0) {
          const { error: upsertError } = await input.supabaseAdmin
            .from("reconciliation_issues")
            .upsert(issueRows, { onConflict: "scope_key,issue_key" });

          if (upsertError) throw new Error(upsertError.message);
        }

        const staleIds = (existingIssues || [])
          .filter(
            (row) =>
              truncatedSources.length === 0 &&
              String(row.status || "") === "open" &&
              !detectedKeys.has(String(row.issue_key))
          )
          .map((row) => Number(row.id))
          .filter((value) => Number.isInteger(value) && value > 0);

        await resolveStaleIssues({
          supabaseAdmin: input.supabaseAdmin,
          staleIds,
          runId: String(run.id),
          resolvedAt: startedAt,
        });

        const completedAt = new Date().toISOString();
        const { data: completedRun, error: completionError } =
          await input.supabaseAdmin
            .from("reconciliation_runs")
            .update({
              status: "completed",
              completed_at: completedAt,
              scanned_count:
                runSummary.scannedOrders +
                runSummary.scannedPayPalTransactions +
                runSummary.scannedWalletTransactions +
                runSummary.scannedWithdrawals,
              issue_count: runSummary.issueCount,
              critical_count: runSummary.criticalCount,
              summary: runSummary,
              updated_at: completedAt,
            })
            .eq("id", run.id)
            .select("*")
            .single();

        if (completionError || !completedRun) {
          throw new Error(
            completionError?.message || "Failed to complete reconciliation run."
          );
        }

        logEvent(
          runSummary.criticalCount > 0 || truncatedSources.length > 0
            ? "warn"
            : "info",
          "financial_reconciliation.result",
          {
            requestId: input.requestId,
            runId: run.id,
            scopeKey,
            summary: runSummary,
            automaticallyResolved: staleIds.length,
          }
        );

        if (runSummary.criticalCount > 0 || runSummary.highCount > 0) {
          await dispatchOperationalAlert({
            supabaseAdmin: input.supabaseAdmin,
            fingerprint: createAlertFingerprint([
              "financial-reconciliation-findings",
              scopeKey,
              new Date().toISOString().slice(0, 10),
            ]),
            source: "financial_reconciliation",
            severity: runSummary.criticalCount > 0 ? "critical" : "high",
            title: "Financial reconciliation found urgent mismatches",
            message: `${runSummary.criticalCount} critical and ${runSummary.highCount} high-severity finding(s) require review.`,
            context: {
              requestId: input.requestId,
              runId: run.id,
              scopeKey,
              summary: runSummary,
              truncatedSources,
            },
          });
        }

        return {
          run: completedRun,
          issues: analysis.issues,
          automaticallyResolved: staleIds.length,
          idempotent: false,
        };
      } catch (error) {
        const failedAt = new Date().toISOString();
        await input.supabaseAdmin
          .from("reconciliation_runs")
          .update({
            status: "failed",
            completed_at: failedAt,
            error_message:
              error instanceof Error ? error.message.slice(0, 1000) : "Unknown error",
            updated_at: failedAt,
          })
          .eq("id", run.id);

        await dispatchOperationalAlert({
          supabaseAdmin: input.supabaseAdmin,
          fingerprint: createAlertFingerprint([
            "financial-reconciliation-failed",
            scopeKey,
            new Date().toISOString().slice(0, 10),
          ]),
          source: "financial_reconciliation",
          severity: "critical",
          title: "Financial reconciliation failed",
          message: error instanceof Error ? error.message : "Unexpected reconciliation failure.",
          context: {
            requestId: input.requestId,
            runId: run.id,
            scopeKey,
          },
        });
        throw error;
      }
    },
  });
}
