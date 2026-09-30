import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, FlatList, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import type { Session } from "@supabase/supabase-js";
import { profileContactLabel, roomName, type ChatMessage, type ChatRoom } from "@comeplayers/chat-core";
import { ContactsSheet } from "./ContactsSheet";
import { ChatProblemNotice } from "./ChatProblemNotice";
import { ChatKeyboardLayout, useChatScrollAnchor } from "./ChatKeyboardLayout";
import { Avatar, GroupAvatar } from "../components";
import { chatClient, supabase } from "../runtime";
import { colors, radius } from "../theme";
import { AudioPlayback, ChatMedia, VoiceRecorder, type PendingAttachment } from "./ChatMedia";
import { useCalls } from "../CallProvider";
import { loadChatPreferences, updateChatPreference, type ChatPreference } from "../messagingApi";
import { uploadChatAttachment } from "../chatAttachmentUpload";
import type { AppTab } from "../types";

// Keep only a few recently opened group conversations in memory. Reopening a
// room paints its last messages immediately while an authenticated refresh runs.
const recentConversations = new Map<string, { messages: ChatMessage[]; room: ChatRoom; at: number }>();
function cachedConversation(key: string) {
  const entry = recentConversations.get(key);
  if (entry && Date.now() - entry.at < 5 * 60_000) return entry;
  recentConversations.delete(key);
  return null;
}
function rememberConversation(key: string, messages: ChatMessage[], room: ChatRoom) {
  recentConversations.delete(key);
  recentConversations.set(key, { messages: messages.slice(-40), room, at: Date.now() });
  if (recentConversations.size > 8) recentConversations.delete(recentConversations.keys().next().value!);
}

export function ConversationScreen({ room, channelId, session, onBack, onRead, onNavigate }: { room: ChatRoom; channelId?: string; session: Session; onBack: () => void; onRead: () => void; onNavigate: (tab: AppTab) => void }) {
  const { startCall } = useCalls();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [recording, setRecording] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"chat" | "media" | "starred">("chat");
  const [prefs, setPrefs] = useState<ChatPreference | null>(null);
  const [stars, setStars] = useState<string[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [listName, setListName] = useState("");
  const [newGroup, setNewGroup] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const generation = useRef(0);
  const readRef = useRef(onRead);
  readRef.current = onRead;
  const inFlight = useRef<number | null>(null);
  const readThrough = useRef("");
  const mutations = useRef(0);
  const refreshPending = useRef(false);
  const reloadRef = useRef<(quiet?: boolean) => Promise<void>>(async () => undefined);
  const cacheKey = `${session.user.id}:${room.id}:${channelId || "default"}`;
  const [channelName, setChannelName] = useState("");
  const [details, setDetails] = useState(() => cachedConversation(cacheKey)?.room || room);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const blocked = !!details.contact_unavailable;
  const { listProps, scrollToLatest } = useChatScrollAnchor<ChatMessage>(cacheKey, view === "chat" && !search);
  const [messages, setMessages] = useState<ChatMessage[]>(() => cachedConversation(cacheKey)?.messages || []);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(() => !cachedConversation(cacheKey));
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async (quiet = false) => {
    if (AppState.currentState !== "active") return;
    if (inFlight.current === generation.current) { refreshPending.current = true; return; }
    const current = generation.current, mutation = mutations.current;
    inFlight.current = current;
    if (!quiet) setLoading(true);
    try {
      const data = await chatClient.getConversation(room.id, 40, { channelId, search, media: view === "media", starred: view === "starred" });
      if (current !== generation.current) return;
      if (mutation !== mutations.current) { refreshPending.current = true; return; }
      if (!search && view === "chat") rememberConversation(cacheKey, data.messages, data.room);
      setMessages(previous => {
        const ids = new Set(data.messages.map(message => message.id));
        const next = quiet ? [...previous.filter(message => !ids.has(message.id) && message.created_at < (data.messages[0]?.created_at || "")), ...data.messages] : data.messages;
        const existing = new Map(previous.map(message => [message.id, message]));
        const reconciled = next.map(message => {
          const saved = existing.get(message.id);
          return saved && (saved === message || JSON.stringify(saved) === JSON.stringify(message)) ? saved : message;
        });
        return previous.length === reconciled.length && previous.every((message, index) => message === reconciled[index]) ? previous : reconciled;
      });
      if (!quiet) setHasOlder(data.messages.length === 40);
      setDetails(data.room); setChannelName(data.channel?.name || "");
      setError("");
      // Render before receipt I/O. A quiet poll is not itself a new read.
      setLoading(false);
      const incoming = [...data.messages].reverse().find(message => message.sender_id !== session.user.id);
      if (incoming && incoming.id !== readThrough.current) {
        const lastRead = readThrough.current; readThrough.current = incoming.id;
        void chatClient.markRead(room.id, channelId, incoming.id).then(() => { if (current === generation.current) readRef.current(); }).catch(() => { if (current === generation.current) readThrough.current = lastRead; });
      }
    } catch (reason) {
      if (current === generation.current && !quiet) setError(reason instanceof Error ? reason.message : "Chat belum bisa dimuat.");
    } finally { if (current === generation.current) { inFlight.current = null; if (!quiet) setLoading(false); if (refreshPending.current) { refreshPending.current = false; void reloadRef.current(true); } } }
  }, [room.id, channelId, search, view, session.user.id, cacheKey]);
  reloadRef.current = reload;
  const displayMessages = useMemo(() => [...messages].reverse(), [messages]);
  const starredIds = useMemo(() => new Set(stars), [stars]);
  const reactToMessage = useCallback((messageId: string, emoji: string) => {
    setError("");
    void chatClient.toggleReaction(room.id, messageId, emoji).then(async () => {
      mutations.current++;
      await reloadRef.current(true);
    }).catch(reason => setError(reason instanceof Error ? reason.message : "Belum berhasil. Coba lagi."));
  }, [room.id]);

  useEffect(() => {
    generation.current++; inFlight.current = null; refreshPending.current = false;
    const cached = !search && view === "chat" ? cachedConversation(cacheKey) : null;
    setMessages(cached?.messages || []); setHasOlder(!!cached && cached.messages.length === 40); setLoading(!cached);
    if (cached) setDetails(cached.room);
    let connected = false;
    let changed: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (changed || AppState.currentState !== "active") return;
      changed = setTimeout(() => { changed = undefined; void reload(true); }, 250);
    };
    // Events are only invalidations. The authenticated API remains the source of data.
    const channel = supabase.channel(`conversation:${session.user.id}:${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `room_id=eq.${room.id}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_message_reactions", filter: `room_id=eq.${room.id}` }, schedule)
      .subscribe(status => { connected = status === "SUBSCRIBED"; if (connected) schedule(); });
    const debounce = setTimeout(() => void reload(!!cached), search ? 350 : 0);
    let ticks = 0;
    const timer = setInterval(() => { ticks++; if (!connected || ticks % 5 === 0) void reload(true); }, 6000);
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void reload(true); });
    return () => { generation.current++; refreshPending.current = false; clearTimeout(debounce); clearTimeout(changed); clearInterval(timer); subscription.remove(); void supabase.removeChannel(channel); };
  }, [reload, cacheKey, search, view]);
  useEffect(() => { let active = true; void loadChatPreferences().then(data => { if (active) { setPrefs(data.preferences.find(p => p.room_id === room.id) || null); setStars(data.starred); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [room.id]);
  const perform = async (action: () => Promise<unknown>) => { setError(""); try { await action(); mutations.current++; await reload(true); } catch (e) { setError(e instanceof Error ? e.message : "Belum berhasil. Coba lagi."); } };
  const preference = async (values: Record<string, unknown>) => {
    await updateChatPreference(room.id, values);
    const data = await loadChatPreferences(); setPrefs(data.preferences.find(p => p.room_id === room.id) || null); setStars(data.starred);
  };
  const loadOlder = async () => {
    if (!hasOlder || olderBusy || !messages[0]) return; setOlderBusy(true); const current = generation.current;
    try { const data = await chatClient.getConversation(room.id, 40, { channelId, before: messages[0].created_at, search, media: view === "media", starred: view === "starred" }); if (current === generation.current) { setMessages(rows => [...data.messages.filter(m => !rows.some(r => r.id === m.id)), ...rows]); setHasOlder(data.messages.length === 40); } }
    catch (e) { setError(e instanceof Error ? e.message : "Pesan sebelumnya belum bisa dimuat."); } finally { setOlderBusy(false); }
  };
  const chooseImage = async (camera = false) => {
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error("Izinkan akses kamera untuk mengambil foto.");
      const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: .8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: .8 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.type === "video") {
        if (asset.fileSize && asset.fileSize > 100 * 1024 * 1024) throw new Error("Pilih video berukuran maksimal 100 MB.");
        setAttachment({ uri: asset.uri, name: asset.fileName || "video.mp4", type: asset.mimeType || "video/mp4", size: asset.fileSize });
      } else { const image = await manipulateAsync(asset.uri, asset.width > 1400 ? [{ resize: { width: 1400 } }] : [], { compress: .7, format: SaveFormat.JPEG }); setAttachment({ uri: image.uri, name: `photo-${Date.now()}.jpg`, type: "image/jpeg" }); }
      setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Foto belum bisa dipilih."); }
  };
  const chooseDocument = async () => {
    try { const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "audio/mp4"], copyToCacheDirectory: true }); if (result.canceled) return; const file = result.assets[0]; if (!file) return; if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("Pilih file PDF atau M4A berukuran maksimal 10 MB."); setAttachment({ uri: file.uri, name: file.name, type: file.mimeType || "application/pdf", size: file.size }); setEditing(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Dokumen belum bisa dipilih."); }
  };

  const send = async () => {
    const message = draft.trim();
    if ((!message && !attachment) || sending || blocked) return;
    setSending(true); setError("");
    try {
      if (editing) await chatClient.editMessage(room.id, editing.id, message);
      else {
        const uploaded = attachment ? await uploadChatAttachment(room.id, attachment, setUploadProgress) : null;
        const result = await chatClient.sendMessage(room.id, message, uploaded?.id, reply?.id, channelId);
        if (!search && view === "chat") setMessages(previous => previous.some(row => row.id === result.message.id) ? previous : [...previous, { ...result.message, attachment: uploaded || null, reply_to: reply || null }]);
      }
      mutations.current++;
      setDraft(current => current === draft ? "" : current); setAttachment(null); setReply(null); setEditing(null);
      void reload(true);
      if (!editing && view === "chat" && !search) scrollToLatest();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pesan belum terkirim. Coba lagi.");
    } finally { setSending(false); setUploadProgress(null); }
  };

  const toggleBlock = () => {
    if (!details.other?.id || blockBusy) return;
    const next = !details.blocked_by_me;
    Alert.alert(next ? "Blokir kontak?" : "Buka blokir kontak?", next ? "Kontak ini tidak bisa mengirim pesan pribadi atau undangan grup kepada Anda. Pesan di grup bersama tetap ada." : "Kontak ini bisa mengirim pesan kepada Anda lagi.", [
      { text: "Batal", style: "cancel" },
      { text: next ? "Blokir" : "Buka blokir", style: next ? "destructive" : "default", onPress: () => {
        setBlockBusy(true);
        void chatClient.blockContact(details.other!.id, next).then(() => reload(true))
          .catch(e => setError(e.message)).finally(() => setBlockBusy(false));
      } },
    ]);
  };
  const menuAction = (action: () => void) => { setMenuOpen(false); action(); };
  return <ChatKeyboardLayout style={styles.root}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Kembali ke chat" style={styles.iconButton} onPress={onBack}><Ionicons name="arrow-back" size={26} color={colors.text} /></Pressable>{room.room_type === "group" ? <GroupAvatar uri={room.server?.icon_url} size={38} /> : <Avatar uri={room.other?.avatar_url} name={roomName(room)} size={38} accent={room.order_id ? "yellow" : "blue"} />}<View style={styles.headerCopy}><Text style={styles.title} numberOfLines={1}>{roomName(room)}</Text><Text style={styles.subtitle}>{view === "media" ? "Foto, video & dokumen" : view === "starred" ? "Pesan berbintang" : room.order_id ? `Pesanan #${room.order_id}` : room.room_type === "group" ? channelName ? `# ${channelName}` : "Chat komunitas" : "Chat pribadi"}</Text></View>{room.room_type !== "group" ? <><Pressable accessibilityRole="button" accessibilityLabel="Panggilan video" style={styles.iconButton} disabled={blocked} hitSlop={8} onPress={() => void perform(() => startCall(room.id, "video"))}><Ionicons name="videocam-outline" size={24} color={blocked ? colors.textDim : colors.text} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Panggilan suara" style={styles.iconButton} disabled={blocked} hitSlop={8} onPress={() => void perform(() => startCall(room.id, "audio"))}><Ionicons name="call-outline" size={23} color={blocked ? colors.textDim : colors.text} /></Pressable></> : null}<Pressable accessibilityRole="button" accessibilityLabel="Pilihan chat" style={styles.iconButton} hitSlop={8} onPress={() => setMenuOpen(true)}><Ionicons name="ellipsis-vertical" size={24} color={colors.text} /></Pressable></View>
    {searchOpen ? <View style={styles.searchRow}><TextInput autoFocus accessibilityLabel="Cari dalam chat" value={search} onChangeText={setSearch} placeholder="Cari dalam chat" placeholderTextColor={colors.textDim} style={styles.searchInput} /><Pressable onPress={() => { setSearch(""); setSearchOpen(false); }}><Text style={styles.action}>Tutup</Text></Pressable></View> : null}
    {view !== "chat" ? <Pressable style={styles.searchRow} onPress={() => setView("chat")}><Text style={styles.action}>‹ Kembali ke chat</Text></Pressable> : null}
    {room.order_id ? <View style={styles.safety}><Text style={styles.safetyIcon}>◆</Text><Text style={styles.safetyText}>Jaga keamanan transaksi. Jangan bagikan sandi, kode OTP, atau data kartu.</Text></View> : null}
    {loading ? <View style={styles.center}><ActivityIndicator color={colors.yellow} /><Text style={styles.loadingText}>Memuat pesan…</Text></View> : <FlatList {...listProps} inverted initialNumToRender={12} maxToRenderPerBatch={8} windowSize={7} data={displayMessages} keyExtractor={(item) => item.id} contentContainerStyle={styles.messages} ListFooterComponent={hasOlder ? <Pressable style={styles.older} disabled={olderBusy} onPress={() => void loadOlder()}><Text style={styles.action}>{olderBusy ? "Memuat…" : "Lihat pesan sebelumnya"}</Text></Pressable> : null} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyIcon}>✦</Text><Text style={styles.emptyTitle}>{search || view !== "chat" ? "Pesan tidak ditemukan" : "Mulai percakapan"}</Text><Text style={styles.emptyText}>{search || view !== "chat" ? "Coba kata lain atau kembali ke chat." : "Ketik pesan di bawah untuk menyapa."}</Text></View>} renderItem={({ item }) => <ConversationMessage item={item} own={item.sender_id === session.user.id} group={room.room_type === "group"} groupName={roomName(room)} starred={starredIds.has(item.id)} onSelect={setSelected} onReact={reactToMessage} />} />}
    {error ? <ChatProblemNotice title="Chat belum bisa diperbarui" error={error} onRetry={() => void reload()} /> : null}
    {blocked ? <Text style={styles.error}>{details.blocked_by_me ? "Kontak ini diblokir. Buka Pilihan chat untuk membuka blokir." : "Kontak ini belum bisa menerima pesan."}</Text> : null}
    {reply || editing ? <View style={styles.draftPreview}><View style={{ flex: 1 }}><Text style={styles.action}>{editing ? "Ubah pesan" : `Balas ${reply?.sender?.username || "pesan"}`}</Text><Text numberOfLines={2} style={styles.subtitle}>{(editing || reply)?.message || "Lampiran"}</Text></View><Pressable accessibilityLabel="Batalkan balasan atau perubahan" onPress={() => { setReply(null); if (editing) setDraft(""); setEditing(null); }}><Ionicons name="close" size={25} color={colors.text} /></Pressable></View> : null}
    {attachment ? <View style={styles.draftPreview}>{attachment.type.startsWith("image/") ? <Image source={{ uri: attachment.uri }} style={{ width: 52, height: 52, borderRadius: 8 }} /> : <Ionicons name={attachment.type.startsWith("audio/") ? "mic" : attachment.type.startsWith("video/") ? "videocam" : "document"} size={28} color={colors.yellow} />}<View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.action}>{attachment.name}</Text><Text style={styles.subtitle}>{sending ? uploadProgress === null ? "Mengirim lampiran…" : `Mengunggah ${uploadProgress}%…` : "Siap dikirim"}</Text></View><Pressable accessibilityLabel="Hapus lampiran" disabled={sending} onPress={() => setAttachment(null)}><Ionicons name="close" size={25} color={colors.text} /></Pressable></View> : null}
    {attachment?.type.startsWith("audio/") ? <AudioPlayback url={attachment.uri} compact /> : null}
    {recording ? <VoiceRecorder onCancel={() => setRecording(false)} onReady={file => { setRecording(false); setAttachment(file); }} /> : <View style={styles.composer}><View style={styles.inputGroup}><TextInput editable={!blocked} accessibilityLabel="Ketik pesan" value={draft} onChangeText={setDraft} placeholder="Ketik pesan" placeholderTextColor={colors.textDim} style={styles.input} multiline maxLength={2000} /><Pressable accessibilityRole="button" accessibilityLabel="Tambah lampiran" style={styles.iconButton} disabled={blocked || sending || !!editing} onPress={() => Alert.alert("Kirim lampiran", "Foto dan dokumen maksimal 10 MB; video maksimal 100 MB.", [{ text: "Foto atau video", onPress: () => void chooseImage() }, { text: "Dokumen atau rekaman suara", onPress: () => void chooseDocument() }, { text: "Batal", style: "cancel" }])}><Ionicons name="attach" size={25} color={colors.textMuted} /></Pressable>{!draft && !attachment ? <Pressable accessibilityRole="button" accessibilityLabel="Ambil foto" style={styles.iconButton} disabled={blocked || sending || !!editing} onPress={() => void chooseImage(true)}><Ionicons name="camera-outline" size={25} color={colors.textMuted} /></Pressable> : null}</View><Pressable accessibilityLabel={draft.trim() || attachment || editing ? "Kirim pesan" : "Rekam pesan suara"} disabled={sending || blocked} onPress={() => draft.trim() || attachment || editing ? void send() : setRecording(true)} style={[styles.send, (sending || blocked) && styles.sendDisabled]}>{sending ? <ActivityIndicator size="small" color={colors.background} /> : <Ionicons name={draft.trim() || attachment || editing ? "send" : "mic"} size={23} color={colors.background} />}</Pressable></View>}
    <ContactsSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} onOpenRoom={() => {}} inviteRoom={room} />
    <ContactsSheet allowGroups visible={newGroup} initialMode="group" onClose={() => setNewGroup(false)} onOpenRoom={() => { setNewGroup(false); onBack(); }} />
    <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}><Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}><ScrollView style={styles.menu} contentContainerStyle={{ paddingVertical: 8 }}>{[
      ["Buat pesanan", () => onNavigate("marketplace")],
      [room.room_type === "group" ? "Info komunitas" : "Lihat kontak", () => Alert.alert(roomName(room), room.room_type === "group" ? `${details.members?.length || 0} anggota` : [details.other?.full_name, profileContactLabel(details.other)].filter(Boolean).join("\n"))],
      ["Cari pesan", () => setSearchOpen(true)],
      [prefs?.pinned ? "Lepas sematan" : "Sematkan chat", () => void perform(() => preference({ pinned: !prefs?.pinned }))],
      ["Tambahkan ke daftar", () => { setListName(prefs?.list_name || ""); setListOpen(true); }],
      ["Foto, video & dokumen", () => setView("media")],
      ["Tautan", () => { setView("chat"); setSearchOpen(true); setSearch("https://"); }],
      ["Pesan berbintang", () => setView("starred")],
      [prefs?.muted ? "Aktifkan notifikasi" : "Bisukan notifikasi", () => void perform(() => preference({ muted: !prefs?.muted }))],
      [prefs?.archived ? "Keluarkan dari arsip" : "Arsipkan chat", () => void perform(() => preference({ archived: !prefs?.archived }))],
      [room.room_type === "group" ? "Undang ke grup" : "Grup baru", () => room.room_type === "group" ? setInviteOpen(true) : setNewGroup(true)],
      ["Kosongkan chat saya", () => Alert.alert("Kosongkan chat ini?", "Pesan sebelumnya akan disembunyikan di akun Anda. Anggota lain tetap bisa membacanya.", [{ text: "Batal", style: "cancel" }, { text: "Kosongkan chat", style: "destructive", onPress: () => void perform(async () => { await preference({ action: "clear" }); setMessages([]); setHasOlder(false); }) }])],
      ...(room.room_type !== "group" ? [[details.blocked_by_me ? "Buka blokir kontak" : "Blokir kontak", toggleBlock]] : []),
    ].map(([label, action]) => <Pressable key={String(label)} style={styles.menuItem} onPress={() => menuAction(action as () => void)}><Text style={styles.menuText}>{String(label)}</Text></Pressable>)}</ScrollView></Pressable></Modal>
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}><Pressable style={styles.bottomBackdrop} onPress={() => setSelected(null)}><View style={styles.actionSheet}>{selected && !selected.deleted_at ? <><View style={styles.reactions}>{["👍", "❤️", "😂", "😮", "😢", "🙏"].map(emoji => <Pressable key={emoji} style={styles.emoji} onPress={() => { const message = selected; setSelected(null); void perform(() => chatClient.toggleReaction(room.id, message.id, emoji)); }}><Text style={{ fontSize: 27 }}>{emoji}</Text></Pressable>)}</View>{[
      ["Balas", () => { setReply(selected); setEditing(null); }],
      [stars.includes(selected.id) ? "Hapus bintang" : "Beri bintang", () => void perform(() => preference({ action: "star", messageId: selected.id, starred: !stars.includes(selected.id) }))],
      ...(selected.sender_id === session.user.id ? [["Ubah pesan", () => { setEditing(selected); setDraft(selected.message || ""); setAttachment(null); setReply(null); }], ["Hapus untuk semua", () => Alert.alert("Hapus pesan?", "Pesan ini akan dihapus untuk semua anggota.", [{ text: "Batal", style: "cancel" }, { text: "Hapus", style: "destructive", onPress: () => void perform(() => chatClient.deleteMessage(room.id, selected.id)) }])]] : [["Laporkan pesan", () => Alert.alert("Laporkan pesan", "Pilih alasan laporan.", ["spam", "harassment", "scam"].map(reason => ({ text: reason, onPress: () => void perform(async () => { await chatClient.reportMessage(selected.id, reason); Alert.alert("Laporan dikirim", "Tim kami akan memeriksa laporan Anda."); }) })).concat([{ text: "Batal", onPress: () => {} }]))]]),
    ].map(([label, action]) => <Pressable key={String(label)} style={styles.menuItem} onPress={() => { (action as () => void)(); setSelected(null); }}><Text style={styles.menuText}>{String(label)}</Text></Pressable>)}</> : <Text style={styles.menuText}>Pesan ini sudah dihapus.</Text>}</View></Pressable></Modal>
    <Modal visible={listOpen} transparent onRequestClose={() => setListOpen(false)}><View style={styles.bottomBackdrop}><View style={styles.actionSheet}><Text style={styles.title}>Daftar chat</Text><TextInput accessibilityLabel="Nama daftar chat" value={listName} onChangeText={setListName} maxLength={40} placeholder="Keluarga, teman, pekerjaan…" placeholderTextColor={colors.textDim} style={styles.searchInput} /><Text style={styles.subtitle}>Kosongkan jika ingin mengeluarkan chat dari daftar.</Text><Pressable style={styles.menuItem} onPress={() => { setListOpen(false); void perform(() => preference({ listName })); }}><Text style={styles.action}>Simpan</Text></Pressable><Pressable style={styles.menuItem} onPress={() => setListOpen(false)}><Text style={styles.menuText}>Batal</Text></Pressable></View></View></Modal>
  </ChatKeyboardLayout>;
}

// Keep the message tree stable while typing or opening the composer menu.
// Only a changed message, receipt, reaction or star needs to render again.
const ConversationMessage = memo(function ConversationMessage({ item, own, group, groupName, starred, onSelect, onReact }: {
  item: ChatMessage; own: boolean; group: boolean; groupName: string; starred: boolean;
  onSelect: (message: ChatMessage) => void; onReact: (messageId: string, emoji: string) => void;
}) {
  return <View style={[styles.messageRow, own && styles.messageRowOwn]}><Pressable accessibilityHint="Tekan lama untuk membalas atau mengatur pesan" onLongPress={() => onSelect(item)} style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}>{group && !own ? <Text style={styles.sender}>{item.sender?.username || item.sender?.full_name || groupName}</Text> : null}{item.reply_to ? <View style={styles.quote}><Text style={styles.sender}>{item.reply_to.sender?.username || "Balas"}</Text><Text numberOfLines={2} style={styles.subtitle}>{item.reply_to.deleted_at ? "Pesan dihapus" : item.reply_to.message || "Lampiran"}</Text></View> : null}{item.attachment && !item.deleted_at ? <ChatMedia attachment={item.attachment} /> : null}{item.message || item.deleted_at ? <MessageText value={item.deleted_at ? "Pesan dihapus" : item.message || ""} /> : null}<View style={styles.receipt}><Text style={styles.messageTime}>{starred ? "★ " : ""}{item.edited_at ? "Diubah · " : ""}{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>{own ? <Ionicons name={item.is_read ? "checkmark-done" : "checkmark"} size={16} color={item.is_read ? colors.blue : colors.textDim} /> : null}</View>{item.reactions?.length ? <View style={styles.reactions}>{item.reactions.map(r => <Pressable key={r.emoji} style={[styles.reaction, r.reacted_by_me && { borderColor: colors.yellow }]} onPress={() => onReact(item.id, r.emoji)}><Text style={styles.messageText}>{r.emoji} {r.count}</Text></Pressable>)}</View> : null}</Pressable></View>;
});

function MessageText({ value }: { value: string }) { return <Text style={styles.messageText}>{value.split(/(https?:\/\/[^\s]+)/g).map((part, index) => /^https?:\/\//.test(part) ? <Text key={index} style={{ color: colors.blue, textDecorationLine: "underline" }} onPress={() => Alert.alert("Buka tautan?", part, [{ text: "Batal", style: "cancel" }, { text: "Buka", onPress: () => void Linking.openURL(part).catch(() => Alert.alert("Tautan belum bisa dibuka")) }])}>{part}</Text> : part)}</Text>; }

const styles = StyleSheet.create({
  searchRow:{flexDirection:"row",alignItems:"center",gap:12,paddingHorizontal:16,paddingVertical:8,backgroundColor:colors.panel},searchInput:{flex:1,minHeight:50,color:colors.text,fontSize:16},action:{color:colors.yellow,fontSize:14,fontWeight:"700"},older:{alignItems:"center",padding:18},quote:{borderLeftWidth:3,borderLeftColor:colors.yellow,backgroundColor:"rgba(0,0,0,.2)",padding:9,borderRadius:7,marginBottom:8},receipt:{flexDirection:"row",justifyContent:"flex-end",alignItems:"center",gap:5,marginTop:4},reactions:{flexDirection:"row",flexWrap:"wrap",gap:5,marginTop:6},reaction:{borderWidth:1,borderColor:colors.border,borderRadius:14,paddingHorizontal:7,paddingVertical:3},draftPreview:{flexDirection:"row",alignItems:"center",gap:12,padding:12,backgroundColor:colors.panel},inputGroup:{flex:1,flexDirection:"row",alignItems:"center",gap:2,paddingRight:4,borderRadius:25,backgroundColor:colors.panel},backdrop:{flex:1,backgroundColor:"rgba(0,0,0,.45)",alignItems:"flex-end",paddingTop:70,paddingBottom:30,paddingHorizontal:12},menu:{backgroundColor:colors.panel,borderRadius:18,maxHeight:"95%",width:275,borderWidth:1,borderColor:colors.border},menuItem:{paddingHorizontal:22,paddingVertical:17},menuText:{color:colors.text,fontSize:16},bottomBackdrop:{flex:1,justifyContent:"flex-end",backgroundColor:"rgba(0,0,0,.6)"},actionSheet:{padding:16,paddingBottom:35,borderTopLeftRadius:25,borderTopRightRadius:25,backgroundColor:colors.panel},emoji:{padding:7},
  root: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: "#070b12" },
  back: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 13, borderWidth: 1, borderColor: colors.borderStrong },
  backText: { color: colors.text, fontSize: 31, lineHeight: 32, fontWeight: "300" },
  headerCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 17, fontWeight: "700" },
  subtitle: { marginTop: 3, color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  online: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.green },
  safety: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, padding: 11, borderRadius: radius.medium, borderWidth: 1, borderColor: "rgba(255,208,0,.24)", backgroundColor: colors.yellowSoft },
  safetyIcon: { color: colors.yellow, fontSize: 12 },
  safetyText: { flex: 1, color: "#e7dba1", fontSize: 11, lineHeight: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 10, color: colors.textMuted, fontSize: 15 },
  messages: { flexGrow: 1, paddingHorizontal: 14, paddingVertical: 16 },
  empty: { alignItems: "center", padding: 30, transform: [{ scaleY: -1 }] },
  emptyIcon: { color: colors.yellow, fontSize: 35 },
  emptyTitle: { marginTop: 12, color: colors.text, fontSize: 19, fontWeight: "900" },
  emptyText: { marginTop: 7, color: colors.textMuted, fontSize: 16, lineHeight: 24, textAlign: "center" },
  messageRow: { alignItems: "flex-start", marginBottom: 9 },
  messageRowOwn: { alignItems: "flex-end" },
  bubble: { maxWidth: "82%", paddingHorizontal: 13, paddingVertical: 10, borderRadius: 17, borderWidth: 1 },
  bubbleOther: { borderColor: "rgba(39,183,255,.22)", borderBottomLeftRadius: 5, backgroundColor: "#102235" },
  bubbleOwn: { borderColor: "rgba(255,208,0,.3)", borderBottomRightRadius: 5, backgroundColor: "#2b2405" },
  sender: { marginBottom: 4, color: colors.blue, fontSize: 12, fontWeight: "700" },
  senderOwn: { color: colors.yellow },
  messageText: { color: colors.text, fontSize: 17, lineHeight: 25 },
  messageTime: { alignSelf: "flex-end", marginTop: 5, color: colors.textMuted, fontSize: 12 },
  error: { marginHorizontal: 14, marginBottom: 6, color: colors.red, fontSize: 14, textAlign: "center" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "#070b12" },
  input: { flex: 1, minHeight: 48, maxHeight: 160, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 11, borderRadius: 18, borderWidth: 1, borderColor: colors.borderStrong, color: colors.text, fontSize: 17, backgroundColor: colors.panel },
  send: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.yellow },
  sendDisabled: { opacity: .36 },
  iconButton: { minWidth: 44, minHeight: 48, alignItems: "center", justifyContent: "center" },
  sendText: { color: colors.background, fontSize: 19, fontWeight: "900" },
});
