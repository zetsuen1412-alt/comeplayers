import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { chatErrorStatus, requireChatRoomAccess } from "@/lib/chatServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const MAX_SIZE = 10 * 1024 * 1024;

function safeName(value: string) {
  const clean = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100);
  return clean || "attachment";
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const formData = await request.formData();
    const roomId = String(formData.get("roomId") || "").trim();
    const fileValue = formData.get("file");

    if (!roomId) {
      return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
    }
    if (!(fileValue instanceof File)) {
      return NextResponse.json({ error: "Attachment file is required." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(fileValue.type)) {
      return NextResponse.json(
        { error: "Only JPG, PNG, WEBP, and PDF attachments are allowed." },
        { status: 400 }
      );
    }
    if (fileValue.size <= 0 || fileValue.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Attachment must be between 1 byte and 10 MB." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { room } = await requireChatRoomAccess({
      roomId,
      userId: user.id,
      supabaseAdmin,
    });
    if (String(room.status || "active").toLowerCase() !== "active") {
      const locked = new Error("This conversation is currently locked.");
      Object.assign(locked, { status: 403 });
      throw locked;
    }

    const filename = safeName(fileValue.name);
    const storagePath = `${roomId}/${user.id}/${Date.now()}-${randomUUID()}-${filename}`;
    const buffer = await fileValue.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage
      .from("chat-attachments-private")
      .upload(storagePath, buffer, {
        contentType: fileValue.type,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data: attachment, error: insertError } = await supabaseAdmin
      .from("chat_attachments")
      .insert({
        room_id: roomId,
        uploaded_by: user.id,
        file_name: filename,
        storage_path: storagePath,
        mime_type: fileValue.type,
        size_bytes: fileValue.size,
        moderation_status: "approved",
      })
      .select("id,room_id,file_name,mime_type,size_bytes,moderation_status,created_at")
      .single();

    if (insertError) {
      await supabaseAdmin.storage.from("chat-attachments-private").remove([storagePath]);
      throw new Error(insertError.message);
    }

    return NextResponse.json({ ok: true, attachment });
  } catch (error) {
    const status = chatErrorStatus(error);
    console.error("Chat attachment upload failed:", error);
    return NextResponse.json(
      {
        error: safeApiErrorMessage(
          error,
          "Unable to upload the attachment.",
          status,
        ),
      },
      { status },
    );
  }
}
