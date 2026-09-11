import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { compareProviderSettlement, dedupeSettlementChecks } from "@/lib/providerSettlement";

function amountValue(value: unknown) {
  if (value && typeof value === "object" && "value" in value) {
    return Number((value as { value?: unknown }).value || 0);
  }
  return Number(value || 0);
}

export async function generateProviderSettlementReport(input: {
  supabaseAdmin: SupabaseClient;
  periodStart: string;
  periodEnd: string;
  generatedBy?: string | null;
  source: "admin" | "cron";
}) {
  const now = new Date().toISOString();
  const { data: report, error: reportError } = await input.supabaseAdmin
    .from("provider_settlement_reports")
    .insert({
      provider: "paypal",
      period_start: input.periodStart,
      period_end: input.periodEnd,
      status: "processing",
      generated_by: input.generatedBy || null,
      source: input.source,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (reportError || !report) throw new Error(reportError?.message || "Failed to create settlement report.");

  try {
    const { data: checks, error } = await input.supabaseAdmin
      .from("paypal_provider_checks")
      .select("capture_id,paypal_transaction_id,marketplace_order_id,status,provider_summary,checked_at")
      .gte("checked_at", input.periodStart)
      .lt("checked_at", input.periodEnd)
      .order("checked_at", { ascending: true });
    if (error) throw new Error(error.message);

    const uniqueChecks = dedupeSettlementChecks(checks || []);
    const transactionIds = Array.from(new Set(uniqueChecks
      .map((row) => Number(row.paypal_transaction_id || 0))
      .filter((id) => id > 0)));
    const transactions = new Map<number, { amount_usd?: unknown }>();
    for (let index = 0; index < transactionIds.length; index += 200) {
      const chunk = transactionIds.slice(index, index + 200);
      const { data, error: transactionError } = await input.supabaseAdmin
        .from("paypal_transactions")
        .select("id,amount_usd")
        .in("id", chunk);
      if (transactionError) throw new Error(transactionError.message);
      for (const row of data || []) transactions.set(Number(row.id), row);
    }

    const lines = uniqueChecks.map((check) => {
      const summary = (check.provider_summary || {}) as Record<string, unknown>;
      const transaction = transactions.get(Number(check.paypal_transaction_id || 0));
      const comparison = compareProviderSettlement({
        captureId: String(check.capture_id || ""),
        localGross: Number(transaction?.amount_usd || 0),
        providerGross: amountValue(summary.grossAmount),
        providerFee: amountValue(summary.fee),
        providerNet: amountValue(summary.netAmount),
      });
      return {
        report_id: report.id,
        capture_id: comparison.captureId,
        marketplace_order_id: check.marketplace_order_id || null,
        paypal_transaction_id: check.paypal_transaction_id || null,
        status: comparison.status,
        local_gross: comparison.localGross,
        provider_gross: comparison.providerGross,
        provider_fee: comparison.providerFee,
        provider_net: comparison.providerNet,
        gross_delta: comparison.grossDelta,
        mismatches: comparison.mismatches,
        provider_summary: summary,
      };
    });

    for (let index = 0; index < lines.length; index += 500) {
      const { error: lineError } = await input.supabaseAdmin
        .from("provider_settlement_lines")
        .insert(lines.slice(index, index + 500));
      if (lineError) throw new Error(lineError.message);
    }

    const totals = lines.reduce(
      (acc, line) => ({
        localGross: acc.localGross + Number(line.local_gross),
        providerGross: acc.providerGross + Number(line.provider_gross),
        providerFees: acc.providerFees + Number(line.provider_fee),
        providerNet: acc.providerNet + Number(line.provider_net),
        mismatchCount: acc.mismatchCount + (line.status === "mismatch" ? 1 : 0),
      }),
      { localGross: 0, providerGross: 0, providerFees: 0, providerNet: 0, mismatchCount: 0 }
    );
    const status = lines.length === 0
      ? "insufficient_data"
      : totals.mismatchCount === 0
        ? "matched"
        : "mismatch";
    const completedAt = new Date().toISOString();
    const { error: updateError } = await input.supabaseAdmin
      .from("provider_settlement_reports")
      .update({
        status,
        local_gross: totals.localGross,
        provider_gross: totals.providerGross,
        provider_fees: totals.providerFees,
        provider_net: totals.providerNet,
        gross_delta: totals.providerGross - totals.localGross,
        mismatch_count: totals.mismatchCount,
        line_count: lines.length,
        summary: totals,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", report.id);
    if (updateError) throw new Error(updateError.message);

    return { reportId: report.id, status, lineCount: lines.length, ...totals };
  } catch (error) {
    await input.supabaseAdmin
      .from("provider_settlement_reports")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message.slice(0, 1000) : "Settlement report failed.",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", report.id);
    throw error;
  }
}
