import { activateVerifiedDevice, prepareFirstDevice, type AccountSnapshot, type RecoveryTransport } from "./account";
import { fingerprint, validateIdentity } from "./crypto";
import { openIdentityBackup, rosterHash, verifyRoster } from "./protocol";
import { openBrowserVault, persistVerifiedBrowserSession } from "./browserVault";
import { assertLocalAccountMatch, parseRecoveryPolicy, recoveryHeaders, type RecoveryPolicy } from "./recoveryPolicy";

type Pending = ReturnType<typeof prepareFirstDevice> & { version: 1; generation: number };
type SealedPending = { key: "pending"; master: CryptoKey; iv: Uint8Array; ciphertext: ArrayBuffer };
const encoder = new TextEncoder();
const flights = new Map<string, Promise<boolean>>();
const path = "/api/messages/secure/account";

function openJournal(userId: string): Promise<IDBDatabase> {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) throw new Error("Browser storage is unavailable. Use a current browser with storage enabled.");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`cp-e2ee-enrollment-v1-${userId}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Browser storage is unavailable."));
    request.onblocked = () => reject(new Error("Close the other ComePlayers tab, then try again."));
  });
}

async function journalRecord(userId: string, candidate?: SealedPending, remove?: SealedPending): Promise<SealedPending | null> {
  const db = await openJournal(userId);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("state", candidate || remove ? "readwrite" : "readonly", { durability: "strict" });
      const store = tx.objectStore("state"), read = store.get("pending");
      let value: SealedPending | null = null;
      read.onsuccess = () => {
        value = read.result || candidate || null;
        if (remove) {
          const current = read.result as SealedPending | undefined;
          // A delayed completion must not delete a newer enrollment journal.
          if (current && new Uint8Array(current.iv).join() === new Uint8Array(remove.iv).join() && new Uint8Array(current.ciphertext).join() === new Uint8Array(remove.ciphertext).join()) store.delete("pending");
        }
        else if (!read.result && candidate) store.put(candidate);
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error("Browser storage is unavailable."));
    });
  } finally { db.close(); }
}

function context(userId: string) { return encoder.encode(JSON.stringify(["cp-browser-enrollment-v1", userId])); }

async function decode(userId: string, record: SealedPending, generation: number): Promise<Pending> {
  if (record.master.extractable || record.master.algorithm.name !== "AES-GCM") throw new Error("The saved chat setup failed verification.");
  const bytes = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv), additionalData: context(userId) }, record.master, record.ciphertext));
  let pending: Pending;
  try { pending = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Pending; } finally { bytes.fill(0); }
  if (pending.version !== 1 || pending.generation !== generation) throw new Error("The recovery policy changed. The saved chat setup was preserved.");
  const { session, recoveryIdentity, backup } = pending.plan;
  validateIdentity(recoveryIdentity, userId); validateIdentity(session.device.identity, userId);
  verifyRoster(session.roster, session.root);
  const own = session.roster.devices.find(device => device.id === session.device.id);
  if (session.root.userId !== userId || session.roster.revision !== 1 || fingerprint(recoveryIdentity) !== fingerprint(session.root) || !own || fingerprint(own.identity) !== fingerprint(session.device.identity) || !backup || !/^[0-9a-f]{64}$/.test(pending.recoveryKey) || fingerprint(openIdentityBackup(backup, pending.recoveryKey, userId, session.root)) !== fingerprint(session.root)) throw new Error("The saved chat setup failed verification.");
  return pending;
}

async function pendingEnrollment(userId: string, generation: number, create: boolean): Promise<Pending | null> {
  let record = await journalRecord(userId);
  if (!record && create) {
    const value: Pending = { version: 1, generation, ...prepareFirstDevice(userId) };
    const master = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12)), plaintext = encoder.encode(JSON.stringify(value));
    let ciphertext: ArrayBuffer;
    try { ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: context(userId) }, master, plaintext); } finally { plaintext.fill(0); }
    // Atomic compare-and-set chooses one identity even across independent tabs.
    record = await journalRecord(userId, { key: "pending", master, iv, ciphertext });
  }
  return record ? decode(userId, record, generation) : null;
}

function matches(account: AccountSnapshot, pending: Pending): boolean {
  const { session } = pending.plan;
  const own = account.roster.devices.find(device => device.id === session.device.id);
  return fingerprint(account.roster.identity) === fingerprint(session.root) && !!own && fingerprint(own.identity) === fingerprint(session.device.identity) && account.roster.revision >= session.roster.revision && (account.roster.revision !== session.roster.revision || account.roster_hash === rosterHash(session.roster));
}

async function clearConfirmedPending(userId: string, pending: Pending) {
  const record = await journalRecord(userId);
  if (!record) return;
  const current = await decode(userId, record, pending.generation);
  if (current.plan.session.device.id === pending.plan.session.device.id && fingerprint(current.plan.session.root) === fingerprint(pending.plan.session.root)) await journalRecord(userId, undefined, record);
}

/** No credential prompt. False means an existing identity requires its original recovery method. */
export function ensureAutomaticBrowserEnrollment(userId: string, policy: RecoveryPolicy, transport: RecoveryTransport, assertUser: () => Promise<unknown>): Promise<boolean> {
  const existing = flights.get(userId);
  if (existing) return existing;
  const run = async () => {
    const read = async () => {
      await assertUser();
      const response = await transport<{ account: AccountSnapshot | null; recovery?: unknown }>(path);
      await assertUser();
      const latest = parseRecoveryPolicy(response.recovery);
      if (latest.generation !== policy.generation) throw new Error("The recovery policy changed. Refresh before continuing.");
      if (!latest.allowDeviceSetup) throw new Error("Automatic chat setup is temporarily unavailable. Please retry later.");
      if (response.account === undefined) throw new Error("Invalid secure account response. Local history was preserved.");
      if (response.account) {
        if (response.account.roster.identity.userId !== userId) throw new Error("The encrypted identity does not match this account.");
        verifyRoster(response.account.roster, response.account.roster.identity);
        if (rosterHash(response.account.roster) !== response.account.roster_hash) throw new Error("The device list failed verification.");
      }
      return response.account;
    };
    let account = await read();
    const vault = await openBrowserVault(userId);
    let pending = await pendingEnrollment(userId, policy.generation, false);
    if (vault) {
      assertLocalAccountMatch(vault.checkpoint.rootFingerprint, account ? fingerprint(account.roster.identity) : null, vault.checkpoint.deviceId, account?.roster.devices.map(device => device.id) ?? []);
      if (pending && vault.checkpoint.rootFingerprint === fingerprint(pending.plan.session.root) && vault.checkpoint.deviceId === pending.plan.session.device.id) {
        await vault.put("local-recovery-key-v1", userId, pending.recoveryKey);
        await clearConfirmedPending(userId, pending);
      }
      return true;
    }
    if (account && (!pending || !matches(account, pending))) return false;
    pending ??= await pendingEnrollment(userId, policy.generation, true);
    if (!pending) throw new Error("The chat setup could not be saved. Please retry.");
    const saved = pending;
    const persist = async (snapshot?: AccountSnapshot) => {
      await assertUser();
      await persistVerifiedBrowserSession(snapshot ? { ...saved.plan.session, roster: snapshot.roster } : saved.plan.session, saved.plan.recoveryIdentity);
      const ready = await openBrowserVault(userId);
      if (!ready) throw new Error("The chat setup could not be opened. Please retry.");
      await ready.put("local-recovery-key-v1", userId, saved.recoveryKey);
      await clearConfirmedPending(userId, saved);
      return true;
    };
    // Recheck after local durable storage: another phone may have enrolled meanwhile.
    account = await read();
    if (account) return matches(account, saved) ? persist(account) : false;
    try {
      await activateVerifiedDevice(saved.plan, async (url, init = {}) => {
        await assertUser();
        return transport(url, { ...init, headers: { ...init.headers, ...recoveryHeaders(policy) } });
      }, async () => { await persist(); });
      return true;
    } catch (error) {
      if ((error as { status?: number })?.status !== 409) throw error;
      account = await read();
      return account && matches(account, saved) ? persist(account) : false;
    }
  };
  const flight = run().finally(() => { if (flights.get(userId) === flight) flights.delete(userId); });
  flights.set(userId, flight);
  return flight;
}

export function retryableBrowserSetup(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status) return status === 408 || status === 425 || status === 429 || status >= 500;
  return /failed to fetch|network|timed? out|took too long|connection (lost|closed)|offline/i.test(error instanceof Error ? error.message : String(error));
}
