import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Session } from "@supabase/supabase-js";
import { roomName, type ChatRoom } from "@comeplayers/chat-core";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useVideoPlayer, VideoView } from "expo-video";
import { Avatar } from "../components";
import { useCalls } from "../CallProvider";
import { usePrivateMessenger } from "../secure/PrivateProvider";
import { materializeMedia, type LocalMedia } from "../secure/mediaStore";
import type { SecurePrivateMessage as PrivateMessage } from "../secure/secureMessengerV2";
import type { Vault } from "../secure/vault";
import { AudioPlayback, VoiceRecorder, type PendingAttachment } from "./ChatMedia";
import { colors } from "../theme";
import type { AppTab } from "../types";
import { useInbox } from "../InboxProvider";
import { chatClient } from "../runtime";
import { loadPreferences, updateChatPreference } from "../messagingApi";

export function PrivateConversationScreen({ room, session, onBack, onRead, onNavigate }: { room: ChatRoom; session: Session; onBack: () => void; onRead: () => void; onNavigate: (tab: AppTab) => void }) {
  const { messenger, error: initializationError } = usePrivateMessenger(), { startCall } = useCalls(), { preferences, reload: reloadInbox } = useInbox();
  const [messages, setMessages] = useState<PrivateMessage[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [draft, setDraft] = useState(""), [sending, setSending] = useState(false), [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [menu, setMenu] = useState(false), [query, setQuery] = useState(""), [searching, setSearching] = useState(false), [filter, setFilter] = useState<"all" | "media" | "starred">("all");
  const [selected, setSelected] = useState<PrivateMessage | null>(null), [reply, setReply] = useState<PrivateMessage | null>(null), [editing, setEditing] = useState<PrivateMessage | null>(null), [recording, setRecording] = useState(false);
  const [security, setSecurity] = useState(""), [older, setOlder] = useState(false), [blocked, setBlocked] = useState(!!room.blocked_by_me);
  const loadedLimit = useRef(80), receiptPreference = useRef(false), readCallback = useRef(onRead); readCallback.current = onRead;
  const refreshVersion = useRef(0);
  const pref = preferences.find(p => p.room_id === room.id);
  const refresh = useCallback(async () => {
    if (!messenger) return;
    const version = ++refreshVersion.current, limit = loadedLimit.current;
    const term = query.trim().toLowerCase();
    const rows = await messenger.vault.search<PrivateMessage>("message-v2", room.id, m => (!pref?.cleared_before || m.created_at > pref.cleared_before) && (!term || `${m.message || ""} ${m.localMedia?.name || m.secureAttachment?.name || ""}`.toLowerCase().includes(term)) && (filter !== "media" || !!m.localMedia || !!m.secureAttachment) && (filter !== "starred" || !!m.starred), limit + 1, () => refreshVersion.current !== version);
    if (refreshVersion.current !== version) return;
    const displayed = rows.slice(0, limit);
    setMessages(displayed); setOlder(rows.length > limit); setLoading(false);
    if (displayed.some(m => m.sender_id !== session.user.id && !m.is_read && !m.legacy)) { await messenger.markRead(room.id, receiptPreference.current, displayed.map(m => m.id)); readCallback.current(); }
  }, [messenger, room.id, session.user.id, query, filter, pref?.cleared_before]);
  useEffect(() => { let alive = true; receiptPreference.current = false; void loadPreferences().then(p => { if (alive) receiptPreference.current = p.settings.read_receipts; }).catch(() => undefined); return () => { alive = false; }; }, [session.user.id]);
  useEffect(() => {
    let alive = true; loadedLimit.current = 80;
    const update = () => { if (alive) void refresh().catch(e => setError(e.message)); };
    const timer = setTimeout(update, query ? 200 : 0); const unsubscribe = messenger?.subscribe(update);
    return () => { alive = false; refreshVersion.current++; clearTimeout(timer); unsubscribe?.(); };
  }, [refresh, messenger]);
  const perform = async (action: () => Promise<unknown>) => { setError(""); try { await action(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); } };
  const send = async () => {
    if (!messenger || sending || blocked) return; setSending(true); setError("");
    try { if (editing) await messenger.edit(editing, draft); else await messenger.send(room, draft, attachment || undefined, reply || undefined); setDraft(""); setAttachment(null); setReply(null); setEditing(null); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not send message."); } finally { setSending(false); }
  };
  const choose = async (camera = false) => perform(async () => {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error("Allow camera access to take a photo.");
    const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: .8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: .8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.type === "video") setAttachment({ uri: asset.uri, name: asset.fileName || "video.mp4", type: asset.mimeType || "video/mp4", size: asset.fileSize });
    else { const image = await manipulateAsync(asset.uri, asset.width > 1400 ? [{ resize: { width: 1400 } }] : [], { compress: .7, format: SaveFormat.JPEG }); setAttachment({ uri: image.uri, name: "photo.jpg", type: "image/jpeg" }); }
  });
  const chooseDocument = () => perform(async () => { const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "audio/mp4"], copyToCacheDirectory: true }); if (!result.canceled && result.assets[0]) { const f = result.assets[0]; setAttachment({ uri: f.uri, name: f.name, type: f.mimeType || "application/pdf", size: f.size }); } });
  const preference = (values: Record<string, unknown>) => perform(async () => { await updateChatPreference(room.id, values); await reloadInbox(true); });
  const downloadMedia = useCallback((message: PrivateMessage) => messenger?.downloadMedia(message), [messenger]);
  const visible = messages;
  const menuAction = (action: () => void) => { setMenu(false); action(); };
  const securityLabel = messenger?.ready ? "New messages are end-to-end encrypted · Verified devices" : "Opening encrypted history";
  return <KeyboardAvoidingView style={s.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={s.header}><Pressable accessibilityLabel="Back to chats" onPress={onBack}><Ionicons name="arrow-back" size={26} color={colors.text} /></Pressable><Avatar name={roomName(room)} uri={room.other?.avatar_url} size={40} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={s.name}>{roomName(room)}</Text><Text numberOfLines={1} style={s.note}>Private message</Text></View>{(["video", "audio"] as const).map(media => <Pressable key={media} accessibilityLabel={media === "video" ? "Video call" : "Voice call"} onPress={() => void perform(() => startCall(room.id, media))}><Ionicons name={media === "video" ? "videocam-outline" : "call-outline"} size={25} color={colors.text} /></Pressable>)}<Pressable accessibilityLabel="Chat options" onPress={() => setMenu(true)}><Ionicons name="ellipsis-vertical" size={24} color={colors.text} /></Pressable></View>
    <Pressable style={s.security} onPress={() => void perform(async () => setSecurity(await messenger!.securityCode(room.id)))}><Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} /><Text style={s.note}>{securityLabel}</Text></Pressable>
    {searching ? <TextInput autoFocus accessibilityLabel="Search local messages" placeholder="Search this device's messages" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} style={s.search} /> : null}
    {filter !== "all" ? <Pressable style={s.security} onPress={() => setFilter("all")}><Text style={s.note}>{filter === "media" ? "Media and documents" : "Starred messages"} · Show all</Text></Pressable> : null}
    {loading && !messenger ? <ActivityIndicator color={colors.yellow} /> : null}
    <FlatList data={visible} inverted keyExtractor={m => m.id} initialNumToRender={16} maxToRenderPerBatch={12} windowSize={7} keyboardShouldPersistTaps="handled" contentContainerStyle={s.messages} renderItem={({ item }) => <MessageBubble message={item} own={item.sender_id === session.user.id} vault={messenger?.vault || null} downloadMedia={downloadMedia} onSelect={setSelected} />} ListEmptyComponent={<View style={s.empty}><Ionicons name="chatbubbles-outline" size={40} color={colors.yellow} /><Text style={s.name}>{query ? "No local messages match" : "Start a private conversation"}</Text><Text style={[s.note, { textAlign: "center" }]}>Encrypted history is restored on verified devices. Attachment bytes download only when you open them.</Text></View>} ListFooterComponent={older ? <Pressable style={s.security} onPress={() => { loadedLimit.current += 80; void refresh(); }}><Text style={s.note}>Load older messages from this device</Text></Pressable> : null} />
    {error || initializationError || messenger?.error ? <Pressable style={s.error} onPress={() => void messenger?.sync()}><Text style={{ color: colors.red }}>{error || initializationError || messenger?.error}</Text><Text style={s.note}>Tap to retry</Text></Pressable> : null}
    {reply || editing || attachment ? <View style={s.context}><View style={{ flex: 1 }}><Text style={s.note}>{editing ? "Edit message" : reply ? "Reply" : "Attachment"}</Text><Text numberOfLines={2} style={s.text}>{attachment?.name || editing?.message || reply?.message || "Attachment"}</Text></View><Pressable accessibilityLabel="Cancel attachment or reply" onPress={() => { setReply(null); setEditing(null); setAttachment(null); }}><Ionicons name="close" size={22} color={colors.text} /></Pressable></View> : null}
    {recording ? <VoiceRecorder onCancel={() => setRecording(false)} onReady={file => { setAttachment(file); setRecording(false); }} /> : <View style={s.composer}><Pressable accessibilityLabel="Attach file" onPress={() => Alert.alert("Add attachment", "Files are encrypted before upload.", [{ text: "Photo or video", onPress: () => void choose() }, { text: "Document", onPress: () => void chooseDocument() }, { text: "Cancel", style: "cancel" }])}><Ionicons name="attach" size={27} color={colors.textMuted} /></Pressable><TextInput accessibilityLabel="Message" multiline maxLength={6000} value={draft} onChangeText={setDraft} placeholder={blocked ? "Contact blocked" : "Message"} placeholderTextColor={colors.textMuted} style={s.input} editable={!blocked} /><Pressable accessibilityLabel="Camera" onPress={() => void choose(true)}><Ionicons name="camera-outline" size={27} color={colors.textMuted} /></Pressable><Pressable accessibilityLabel={draft.trim() || attachment ? "Send message" : "Record voice message"} disabled={sending || blocked} style={s.send} onPress={() => draft.trim() || attachment ? void send() : setRecording(true)}>{sending ? <ActivityIndicator color={colors.background} /> : <Ionicons name={draft.trim() || attachment ? "send" : "mic"} size={23} color={colors.background} />}</Pressable></View>}
    <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}><Pressable style={s.scrim} onPress={() => setMenu(false)}><ScrollView style={s.menu}>{[
      ["View contact", () => Alert.alert(roomName(room), room.other?.id || "ComePlayers contact")],
      ["Search", () => setSearching(v => !v)], ["Media and documents", () => setFilter("media")], ["Starred messages", () => setFilter("starred")],
      [pref?.pinned ? "Unpin chat" : "Pin chat", () => void preference({ pinned: !pref?.pinned })],
      [pref?.muted ? "Unmute notifications" : "Mute notifications", () => void preference({ muted: !pref?.muted })],
      [pref?.archived ? "Unarchive chat" : "Archive chat", () => void preference({ archived: !pref?.archived })],
      ["Security code", () => void perform(async () => setSecurity(await messenger!.securityCode(room.id)))],
      ["Backup and storage", () => onNavigate("profile")],
      [blocked ? "Unblock contact" : "Block contact", () => void perform(async () => { await chatClient.blockContact(room.other!.id, !blocked); setBlocked(!blocked); })],
    ].map(([label, action]) => <Pressable key={String(label)} style={s.menuItem} onPress={() => menuAction(action as () => void)}><Text style={s.text}>{String(label)}</Text></Pressable>)}</ScrollView></Pressable></Modal>
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}><Pressable style={s.scrim} onPress={() => setSelected(null)}><View style={s.menu}>{selected ? <>{[["Reply", () => setReply(selected)], [selected.starred ? "Unstar" : "Star", () => void perform(() => messenger!.star(selected))], ...(selected.sender_id === session.user.id && !selected.legacy && !selected.deleted_at ? [["Edit", () => { setEditing(selected); setDraft(selected.message || ""); }], ["Delete for everyone", () => void perform(() => messenger!.edit(selected))]] : [])].map(([label, action]) => <Pressable style={s.menuItem} key={String(label)} onPress={() => { setSelected(null); (action as () => void)(); }}><Text style={s.text}>{String(label)}</Text></Pressable>)}</> : null}</View></Pressable></Modal>
    <Modal visible={!!security} transparent animationType="fade" onRequestClose={() => setSecurity("")}><View style={s.scrim}><View style={[s.menu, { padding: 22 }]}><Text style={s.name}>Verify this conversation</Text><Text style={[s.text, { lineHeight: 27, marginVertical: 20 }]} selectable>{security}</Text><Text style={s.note}>Compare this code with your contact in person or through a trusted channel. Both devices must show the same code.</Text><Pressable style={s.menuItem} onPress={() => setSecurity("")}><Text style={s.text}>Close</Text></Pressable></View></View></Modal>
  </KeyboardAvoidingView>;
}
const MessageBubble = memo(function MessageBubble({ message: m, own, vault, onSelect, downloadMedia }: { message: PrivateMessage; own: boolean; vault: Vault | null; onSelect: (message: PrivateMessage) => void; downloadMedia: (message: PrivateMessage) => Promise<void> | undefined }) {
  return <Pressable onLongPress={() => onSelect(m)} style={[s.bubble, own ? s.own : s.theirs]}>{m.legacy ? <Text style={s.legacy}>Older message · protected on this device</Text> : null}{m.reply_to ? <View style={s.reply}><Text numberOfLines={2} style={s.note}>{m.reply_to.message || "Attachment"}</Text></View> : null}{!m.deleted_at && m.localMedia && vault ? <PrivateMedia media={m.localMedia} vault={vault} /> : !m.deleted_at && m.secureAttachment ? <RemotePrivateMedia attachment={m.secureAttachment} onDownload={() => downloadMedia(m)} /> : !m.deleted_at && m.legacy && m.attachment ? <RemoteLegacyMedia attachment={m.attachment} onDownload={() => downloadMedia(m)} /> : null}<Text selectable style={s.text}>{m.deleted_at ? "Message deleted" : m.message}</Text><Text style={s.time}>{m.starred ? "★ " : ""}{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{m.edited_at ? " · edited" : ""}{own ? m.delivery === "queued" ? " ◷" : m.delivery === "read" ? " · Read ✓✓" : m.delivery === "received" ? " ✓✓" : " ✓" : ""}</Text></Pressable>;
});
function RemotePrivateMedia({ attachment, onDownload }: { attachment: NonNullable<PrivateMessage["secureAttachment"]>; onDownload: () => Promise<void> | undefined }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <Pressable disabled={busy} onPress={() => { setBusy(true); setError(""); const pending = onDownload(); if (!pending) { setBusy(false); return; } void pending.catch(reason => setError(reason instanceof Error ? reason.message : "Download failed.")).finally(() => setBusy(false)); }} style={{ paddingVertical: 10 }}><Text style={s.text}>{busy ? "Downloading encrypted attachment…" : `↓ ${attachment.name}`}</Text><Text style={s.note}>{error || `${Math.ceil(attachment.size / 1024)} KB · Download and decrypt`}</Text></Pressable>;
}
function RemoteLegacyMedia({ attachment, onDownload }: { attachment: NonNullable<PrivateMessage["attachment"]>; onDownload: () => Promise<void> | undefined }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <Pressable disabled={busy} onPress={() => { setBusy(true); setError(""); const pending = onDownload(); if (!pending) { setBusy(false); return; } void pending.catch(reason => setError(reason instanceof Error ? reason.message : "Download failed.")).finally(() => setBusy(false)); }} style={{ paddingVertical: 10 }}><Text style={s.text}>{busy ? "Downloading old attachment…" : `↓ ${attachment.file_name}`}</Text><Text style={s.note}>{error || `${Math.ceil(attachment.size_bytes / 1024)} KB · Import to encrypted device storage`}</Text></Pressable>;
}
function PrivateMedia({ media, vault }: { media: LocalMedia; vault: Vault }) {
  const [uri, setUri] = useState(""), [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  useEffect(() => { let alive = true; let cleanup: (() => void) | undefined; void materializeMedia(vault, media.id).then(file => { cleanup = () => { if (file.exists) file.delete(); }; if (alive) setUri(file.uri); else cleanup(); }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; cleanup?.(); }; }, [media.id, vault]);
  if (error) return <Text style={s.note}>{error}</Text>;
  if (!uri) return <ActivityIndicator color={colors.yellow} />;
  if (media.mime.startsWith("image/")) return <><Pressable accessibilityLabel="View photo" onPress={() => setPreview(true)}><Image source={{ uri }} style={{ width: 220, height: 180, borderRadius: 12 }} resizeMode="cover" /></Pressable><Modal visible={preview} onRequestClose={() => setPreview(false)}><View style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}><Pressable accessibilityLabel="Close photo" onPress={() => setPreview(false)}><Text style={s.text}>Close</Text></Pressable><Image source={{ uri }} style={{ flex: 1 }} resizeMode="contain" /><Pressable onPress={() => void Sharing.shareAsync(uri, { mimeType: media.mime }).catch(e => setError(e.message))}><Text style={s.text}>Save or share photo</Text></Pressable></View></Modal></>;
  if (media.mime.startsWith("audio/")) return <AudioPlayback url={uri} compact />;
  if (media.mime.startsWith("video/")) return <PrivateVideo uri={uri} />;
  return <Pressable onPress={() => void Sharing.shareAsync(uri, { mimeType: media.mime })}><Text style={s.text}>📄 {media.name}</Text><Text style={s.note}>Open or save document · {Math.ceil(media.size / 1024)} KB</Text></Pressable>;
}
function PrivateVideo({ uri }: { uri: string }) { const player = useVideoPlayer(uri); return <VideoView player={player} style={{ width: 230, height: 180 }} nativeControls />; }
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background }, header: { flexDirection: "row", alignItems: "center", gap: 13, padding: 15, borderBottomWidth: 1, borderColor: colors.border }, name: { color: colors.text, fontSize: 19, fontWeight: "700" }, note: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, text: { color: colors.text, fontSize: 16, lineHeight: 22 }, legacy: { color: colors.textDim, fontSize: 10, marginBottom: 5 }, security: { padding: 12, gap: 7, flexDirection: "row", justifyContent: "center" }, search: { margin: 12, padding: 13, borderRadius: 20, backgroundColor: colors.panel, color: colors.text }, messages: { padding: 12, flexGrow: 1 }, bubble: { borderRadius: 15, padding: 11, marginBottom: 8, maxWidth: "86%", minWidth: 90 }, own: { alignSelf: "flex-end", backgroundColor: "#273324" }, theirs: { alignSelf: "flex-start", backgroundColor: colors.panel }, time: { fontSize: 10, marginTop: 5, color: colors.textMuted, textAlign: "right" }, reply: { borderLeftWidth: 3, borderColor: colors.yellow, padding: 8, marginBottom: 6 }, empty: { transform: [{ scaleY: -1 }], flex: 1, alignItems: "center", justifyContent: "center", gap: 15, padding: 24 }, composer: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderTopWidth: 1, borderColor: colors.border }, input: { color: colors.text, fontSize: 16, flex: 1, maxHeight: 120, minHeight: 46, padding: 10, backgroundColor: colors.panel, borderRadius: 20 }, send: { backgroundColor: colors.yellow, borderRadius: 25, height: 48, width: 48, alignItems: "center", justifyContent: "center" }, context: { padding: 15, flexDirection: "row", backgroundColor: colors.panel }, error: { padding: 12 }, scrim: { flex: 1, backgroundColor: "#0008", justifyContent: "center", padding: 25 }, menu: { borderRadius: 18, backgroundColor: colors.panelStrong, maxHeight: "85%" }, menuItem: { padding: 17 } });
