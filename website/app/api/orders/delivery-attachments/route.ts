import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createR2UploadUrl,
  deleteR2Object,
  isR2Configured,
} from "@/lib/r2Server";
import {
  r2DeliveryObjectKey,
  r2DeliveryStoragePath,
  safeDeliveryAttachmentName,
  validateDeliveryAttachmentMetadata,
} from "@/lib/orderDeliveryAttachmentPolicy";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

function normalize(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

async function requireDeliverableSellerOrder(input: {
  request: Request;
  orderId: number;
}) {
  const seller = await requireAuthenticatedUser(input.request);
  const supabaseAdmin = createSupabaseAdmin();
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id,seller_id,status,payment_status,escrow_status")
    .eq("id", input.orderId)
    .maybeSingle();

  if (error || !order) {
    const notFound = new Error(error?.message || "Order not found.");
    Object.assign(notFound, { status: 404 });
    throw notFound;
  }

  if (order.seller_id !== seller.id) {
    const forbidden = new Error("Only this order's seller can upload delivery proof.");
    Object.assign(forbidden, { status: 403 });
    throw forbidden;
  }

  const status = normalize(order.status);
  const paymentStatus = normalize(order.payment_status);
  const escrowStatus = normalize(order.escrow_status);

  if (status === "completed" || escrowStatus === "released") {
    const completed = new Error("A completed order can no longer be edited.");
    Object.assign(completed, { status: 409 });
    throw completed;
  }
  if (status === "cancelled" || status === "disputed" || escrowStatus === "disputed") {
    const blocked = new Error("This order cannot accept delivery proof in its current state.");
    Object.assign(blocked, { status: 409 });
    throw blocked;
  }

  const paid = paymentStatus === "paid" || status === "paid" || status === "delivered";
  if (!paid) {
    const unpaid = new Error("Order must be paid before delivery proof can be uploaded.");
    Object.assign(unpaid, { status: 400 });
    throw unpaid;
  }

  return { seller };
}

function errorStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  const message = error instanceof Error ? error.message : "";
  return authErrorStatus(message);
}

export async function POST(request: Request) {
  try {
    if (!isR2Configured()) {
      return NextResponse.json(
        { error: "Cloudflare R2 is not configured for delivery proof uploads." },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      orderId?: number | string;
      kind?: string;
      fileName?: string;
      mimeType?: string;
      sizeBytes?: number;
    };
    const orderId = Number(body.orderId || 0);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
    }

    const metadata = validateDeliveryAttachmentMetadata({
      kind: String(body.kind || ""),
      mimeType: String(body.mimeType || ""),
      sizeBytes: Number(body.sizeBytes || 0),
    });
    const { seller } = await requireDeliverableSellerOrder({ request, orderId });
    const fileName = safeDeliveryAttachmentName(String(body.fileName || "delivery-proof"));
    const objectKey = `orders/${orderId}/delivery/${seller.id}/${Date.now()}-${randomUUID()}-${fileName}`;
    const storagePath = r2DeliveryStoragePath(objectKey);
    const uploadUrl = await createR2UploadUrl({
      objectKey,
      contentType: metadata.mimeType,
      expiresIn: 180,
    });

    return NextResponse.json({
      ok: true,
      upload: {
        url: uploadUrl,
        method: "PUT",
        expiresIn: 180,
        headers: { "Content-Type": metadata.mimeType },
      },
      attachment: {
        kind: metadata.kind,
        fileName,
        storagePath,
        mimeType: metadata.mimeType,
        sizeBytes: metadata.sizeBytes,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare delivery proof upload.";
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      orderId?: number | string;
      storagePath?: string;
    };
    const orderId = Number(body.orderId || 0);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
    }

    const { seller } = await requireDeliverableSellerOrder({ request, orderId });
    const objectKey = r2DeliveryObjectKey(String(body.storagePath || ""));
    const expectedPrefix = `orders/${orderId}/delivery/${seller.id}/`;
    if (!objectKey.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Invalid delivery proof path." }, { status: 403 });
    }

    await deleteR2Object(objectKey);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete delivery proof.";
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}
