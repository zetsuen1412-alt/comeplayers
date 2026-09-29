export type NotificationTarget = { type: "chat_message" | "incoming_call"; roomId: string; callId?: string; userId?: string; channelId?: string; expiresAt?: number };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Push payloads are navigation hints. The API still verifies room membership.
export function notificationTarget(data: unknown, userId: string): NotificationTarget | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  if (value.type !== "chat_message" && value.type !== "incoming_call") return null;
  if (typeof value.roomId !== "string" || !uuid.test(value.roomId)) return null;
  if (value.userId !== undefined && value.userId !== userId) return null;
  if (value.type === "incoming_call" && (typeof value.callId !== "string" || !uuid.test(value.callId))) return null;
  if (value.channelId !== undefined && (typeof value.channelId !== "string" || !uuid.test(value.channelId))) return null;
  const expiry = typeof value.expiresAt === "number" ? value.expiresAt : typeof value.expiresAt === "string" ? Date.parse(value.expiresAt) : undefined;
  return { type: value.type, roomId: value.roomId, ...(typeof value.callId === "string" ? { callId: value.callId } : {}), ...(typeof value.channelId === "string" ? { channelId: value.channelId } : {}), ...(expiry !== undefined && Number.isFinite(expiry) ? { expiresAt: expiry } : {}) };
}

export function freshIncomingCall(target: NotificationTarget): boolean {
  return target.type === "incoming_call" && (target.expiresAt === undefined || target.expiresAt > Date.now());
}

export function permissionGranted(permission: { granted: boolean; ios?: { status: number } }): boolean {
  // iOS provisional authorization delivers quietly until the user chooses alerts.
  return permission.granted || permission.ios?.status === 3;
}

export function freshMessageActivity(previous: string | undefined, current: string | null | undefined): boolean {
  if (!current || current === previous) return false;
  const at = Date.parse(current);
  return Number.isFinite(at) && at > (previous ? Date.parse(previous) || 0 : 0) && at > Date.now() - 60_000;
}
