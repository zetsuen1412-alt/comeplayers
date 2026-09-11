import { NextResponse } from "next/server";
import {
  createAlertFingerprint,
  dispatchOperationalAlert,
} from "@/lib/alerting";
import { requestId } from "@/lib/observability";
import { runTrackedOperation } from "@/lib/operationalRuns";
import { calculateSlo, type UptimeCheckRecord } from "@/lib/slo";
import { createSupabaseAdmin } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

function timeoutMs() {
  const value = Number(process.env.UPTIME_TIMEOUT_MS || 8000);
  return Number.isFinite(value) ? Math.min(30000, Math.max(1000, value)) : 8000;
}

function targetUrls(request: Request) {
  const configured = String(process.env.UPTIME_TARGETS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured.slice(0, 10);
  const origin = new URL(request.url).origin;
  return [`${origin}/api/health/live`, `${origin}/api/health/ready`];
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
  const region = String(
    process.env.UPTIME_REGION || process.env.VERCEL_REGION || "unknown"
  ).slice(0, 80);

  try {
    const result = await runTrackedOperation({
      supabaseAdmin,
      jobName: "monitor_uptime",
      runKey: `cron:monitor-uptime:${region}:${new Date().toISOString().slice(0, 16)}`,
      source: "cron",
      requestId: currentRequestId,
      execute: async () => {
        const checks = [] as Array<{
          target: string;
          region: string;
          status: "up" | "down";
          httpStatus: number | null;
          latencyMs: number;
          error: string | null;
          checkedAt: string;
        }>;

        for (const target of targetUrls(request)) {
          const startedAt = Date.now();
          let status: "up" | "down" = "down";
          let httpStatus: number | null = null;
          let errorMessage: string | null = null;
          try {
            const response = await fetch(target, {
              headers: { "User-Agent": "ComePlayers-Uptime-Monitor/20" },
              signal: AbortSignal.timeout(timeoutMs()),
              cache: "no-store",
            });
            httpStatus = response.status;
            status = response.ok ? "up" : "down";
            if (!response.ok) errorMessage = `HTTP ${response.status}`;
          } catch (error) {
            errorMessage = error instanceof Error ? error.message : "Uptime request failed.";
          }

          const checkedAt = new Date().toISOString();
          const latencyMs = Date.now() - startedAt;
          const { error } = await supabaseAdmin.from("uptime_checks").insert({
            target,
            region,
            status,
            http_status: httpStatus,
            latency_ms: latencyMs,
            error_message: errorMessage,
            checked_at: checkedAt,
            metadata: { request_id: currentRequestId },
          });
          if (error) throw new Error(error.message);

          checks.push({
            target,
            region,
            status,
            httpStatus,
            latencyMs,
            error: errorMessage,
            checkedAt,
          });
        }

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recent, error: recentError } = await supabaseAdmin
          .from("uptime_checks")
          .select("target,region,status,latency_ms,checked_at")
          .gte("checked_at", since)
          .order("checked_at", { ascending: false })
          .limit(5000);
        if (recentError) throw new Error(recentError.message);

        const slo = calculateSlo((recent || []) as UptimeCheckRecord[], {
          availabilityPercent: Number(process.env.SLO_AVAILABILITY_PERCENT || 99.9),
          p95LatencyMs: Number(process.env.SLO_P95_LATENCY_MS || 1500),
        });

        const failed = checks.filter((check) => check.status === "down");
        if (failed.length > 0 || !slo.passing) {
          await dispatchOperationalAlert({
            supabaseAdmin,
            fingerprint: createAlertFingerprint([
              "uptime-slo",
              region,
              new Date().toISOString().slice(0, 13),
            ]),
            source: "uptime_monitor",
            severity: failed.length > 0 ? "critical" : "high",
            title: failed.length > 0 ? "Uptime check failed" : "SLO threshold breached",
            message:
              failed.length > 0
                ? `${failed.length} endpoint check(s) failed from ${region}.`
                : `24-hour availability or latency is outside the configured SLO.`,
            context: { region, failed, slo, requestId: currentRequestId },
          });
        }

        return { checks, slo };
      },
      summarize: (value) => ({
        checked: value.checks.length,
        failed: value.checks.filter((check) => check.status === "down").length,
        availabilityPercent: value.slo.availabilityPercent,
        p95LatencyMs: value.slo.p95LatencyMs,
      }),
    });

    return NextResponse.json(result, {
      headers: { "x-request-id": currentRequestId },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Uptime monitor failed." },
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
