import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import {
  attachmentSignatureMatches,
  isVideoAttachmentMime,
  r2StoragePath,
  safeAttachmentName,
  validateAttachmentMetadata,
} from "@/lib/chatAttachmentPolicy";
import { assertLegacyDirectMessagingAllowed, chatErrorStatus, requireChatRoomAccess } from "@/lib/chatServer";
import {
  createR2UploadUrl,
  deleteR2Object,
  isR2Configured,
  putR2Object,
} from "@/lib/r2Server";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";
import {
  consumeRedisRateLimit,
  safeRedis,
} from "@/lib/upstashRedis";

export const runtime = "nodejs";

function withStatus(message: string, status: number) {
  const error = new Error(message);
  Object.assign(error, { status });
  return error;
}

async function requireActiveRoom(input: {
  roomId: string;
  userId: string;
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
}) {
  const { room } = await requireChatRoomAccess({
    roomId: input.roomId,
    userId: input.userId,
    supabaseAdmin: input.supabaseAdmin,
  });
  if (String(room.status || "active").toLowerCase() !== "active") {
    throw withStatus("This conversation is currently locked.", 403);
  }
  await assertLegacyDirectMessagingAllowed(input.supabaseAdmin, room);
}

async function enforceUploadRateLimit(userId: string) {
  const result = await safeRedis(
    "attachment-upload-rate",
    () =>
      consumeRedisRateLimit({
        scope: "attachment-upload",
        identifier: userId,
        limit: 12,
        windowSeconds: 60,
      }),
    {
      allowed: true,
      count: 0,
      remaining: 12,
      retryAfterSeconds: 0,
    },
  );
  if (!result.allowed) {
    throw withStatus(
      `Too many attachment uploads. Try again in ${result.retryAfterSeconds} seconds.`,
      429,
    );
  }
}

async function preparePresignedUpload(request: Request) {
  const user = await requireAuthenticatedUser(request);
  if (!isR2Configured()) {
    throw withStatus("Cloudflare R2 is not configured.", 503);
  }

  const body = (await request.json().catch(() => ({}))) as {
    roomId?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
  };
  const roomId = String(body.roomId || "").trim();
  if (!roomId) throw withStatus("Room ID is required.", 400);

  let metadata;
  try {
    metadata = validateAttachmentMetadata({
      mimeType: String(body.mimeType || ""),
      sizeBytes: Number(body.sizeBytes || 0),
    });
  } catch (error) {
    throw withStatus(
      error instanceof Error ? error.message : "Invalid attachment.",
      400,
    );
  }

  const supabaseAdmin = createSupabaseAdmin();
  await requireActiveRoom({ roomId, userId: user.id, supabaseAdmin });
  await enforceUploadRateLimit(user.id);

  const filename = safeAttachmentName(String(body.fileName || ""));
  const objectKey = `chat/${roomId}/${user.id}/${Date.now()}-${randomUUID()}-${filename}`;
  const storagePath = r2StoragePath(objectKey);

  const { data: attachment, error: insertError } = await supabaseAdmin
    .from("chat_attachments")
    .insert({
      room_id: roomId,
      uploaded_by: user.id,
      file_name: filename,
      storage_path: storagePath,
      mime_type: metadata.mimeType,
      size_bytes: metadata.sizeBytes,
      moderation_status: "pending",
    })
    .select("id,room_id,file_name,mime_type,size_bytes,moderation_status,created_at")
    .single();
  if (insertError) throw new Error(insertError.message);

  try {
    const uploadUrl = await createR2UploadUrl({
      objectKey,
      contentType: metadata.mimeType,
      expiresIn: isVideoAttachmentMime(metadata.mimeType) ? 600 : 300,
    });
    return NextResponse.json({
      ok: true,
      upload: {
        url: uploadUrl,
        method: "PUT",
        expiresIn: isVideoAttachmentMime(metadata.mimeType) ? 600 : 300,
        headers: {
          "Content-Type": metadata.mimeType,
        },
      },
      attachment,
    });
  } catch (error) {
    await supabaseAdmin.from("chat_attachments").delete().eq("id", attachment.id);
    throw error;
  }
}

async function legacyMultipartUpload(request: Request) {
  const user = await requireAuthenticatedUser(request);
  if (!isR2Configured()) {
    throw withStatus("Cloudflare R2 is not configured.", 503);
  }

  const formData = await request.formData();
  const roomId = String(formData.get("roomId") || "").trim();
  const fileValue = formData.get("file");
  if (!roomId) throw withStatus("Room ID is required.", 400);
  if (!(fileValue instanceof File)) {
    throw withStatus("Attachment file is required.", 400);
  }

  let metadata;
  try {
    metadata = validateAttachmentMetadata({
      mimeType: fileValue.type,
      sizeBytes: fileValue.size,
    });
  } catch (error) {
    throw withStatus(
      error instanceof Error ? error.message : "Invalid attachment.",
      400,
    );
  }

  const supabaseAdmin = createSupabaseAdmin();
  await requireActiveRoom({ roomId, userId: user.id, supabaseAdmin });
  await enforceUploadRateLimit(user.id);

  const bytes = new Uint8Array(await fileValue.arrayBuffer());
  if (!attachmentSignatureMatches(bytes.slice(0, 16), metadata.mimeType)) {
    throw withStatus("The file contents do not match its declared type.", 400);
  }

  const filename = safeAttachmentName(fileValue.name);
  const objectKey = `chat/${roomId}/${user.id}/${Date.now()}-${randomUUID()}-${filename}`;
  await putR2Object({
    objectKey,
    contentType: metadata.mimeType,
    body: bytes,
  });

  const { data: attachment, error: insertError } = await supabaseAdmin
    .from("chat_attachments")
    .insert({
      room_id: roomId,
      uploaded_by: user.id,
      file_name: filename,
      storage_path: r2StoragePath(objectKey),
      mime_type: metadata.mimeType,
      size_bytes: metadata.sizeBytes,
      moderation_status: "approved",
    })
    .select("id,room_id,file_name,mime_type,size_bytes,moderation_status,created_at")
    .single();

  if (insertError) {
    await deleteR2Object(objectKey).catch(() => undefined);
    throw new Error(insertError.message);
  }
  return NextResponse.json({ ok: true, attachment });
}

export async function POST(request: Request) {
  try {
    const contentType = String(request.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("multipart/form-data")) {
      return await legacyMultipartUpload(request);
    }
    return await preparePresignedUpload(request);
  } catch (error) {
    const status = chatErrorStatus(error);
    console.error("Chat attachment upload preparation failed:", error);
    return NextResponse.json(
      {
        error: safeApiErrorMessage(
          error,
          "Unable to prepare the attachment upload.",
          status,
        ),
      },
      { status },
    );
  }
}
