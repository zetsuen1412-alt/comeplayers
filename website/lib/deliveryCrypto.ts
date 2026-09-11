import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import type { DeliveryAttachmentReference } from "@/lib/orderDeliveryAttachmentPolicy";

const ALGORITHM = "aes-256-gcm";
const VERSION = 1;

export type DeliveryPayload = {
  message: string;
  credentials: string;
  attachments?: DeliveryAttachmentReference[];
};

type EncryptedDelivery = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

function getEncryptionKey() {
  const raw = String(process.env.DELIVERY_ENCRYPTION_KEY || "").trim();

  if (!raw) {
    throw new Error("DELIVERY_ENCRYPTION_KEY is missing.");
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const decoded = Buffer.from(raw, "base64");

  if (decoded.length !== 32) {
    throw new Error(
      "DELIVERY_ENCRYPTION_KEY must be a 32-byte base64 value or 64-character hexadecimal value."
    );
  }

  return decoded;
}

function additionalData(orderId: number, keyVersion: number) {
  return Buffer.from(`comeplayers:order:${orderId}:delivery:v${keyVersion}`, "utf8");
}

export function encryptDelivery(
  orderId: number,
  payload: DeliveryPayload
): EncryptedDelivery {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(additionalData(orderId, VERSION));

  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: VERSION,
  };
}

export function decryptDelivery(
  orderId: number,
  encrypted: {
    ciphertext: string;
    iv: string;
    auth_tag: string;
    key_version?: number | null;
  }
): DeliveryPayload {
  const keyVersion = Number(encrypted.key_version || VERSION);
  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(encrypted.iv, "base64")
  );

  decipher.setAAD(additionalData(orderId, keyVersion));
  decipher.setAuthTag(Buffer.from(encrypted.auth_tag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");

  const parsed = JSON.parse(plaintext) as Partial<DeliveryPayload>;

  return {
    message: String(parsed.message || ""),
    credentials: String(parsed.credentials || ""),
    attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
  };
}
