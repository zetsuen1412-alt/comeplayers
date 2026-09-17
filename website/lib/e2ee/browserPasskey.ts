import { hex, random, unhex, type Identity, type PublicIdentity } from "./crypto";
import { openPasskeyRecovery, sealPasskeyRecovery, verifyPasskeyRecovery, type PasskeyRecovery } from "./passkeyRecovery";
import { fromBase64, recoveryCreateOptions, recoveryGetOptions, validateRecoveryAssertion } from "./passkeyProvider";

function available() {
  if (!window.isSecureContext || !navigator.credentials || typeof PublicKeyCredential === "undefined") {
    throw new Error("Open ComePlayers in an updated browser with synced passkey support. On desktop, use the same account and password manager in a supported browser if the embedded view cannot open your passkey.");
  }
}

async function evaluate(credentialId: string, salt: string): Promise<Uint8Array> {
  available();
  const options = recoveryGetOptions(credentialId, unhex(salt));
  const credential = await navigator.credentials.get({ publicKey: {
    ...options, challenge: fromBase64(options.challenge).buffer as ArrayBuffer,
    allowCredentials: [{ id: fromBase64(credentialId).buffer as ArrayBuffer, type: "public-key" }],
    extensions: { prf: { eval: { first: unhex(salt).buffer as ArrayBuffer } } },
  } }) as PublicKeyCredential | null;
  if (!credential || credential.id !== credentialId) throw new Error("Passkey recovery was cancelled.");
  const output = credential.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  const secret = output.prf?.results?.first;
  return validateRecoveryAssertion(new Uint8Array((credential.response as AuthenticatorAssertionResponse).authenticatorData), secret ? new Uint8Array(secret) : undefined);
}

export async function createBrowserPasskeyRecovery(root: Identity): Promise<PasskeyRecovery> {
  available();
  const salt = random(), options = recoveryCreateOptions(root.userId, salt);
  const credential = await navigator.credentials.create({ publicKey: {
    ...options, challenge: fromBase64(options.challenge).buffer as ArrayBuffer,
    user: { ...options.user, id: fromBase64(options.user.id).buffer as ArrayBuffer },
    extensions: { prf: { eval: { first: salt.buffer as ArrayBuffer } } },
  } }) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey setup was cancelled.");
  const prf = await evaluate(credential.id, hex(salt));
  try { return sealPasskeyRecovery(root, prf, credential.id, hex(salt)); } finally { prf.fill(0); }
}

export async function unlockBrowserPasskeyRecovery(value: PasskeyRecovery, root: PublicIdentity): Promise<string> {
  verifyPasskeyRecovery(value, root);
  const prf = await evaluate(value.credentialId, value.salt);
  try { return openPasskeyRecovery(value, prf, root); } finally { prf.fill(0); }
}
