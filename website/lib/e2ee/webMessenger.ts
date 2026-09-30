import type { BrowserVault } from "./browserVault";
import {
  SecureHistorySync,
  type DecryptedHistory,
} from "./historySync";
import {
  MAX_SECURE_ATTACHMENT,
  verifySecureAttachment,
  type SecureAttachment,
} from "./secureAttachment";

export type SecureProfile = {
  id: string;
  cp_number?: string | null;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
};

export type SecureRoom = {
  id: string;
  buyer_id: string;
  seller_id: string;
  room_type?: string | null;
  status?: string | null;
  created_at?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  last_message_sender_id?: string | null;
  unread_count?: number;
  other?: SecureProfile | null;
};

export type LegacyAttachment = {
  id: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  moderation_status?: string | null;
  deleted_at?: string | null;
};

export type SecurePrivateMessage = {
  id: string;
  room_id: string;
  sender_id: string;
  receiver_id: string;
  message: string | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  is_read?: boolean | null;
  read_at?: string | null;
  attachment?: LegacyAttachment | null;
  reply_to?: { id: string; message: string | null; sender_id: string } | null;
  secureAttachment?: SecureAttachment;
  secureEventId?: string;
  localMediaId?: string;
  delivery?: "queued" | "sent" | "received" | "read";
  starred?: boolean;
  legacy?: boolean;
};

type Reply = { id: string; text: string; senderId: string };
type MessagePayload = {
  v: 2;
  kind: "message";
  text: string;
  attachment?: SecureAttachment;
  reply?: Reply;
};
type ControlPayload =
  | { v: 2; kind: "receipt"; ids: string[]; read: boolean }
  | { v: 2; kind: "edit" | "delete"; id: string; text?: string };
type Payload =
  | MessagePayload
  | ControlPayload
  | { v: 2; kind: "secure-call-key"; media: "audio" | "video"; key: string };
type LegacyPage = { messages: unknown[]; next: string | null };

const allowedMime = /^(image\/(jpeg|png|webp)|video\/mp4|audio\/(mp4|m4a|mpeg)|application\/pdf)$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function messagePayload(value: unknown): MessagePayload {
  if (!value || typeof value !== "object") throw new Error("Invalid encrypted message.");
  const payload = value as Partial<MessagePayload>;
  if (
    payload.v !== 2 ||
    payload.kind !== "message" ||
    typeof payload.text !== "string" ||
    payload.text.length > 6000 ||
    (!payload.text.trim() && !payload.attachment)
  ) {
    throw new Error("Invalid encrypted message.");
  }
  if (
    payload.reply &&
    (
      !uuid.test(payload.reply.id) ||
      typeof payload.reply.text !== "string" ||
      payload.reply.text.length > 1000 ||
      !uuid.test(payload.reply.senderId)
    )
  ) {
    throw new Error("Invalid encrypted reply.");
  }
  if (payload.attachment) verifySecureAttachment(payload.attachment);
  return payload as MessagePayload;
}

function legacyMessage(value: unknown, roomId: string, userId: string): SecurePrivateMessage {
  if (!value || typeof value !== "object") throw new Error("Invalid older message.");
  const item = value as Partial<SecurePrivateMessage>;
  if (
    typeof item.id !== "string" ||
    !uuid.test(item.id) ||
    item.room_id !== roomId ||
    typeof item.sender_id !== "string" ||
    !uuid.test(item.sender_id) ||
    typeof item.receiver_id !== "string" ||
    !uuid.test(item.receiver_id) ||
    (item.sender_id !== userId && item.receiver_id !== userId) ||
    (item.message !== null && typeof item.message !== "string") ||
    (typeof item.message === "string" && item.message.length > 20_000) ||
    typeof item.created_at !== "string" ||
    !Number.isFinite(Date.parse(item.created_at))
  ) {
    throw new Error("Invalid older message.");
  }
  let attachment: LegacyAttachment | null = null;
  if (item.attachment && !item.deleted_at) {
    const candidate = item.attachment;
    if (
      !Number.isSafeInteger(candidate.id) ||
      candidate.id < 1 ||
      typeof candidate.file_name !== "string" ||
      !candidate.file_name.trim() ||
      candidate.file_name.length > 180 ||
      typeof candidate.mime_type !== "string" ||
      candidate.mime_type.length > 100 ||
      !Number.isSafeInteger(candidate.size_bytes) ||
      candidate.size_bytes < 1 ||
      candidate.size_bytes > 100 * 1024 * 1024
    ) {
      throw new Error("Invalid older attachment.");
    }
    attachment = candidate;
  }
  if (
    item.reply_to &&
    (
      typeof item.reply_to.id !== "string" ||
      !uuid.test(item.reply_to.id) ||
      typeof item.reply_to.sender_id !== "string" ||
      !uuid.test(item.reply_to.sender_id) ||
      (item.reply_to.message !== null && typeof item.reply_to.message !== "string")
    )
  ) {
    throw new Error("Invalid older reply.");
  }
  const own = item.sender_id === userId;
  return {
    ...(item as SecurePrivateMessage),
    message: item.deleted_at ? null : item.message ?? null,
    attachment,
    is_read: own || item.is_read === true,
    delivery: own ? (item.is_read ? "read" : "sent") : "received",
    legacy: true,
  };
}

export class WebMessenger {
  private serial: Promise<unknown> = Promise.resolve();
  private syncing: Promise<boolean> | null = null;
  error = "";

  constructor(
    readonly vault: BrowserVault,
    readonly history: SecureHistorySync,
  ) {}

  get userId() {
    return this.vault.userId;
  }

  private write<T>(work: () => Promise<T>): Promise<T> {
    const next = this.serial.then(work, work);
    this.serial = next.catch(() => undefined);
    return next;
  }

  api<T>(path: string, method = "GET", data?: unknown) {
    return this.history.api<T>(path, method, data);
  }

  securityCode(roomId: string) {
    return this.history.securityCode(roomId);
  }

  async saveRoom(room: SecureRoom): Promise<void> {
    if (room.room_type === "group") throw new Error("Community messages use a separate system.");
    await this.vault.put("room", room.id, room, "", room.last_message_at || room.created_at || "");
  }

  async messages(roomId: string): Promise<SecurePrivateMessage[]> {
    return (await this.vault.list<SecurePrivateMessage>("message-v2", roomId, 1000)).map((row) => row.value);
  }

  private receiver(room: SecureRoom | null, sender: string) {
    if (!room) return sender === this.userId ? "" : this.userId;
    return room.buyer_id === sender ? room.seller_id : room.buyer_id;
  }

  private async apply(entry: DecryptedHistory<unknown>): Promise<void> {
    const value = entry.payload as Partial<Payload>;
    if (!value || value.v !== 2 || typeof value.kind !== "string") {
      throw new Error("This encrypted event requires a newer ComePlayers version.");
    }
    if (value.kind === "secure-call-key") return;
    if (value.kind === "message") {
      const payload = messagePayload(value);
      if ((payload.attachment?.id || null) !== entry.event.blobId) {
        throw new Error("Encrypted attachment routing does not match its message.");
      }
      const room = await this.vault.get<SecureRoom>("room", entry.event.roomId);
      const existing = await this.vault.get<SecurePrivateMessage>("message-v2", entry.event.id);
      const message: SecurePrivateMessage = {
        id: entry.event.id,
        room_id: entry.event.roomId,
        sender_id: entry.event.senderId,
        receiver_id: this.receiver(room, entry.event.senderId),
        message: payload.text,
        created_at: entry.event.createdAt,
        delivery: entry.queued ? "queued" : entry.event.senderId === this.userId ? "sent" : "received",
        is_read: entry.event.senderId === this.userId,
        secureAttachment: payload.attachment,
        secureEventId: entry.event.id,
        localMediaId: existing?.localMediaId,
        reply_to: payload.reply
          ? { id: payload.reply.id, message: payload.reply.text, sender_id: payload.reply.senderId }
          : null,
      };
      await this.vault.put("message-v2", message.id, message, message.room_id, message.created_at);
      if (room) {
        await this.vault.put("room", room.id, {
          ...room,
          last_message: message.message || payload.attachment?.name || "Attachment",
          last_message_at: message.created_at,
          last_message_sender_id: message.sender_id,
        }, "", message.created_at);
      }
      return;
    }
    if (value.kind === "receipt") {
      if (
        !Array.isArray(value.ids) ||
        value.ids.length > 50 ||
        typeof value.read !== "boolean" ||
        value.ids.some((id) => typeof id !== "string" || !uuid.test(id)) ||
        new Set(value.ids).size !== value.ids.length
      ) {
        throw new Error("Invalid encrypted receipt.");
      }
      for (const id of value.ids) {
        const message = await this.vault.get<SecurePrivateMessage>("message-v2", id);
        if (!message || message.room_id !== entry.event.roomId) continue;
        if (message.sender_id === this.userId && entry.event.senderId !== this.userId) {
          await this.vault.put("message-v2", id, {
            ...message,
            delivery: value.read || message.delivery === "read" ? "read" : "received",
          }, message.room_id, message.created_at);
        } else if (
          value.read &&
          entry.event.senderId === this.userId &&
          message.sender_id !== this.userId &&
          !message.is_read
        ) {
          await this.vault.put("message-v2", id, { ...message, is_read: true }, message.room_id, message.created_at);
        }
      }
      return;
    }
    if (value.kind === "edit" || value.kind === "delete") {
      if (
        typeof value.id !== "string" ||
        !uuid.test(value.id) ||
        (value.kind === "edit" && (typeof value.text !== "string" || !value.text.trim() || value.text.length > 6000))
      ) {
        throw new Error("Invalid encrypted message change.");
      }
      const message = await this.vault.get<SecurePrivateMessage>("message-v2", value.id);
      if (!message || message.room_id !== entry.event.roomId || message.sender_id !== entry.event.senderId) {
        throw new Error("The original encrypted message is unavailable.");
      }
      const changed = value.kind === "delete"
        ? {
            ...message,
            message: null,
            localMediaId: undefined,
            secureAttachment: undefined,
            deleted_at: entry.event.createdAt,
          }
        : message.deleted_at
          ? message
          : { ...message, message: value.text!.trim(), edited_at: entry.event.createdAt };
      await this.vault.put("message-v2", message.id, changed, message.room_id, message.created_at);
      return;
    }
    throw new Error("This encrypted event requires a newer ComePlayers version.");
  }

  private async migrateLegacyPage(roomId: string): Promise<boolean> {
    if (await this.vault.get<boolean>("legacy-complete-v2", roomId)) return false;
    const before = await this.vault.get<string>("legacy-cursor-v2", roomId);
    const result = await this.api<LegacyPage>(
      `/api/messages/secure/history/legacy?roomId=${encodeURIComponent(roomId)}${before ? `&before=${encodeURIComponent(before)}` : ""}`,
    );
    if (
      !Array.isArray(result.messages) ||
      result.messages.length > 100 ||
      (result.next !== null &&
        (typeof result.next !== "string" || !Number.isFinite(Date.parse(result.next)) || result.next === before))
    ) {
      throw new Error("Invalid older history page.");
    }
    for (const raw of result.messages) {
      const message = legacyMessage(raw, roomId, this.userId);
      if (!(await this.vault.get<SecurePrivateMessage>("message-v2", message.id))) {
        await this.vault.put("message-v2", message.id, message, roomId, message.created_at);
      }
    }
    if (result.next) await this.vault.put("legacy-cursor-v2", roomId, result.next);
    else await this.vault.put("legacy-complete-v2", roomId, true);
    return result.messages.length > 0 || result.next !== null;
  }

  sync(roomId: string): Promise<boolean> {
    if (this.syncing) return this.syncing;
    const operation = this.write(async () => {
      let deliveryError: unknown;
      let migrationError: unknown;
      let migrated = false;
      await this.history.flushOutbox().catch((error) => {
        deliveryError = error;
        return 0;
      });
      const entries = await this.history.sync();
      for (const entry of entries) await this.apply(entry);
      for (let page = 0; page < 10; page += 1) {
        const more = await this.migrateLegacyPage(roomId).catch((error) => {
          migrationError = error;
          return false;
        });
        if (!more) break;
        migrated = true;
      }
      this.error = deliveryError instanceof Error
        ? deliveryError.message
        : migrationError instanceof Error
          ? `Older history import: ${migrationError.message}`
          : "";
      return entries.length > 0 || migrated;
    });
    const tracked: Promise<boolean> = operation.finally(() => {
      if (this.syncing === tracked) this.syncing = null;
    });
    this.syncing = tracked;
    return tracked;
  }

  async send(
    room: SecureRoom,
    text: string,
    file?: File,
    reply?: SecurePrivateMessage,
  ): Promise<void> {
    if (text.length > 6000) throw new Error("Keep messages under 6,000 characters.");
    if (!text.trim() && !file) return;
    const base: Omit<MessagePayload, "attachment"> = {
      v: 2,
      kind: "message",
      text: text.trim(),
      ...(reply
        ? {
            reply: {
              id: reply.id,
              text: (reply.message || "Attachment").slice(0, 1000),
              senderId: reply.sender_id,
            },
          }
        : {}),
    };
    let result: DecryptedHistory<MessagePayload>;
    if (file) {
      if (!allowedMime.test(file.type)) {
        throw new Error("Choose a JPEG, PNG, WebP, MP4, audio file or PDF.");
      }
      if (!file.name.trim() || file.name.length > 180) {
        throw new Error("Choose a file with a valid name under 180 characters.");
      }
      if (!file.size || file.size > MAX_SECURE_ATTACHMENT) throw new Error("Choose a file up to 8 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        result = await this.history.sendAttachment(room.id, base, {
          bytes,
          name: file.name,
          mime: file.type,
        });
      } finally {
        bytes.fill(0);
      }
    } else {
      result = await this.history.send(room.id, base, null, true) as DecryptedHistory<MessagePayload>;
    }
    await this.apply(result);
  }

  async downloadMedia(message: SecurePrivateMessage): Promise<{ url: string; name: string; mime: string }> {
    if (!message.secureAttachment || !message.secureEventId) {
      throw new Error("Only new end-to-end encrypted attachments can be opened here.");
    }
    const id = `media:${message.id}`;
    let bytes = await this.vault.getBinary("media-v2", id);
    if (!bytes) {
      const entry = await this.vault.get<DecryptedHistory<{ attachment?: unknown }>>(
        "history-event-v2",
        message.secureEventId,
      );
      if (!entry) throw new Error("Encrypted attachment metadata is unavailable.");
      const opened = await this.history.downloadAttachment(entry);
      bytes = opened.bytes;
      await this.vault.putBinary("media-v2", id, bytes, message.room_id, message.created_at);
    }
    const attachment = message.secureAttachment;
    const blobBytes = new Uint8Array(bytes.byteLength);
    blobBytes.set(bytes);
    return {
      url: URL.createObjectURL(new Blob([blobBytes], { type: attachment.mime })),
      name: attachment.name,
      mime: attachment.mime,
    };
  }

  async markRead(roomId: string, shareReceipts: boolean): Promise<void> {
    const rows = (await this.messages(roomId)).filter(
      (message) => message.sender_id !== this.userId && !message.is_read,
    );
    if (!rows.length) return;
    const legacy = rows.filter((message) => message.legacy);
    for (let index = 0; index < legacy.length; index += 100) {
      await this.api("/api/messages/secure/history/legacy", "POST", {
        roomId,
        ids: legacy.slice(index, index + 100).map((item) => item.id),
      });
    }
    for (const message of rows) {
      await this.vault.put("message-v2", message.id, { ...message, is_read: true }, roomId, message.created_at);
    }
    const secureRows = rows.filter((message) => !message.legacy);
    if (shareReceipts) {
      for (let index = 0; index < secureRows.length; index += 50) {
        const result = await this.history.send(roomId, {
          v: 2,
          kind: "receipt",
          ids: secureRows.slice(index, index + 50).map((item) => item.id),
          read: true,
        } satisfies ControlPayload);
        await this.apply(result);
      }
    }
  }

  async edit(message: SecurePrivateMessage, text?: string): Promise<void> {
    if (message.sender_id !== this.userId || message.legacy) {
      throw new Error("Only your new encrypted messages can be changed.");
    }
    if (text !== undefined && (!text.trim() || text.length > 6000)) {
      throw new Error("Enter a message under 6,000 characters.");
    }
    const result = await this.history.send(message.room_id, {
      v: 2,
      kind: text === undefined ? "delete" : "edit",
      id: message.id,
      ...(text === undefined ? {} : { text: text.trim() }),
    } satisfies ControlPayload);
    await this.apply(result);
  }

  async star(message: SecurePrivateMessage): Promise<void> {
    await this.vault.put("message-v2", message.id, { ...message, starred: !message.starred }, message.room_id, message.created_at);
  }

  prepareCall(roomId: string, media: "audio" | "video") {
    return this.history.createCallKey(roomId, media);
  }

  callKey(eventId: string, roomId: string, media: "audio" | "video") {
    return this.history.openCallKey(eventId, roomId, media);
  }
}
