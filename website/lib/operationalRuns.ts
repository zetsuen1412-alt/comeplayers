import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAlertFingerprint,
  dispatchOperationalAlert,
} from "@/lib/alerting";
import { logEvent } from "@/lib/observability";

async function insertRun(input: {
  supabaseAdmin: SupabaseClient;
  jobName: string;
  runKey: string;
  source: string;
  requestId?: string;
  startedAt: string;
}) {
  const { data, error } = await input.supabaseAdmin
    .from("operational_runs")
    .upsert(
      {
        job_name: input.jobName,
        run_key: input.runKey,
        source: input.source,
        status: "running",
        request_id: input.requestId || null,
        summary: {},
        error_message: null,
        started_at: input.startedAt,
        completed_at: null,
        duration_ms: null,
        updated_at: input.startedAt,
      },
      { onConflict: "run_key" }
    )
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return String(data.id);
}

async function finishRun(input: {
  supabaseAdmin: SupabaseClient;
  runId: string | null;
  status: "completed" | "failed";
  startedAtMs: number;
  summary?: Record<string, unknown>;
  error?: unknown;
}) {
  if (!input.runId) return;
  const completedAt = new Date().toISOString();
  const message =
    input.error instanceof Error
      ? input.error.message
      : input.error
        ? String(input.error)
        : null;

  const { error } = await input.supabaseAdmin
    .from("operational_runs")
    .update({
      status: input.status,
      summary: input.summary || {},
      error_message: message ? message.slice(0, 1000) : null,
      completed_at: completedAt,
      duration_ms: Math.max(0, Date.now() - input.startedAtMs),
      updated_at: completedAt,
    })
    .eq("id", input.runId);

  if (error) throw new Error(error.message);
}

export async function runTrackedOperation<T>(input: {
  supabaseAdmin: SupabaseClient;
  jobName: string;
  runKey: string;
  source: string;
  requestId?: string;
  execute: () => Promise<T>;
  summarize?: (result: T) => Record<string, unknown>;
}) {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  let runId: string | null = null;

  try {
    runId = await insertRun({
      supabaseAdmin: input.supabaseAdmin,
      jobName: input.jobName,
      runKey: input.runKey,
      source: input.source,
      requestId: input.requestId,
      startedAt,
    });
  } catch (error) {
    logEvent("warn", "operational_run.start_persist_failed", {
      jobName: input.jobName,
      runKey: input.runKey,
      error,
    });
  }

  try {
    const result = await input.execute();
    const summary = input.summarize?.(result) || {};

    try {
      await finishRun({
        supabaseAdmin: input.supabaseAdmin,
        runId,
        status: "completed",
        startedAtMs,
        summary,
      });
    } catch (error) {
      logEvent("warn", "operational_run.completion_persist_failed", {
        jobName: input.jobName,
        runKey: input.runKey,
        error,
      });
    }

    return result;
  } catch (error) {
    try {
      await finishRun({
        supabaseAdmin: input.supabaseAdmin,
        runId,
        status: "failed",
        startedAtMs,
        error,
      });
    } catch (persistenceError) {
      logEvent("warn", "operational_run.failure_persist_failed", {
        jobName: input.jobName,
        runKey: input.runKey,
        error: persistenceError,
      });
    }

    await dispatchOperationalAlert({
      supabaseAdmin: input.supabaseAdmin,
      fingerprint: createAlertFingerprint([
        "operational-job-failed",
        input.jobName,
        new Date().toISOString().slice(0, 10),
      ]),
      source: `job:${input.jobName}`,
      severity: "critical",
      title: `${input.jobName} failed`,
      message: error instanceof Error ? error.message : "Unexpected operational job failure.",
      context: {
        requestId: input.requestId,
        runKey: input.runKey,
        durationMs: Date.now() - startedAtMs,
      },
    });

    throw error;
  }
}
