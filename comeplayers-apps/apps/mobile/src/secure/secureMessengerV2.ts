import type { ChatAttachment, ChatMessage, ChatRoom } from "@comeplayers/chat-core";
import { File, Paths } from "expo-file-system";
import { MAX_PRIVATE_FILE, storeLegacyFile, storeMedia, type LocalMedia } from "./mediaStore";
import { verifySecureAttachment, type SecureAttachment } from "./secureAttachment";
import { SecureHistorySync, type DecryptedHistory } from "./secureHistorySync";
import type { Vault, VaultRow } from "./vault";
import { loadCalls, type CallRecord } from "../messagingApi";
import { chatClient } from "../runtime";
import { callInboxPreview, compareRoomActivity, isCallActivity } from "../inboxOrdering";
import { mergeRestoredValue } from "./restoreMerge";

export type SecurePrivateMessage = ChatMessage & {
  localMedia?: LocalMedia; secureAttachment?: SecureAttachment; secureEventId?: string;
  server_created_at?: string;
  delivery?: "queued" | "sent" | "received" | "read"; starred?: boolean; local_updated_at?: string; legacy?: boolean;
};
type Reply = { id: string; text: string; senderId: string };
type MessagePayload = { v: 2; kind: "message"; text: string; attachment?: SecureAttachment; reply?: Reply };
type ControlPayload = { v: 2; kind: "receipt"; ids: string[]; read: boolean }
  | { v: 2; kind: "edit" | "delete"; id: string; text?: string };
type Payload = MessagePayload | ControlPayload | { v: 2; kind: "secure-call-key"; media: "audio" | "video"; key: string };
type LegacyPage = { messages: unknown[]; next: string | null };
const allowedMime = /^(image\/(jpeg|png|webp)|video\/mp4|audio\/(mp4|m4a|mpeg)|application\/pdf)$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function messagePayload(value: unknown): MessagePayload {
  if (!value || typeof value !== "object") throw new Error("Invalid encrypted message.");
  const payload = value as Partial<MessagePayload>;
  if (payload.v !== 2 || payload.kind !== "message" || typeof payload.text !== "string" || payload.text.length > 6000 || (!payload.text.trim() && !payload.attachment)) throw new Error("Invalid encrypted message.");
  if (payload.reply && (!uuid.test(payload.reply.id) || typeof payload.reply.text !== "string" || payload.reply.text.length > 1000 || !uuid.test(payload.reply.senderId))) throw new Error("Invalid encrypted reply.");
  if (payload.attachment) verifySecureAttachment(payload.attachment);
  return payload as MessagePayload;
}

function legacyMessage(value: unknown, roomId: string, userId: string): SecurePrivateMessage {
  if (!value || typeof value !== "object") throw new Error("Invalid legacy message.");
  const item = value as Partial<ChatMessage>;
  if (typeof item.id !== "string" || !uuid.test(item.id) || item.room_id !== roomId
    || typeof item.sender_id !== "string" || !uuid.test(item.sender_id) || typeof item.receiver_id !== "string" || !uuid.test(item.receiver_id)
    || (item.sender_id !== userId && item.receiver_id !== userId) || (item.message !== null && typeof item.message !== "string")
    || (typeof item.message === "string" && item.message.length > 20000) || typeof item.created_at !== "string" || !Number.isFinite(Date.parse(item.created_at))) throw new Error("Invalid legacy message.");
  let attachment: ChatAttachment | null = null;
  if (item.attachment && !item.deleted_at) {
    const candidate = item.attachment;
    if (!Number.isSafeInteger(candidate.id) || candidate.id < 1 || typeof candidate.file_name !== "string" || !candidate.file_name.trim() || candidate.file_name.length > 180
      || typeof candidate.mime_type !== "string" || candidate.mime_type.length > 100 || !Number.isSafeInteger(candidate.size_bytes) || candidate.size_bytes < 1 || candidate.size_bytes > 100 * 1024 * 1024) throw new Error("Invalid legacy attachment.");
    attachment = candidate;
  }
  if (item.reply_to && (typeof item.reply_to.id !== "string" || !uuid.test(item.reply_to.id) || typeof item.reply_to.sender_id !== "string" || !uuid.test(item.reply_to.sender_id)
    || (item.reply_to.message !== null && typeof item.reply_to.message !== "string"))) throw new Error("Invalid legacy reply.");
  const own = item.sender_id === userId;
  return {
    ...item as ChatMessage,
    message: item.deleted_at ? null : item.message,
    attachment,
    is_read: own || item.is_read === true,
    delivery: own ? item.is_read ? "read" : "sent" : "received",
    legacy: true,
  };
}

export class SecureMessengerV2 {
  private listeners = new Set<() => void>();
  private serial: Promise<unknown> = Promise.resolve();
  private syncing: Promise<void> | null = null;
  private paused = false;
  readonly ready = true;
  error = "";
  constructor(readonly vault: Vault, readonly history: SecureHistorySync) {}
  get userId() { return this.vault.descriptor.identity.userId; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private changed() { for (const listener of this.listeners) listener(); }
  private write<T>(work: () => Promise<T>): Promise<T> { const next = this.serial.then(work, work); this.serial = next.catch(() => undefined); return next; }
  async pause() { this.paused = true; await this.syncing; await this.serial; }
  resume() { this.paused = false; void this.sync(); }
  api<T>(path: string, method = "GET", data?: unknown) { return this.history.api<T>(path, method, data); }
  securityCode(roomId: string) { return this.history.securityCode(roomId); }
  async messages(roomId: string, before?: string) { return this.vault.list<SecurePrivateMessage>("message-v2", roomId, 80, before); }
  async rooms() { return this.vault.list<ChatRoom>("room", undefined, 100); }
  async saveRooms(rooms: ChatRoom[]): Promise<ChatRoom[]> {
    return this.write(async () => {
      const result: ChatRoom[] = [], writes: VaultRow[] = [];
      const ids = rooms.map(room => room.id);
      const [localRooms, latestMessages, unreadCounts, initializedRooms] = await Promise.all([
        this.vault.getMany<ChatRoom>("room", ids),
        this.vault.latestByRoom<SecurePrivateMessage>("message-v2", ids),
        this.vault.getMany<number>("room-unread-v2", ids),
        this.vault.getMany<boolean>("room-unread-initialized-v2", ids),
      ]);
      for (const room of rooms) {
        const local = localRooms.get(room.id) ?? null;
        const latest = latestMessages.get(room.id);
        const storedUnread = unreadCounts.get(room.id) ?? null;
        const initialized = initializedRooms.get(room.id);
        const unread = initialized ? storedUnread ?? local?.unread_count ?? 0 : (storedUnread || 0) + (room.unread_count || 0);
        const serverTime = Date.parse(room.last_message_at || "") || 0;
        const localTime = Date.parse(latest?.created_at || "") || 0;
        const latestReceivedTime = Date.parse(latest?.server_created_at || "") || 0;
        // A call supersedes an older message. For messages, the server receive
        // time can be newer than the signed timestamp after an offline send, so
        // compare received timestamps when available. Older vault rows without
        // that field retain their decrypted preview until replay updates them.
        const showCall = isCallActivity(room) && serverTime >= localTime;
        const waitingForMessage = !isCallActivity(room) && !!room.last_message_at && (!latest || (!!latestReceivedTime && serverTime > latestReceivedTime));
        const lastMessageAt = latest && localTime > serverTime ? latest.created_at : room.last_message_at;
        const merged = showCall
          ? { ...room, last_message: callInboxPreview(room), unread_count: unread }
          : waitingForMessage
            ? { ...room, activity_kind: "message" as const, activity_preview: null, last_message: "Pesan baru", unread_count: unread }
          : latest
            ? { ...room, activity_kind: "message" as const, activity_preview: null, last_message: latest.deleted_at ? "Message deleted" : latest.message || latest.localMedia?.name || latest.secureAttachment?.name || "Attachment", last_message_at: lastMessageAt, last_message_sender_id: latest.sender_id, unread_count: unread }
            : { ...room, last_message: room.last_message || (room.last_message_at ? "Pesan baru" : null), unread_count: unread };
        if (storedUnread !== unread) writes.push(this.vault.encode("room-unread-v2", room.id, unread));
        if (!initialized) writes.push(this.vault.encode("room-unread-initialized-v2", room.id, true));
        if (JSON.stringify(local) !== JSON.stringify(merged)) writes.push(this.vault.encode("room", room.id, merged, "", merged.last_message_at || merged.created_at || ""));
        result.push(merged);
      }
      if (writes.length) await this.vault.putRows(writes);
      return result.sort(compareRoomActivity);
    });
  }
  private receiver(room: ChatRoom, sender: string) { return room.buyer_id === sender ? room.seller_id : room.buyer_id; }
  private async apply(entry: DecryptedHistory<unknown>): Promise<void> {
    const value = entry.payload as Partial<Payload>;
    if (!value || value.v !== 2 || typeof value.kind !== "string") throw new Error("This encrypted event requires a newer ComePlayers version.");
    if (value.kind === "secure-call-key") return;
    const writes: VaultRow[] = [];
    if (value.kind === "message") {
      const payload = messagePayload(value);
      if ((payload.attachment?.id || null) !== entry.event.blobId) throw new Error("Encrypted attachment routing does not match its message.");
      const room = await this.vault.get<ChatRoom>("room", entry.event.roomId);
      const existing = await this.vault.get<SecurePrivateMessage>("message-v2", entry.event.id);
      const incoming = entry.event.senderId !== this.userId && !existing;
      const storedUnread = await this.vault.get<number>("room-unread-v2", entry.event.roomId);
      const initialized = await this.vault.get<boolean>("room-unread-initialized-v2", entry.event.roomId);
      const unread = (storedUnread === null ? initialized ? room?.unread_count ?? 0 : 0 : storedUnread) + (incoming ? 1 : 0);
      const message: SecurePrivateMessage = {
        id: entry.event.id, room_id: entry.event.roomId, sender_id: entry.event.senderId,
        receiver_id: room ? this.receiver(room, entry.event.senderId) : entry.event.senderId === this.userId ? "" : this.userId,
        message: payload.text, created_at: entry.event.createdAt, delivery: entry.queued ? "queued" : entry.event.senderId === this.userId ? "sent" : "received",
        server_created_at: entry.serverCreatedAt || existing?.server_created_at,
        is_read: entry.event.senderId === this.userId, secureAttachment: payload.attachment, secureEventId: entry.event.id,
        localMedia: existing?.localMedia,
        reply_to: payload.reply ? { id: payload.reply.id, message: payload.reply.text, sender_id: payload.reply.senderId } : null,
      };
      // History replay after restore must preserve local edits, deletions,
      // stars and monotonic read receipts already present on this device.
      const merged = existing ? mergeRestoredValue("message-v2", existing, message) as SecurePrivateMessage : message;
      writes.push(this.vault.encode("message-v2", message.id, entry.serverCreatedAt ? { ...merged, server_created_at: entry.serverCreatedAt } : merged, message.room_id, message.created_at));
      if (incoming) writes.push(this.vault.encode("room-unread-v2", message.room_id, unread));
      if (room) writes.push(this.vault.encode("room", room.id, mergeRestoredValue("room", room, { ...room, last_message: message.message || payload.attachment?.name || "Attachment", last_message_at: message.created_at, last_message_sender_id: message.sender_id, unread_count: unread }), "", room.last_message_at && room.last_message_at > message.created_at ? room.last_message_at : message.created_at));
    } else if (value.kind === "receipt") {
      if (!Array.isArray(value.ids) || value.ids.length > 50 || typeof value.read !== "boolean" || value.ids.some(id => typeof id !== "string" || !uuid.test(id)) || new Set(value.ids).size !== value.ids.length) throw new Error("Invalid encrypted receipt.");
      let readIncoming = 0;
      for (const id of value.ids) {
        const message = await this.vault.get<SecurePrivateMessage>("message-v2", id);
        if (!message || message.room_id !== entry.event.roomId) continue;
        if (message.sender_id === this.userId && entry.event.senderId !== this.userId) writes.push(this.vault.encode("message-v2", id, { ...message, delivery: value.read || message.delivery === "read" ? "read" : "received" }, message.room_id, message.created_at));
        else if (value.read && entry.event.senderId === this.userId && message.sender_id !== this.userId && !message.is_read) {
          readIncoming += 1;
          writes.push(this.vault.encode("message-v2", id, { ...message, is_read: true }, message.room_id, message.created_at));
        }
      }
      if (readIncoming) {
        const room = await this.vault.get<ChatRoom>("room", entry.event.roomId);
        const storedUnread = await this.vault.get<number>("room-unread-v2", entry.event.roomId);
        const unread = Math.max(0, (storedUnread || 0) - readIncoming);
        writes.push(this.vault.encode("room-unread-v2", entry.event.roomId, unread));
        if (room) writes.push(this.vault.encode("room", room.id, { ...room, unread_count: unread }, "", room.last_message_at || ""));
      }
    } else if (value.kind === "edit" || value.kind === "delete") {
      if (typeof value.id !== "string" || !uuid.test(value.id) || (value.kind === "edit" && (typeof value.text !== "string" || !value.text.trim() || value.text.length > 6000))) throw new Error("Invalid encrypted message change.");
      const message = await this.vault.get<SecurePrivateMessage>("message-v2", value.id);
      if (!message || message.room_id !== entry.event.roomId || message.sender_id !== entry.event.senderId) throw new Error("The original encrypted message is unavailable.");
      const changed = value.kind === "delete" ? { ...message, message: null, localMedia: undefined, secureAttachment: undefined, deleted_at: entry.event.createdAt } : message.deleted_at ? message : { ...message, message: value.text!.trim(), edited_at: entry.event.createdAt };
      writes.push(this.vault.encode("message-v2", message.id, mergeRestoredValue("message-v2", message, changed), message.room_id, message.created_at));
    } else throw new Error("This encrypted event requires a newer ComePlayers version.");
    if (writes.length) await this.vault.putRows(writes);
  }
  private async migrateLegacyPage(): Promise<boolean> {
    for (const room of await this.rooms()) {
      if (await this.vault.get<boolean>("legacy-complete-v2", room.id)) continue;
      const before = await this.vault.get<string>("legacy-cursor-v2", room.id);
      const result = await this.api<LegacyPage>(`/api/messages/secure/history/legacy?roomId=${encodeURIComponent(room.id)}${before ? `&before=${encodeURIComponent(before)}` : ""}`);
      if (!Array.isArray(result.messages) || result.messages.length > 100 || (result.next !== null && (typeof result.next !== "string" || !Number.isFinite(Date.parse(result.next)) || result.next === before))) throw new Error("Invalid legacy history page.");
      const writes: VaultRow[] = [];
      for (const raw of result.messages) {
        const message = legacyMessage(raw, room.id, this.userId);
        if (!(await this.vault.get<SecurePrivateMessage>("message-v2", message.id))) writes.push(this.vault.encode("message-v2", message.id, message, room.id, message.created_at));
      }
      if (result.next) writes.push(this.vault.encode("legacy-cursor-v2", room.id, result.next));
      else writes.push(this.vault.encode("legacy-complete-v2", room.id, true));
      if (writes.length) await this.vault.putRows(writes);
      if (result.messages.length) this.changed();
      return true;
    }
    return false;
  }
  sync(): Promise<void> {
    if (this.paused) return Promise.resolve();
    if (this.syncing) return this.syncing;
    const operation = this.write(async () => {
      try {
        let deliveryError: unknown, migrationError: unknown;
        await this.history.flushOutbox().catch(error => { deliveryError = error; return 0; });
        const entries = await this.history.sync();
        for (const entry of entries) await this.apply(entry);
        for (let page = 0; page < 3; page++) if (!(await this.migrateLegacyPage().catch(error => { migrationError = error; return false; }))) break;
        this.error = deliveryError instanceof Error ? deliveryError.message : migrationError instanceof Error ? `Old history import: ${migrationError.message}` : "";
        if (entries.length || deliveryError || migrationError) this.changed();
      } catch (error) { this.error = error instanceof Error ? error.message : "Encrypted history could not synchronize."; this.changed(); throw error; }
    });
    let tracked: Promise<void>;
    tracked = operation.finally(() => { if (this.syncing === tracked) this.syncing = null; });
    this.syncing = tracked;
    return tracked;
  }
  async send(room: ChatRoom, text: string, file?: { uri: string; name: string; type: string }, reply?: SecurePrivateMessage): Promise<void> {
    if (this.paused) throw new Error("Encrypted history is paused.");
    if (text.length > 6000 || (!text.trim() && !file)) { if (text.length > 6000) throw new Error("Keep messages under 6,000 characters."); return; }
    const base: Omit<MessagePayload, "attachment"> = { v: 2, kind: "message", text: text.trim(), ...(reply ? { reply: { id: reply.id, text: (reply.message || "Attachment").slice(0, 1000), senderId: reply.sender_id } } : {}) };
    let result: DecryptedHistory<MessagePayload>, localMedia: LocalMedia | undefined;
    if (file) {
      if (!allowedMime.test(file.type)) throw new Error("Choose a photo, MP4 video, voice message or PDF.");
      if (!file.name.trim() || file.name.length > 180) throw new Error("Choose a file with a valid name under 180 characters.");
      const source = new File(file.uri); if (!source.size || source.size > MAX_PRIVATE_FILE) throw new Error("Choose a file under 8 MB.");
      const bytes = await source.bytes(); localMedia = await storeMedia(this.vault, bytes, file.name, file.type);
      result = await this.history.sendAttachment(room.id, base, { bytes, name: file.name, mime: file.type }); bytes.fill(0);
    } else result = await this.history.send(room.id, base, null, true) as DecryptedHistory<MessagePayload>;
    await this.apply(result);
    if (localMedia) {
      const saved = await this.vault.get<SecurePrivateMessage>("message-v2", result.event.id);
      if (saved) await this.vault.put("message-v2", saved.id, { ...saved, localMedia }, saved.room_id, saved.created_at);
    }
    this.changed(); void this.sync().catch(() => undefined);
  }
  async downloadMedia(message: SecurePrivateMessage): Promise<void> {
    if (message.localMedia) return;
    let localMedia: LocalMedia;
    if (message.secureAttachment && message.secureEventId) {
      const entry = await this.vault.get<DecryptedHistory<{ attachment?: unknown }>>("history-event-v2", message.secureEventId);
      if (!entry) throw new Error("Encrypted attachment metadata is unavailable.");
      const opened = await this.history.downloadAttachment(entry);
      localMedia = await storeMedia(this.vault, opened.bytes, opened.attachment.name, opened.attachment.mime);
      opened.bytes.fill(0);
    } else if (message.legacy && message.attachment?.id) {
      const link = await chatClient.getAttachmentLink(message.attachment.id);
      const file = new File(Paths.cache, `cp-import-${message.id}`);
      try {
        await File.downloadFileAsync(link.url, file);
        if (file.size !== message.attachment.size_bytes) throw new Error("The old attachment download is incomplete.");
        localMedia = await storeLegacyFile(this.vault, file, message.attachment.file_name, message.attachment.mime_type, message.id);
      } finally { if (file.exists) file.delete(); }
    } else return;
    await this.vault.put("message-v2", message.id, { ...message, localMedia }, message.room_id, message.created_at); this.changed();
  }
  async markRead(roomId: string, shareReceipts: boolean, ids: string[] = []) {
    const rows = (await Promise.all(ids.map(id => this.vault.get<SecurePrivateMessage>("message-v2", id)))).filter((item): item is SecurePrivateMessage => !!item && item.room_id === roomId && item.sender_id !== this.userId && !item.is_read);
    if (!rows.length) return;
    const legacy = rows.filter(item => item.legacy);
    for (let index = 0; index < legacy.length; index += 100) await this.api("/api/messages/secure/history/legacy", "POST", { roomId, ids: legacy.slice(index, index + 100).map(item => item.id) });
    const room = await this.vault.get<ChatRoom>("room", roomId);
    const storedUnread = await this.vault.get<number>("room-unread-v2", roomId);
    const unread = Math.max(0, (storedUnread === null ? room?.unread_count ?? rows.length : storedUnread) - rows.length);
    const writes = rows.map(item => this.vault.encode("message-v2", item.id, { ...item, is_read: true }, roomId, item.created_at));
    writes.push(this.vault.encode("room-unread-v2", roomId, unread));
    if (room) writes.push(this.vault.encode("room", roomId, { ...room, unread_count: unread }, "", room.last_message_at || ""));
    await this.vault.putRows(writes);
    const secureRows = rows.filter(item => !item.legacy);
    if (shareReceipts) for (let index = 0; index < secureRows.length; index += 50) await this.history.send(roomId, { v: 2, kind: "receipt", ids: secureRows.slice(index, index + 50).map(item => item.id), read: true } satisfies ControlPayload);
    this.changed();
  }
  async star(message: SecurePrivateMessage) { await this.vault.put("message-v2", message.id, { ...message, starred: !message.starred, local_updated_at: new Date().toISOString() }, message.room_id, message.created_at); this.changed(); }
  async edit(message: SecurePrivateMessage, text?: string) {
    if (message.sender_id !== this.userId) throw new Error("Only your encrypted messages can be changed.");
    if (text !== undefined && (!text.trim() || text.length > 6000)) throw new Error("Enter a message under 6,000 characters.");
    const result = await this.history.send(message.room_id, { v: 2, kind: text === undefined ? "delete" : "edit", id: message.id, ...(text === undefined ? {} : { text: text.trim() }) } satisfies ControlPayload);
    await this.apply(result); this.changed();
  }
  async prepareCall(roomId: string, media: "audio" | "video") { return this.history.createCallKey(roomId, media); }
  callKey(eventId: string, roomId: string, media: "audio" | "video") { return this.history.openCallKey(eventId, roomId, media); }
  async migrateCallHistory() {
    const { calls } = await loadCalls();
    await this.vault.putRows(calls.map(call => this.vault.encode("call-history", call.id, { ...call, encryption_envelope: undefined }, call.room_id, call.created_at)));
    if (calls.length) this.changed();
  }
  async scheduleCall(room: ChatRoom, scheduledAt: string) {
    const offer = await this.prepareCall(room.id, "audio");
    const { call } = await this.api<{ call: CallRecord }>("/api/messages/calls", "POST", { roomId: room.id, media: "audio", scheduledAt, secureEventId: offer.eventId });
    await this.vault.put("call-history", call.id, { ...call, other: room.other }, room.id, call.created_at); this.changed();
  }
  async cancelScheduledCall(id: string) {
    const call = await this.vault.get<CallRecord>("call-history", id); if (!call) throw new Error("Scheduled call is unavailable.");
    const result = await this.api<{ status: CallRecord["status"] }>("/api/messages/calls", "PATCH", { id, action: "end" });
    await this.vault.put("call-history", id, { ...call, status: result.status, ended_at: new Date().toISOString() }, call.room_id, call.created_at); this.changed();
  }
}
