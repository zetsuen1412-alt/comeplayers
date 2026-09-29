import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { roomName, roomPreview, roomUnreadCount, type ChatRoom } from "@comeplayers/chat-core";
import { type AccountPreferences } from "./messagingApi";
import { colors } from "./theme";
import { useInbox } from "./InboxProvider";
import { isCallActivity } from "./inboxOrdering";
import { freshMessageActivity } from "./notificationPolicy";
import { useMessageChime } from "./notificationSounds";
import { useCalls } from "./CallProvider";
export function MessageAlerts({ session, account, activeRoom, onOpen, onUnread }: { session: Session | null; account: AccountPreferences | null; activeRoom?: string; onOpen: (room: ChatRoom) => void; onUnread: (count: number) => void }) {
  const [toast, setToast] = useState<ChatRoom | null>(null);
  const { rooms, preferences, loading } = useInbox();
  const previous = useRef<Map<string, string> | null>(null);
  const chime = useMessageChime();
  const { callActive } = useCalls();
  useEffect(() => { previous.current = null; setToast(null); }, [session?.user.id]);
  useEffect(() => {
    if (!session || !account || loading || (account.phoneRequired && !account.phoneVerified)) return;
    onUnread(rooms.reduce((sum, room) => { const cleared = preferences.find(p => p.room_id === room.id)?.cleared_before; return sum + (cleared && (!room.last_message_at || room.last_message_at <= cleared) ? 0 : roomUnreadCount(room)); }, 0));
    if (previous.current && account.settings.message_notifications && AppState.currentState === "active") {
      const incoming = rooms.find(r => r.id !== activeRoom && !isCallActivity(r) && roomUnreadCount(r) > 0 && freshMessageActivity(previous.current?.get(r.id), r.last_message_at) && !preferences.find(p => p.room_id === r.id)?.muted);
      if (incoming) { setToast(incoming); if (!callActive) chime(); }
    }
    previous.current = new Map(rooms.map(r => [r.id, r.last_message_at || ""]));
  }, [rooms, preferences, loading, session?.user.id, account?.settings.message_notifications, account?.phoneRequired, account?.phoneVerified, activeRoom, onUnread, callActive, chime]);
  useEffect(() => { if (toast?.id === activeRoom || account?.settings.message_notifications === false) setToast(null); }, [activeRoom, account?.settings.message_notifications, toast?.id]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 6000); return () => clearTimeout(timer); }, [toast]);
  if (!toast) return null;
  return <View style={s.toast}><Pressable accessibilityRole="button" accessibilityLabel={`Buka pesan dari ${roomName(toast)}`} style={{ flex: 1 }} onPress={() => { onOpen(toast); setToast(null); }}><Text style={s.title}>{roomName(toast)}</Text><Text numberOfLines={1} style={s.preview}>{roomPreview(toast)}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Tutup notifikasi pesan" onPress={() => setToast(null)}><Text style={s.close}>×</Text></Pressable></View>;
}
const s = StyleSheet.create({ toast: { position: "absolute", top: 10, left: 14, right: 14, padding: 17, flexDirection: "row", gap: 15, alignItems: "center", backgroundColor: colors.panelStrong, borderColor: colors.yellow, borderWidth: 1, borderRadius: 18, elevation: 15 }, title: { color: colors.yellow, fontWeight: "700", fontSize: 16 }, preview: { color: colors.text, fontSize: 14, marginTop: 5 }, close: { color: colors.textMuted, fontSize: 27 } });
