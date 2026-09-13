import type {
  ChatAttachment,
  ChatRoom,
  ChatStreamState,
  Conversation,
  PartyInvitation,
  PublicProfile,
} from "./types";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export type TokenProvider = (forceRefresh?: boolean) => Promise<string | null>;

function deadline<T>(operation: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Connection timed out. Please try again.")), 20000);
    operation.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

export type UploadFile =
  | (Blob & {
      name?: string;
      type: string;
    })
  | {
      uri: string;
      name: string;
      type: string;
    };

export class ComePlayersApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ComePlayersApiError";
    this.status = status;
    this.code = code;
  }
}

export function createChatClient(options: {
  baseUrl: string;
  getAccessToken: TokenProvider;
  fetchImpl?: FetchLike;
}) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let token = await deadline(options.getAccessToken(false));
    if (!token) {
      throw new ComePlayersApiError("Please sign in again.", 401, "NO_SESSION");
    }

    const createHeaders = (accessToken: string) => {
      const headers: Record<string, string> = {};
      new Headers(init.headers || {}).forEach((value, key) => {
        headers[key] = value;
      });
      headers.Authorization = `Bearer ${accessToken}`;
      if (init.body && !(init.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
      }
      return headers;
    };

    const send = (accessToken: string) => deadline(
      fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: createHeaders(accessToken),
      }));

    let response = await send(token);
    if (response.status === 401) {
      token = await deadline(options.getAccessToken(true));
      if (token) response = await send(token);
    }

    const payload = (await deadline(response.json())) as {
      error?: string;
      code?: string;
    } & T;

    if (!response.ok) {
      throw new ComePlayersApiError(
        payload.error || `Request failed (${response.status}).`,
        response.status,
        payload.code
      );
    }

    return payload;
  }

  return {
    searchContacts: async (query = "") => {
      const result = await request<{ users: PublicProfile[] }>(`/api/messages/contacts?q=${encodeURIComponent(query)}`);
      return result.users;
    },
    openContact: async (identifier: string) => {
      const result = await request<{ room: ChatRoom }>("/api/messages/contacts", { method: "POST", body: JSON.stringify({ identifier }) });
      return result.room;
    },
    listBlocked: async () => {
      const result = await request<{ users: PublicProfile[] }>("/api/messages/blocks");
      return result.users;
    },
    blockContact: (userId: string, blocked: boolean) => request<{ ok: boolean }>("/api/messages/blocks", {
      method: blocked ? "POST" : "DELETE", body: JSON.stringify({ userId }),
    }),
    listRooms: async (limit = 60) => {
      const safeLimit = Math.min(100, Math.max(20, Math.trunc(limit || 60)));
      const result = await request<{ rooms: ChatRoom[] }>(`/api/messages/rooms?limit=${safeLimit}`);
      return result.rooms || [];
    },
    listDirectRooms: async (limit = 60) => {
      const safeLimit = Math.min(100, Math.max(20, Math.trunc(limit || 60)));
      const result = await request<{ rooms: ChatRoom[] }>(`/api/messages/rooms?limit=${safeLimit}&scope=direct`);
      return result.rooms || [];
    },
    getConversation: (roomId: string, limit = 80, options: { before?: string; search?: string; media?: boolean; starred?: boolean } = {}) => {
      const safeLimit = Math.min(120, Math.max(20, Math.trunc(limit || 80)));
      const query = new URLSearchParams({ limit: String(safeLimit) });
      if (options.before) query.set("before", options.before);
      if (options.search) query.set("search", options.search);
      if (options.media) query.set("media", "true");
      if (options.starred) query.set("starred", "true");
      return request<Conversation>(
        `/api/messages/rooms/${encodeURIComponent(roomId)}?${query}`
      );
    },
    markRead: (roomId: string) =>
      request<{ ok: boolean }>(`/api/messages/rooms/${encodeURIComponent(roomId)}/read`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    sendMessage: (
      roomId: string,
      message: string,
      attachmentId?: number,
      replyToId?: string
    ) =>
      request<{ ok: boolean }>(
        `/api/messages/rooms/${encodeURIComponent(roomId)}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            message: message.trim(),
            attachmentId: attachmentId || undefined,
            replyToId: replyToId || undefined,
          }),
        }
      ),
    editMessage: (roomId: string, messageId: string, message: string) =>
      request<{ ok: boolean }>(
        `/api/messages/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ message: message.trim() }),
        }
      ),
    deleteMessage: (roomId: string, messageId: string) =>
      request<{ ok: boolean }>(
        `/api/messages/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}`,
        { method: "DELETE" }
      ),
    toggleReaction: (roomId: string, messageId: string, emoji: string) =>
      request<{ ok: boolean; active: boolean; emoji: string }>(
        `/api/messages/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}/reactions`,
        {
          method: "POST",
          body: JSON.stringify({ emoji }),
        }
      ),
    createGroup: (input: {
      title: string;
      description?: string;
      memberIds?: string[];
    }) =>
      request<{ ok: boolean; room: ChatRoom; invitationCount?: number }>(
        "/api/messages/groups",
        {
        method: "POST",
        body: JSON.stringify(input),
        }
      ),
    inviteMember: (roomId: string, identifier: string) =>
      request<{ ok: boolean; invitation?: PartyInvitation }>(
        `/api/messages/rooms/${encodeURIComponent(roomId)}/members`,
        {
          method: "POST",
          body: JSON.stringify({ identifier }),
        }
      ),
    listInvitations: () =>
      request<{
        received: PartyInvitation[];
        sent: PartyInvitation[];
      }>("/api/messages/invitations"),
    respondToInvitation: (invitationId: string, action: "accept" | "decline") =>
      request<{
        ok: boolean;
        invitationId: string;
        roomId: string;
        action: "accept" | "decline";
        result: Record<string, unknown>;
      }>("/api/messages/invitations", {
        method: "PATCH",
        body: JSON.stringify({ invitationId, action }),
      }),
    autoInvitePlayers: (roomId: string, count = 1) =>
      request<{
        ok: boolean;
        roomId: string;
        action: "auto-invite";
        invitations: Array<{
          id: string;
          invitee_id: string;
          expires_at: string;
          player: PublicProfile | null;
        }>;
      }>("/api/messages/matchmaking", {
        method: "POST",
        body: JSON.stringify({
          action: "auto-invite",
          roomId,
          count: Math.min(19, Math.max(1, Math.trunc(count || 1))),
        }),
      }),
    removeMember: (roomId: string, userId: string) =>
      request<{ ok: boolean; removedUserId: string }>(
        `/api/messages/rooms/${encodeURIComponent(roomId)}/members`,
        {
          method: "DELETE",
          body: JSON.stringify({ userId }),
        }
      ),
    getStreamState: (roomId: string) =>
      request<{ ok: boolean; room: ChatRoom; stream: ChatStreamState }>(
        `/api/messages/rooms/${encodeURIComponent(roomId)}/stream`
      ),
    updateStream: (roomId: string, action: "start" | "stop", title?: string) =>
      request<{ ok: boolean; room: ChatRoom; stream: ChatStreamState }>(
        `/api/messages/rooms/${encodeURIComponent(roomId)}/stream`,
        {
          method: "POST",
          body: JSON.stringify({ action, title }),
        }
      ),
    uploadAttachment: async (roomId: string, file: UploadFile) => {
      const formData = new FormData();
      formData.append("roomId", roomId);
      formData.append("file", file as unknown as Blob);
      const result = await request<{ ok: boolean; attachment: ChatAttachment }>(
        "/api/messages/attachments",
        { method: "POST", body: formData }
      );
      return result.attachment;
    },
    getAttachmentLink: (attachmentId: number) =>
      request<{
        url: string;
        expiresIn: number;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
      }>(`/api/messages/attachments/${attachmentId}`),
    reportMessage: (messageId: string, reason: string, details = "") =>
      request<{ ok: boolean }>("/api/messages/reports", {
        method: "POST",
        body: JSON.stringify({ messageId, reason, details }),
      }),
  };
}

export type ChatClient = ReturnType<typeof createChatClient>;
