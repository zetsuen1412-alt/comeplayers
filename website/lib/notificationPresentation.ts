export type AccountAlertSettings = {
  message_notifications?: boolean; call_notifications?: boolean; allow_calls?: boolean;
};

export function callsAllowedBySettings(settings: AccountAlertSettings | null | undefined) {
  return Boolean(settings && settings.call_notifications !== false && settings.allow_calls !== false);
}

export type NotificationRow = {
  id: number; user_id: string; type: string; title: string; message: string | null;
  link_url: string | null; is_read: boolean; created_at: string;
};

export function notificationRoomId(href: string | null | undefined): string | null {
  if (!href?.startsWith("/") || href.startsWith("//")) return null;
  try { return new URL(href, "https://www.comeplayers.com").searchParams.get("room"); }
  catch { return null; }
}

export function notificationChannelId(href: string | null | undefined): string | null {
  if (!href?.startsWith("/") || href.startsWith("//")) return null;
  try {
    const url = new URL(href, "https://www.comeplayers.com");
    return url.searchParams.get("channel") || url.pathname.match(/^\/cpcommunity\/servers\/[^/]+\/channels\/([^/]+)\/?$/)?.[1] || null;
  } catch { return null; }
}

export function shouldAlertNotification(input: {
  row: NotificationRow; userId: string; startedAt: number; settings: AccountAlertSettings;
  mutedRoomIds: ReadonlySet<string>; activeRoomId?: string | null; activeChannelId?: string | null; visible: boolean;
}, now = Date.now()) {
  const { row } = input;
  const createdAt = Date.parse(row.created_at);
  if (row.user_id !== input.userId || row.is_read || !Number.isFinite(createdAt) ||
      createdAt < input.startedAt || createdAt < now - 120_000 || createdAt > now + 30_000) return false;
  // Calls are owned by the call lifecycle, never a generic inbox notification.
  if (/call/.test(row.type)) return false;
  if (row.type === "chat_message") {
    if (input.settings.message_notifications === false) return false;
    const roomId = notificationRoomId(row.link_url);
    const channelId = notificationChannelId(row.link_url);
    const sameConversation = input.activeRoomId === roomId && (channelId ? input.activeChannelId === channelId : !input.activeChannelId);
    if (roomId && (input.mutedRoomIds.has(roomId) || (input.visible && sameConversation))) return false;
  }
  return true;
}
