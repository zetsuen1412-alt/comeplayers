import {
  fingerprint,
  hex,
  newId,
  random,
  safetyCode,
  validateIdentity,
  type Identity,
  type PublicIdentity,
} from "./crypto";
import {
  assertCurrentEpoch,
  createEpoch,
  decryptHistory,
  encryptHistory,
  epochHash,
  openEpochKey,
  proveDeviceRequest,
  rosterHash,
  verifyEpoch,
  verifyRoster,
  verifyRosterChain,
  type AccountRoster,
  type ConversationEpoch,
  type ConversationKey,
  type HistoryEnvelope,
} from "./protocol";
import type { BrowserVault } from "./browserVault";
import {
  decryptSecureAttachment,
  encryptSecureAttachment,
  verifySecureAttachment,
  type SecureAttachment,
} from "./secureAttachment";

type Init = { method?: string; body?: string; headers?: Record<string, string> };
export type SecureTransport = <T>(path: string, init?: Init) => Promise<T>;
export type SecureBinaryTransport = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: Uint8Array },
) => Promise<Response>;

type ContextResponse = {
  accounts: { userId: string; roster: AccountRoster; rosterHash: string }[];
  rosterHistory: {
    user_id: string;
    revision: number;
    roster: AccountRoster;
    roster_hash: string;
  }[];
  epochs: { epoch: ConversationEpoch; epochHash: string; serverCreatedAt: string }[];
};

type PullResponse = {
  events: {
    sequence: number | string;
    event: HistoryEnvelope;
    blob_id: string | null;
    server_created_at: string;
  }[];
  next: number;
  hasMore: boolean;
};

export type DecryptedHistory<T = unknown> = {
  sequence: number;
  event: HistoryEnvelope;
  payload: T;
  queued?: boolean;
};

type PendingHistory<T = unknown> = {
  event: HistoryEnvelope;
  payload: T;
  notify?: boolean;
};

export type SecureCallKey = {
  v: 2;
  kind: "secure-call-key";
  media: "audio" | "video";
  key: string;
};

type RoomContext = {
  accounts: Map<string, AccountRoster>;
  roots: Map<string, PublicIdentity>;
  histories: Map<string, readonly AccountRoster[]>;
  epochs: ConversationEpoch[];
  keys: Map<string, ConversationKey>;
  loadedAt: number;
};

function sameRoot(a: PublicIdentity, b: PublicIdentity) {
  return fingerprint(a) === fingerprint(b);
}

async function readExactBytes(response: Response, expected: number): Promise<Uint8Array> {
  if (!response.ok) throw new Error("The encrypted attachment could not be downloaded.");
  if (!Number.isSafeInteger(expected) || expected < 41 || expected > 4 * 1024 * 1024 + 40) {
    throw new Error("Invalid encrypted attachment size.");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) !== expected) {
    throw new Error("Encrypted attachment size does not match.");
  }
  const value = new Uint8Array(await response.arrayBuffer());
  if (value.length !== expected) throw new Error("The encrypted attachment download is incomplete.");
  return value;
}

export class SecureHistorySync {
  private contexts = new Map<string, RoomContext>();

  constructor(
    readonly vault: BrowserVault,
    readonly transport: SecureTransport,
    readonly binaryTransport?: SecureBinaryTransport,
  ) {}

  async api<T>(path: string, method = "GET", data?: unknown): Promise<T> {
    const { device } = await this.vault.session();
    const body = data === undefined ? "" : JSON.stringify(data);
    const proof = proveDeviceRequest(device, method, path, body);
    return this.transport<T>(path, {
      method,
      ...(body ? { body } : {}),
      headers: {
        "x-cp-device": proof.deviceId,
        "x-cp-time": proof.timestamp,
        "x-cp-nonce": proof.nonce,
        "x-cp-proof": proof.signature,
      },
    });
  }

  private async trustRoot(userId: string, root: PublicIdentity): Promise<PublicIdentity> {
    if (userId === this.vault.userId) {
      const roster = await this.vault.get<AccountRoster>("account-roster", userId);
      if (!roster || !sameRoot(roster.identity, root)) {
        throw new Error("The account encryption identity changed.");
      }
      return roster.identity;
    }
    const pinned = await this.vault.get<PublicIdentity>("root-pin-v2", userId);
    if (pinned && !sameRoot(pinned, root)) {
      throw new Error("A contact's encryption identity changed. Compare security codes before continuing.");
    }
    if (!pinned) await this.vault.put("root-pin-v2", userId, root);
    return pinned || root;
  }

  async context(roomId: string, recoveryIdentity?: Identity, force = false): Promise<RoomContext> {
    const cached = this.contexts.get(roomId);
    if (!force && cached && Date.now() - cached.loadedAt < 30_000) return cached;
    const result = await this.api<ContextResponse>(
      `/api/messages/secure/history/epoch?roomId=${encodeURIComponent(roomId)}`,
    );
    const accounts = new Map<string, AccountRoster>();
    const roots = new Map<string, PublicIdentity>();
    const histories = new Map<string, readonly AccountRoster[]>();
    for (const account of result.accounts) {
      verifyRoster(account.roster, account.roster.identity);
      if (rosterHash(account.roster) !== account.rosterHash) {
        throw new Error("An account authorization checkpoint is invalid.");
      }
      accounts.set(account.userId, account.roster);
      roots.set(account.userId, await this.trustRoot(account.userId, account.roster.identity));
    }
    if (accounts.size !== 2) throw new Error("A private conversation requires two verified accounts.");
    for (const [userId, current] of accounts) {
      const chain = result.rosterHistory
        .filter((item) => item.user_id === userId)
        .sort((a, b) => a.revision - b.revision);
      if (
        !chain.length ||
        chain.some((item) => item.revision !== item.roster.revision || rosterHash(item.roster) !== item.roster_hash)
      ) {
        throw new Error("The device authorization history is incomplete.");
      }
      const verified = verifyRosterChain(chain.map((item) => item.roster), roots.get(userId)!);
      if (!verified || rosterHash(verified) !== rosterHash(current)) {
        throw new Error("The current device list does not match its signed history.");
      }
      histories.set(userId, chain.map((item) => item.roster));
      if (userId === this.vault.userId) await this.vault.updateRoster(current);
    }
    const recovery = recoveryIdentity ||
      (await this.vault.get<Identity>("root-recovery-v2", this.vault.userId)) ||
      undefined;
    if (recovery) {
      validateIdentity(recovery, this.vault.userId);
      const ownRoot = roots.get(this.vault.userId);
      if (!ownRoot || !sameRoot(recovery, ownRoot)) {
        throw new Error("The local recovery identity does not match this account.");
      }
    }
    const epochs = result.epochs.map((item) => item.epoch).sort((a, b) => a.epoch - b.epoch);
    const keys = new Map<string, ConversationKey>();
    const { device } = await this.vault.session();
    let previous: ConversationEpoch | undefined;
    for (const [index, epoch] of epochs.entries()) {
      verifyEpoch(epoch, roots, previous, index === 0 ? epoch.authorUserId : undefined, histories);
      const wire = result.epochs.find((item) => item.epoch.id === epoch.id);
      if (!wire || wire.epochHash !== epochHash(epoch)) {
        throw new Error("A conversation key checkpoint is invalid.");
      }
      const savedEpoch = await this.vault.get<ConversationEpoch>("conversation-epoch", epoch.id);
      if (savedEpoch && epochHash(savedEpoch) !== epochHash(epoch)) {
        throw new Error("A conversation-key fork was detected.");
      }
      await this.vault.put("conversation-epoch", epoch.id, epoch, roomId, String(epoch.epoch).padStart(10, "0"));
      let key = await this.vault.get<ConversationKey>("conversation-key", epoch.id);
      if (!key) {
        try {
          key = await openEpochKey(epoch, device.identity, device.id);
        } catch {
          if (recovery) key = await openEpochKey(epoch, recovery);
        }
        if (key) {
          await this.vault.put("conversation-key", epoch.id, key, roomId, String(epoch.epoch).padStart(10, "0"));
        }
      }
      if (key) keys.set(epoch.id, key);
      previous = epoch;
    }
    const context = { accounts, roots, histories, epochs, keys, loadedAt: Date.now() };
    this.contexts.set(roomId, context);
    return context;
  }

  async ensureCurrentEpoch(
    roomId: string,
    recoveryIdentity?: Identity,
    force = false,
  ): Promise<{ epoch: ConversationEpoch; key: ConversationKey }> {
    let context = await this.context(roomId, recoveryIdentity, force);
    const { device } = await this.vault.session();
    const currentRosters = context.accounts;
    let latest = context.epochs.at(-1);
    let key = latest ? context.keys.get(latest.id) : undefined;
    const stale = !latest || [...currentRosters].some(([userId, roster]) => {
      const current = latest!.members.find((item) => item.roster.identity.userId === userId);
      return !current || rosterHash(current.roster) !== rosterHash(roster);
    });
    if (stale) {
      const created = await createEpoch(
        device,
        roomId,
        [...currentRosters.values()].map((roster) => ({ roster, admin: true })),
        context.roots,
        latest,
        context.histories,
      );
      const confirmed = await this.api<{ inserted: boolean; epochHash: string }>(
        "/api/messages/secure/history/epoch",
        "POST",
        { epoch: created.epoch },
      );
      if (confirmed.epochHash !== epochHash(created.epoch)) {
        throw new Error("The server did not confirm the conversation key.");
      }
      await this.vault.put("conversation-epoch", created.epoch.id, created.epoch, roomId, String(created.epoch.epoch).padStart(10, "0"));
      await this.vault.put("conversation-key", created.epoch.id, created.key, roomId, String(created.epoch.epoch).padStart(10, "0"));
      context = await this.context(roomId, recoveryIdentity, true);
      latest = context.epochs.at(-1);
      key = latest ? context.keys.get(latest.id) : undefined;
    }
    if (!latest || !key) throw new Error("Recover this conversation's encrypted keys before sending.");
    assertCurrentEpoch(latest, currentRosters);
    return { epoch: latest, key };
  }

  async securityCode(roomId: string): Promise<string> {
    const context = await this.context(roomId);
    const peer = [...context.roots.entries()].find(([userId]) => userId !== this.vault.userId)?.[1];
    const self = context.roots.get(this.vault.userId);
    if (!peer || !self) throw new Error("The contact encryption identity is unavailable.");
    return safetyCode(self, peer);
  }

  private async deliver<T>(pending: PendingHistory<T>): Promise<DecryptedHistory<T>> {
    const saved = await this.api<{ sequence: number }>("/api/messages/secure/history", "POST", {
      event: pending.event,
      notify: pending.notify === true,
    });
    if (!Number.isSafeInteger(saved.sequence) || saved.sequence < 1) {
      throw new Error("Invalid encrypted-history receipt.");
    }
    const result = { sequence: saved.sequence, event: pending.event, payload: pending.payload };
    await this.vault.put("history-event-v2", pending.event.id, result, pending.event.roomId, String(saved.sequence).padStart(20, "0"));
    await this.vault.remove("history-outbox-v2", pending.event.id);
    await this.vault.remove("history-pending-v2", pending.event.id);
    return result;
  }

  async flushOutbox(): Promise<number> {
    const rows = await this.vault.list<PendingHistory>("history-outbox-v2");
    const pending = rows.map((row) => row.value)
      .sort((a, b) => a.event.createdAt.localeCompare(b.event.createdAt) || a.event.id.localeCompare(b.event.id));
    for (const item of pending) {
      try {
        await this.deliver(item);
      } catch (error) {
        const stale = error instanceof Error && /device authorization changed|rotate the conversation key/i.test(error.message);
        if (!stale || item.event.blobId) throw error;
        const { device } = await this.vault.session();
        const { epoch, key } = await this.ensureCurrentEpoch(item.event.roomId, undefined, true);
        const event = encryptHistory(device, epoch, key, item.payload, item.event.id);
        const replacement = { event, payload: item.payload, notify: item.notify };
        await this.vault.put("history-outbox-v2", event.id, replacement, event.roomId, event.createdAt);
        await this.vault.put("history-pending-v2", event.id, { sequence: 0, event, payload: item.payload, queued: true }, event.roomId, event.createdAt);
        await this.deliver(replacement);
      }
    }
    return pending.length;
  }

  private async queue<T>(event: HistoryEnvelope, payload: T, notify = false): Promise<DecryptedHistory<T>> {
    const pending = { event, payload, notify };
    await this.vault.put("history-outbox-v2", event.id, pending, event.roomId, event.createdAt);
    await this.vault.put("history-pending-v2", event.id, { sequence: 0, event, payload, queued: true }, event.roomId, event.createdAt);
    try {
      return await this.deliver(pending);
    } catch {
      return { sequence: 0, event, payload, queued: true };
    }
  }

  async send<T>(roomId: string, payload: T, blobId: string | null = null, notify = false): Promise<DecryptedHistory<T>> {
    const { device } = await this.vault.session();
    const { epoch, key } = await this.ensureCurrentEpoch(roomId);
    return this.queue(encryptHistory(device, epoch, key, payload, undefined, blobId), payload, notify);
  }

  async sendAttachment<T extends Record<string, unknown>>(
    roomId: string,
    payload: T,
    file: { bytes: Uint8Array; name: string; mime: string },
  ): Promise<DecryptedHistory<T & { attachment: SecureAttachment }>> {
    if (!this.binaryTransport) throw new Error("Encrypted attachment transfer is unavailable in this browser.");
    const { device } = await this.vault.session();
    const { epoch, key } = await this.ensureCurrentEpoch(roomId);
    const eventId = newId();
    const prepared = await this.api<{ id: string; url: string }>(
      "/api/messages/secure/history/blob",
      "POST",
      { roomId, epochId: epoch.id, size: file.bytes.length + 40 },
    );
    const encrypted = encryptSecureAttachment(file.bytes, {
      eventId,
      roomId,
      epochId: epoch.id,
      blobId: prepared.id,
      name: file.name,
      mime: file.mime,
    });
    const response = await this.binaryTransport(prepared.url, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: encrypted.ciphertext,
    });
    if (!response.ok) throw new Error("The encrypted attachment could not be uploaded. Try again.");
    const body = { ...payload, attachment: encrypted.attachment };
    return this.queue(encryptHistory(device, epoch, key, body, eventId, prepared.id), body, true);
  }

  async downloadAttachment(
    entry: DecryptedHistory<{ attachment?: unknown }>,
  ): Promise<{ bytes: Uint8Array; attachment: SecureAttachment }> {
    if (!this.binaryTransport || !entry.event.blobId) {
      throw new Error("This message has no downloadable encrypted attachment.");
    }
    const attachment = verifySecureAttachment(entry.payload.attachment, entry.event.blobId);
    const link = await this.api<{ size: number; url: string }>(
      `/api/messages/secure/history/blob?id=${encodeURIComponent(entry.event.blobId)}`,
    );
    if (link.size !== attachment.encryptedSize) throw new Error("Encrypted attachment size does not match.");
    const ciphertext = await readExactBytes(await this.binaryTransport(link.url), link.size);
    return {
      bytes: decryptSecureAttachment(ciphertext, attachment, {
        eventId: entry.event.id,
        roomId: entry.event.roomId,
        epochId: entry.event.epochId,
        blobId: entry.event.blobId,
      }),
      attachment,
    };
  }

  async createCallKey(roomId: string, media: "audio" | "video"): Promise<{ eventId: string; key: string }> {
    const keyBytes = random();
    const key = hex(keyBytes);
    keyBytes.fill(0);
    const result = await this.send(roomId, { v: 2, kind: "secure-call-key", media, key } satisfies SecureCallKey);
    if (result.queued || result.sequence < 1) {
      throw new Error("Connect to the internet before starting an encrypted call.");
    }
    return { eventId: result.event.id, key };
  }

  async openCallKey(eventId: string, roomId: string, media: "audio" | "video"): Promise<string> {
    let entry = await this.vault.get<DecryptedHistory<SecureCallKey>>("history-event-v2", eventId);
    if (!entry) {
      await this.sync();
      entry = await this.vault.get<DecryptedHistory<SecureCallKey>>("history-event-v2", eventId);
    }
    if (
      !entry ||
      entry.sequence < 1 ||
      entry.event.id !== eventId ||
      entry.event.roomId !== roomId ||
      entry.event.blobId !== null ||
      entry.payload?.v !== 2 ||
      entry.payload.kind !== "secure-call-key" ||
      entry.payload.media !== media ||
      !/^[0-9a-f]{64}$/.test(entry.payload.key)
    ) {
      throw new Error("The encrypted call key is unavailable or invalid.");
    }
    return entry.payload.key;
  }

  async sync(recoveryIdentity?: Identity): Promise<DecryptedHistory[]> {
    const imported: DecryptedHistory[] = [];
    let after = (await this.vault.get<number>("meta", "secure-history-cursor")) || 0;
    for (let page = 0; page < 10; page += 1) {
      const result = await this.api<PullResponse>(`/api/messages/secure/history?after=${after}`);
      const rooms = [...new Set(result.events.map((item) => item.event.roomId))];
      for (const room of rooms) {
        const cached = this.contexts.get(room);
        const required = result.events.filter((item) => item.event.roomId === room).map((item) => item.event.epochId);
        if (!cached || required.some((id) => !cached.epochs.some((epoch) => epoch.id === id))) {
          await this.context(room, recoveryIdentity, true);
        }
      }
      let cursor = after;
      for (const item of result.events) {
        const sequence = Number(item.sequence);
        if (!Number.isSafeInteger(sequence) || sequence <= cursor || item.blob_id !== item.event.blobId) {
          throw new Error("Invalid encrypted-history ordering.");
        }
        const context = this.contexts.get(item.event.roomId);
        const epoch = context?.epochs.find((value) => value.id === item.event.epochId);
        const key = context?.keys.get(item.event.epochId);
        if (!epoch || !key) throw new Error("Recover the missing conversation key before syncing more history.");
        const entry = { sequence, event: item.event, payload: decryptHistory(item.event, epoch, key) };
        await this.vault.put("history-event-v2", item.event.id, entry, item.event.roomId, String(sequence).padStart(20, "0"));
        await this.vault.remove("history-outbox-v2", item.event.id);
        await this.vault.remove("history-pending-v2", item.event.id);
        imported.push(entry);
        cursor = sequence;
      }
      if (result.events.length && result.next !== Number(result.events.at(-1)!.sequence)) {
        throw new Error("Encrypted-history cursor mismatch.");
      }
      if (!result.events.length && result.next !== after) {
        throw new Error("Encrypted-history cursor skipped unavailable events.");
      }
      if (result.next < after || (result.hasMore && result.next === after)) {
        throw new Error("Encrypted-history cursor moved backwards.");
      }
      await this.vault.put("meta", "secure-history-cursor", result.next);
      after = result.next;
      if (!result.hasMore) break;
    }
    return imported;
  }
}
