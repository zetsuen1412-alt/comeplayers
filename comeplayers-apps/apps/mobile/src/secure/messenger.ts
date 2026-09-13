import type { ChatMessage, ChatRoom } from "@comeplayers/chat-core";
import { File, Paths } from "expo-file-system";
import { fetch as nativeFetch } from "expo/fetch";
import { request } from "../api";
import { decryptBytes, digest, encryptBytes, fingerprint, hex, newId, openMessage, publicIdentity, random, registrationProof, requestProof, safetyCode, sealMessage, unhex, type Envelope, type PublicIdentity } from "./crypto";
import { MAX_PRIVATE_FILE, storeLegacyFile, storeMedia, type LocalMedia } from "./mediaStore";
import type { Vault, VaultRow } from "./vault";
import { chatClient } from "../runtime";
import type { CallRecord } from "../messagingApi";
import { readExactBytes } from "./boundedDownload";

export type PrivateMessage = ChatMessage & { localMedia?: LocalMedia; legacy?: boolean; delivery?: "queued" | "sent" | "received" | "read"; starred?: boolean; local_updated_at?: string };
type MediaWire = { id: string; key: string; digest: string; size: number; name: string; mime: string };
type Payload = { kind: "message"; text: string; attachment?: MediaWire; reply?: { id: string; text: string; senderId: string } }
  | { kind: "receipt"; ids: string[]; read: boolean }
  | { kind: "edit" | "delete"; id: string; text?: string };
type Outgoing = { envelope: Envelope; blobId: string | null; messageId?: string };
const allowedMime = /^(image\/(jpeg|png|webp)|video\/mp4|audio\/(mp4|m4a|mpeg)|application\/pdf)$/;

export class PrivateMessenger {
  private listeners = new Set<() => void>();
  private syncing: Promise<void> | null = null;
  private serial: Promise<unknown> = Promise.resolve();
  private peerCache = new Map<string, { identity: PublicIdentity; until: number }>();
  private lastCallImport = 0;
  private paused = false;
  error = "";
  ready = false;
  constructor(readonly vault: Vault) {}
  get userId() { return this.vault.descriptor.identity.userId; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  changed() { for (const listener of this.listeners) listener(); }
  async pause() { this.paused = true; await this.syncing; await this.serial; }
  resume() { this.paused = false; void this.sync(); }
  private write<T>(work: () => Promise<T>): Promise<T> { const next = this.serial.then(work, work); this.serial = next.catch(() => undefined); return next; }
  async api<T>(path: string, method = "GET", data?: unknown): Promise<T> {
    const body = data === undefined ? "" : JSON.stringify(data), timestamp = new Date().toISOString();
    const { identity, deviceId } = this.vault.descriptor;
    return request<T>(path, { method, ...(body ? { body } : {}), headers: { "x-cp-device": deviceId, "x-cp-time": timestamp, "x-cp-proof": requestProof(identity, deviceId, timestamp, method, path, body) } }, true);
  }
  async initialize(): Promise<void> {
    const { identity, deviceId } = this.vault.descriptor;
    const registered = await this.vault.get<string>("meta", "registered-device");
    if (registered !== deviceId) {
      const timestamp = new Date().toISOString();
      await request("/api/messages/private/device", { method: "POST", body: JSON.stringify({ identity: publicIdentity(identity), deviceId, timestamp, proof: registrationProof(identity, deviceId, timestamp) }) }, true);
      await this.vault.put("meta", "registered-device", deviceId);
    } else await this.api("/api/messages/private/device");
    this.ready = true; this.error = ""; this.changed();
  }
  async peer(roomId: string, allowStored = false): Promise<PublicIdentity> {
    if (allowStored) {
      const userId = await this.vault.get<string>("room-peer", roomId);
      const pinned = userId ? await this.vault.get<PublicIdentity>("identity-pin", userId) : null;
      if (pinned) return pinned;
    }
    const cached = this.peerCache.get(roomId); if (cached && cached.until > Date.now()) return cached.identity;
    const { identity } = await this.api<{ identity: PublicIdentity | null }>(`/api/messages/private/device?roomId=${encodeURIComponent(roomId)}`);
    if (!identity) throw new Error("Your contact needs to update ComePlayers and open Messages before encrypted chat is available.");
    const saved = await this.vault.get<PublicIdentity>("identity-pin", identity.userId);
    if (saved && fingerprint(saved) !== fingerprint(identity)) throw new Error("This contact's security identity changed. Sending is blocked. Compare your security codes before continuing.");
    if (!saved) await this.vault.put("identity-pin", identity.userId, identity);
    await this.vault.put("room-peer", roomId, identity.userId);
    this.peerCache.set(roomId, { identity, until: Date.now() + 60000 });
    return identity;
  }
  async securityCode(roomId: string): Promise<string> { return safetyCode(this.vault.descriptor.identity, await this.peer(roomId)); }
  async prepareCall(roomId: string, media: "audio" | "video"): Promise<Envelope> {
    if (!this.ready) throw new Error(this.error || "Private messaging is connecting.");
    const peer = await this.peer(roomId), key = hex(random());
    const envelope = await sealMessage(this.vault.descriptor.identity, peer, roomId, { kind: "call-key", key, media });
    await this.vault.put("call-key", envelope.id, { key, roomId, media });
    return envelope;
  }
  async callKey(envelope: Envelope, roomId: string, media: "audio" | "video"): Promise<string> {
    if (envelope.senderId === this.userId) {
      const saved = await this.vault.get<{ key: string; roomId: string; media: string }>("call-key", envelope.id);
      if (!saved || saved.roomId !== roomId || saved.media !== media) throw new Error("Private call key is unavailable on this device.");
      return saved.key;
    }
    const peer = await this.peer(roomId);
    const payload = await openMessage<{ kind: string; key: string; media: string }>(this.vault.descriptor.identity, peer, envelope, roomId);
    if (payload.kind !== "call-key" || payload.media !== media || !/^[0-9a-f]{64}$/.test(payload.key)) throw new Error("Private call authentication failed.");
    return payload.key;
  }
  async messages(roomId: string, before?: string): Promise<PrivateMessage[]> { return this.vault.list("message", roomId, 80, before); }
  async rooms(): Promise<ChatRoom[]> { return this.vault.list("room", undefined, 100); }
  async migrateCallHistory() {
    const result = await this.api<{ calls: CallRecord[]; scheduled: CallRecord[] }>("/api/messages/private/call-history");
    for (const call of result.scheduled) await this.vault.put("call-history", call.id, call, call.room_id, call.created_at);
    if (!result.calls.length) { this.lastCallImport = Date.now(); return; }
    await this.vault.putRows(result.calls.map(call => this.vault.encode("call-history", call.id, call, call.room_id, call.created_at)));
    await this.api("/api/messages/private/call-history", "POST", { ids: result.calls.map(call => call.id) });
    this.changed();
  }
  async scheduleCall(room: ChatRoom, scheduledAt: string) {
    const encryptionEnvelope = await this.prepareCall(room.id, "audio");
    const { call } = await this.api<{ call: CallRecord }>("/api/messages/calls", "POST", { roomId: room.id, media: "audio", scheduledAt, encryptionEnvelope });
    await this.vault.put("call-history", call.id, { ...call, encryption_envelope: undefined, other: room.other }, room.id, call.created_at);
    this.changed();
  }
  async cancelScheduledCall(id: string) {
    const result = await this.api<{ status: CallRecord["status"] }>("/api/messages/calls", "PATCH", { id, action: "end" });
    const call = await this.vault.get<CallRecord>("call-history", id);
    if (call) await this.vault.put("call-history", id, { ...call, status: result.status, ended_at: new Date().toISOString() }, call.room_id, call.created_at);
    this.changed();
  }
  async migrateRoom(roomId: string): Promise<void> {
    if (await this.vault.get("legacy-complete", roomId)) return;
    const result = await this.api<{ messages: PrivateMessage[] }>(`/api/messages/private/legacy?roomId=${encodeURIComponent(roomId)}`);
    if (!result.messages.length) { await this.vault.put("legacy-complete", roomId, true); return; }
    const ids = [];
    for (const message of result.messages) {
      if (!(await this.vault.get("message", message.id))) {
        let media: LocalMedia | undefined;
        if (message.attachment?.id && !message.deleted_at) {
          const link = await chatClient.getAttachmentLink(message.attachment.id);
          const file = new File(Paths.cache, `cp-import-${newId()}`);
          try {
            await File.downloadFileAsync(link.url, file);
            if (file.size !== message.attachment.size_bytes) throw new Error("An old attachment has not finished downloading. Its server copy was kept.");
            media = await storeLegacyFile(this.vault, file, message.attachment.file_name, message.attachment.mime_type, message.id);
          } finally { if (file.exists) file.delete(); }
        }
        await this.vault.put("message", message.id, { ...message, legacy: true, localMedia: media, is_read: true }, roomId, message.created_at);
      }
      ids.push(message.id);
    }
    await this.api("/api/messages/private/legacy", "POST", { roomId, ids });
    this.changed();
  }
  async saveRooms(rooms: ChatRoom[]): Promise<ChatRoom[]> {
    return this.write(async () => {
      const merged = [];
      for (const room of rooms) {
        const local = await this.vault.get<ChatRoom>("room", room.id);
        const last = (await this.messages(room.id))[0];
        const result = last ? { ...room, last_message: last.deleted_at ? "Message deleted" : last.message || last.localMedia?.name || "Attachment", last_message_at: last.created_at, last_message_sender_id: last.sender_id, unread_count: local?.unread_count || 0 } : room;
        await this.vault.put("room", room.id, result, "", result.last_message_at || result.created_at || ""); merged.push(result);
      }
      return merged;
    });
  }
  private async updateRoom(roomId: string, message: PrivateMessage, incoming: boolean) {
    const room = await this.vault.get<ChatRoom>("room", roomId);
    if (room) await this.vault.put("room", roomId, { ...room, last_message: message.message || message.localMedia?.name || "Attachment", last_message_at: message.created_at, last_message_sender_id: message.sender_id, unread_count: (room.unread_count || 0) + (incoming ? 1 : 0) }, "", message.created_at);
  }
  async send(room: ChatRoom, text: string, file?: { uri: string; name: string; type: string }, reply?: PrivateMessage): Promise<void> {
    if (this.paused) throw new Error("Private history is being restored. Try again when it finishes.");
    if (!this.ready && await this.vault.get("meta", "registered-device") !== this.vault.descriptor.deviceId) throw new Error("Connect once to activate private messaging on this device.");
    if (text.length > 6000) throw new Error("Keep messages under 6,000 characters.");
    if (!text.trim() && !file) return;
    const peer = await this.peer(room.id, true), id = newId();
    let media: LocalMedia | undefined, wire: MediaWire | undefined;
    if (file) {
      if (!allowedMime.test(file.type)) throw new Error("Choose a photo, MP4 video, voice message or PDF.");
      const source = new File(file.uri); if (!source.size || source.size > MAX_PRIVATE_FILE) throw new Error("Choose a file under 4 MB.");
      const bytes = await source.bytes();
      media = await storeMedia(this.vault, bytes, file.name, file.type);
      const key = random(), encrypted = encryptBytes(key, bytes, `cp-attachment-v1:${id}`);
      const prepared = await this.api<{ id: string; url: string }>("/api/messages/private/blobs", "POST", { roomId: room.id, size: encrypted.length });
      const response = await nativeFetch(prepared.url, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: new Uint8Array(encrypted).buffer, signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error("The encrypted attachment could not be uploaded. Try again.");
      wire = { id: prepared.id, key: hex(key), digest: digest(encrypted), size: bytes.length, name: media.name, mime: media.mime };
      key.fill(0);
    }
    const payload: Payload = { kind: "message", text: text.trim(), ...(wire ? { attachment: wire } : {}), ...(reply ? { reply: { id: reply.id, text: (reply.message || "Attachment").slice(0, 1000), senderId: reply.sender_id } } : {}) };
    const envelope = await sealMessage(this.vault.descriptor.identity, peer, room.id, payload, id);
    const message: PrivateMessage = { id, room_id: room.id, sender_id: this.userId, receiver_id: peer.userId, message: payload.text, created_at: envelope.createdAt, delivery: "queued", localMedia: media, reply_to: payload.reply ? { id: payload.reply.id, sender_id: payload.reply.senderId, message: payload.reply.text } : null };
    await this.write(async () => {
      await this.vault.putRows([this.vault.encode("message", id, message, room.id, message.created_at), this.vault.encode("outbox", id, { envelope, blobId: wire?.id || null, messageId: id } satisfies Outgoing, room.id, envelope.createdAt)]);
      await this.updateRoom(room.id, message, false);
    });
    this.changed(); void this.sync();
  }
  private async enqueueControl(roomId: string, peer: PublicIdentity, payload: Payload) {
    const envelope = await sealMessage(this.vault.descriptor.identity, peer, roomId, payload);
    await this.vault.put("outbox", envelope.id, { envelope, blobId: null } satisfies Outgoing, roomId, envelope.createdAt);
  }
  async markRead(roomId: string, shareReceipts: boolean, visibleIds?: string[]) {
    const changed = await this.write(async () => {
      const rows = visibleIds ? (await Promise.all(visibleIds.map(id => this.vault.get<PrivateMessage>("message", id)))).filter((m): m is PrivateMessage => !!m && m.room_id === roomId) : await this.messages(roomId);
      const unread = rows.filter(m => m.sender_id !== this.userId && !m.is_read && !m.legacy);
      if (!unread.length) return false;
      const room = await this.vault.get<ChatRoom>("room", roomId);
      await this.vault.putRows(unread.map(m => this.vault.encode("message", m.id, { ...m, is_read: true }, roomId, m.created_at)));
      if (room) await this.vault.put("room", room.id, { ...room, unread_count: Math.max(0, room.unread_count - unread.length) }, "", room.last_message_at || "");
      if (shareReceipts) {
        const pinned = await this.vault.get<PublicIdentity>("identity-pin", unread[0]!.sender_id);
        if (pinned) for (let i = 0; i < unread.length; i += 50) await this.enqueueControl(roomId, pinned, { kind: "receipt", ids: unread.slice(i, i + 50).map(m => m.id), read: true });
      }
      return true;
    });
    if (changed) this.changed();
  }
  async star(message: PrivateMessage) { await this.vault.put("message", message.id, { ...message, starred: !message.starred, local_updated_at: new Date().toISOString() }, message.room_id, message.created_at); this.changed(); }
  async edit(message: PrivateMessage, text?: string) {
    if (message.legacy || message.sender_id !== this.userId) throw new Error("Only your encrypted messages can be changed.");
    if (text !== undefined && (!text.trim() || text.length > 6000)) throw new Error("Enter a message under 6,000 characters.");
    const peer = await this.peer(message.room_id, true);
    await this.write(async () => {
      await this.enqueueControl(message.room_id, peer, text === undefined ? { kind: "delete", id: message.id } : { kind: "edit", id: message.id, text: text.trim() });
      await this.vault.put("message", message.id, text === undefined ? { ...message, message: null, localMedia: undefined, deleted_at: new Date().toISOString() } : { ...message, message: text.trim(), edited_at: new Date().toISOString() }, message.room_id, message.created_at);
    });
    this.changed(); void this.sync();
  }
  private async receive(envelope: Envelope, blobId: string | null) {
    if (await this.vault.get("received", envelope.id)) return;
    const peer = await this.peer(envelope.roomId);
    const payload = await openMessage<Payload>(this.vault.descriptor.identity, peer, envelope, envelope.roomId);
    const writes: VaultRow[] = [];
    if (payload.kind === "message") {
      if (typeof payload.text !== "string" || payload.text.length > 6000) throw new Error("Invalid private message.");
      let media: LocalMedia | undefined;
      if (payload.attachment) {
        const a = payload.attachment;
        if (a.id !== blobId || !/^[0-9a-f]{64}$/.test(a.key) || !allowedMime.test(a.mime) || typeof a.name !== "string" || !Number.isInteger(a.size) || a.size <= 0 || a.size > MAX_PRIVATE_FILE) throw new Error("Invalid encrypted attachment.");
        const link = await this.api<{ url: string; size: number }>(`/api/messages/private/blobs?id=${encodeURIComponent(a.id)}`);
        if (link.size !== a.size + 40) throw new Error("Attachment size does not match.");
        const response = await nativeFetch(link.url, { signal: AbortSignal.timeout(60000) });
        const bytes = await readExactBytes(response, link.size);
        if (bytes.length !== link.size || digest(bytes) !== a.digest) throw new Error("Attachment integrity check failed.");
        media = await storeMedia(this.vault, decryptBytes(unhex(a.key), bytes, `cp-attachment-v1:${envelope.id}`), a.name, a.mime);
      } else if (blobId) throw new Error("Unexpected attachment metadata.");
      const reply = payload.reply;
      if (reply && (typeof reply.id !== "string" || typeof reply.text !== "string" || reply.text.length > 6000 || ![peer.userId, this.userId].includes(reply.senderId))) throw new Error("Invalid reply metadata.");
      const message: PrivateMessage = { id: envelope.id, room_id: envelope.roomId, sender_id: envelope.senderId, receiver_id: this.userId, message: payload.text, created_at: envelope.createdAt, delivery: "received", is_read: false, localMedia: media, reply_to: reply ? { id: reply.id, message: reply.text, sender_id: reply.senderId } : null };
      writes.push(this.vault.encode("message", message.id, message, message.room_id, message.created_at));
      const room = await this.vault.get<ChatRoom>("room", message.room_id);
      if (room) writes.push(this.vault.encode("room", room.id, { ...room, last_message: message.message || media?.name || "Attachment", last_message_at: message.created_at, last_message_sender_id: message.sender_id, unread_count: (room.unread_count || 0) + 1 }, "", message.created_at));
      const receipt = await sealMessage(this.vault.descriptor.identity, peer, message.room_id, { kind: "receipt", ids: [message.id], read: false });
      writes.push(this.vault.encode("outbox", receipt.id, { envelope: receipt, blobId: null } satisfies Outgoing, receipt.roomId, receipt.createdAt));
    } else if (payload.kind === "receipt") {
      if (!Array.isArray(payload.ids) || payload.ids.length > 50 || typeof payload.read !== "boolean") throw new Error("Invalid receipt.");
      for (const id of payload.ids) {
        if (typeof id !== "string") throw new Error("Invalid receipt.");
        const m = await this.vault.get<PrivateMessage>("message", id);
        if (m?.room_id === envelope.roomId && m.sender_id === this.userId && !m.legacy) writes.push(this.vault.encode("message", m.id, { ...m, delivery: payload.read || m.delivery === "read" ? "read" : "received" }, m.room_id, m.created_at));
      }
    } else if (payload.kind === "edit" || payload.kind === "delete") {
      const m = await this.vault.get<PrivateMessage>("message", payload.id);
      if (!m || m.room_id !== envelope.roomId || m.sender_id !== envelope.senderId || m.legacy) throw new Error("The original message must be received before this change.");
      if (payload.kind === "edit" && (typeof payload.text !== "string" || !payload.text.trim() || payload.text.length > 6000)) throw new Error("Invalid message edit.");
      const value = payload.kind === "delete" ? { ...m, message: null, localMedia: undefined, deleted_at: envelope.createdAt } : m.deleted_at ? m : { ...m, message: payload.text!, edited_at: envelope.createdAt };
      writes.push(this.vault.encode("message", m.id, value, m.room_id, m.created_at));
    } else throw new Error("This message requires a newer version of ComePlayers.");
    writes.push(this.vault.encode("received", envelope.id, { at: envelope.createdAt }, envelope.roomId, envelope.createdAt));
    await this.vault.putRows(writes);
  }
  sync(): Promise<void> {
    if (this.paused) return Promise.resolve();
    if (this.syncing) return this.syncing;
    const run = async () => {
      try {
        if (!this.ready) await this.initialize();
        const outgoing = (await this.vault.db.getAllAsync<VaultRow>("SELECT * FROM records WHERE kind='outbox' ORDER BY sort,id LIMIT 100")).map(row => this.vault.decode<Outgoing>(row));
        const failedRooms = new Set<string>();
        for (const row of outgoing) {
          if (failedRooms.has(row.envelope.roomId)) continue;
          try {
          const result = await this.api<{ received: boolean }>("/api/messages/private/relay", "POST", { envelope: row.envelope, blobId: row.blobId });
          await this.write(async () => {
            if (row.messageId) { const m = await this.vault.get<PrivateMessage>("message", row.messageId); if (m && m.delivery === "queued") await this.vault.put("message", m.id, { ...m, delivery: result.received ? "received" : "sent" }, m.room_id, m.created_at); }
            await this.vault.remove("outbox", row.envelope.id);
          });
          } catch (error) { failedRooms.add(row.envelope.roomId); this.error = error instanceof Error ? error.message : "A queued message will be retried."; }
        }
        const incoming = await this.api<{ messages: { envelope: Envelope; blob_id: string | null }[] }>("/api/messages/private/relay");
        const receipts = [];
        for (const item of incoming.messages) {
          try { await this.write(() => this.receive(item.envelope, item.blob_id)); receipts.push(item.envelope.id); }
          catch (error) { this.error = error instanceof Error ? error.message : "A message could not be received."; }
        }
        if (receipts.length) await this.api("/api/messages/private/relay", "PATCH", { ids: receipts });
        if (!incoming.messages.length && !failedRooms.size) this.error = "";
        if (Date.now() - this.lastCallImport > 60000) await this.migrateCallHistory();
        for (const room of await this.rooms()) { if (!(await this.vault.get("legacy-complete", room.id))) { await this.migrateRoom(room.id); break; } }
      } catch (error) { this.error = error instanceof Error ? error.message : "Private messaging is offline. History remains on this device."; }
      finally { this.changed(); }
    };
    const operation = run().finally(() => { if (this.syncing === operation) this.syncing = null; });
    this.syncing = operation; return operation;
  }
}
