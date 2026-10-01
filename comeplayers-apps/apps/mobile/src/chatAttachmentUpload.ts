import { File } from "expo-file-system";
import type { ChatAttachment } from "@comeplayers/chat-core";
import { request } from "./api";
import { chatClient } from "./runtime";

type MobileAttachment = { uri: string; name: string; type: string; size?: number };
const STANDARD_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 100 * 1024 * 1024;

export async function uploadChatAttachment(roomId: string, file: MobileAttachment, onProgress?: (percent: number) => void): Promise<ChatAttachment> {
  const source = new File(file.uri);
  const size = source.size;
  const video = file.type.startsWith("video/");
  const max = video ? VIDEO_MAX : STANDARD_MAX;
  if (!size || size > max) throw new Error(video ? "Pilih video berukuran maksimal 100 MB." : "Pilih lampiran berukuran maksimal 10 MB.");

  // Small files keep the existing single-request path. Videos and larger
  // attachments go directly to R2 through the native uploader, without a
  // large multipart body or JavaScript ArrayBuffer on the Next.js server.
  if (!video && size < 4 * 1024 * 1024) return chatClient.uploadAttachment(roomId, file);

  const prepared = await request<{ attachment: ChatAttachment; upload: { url: string; headers: Record<string, string> } }>(
    "/api/messages/attachments",
    { method: "POST", body: JSON.stringify({ roomId, fileName: file.name, mimeType: file.type, sizeBytes: size }) },
    true,
  );
  if (!Number.isSafeInteger(prepared.attachment?.id) || prepared.attachment.id <= 0 || !prepared.upload?.url?.startsWith("https://")) throw new Error("Unggahan belum bisa disiapkan.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9 * 60_000);
  let result: Awaited<ReturnType<File["upload"]>>;
  try {
    result = await source.upload(prepared.upload.url, {
      httpMethod: "PUT", mimeType: file.type, headers: prepared.upload.headers,
      signal: controller.signal,
      onProgress: ({ bytesSent, totalBytes }) => { if (totalBytes > 0) onProgress?.(Math.min(99, Math.floor(bytesSent / totalBytes * 100))); },
    });
  } catch (reason) {
    if (controller.signal.aborted) throw new Error("Unggahan terlalu lama. Periksa koneksi internet, lalu coba lagi.");
    throw reason;
  } finally { clearTimeout(timer); }
  if (result.status < 200 || result.status >= 300) throw new Error("Video atau lampiran belum berhasil diunggah. Coba lagi.");

  // This endpoint checks R2 size, MIME and file signature before approving
  // the attachment. Never publish a message that points to a pending upload.
  const verified = await request<{ sizeBytes: number; mimeType: string }>(`/api/messages/attachments/${prepared.attachment.id}`, {}, true);
  if (verified.sizeBytes !== size || verified.mimeType !== file.type.toLowerCase()) throw new Error("Unggahan belum lolos pemeriksaan. Coba lagi.");
  return { ...prepared.attachment, moderation_status: "approved" };
}
