import "server-only";
import crypto from "node:crypto";

function key() {
  const raw = process.env.TAX_RESIDENCY_ENCRYPTION_KEY || "";
  if (!raw) throw new Error("TAX_RESIDENCY_ENCRYPTION_KEY is not configured.");
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptTaxIdentifier(value: string) {
  const normalized = String(value || "").trim();
  if (normalized.length < 4 || normalized.length > 100) throw new Error("Tax identifier is invalid.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    last4: normalized.slice(-4),
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: 1,
  };
}
