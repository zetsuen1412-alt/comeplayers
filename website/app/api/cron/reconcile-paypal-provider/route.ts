import { NextResponse } from "next/server";
import { requestId } from "@/lib/observability";
import { runTrackedOperation } from "@/lib/operationalRuns";
import { runPayPalProviderReconciliation } from "@/lib/paypalProviderReconciliationServer";
import { createSupabaseAdmin } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(request: Request) {
  const currentRequestId = requestId(request);
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized cron request." },
      { status: 401, headers: { "x-request-id": currentRequestId } }
    );
  }

  const supabaseAdmin = createSupabaseAdmin();
  try {
    const result = await runTrackedOperation({
      supabaseAdmin,
      jobName: "reconcile_paypal_provider",
      runKey: `cron:reconcile-paypal-provider:${new Date().toISOString().slice(0, 13)}`,
      source: "cron",
      requestId: currentRequestId,
      execute: () =>
        runPayPalProviderReconciliation({
          supabaseAdmin,
          limit: Number(process.env.PAYPAL_RECONCILIATION_LIMIT || 25),
          days: Number(process.env.PAYPAL_RECONCILIATION_DAYS || 14),
          requestId: currentRequestId,
          source: "cron",
        }),
      summarize: (value) => ({
        scanned: value.scanned,
        matched: value.matched,
        mismatches: value.mismatches,
        errors: value.errors,
        critical: value.critical,
      }),
    });

    return NextResponse.json(result, {
      headers: { "x-request-id": currentRequestId },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "PayPal provider reconciliation failed.",
      },
      { status: 500, headers: { "x-request-id": currentRequestId } }
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
