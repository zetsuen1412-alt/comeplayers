import { verifyPasswordRecovery } from "./passwordRecovery";
import { ed25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { fingerprint, hex, unhex, utf8, type Identity, type PublicIdentity } from "./crypto";
import { openIdentityBackup, sealIdentityBackup, type EncryptedIdentityBackup } from "./multiDevice";

export const RECOVERY_RP_ID = "www.comeplayers.com";
export type PasskeyRecovery = {
  v: 1; rpId: string; credentialId: string; salt: string;
  backup: EncryptedIdentityBackup; signature: string;
};

export function passkeyRecoveryData(value: PasskeyRecovery) {
  const b = value.backup;
  return ["cp-passkey-recovery-v1", value.v, value.rpId, value.credentialId, value.salt,
    b.v, b.id, b.userId, b.rootFingerprint, b.createdAt, b.ciphertext, b.signature];
}

export function verifyPasskeyRecovery(value: PasskeyRecovery, root: PublicIdentity): void {
  if (!value || value.v !== 1 || value.rpId !== RECOVERY_RP_ID ||
      !/^[A-Za-z0-9_-]{16,2048}$/.test(value.credentialId) || !/^[0-9a-f]{64}$/.test(value.salt) ||
      !value.backup || value.backup.passkey || value.backup.password || value.backup.userId !== root.userId ||
      value.backup.rootFingerprint !== fingerprint(root) || !/^[0-9a-f]{128}$/.test(value.signature) ||
      !ed25519.verify(unhex(value.signature), utf8(JSON.stringify(passkeyRecoveryData(value))), unhex(root.signingKey), { zip215: false })) {
    throw new Error("The encrypted passkey backup failed verification.");
  }
}

/** The PRF output is local key material, never an authentication token or server field. */
export function passkeyRecoveryKey(prf: Uint8Array, userId: string, credentialId: string, salt: string): string {
  if (prf.length !== 32 || !/^[0-9a-f]{64}$/.test(salt) || !/^[A-Za-z0-9_-]{16,2048}$/.test(credentialId)) {
    throw new Error("This passkey cannot protect encrypted Messages. Choose a passkey with encryption support.");
  }
  const key = hkdf(sha256, prf, unhex(salt), utf8(JSON.stringify(["cp-passkey-recovery-key-v1", RECOVERY_RP_ID, userId, credentialId])), 32);
  try { return hex(key); } finally { key.fill(0); }
}

export function sealPasskeyRecovery(root: Identity, prf: Uint8Array, credentialId: string, salt: string): PasskeyRecovery {
  const key = passkeyRecoveryKey(prf, root.userId, credentialId, salt);
  const value: PasskeyRecovery = { v: 1, rpId: RECOVERY_RP_ID, credentialId, salt,
    backup: sealIdentityBackup(root, key), signature: "" };
  value.signature = hex(ed25519.sign(utf8(JSON.stringify(passkeyRecoveryData(value))), unhex(root.signingSecret)));
  verifyPasskeyRecovery(value, root);
  openIdentityBackup(value.backup, key, root.userId, root);
  return value;
}

export function openPasskeyRecovery(value: PasskeyRecovery, prf: Uint8Array, root: PublicIdentity): string {
  verifyPasskeyRecovery(value, root);
  const key = passkeyRecoveryKey(prf, root.userId, value.credentialId, value.salt);
  openIdentityBackup(value.backup, key, root.userId, root);
  return key;
}

/** Archives may use the original recovery key or the key derived from the account passkey. */
export function openAccountBackup(backup: EncryptedIdentityBackup, key: string, root: PublicIdentity): Identity {
  try { return openIdentityBackup(backup, key, root.userId, root); }
  catch {
    if (backup.password) {
      verifyPasswordRecovery(backup.password, root);
      try { return openIdentityBackup(backup.password.backup, key, root.userId, root); } catch { /* Try a retained passkey archive next. */ }
    }
    if (backup.passkey) {
      verifyPasskeyRecovery(backup.passkey, root);
      return openIdentityBackup(backup.passkey.backup, key, root.userId, root);
    }
    throw new Error("The recovery key does not match this account.");
  }
}
