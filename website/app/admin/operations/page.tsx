"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaBell,
  FaCheckCircle,
  FaRedo,
  FaRocket,
  FaServer,
} from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type ReadinessCheck = {
  key: string;
  label: string;
  passed: boolean;
  blocking: boolean;
};

type OperationalAlert = {
  id: string;
  severity: string;
  title: string;
  message: string;
  source: string;
  status: string;
  occurrence_count: number;
  last_detected_at: string;
  last_error?: string | null;
};

type OperationalRun = {
  id: string;
  job_name: string;
  status: string;
  duration_ms?: number | null;
  summary?: Record<string, unknown> | null;
  error_message?: string | null;
  started_at: string;
};

type WebhookEvent = {
  id: number;
  event_id: string;
  event_type: string;
  processing_status: string;
  marketplace_order_id?: number | null;
  attempts: number;
  last_error?: string | null;
  received_at: string;
  replayed_at?: string | null;
};

type Signoff = {
  id: number;
  area: string;
  status: "pending" | "passed" | "blocked";
  note?: string | null;
  signed_at?: string | null;
};

type RuntimeControl = {
  key: string;
  mode: "enabled" | "disabled" | "canary";
  percentage: number;
  message?: string | null;
  allowlist?: string[] | null;
  updated_at?: string | null;
};

type ProviderCheck = {
  id: number;
  capture_id: string;
  marketplace_order_id?: number | null;
  status: string;
  severity: string;
  mismatches?: Array<{ field?: string; expected?: unknown; actual?: unknown }>;
  error_message?: string | null;
  checked_at: string;
};

type UptimeCheck = {
  id: number;
  target: string;
  region: string;
  status: string;
  http_status?: number | null;
  latency_ms: number;
  error_message?: string | null;
  checked_at: string;
};

type SloSummary = {
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  availabilityPercent: number;
  p95LatencyMs: number;
  regionCount: number;
  targetCount: number;
  availabilityPassing: boolean;
  latencyPassing: boolean;
  passing: boolean;
};

type Payload = {
  alerts: OperationalAlert[];
  runs: OperationalRun[];
  webhooks: WebhookEvent[];
  signoffs: Signoff[];
  runtimeControl: RuntimeControl | null;
  providerChecks: ProviderCheck[];
  uptimeChecks: UptimeCheck[];
  slo: SloSummary;
  checks: ReadinessCheck[];
  ready: boolean;
  metrics: {
    failedWebhooks24h: number;
    failedRuns24h: number;
    openCriticalAlerts: number;
    openCriticalReconciliationIssues: number;
    pendingSignoffs: number;
    providerFailures36h: number;
    uptimeFailures24h: number;
  };
};

function pretty(value: string) {
  return String(value || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(value: string) {
  if (["critical", "failed", "blocked"].includes(value)) {
    return "border-red-400/40 bg-red-400/10 text-red-200";
  }
  if (["high", "warning", "pending", "ignored"].includes(value)) {
    return "border-yellow-400/40 bg-yellow-400/10 text-yellow-100";
  }
  if (["passed", "processed", "completed", "sent", "acknowledged", "matched", "up", "enabled"].includes(value)) {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  }
  return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200";
}

export default function AdminOperationsPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await authenticatedFetchJson<Payload>("/api/admin/operations");
      setPayload(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load operations data."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadData]);

  const passingChecks = useMemo(
    () => payload?.checks.filter((check) => check.passed).length || 0,
    [payload]
  );

  async function replayWebhook(event: WebhookEvent) {
    setBusy(`webhook:${event.id}`);
    setError("");
    setMessage("");
    try {
      await authenticatedFetchJson("/api/admin/webhooks/paypal/replay", {
        method: "POST",
        body: JSON.stringify({ id: event.id }),
      });
      setMessage(`Webhook ${event.event_id} replayed successfully.`);
      await loadData();
    } catch (replayError) {
      setError(
        replayError instanceof Error ? replayError.message : "Webhook replay failed."
      );
    } finally {
      setBusy(null);
    }
  }

  async function acknowledgeAlert(alert: OperationalAlert) {
    setBusy(`alert:${alert.id}`);
    setError("");
    try {
      await authenticatedFetchJson("/api/admin/operations", {
        method: "PATCH",
        body: JSON.stringify({ kind: "alert", id: alert.id }),
      });
      await loadData();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to acknowledge alert."
      );
    } finally {
      setBusy(null);
    }
  }

  async function updateSignoff(
    signoff: Signoff,
    status: Signoff["status"]
  ) {
    const note =
      status === "pending"
        ? ""
        : window.prompt(
            status === "passed"
              ? "Record the evidence or approval reference:"
              : "Describe the blocker:"
          )?.trim() || "";
    if (status !== "pending" && !note) return;

    setBusy(`signoff:${signoff.area}`);
    setError("");
    try {
      await authenticatedFetchJson("/api/admin/operations", {
        method: "PATCH",
        body: JSON.stringify({
          kind: "signoff",
          area: signoff.area,
          status,
          note,
        }),
      });
      await loadData();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to update launch sign-off."
      );
    } finally {
      setBusy(null);
    }
  }

  async function updateCheckoutControl(
    mode: RuntimeControl["mode"],
    percentage: number
  ) {
    const current = payload?.runtimeControl;
    const message =
      mode === "disabled"
        ? window.prompt(
            "Customer-facing maintenance message:",
            current?.message ||
              "Checkout is temporarily unavailable while we perform maintenance."
          )?.trim() || ""
        : current?.message || "Checkout is temporarily unavailable.";
    if (mode === "disabled" && !message) return;

    setBusy("checkout-control");
    setError("");
    setMessage("");
    try {
      await authenticatedFetchJson("/api/admin/operations", {
        method: "PATCH",
        body: JSON.stringify({
          kind: "checkout_control",
          mode,
          percentage,
          message,
          allowlist: current?.allowlist || [],
        }),
      });
      setMessage(
        mode === "canary"
          ? `Checkout canary updated to ${percentage}%.`
          : `Checkout is now ${mode}.`
      );
      await loadData();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to update checkout control."
      );
    } finally {
      setBusy(null);
    }
  }

  async function runProviderReconciliation() {
    setBusy("provider-reconciliation");
    setError("");
    setMessage("");
    try {
      const data = await authenticatedFetchJson<{
        result: { scanned: number; matched: number; mismatches: number; errors: number };
      }>("/api/admin/operations", {
        method: "POST",
        body: JSON.stringify({ action: "reconcile_paypal_provider" }),
      });
      setMessage(
        `Provider reconciliation scanned ${data.result.scanned}: ${data.result.matched} matched, ${data.result.mismatches} mismatched, ${data.result.errors} errors.`
      );
      await loadData();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "PayPal provider reconciliation failed."
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading && !payload) {
    return (
      <main className="min-h-screen bg-[#050816] px-4 py-24 text-center text-white">
        Loading production operations...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="border-b border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,.18),transparent_42%)]">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-200">
            <FaRocket /> V20 Controlled Launch
          </p>
          <h1 className="mt-5 text-5xl font-black md:text-7xl">
            Production Operations
          </h1>
          <p className="mt-4 max-w-3xl text-slate-300">
            Control the checkout canary, verify PayPal against provider data, review SLO health, operational alerts, and final launch evidence.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="rounded-xl border border-white/15 px-5 py-3 font-black hover:border-white/40"
            >
              Admin Dashboard
            </Link>
            <Link
              href="/admin/reconciliation"
              className="rounded-xl border border-violet-400/40 px-5 py-3 font-black text-violet-200"
            >
              Reconciliation
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        {error ? (
          <p className="mb-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-5 font-bold text-red-200">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 font-bold text-emerald-200">
            {message}
          </p>
        ) : null}

        {!payload ? null : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Metric
                label="Launch status"
                value={payload.ready ? "READY" : "BLOCKED"}
                tone={payload.ready ? "green" : "red"}
              />
              <Metric
                label="Checks passing"
                value={`${passingChecks}/${payload.checks.length}`}
              />
              <Metric
                label="Critical alerts"
                value={payload.metrics.openCriticalAlerts}
                tone={payload.metrics.openCriticalAlerts ? "red" : "green"}
              />
              <Metric
                label="Failed webhooks 24h"
                value={payload.metrics.failedWebhooks24h}
                tone={payload.metrics.failedWebhooks24h ? "red" : "green"}
              />
              <Metric
                label="Pending sign-offs"
                value={payload.metrics.pendingSignoffs}
                tone={payload.metrics.pendingSignoffs ? "yellow" : "green"}
              />
            </div>

            <div className="mt-8 grid gap-8 xl:grid-cols-2">
              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <div className="flex items-center gap-3">
                  <FaRocket className="text-emerald-300" />
                  <h2 className="text-2xl font-black">Checkout kill switch & canary</h2>
                </div>
                <p className="mt-3 text-sm text-slate-400">
                  New order creation and wallet/PayPal payment initiation are gated.
                  Existing PayPal captures remain finishable to avoid stranded funds.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Metric
                    label="Mode"
                    value={pretty(payload.runtimeControl?.mode || "missing")}
                    tone={payload.runtimeControl?.mode === "disabled" ? "red" : "green"}
                  />
                  <Metric
                    label="Canary allocation"
                    value={`${payload.runtimeControl?.percentage ?? 0}%`}
                    tone="yellow"
                  />
                  <Metric
                    label="Allowlisted users"
                    value={payload.runtimeControl?.allowlist?.length || 0}
                  />
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void updateCheckoutControl("disabled", 0)}
                    disabled={busy === "checkout-control"}
                    className="rounded-xl bg-red-400 px-4 py-2 font-black text-black disabled:opacity-50"
                  >
                    Emergency disable
                  </button>
                  {[10, 25, 50].map((percentage) => (
                    <button
                      key={percentage}
                      type="button"
                      onClick={() => void updateCheckoutControl("canary", percentage)}
                      disabled={busy === "checkout-control"}
                      className="rounded-xl border border-yellow-400/40 px-4 py-2 font-black text-yellow-100 disabled:opacity-50"
                    >
                      Canary {percentage}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void updateCheckoutControl("enabled", 100)}
                    disabled={busy === "checkout-control"}
                    className="rounded-xl border border-emerald-400/40 px-4 py-2 font-black text-emerald-200 disabled:opacity-50"
                  >
                    Enable 100%
                  </button>
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  Updated {formatDate(payload.runtimeControl?.updated_at)}. Environment
                  variable CHECKOUT_KILL_SWITCH always overrides this database control.
                </p>
              </section>

              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <div className="flex items-center gap-3">
                  <FaServer className="text-cyan-300" />
                  <h2 className="text-2xl font-black">24-hour uptime SLO</h2>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Metric
                    label="Availability"
                    value={`${payload.slo.availabilityPercent.toFixed(3)}%`}
                    tone={payload.slo.availabilityPassing ? "green" : "red"}
                  />
                  <Metric
                    label="p95 latency"
                    value={`${payload.slo.p95LatencyMs} ms`}
                    tone={payload.slo.latencyPassing ? "green" : "red"}
                  />
                  <Metric label="Regions observed" value={payload.slo.regionCount} />
                  <Metric
                    label="Failed checks"
                    value={payload.slo.failedChecks}
                    tone={payload.slo.failedChecks ? "red" : "green"}
                  />
                </div>
                <div className="mt-5 space-y-2">
                  {payload.uptimeChecks.slice(0, 5).map((check) => (
                    <div
                      key={check.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm"
                    >
                      <span className="max-w-md truncate">{check.target}</span>
                      <span className="text-slate-400">
                        {check.region} · {check.latency_ms} ms · {formatDate(check.checked_at)}
                      </span>
                      <span className={`rounded-full border px-2 py-1 text-xs font-black ${statusClass(check.status)}`}>
                        {pretty(check.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black">PayPal provider reconciliation</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Compare local capture IDs, currency, amount, and state with PayPal Sandbox or Live.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void runProviderReconciliation()}
                  disabled={busy === "provider-reconciliation"}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-400 px-4 py-3 font-black text-black disabled:opacity-50"
                >
                  <FaRedo /> Run provider check
                </button>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="px-3 py-3">Capture</th>
                      <th className="px-3 py-3">Order</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Checked</th>
                      <th className="px-3 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.providerChecks.slice(0, 20).map((check) => (
                      <tr key={check.id} className="border-t border-white/10">
                        <td className="max-w-48 truncate px-3 py-3 font-mono text-xs">
                          {check.capture_id}
                        </td>
                        <td className="px-3 py-3">{check.marketplace_order_id || "-"}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(check.status)}`}>
                            {pretty(check.status)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-400">{formatDate(check.checked_at)}</td>
                        <td className="max-w-md px-3 py-3 text-red-200">
                          {check.error_message ||
                            check.mismatches?.map((item) => item.field).filter(Boolean).join(", ") ||
                            "Matched"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-center gap-3">
                <FaCheckCircle className="text-emerald-300" />
                <h2 className="text-2xl font-black">Automated launch gates</h2>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {payload.checks.map((check) => (
                  <div
                    key={check.key}
                    className={`rounded-2xl border p-4 ${
                      check.passed
                        ? "border-emerald-400/25 bg-emerald-400/10"
                        : "border-red-400/25 bg-red-400/10"
                    }`}
                  >
                    <p className="font-black">{check.label}</p>
                    <p
                      className={`mt-2 text-sm font-bold ${
                        check.passed ? "text-emerald-200" : "text-red-200"
                      }`}
                    >
                      {check.passed ? "PASS" : "BLOCKING"}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-center gap-3">
                <FaRocket className="text-cyan-300" />
                <h2 className="text-2xl font-black">Manual launch sign-offs</h2>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {payload.signoffs.map((signoff) => (
                  <article
                    key={signoff.area}
                    className="rounded-2xl border border-white/10 bg-black/30 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-black">{pretty(signoff.area)}</h3>
                        <p className="mt-2 text-sm text-slate-400">
                          {signoff.note || "No evidence recorded yet."}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {formatDate(signoff.signed_at)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(
                          signoff.status
                        )}`}
                      >
                        {pretty(signoff.status)}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void updateSignoff(signoff, "passed")}
                        disabled={busy === `signoff:${signoff.area}`}
                        className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-black text-black disabled:opacity-50"
                      >
                        Pass
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateSignoff(signoff, "blocked")}
                        disabled={busy === `signoff:${signoff.area}`}
                        className="rounded-lg border border-red-400/40 px-3 py-2 text-sm font-black text-red-200 disabled:opacity-50"
                      >
                        Block
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateSignoff(signoff, "pending")}
                        disabled={busy === `signoff:${signoff.area}`}
                        className="rounded-lg border border-white/15 px-3 py-2 text-sm font-black disabled:opacity-50"
                      >
                        Reset
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <div className="mt-8 grid gap-8 xl:grid-cols-2">
              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <div className="flex items-center gap-3">
                  <FaBell className="text-yellow-300" />
                  <h2 className="text-2xl font-black">Operational alerts</h2>
                </div>
                <div className="mt-5 space-y-3">
                  {payload.alerts.length === 0 ? (
                    <Empty text="No operational alerts recorded." />
                  ) : (
                    payload.alerts.slice(0, 30).map((alert) => (
                      <article
                        key={alert.id}
                        className="rounded-2xl border border-white/10 bg-black/30 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-black">{alert.title}</p>
                            <p className="mt-2 text-sm text-slate-400">
                              {alert.message}
                            </p>
                            <p className="mt-2 text-xs text-slate-500">
                              {alert.source} · {formatDate(alert.last_detected_at)} · {alert.occurrence_count} occurrence(s)
                            </p>
                          </div>
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(
                              alert.severity
                            )}`}
                          >
                            {pretty(alert.severity)}
                          </span>
                        </div>
                        {!["acknowledged", "suppressed"].includes(alert.status) ? (
                          <button
                            type="button"
                            onClick={() => void acknowledgeAlert(alert)}
                            disabled={busy === `alert:${alert.id}`}
                            className="mt-4 rounded-lg border border-emerald-400/40 px-3 py-2 text-sm font-black text-emerald-200 disabled:opacity-50"
                          >
                            Acknowledge
                          </button>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <div className="flex items-center gap-3">
                  <FaRedo className="text-violet-300" />
                  <h2 className="text-2xl font-black">PayPal webhook inbox</h2>
                </div>
                <div className="mt-5 space-y-3">
                  {payload.webhooks.length === 0 ? (
                    <Empty text="No webhook events recorded." />
                  ) : (
                    payload.webhooks.slice(0, 30).map((event) => (
                      <article
                        key={event.id}
                        className="rounded-2xl border border-white/10 bg-black/30 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-black">{event.event_type}</p>
                            <p className="mt-1 break-all text-xs text-slate-500">
                              {event.event_id}
                            </p>
                            <p className="mt-2 text-sm text-slate-400">
                              Order {event.marketplace_order_id || "-"} · Attempt {event.attempts} · {formatDate(event.received_at)}
                            </p>
                            {event.last_error ? (
                              <p className="mt-2 text-sm text-red-200">
                                {event.last_error}
                              </p>
                            ) : null}
                          </div>
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(
                              event.processing_status
                            )}`}
                          >
                            {pretty(event.processing_status)}
                          </span>
                        </div>
                        {["failed", "ignored"].includes(event.processing_status) ? (
                          <button
                            type="button"
                            onClick={() => void replayWebhook(event)}
                            disabled={busy === `webhook:${event.id}`}
                            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-400 px-3 py-2 text-sm font-black text-black disabled:opacity-50"
                          >
                            <FaRedo /> Replay verified event
                          </button>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>

            <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-center gap-3">
                <FaServer className="text-cyan-300" />
                <h2 className="text-2xl font-black">Tracked operational runs</h2>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="px-3 py-3">Job</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Duration</th>
                      <th className="px-3 py-3">Started</th>
                      <th className="px-3 py-3">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.runs.slice(0, 40).map((run) => (
                      <tr key={run.id} className="border-t border-white/10">
                        <td className="px-3 py-3 font-black">{pretty(run.job_name)}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(
                              run.status
                            )}`}
                          >
                            {pretty(run.status)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-300">
                          {run.duration_ms === null || run.duration_ms === undefined
                            ? "-"
                            : `${run.duration_ms} ms`}
                        </td>
                        <td className="px-3 py-3 text-slate-300">
                          {formatDate(run.started_at)}
                        </td>
                        <td className="max-w-md px-3 py-3 text-red-200">
                          {run.error_message || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  tone = "cyan",
}: {
  label: string;
  value: string | number;
  tone?: "cyan" | "green" | "yellow" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-300"
      : tone === "yellow"
        ? "text-yellow-300"
        : tone === "red"
          ? "text-red-300"
          : "text-cyan-300";
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-white/10 bg-black/30 p-5 text-slate-400">
      {text}
    </p>
  );
}
