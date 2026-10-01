import { fingerprint, newId, validateIdentity, type Identity } from "./crypto";
import {
  rosterHash,
  verifyRoster,
  type DeviceSecrets,
} from "./protocol";
import type { VerifiedSession } from "./account";

const DB_VERSION = 1;
const META = "meta";
const RECORDS = "records";
const MASTER_KEY = "master-key";
const CHECKPOINT = "checkpoint";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

type VaultCheckpoint = {
  version: 2;
  vaultId: string;
  userId: string;
  rootFingerprint: string;
  deviceId: string;
  deviceFingerprint: string;
  rosterRevision: number;
  rosterHash: string;
  createdAt: string;
};

type StoredMeta = { key: string; value: unknown };
type StoredRecord = {
  key: string;
  kind: string;
  id: string;
  room: string;
  sort: string;
  format: "json" | "binary";
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
};

export type BrowserVaultRow<T = unknown> = {
  kind: string;
  id: string;
  room: string;
  sort: string;
  value: T;
};

function vaultName(userId: string) {
  return `cp-e2ee-v2-${userId}`;
}

function recordKey(kind: string, id: string) {
  return `${kind}:${id}`;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error || new Error("Encrypted vault request failed."));
  });
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("Encrypted vault transaction was cancelled."));
    transaction.onerror = () => reject(transaction.error || new Error("Encrypted vault transaction failed."));
  });
}

function openDatabase(userId: string): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) {
    throw new Error("This browser cannot store end-to-end encrypted history securely.");
  }
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(vaultName(userId), DB_VERSION);
    opening.onupgradeneeded = () => {
      const database = opening.result;
      if (!database.objectStoreNames.contains(META)) {
        database.createObjectStore(META, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(RECORDS)) {
        const records = database.createObjectStore(RECORDS, { keyPath: "key" });
        records.createIndex("room-sort", ["kind", "room", "sort", "id"], { unique: false });
      }
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error || new Error("Encrypted vault could not be opened."));
    opening.onblocked = () => reject(new Error("Close the other ComePlayers tab, then try again."));
  });
}

async function readMeta<T>(database: IDBDatabase, key: string): Promise<T | null> {
  const transaction = database.transaction(META, "readonly");
  const item = (await request(transaction.objectStore(META).get(key))) as StoredMeta | undefined;
  await completed(transaction);
  return (item?.value as T | undefined) ?? null;
}

async function getOrCreateMasterKey(database: IDBDatabase): Promise<CryptoKey> {
  const candidate = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  // Compare-and-set in one transaction: separate tabs must encrypt with the same key.
  const transaction = database.transaction(META, "readwrite", { durability: "strict" });
  const done = completed(transaction);
  const store = transaction.objectStore(META);
  const read = store.get(MASTER_KEY);
  let selected = candidate;
  read.onsuccess = () => {
    if (read.result) selected = read.result.value as CryptoKey;
    else store.put({ key: MASTER_KEY, value: candidate } satisfies StoredMeta);
  };
  await done;
  if (selected.extractable || selected.algorithm.name !== "AES-GCM") throw new Error("The encrypted browser vault key is invalid.");
  return selected;
}

function aad(userId: string, row: Pick<StoredRecord, "kind" | "id" | "room" | "sort" | "format">) {
  return encoder.encode(JSON.stringify([
    "cp-browser-vault-v2",
    userId,
    row.kind,
    row.id,
    row.room,
    row.sort,
    row.format,
  ]));
}

export class BrowserVault {
  private writes: Promise<unknown> = Promise.resolve();
  checkpoint: VaultCheckpoint;

  constructor(
    readonly userId: string,
    private readonly database: IDBDatabase,
    private readonly masterKey: CryptoKey,
    checkpoint: VaultCheckpoint,
  ) {
    this.checkpoint = checkpoint;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.writes.then(operation, operation);
    this.writes = pending.catch(() => undefined);
    return pending;
  }

  private async encode(
    kind: string,
    id: string,
    value: unknown,
    room: string,
    sort: string,
    format: StoredRecord["format"],
  ): Promise<StoredRecord> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = format === "binary"
      ? new Uint8Array(value as ArrayBuffer | Uint8Array)
      : encoder.encode(JSON.stringify(value));
    const metadata = { kind, id, room, sort, format };
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(this.userId, metadata), tagLength: 128 },
      this.masterKey,
      plaintext,
    );
    plaintext.fill(0);
    return {
      key: recordKey(kind, id),
      ...metadata,
      iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength),
      ciphertext,
    };
  }

  private async decode<T>(row: StoredRecord): Promise<T> {
    const plaintext = new Uint8Array(await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: row.iv,
        additionalData: aad(this.userId, row),
        tagLength: 128,
      },
      this.masterKey,
      row.ciphertext,
    ));
    if (row.format === "binary") return plaintext as T;
    try {
      return JSON.parse(decoder.decode(plaintext)) as T;
    } finally {
      plaintext.fill(0);
    }
  }

  async put(kind: string, id: string, value: unknown, room = "", sort = ""): Promise<void> {
    const row = await this.encode(kind, id, value, room, sort, "json");
    await this.serialize(async () => {
      const transaction = this.database.transaction(RECORDS, "readwrite", { durability: "strict" });
      transaction.objectStore(RECORDS).put(row);
      await completed(transaction);
    });
  }

  async activate(session: VerifiedSession, recoveryIdentity: Identity): Promise<void> {
    const rows = await Promise.all([
      this.encode("device-secret-v2", this.userId, session.device, "", "", "json"),
      this.encode("account-roster", this.userId, session.roster, "", "", "json"),
      this.encode("root-recovery-v2", this.userId, recoveryIdentity, "", "", "json"),
    ]);
    // The checkpoint and every key become durable together; an interrupted write
    // leaves either the previous session or an unactivated vault, never half a session.
    const transaction = this.database.transaction([META, RECORDS], "readwrite", { durability: "strict" });
    const done = completed(transaction);
    let conflict: Error | null = null;
    const read = transaction.objectStore(META).get(CHECKPOINT);
    read.onsuccess = () => {
      const previous = read.result?.value as VaultCheckpoint | undefined;
      if (previous && (previous.rootFingerprint !== this.checkpoint.rootFingerprint || previous.rosterRevision > this.checkpoint.rosterRevision || (previous.rosterRevision === this.checkpoint.rosterRevision && previous.rosterHash !== this.checkpoint.rosterHash))) {
        conflict = new Error("The browser account changed. Local history was preserved.");
        transaction.abort(); return;
      }
      try {
        for (const row of rows) transaction.objectStore(RECORDS).put(row);
        transaction.objectStore(META).put({ key: CHECKPOINT, value: this.checkpoint } satisfies StoredMeta);
      } catch (error) { conflict = error instanceof Error ? error : new Error("Browser storage is unavailable."); transaction.abort(); }
    };
    try { await done; } catch (error) { throw conflict || error; }
  }

  async putBinary(kind: string, id: string, value: Uint8Array, room = "", sort = ""): Promise<void> {
    const row = await this.encode(kind, id, value, room, sort, "binary");
    await this.serialize(async () => {
      const transaction = this.database.transaction(RECORDS, "readwrite", { durability: "strict" });
      transaction.objectStore(RECORDS).put(row);
      await completed(transaction);
    });
  }

  async get<T>(kind: string, id: string): Promise<T | null> {
    await this.writes;
    const transaction = this.database.transaction(RECORDS, "readonly");
    const row = (await request(transaction.objectStore(RECORDS).get(recordKey(kind, id)))) as StoredRecord | undefined;
    await completed(transaction);
    return row ? this.decode<T>(row) : null;
  }

  async getBinary(kind: string, id: string): Promise<Uint8Array | null> {
    return this.get<Uint8Array>(kind, id);
  }

  async list<T>(kind: string, room = "", limit?: number): Promise<BrowserVaultRow<T>[]> {
    await this.writes;
    const transaction = this.database.transaction(RECORDS, "readonly");
    const store = transaction.objectStore(RECORDS);
    const rows = room
      ? (await request(store.index("room-sort").getAll(IDBKeyRange.bound(
          [kind, room, "", ""],
          [kind, room, "\uffff", "\uffff"],
        )))) as StoredRecord[]
      : (await request(store.getAll())) as StoredRecord[];
    await completed(transaction);
    let selected = rows
      .filter((row) => row.kind === kind && (room === "" || row.room === room))
      .sort((a, b) => a.sort.localeCompare(b.sort) || a.id.localeCompare(b.id));
    if (limit && selected.length > limit) selected = selected.slice(-limit);
    return Promise.all(selected.map(async (row) => ({
      kind: row.kind,
      id: row.id,
      room: row.room,
      sort: row.sort,
      value: await this.decode<T>(row),
    })));
  }

  async remove(kind: string, id: string): Promise<void> {
    await this.serialize(async () => {
      const transaction = this.database.transaction(RECORDS, "readwrite", { durability: "strict" });
      transaction.objectStore(RECORDS).delete(recordKey(kind, id));
      await completed(transaction);
    });
  }

  async session(): Promise<{ device: DeviceSecrets; roster: VerifiedSession["roster"] }> {
    const [device, roster] = await Promise.all([
      this.get<DeviceSecrets>("device-secret-v2", this.userId),
      this.get<VerifiedSession["roster"]>("account-roster", this.userId),
    ]);
    if (!device || !roster) throw new Error("Verify this browser before opening encrypted Messages.");
    validateIdentity(device.identity, this.userId);
    verifyRoster(roster, this.checkpointRoot(roster));
    const own = roster.devices.find((item) => item.id === device.id);
    if (
      !own ||
      fingerprint(own.identity) !== fingerprint(device.identity) ||
      roster.revision !== this.checkpoint.rosterRevision ||
      rosterHash(roster) !== this.checkpoint.rosterHash
    ) {
      throw new Error("This browser authorization checkpoint no longer matches.");
    }
    return { device, roster };
  }

  async updateRoster(roster: VerifiedSession["roster"]): Promise<void> {
    verifyRoster(roster, this.checkpointRoot(roster));
    const own = roster.devices.find((item) => item.id === this.checkpoint.deviceId);
    if (!own || fingerprint(own.identity) !== this.checkpoint.deviceFingerprint) {
      throw new Error("This browser was removed from the account's authorized devices.");
    }
    if (roster.revision < this.checkpoint.rosterRevision) {
      throw new Error("The account device list moved backwards.");
    }
    const next: VaultCheckpoint = {
      ...this.checkpoint,
      rosterRevision: roster.revision,
      rosterHash: rosterHash(roster),
    };
    if (
      next.rosterRevision === this.checkpoint.rosterRevision &&
      next.rosterHash === this.checkpoint.rosterHash
    ) {
      return;
    }
    const row = await this.encode("account-roster", this.userId, roster, "", "", "json");
    await this.serialize(async () => {
      const transaction = this.database.transaction([META, RECORDS], "readwrite", { durability: "strict" });
      transaction.objectStore(RECORDS).put(row);
      transaction.objectStore(META).put({ key: CHECKPOINT, value: next } satisfies StoredMeta);
      await completed(transaction);
      this.checkpoint = next;
    });
  }

  private checkpointRoot(roster: VerifiedSession["roster"]) {
    if (fingerprint(roster.identity) !== this.checkpoint.rootFingerprint) {
      throw new Error("The account encryption identity changed.");
    }
    return roster.identity;
  }

  close(): void {
    this.database.close();
  }
}

const active = new Map<string, BrowserVault>();
let activation: Promise<unknown> = Promise.resolve();

export async function openBrowserVault(userId: string): Promise<BrowserVault | null> {
  await activation;
  const current = active.get(userId);
  if (current) return current;
  const database = await openDatabase(userId);
  try {
    const [masterKey, checkpoint] = await Promise.all([
      readMeta<CryptoKey>(database, MASTER_KEY),
      readMeta<VaultCheckpoint>(database, CHECKPOINT),
    ]);
    if (!checkpoint && (!masterKey || (!masterKey.extractable && masterKey.algorithm.name === "AES-GCM"))) {
      database.close();
      return null;
    }
    if (
      !masterKey ||
      !checkpoint ||
      checkpoint.version !== 2 ||
      checkpoint.userId !== userId ||
      masterKey.extractable ||
      masterKey.algorithm.name !== "AES-GCM"
    ) {
      throw new Error("The encrypted browser vault is incomplete.");
    }
    const vault = new BrowserVault(userId, database, masterKey, checkpoint);
    await vault.session();
    active.set(userId, vault);
    return vault;
  } catch (error) {
    database.close();
    throw error;
  }
}

/** Persist only after the server confirms the signed device roster. */
export function persistVerifiedBrowserSession(
  session: VerifiedSession,
  recoveryIdentity: Identity,
): Promise<void> {
  const run = async () => {
    verifyRoster(session.roster, session.root);
    validateIdentity(recoveryIdentity, session.root.userId);
    if (fingerprint(recoveryIdentity) !== fingerprint(session.root)) {
      throw new Error("The recovery identity does not match this account.");
    }
    const own = session.roster.devices.find((item) => item.id === session.device.id);
    if (!own || fingerprint(own.identity) !== fingerprint(session.device.identity)) {
      throw new Error("This browser is not authorized to store the recovered account.");
    }
    active.get(session.root.userId)?.close();
    active.delete(session.root.userId);
    const database = await openDatabase(session.root.userId);
    try {
      const masterKey = await getOrCreateMasterKey(database);
      const checkpoint: VaultCheckpoint = {
        version: 2,
        vaultId: newId(),
        userId: session.root.userId,
        rootFingerprint: fingerprint(session.root),
        deviceId: session.device.id,
        deviceFingerprint: fingerprint(session.device.identity),
        rosterRevision: session.roster.revision,
        rosterHash: rosterHash(session.roster),
        createdAt: new Date().toISOString(),
      };
      const vault = new BrowserVault(session.root.userId, database, masterKey, checkpoint);
      await vault.activate(session, recoveryIdentity);
      await vault.session();
      active.set(session.root.userId, vault);
    } catch (error) {
      database.close();
      throw error;
    }
  };
  const pending = activation.then(run, run);
  activation = pending.catch(() => undefined);
  return pending;
}

export async function closeBrowserVault(userId: string): Promise<void> {
  await activation;
  active.get(userId)?.close();
  active.delete(userId);
}
