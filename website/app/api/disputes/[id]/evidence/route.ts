import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  FINAL_DISPUTE_STATUSES,
  disputeErrorStatus,
  notifyDisputeParty,
  requireDisputeAccess,
} from "@/lib/disputeServer";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

function safeFileName(value: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned.slice(0, 120) || "evidence-file";
}

export async function POST(request: Request, context: RouteContext) {
  let uploadedPath = "";

  try {
    const { id } = await context.params;
    const disputeId = Number(id);

    if (!Number.isInteger(disputeId) || disputeId <= 0) {
      return NextResponse.json({ error: "Invalid dispute ID." }, { status: 400 });
    }

    const access = await requireDisputeAccess(request, disputeId);
    const status = String(access.dispute.status || "open").toLowerCase();

    if (FINAL_DISPUTE_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "This dispute is already resolved and is read-only." },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const caption = String(formData.get("caption") || "").trim().slice(0, 500);

    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        { error: "An evidence file is required." },
        { status: 400 }
      );
    }

    if (fileEntry.size <= 0 || fileEntry.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Evidence file must be between 1 byte and 10 MB." },
        { status: 400 }
      );
    }

    const mimeType = fileEntry.type || "application/octet-stream";
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: "Only JPG, PNG, WEBP, PDF, and TXT evidence files are allowed." },
        { status: 400 }
      );
    }

    const fileName = safeFileName(fileEntry.name);
    uploadedPath = `${disputeId}/${access.user.id}/${Date.now()}-${randomUUID()}-${fileName}`;
    const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());

    const { error: uploadError } = await access.supabaseAdmin.storage
      .from("dispute-evidence")
      .upload(uploadedPath, fileBuffer, {
        contentType: mimeType,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data: evidence, error: evidenceError } = await access.supabaseAdmin
      .from("dispute_evidence")
      .insert({
        dispute_id: disputeId,
        uploaded_by: access.user.id,
        file_name: fileEntry.name.slice(0, 255),
        storage_path: uploadedPath,
        mime_type: mimeType,
        size_bytes: fileEntry.size,
        caption: caption || null,
      })
      .select("id,dispute_id,uploaded_by,file_name,mime_type,size_bytes,caption,created_at")
      .single();

    if (evidenceError) {
      await access.supabaseAdmin.storage
        .from("dispute-evidence")
        .remove([uploadedPath]);
      uploadedPath = "";
      throw new Error(evidenceError.message);
    }

    const nowIso = new Date().toISOString();
    await access.supabaseAdmin
      .from("disputes")
      .update({ last_activity_at: nowIso, updated_at: nowIso })
      .eq("id", disputeId);

    const { error: eventError } = await access.supabaseAdmin
      .from("dispute_events")
      .insert({
        dispute_id: disputeId,
        actor_id: access.user.id,
        event_type: "evidence_uploaded",
        old_status: status,
        new_status: status,
        note: fileEntry.name.slice(0, 255),
        metadata: {
          evidence_id: evidence.id,
          mime_type: mimeType,
          size_bytes: fileEntry.size,
          sender_role: access.role,
        },
      });

    if (eventError) {
      console.error("Dispute evidence event failed:", eventError.message);
    }

    const buyerId = String(access.dispute.buyer_id || "");
    const sellerId = String(access.dispute.seller_id || "");
    const recipients = [buyerId, sellerId].filter(
      (recipient) => recipient && recipient !== access.user.id
    );

    for (const recipient of recipients) {
      await notifyDisputeParty({
        supabaseAdmin: access.supabaseAdmin,
        userId: recipient,
        title: "New Dispute Evidence",
        message: `New evidence was uploaded to dispute #${disputeId}.`,
        disputeId,
      });
    }

    return NextResponse.json({ ok: true, evidence });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected evidence upload error.";
    return NextResponse.json(
      { error: message },
      { status: disputeErrorStatus(error) }
    );
  }
}
