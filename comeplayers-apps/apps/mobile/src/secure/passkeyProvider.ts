import { sha256 } from "@noble/hashes/sha2.js";
import { hex, random, utf8 } from "./crypto";
import { RECOVERY_RP_ID } from "./passkeyRecovery";

export const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export function fromBase64(value: string): Uint8Array {
  if (typeof value !== "string" || value.length > 8192 || !/^[A-Za-z0-9_+/-]*={0,2}$/.test(value)) throw new Error("Invalid passkey response.");
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}

export function recoveryCreateOptions(userId: string, salt: Uint8Array) {
  return { challenge: base64url(random()), rp: { id: RECOVERY_RP_ID, name: "ComePlayers" },
    user: { id: base64url(utf8(userId)), name: userId, displayName: "ComePlayers encrypted Messages" },
    pubKeyCredParams: [{ type: "public-key" as const, alg: -7 }, { type: "public-key" as const, alg: -257 }],
    authenticatorSelection: { residentKey: "required" as const, userVerification: "required" as const },
    attestation: "none" as const, timeout: 120000, extensions: { prf: { eval: { first: base64url(salt) } } } };
}

export function recoveryGetOptions(credentialId: string, salt: Uint8Array) {
  return { challenge: base64url(random()), rpId: RECOVERY_RP_ID,
    allowCredentials: [{ id: credentialId, type: "public-key" as const }],
    userVerification: "required" as const, timeout: 120000, extensions: { prf: { eval: { first: base64url(salt) } } } };
}

/** Require actual user verification and an already backed-up passkey, not just sync eligibility. */
export function validateRecoveryAssertion(authenticatorData: Uint8Array, prf: Uint8Array | undefined): Uint8Array {
  if (authenticatorData.length < 37 || hex(authenticatorData.slice(0, 32)) !== hex(sha256(utf8(RECOVERY_RP_ID))) ||
      (authenticatorData[32]! & 0x1d) !== 0x1d) {
    throw new Error("Choose a synced passkey and verify with your device PIN or fingerprint. Enable sync in your password manager first.");
  }
  if (!prf || prf.length !== 32) throw new Error("This passkey does not support encrypted recovery. Choose another provider or use your recovery key.");
  return prf;
}
