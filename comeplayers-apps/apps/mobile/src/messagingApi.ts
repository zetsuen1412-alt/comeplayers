import type { Envelope } from "./secure/crypto";
import type { PublicProfile } from "@comeplayers/chat-core";
import { request } from "./api";

export type AccountPreferences = {
  profile: PublicProfile & { bio: string | null; username_changes: number };
  phone: string | null; phoneVerified: boolean; phoneRequired: boolean; freeUsernameChangesRemaining: number;
  settings: { phone_country: string; read_receipts: boolean; show_last_seen: boolean; allow_calls: boolean; message_notifications: boolean; call_notifications: boolean; status_audience: "contacts" | "nobody" };
};
export type ChatPreference = { room_id: string; pinned: boolean; archived: boolean; muted: boolean; list_name: string; cleared_before: string | null };
export type ChatPreferences = { preferences: ChatPreference[]; starred: string[] };
export type CallRecord = { encryption_envelope?: Envelope | null; secure_event_id?: string | null; id: string; room_id: string; caller_id: string; callee_id: string; media: "audio" | "video"; status: "scheduled" | "ringing" | "accepted" | "declined" | "cancelled" | "missed" | "ended"; scheduled_at: string | null; created_at: string; answered_at: string | null; ended_at: string | null; other?: PublicProfile | null };
export type StatusPost = { id: string; author_id: string; body: string; background: string; created_at: string; expires_at: string; hasImage: boolean; author?: PublicProfile; seen: boolean; viewCount?: number };
export type PhoneCountry = { code: string; name: string; callingCode: string };
export const loadPreferences = () => request<AccountPreferences>("/api/account/preferences", {}, true);
export const updateAccount = (body: Record<string, unknown>) => request("/api/account/preferences", { method: "PATCH", body: JSON.stringify(body) }, true);
export const loadChatPreferences = () => request<ChatPreferences>("/api/messages/preferences", {}, true);
export const updateChatPreference = (roomId: string, body: Record<string, unknown>) => request("/api/messages/preferences", { method: "PATCH", body: JSON.stringify({ roomId, ...body }) }, true);
export const loadCalls = (activeOnly = false, currentId?: string) => request<{ calls: CallRecord[] }>(`/api/messages/calls${activeOnly ? `?active=1${currentId ? `&id=${encodeURIComponent(currentId)}` : ""}` : ""}`, {}, true);
export const createCall = (roomId: string, media: "audio" | "video", scheduledAt?: string) => request<{ call: CallRecord }>("/api/messages/calls", { method: "POST", body: JSON.stringify({ roomId, media, scheduledAt }) }, true);
export const changeCall = (id: string, action: "accept" | "decline" | "end") => request("/api/messages/calls", { method: "PATCH", body: JSON.stringify({ id, action }) }, true);
export const loadStatuses = () => request<{ statuses: StatusPost[] }>("/api/messages/status", {}, true);
