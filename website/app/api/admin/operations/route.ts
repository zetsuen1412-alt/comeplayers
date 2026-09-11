import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";
import { logEvent, requestId } from "@/lib/observability";
import { runPayPalProviderReconciliation } from "@/lib/paypalProviderReconciliationServer";
import { calculateSlo, type UptimeCheckRecord } from "@/lib/slo";

function configured(name: string) {
  return Boolean(String(process.env[name] || "").trim());
}

function recent(value: unknown, hours: number) {
  const timestamp = new Date(String(value || "")).getTime();
  return Number.isFinite(timestamp) && timestamp >= Date.now() - hours * 60 * 60 * 1000;
}

function clampPercentage(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(100, Math.max(0, Math.floor(parsed)));
}

export async function GET(request: Request) {
  const currentRequestId = requestId(request);

  try {
    const { supabaseAdmin } = await requireAdmin(request);
    const uptimeSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [
      alertsResult,
      runsResult,
      webhooksResult,
      signoffsResult,
      reconciliationResult,
      criticalResult,
      controlResult,
      providerChecksResult,
      uptimeChecksResult,
      sellerTaxSettingsResult,
      marketplaceFeeSettingsResult,
      pendingRateChangesResult,
      verifiedResidenciesResult,
      activeWithdrawalTaxRatesResult,
      criticalPolicyResult,
      overduePrivacyResult,
      settlementResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("operational_alerts")
        .select("*")
        .order("last_detected_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("operational_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(150),
      supabaseAdmin
        .from("payment_webhook_events")
        .select("id,event_id,event_type,verification_status,processing_status,marketplace_order_id,attempts,result,last_error,received_at,last_processed_at,replayed_at")
        .order("received_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("launch_signoffs")
        .select("*")
        .order("area", { ascending: true }),
      supabaseAdmin
        .from("reconciliation_runs")
        .select("id,status,critical_count,issue_count,completed_at,started_at")
        .eq("status", "completed")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("reconciliation_issues")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .eq("severity", "critical"),
      supabaseAdmin
        .from("runtime_controls")
        .select("key,mode,percentage,message,allowlist,metadata,updated_at,updated_by")
        .eq("key", "checkout")
        .maybeSingle(),
      supabaseAdmin
        .from("paypal_provider_checks")
        .select("id,capture_id,marketplace_order_id,status,severity,mismatches,error_message,checked_at")
        .order("checked_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("uptime_checks")
        .select("id,target,region,status,http_status,latency_ms,error_message,checked_at")
        .gte("checked_at", uptimeSince)
        .order("checked_at", { ascending: false })
        .limit(5000),
      supabaseAdmin
        .from("seller_sales_tax_rates")
        .select("setting_key,rate_percent,status,valid_from,valid_to")
        .eq("setting_key", "global_seller_sales_tax")
        .in("status", ["active", "scheduled"])
        .lte("valid_from", new Date().toISOString())
        .or(`valid_to.is.null,valid_to.gt.${new Date().toISOString()}`)
        .order("valid_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("marketplace_fee_settings")
        .select("setting_key,rate_percent,status,valid_from,valid_to")
        .eq("setting_key", "global_marketplace_fee")
        .in("status", ["active", "scheduled"])
        .lte("valid_from", new Date().toISOString())
        .or(`valid_to.is.null,valid_to.gt.${new Date().toISOString()}`)
        .order("valid_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("rate_change_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "partially_approved"]),
      supabaseAdmin
        .from("seller_tax_residencies")
        .select("seller_id", { count: "exact", head: true })
        .eq("status", "verified"),
      supabaseAdmin
        .from("withdrawal_tax_rates")
        .select("id", { count: "exact", head: true })
        .in("status", ["active", "scheduled"])
        .lte("valid_from", new Date().toISOString())
        .or(`valid_to.is.null,valid_to.gt.${new Date().toISOString()}`),
      supabaseAdmin
        .from("product_policy_reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .in("severity", ["high", "critical"]),
      supabaseAdmin
        .from("privacy_requests")
        .select("id,status,scheduled_for")
        .eq("request_type", "delete")
        .in("status", ["pending", "processing", "failed"])
        .limit(1000),
      supabaseAdmin
        .from("provider_settlement_reports")
        .select("id,status,mismatch_count,period_end,completed_at")
        .order("period_end", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const firstError = [
      alertsResult.error,
      runsResult.error,
      webhooksResult.error,
      signoffsResult.error,
      reconciliationResult.error,
      criticalResult.error,
      controlResult.error,
      providerChecksResult.error,
      uptimeChecksResult.error,
      sellerTaxSettingsResult.error,
      marketplaceFeeSettingsResult.error,
      pendingRateChangesResult.error,
      verifiedResidenciesResult.error,
      activeWithdrawalTaxRatesResult.error,
      criticalPolicyResult.error,
      overduePrivacyResult.error,
      settlementResult.error,
    ].find(Boolean);
    if (firstError) throw new Error(firstError.message);

    const alerts = alertsResult.data || [];
    const runs = runsResult.data || [];
    const webhooks = webhooksResult.data || [];
    const signoffs = signoffsResult.data || [];
    const latestReconciliation = reconciliationResult.data || null;
    const runtimeControl = controlResult.data || null;
    const providerChecks = providerChecksResult.data || [];
    const uptimeChecks = uptimeChecksResult.data || [];
    const latestSettlement = settlementResult.data || null;
    const sellerTaxSettings = sellerTaxSettingsResult.data || null;
    const marketplaceFeeSettings = marketplaceFeeSettingsResult.data || null;
    const pendingRateChangeCount = Number(pendingRateChangesResult.count || 0);
    const verifiedTaxResidencyCount = Number(verifiedResidenciesResult.count || 0);
    const activeWithdrawalTaxRateCount = Number(activeWithdrawalTaxRatesResult.count || 0);
    const pendingCriticalPolicyReviews = Number(criticalPolicyResult.count || 0);
    const overduePrivacyRequests = (overduePrivacyResult.data || []).filter((row) => {
      if (row.status === "failed") return true;
      const scheduled = new Date(String(row.scheduled_for || "")).getTime();
      return Number.isFinite(scheduled) && scheduled <= Date.now();
    }).length;
    const failedWebhooks24h = webhooks.filter(
      (row) => row.processing_status === "failed" && recent(row.received_at, 24)
    ).length;
    const failedRuns24h = runs.filter(
      (row) => row.status === "failed" && recent(row.started_at, 24)
    ).length;
    const openCriticalAlerts = alerts.filter(
      (row) =>
        row.severity === "critical" &&
        !["acknowledged", "suppressed"].includes(String(row.status))
    ).length;
    const pendingSignoffs = signoffs.filter((row) => row.status !== "passed").length;
    const providerFailures36h = providerChecks.filter(
      (row) => row.status !== "matched" && recent(row.checked_at, 36)
    ).length;
    const latestProviderRun = runs.find(
      (row) => row.job_name === "reconcile_paypal_provider" && row.status === "completed"
    );
    const slo = calculateSlo(uptimeChecks as UptimeCheckRecord[], {
      availabilityPercent: Number(process.env.SLO_AVAILABILITY_PERCENT || 99.9),
      p95LatencyMs: Number(process.env.SLO_P95_LATENCY_MS || 1500),
    });
    const canarySignoffPassed = signoffs.some(
      (row) => row.area === "canary_launch" && row.status === "passed"
    );
    const checkoutMode = String(runtimeControl?.mode || "enabled");
    const checkoutPercentage = Number(runtimeControl?.percentage ?? 100);
    const livePayments = String(process.env.PAYPAL_ENV || "sandbox").toLowerCase() === "live";

    const checks = [
      {
        key: "supabase_configuration",
        label: "Supabase server configuration",
        passed:
          configured("NEXT_PUBLIC_SUPABASE_URL") &&
          configured("NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
          configured("SUPABASE_SERVICE_ROLE_KEY"),
        blocking: true,
      },
      {
        key: "payment_configuration",
        label: "PayPal credentials and webhook ID",
        passed:
          configured("PAYPAL_CLIENT_ID") &&
          configured("PAYPAL_CLIENT_SECRET") &&
          configured("PAYPAL_WEBHOOK_ID"),
        blocking: true,
      },
      {
        key: "security_secrets",
        label: "Encryption, cron, and security secrets",
        passed:
          configured("CRON_SECRET") &&
          configured("DELIVERY_ENCRYPTION_KEY") &&
          configured("PAYOUT_ENCRYPTION_KEY") &&
          configured("WITHDRAWAL_PIN_PEPPER") &&
          configured("SECURITY_HASH_SECRET"),
        blocking: true,
      },
      {
        key: "alert_destination",
        label: "Operational alert destination",
        passed: configured("OPS_ALERT_WEBHOOK_URL"),
        blocking: true,
      },
      {
        key: "recent_reconciliation",
        label: "Successful financial reconciliation within 36 hours",
        passed: recent(latestReconciliation?.completed_at, 36),
        blocking: true,
      },
      {
        key: "critical_reconciliation",
        label: "No open critical reconciliation findings",
        passed: Number(criticalResult.count || 0) === 0,
        blocking: true,
      },
      {
        key: "provider_reconciliation",
        label: "Recent PayPal provider reconciliation has no discrepancy",
        passed: recent(latestProviderRun?.completed_at, 36) && providerFailures36h === 0,
        blocking: true,
      },
      {
        key: "slo_health",
        label: "24-hour uptime and p95 latency meet the configured SLO",
        passed: slo.passing,
        blocking: true,
      },
      {
        key: "finance_rate_configuration",
        label: "Marketplace fee and seller sales-tax histories have active governed rates",
        passed:
          String(sellerTaxSettings?.status || "").toLowerCase() === "active" &&
          Number(sellerTaxSettings?.rate_percent || 0) >= 0 &&
          String(marketplaceFeeSettings?.status || "").toLowerCase() === "active" &&
          Number(marketplaceFeeSettings?.rate_percent || 0) >= 0,
        blocking: true,
      },
      {
        key: "rate_change_governance",
        label: "No unfinished finance rate change awaits dual approval",
        passed: pendingRateChangeCount === 0,
        blocking: true,
      },
      {
        key: "verified_tax_residency",
        label: "At least one seller tax residency has been verified before provider payout",
        passed: verifiedTaxResidencyCount > 0,
        blocking: true,
      },
      {
        key: "withdrawal_tax_configuration",
        label: "At least one active country + payout-method + currency withdrawal tax rule exists",
        passed: activeWithdrawalTaxRateCount > 0,
        blocking: true,
      },
      {
        key: "product_policy_queue",
        label: "No pending high or critical product-policy review",
        passed: pendingCriticalPolicyReviews === 0,
        blocking: true,
      },
      {
        key: "privacy_deletion_sla",
        label: "No overdue privacy deletion request",
        passed: overduePrivacyRequests === 0,
        blocking: true,
      },
      {
        key: "provider_settlement",
        label: "Latest provider settlement is matched and completed within 36 hours",
        passed:
          latestSettlement?.status === "matched" &&
          Number(latestSettlement?.mismatch_count || 0) === 0 &&
          recent(latestSettlement?.completed_at, 36),
        blocking: true,
      },
      {
        key: "webhook_health",
        label: "No failed PayPal webhook in the last 24 hours",
        passed: failedWebhooks24h === 0,
        blocking: true,
      },
      {
        key: "cron_health",
        label: "No failed tracked operation in the last 24 hours",
        passed: failedRuns24h === 0,
        blocking: true,
      },
      {
        key: "critical_alerts",
        label: "No unacknowledged critical operational alert",
        passed: openCriticalAlerts === 0,
        blocking: true,
      },
      {
        key: "controlled_checkout",
        label: "Live checkout uses a controlled canary or has final canary approval",
        passed:
          !livePayments ||
          checkoutMode === "disabled" ||
          (checkoutMode === "canary" && checkoutPercentage <= 50) ||
          canarySignoffPassed,
        blocking: true,
      },
      {
        key: "manual_signoffs",
        label: "All launch sign-offs are passed",
        passed: pendingSignoffs === 0 && signoffs.length > 0,
        blocking: true,
      },
      {
        key: "sandbox_guard",
        label: "PayPal remains in Sandbox before final approval",
        passed: !livePayments || pendingSignoffs === 0,
        blocking: true,
      },
    ];

    return NextResponse.json(
      {
        alerts,
        runs,
        webhooks,
        signoffs,
        runtimeControl,
        providerChecks,
        uptimeChecks: uptimeChecks.slice(0, 100),
        slo,
        checks,
        ready: checks.every((check) => !check.blocking || check.passed),
        metrics: {
          failedWebhooks24h,
          failedRuns24h,
          openCriticalAlerts,
          openCriticalReconciliationIssues: Number(criticalResult.count || 0),
          pendingSignoffs,
          providerFailures36h,
          sellerSalesTaxRatePercent: Number(sellerTaxSettings?.rate_percent || 0),
          marketplaceFeeRatePercent: Number(marketplaceFeeSettings?.rate_percent || 0),
          pendingRateChangeCount,
          verifiedTaxResidencyCount,
          activeWithdrawalTaxRateCount,
          pendingCriticalPolicyReviews,
          overduePrivacyRequests,
          latestSettlementStatus: latestSettlement?.status || "missing",
          uptimeFailures24h: slo.failedChecks,
        },
      },
      { headers: { "x-request-id": currentRequestId } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected operations dashboard error.";
    logEvent("error", "admin.operations.read_failed", {
      requestId: currentRequestId,
      error,
    });
    return NextResponse.json(
      { error: message, requestId: currentRequestId },
      {
        status: adminErrorStatus(error),
        headers: { "x-request-id": currentRequestId },
      }
    );
  }
}

export async function POST(request: Request) {
  const currentRequestId = requestId(request);
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "reconcile_paypal_provider") {
      return NextResponse.json({ error: "Unsupported operations action." }, { status: 400 });
    }

    const result = await runPayPalProviderReconciliation({
      supabaseAdmin,
      limit: Number(process.env.PAYPAL_RECONCILIATION_LIMIT || 25),
      days: Number(process.env.PAYPAL_RECONCILIATION_DAYS || 14),
      requestId: currentRequestId,
      source: "admin",
    });

    await recordAdminAudit({
      adminId: user.id,
      action: "operations.paypal_provider_reconciliation_run",
      entityType: "paypal_provider_reconciliation",
      afterData: {
        scanned: result.scanned,
        matched: result.matched,
        mismatches: result.mismatches,
        errors: result.errors,
      },
    });

    return NextResponse.json({ result }, { headers: { "x-request-id": currentRequestId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operations action failed.";
    return NextResponse.json(
      { error: message, requestId: currentRequestId },
      { status: adminErrorStatus(error), headers: { "x-request-id": currentRequestId } }
    );
  }
}

export async function PATCH(request: Request) {
  const currentRequestId = requestId(request);

  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as {
      kind?: "alert" | "signoff" | "checkout_control";
      id?: string;
      area?: string;
      status?: "pending" | "passed" | "blocked";
      note?: string;
      mode?: "enabled" | "disabled" | "canary";
      percentage?: number;
      message?: string;
      allowlist?: string[];
    };

    if (body.kind === "alert") {
      const id = String(body.id || "").trim();
      if (!id) {
        return NextResponse.json({ error: "Alert ID is required." }, { status: 400 });
      }
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("operational_alerts")
        .select("context")
        .eq("id", id)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);
      if (!existing) {
        return NextResponse.json({ error: "Operational alert not found." }, { status: 404 });
      }

      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("operational_alerts")
        .update({
          status: "acknowledged",
          updated_at: now,
          context: {
            ...((existing.context || {}) as Record<string, unknown>),
            acknowledged_by: user.id,
            acknowledged_at: now,
          },
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      await recordAdminAudit({
        adminId: user.id,
        action: "operations.alert_acknowledged",
        entityType: "operational_alert",
        entityId: id,
        afterData: data,
      });
      return NextResponse.json({ alert: data });
    }

    if (body.kind === "signoff") {
      const area = String(body.area || "").trim().slice(0, 120);
      const status = String(body.status || "").trim();
      const note = String(body.note || "").trim().slice(0, 2000);
      if (!area || !["pending", "passed", "blocked"].includes(status)) {
        return NextResponse.json({ error: "Invalid launch sign-off update." }, { status: 400 });
      }
      if (status !== "pending" && !note) {
        return NextResponse.json({ error: "A sign-off note is required." }, { status: 400 });
      }

      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("launch_signoffs")
        .upsert(
          {
            area,
            status,
            note: note || null,
            signed_by: status === "pending" ? null : user.id,
            signed_at: status === "pending" ? null : now,
            updated_at: now,
          },
          { onConflict: "area" }
        )
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      await recordAdminAudit({
        adminId: user.id,
        action: "operations.launch_signoff_updated",
        entityType: "launch_signoff",
        entityId: area,
        afterData: data,
      });
      return NextResponse.json({ signoff: data });
    }

    if (body.kind === "checkout_control") {
      const mode = String(body.mode || "").trim().toLowerCase();
      const percentage = clampPercentage(body.percentage);
      const message = String(body.message || "").trim().slice(0, 500);
      const allowlist = Array.from(
        new Set((Array.isArray(body.allowlist) ? body.allowlist : []).map(String).map((value) => value.trim()).filter(Boolean))
      ).slice(0, 100);

      if (!["enabled", "disabled", "canary"].includes(mode)) {
        return NextResponse.json({ error: "Invalid checkout mode." }, { status: 400 });
      }
      if (mode === "canary" && (percentage < 1 || percentage > 100)) {
        return NextResponse.json(
          { error: "Canary percentage must be between 1 and 100." },
          { status: 400 }
        );
      }
      if (mode === "disabled" && !message) {
        return NextResponse.json(
          { error: "A customer-facing maintenance message is required." },
          { status: 400 }
        );
      }

      const { data: before } = await supabaseAdmin
        .from("runtime_controls")
        .select("*")
        .eq("key", "checkout")
        .maybeSingle();
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("runtime_controls")
        .upsert(
          {
            key: "checkout",
            mode,
            percentage: mode === "enabled" ? 100 : mode === "disabled" ? 0 : percentage,
            message: message || "Checkout is temporarily unavailable.",
            allowlist,
            metadata: { changed_from_admin_operations: true },
            updated_by: user.id,
            updated_at: now,
          },
          { onConflict: "key" }
        )
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      await recordAdminAudit({
        adminId: user.id,
        action: "operations.checkout_control_updated",
        entityType: "runtime_control",
        entityId: "checkout",
        beforeData: before,
        afterData: data,
      });
      return NextResponse.json({ runtimeControl: data });
    }

    return NextResponse.json({ error: "Unsupported operations action." }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected operations update error.";
    return NextResponse.json(
      { error: message, requestId: currentRequestId },
      {
        status: adminErrorStatus(error),
        headers: { "x-request-id": currentRequestId },
      }
    );
  }
}
