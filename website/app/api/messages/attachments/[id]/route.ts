import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import {
  attachmentSignatureMatches,
  isR2StoragePath,
  isVideoAttachmentMime,
  r2ObjectKeyFromStoragePath,
} from "@/lib/chatAttachmentPolicy";
import { chatErrorStatus, requireChatRoomAccess } from "@/lib/chatServer";
import { createR2DownloadUrl, inspectR2Object } from "@/lib/r2Server";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ id: string }> };

function withStatus(message: string, status: number) {
  const error = new Error(message);
  Object.assign(error, { status });
  return error;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const attachmentId = Number(id || 0);
    if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
      return NextResponse.json({ error: "Invalid attachment ID." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: attachment, error } = await supabaseAdmin
      .from("chat_attachments")
      .select("id,room_id,file_name,storage_path,mime_type,size_bytes,moderation_status,deleted_at")
      .eq("id", attachmentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!attachment || attachment.deleted_at) {
      throw withStatus("Attachment not found.", 404);
    }

    await requireChatRoomAccess({
      roomId: String(attachment.room_id),
      userId: user.id,
      allowAdmin: true,
      supabaseAdmin,
    });

    if (String(attachment.moderation_status || "approved") === "removed") {
      throw withStatus("Attachment was removed by moderation.", 404);
    }

    const storagePath = String(attachment.storage_path || "");
    const mimeType = String(attachment.mime_type || "").toLowerCase();
    const sizeBytes = Number(attachment.size_bytes || 0);

    if (isR2StoragePath(storagePath)) {
      const objectKey = r2ObjectKeyFromStoragePath(storagePath);
      const inspected = await inspectR2Object(objectKey);
      const contentMatches =
        inspected.contentLength === sizeBytes &&
        inspected.contentType === mimeType &&
        attachmentSignatureMatches(inspected.sample, mimeType);

      if (!contentMatches) {
        await supabaseAdmin
          .from("chat_attachments")
          .update({
            moderation_status: "removed",
            deleted_at: new Date().toISOString(),
          })
          .eq("id", attachmentId);
        throw withStatus("Attachment failed integrity validation.", 404);
      }

      if (String(attachment.moderation_status || "pending") === "pending") {
        await supabaseAdmin
          .from("chat_attachments")
          .update({ moderation_status: "approved" })
          .eq("id", attachmentId);
      }

      const expiresIn = isVideoAttachmentMime(mimeType) ? 1800 : 120;
      const url = await createR2DownloadUrl({
        objectKey,
        fileName: String(attachment.file_name || "attachment"),
        contentType: mimeType,
        expiresIn,
      });

      return NextResponse.json({
        url,
        expiresIn,
        storage: "cloudflare-r2",
        fileName: attachment.file_name,
        mimeType,
        sizeBytes,
      });
    }

    // Compatibility path for attachments created before the R2 migration.
    const storage = "supabase-legacy";
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from("chat-attachments-private")
      .createSignedUrl(storagePath, 120);
    if (signedError || !signed?.signedUrl) {
      throw new Error(signedError?.message || "Could not create attachment link.");
    }

    return NextResponse.json({
      url: signed.signedUrl,
      expiresIn: 120,
      storage,
      fileName: attachment.file_name,
      mimeType,
      sizeBytes,
    });
  } catch (error) {
    const status = chatErrorStatus(error);
    console.error("Chat attachment access failed:", error);
    return NextResponse.json(
      {
        error: safeApiErrorMessage(
          error,
          "Unable to open the attachment.",
          status,
        ),
      },
      { status },
    );
  }
}
