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
import { SecureDeviceSetup } from "../secure/SecureDeviceSetup";
import { materializeMedia, MAX_PRIVATE_FILE, type LocalMedia } from "../secure/mediaStore";
import type { SecurePrivateMessage as PrivateMessage } from "../secure/secureMessengerV2";
import type { Vault } from "../secure/vault";
import { AudioPlayback, VoiceRecorder, type PendingAttachment } from "./ChatMedia";
import { colors } from "../theme";
import { ChatProblemNotice } from "./ChatProblemNotice";
import type { AppTab } from "../types";
import { useInbox } from "../InboxProvider";
import { chatClient, supabase } from "../runtime";
import { loadPreferences, updateChatPreference } from "../messagingApi";

export function PrivateConversationScreen({ room, session, onBack, onRead, onNavigate }: { room: ChatRoom; session: Session; onBack: () => void; onRead: () => void; onNavigate: (tab: AppTab) => void }) {
  const { messenger, setup, error: initializationError, reopen } = usePrivateMessenger(), { startCall } = useCalls(), { preferences, reload: reloadInbox } = useInbox();
  const [messages, setMessages] = useState<PrivateMessage[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [draft, setDraft] = useState(""), [sending, setSending] = useState(false), [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [menu, setMenu] = useState(false), [query, setQuery] = useState(""), [searching, setSearching] = useState(false), [filter, setFilter] = useState<"all" | "media" | "starred">("all");
  const [selected, setSelected] = useState<PrivateMessage | null>(null), [reply, setReply] = useState<PrivateMessage | null>(null), [editing, setEditing] = useState<PrivateMessage | null>(null), [recording, setRecording] = useState(false);
  const [security, setSecurity] = useState(""), [older, setOlder] = useState(false), [blocked, setBlocked] = useState(!!room.blocked_by_me);
  const loadedLimit = useRef(40), receiptPreference = useRef(false), readCallback = useRef(onRead); readCallback.current = onRead;
  const refreshVersion = useRef(0);
  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const autoMediaAttempted = useRef(new Set<string>());
  const [preparingMedia, setPreparingMedia] = useState<Set<string>>(new Set());
  const pref = preferences.find(p => p.room_id === room.id);
  const refresh = useCallback(async () => {
    if (!messenger) return;
    const version = ++refreshVersion.current, limit = loadedLimit.current;
    const term = query.trim().toLowerCase();
    const matches = (m: PrivateMessage) => (!pref?.cleared_before || m.created_at > pref.cleared_before) && (!term || `${m.message || ""} ${m.localMedia?.name || m.secureAttachment?.name || ""}`.toLowerCase().includes(term)) && (filter !== "media" || !!m.localMedia || !!m.secureAttachment) && (filter !== "starred" || !!m.starred);
    const rows = !term && filter === "all" && !pref?.cleared_before
      ? await messenger.vault.list<PrivateMessage>("message-v2", room.id, limit + 1)
      : await messenger.vault.search<PrivateMessage>("message-v2", room.id, matches, limit + 1, () => refreshVersion.current !== version);
    if (refreshVersion.current !== version) return;
    const displayed = rows.slice(0, limit);
    setMessages(displayed); setOlder(rows.length > limit); setLoading(false);
    if (displayed.some(m => m.sender_id !== session.user.id && !m.is_read && !m.legacy)) { await messenger.markRead(room.id, receiptPreference.current, displayed.map(m => m.id)); readCallback.current(); }
  }, [messenger, room.id, session.user.id, query, filter, pref?.cleared_before]);
  useEffect(() => { let alive = true; receiptPreference.current = false; void loadPreferences().then(p => { if (alive) receiptPreference.current = p.settings.read_receipts; }).catch(() => undefined); return () => { alive = false; }; }, [session.user.id]);
  useEffect(() => {
    let alive = true; loadedLimit.current = 40;
    const update = () => { if (alive) void refresh().catch(e => setError(e.message)); };
    const timer = setTimeout(update, query ? 200 : 0); const unsubscribe = messenger?.subscribe(update);
    return () => { alive = false; refreshVersion.current++; clearTimeout(timer); unsubscribe?.(); };
  }, [refresh, messenger]);
  useEffect(() => {
    if (!messenger) return;
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`chat-room:${room.id}`, { config: { private: true, broadcast: { self: false } } })
      .on("broadcast", { event: "secure-message" }, () => {
        if (scheduled) return;
        scheduled = setTimeout(() => { scheduled = undefined; void messenger.sync().catch(reason => setError(reason instanceof Error ? reason.message : "Chat belum bisa diperbarui.")); }, 100);
      }).subscribe();
    realtimeChannel.current = channel;
    return () => { clearTimeout(scheduled); if (realtimeChannel.current === channel) realtimeChannel.current = null; void supabase.removeChannel(channel); };
  }, [messenger, room.id]);
  useEffect(() => {
    if (!messenger || filter !== "all" || query) return;
    // Preview a few recent encrypted attachments automatically. The verified
    // download still decrypts into the on-device vault; older files stay on tap.
    const recent = messages.slice(0, 12).filter(message => !message.localMedia && !message.deleted_at &&
      ((message.secureAttachment && /^(image|video)\//.test(message.secureAttachment.mime) && message.secureAttachment.size <= 4 * 1024 * 1024) ||
       (message.legacy && message.attachment && /^(image|video)\//.test(message.attachment.mime_type) && message.attachment.size_bytes <= 4 * 1024 * 1024)))
      .slice(0, 4);
    let active = true;
    void (async () => {
      for (const message of recent) {
        if (!active) break;
        if (autoMediaAttempted.current.has(message.id)) continue;
        autoMediaAttempted.current.add(message.id);
        setPreparingMedia(current => new Set(current).add(message.id));
        try { await messenger.downloadMedia(message); }
        catch { /* Keep the attachment visible so the user can retry by tapping. */ }
        finally { setPreparingMedia(current => { const next = new Set(current); next.delete(message.id); return next; }); }
      }
    })();
    return () => { active = false; };
  }, [messenger, messages, filter, query]);
  const perform = async (action: () => Promise<unknown>) => { setError(""); try { await action(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Belum berhasil. Silakan coba lagi."); } };
  const send = async () => {
    if (!messenger || sending || blocked) return; setSending(true); setError("");
    try { if (editing) await messenger.edit(editing, draft); else { await messenger.send(room, draft, attachment || undefined, reply || undefined); void realtimeChannel.current?.send({ type: "broadcast", event: "secure-message", payload: { roomId: room.id } }).catch(() => undefined); } setDraft(""); setAttachment(null); setReply(null); setEditing(null); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Pesan belum terkirim. Silakan coba lagi."); } finally { setSending(false); }
  };
  const choose = async (camera = false) => {
    setError("");
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error("Izinkan akses kamera untuk mengambil foto.");
      const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: .8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: .8 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.type === "video") {
        if (!asset.fileSize || asset.fileSize > MAX_PRIVATE_FILE) throw new Error("Pilih video MP4 berukuran maksimal 8 MB.");
        setAttachment({ uri: asset.uri, name: asset.fileName || "video.mp4", type: asset.mimeType || "video/mp4", size: asset.fileSize });
      } else {
        const image = await manipulateAsync(asset.uri, asset.width > 1400 ? [{ resize: { width: 1400 } }] : [], { compress: .7, format: SaveFormat.JPEG });
        setAttachment({ uri: image.uri, name: "photo.jpg", type: "image/jpeg" });
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Lampiran belum bisa dipilih."); }
  };
  const chooseDocument = async () => {
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "audio/mp4"], copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const file = result.assets[0];
      if (!file.size || file.size > MAX_PRIVATE_FILE) throw new Error("Pilih dokumen atau rekaman berukuran maksimal 8 MB.");
      setAttachment({ uri: file.uri, name: file.name, type: file.mimeType || "application/pdf", size: file.size });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Lampiran belum bisa dipilih."); }
  };
  const preference = (values: Record<string, unknown>) => perform(async () => { await updateChatPreference(room.id, values); await reloadInbox(true); });
  const downloadMedia = useCallback((message: PrivateMessage) => messenger?.downloadMedia(message), [messenger]);
  const visible = messages;
  const menuAction = (action: () => void) => { setMenu(false); action(); };
  const retry = () => {
    setError("");
    if (!messenger) { reopen(); return; }
    void perform(() => messenger.sync());
  };
  const openSecurity = () => {
    if (!messenger) { reopen(); return; }
    void perform(async () => setSecurity(await messenger.securityCode(room.id)));
  };

  return <KeyboardAvoidingView style={s.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="Kembali ke chat" style={s.iconButton} onPress={onBack}><Ionicons name="arrow-back" size={26} color={colors.text} /></Pressable><Avatar name={roomName(room)} uri={room.other?.avatar_url} size={40} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={s.name}>{roomName(room)}</Text><Text numberOfLines={1} style={s.note}>Chat pribadi</Text></View>{(["audio"] as const).map(media => <Pressable key={media} accessibilityRole="button" accessibilityLabel={"Panggilan suara"} style={s.iconButton} disabled={!messenger} onPress={() => void perform(() => startCall(room.id, media))}><Ionicons name={"call-outline"} size={25} color={colors.text} /></Pressable>)}<Pressable accessibilityRole="button" accessibilityLabel="Pilihan chat" style={s.iconButton} onPress={() => setMenu(true)}><Ionicons name="ellipsis-vertical" size={24} color={colors.text} /></Pressable></View>
    {messenger && !messenger.ready ? <View accessibilityLiveRegion="polite" style={s.security}><ActivityIndicator size="small" color={colors.yellow} /><Text style={s.note}>Memuat chat…</Text></View> : null}
    {searching ? <TextInput autoFocus accessibilityLabel="Cari pesan" placeholder="Cari dalam chat" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} style={s.search} /> : null}
    {filter !== "all" ? <Pressable style={s.security} onPress={() => setFilter("all")}><Text style={s.note}>{filter === "media" ? "Foto, video & dokumen" : "Pesan berbintang"} · Lihat semua</Text></Pressable> : null}
    {!messenger ? <SecureDeviceSetup userId={session.user.id} setup={setup} error={initializationError} onActivated={reopen} onRetry={reopen} /> : <FlatList data={visible} inverted keyExtractor={m => m.id} initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5} keyboardShouldPersistTaps="handled" contentContainerStyle={s.messages} extraData={preparingMedia} renderItem={({ item }) => <MessageBubble message={item} own={item.sender_id === session.user.id} vault={messenger?.vault || null} downloadMedia={downloadMedia} preparingMedia={preparingMedia.has(item.id)} onSelect={setSelected} />} ListEmptyComponent={loading ? <View style={s.empty}><ActivityIndicator color={colors.yellow} /><Text style={s.note}>Memuat pesan…</Text></View> : <View style={s.empty}><Ionicons name="chatbubbles-outline" size={40} color={colors.yellow} /><Text style={s.name}>{query ? "Pesan tidak ditemukan" : "Mulai percakapan"}</Text><Text style={[s.note, { textAlign: "center" }]}>Ketik pesan di bawah untuk menyapa.</Text></View>} ListFooterComponent={older ? <Pressable style={s.security} onPress={() => { loadedLimit.current += 40; void refresh(); }}><Text style={s.note}>Lihat pesan sebelumnya</Text></Pressable> : null} />}
    {messenger && (error || initializationError || messenger.error) ? <ChatProblemNotice title="Chat belum bisa diperbarui" error={error || initializationError || messenger.error || ""} onRetry={retry} /> : null}
    {messenger ? <>
    {reply || editing || attachment ? <View style={s.context}><View style={{ flex: 1 }}><Text style={s.note}>{editing ? "Ubah pesan" : reply ? "Membalas pesan" : "Lampiran"}</Text><Text numberOfLines={2} style={s.text}>{attachment?.name || editing?.message || reply?.message || "Lampiran"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Batalkan lampiran atau balasan" style={s.iconButton} onPress={() => { setReply(null); setEditing(null); setAttachment(null); }}><Ionicons name="close" size={22} color={colors.text} /></Pressable></View> : null}
    {recording ? <VoiceRecorder onCancel={() => setRecording(false)} onReady={file => { setAttachment(file); setRecording(false); }} /> : <View style={s.composer}><Pressable accessibilityRole="button" accessibilityLabel="Tambah lampiran" style={s.iconButton} onPress={() => Alert.alert("Kirim lampiran", "Pilih yang ingin Anda kirim.", [{ text: "Foto atau video", onPress: () => void choose() }, { text: "Dokumen", onPress: () => void chooseDocument() }, { text: "Batal", style: "cancel" }])}><Ionicons name="attach" size={27} color={colors.textMuted} /></Pressable><TextInput accessibilityLabel="Ketik pesan" multiline maxLength={6000} value={draft} onChangeText={setDraft} placeholder={blocked ? "Kontak diblokir" : "Ketik pesan"} placeholderTextColor={colors.textMuted} style={s.input} editable={!blocked} /><Pressable accessibilityRole="button" accessibilityLabel="Ambil foto" style={s.iconButton} onPress={() => void choose(true)}><Ionicons name="camera-outline" size={27} color={colors.textMuted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={draft.trim() || attachment ? "Kirim pesan" : "Rekam pesan suara"} disabled={sending || blocked} style={s.send} onPress={() => draft.trim() || attachment ? void send() : setRecording(true)}>{sending ? <ActivityIndicator color={colors.background} /> : <Ionicons name={draft.trim() || attachment ? "send" : "mic"} size={23} color={colors.background} />}</Pressable></View>}
    </> : null}
    <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}><Pressable style={s.scrim} onPress={() => setMenu(false)}><ScrollView style={s.menu}>{[
      ["Lihat kontak", () => Alert.alert(roomName(room), room.other?.username ? `@${room.other.username}` : "Kontak ComePlayers")],
      ...(messenger ? [["Panggilan video", () => void perform(() => startCall(room.id, "video"))]] : []), ["Cari pesan", () => setSearching(v => !v)], ["Foto, video & dokumen", () => setFilter("media")], ["Pesan berbintang", () => setFilter("starred")],
      [pref?.pinned ? "Lepas sematan" : "Sematkan chat", () => void preference({ pinned: !pref?.pinned })],
      [pref?.muted ? "Aktifkan notifikasi" : "Bisukan notifikasi", () => void preference({ muted: !pref?.muted })],
      [pref?.archived ? "Keluarkan dari arsip" : "Arsipkan chat", () => void preference({ archived: !pref?.archived })],
      ["Privasi chat", openSecurity],
      ["Pengaturan chat", () => onNavigate("profile")],
      [blocked ? "Buka blokir kontak" : "Blokir kontak", () => void perform(async () => { await chatClient.blockContact(room.other!.id, !blocked); setBlocked(!blocked); })],
    ].map(([label, action]) => <Pressable key={String(label)} style={s.menuItem} onPress={() => menuAction(action as () => void)}><Text style={s.text}>{String(label)}</Text></Pressable>)}</ScrollView></Pressable></Modal>
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}><Pressable style={s.scrim} onPress={() => setSelected(null)}><View style={s.menu}>{selected ? <>{[["Balas", () => setReply(selected)], [selected.starred ? "Hapus bintang" : "Beri bintang", () => void perform(() => messenger!.star(selected))], ...(selected.sender_id === session.user.id && !selected.legacy && !selected.deleted_at ? [["Ubah pesan", () => { setEditing(selected); setDraft(selected.message || ""); }], ["Hapus untuk semua", () => void perform(() => messenger!.edit(selected))]] : [])].map(([label, action]) => <Pressable style={s.menuItem} key={String(label)} onPress={() => { setSelected(null); (action as () => void)(); }}><Text style={s.text}>{String(label)}</Text></Pressable>)}</> : null}</View></Pressable></Modal>
    <Modal visible={!!security} transparent animationType="fade" onRequestClose={() => setSecurity("")}><View style={s.scrim}><View style={[s.menu, { padding: 22 }]}><Text style={s.name}>Privasi chat</Text><Text style={[s.text, { lineHeight: 27, marginVertical: 20 }]} selectable>{security}</Text><Text style={s.note}>Pesan pribadi hanya bisa dibaca oleh Anda dan penerima. Pemeriksaan tambahan ini opsional. Jika ingin memeriksa identitas kontak, cocokkan angka di atas secara langsung.</Text><Pressable style={s.menuItem} onPress={() => setSecurity("")}><Text style={s.text}>Tutup</Text></Pressable></View></View></Modal>
  </KeyboardAvoidingView>;
}
const MessageBubble = memo(function MessageBubble({ message: m, own, vault, onSelect, downloadMedia, preparingMedia }: { message: PrivateMessage; own: boolean; vault: Vault | null; onSelect: (message: PrivateMessage) => void; downloadMedia: (message: PrivateMessage) => Promise<void> | undefined; preparingMedia: boolean }) {
  return <Pressable onLongPress={() => onSelect(m)} style={[s.bubble, own ? s.own : s.theirs]}>{m.legacy ? <Text style={s.legacy}>Pesan sebelumnya</Text> : null}{m.reply_to ? <View style={s.reply}><Text numberOfLines={2} style={s.note}>{m.reply_to.message || "Lampiran"}</Text></View> : null}{!m.deleted_at && m.localMedia && vault ? <PrivateMedia media={m.localMedia} vault={vault} /> : !m.deleted_at && m.secureAttachment ? <RemotePrivateMedia attachment={m.secureAttachment} onDownload={() => downloadMedia(m)} preparing={preparingMedia} /> : !m.deleted_at && m.legacy && m.attachment ? <RemoteLegacyMedia attachment={m.attachment} onDownload={() => downloadMedia(m)} preparing={preparingMedia} /> : null}<Text selectable style={s.text}>{m.deleted_at ? "Pesan dihapus" : m.message}</Text><Text style={s.time}>{m.starred ? "★ " : ""}{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{m.edited_at ? " · diubah" : ""}{own ? m.delivery === "queued" ? " ◷" : m.delivery === "read" ? " · Dibaca ✓✓" : m.delivery === "received" ? " ✓✓" : " ✓" : ""}</Text></Pressable>;
});
function RemotePrivateMedia({ attachment, onDownload, preparing }: { attachment: NonNullable<PrivateMessage["secureAttachment"]>; onDownload: () => Promise<void> | undefined; preparing: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const visual = /^(image|video)\//.test(attachment.mime);
  return <Pressable disabled={busy || preparing} onPress={() => { setBusy(true); setError(""); const pending = onDownload(); if (!pending) { setBusy(false); return; } void pending.catch(reason => setError(reason instanceof Error ? reason.message : "Lampiran belum berhasil dibuka. Ketuk untuk mencoba lagi.")).finally(() => setBusy(false)); }} style={{ paddingVertical: 10 }}><Text style={s.text}>{busy || preparing ? "Menyiapkan pratinjau…" : visual ? `${attachment.mime.startsWith("video/") ? "▶ Video" : "▧ Foto"} · ${attachment.name}` : `📄 ${attachment.name}`}</Text><Text style={s.note}>{error || `${Math.ceil(attachment.size / 1024)} KB · ${visual ? "Ketuk untuk membuka" : "Ketuk untuk mengunduh"}`}</Text></Pressable>;
}
function RemoteLegacyMedia({ attachment, onDownload, preparing }: { attachment: NonNullable<PrivateMessage["attachment"]>; onDownload: () => Promise<void> | undefined; preparing: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const visual = /^(image|video)\//.test(attachment.mime_type);
  return <Pressable disabled={busy || preparing} onPress={() => { setBusy(true); setError(""); const pending = onDownload(); if (!pending) { setBusy(false); return; } void pending.catch(reason => setError(reason instanceof Error ? reason.message : "Lampiran belum berhasil dibuka. Ketuk untuk mencoba lagi.")).finally(() => setBusy(false)); }} style={{ paddingVertical: 10 }}><Text style={s.text}>{busy || preparing ? "Menyiapkan pratinjau…" : visual ? `${attachment.mime_type.startsWith("video/") ? "▶ Video" : "▧ Foto"} · ${attachment.file_name}` : `📄 ${attachment.file_name}`}</Text><Text style={s.note}>{error || `${Math.ceil(attachment.size_bytes / 1024)} KB · ${visual ? "Ketuk untuk membuka" : "Ketuk untuk mengunduh"}`}</Text></Pressable>;
}
function PrivateMedia({ media, vault }: { media: LocalMedia; vault: Vault }) {
  const [uri, setUri] = useState(""), [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  useEffect(() => { let alive = true; let cleanup: (() => void) | undefined; void materializeMedia(vault, media.id).then(file => { cleanup = () => { if (file.exists) file.delete(); }; if (alive) setUri(file.uri); else cleanup(); }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; cleanup?.(); }; }, [media.id, vault]);
  if (error) return <Text style={s.note}>{error}</Text>;
  if (!uri) return <ActivityIndicator color={colors.yellow} />;
  if (media.mime.startsWith("image/")) return <><Pressable accessibilityLabel="Lihat foto" onPress={() => setPreview(true)}><Image source={{ uri }} style={{ width: 220, height: 180, borderRadius: 12 }} resizeMode="cover" /></Pressable><Modal visible={preview} onRequestClose={() => setPreview(false)}><View style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}><Pressable accessibilityLabel="Tutup foto" onPress={() => setPreview(false)}><Text style={s.text}>Tutup</Text></Pressable><Image source={{ uri }} style={{ flex: 1 }} resizeMode="contain" /><Pressable onPress={() => void Sharing.shareAsync(uri, { mimeType: media.mime }).catch(e => setError(e.message))}><Text style={s.text}>Simpan atau bagikan foto</Text></Pressable></View></Modal></>;
  if (media.mime.startsWith("audio/")) return <AudioPlayback url={uri} compact />;
  if (media.mime.startsWith("video/")) return <PrivateVideo uri={uri} />;
  return <Pressable onPress={() => void Sharing.shareAsync(uri, { mimeType: media.mime })}><Text style={s.text}>📄 {media.name}</Text><Text style={s.note}>Buka atau simpan dokumen · {Math.ceil(media.size / 1024)} KB</Text></Pressable>;
}
function PrivateVideo({ uri }: { uri: string }) {
  const [playing, setPlaying] = useState(false);
  return playing ? <PrivateVideoPlayer uri={uri} /> : <Pressable accessibilityRole="button" accessibilityLabel="Putar video" onPress={() => setPlaying(true)} style={{ width: 230, height: 180, borderRadius: 12, backgroundColor: colors.panelStrong, alignItems: "center", justifyContent: "center", gap: 8 }}><Ionicons name="play-circle" size={52} color={colors.yellow} /><Text style={s.text}>Putar video</Text></Pressable>;
}
function PrivateVideoPlayer({ uri }: { uri: string }) { const player = useVideoPlayer(uri, player => { player.play(); }); return <VideoView player={player} style={{ width: 230, height: 180 }} nativeControls fullscreenOptions={{ enable: true }} />; }
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background }, header: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border }, name: { color: colors.text, fontSize: 19, fontWeight: "700" }, note: { color: colors.textMuted, fontSize: 14, lineHeight: 21 }, text: { color: colors.text, fontSize: 17, lineHeight: 25 }, legacy: { color: colors.textDim, fontSize: 10, marginBottom: 5 }, security: { padding: 12, gap: 7, flexDirection: "row", justifyContent: "center" }, search: { margin: 12, padding: 13, borderRadius: 20, backgroundColor: colors.panel, color: colors.text }, messages: { padding: 12, flexGrow: 1 }, bubble: { borderRadius: 15, padding: 11, marginBottom: 8, maxWidth: "86%", minWidth: 90 }, own: { alignSelf: "flex-end", backgroundColor: "#273324" }, theirs: { alignSelf: "flex-start", backgroundColor: colors.panel }, time: { fontSize: 12, marginTop: 5, color: colors.textMuted, textAlign: "right" }, reply: { borderLeftWidth: 3, borderColor: colors.yellow, padding: 8, marginBottom: 6 }, empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 15, padding: 24 }, composer: { flexDirection: "row", alignItems: "center", gap: 3, padding: 8, borderTopWidth: 1, borderColor: colors.border }, input: { color: colors.text, fontSize: 17, flex: 1, maxHeight: 160, minHeight: 48, padding: 10, backgroundColor: colors.panel, borderRadius: 20 }, send: { backgroundColor: colors.yellow, borderRadius: 25, height: 48, width: 48, alignItems: "center", justifyContent: "center" }, context: { padding: 15, flexDirection: "row", backgroundColor: colors.panel }, error: { padding: 12 }, scrim: { flex: 1, backgroundColor: "#0008", justifyContent: "center", padding: 25 }, menu: { borderRadius: 18, backgroundColor: colors.panelStrong, maxHeight: "85%" }, menuItem: { padding: 17, minHeight: 52 }, iconButton: { minWidth: 44, minHeight: 48, justifyContent: "center", alignItems: "center" } });
