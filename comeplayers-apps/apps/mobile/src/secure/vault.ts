import * as SecureStore from "expo-secure-store";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { createIdentity, decryptJson, encryptJson, hex, newId, random, unhex, type Identity } from "./crypto";

export type VaultDescriptor = { version: 1; database: string; deviceId: string; identity: Identity; localKey: string };
export type VaultRow = { kind: string; id: string; room: string; sort: string; value: string };
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const instances = new Map<string, Promise<Vault>>();
export const descriptorKey = (userId: string) => `cp.private.v1.${userId}`;
export class Vault {
  private decoded = new Map<string, { ciphertext: string; value: unknown }>();
  private writes: Promise<unknown> = Promise.resolve();
  constructor(readonly descriptor: VaultDescriptor, readonly db: SQLiteDatabase) {}
  private context(row: Pick<VaultRow, "kind" | "id" | "room" | "sort">) { return JSON.stringify(["cp-local-v1", this.descriptor.identity.userId, row.kind, row.id, row.room, row.sort]); }
  encode(kind: string, id: string, value: unknown, room = "", sort = ""): VaultRow {
    const row = { kind, id, room, sort };
    return { ...row, value: encryptJson(unhex(this.descriptor.localKey), value, this.context(row)) };
  }
  decode<T>(row: VaultRow): T {
    if (row.kind === "media-chunk") return decryptJson<T>(unhex(this.descriptor.localKey), row.value, this.context(row));
    const context = this.context(row), cached = this.decoded.get(context);
    if (row.kind !== "root-recovery-v2" && cached?.ciphertext === row.value) return cached.value as T;
    const value = decryptJson<T>(unhex(this.descriptor.localKey), row.value, context);
    if (row.kind === "root-recovery-v2") return value;
    if (this.decoded.size >= 500) this.decoded.delete(this.decoded.keys().next().value!);
    this.decoded.set(context, { ciphertext: row.value, value }); return value;
  }
  async get<T>(kind: string, id: string): Promise<T | null> {
    const row = await this.db.getFirstAsync<VaultRow>("SELECT * FROM records WHERE kind=? AND id=?", kind, id);
    return row ? this.decode<T>(row) : null;
  }
  // Keep bridge/SQLite work bounded when refreshing an entire inbox. These
  // queries still select only authenticated account-vault rows by opaque IDs.
  async getMany<T>(kind: string, ids: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>(), unique = [...new Set(ids)];
    for (let offset = 0; offset < unique.length; offset += 200) {
      const batch = unique.slice(offset, offset + 200);
      const rows = await this.db.getAllAsync<VaultRow>(`SELECT * FROM records WHERE kind=? AND id IN (${batch.map(() => "?").join(",")})`, kind, ...batch);
      for (const row of rows) result.set(row.id, this.decode<T>(row));
    }
    return result;
  }
  async latestByRoom<T>(kind: string, rooms: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>(), unique = [...new Set(rooms)];
    for (let offset = 0; offset < unique.length; offset += 200) {
      const batch = unique.slice(offset, offset + 200);
      // One index seek per requested room, rather than scanning/decrypting its
      // entire history or issuing a JS/native round trip for every room.
      const rows = await this.db.getAllAsync<VaultRow>(`WITH requested(room) AS (VALUES ${batch.map(() => "(?)").join(",")}) SELECT record.* FROM requested JOIN records AS record ON record.kind=? AND record.id=(SELECT newest.id FROM records AS newest WHERE newest.kind=? AND newest.room=requested.room ORDER BY newest.sort DESC,newest.id DESC LIMIT 1)`, ...batch, kind, kind);
      for (const row of rows) result.set(row.room, this.decode<T>(row));
    }
    return result;
  }
  async put(kind: string, id: string, value: unknown, room = "", sort = ""): Promise<void> {
    const old = await this.db.getFirstAsync<VaultRow>("SELECT * FROM records WHERE kind=? AND id=?", kind, id);
    if (old && old.room === room && old.sort === sort && JSON.stringify(this.decode(old)) === JSON.stringify(value)) return;
    await this.putRows([this.encode(kind, id, value, room, sort)]);
  }
  async putRows(rows: Iterable<VaultRow>): Promise<void> {
    await this.transaction(async tx => { for (const r of rows) await tx.runAsync("INSERT INTO records(kind,id,room,sort,value) VALUES (?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET room=excluded.room,sort=excluded.sort,value=excluded.value", r.kind, r.id, r.room, r.sort, r.value); });
  }
  // Expo opens a separate connection for each exclusive transaction. Its busy
  // timeout is connection-local, so all writers must share one queue on Android.
  transaction(work: (tx: SQLiteDatabase) => Promise<void>): Promise<void> {
    const operation = this.writes.then(() => this.db.withExclusiveTransactionAsync(work));
    this.writes = operation.catch(() => undefined);
    return operation;
  }
  async list<T>(kind: string, room?: string, limit = 100, before?: string): Promise<T[]> {
    const rows = await this.db.getAllAsync<VaultRow>(`SELECT * FROM records WHERE kind=? ${room === undefined ? "" : "AND room=?"} ${before ? "AND sort<?" : ""} ORDER BY sort DESC,id DESC LIMIT ?`, ...[kind, ...(room === undefined ? [] : [room]), ...(before ? [before] : []), Math.min(limit, 10000)]);
    return rows.map(r => this.decode<T>(r));
  }
  async search<T>(kind: string, room: string, matches: (value: T) => boolean, limit: number, cancelled: () => boolean): Promise<T[]> {
    const result: T[] = []; let scanned = 0;
    for await (const row of this.db.getEachAsync<VaultRow>("SELECT * FROM records WHERE kind=? AND room=? ORDER BY sort DESC,id DESC", kind, room)) {
      if (cancelled()) break;
      const value = this.decode<T>(row);
      if (matches(value)) result.push(value);
      if (result.length >= limit) break;
      if (++scanned % 32 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return result;
  }
  async remove(kind: string, id: string): Promise<void> { await this.transaction(async tx => { await tx.runAsync("DELETE FROM records WHERE kind=? AND id=?", kind, id); }); }
}
export async function createVaultDatabase(descriptor: VaultDescriptor): Promise<Vault> {
  if (!/^cp-private-[0-9a-f-]{36}\.db$/.test(descriptor.database)) throw new Error("Invalid private database name.");
  const db = await openDatabaseAsync(descriptor.database);
  // Only opaque IDs and ordering metadata are indexed. Message bodies, names,
  // private keys, preferences and attachment chunks never enter SQLite plaintext.
  await db.execAsync("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL,id TEXT NOT NULL,room TEXT NOT NULL,sort TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id)); CREATE INDEX IF NOT EXISTS records_room ON records(kind,room,sort DESC,id DESC);");
  return new Vault(descriptor, db);
}
export function openVault(userId: string): Promise<Vault> {
  if (!/^[0-9a-f-]{36}$/.test(userId)) return Promise.reject(new Error("Invalid account identity."));
  const pending = instances.get(userId); if (pending) return pending;
  const opening = (async () => {
    const saved = await SecureStore.getItemAsync(descriptorKey(userId), options);
    const descriptor: VaultDescriptor = saved ? JSON.parse(saved) : { version: 1, database: `cp-private-${newId()}.db`, deviceId: newId(), identity: createIdentity(userId), localKey: hex(random()) };
    if (descriptor.version !== 1 || descriptor.identity.userId !== userId) throw new Error("Private history identity mismatch.");
    if (!saved) await SecureStore.setItemAsync(descriptorKey(userId), JSON.stringify(descriptor), options);
    return createVaultDatabase(descriptor);
  })();
  instances.set(userId, opening);
  void opening.catch(() => { if (instances.get(userId) === opening) instances.delete(userId); });
  return opening;
}
export async function activateRestoredVault(userId: string, vault: Vault): Promise<void> {
  await SecureStore.setItemAsync(descriptorKey(userId), JSON.stringify(vault.descriptor), options);
  // Keep the previous database as a local recovery copy; never delete history as
  // a side effect of restore. Readers restart against the new descriptor.
  instances.set(userId, Promise.resolve(vault));
}
