import { NextResponse } from "next/server";
import { encryptDelivery } from "@/lib/deliveryCrypto";
import {
  deliveryAttachmentSignatureMatches,
  normalizeDeliveryAttachmentReferences,
  r2DeliveryObjectKey,
  type DeliveryAttachmentReference,
} from "@/lib/orderDeliveryAttachmentPolicy";
import { inspectR2Object } from "@/lib/r2Server";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

function normalize(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

async function validateStoredDeliveryAttachments(input: {
  orderId: number;
  sellerId: string;
  attachments: DeliveryAttachmentReference[];
}) {
  const hasScreenshot = input.attachments.some((item) => item.kind === "screenshot");
  const hasVideo = input.attachments.some((item) => item.kind === "video");

  if (!hasScreenshot || !hasVideo) {
    throw new Error(
      "At least one screenshot and one video are required before delivering the order."
    );
  }

  const expectedPrefix = `orders/${input.orderId}/delivery/${input.sellerId}/`;
  const verified: DeliveryAttachmentReference[] = [];
  const batchSize = 6;

  for (let index = 0; index < input.attachments.length; index += batchSize) {
    const batch = input.attachments.slice(index, index + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (attachment) => {
        const objectKey = r2DeliveryObjectKey(attachment.storagePath);
        if (!objectKey.startsWith(expectedPrefix)) {
          throw new Error("One of the delivery proof files does not belong to this order.");
        }

        const inspected = await inspectR2Object(objectKey);
        if (inspected.contentLength !== attachment.sizeBytes) {
          throw new Error(`Delivery proof size mismatch: ${attachment.fileName}.`);
        }
        if (inspected.contentType !== attachment.mimeType) {
          throw new Error(`Delivery proof type mismatch: ${attachment.fileName}.`);
        }
        if (
          !deliveryAttachmentSignatureMatches({
            bytes: inspected.sample,
            mimeType: attachment.mimeType,
          })
        ) {
          throw new Error(`Delivery proof content is invalid: ${attachment.fileName}.`);
        }

        return attachment;
      })
    );
    verified.push(...batchResults);
  }

  return verified;
}

export async function POST(request: Request) {
  try {
    const seller = await requireAuthenticatedUser(request);
    const body = (await request.json()) as {
      orderId?: number | string;
      deliveryMessage?: string;
      deliveryCredentials?: string;
      attachments?: unknown;
    };

    const orderId = Number(body.orderId || 0);
    const deliveryMessage = String(body.deliveryMessage || "").trim();
    const deliveryCredentials = String(body.deliveryCredentials || "").trim();
    const attachments = normalizeDeliveryAttachmentReferences(body.attachments);

    if (!Number.isFinite(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
    }

    if (deliveryMessage.length > 5000 || deliveryCredentials.length > 12000) {
      return NextResponse.json(
        { error: "Delivery details are too long." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id,buyer_id,seller_id,status,payment_status,escrow_status,product_title,product,delivered_at"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { error: orderError?.message || "Order not found." },
        { status: 404 }
      );
    }

    if (order.seller_id !== seller.id) {
      return NextResponse.json(
        { error: "Only this order's seller can deliver it." },
        { status: 403 }
      );
    }

    const status = normalize(order.status);
    const paymentStatus = normalize(order.payment_status);
    const escrowStatus = normalize(order.escrow_status);

    if (status === "completed" || escrowStatus === "released") {
      return NextResponse.json(
        { error: "A completed order can no longer be edited." },
        { status: 409 }
      );
    }

    if (
      status === "cancelled" ||
      status === "disputed" ||
      escrowStatus === "disputed"
    ) {
      return NextResponse.json(
        { error: "This order cannot be delivered in its current state." },
        { status: 409 }
      );
    }

    const paid =
      paymentStatus === "paid" || status === "paid" || status === "delivered";

    if (!paid) {
      return NextResponse.json(
        { error: "Order must be paid before delivery." },
        { status: 400 }
      );
    }

    const verifiedAttachments = await validateStoredDeliveryAttachments({
      orderId,
      sellerId: seller.id,
      attachments,
    });

    const screenshotCount = verifiedAttachments.filter(
      (attachment) => attachment.kind === "screenshot"
    ).length;
    const videoCount = verifiedAttachments.filter(
      (attachment) => attachment.kind === "video"
    ).length;
    const effectiveDeliveryMessage =
      deliveryMessage ||
      `Seller submitted completion proof with ${screenshotCount} screenshot${
        screenshotCount === 1 ? "" : "s"
      } and ${videoCount} video${
        videoCount === 1 ? "" : "s"
      }. Review the attached proof before confirming receipt.`;

    const encrypted = encryptDelivery(orderId, {
      message: effectiveDeliveryMessage,
      credentials: deliveryCredentials,
      attachments: verifiedAttachments,
    });

    const { data: deliveryResult, error: deliveryError } = await supabaseAdmin.rpc(
      "cp_store_encrypted_delivery",
      {
        p_order_id: orderId,
        p_seller_id: seller.id,
        p_ciphertext: encrypted.ciphertext,
        p_iv: encrypted.iv,
        p_auth_tag: encrypted.authTag,
        p_key_version: encrypted.keyVersion,
      }
    );

    if (deliveryError) {
      throw new Error(deliveryError.message);
    }

    const result = (deliveryResult || {}) as {
      buyer_id?: string | null;
      product_title?: string | null;
      first_delivery?: boolean;
      [key: string]: unknown;
    };

    if (result.first_delivery && result.buyer_id) {
      const { error: notificationError } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: result.buyer_id,
          type: "order_delivered",
          title: `Order #${orderId} Delivered`,
          message: `The seller delivered ${
            result.product_title || "your digital product"
          } with screenshot and video proof. Review the delivery before confirming receipt.`,
          link_url: `/orders/${orderId}`,
          is_read: false,
        });

      if (notificationError) {
        console.error(
          "Order delivery notification failed:",
          notificationError.message
        );
      }
    }

    return NextResponse.json({
      ok: true,
      order: result,
      deliveryEncrypted: true,
      attachmentCount: verifiedAttachments.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected order delivery error.";

    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(message) }
    );
  }
}
