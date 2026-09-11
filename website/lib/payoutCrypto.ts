import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = 1;

export type PayoutAccountPayload = {
  method: string;
  accountName: string;
  accountIdentifier: string;
  bankName: string;
  countryCode: string;
  currency: string;
};

type EncryptedPayoutAccount = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

function getEncryptionKey() {
  const raw = String(
    process.env.PAYOUT_ENCRYPTION_KEY || process.env.DELIVERY_ENCRYPTION_KEY || ""
  ).trim();

  if (!raw) {
    throw new Error(
      "PAYOUT_ENCRYPTION_KEY is missing. Configure a dedicated 32-byte key before adding payout accounts."
    );
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const decoded = Buffer.from(raw, "base64");

  if (decoded.length !== 32) {
    throw new Error(
      "PAYOUT_ENCRYPTION_KEY must be a 32-byte base64 value or 64-character hexadecimal value."
    );
  }

  return decoded;
}

function additionalData(accountId: number, keyVersion: number) {
  return Buffer.from(
    `comeplayers:payout-account:${accountId}:v${keyVersion}`,
    "utf8"
  );
}

export function encryptPayoutAccount(
  accountId: number,
  payload: PayoutAccountPayload
): EncryptedPayoutAccount {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(additionalData(accountId, VERSION));

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

export function decryptPayoutAccount(
  accountId: number,
  encrypted: {
    ciphertext: string;
    iv: string;
    auth_tag: string;
    key_version?: number | null;
  }
): PayoutAccountPayload {
  const keyVersion = Number(encrypted.key_version || VERSION);
  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(encrypted.iv, "base64")
  );

  decipher.setAAD(additionalData(accountId, keyVersion));
  decipher.setAuthTag(Buffer.from(encrypted.auth_tag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");

  const parsed = JSON.parse(plaintext) as Partial<PayoutAccountPayload>;

  return {
    method: String(parsed.method || ""),
    accountName: String(parsed.accountName || ""),
    accountIdentifier: String(parsed.accountIdentifier || ""),
    bankName: String(parsed.bankName || ""),
    countryCode: String(parsed.countryCode || "ID"),
    currency: String(parsed.currency || "IDR"),
  };
}

export function maskPayoutIdentifier(value: string) {
  const normalized = value.trim();

  if (!normalized) return "****";

  if (normalized.includes("@")) {
    const [localPart, domain = ""] = normalized.split("@");
    const visible = localPart.slice(0, Math.min(2, localPart.length));
    return `${visible}${"*".repeat(Math.max(localPart.length - visible.length, 3))}@${domain}`;
  }

  const compact = normalized.replace(/\s+/g, "");
  const last4 = compact.slice(-4);
  return `****${last4}`;
}

export function payoutIdentifierLast4(value: string) {
  const normalized = value.trim().replace(/\s+/g, "");
  return normalized.slice(-4) || "****";
}
