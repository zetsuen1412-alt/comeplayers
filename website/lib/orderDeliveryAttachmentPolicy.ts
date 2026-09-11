export type DeliveryAttachmentKind = "screenshot" | "video";

export type DeliveryAttachmentReference = {
  kind: DeliveryAttachmentKind;
  fileName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
};

export type DeliveryAttachmentView = DeliveryAttachmentReference & {
  url?: string | null;
};

export const DELIVERY_SCREENSHOT_MAX_BYTES = 25 * 1024 * 1024;
export const DELIVERY_VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;

const SCREENSHOT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
]);

export function safeDeliveryAttachmentName(value: string) {
  const clean = String(value || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return clean || "delivery-proof";
}

export function r2DeliveryStoragePath(objectKey: string) {
  const key = String(objectKey || "").replace(/^\/+/, "");
  if (!key || key.includes("..")) throw new Error("Invalid delivery proof path.");
  return `r2:${key}`;
}

export function r2DeliveryObjectKey(storagePath: string) {
  const value = String(storagePath || "");
  if (!value.startsWith("r2:")) throw new Error("Invalid delivery proof path.");
  const key = value.slice(3);
  if (!key || key.startsWith("/") || key.includes("..")) {
    throw new Error("Invalid delivery proof path.");
  }
  return key;
}

export function validateDeliveryAttachmentMetadata(input: {
  kind: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const kind = String(input.kind || "").toLowerCase() as DeliveryAttachmentKind;
  const mimeType = String(input.mimeType || "").trim().toLowerCase();
  const sizeBytes = Number(input.sizeBytes || 0);

  if (kind !== "screenshot" && kind !== "video") {
    throw new Error("Delivery proof must be a screenshot or video.");
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error("Delivery proof file is empty or invalid.");
  }

  if (kind === "screenshot") {
    if (!SCREENSHOT_TYPES.has(mimeType)) {
      throw new Error("Screenshots must be JPG, PNG, WEBP, or GIF files.");
    }
    if (sizeBytes > DELIVERY_SCREENSHOT_MAX_BYTES) {
      throw new Error("Each screenshot must be 25 MB or smaller.");
    }
  } else {
    if (!VIDEO_TYPES.has(mimeType)) {
      throw new Error("Videos must be MP4, WEBM, MOV, or MKV files.");
    }
    if (sizeBytes > DELIVERY_VIDEO_MAX_BYTES) {
      throw new Error("Each video must be 2 GB or smaller.");
    }
  }

  return { kind, mimeType, sizeBytes };
}

function startsWithAscii(bytes: Uint8Array, offset: number, text: string) {
  if (bytes.length < offset + text.length) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

export function deliveryAttachmentSignatureMatches(input: {
  bytes: Uint8Array;
  mimeType: string;
}) {
  const bytes = input.bytes;
  const mimeType = String(input.mimeType || "").toLowerCase();

  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mimeType === "image/webp") {
    return startsWithAscii(bytes, 0, "RIFF") && startsWithAscii(bytes, 8, "WEBP");
  }
  if (mimeType === "image/gif") {
    return startsWithAscii(bytes, 0, "GIF87a") || startsWithAscii(bytes, 0, "GIF89a");
  }
  if (mimeType === "video/mp4" || mimeType === "video/quicktime") {
    return startsWithAscii(bytes, 4, "ftyp");
  }
  if (mimeType === "video/webm" || mimeType === "video/x-matroska") {
    return (
      bytes.length >= 4 &&
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    );
  }
  return false;
}

export function normalizeDeliveryAttachmentReferences(
  value: unknown,
): DeliveryAttachmentReference[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: DeliveryAttachmentReference[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const storagePath = String(record.storagePath || "").trim();
    if (!storagePath || seen.has(storagePath)) continue;

    const metadata = validateDeliveryAttachmentMetadata({
      kind: String(record.kind || ""),
      mimeType: String(record.mimeType || ""),
      sizeBytes: Number(record.sizeBytes || 0),
    });

    result.push({
      kind: metadata.kind,
      fileName: safeDeliveryAttachmentName(String(record.fileName || "delivery-proof")),
      storagePath,
      mimeType: metadata.mimeType,
      sizeBytes: metadata.sizeBytes,
    });
    seen.add(storagePath);
  }

  return result;
}
