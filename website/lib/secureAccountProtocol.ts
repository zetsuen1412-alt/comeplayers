import { inputError } from "./accountApi";
import { hash, uuid, verifySignature } from "./privateMessaging";

// Keep wire canonicalization identical to mobile multiDevice.ts. Interop tests
// sign with the mobile implementation and verify here using Node's crypto.
export type RootPublic = { userId: string; encryptionKey: string; signingKey: string };
export type AuthorizedDevice = { id: string; identity: RootPublic; createdAt: string };
export type SignedRoster = { v: 2; identity: RootPublic; revision: number; previous: string | null; devices: AuthorizedDevice[]; signature: string };
export type RootBackup = { v: 2; id: string; userId: string; rootFingerprint: string; createdAt: string; ciphertext: string; signature: string; passkey?: import("./e2ee/passkeyRecovery").PasskeyRecovery };
const key = /^[0-9a-f]{64}$/;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw inputError("Invalid encryption data.");
  return value as Record<string, unknown>;
}
function hexKey(value: unknown): string {
  if (typeof value !== "string" || !key.test(value)) throw inputError("Invalid public encryption key.");
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || value.length !== 24 || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw inputError("Invalid encryption timestamp.");
  return value;
}
export function rootPublic(value: unknown): RootPublic {
  const identity = record(value);
  return { userId: uuid(identity.userId), encryptionKey: hexKey(identity.encryptionKey), signingKey: hexKey(identity.signingKey) };
}
export function rootFingerprint(root: RootPublic) { return hash(JSON.stringify(["cp-identity-v1", root.userId, root.encryptionKey, root.signingKey])); }
function rosterData(roster: SignedRoster) {
  // jsonb changes property ordering. Always rebuild signed objects explicitly
  // instead of serializing a database row's insertion order.
  return ["cp-account-roster-v2", roster.v, rootPublic(roster.identity), roster.revision, roster.previous,
    roster.devices.map(device => ({ id: device.id, identity: rootPublic(device.identity), createdAt: device.createdAt }))];
}
export function signedRosterHash(roster: SignedRoster) { return hash(JSON.stringify([...rosterData(roster), roster.signature])); }

/** Select only public signed fields. Neither metadata nor private keys enter SQL. */
function parseAccountRoster(value: unknown, userId: string): SignedRoster {
  const raw = record(value), identity = rootPublic(raw.identity);
  if (raw.v !== 2 || identity.userId !== userId || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 || Number(raw.revision) > 2147483647 || !Array.isArray(raw.devices) || raw.devices.length < 1 || raw.devices.length > 8) throw inputError("Invalid authorized device roster.");
  const revision = Number(raw.revision);
  if (revision === 1 ? raw.previous !== null : typeof raw.previous !== "string" || !key.test(raw.previous)) throw inputError("Invalid device authorization chain.");
  const devices = raw.devices.map(value => {
    const device = record(value);
    return { id: uuid(device.id), identity: rootPublic(device.identity), createdAt: timestamp(device.createdAt) };
  });
  const keys = new Set<string>();
  for (let index = 0; index < devices.length; index++) {
    const device = devices[index]!;
    if (device.identity.userId !== userId || (index > 0 && devices[index - 1]!.id >= device.id) || device.identity.encryptionKey === identity.encryptionKey || device.identity.signingKey === identity.signingKey || keys.has(device.identity.encryptionKey) || keys.has(device.identity.signingKey)) throw inputError("Devices must have unique independent keys.");
    keys.add(device.identity.encryptionKey); keys.add(device.identity.signingKey);
  }
  const roster: SignedRoster = { v: 2, identity, revision, previous: raw.previous as string | null, devices, signature: typeof raw.signature === "string" ? raw.signature : "" };
  if (!verifySignature(identity.signingKey, roster.signature, JSON.stringify(rosterData(roster)))) throw inputError("Invalid account authorization signature.", 403);
  return roster;
}

/** Verify a trusted database checkpoint. Its revision chain was checked on write. */
export function verifyStoredAccountRoster(value: unknown, userId: string): SignedRoster {
  return parseAccountRoster(value, userId);
}

export function verifyAccountRoster(value: unknown, userId: string, previous?: SignedRoster): SignedRoster {
  const roster = parseAccountRoster(value, userId), { identity, revision, devices } = roster;
  if (previous) {
    if (rootFingerprint(identity) !== rootFingerprint(previous.identity)) throw inputError("Restore the existing encryption identity before continuing.", 409);
    if (revision === previous.revision) {
      if (signedRosterHash(roster) !== signedRosterHash(previous)) throw inputError("Conflicting device authorization.", 409);
    } else if (revision !== previous.revision + 1 || roster.previous !== signedRosterHash(previous)) throw inputError("Device authorization changed. Fetch its latest revision and try again.", 409);
    for (const device of devices) {
      const old = previous.devices.find(item => item.id === device.id);
      if (old && (rootFingerprint(old.identity) !== rootFingerprint(device.identity) || old.createdAt !== device.createdAt)) throw inputError("A device identifier cannot be reassigned.", 409);
    }
  } else if (revision !== 1) throw inputError("Missing account encryption identity.", 409);
  return roster;
}
export function verifyRootBackup(value: unknown, root: RootPublic): RootBackup {
  const raw = record(value);
  if (raw.v !== 2 || raw.userId !== root.userId || raw.rootFingerprint !== rootFingerprint(root) || typeof raw.ciphertext !== "string" || !/^(?:[0-9a-f]{2}){40,4096}$/.test(raw.ciphertext)) throw inputError("Invalid encrypted key backup.");
  const backup: RootBackup = { v: 2, id: uuid(raw.id), userId: root.userId, rootFingerprint: rootFingerprint(root), createdAt: timestamp(raw.createdAt), ciphertext: raw.ciphertext, signature: typeof raw.signature === "string" ? raw.signature : "" };
  const bytes = JSON.stringify(["cp-root-backup-v2", backup.v, backup.id, backup.userId, backup.rootFingerprint, backup.createdAt, backup.ciphertext]);
  if (!verifySignature(root.signingKey, backup.signature, bytes)) throw inputError("Invalid encrypted backup signature.", 403);
  if (raw.passkey != null) {
    const p = record(raw.passkey), inner = record(p.backup);
    if (p.v !== 1 || p.rpId !== "www.comeplayers.com" || typeof p.credentialId !== "string" || !/^[A-Za-z0-9_-]{16,2048}$/.test(p.credentialId) || typeof p.salt !== "string" || !key.test(p.salt) || inner.passkey != null) throw inputError("Invalid encrypted passkey backup.");
    const b = verifyRootBackup(inner, root);
    const signature = typeof p.signature === "string" ? p.signature : "";
    const data = JSON.stringify(["cp-passkey-recovery-v1", 1, p.rpId, p.credentialId, p.salt, b.v, b.id, b.userId, b.rootFingerprint, b.createdAt, b.ciphertext, b.signature]);
    if (!verifySignature(root.signingKey, signature, data)) throw inputError("Invalid passkey backup signature.", 403);
    backup.passkey = { v: 1, rpId: p.rpId, credentialId: p.credentialId, salt: p.salt, backup: b, signature };
  }
  return backup;
}
export function verifyDeviceRequest(request: Request, body: string, userId: string, devices: AuthorizedDevice[], now = Date.now()): AuthorizedDevice {
  const deviceId = uuid(request.headers.get("x-cp-device")), time = timestamp(request.headers.get("x-cp-time"));
  const nonce = uuid(request.headers.get("x-cp-nonce"));
  const device = devices.find(item => item.id === deviceId), url = new URL(request.url);
  if (!url.pathname.startsWith("/api/messages/secure/") || !device || device.identity.userId !== userId || Math.abs(now - Date.parse(time)) > 300000) throw inputError("Verify this device using your recovery key.", 403);
  const data = JSON.stringify(["cp-device-request-v2", userId, deviceId, time, nonce, request.method.toUpperCase(), url.pathname + url.search, hash(body)]);
  if (!verifySignature(device.identity.signingKey, request.headers.get("x-cp-proof") || "", data)) throw inputError("Invalid device authentication.", 403);
  return device;
}
