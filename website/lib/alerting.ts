import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent, sanitizeLogData } from "@/lib/observability";

export type AlertSeverity = "info" | "warning" | "high" | "critical";

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  high: 2,
  critical: 3,
};

function asSeverity(value: unknown, fallback: AlertSeverity): AlertSeverity {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized in SEVERITY_RANK
    ? (normalized as AlertSeverity)
    : fallback;
}

export function severityAtLeast(
  severity: AlertSeverity,
  minimum: AlertSeverity
) {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[minimum];
}

export function createAlertFingerprint(parts: unknown[]) {
  const normalized = parts
    .map((part) => String(part ?? "").trim().toLowerCase())
    .join("|");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 48);
}

function cooldownMinutes() {
  const parsed = Number(process.env.OPS_ALERT_COOLDOWN_MINUTES || 30);
  return Number.isFinite(parsed) ? Math.min(1440, Math.max(1, parsed)) : 30;
}

function timeoutMs() {
  const parsed = Number(process.env.OPS_ALERT_TIMEOUT_MS || 8000);
  return Number.isFinite(parsed) ? Math.min(30000, Math.max(1000, parsed)) : 8000;
}

function destinationName(url: string) {
  try {
    return new URL(url).hostname.slice(0, 200);
  } catch {
    return "configured-webhook";
  }
}

type ExistingAlert = {
  id: string;
  status?: string | null;
  occurrence_count?: number | null;
  cooldown_until?: string | null;
  first_detected_at?: string | null;
  last_attempt_at?: string | null;
  sent_at?: string | null;
};

async function getExistingAlert(
  supabaseAdmin: SupabaseClient,
  fingerprint: string
): Promise<ExistingAlert | null> {
  const { data, error } = await supabaseAdmin
    .from("operational_alerts")
    .select("id,status,occurrence_count,cooldown_until,first_detected_at,last_attempt_at,sent_at")
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data || null) as ExistingAlert | null;
}

async function persistAlert(input: {
  supabaseAdmin: SupabaseClient;
  existing: ExistingAlert | null;
  fingerprint: string;
  source: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  status: "pending" | "sent" | "failed" | "suppressed";
  destination?: string | null;
  context: Record<string, unknown>;
  lastError?: string | null;
  attempted: boolean;
  sent: boolean;
}) {
  const now = new Date();
  const payload = {
    fingerprint: input.fingerprint,
    source: input.source.slice(0, 120),
    severity: input.severity,
    title: input.title.slice(0, 300),
    message: input.message.slice(0, 2000),
    status: input.status,
    destination: input.destination || null,
    context: sanitizeLogData(input.context),
    occurrence_count: (input.existing?.occurrence_count || 0) + 1,
    first_detected_at: input.existing?.first_detected_at || now.toISOString(),
    last_detected_at: now.toISOString(),
    last_attempt_at: input.attempted
      ? now.toISOString()
      : input.existing?.last_attempt_at || null,
    sent_at: input.sent ? now.toISOString() : input.existing?.sent_at || null,
    cooldown_until: input.sent
      ? new Date(now.getTime() + cooldownMinutes() * 60_000).toISOString()
      : input.existing?.cooldown_until || null,
    last_error: input.lastError ? input.lastError.slice(0, 1000) : null,
    updated_at: now.toISOString(),
  };

  if (input.existing?.id) {
    const { error } = await input.supabaseAdmin
      .from("operational_alerts")
      .update(payload)
      .eq("id", input.existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await input.supabaseAdmin
    .from("operational_alerts")
    .insert({ ...payload, created_at: now.toISOString() });
  if (error) throw new Error(error.message);
}

export async function dispatchOperationalAlert(input: {
  supabaseAdmin: SupabaseClient;
  fingerprint: string;
  source: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  force?: boolean;
}) {
  const minimum = asSeverity(process.env.OPS_ALERT_MIN_SEVERITY, "high");
  const webhookUrl = String(process.env.OPS_ALERT_WEBHOOK_URL || "").trim();
  const bearerToken = String(process.env.OPS_ALERT_WEBHOOK_BEARER_TOKEN || "").trim();
  const context = (sanitizeLogData(input.context || {}) || {}) as Record<
    string,
    unknown
  >;

  let existing: ExistingAlert | null = null;
  try {
    existing = await getExistingAlert(input.supabaseAdmin, input.fingerprint);
  } catch (error) {
    logEvent("warn", "operational_alert.persistence_unavailable", {
      fingerprint: input.fingerprint,
      error,
    });
  }

  const cooldownUntil = existing?.cooldown_until
    ? new Date(existing.cooldown_until).getTime()
    : 0;
  const suppressedByCooldown = !input.force && cooldownUntil > Date.now();
  const suppressedBySeverity = !severityAtLeast(input.severity, minimum);

  if (suppressedByCooldown || suppressedBySeverity) {
    try {
      await persistAlert({
        supabaseAdmin: input.supabaseAdmin,
        existing,
        fingerprint: input.fingerprint,
        source: input.source,
        severity: input.severity,
        title: input.title,
        message: input.message,
        status: "suppressed",
        destination: webhookUrl ? destinationName(webhookUrl) : null,
        context: {
          ...context,
          suppressionReason: suppressedByCooldown
            ? "cooldown"
            : "below_minimum_severity",
        },
        attempted: false,
        sent: false,
      });
    } catch (error) {
      logEvent("warn", "operational_alert.suppression_persist_failed", {
        fingerprint: input.fingerprint,
        error,
      });
    }

    return {
      sent: false,
      suppressed: true,
      reason: suppressedByCooldown ? "cooldown" : "below_minimum_severity",
    } as const;
  }

  if (!webhookUrl) {
    try {
      await persistAlert({
        supabaseAdmin: input.supabaseAdmin,
        existing,
        fingerprint: input.fingerprint,
        source: input.source,
        severity: input.severity,
        title: input.title,
        message: input.message,
        status: "pending",
        destination: null,
        context,
        lastError: "OPS_ALERT_WEBHOOK_URL is not configured.",
        attempted: false,
        sent: false,
      });
    } catch (error) {
      logEvent("warn", "operational_alert.pending_persist_failed", {
        fingerprint: input.fingerprint,
        error,
      });
    }

    logEvent("warn", "operational_alert.destination_missing", {
      fingerprint: input.fingerprint,
      severity: input.severity,
      source: input.source,
    });
    return { sent: false, suppressed: false, reason: "destination_missing" } as const;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
      body: JSON.stringify({
        event: "comeplayers.operational_alert",
        service: "comeplayers-web",
        environment:
          process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
        severity: input.severity,
        source: input.source,
        fingerprint: input.fingerprint,
        title: input.title,
        message: input.message,
        context,
        timestamp: new Date().toISOString(),
        text: `[${input.severity.toUpperCase()}] ${input.title}\n${input.message}`,
      }),
      signal: AbortSignal.timeout(timeoutMs()),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Alert webhook returned HTTP ${response.status}.`);
    }

    try {
      await persistAlert({
        supabaseAdmin: input.supabaseAdmin,
        existing,
        fingerprint: input.fingerprint,
        source: input.source,
        severity: input.severity,
        title: input.title,
        message: input.message,
        status: "sent",
        destination: destinationName(webhookUrl),
        context,
        attempted: true,
        sent: true,
      });
    } catch (error) {
      logEvent("warn", "operational_alert.sent_persist_failed", {
        fingerprint: input.fingerprint,
        error,
      });
    }

    logEvent("info", "operational_alert.sent", {
      fingerprint: input.fingerprint,
      severity: input.severity,
      source: input.source,
    });
    return { sent: true, suppressed: false, reason: null } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Alert delivery failed.";

    try {
      await persistAlert({
        supabaseAdmin: input.supabaseAdmin,
        existing,
        fingerprint: input.fingerprint,
        source: input.source,
        severity: input.severity,
        title: input.title,
        message: input.message,
        status: "failed",
        destination: destinationName(webhookUrl),
        context,
        lastError: message,
        attempted: true,
        sent: false,
      });
    } catch (persistenceError) {
      logEvent("warn", "operational_alert.failure_persist_failed", {
        fingerprint: input.fingerprint,
        error: persistenceError,
      });
    }

    logEvent("error", "operational_alert.delivery_failed", {
      fingerprint: input.fingerprint,
      severity: input.severity,
      source: input.source,
      error,
    });
    return { sent: false, suppressed: false, reason: "delivery_failed" } as const;
  }
}
