import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PayPalWebhookEvent,
  PayPalWebhookProcessingResult,
} from "@/lib/paypalWebhook";
import { getPayPalEventIdentity } from "@/lib/paypalWebhook";
import { logEvent } from "@/lib/observability";

type WebhookInboxRow = {
  id: number;
  event_id: string;
  event_type: string;
  verification_status: string;
  processing_status: string;
  attempts: number;
  payload: PayPalWebhookEvent;
};

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        /payment_webhook_events.*does not exist|relation.*does not exist/i.test(
          error.message || ""
        ))
  );
}

export async function registerVerifiedPayPalEvent(input: {
  supabaseAdmin: SupabaseClient;
  event: PayPalWebhookEvent;
  headers: Record<string, string | null>;
}) {
  const identity = getPayPalEventIdentity(input.event);
  if (!identity.eventId) throw Object.assign(new Error("PayPal webhook event ID is missing."), { status: 400 });
  if (!identity.eventType) throw Object.assign(new Error("PayPal webhook event type is missing."), { status: 400 });

  const now = new Date().toISOString();
  const { data, error } = await input.supabaseAdmin
    .from("payment_webhook_events")
    .insert({
      provider: "paypal",
      event_id: identity.eventId,
      event_type: identity.eventType,
      verification_status: "verified",
      processing_status: "received",
      attempts: 0,
      payload: input.event,
      request_headers: input.headers,
      result: {},
      received_at: now,
      created_at: now,
      updated_at: now,
    })
    .select("id,event_id,event_type,verification_status,processing_status,attempts,payload")
    .single();

  if (!error && data) return { row: data as WebhookInboxRow, duplicate: false, available: true };

  if (error?.code === "23505") {
    const existing = await input.supabaseAdmin
      .from("payment_webhook_events")
      .select("id,event_id,event_type,verification_status,processing_status,attempts,payload")
      .eq("provider", "paypal")
      .eq("event_id", identity.eventId)
      .single();
    if (existing.error || !existing.data) {
      throw new Error(existing.error?.message || "Failed to load duplicate webhook event.");
    }
    return { row: existing.data as WebhookInboxRow, duplicate: true, available: true };
  }

  if (isMissingTableError(error)) {
    logEvent("warn", "paypal.webhook.inbox_unavailable", { error });
    return { row: null, duplicate: false, available: false };
  }

  throw new Error(error?.message || "Failed to register PayPal webhook event.");
}

export function webhookResultIsFinal(status: string) {
  return status === "processed" || status === "ignored";
}

export async function markWebhookProcessing(input: {
  supabaseAdmin: SupabaseClient;
  rowId: number | null;
  force?: boolean;
}) {
  if (!input.rowId) return;
  const now = new Date().toISOString();

  const { data: current, error: currentError } = await input.supabaseAdmin
    .from("payment_webhook_events")
    .select("processing_status,attempts,first_processed_at")
    .eq("id", input.rowId)
    .single();
  if (currentError) throw new Error(currentError.message);

  if (!input.force && webhookResultIsFinal(String(current.processing_status || ""))) {
    return;
  }

  const { error } = await input.supabaseAdmin
    .from("payment_webhook_events")
    .update({
      processing_status: "processing",
      attempts: Number(current.attempts || 0) + 1,
      first_processed_at: current.first_processed_at || now,
      last_processed_at: now,
      last_error: null,
      updated_at: now,
    })
    .eq("id", input.rowId);
  if (error) throw new Error(error.message);
}

export async function completeWebhookInboxEvent(input: {
  supabaseAdmin: SupabaseClient;
  rowId: number | null;
  result: PayPalWebhookProcessingResult;
  replayedBy?: string;
}) {
  if (!input.rowId) return;
  const now = new Date().toISOString();
  const { error } = await input.supabaseAdmin
    .from("payment_webhook_events")
    .update({
      processing_status: input.result.status,
      marketplace_order_id: input.result.orderId,
      result: input.result,
      last_error: null,
      last_processed_at: now,
      replayed_at: input.replayedBy ? now : null,
      replayed_by: input.replayedBy || null,
      updated_at: now,
    })
    .eq("id", input.rowId);
  if (error) throw new Error(error.message);
}

export async function failWebhookInboxEvent(input: {
  supabaseAdmin: SupabaseClient;
  rowId: number | null;
  error: unknown;
  replayedBy?: string;
}) {
  if (!input.rowId) return;
  const now = new Date().toISOString();
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const { error } = await input.supabaseAdmin
    .from("payment_webhook_events")
    .update({
      processing_status: "failed",
      last_error: message.slice(0, 1000),
      last_processed_at: now,
      replayed_at: input.replayedBy ? now : null,
      replayed_by: input.replayedBy || null,
      updated_at: now,
    })
    .eq("id", input.rowId);
  if (error) throw new Error(error.message);
}
