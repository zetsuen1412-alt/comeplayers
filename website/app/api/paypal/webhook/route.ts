import { NextResponse } from "next/server";
import {
  createAlertFingerprint,
  dispatchOperationalAlert,
} from "@/lib/alerting";
import { logEvent, requestId } from "@/lib/observability";
import {
  capturePayPalWebhookHeaders,
  getPayPalEventIdentity,
  processVerifiedPayPalWebhookEvent,
  type PayPalWebhookEvent,
} from "@/lib/paypalWebhook";
import { createSupabaseAdmin } from "@/lib/serverSupabase";
import {
  completeWebhookInboxEvent,
  failWebhookInboxEvent,
  markWebhookProcessing,
  registerVerifiedPayPalEvent,
  webhookResultIsFinal,
} from "@/lib/webhookInbox";

const PAYPAL_API =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function getPayPalAccessToken() {
  const clientId =
    process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal environment variables are missing.");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const data = (await response.json()) as {
    access_token?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description || "Failed to get PayPal access token."
    );
  }

  return data.access_token;
}

async function verifyWebhookSignature(
  request: Request,
  event: PayPalWebhookEvent,
  accessToken: string
) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is missing.");

  const response = await fetch(
    `${PAYPAL_API}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: request.headers.get("paypal-auth-algo"),
        cert_url: request.headers.get("paypal-cert-url"),
        transmission_id: request.headers.get("paypal-transmission-id"),
        transmission_sig: request.headers.get("paypal-transmission-sig"),
        transmission_time: request.headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: event,
      }),
      cache: "no-store",
    }
  );

  const data = (await response.json()) as { verification_status?: string };
  return response.ok && data.verification_status === "SUCCESS";
}

function errorStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const parsed = Number((error as { status?: number }).status);
    if (Number.isInteger(parsed) && parsed >= 400 && parsed <= 599) return parsed;
  }
  return 500;
}

export async function POST(request: Request) {
  const currentRequestId = requestId(request);
  const responseHeaders = { "x-request-id": currentRequestId };
  let event: PayPalWebhookEvent = {};
  let inboxRowId: number | null = null;
  let supabaseAdmin: ReturnType<typeof createSupabaseAdmin> | null = null;

  try {
    event = (await request.json()) as PayPalWebhookEvent;
    const identity = getPayPalEventIdentity(event);
    const accessToken = await getPayPalAccessToken();
    const verified = await verifyWebhookSignature(request, event, accessToken);

    if (!verified) {
      logEvent("warn", "paypal.webhook.invalid_signature", {
        requestId: currentRequestId,
        eventId: identity.eventId || null,
        eventType: identity.eventType || null,
      });
      return NextResponse.json(
        { ok: false, error: "Invalid PayPal webhook signature." },
        { status: 400, headers: responseHeaders }
      );
    }

    supabaseAdmin = createSupabaseAdmin();
    const registered = await registerVerifiedPayPalEvent({
      supabaseAdmin,
      event,
      headers: capturePayPalWebhookHeaders(request),
    });
    inboxRowId = registered.row?.id || null;

    if (
      registered.duplicate &&
      registered.row?.processing_status === "processing"
    ) {
      return NextResponse.json(
        {
          ok: true,
          idempotent: true,
          status: "processing",
          eventId: identity.eventId,
        },
        { status: 202, headers: responseHeaders }
      );
    }

    if (
      registered.duplicate &&
      registered.row &&
      webhookResultIsFinal(registered.row.processing_status)
    ) {
      logEvent("info", "paypal.webhook.duplicate_ignored", {
        requestId: currentRequestId,
        eventId: identity.eventId,
        eventType: identity.eventType,
        processingStatus: registered.row.processing_status,
      });
      return NextResponse.json(
        {
          ok: true,
          idempotent: true,
          status: registered.row.processing_status,
          eventId: identity.eventId,
        },
        { headers: responseHeaders }
      );
    }

    await markWebhookProcessing({ supabaseAdmin, rowId: inboxRowId });
    const result = await processVerifiedPayPalWebhookEvent({ supabaseAdmin, event });
    await completeWebhookInboxEvent({
      supabaseAdmin,
      rowId: inboxRowId,
      result,
    });

    logEvent("info", "paypal.webhook.processed", {
      requestId: currentRequestId,
      eventId: identity.eventId,
      eventType: identity.eventType,
      orderId: result.orderId,
      status: result.status,
      action: result.action,
    });

    return NextResponse.json(
      { ok: true, eventId: identity.eventId, ...result },
      { headers: responseHeaders }
    );
  } catch (error) {
    const identity = getPayPalEventIdentity(event);
    const message =
      error instanceof Error ? error.message : "Unexpected PayPal webhook error.";

    if (supabaseAdmin) {
      try {
        await failWebhookInboxEvent({
          supabaseAdmin,
          rowId: inboxRowId,
          error,
        });
      } catch (persistenceError) {
        logEvent("warn", "paypal.webhook.failure_persist_failed", {
          requestId: currentRequestId,
          eventId: identity.eventId || null,
          error: persistenceError,
        });
      }

      await dispatchOperationalAlert({
        supabaseAdmin,
        fingerprint: createAlertFingerprint([
          "paypal-webhook-failed",
          identity.eventType || "unknown",
          identity.eventId || new Date().toISOString().slice(0, 13),
        ]),
        source: "paypal.webhook",
        severity: "critical",
        title: "PayPal webhook processing failed",
        message,
        context: {
          requestId: currentRequestId,
          eventId: identity.eventId || null,
          eventType: identity.eventType || null,
          inboxRowId,
        },
      });
    }

    logEvent("error", "paypal.webhook.failed", {
      requestId: currentRequestId,
      eventId: identity.eventId || null,
      eventType: identity.eventType || null,
      error,
    });

    return NextResponse.json(
      { ok: false, error: message, requestId: currentRequestId },
      { status: errorStatus(error), headers: responseHeaders }
    );
  }
}
