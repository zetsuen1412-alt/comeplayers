import * as SecureStore from "expo-secure-store";
import { digest, fingerprint, newId, utf8, validateIdentity } from "./crypto";
import { openIdentityBackup, rosterHash, verifyRoster } from "./multiDevice";
import type { EnrollmentPlan } from "./accountRecovery";
import { recoveryGenerationKey } from "./recoveryPolicy";

export type PendingEnrollment = { version: 1; generation: number; recoveryKey: string; plan: EnrollmentPlan };
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const CHUNK = 1800, MAX_CHUNKS = 32;
const key = (userId: string) => `${recoveryGenerationKey(userId)}.enrollment`;
type Manifest = { version: 1; id: string; chunks: number; hash: string };

function manifest(raw: string): Manifest {
  const m = JSON.parse(raw) as Manifest;
  if (m.version !== 1 || !/^[0-9a-f-]{36}$/.test(m.id) || !Number.isInteger(m.chunks) || m.chunks < 1 || m.chunks > MAX_CHUNKS || !/^[0-9a-f]{64}$/.test(m.hash)) throw new Error("Invalid local chat setup checkpoint. Local keys were preserved.");
  return m;
}

export function validatePendingEnrollment(value: PendingEnrollment, userId: string): void {
  if (value.version !== 1 || !Number.isSafeInteger(value.generation) || value.generation < 0 || !/^[0-9a-f]{64}$/.test(value.recoveryKey)) throw new Error("Invalid local chat setup checkpoint.");
  const { session, recoveryIdentity, backup } = value.plan;
  if (session.version !== 2 || session.root.userId !== userId || session.roster.revision !== 1 || !backup) throw new Error("Invalid first-device setup checkpoint.");
  validateIdentity(recoveryIdentity, userId); validateIdentity(session.device.identity, userId);
  verifyRoster(session.roster, session.root);
  if (fingerprint(recoveryIdentity) !== fingerprint(session.root) || fingerprint(openIdentityBackup(backup, value.recoveryKey, userId, session.root)) !== fingerprint(session.root) || !session.roster.devices.some(device => device.id === session.device.id && fingerprint(device.identity) === fingerprint(session.device.identity))) throw new Error("The saved chat keys do not match this account.");
}

export async function readPendingEnrollment(userId: string): Promise<PendingEnrollment | null> {
  const base = key(userId), raw = await SecureStore.getItemAsync(base, options);
  if (!raw) return null;
  const m = manifest(raw);
  let text = "";
  for (let i = 0; i < m.chunks; i++) {
    const chunk = await SecureStore.getItemAsync(`${base}.${m.id}.${i}`, options);
    if (!chunk) throw new Error("Chat setup storage is incomplete. Local keys were preserved.");
    text += chunk;
  }
  if (digest(utf8(text)) !== m.hash) throw new Error("Chat setup storage failed verification.");
  const value = JSON.parse(text) as PendingEnrollment;
  validatePendingEnrollment(value, userId);
  return value;
}

/** Commit protected chunks before any network enrollment. No plaintext disk file. */
export async function savePendingEnrollment(userId: string, value: PendingEnrollment): Promise<void> {
  validatePendingEnrollment(value, userId);
  const existing = await readPendingEnrollment(userId);
  if (existing) {
    if (existing.generation !== value.generation || rosterHash(existing.plan.session.roster) !== rosterHash(value.plan.session.roster)) throw new Error("An earlier chat setup is still pending. Local keys were preserved.");
    return;
  }
  const text = JSON.stringify(value), base = key(userId), id = newId(), chunks = Math.ceil(text.length / CHUNK);
  if (chunks > MAX_CHUNKS) throw new Error("Chat setup checkpoint is too large.");
  for (let i = 0; i < chunks; i++) await SecureStore.setItemAsync(`${base}.${id}.${i}`, text.slice(i * CHUNK, (i + 1) * CHUNK), options);
  await SecureStore.setItemAsync(base, JSON.stringify({ version: 1, id, chunks, hash: digest(utf8(text)) }), options);
  // Native write failures must be detected before sending the public roster.
  await readPendingEnrollment(userId);
}

export async function clearPendingEnrollment(userId: string): Promise<void> {
  const base = key(userId), raw = await SecureStore.getItemAsync(base, options);
  if (!raw) return;
  const m = manifest(raw);
  // Only called after the verified vault is durable. Remove the pointer first.
  await SecureStore.deleteItemAsync(base, options);
  for (let i = 0; i < m.chunks; i++) await SecureStore.deleteItemAsync(`${base}.${m.id}.${i}`, options);
}
