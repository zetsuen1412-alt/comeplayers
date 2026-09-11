export const CHAT_STANDARD_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_VIDEO_ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024;
export const CHAT_ATTACHMENT_MAX_BYTES = CHAT_VIDEO_ATTACHMENT_MAX_BYTES;

export const CHAT_ATTACHMENT_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "audio/mp4",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export function isVideoAttachmentMime(value: string) {
  return String(value || "").trim().toLowerCase().startsWith("video/");
}

export function safeAttachmentName(value: string) {
  const clean = String(value || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100);
  return clean || "attachment";
}

export function validateAttachmentMetadata(input: {
  mimeType: string;
  sizeBytes: number;
}) {
  const mimeType = String(input.mimeType || "").trim().toLowerCase();
  const sizeBytes = Number(input.sizeBytes || 0);

  if (!CHAT_ATTACHMENT_ALLOWED_TYPES.has(mimeType)) {
    throw new Error(
      "Only JPG, PNG, WEBP, GIF, PDF, M4A voice notes, MP4, WEBM, and MOV attachments are allowed.",
    );
  }
  const maxBytes = isVideoAttachmentMime(mimeType)
    ? CHAT_VIDEO_ATTACHMENT_MAX_BYTES
    : CHAT_STANDARD_ATTACHMENT_MAX_BYTES;
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
    throw new Error(
      isVideoAttachmentMime(mimeType)
        ? "Video attachment must be between 1 byte and 100 MB."
        : "Attachment must be between 1 byte and 10 MB.",
    );
  }
  return { mimeType, sizeBytes };
}

export function detectAttachmentMime(bytes: Uint8Array) {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 6 &&
    (String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a" ||
      String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a")
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 5 &&
    String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-"
  ) {
    return "application/pdf";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
  ) {
    if (["M4A ", "M4B "].includes(String.fromCharCode(...bytes.slice(8, 12)))) return "audio/mp4";
    return String.fromCharCode(...bytes.slice(8, 12)) === "qt  "
      ? "video/quicktime"
      : "video/mp4";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }
  return null;
}

export function attachmentSignatureMatches(
  bytes: Uint8Array,
  claimedMimeType: string,
) {
  const detected = detectAttachmentMime(bytes);
  // Android AAC recordings use the MP4 container's generic isom/mp42 brands.
  if (claimedMimeType === "audio/mp4" && detected === "video/mp4") {
    const header = Buffer.from(bytes);
    return header.includes(Buffer.from("soun")) && !header.includes(Buffer.from("vide"));
  }
  return detected === String(claimedMimeType || "").toLowerCase();
}

export function isR2StoragePath(storagePath: string) {
  return String(storagePath || "").startsWith("r2:");
}

export function r2ObjectKeyFromStoragePath(storagePath: string) {
  if (!isR2StoragePath(storagePath)) {
    throw new Error("Attachment is not stored in R2.");
  }
  const key = String(storagePath).slice(3);
  if (!key || key.includes("..") || key.startsWith("/")) {
    throw new Error("Invalid R2 object key.");
  }
  return key;
}

export function r2StoragePath(objectKey: string) {
  const key = String(objectKey || "").replace(/^\/+/, "");
  if (!key || key.includes("..")) throw new Error("Invalid R2 object key.");
  return `r2:${key}`;
}
