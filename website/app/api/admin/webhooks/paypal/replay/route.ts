import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";
import {
  createAlertFingerprint,
  dispatchOperationalAlert,
} from "@/lib/alerting";
import { logEvent, requestId } from "@/lib/observability";
import {
  processVerifiedPayPalWebhookEvent,
  type PayPalWebhookEvent,
} from "@/lib/paypalWebhook";
import {
  completeWebhookInboxEvent,
  failWebhookInboxEvent,
  markWebhookProcessing,
} from "@/lib/webhookInbox";

export async function POST(request: Request) {
  const currentRequestId = requestId(request);
  let rowId = 0;

  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as { id?: number };
    rowId = Number(body.id || 0);

    if (!Number.isInteger(rowId) || rowId <= 0) {
      return NextResponse.json({ error: "Invalid webhook event ID." }, { status: 400 });
    }

    const { data: eventRow, error } = await supabaseAdmin
      .from("payment_webhook_events")
      .select("*")
      .eq("id", rowId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!eventRow) {
      return NextResponse.json({ error: "Webhook event not found." }, { status: 404 });
    }
    if (String(eventRow.verification_status) !== "verified") {
      return NextResponse.json(
        { error: "Only verified webhook events can be replayed." },
        { status: 400 }
      );
    }
    if (!["failed", "ignored"].includes(String(eventRow.processing_status))) {
      return NextResponse.json(
        { error: "Only failed or ignored webhook events can be replayed." },
        { status: 409 }
      );
    }

    await markWebhookProcessing({
      supabaseAdmin,
      rowId,
      force: true,
    });

    try {
      const result = await processVerifiedPayPalWebhookEvent({
        supabaseAdmin,
        event: (eventRow.payload || {}) as PayPalWebhookEvent,
      });
      await completeWebhookInboxEvent({
        supabaseAdmin,
        rowId,
        result,
        replayedBy: user.id,
      });

      await recordAdminAudit({
        adminId: user.id,
        action: "paypal.webhook_replay",
        entityType: "payment_webhook_event",
        entityId: rowId,
        beforeData: {
          processing_status: eventRow.processing_status,
          attempts: eventRow.attempts,
          last_error: eventRow.last_error,
        },
        afterData: result,
        metadata: { requestId: currentRequestId },
      });

      return NextResponse.json(
        { ok: true, result },
        { headers: { "x-request-id": currentRequestId } }
      );
    } catch (processingError) {
      await failWebhookInboxEvent({
        supabaseAdmin,
        rowId,
        error: processingError,
        replayedBy: user.id,
      });

      await dispatchOperationalAlert({
        supabaseAdmin,
        fingerprint: createAlertFingerprint([
          "paypal-webhook-replay-failed",
          eventRow.event_id,
        ]),
        source: "admin.paypal_webhook_replay",
        severity: "critical",
        title: "PayPal webhook replay failed",
        message:
          processingError instanceof Error
            ? processingError.message
            : "Unexpected PayPal webhook replay failure.",
        context: {
          requestId: currentRequestId,
          webhookEventId: rowId,
          providerEventId: eventRow.event_id,
          eventType: eventRow.event_type,
          adminId: user.id,
        },
        force: true,
      });
      throw processingError;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected webhook replay error.";
    logEvent("error", "admin.paypal_webhook_replay.failed", {
      requestId: currentRequestId,
      webhookEventId: rowId || null,
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
