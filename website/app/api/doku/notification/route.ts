import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  verifyDokuRequestSignature,
  verifyDokuSnapSignature,
} from "@/lib/dokuSignature";
import {
  DOKU_NOTIFICATION_TARGET,
  getDokuConfig,
} from "@/lib/dokuServer";
import { recordTrustedMarketplaceEvent } from "@/lib/marketplaceEventsServer";
import { createSupabaseAdmin } from "@/lib/serverSupabase";

export const runtime = "nodejs";

type DokuNotification = {
  order?: {
    invoice_number?: string;
    amount?: string | number;
  };
  transaction?: {
    status?: string;
    original_request_id?: string;
  };
  channel?: {
    id?: string;
  };
};

type DokuSnapNotification = {
  originalPartnerReferenceNo?: string;
  originalReferenceNo?: string;
  originalExternalId?: string;
  latestTransactionStatus?: string;
  transactionStatusDesc?: string;
  amount?: {
    value?: string | number;
    currency?: string;
  };
  additionalInfo?: {
    channelId?: string;
    channel?: string;
    acquirerId?: string;
    approvalCode?: string;
  };
};

type DokuWebhookPayload = DokuNotification | DokuSnapNotification;

type InboxRow = {
  id: number;
  processing_status: string | null;
  attempts: number | null;
  first_processed_at: string | null;
};

function normalize(value?: string | null) {
  return String(value || "").trim().toUpperCase();
}

function numberPrice(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function snapSuccessResponse(approvalCode: string) {
  return NextResponse.json({
    responseCode: "2005600",
    approvalCode: approvalCode.slice(0, 64) || "COMEPLAYERS",
    responseMessage: "Request has been processed successfully",
  });
}

function snapStatus(value?: string | null) {
  const normalized = normalize(value);
  if (normalized === "00") return "SUCCESS";
  if (normalized === "04") return "REFUNDED";
  if (normalized === "05") return "CANCELLED";
  if (normalized === "06") return "FAILED";
  return "PENDING";
}

async function registerInboxEvent(input: {
  supabaseAdmin: SupabaseClient;
  eventId: string;
  eventType: string;
  payload: DokuWebhookPayload;
  headers: Record<string, string>;
}) {
  const now = new Date().toISOString();
  const { data, error } = await input.supabaseAdmin
    .from("payment_webhook_events")
    .insert({
      provider: "doku",
      event_id: input.eventId,
      event_type: input.eventType,
      verification_status: "verified",
      processing_status: "received",
      attempts: 0,
      payload: input.payload,
      request_headers: input.headers,
      result: {},
      received_at: now,
      created_at: now,
      updated_at: now,
    })
    .select("id,processing_status,attempts,first_processed_at")
    .single();

  if (!error && data) {
    return { row: data as InboxRow, duplicate: false };
  }

  if (error?.code !== "23505") {
    throw new Error(error?.message || "Unable to register DOKU notification.");
  }

  const existing = await input.supabaseAdmin
    .from("payment_webhook_events")
    .select("id,processing_status,attempts,first_processed_at")
    .eq("provider", "doku")
    .eq("event_id", input.eventId)
    .single();

  if (existing.error || !existing.data) {
    throw new Error(existing.error?.message || "Unable to load DOKU notification.");
  }

  return { row: existing.data as InboxRow, duplicate: true };
}

async function markProcessing(
  supabaseAdmin: SupabaseClient,
  row: InboxRow,
) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("payment_webhook_events")
    .update({
      processing_status: "processing",
      attempts: Number(row.attempts || 0) + 1,
      first_processed_at: row.first_processed_at || now,
      last_processed_at: now,
      last_error: null,
      updated_at: now,
    })
    .eq("id", row.id);

  if (error) throw new Error(error.message);
}

async function finishInboxEvent(input: {
  supabaseAdmin: SupabaseClient;
  rowId: number;
  processingStatus: "processed" | "ignored";
  orderId: number | null;
  result: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const { error } = await input.supabaseAdmin
    .from("payment_webhook_events")
    .update({
      processing_status: input.processingStatus,
      marketplace_order_id: input.orderId,
      result: input.result,
      last_error: null,
      last_processed_at: now,
      updated_at: now,
    })
    .eq("id", input.rowId);

  if (error) throw new Error(error.message);
}

async function failInboxEvent(
  supabaseAdmin: SupabaseClient,
  rowId: number | null,
  error: unknown,
) {
  if (!rowId) return;
  const message = error instanceof Error ? error.message : String(error);
  await supabaseAdmin
    .from("payment_webhook_events")
    .update({
      processing_status: "failed",
      last_error: message.slice(0, 1000),
      last_processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId);
}

export async function POST(request: Request) {
  let inboxRowId: number | null = null;
  let supabaseAdmin: SupabaseClient | null = null;

  try {
    const rawBody = await request.text();
    const config = getDokuConfig();
    const snapPartnerId = request.headers.get("x-partner-id") || "";
    const snapExternalId = request.headers.get("x-external-id") || "";
    const snapTimestamp = request.headers.get("x-timestamp") || "";
    const snapSignature = request.headers.get("x-signature") || "";
    const snapAuthorization = request.headers.get("authorization") || "";
    const isSnapNotification = Boolean(
      snapPartnerId || snapExternalId || snapTimestamp || snapSignature,
    );
    const clientId = request.headers.get("client-id") || "";
    const requestId = request.headers.get("request-id") || "";
    const requestTimestamp = request.headers.get("request-timestamp") || "";
    const signature = request.headers.get("signature") || "";
    const requestTarget = new URL(request.url).pathname;

    const validSignature = isSnapNotification
      ? snapPartnerId === config.clientId &&
        Boolean(
          snapExternalId &&
            snapTimestamp &&
            snapSignature &&
            snapAuthorization,
        ) &&
        verifyDokuSnapSignature({
          httpMethod: request.method,
          requestTarget,
          accessToken: snapAuthorization,
          requestTimestamp: snapTimestamp,
          rawBody,
          secretKey: config.secretKey,
          signature: snapSignature,
        })
      : clientId === config.clientId &&
        Boolean(requestId && requestTimestamp && signature) &&
        verifyDokuRequestSignature({
          clientId,
          requestId,
          requestTimestamp,
          requestTarget,
          rawBody,
          secretKey: config.secretKey,
          signature,
        });

    if (requestTarget !== DOKU_NOTIFICATION_TARGET || !validSignature) {
      return NextResponse.json(
        { error: "Invalid DOKU notification signature." },
        { status: 401 },
      );
    }

    let notification: DokuWebhookPayload;
    try {
      notification = JSON.parse(rawBody) as DokuWebhookPayload;
    } catch {
      return NextResponse.json(
        { error: "Invalid DOKU notification body." },
        { status: 400 },
      );
    }

    const snapNotification = notification as DokuSnapNotification;
    const checkoutNotification = notification as DokuNotification;
    const invoiceNumber = String(
      isSnapNotification
        ? snapNotification.originalPartnerReferenceNo || ""
        : checkoutNotification.order?.invoice_number || "",
    ).trim();
    const transactionStatus = isSnapNotification
      ? snapStatus(snapNotification.latestTransactionStatus)
      : normalize(checkoutNotification.transaction?.status);
    const originalRequestId = String(
      isSnapNotification
        ? snapNotification.originalReferenceNo ||
            snapNotification.originalExternalId ||
            ""
        : checkoutNotification.transaction?.original_request_id || "",
    ).trim();
    const channelId = String(
      isSnapNotification
        ? snapNotification.additionalInfo?.channelId ||
            snapNotification.additionalInfo?.channel ||
            request.headers.get("channel-id") ||
            "QRIS"
        : checkoutNotification.channel?.id || "UNKNOWN",
    )
      .trim()
      .slice(0, 100);
    const amount = numberPrice(
      isSnapNotification
        ? snapNotification.amount?.value
        : checkoutNotification.order?.amount,
    );

    if (
      !invoiceNumber ||
      !transactionStatus ||
      !amount ||
      (isSnapNotification &&
        (!normalize(snapNotification.latestTransactionStatus) ||
          normalize(snapNotification.amount?.currency) !== "IDR"))
    ) {
      return NextResponse.json(
        { error: "Incomplete DOKU notification." },
        { status: 400 },
      );
    }

    const eventId = (isSnapNotification ? snapExternalId : requestId).slice(0, 200);
    const eventType = `${isSnapNotification ? "DOKU_SNAP" : "DOKU_CHECKOUT"}_${transactionStatus}`.slice(0, 200);
    supabaseAdmin = createSupabaseAdmin();
    const registration = await registerInboxEvent({
      supabaseAdmin,
      eventId,
      eventType,
      payload: notification,
      headers: {
        client_id: isSnapNotification ? snapPartnerId : clientId,
        request_id: isSnapNotification ? snapExternalId : requestId,
        request_timestamp: isSnapNotification ? snapTimestamp : requestTimestamp,
      },
    });
    inboxRowId = registration.row.id;

    if (
      registration.duplicate &&
      ["processed", "ignored"].includes(
        String(registration.row.processing_status || ""),
      )
    ) {
      return isSnapNotification
        ? snapSuccessResponse(originalRequestId || eventId)
        : NextResponse.json({ ok: true, duplicate: true });
    }

    await markProcessing(supabaseAdmin, registration.row);

    const { data: orderData, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id,buyer_id,seller_id,invoice_number,total_amount,total_price,price",
      )
      .eq("invoice_number", invoiceNumber)
      .maybeSingle();

    if (orderError) throw new Error(orderError.message);
    if (!orderData) throw new Error("DOKU notification order was not found.");

    const orderId = Number(orderData.id);

    // DOKU Checkout lets the buyer retry or switch channels. Non-success
    // notifications therefore never fail or cancel the marketplace order.
    if (transactionStatus !== "SUCCESS") {
      if (transactionStatus === "EXPIRED") {
        const { error: attemptError } = await supabaseAdmin
          .from("doku_payment_attempts")
          .update({
            status: "expired",
            updated_at: new Date().toISOString(),
          })
          .eq("invoice_number", invoiceNumber)
          .eq("status", "active");

        if (attemptError) throw new Error(attemptError.message);
      }

      await finishInboxEvent({
        supabaseAdmin,
        rowId: registration.row.id,
        processingStatus: "ignored",
        orderId,
        result: {
          action: "non_success_status_ignored",
          transactionStatus,
          invoiceNumber,
          channelId,
        },
      });

      return isSnapNotification
        ? snapSuccessResponse(originalRequestId || eventId)
        : NextResponse.json({ ok: true, ignored: true });
    }

    const paymentProof = [
      "DOKU payment confirmed.",
      `Invoice: ${invoiceNumber}.`,
      `Request: ${originalRequestId || eventId}.`,
      `Channel: ${channelId}.`,
      `IDR ${amount}.`,
    ].join(" ");

    const { data: finalResult, error: finalError } = await supabaseAdmin.rpc(
      "finalize_doku_order_payment",
      {
        p_order_id: orderId,
        p_invoice_number: invoiceNumber,
        p_request_id: originalRequestId || eventId,
        p_channel_id: channelId,
        p_amount_idr: amount,
        p_payment_proof: paymentProof,
      },
    );

    if (finalError) throw new Error(finalError.message);

    const { error: attemptError } = await supabaseAdmin
      .from("doku_payment_attempts")
      .update({
        status: "paid",
        updated_at: new Date().toISOString(),
      })
      .eq("invoice_number", invoiceNumber);

    if (attemptError) throw new Error(attemptError.message);

    const result = (finalResult || {}) as {
      already_paid?: boolean;
      buyer_id?: string | null;
      seller_id?: string | null;
    };

    if (!result.already_paid) {
      const notifications = [];
      if (result.buyer_id) {
        notifications.push({
          user_id: result.buyer_id,
          type: "payment_success",
          title: "DOKU Payment Confirmed",
          message: `Payment for Order #${orderId} was confirmed and is protected by escrow.`,
          link_url: `/order-success/${orderId}`,
          is_read: false,
        });
      }
      if (result.seller_id) {
        notifications.push({
          user_id: result.seller_id,
          type: "seller_new_paid_order",
          title: "New Paid Order",
          message: `Order #${orderId} was paid through DOKU and is ready for delivery.`,
          link_url: `/orders/${orderId}`,
          is_read: false,
        });
      }

      if (notifications.length) {
        const { error: notificationError } = await supabaseAdmin
          .from("notifications")
          .insert(notifications);
        if (notificationError) {
          console.error("DOKU user notification failed:", notificationError.message);
        }
      }

      await recordTrustedMarketplaceEvent({
        supabaseAdmin,
        eventType: "payment_success",
        orderId,
        userId: result.buyer_id || undefined,
        metadata: {
          payment_method: "doku",
          doku_channel: channelId,
        },
      });
    }

    await finishInboxEvent({
      supabaseAdmin,
      rowId: registration.row.id,
      processingStatus: "processed",
      orderId,
      result: {
        action: result.already_paid
          ? "payment_already_finalized"
          : "payment_finalized",
        transactionStatus,
        invoiceNumber,
        channelId,
        alreadyPaid: Boolean(result.already_paid),
      },
    });

    return isSnapNotification
      ? snapSuccessResponse(
          snapNotification.additionalInfo?.approvalCode ||
            originalRequestId ||
            eventId,
        )
      : NextResponse.json({ ok: true });
  } catch (error) {
    if (supabaseAdmin) {
      await failInboxEvent(supabaseAdmin, inboxRowId, error);
    }

    console.error(
      "DOKU notification processing failed:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: "Unable to process DOKU notification." },
      { status: 500 },
    );
  }
}
