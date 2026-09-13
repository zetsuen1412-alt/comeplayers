import { Passkey } from "react-native-passkey";
import { hex, random, unhex, type Identity, type PublicIdentity } from "./crypto";
import { openPasskeyRecovery, sealPasskeyRecovery, verifyPasskeyRecovery, type PasskeyRecovery } from "./passkeyRecovery";
import { fromBase64, recoveryCreateOptions, recoveryGetOptions, validateRecoveryAssertion } from "./passkeyProvider";

function available() {
  if (!Passkey.isSupported()) throw new Error("Update your device to use synced passkeys, or use your recovery key.");
}

async function evaluate(credentialId: string, salt: string): Promise<Uint8Array> {
  available();
  const credential = await Passkey.get(recoveryGetOptions(credentialId, unhex(salt)));
  if (credential.id !== credentialId) throw new Error("The selected passkey belongs to another encrypted backup.");
  const value = credential.clientExtensionResults?.prf?.results?.first;
  const secret = typeof value === "string" ? fromBase64(value) : value instanceof ArrayBuffer ? new Uint8Array(value) : value ? new Uint8Array(value) : undefined;
  return validateRecoveryAssertion(fromBase64(credential.response.authenticatorData), secret);
}

export async function createNativePasskeyRecovery(root: Identity): Promise<PasskeyRecovery> {
  available();
  const salt = random(), credential = await Passkey.create(recoveryCreateOptions(root.userId, salt));
  const prf = await evaluate(credential.id, hex(salt));
  try { return sealPasskeyRecovery(root, prf, credential.id, hex(salt)); } finally { prf.fill(0); }
}

export async function unlockNativePasskeyRecovery(value: PasskeyRecovery, root: PublicIdentity): Promise<string> {
  verifyPasskeyRecovery(value, root);
  const prf = await evaluate(value.credentialId, value.salt);
  try { return openPasskeyRecovery(value, prf, root); } finally { prf.fill(0); }
}

export function passkeyError(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  const code = reason && typeof reason === "object" && "error" in reason ? reason.error : "";
  if (code === "UserCancelled") return "Passkey setup was cancelled. Your encrypted data is unchanged.";
  if (code === "NoCredentials") return "Sign in to the password manager that stores your ComePlayers passkey, then try again.";
  return "Passkey recovery is unavailable. Check your password manager and try again, or use your recovery key.";
}
