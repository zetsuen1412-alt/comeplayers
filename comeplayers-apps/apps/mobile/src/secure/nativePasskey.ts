import { Passkey } from "react-native-passkey";
import { hex, random, unhex, type Identity, type PublicIdentity } from "./crypto";
import { openPasskeyRecovery, sealPasskeyRecovery, verifyPasskeyRecovery, type PasskeyRecovery } from "./passkeyRecovery";
import { fromBase64, recoveryCreateOptions, recoveryGetOptions, validateRecoveryAssertion, type RecoveryAccountLabel } from "./passkeyProvider";

// Registration may succeed before the user cancels the following verification.
// Keep only the public credential reference so retry does not create a duplicate.
const pendingCredentials = new WeakMap<Identity, { id: string; salt: string }>();

function available() {
  if (!Passkey.isSupported()) throw new Error("Use an updated device and a password manager that supports synced passkeys for encrypted Messages.");
}
async function evaluate(credentialId: string, salt: string): Promise<Uint8Array> {
  available();
  const credential = await Passkey.get(recoveryGetOptions(credentialId, unhex(salt)));
  if (credential.id !== credentialId) throw new Error("The selected passkey belongs to another encrypted backup.");
  const value = credential.clientExtensionResults?.prf?.results?.first;
  const secret = typeof value === "string" ? fromBase64(value) : value instanceof ArrayBuffer ? new Uint8Array(value) : value ? new Uint8Array(value) : undefined;
  return validateRecoveryAssertion(fromBase64(credential.response.authenticatorData), secret);
}
export async function createNativePasskeyRecovery(root: Identity, account?: RecoveryAccountLabel): Promise<PasskeyRecovery> {
  available();
  let credential = pendingCredentials.get(root);
  if (!credential) {
    const salt = random(), created = await Passkey.create(recoveryCreateOptions(root.userId, salt, account));
    credential = { id: created.id, salt: hex(salt) };
    pendingCredentials.set(root, credential);
  }
  try {
    const prf = await evaluate(credential.id, credential.salt);
    try {
      const recovery = sealPasskeyRecovery(root, prf, credential.id, credential.salt);
      pendingCredentials.delete(root);
      return recovery;
    } finally { prf.fill(0); }
  } catch (reason) {
    if (reason && typeof reason === "object" && "error" in reason && reason.error === "NoCredentials") pendingCredentials.delete(root);
    throw reason;
  }
}
export async function unlockNativePasskeyRecovery(value: PasskeyRecovery, root: PublicIdentity): Promise<string> {
  verifyPasskeyRecovery(value, root);
  const prf = await evaluate(value.credentialId, value.salt);
  try { return openPasskeyRecovery(value, prf, root); } finally { prf.fill(0); }
}
export function passkeyError(reason: unknown): string {
  const code = reason && typeof reason === "object" && "error" in reason ? reason.error : "";
  if (code === "UserCancelled") return "Passkey verification was cancelled. Retry when you are ready; existing account data is unchanged.";
  if (code === "NoCredentials") return "Sign in to the password manager that stores this account's ComePlayers passkey, then try again.";
  if (reason instanceof Error) return reason.message;
  return "Account passkey recovery is unavailable. Check your synced password manager and retry. Messages will not fall back to unencrypted storage.";
}
