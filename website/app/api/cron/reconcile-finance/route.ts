import { NextResponse } from "next/server";
import { logEvent, requestId } from "@/lib/observability";
import { runTrackedOperation } from "@/lib/operationalRuns";
import { runFinancialReconciliation } from "@/lib/reconciliationServer";
import { createSupabaseAdmin } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  const currentRequestId = requestId(request);

  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized cron request." },
      { status: 401, headers: { "x-request-id": currentRequestId } }
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  const supabaseAdmin = createSupabaseAdmin();

  try {
    const result = await runTrackedOperation({
      supabaseAdmin,
      jobName: "reconcile_finance",
      runKey: `cron:reconcile-finance:${date}`,
      source: "cron",
      requestId: currentRequestId,
      execute: () =>
        runFinancialReconciliation({
          supabaseAdmin,
          days: 30,
          requestKey: `cron:financial-reconciliation:${date}`,
          source: "cron",
          requestId: currentRequestId,
        }),
      summarize: (value) => ({
        reconciliationRunId: value.run.id,
        issueCount: value.run.issue_count,
        criticalCount: value.run.critical_count,
        idempotent: value.idempotent,
      }),
    });

    return NextResponse.json(result, {
      headers: { "x-request-id": currentRequestId },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected reconciliation cron error.";
    logEvent("error", "financial_reconciliation.cron_failed", {
      requestId: currentRequestId,
      error,
    });
    return NextResponse.json(
      { error: message, requestId: currentRequestId },
      { status: 500, headers: { "x-request-id": currentRequestId } }
    );
  }
}
