import { ed25519 } from "@noble/curves/ed25519.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { fingerprint, hex, random, unhex, utf8, type Identity, type PublicIdentity } from "./crypto";
import { openIdentityBackup, sealIdentityBackup, type EncryptedIdentityBackup } from "./protocol";

export const PASSWORD_ITERATIONS = 600_000;
export type PasswordRecovery = {
  v: 1; kdf: "pbkdf2-sha256"; iterations: 600000; salt: string;
  backup: EncryptedIdentityBackup; signature: string;
};
export function passwordRecoveryData(value: PasswordRecovery) {
  const b = value.backup;
  return ["cp-password-recovery-v1", value.v, value.kdf, value.iterations, value.salt,
    b.v, b.id, b.userId, b.rootFingerprint, b.createdAt, b.ciphertext, b.signature];
}
export function verifyPasswordRecovery(value: PasswordRecovery, root: PublicIdentity): void {
  if (!value || value.v !== 1 || value.kdf !== "pbkdf2-sha256" || value.iterations !== PASSWORD_ITERATIONS || !/^[0-9a-f]{64}$/.test(value.salt) ||
    !value.backup || value.backup.passkey || value.backup.password || value.backup.userId !== root.userId || value.backup.rootFingerprint !== fingerprint(root) ||
    !/^[0-9a-f]{128}$/.test(value.signature) || !ed25519.verify(unhex(value.signature), utf8(JSON.stringify(passwordRecoveryData(value))), unhex(root.signingKey), { zip215: false })) throw new Error("The encrypted password backup failed verification.");
}
async function derive(password: string, salt: string, userId: string): Promise<string> {
  // No normalization/truncation. Fixed, signed cost prevents downgrade and hostile costs.
  const bytes = utf8(password);
  if (password.length < 12 || bytes.length > 1024) throw new Error("Gunakan sandi cadangan minimal 12 karakter, maksimal 1.024 byte.");
  const context = utf8(JSON.stringify(["cp-password-backup-key-v1", userId, salt]));
  try {
    const key = await pbkdf2Async(sha256, bytes, context, { c: PASSWORD_ITERATIONS, dkLen: 32, asyncTick: 8 });
    try { return hex(key); } finally { key.fill(0); }
  } finally { bytes.fill(0); }
}
export async function sealPasswordRecovery(root: Identity, password: string): Promise<{ recovery: PasswordRecovery; key: string }> {
  const salt = hex(random()), key = await derive(password, salt, root.userId);
  const recovery: PasswordRecovery = { v: 1, kdf: "pbkdf2-sha256", iterations: PASSWORD_ITERATIONS, salt, backup: sealIdentityBackup(root, key), signature: "" };
  recovery.signature = hex(ed25519.sign(utf8(JSON.stringify(passwordRecoveryData(recovery))), unhex(root.signingSecret)));
  verifyPasswordRecovery(recovery, root);
  openIdentityBackup(recovery.backup, key, root.userId, root);
  return { recovery, key };
}
export async function openPasswordRecovery(value: PasswordRecovery, password: string, root: PublicIdentity): Promise<string> {
  verifyPasswordRecovery(value, root);
  const key = await derive(password, value.salt, root.userId);
  try { openIdentityBackup(value.backup, key, root.userId, root); }
  catch { throw new Error("Sandi cadangan tidak cocok. Coba lagi."); }
  return key;
}
