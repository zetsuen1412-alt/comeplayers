import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import type { Session } from "@supabase/supabase-js";
import { roomName, type ChatMessage, type ChatRoom } from "@comeplayers/chat-core";
import { ContactsSheet } from "./ContactsSheet";
import { Avatar } from "../components";
import { chatClient } from "../runtime";
import { colors, radius } from "../theme";
import { AudioPlayback, ChatMedia, VoiceRecorder, type PendingAttachment } from "./ChatMedia";
import { useCalls } from "../CallProvider";
import { loadChatPreferences, updateChatPreference, type ChatPreference } from "../messagingApi";
import type { AppTab } from "../types";

export function ConversationScreen({ room, session, onBack, onRead, onNavigate }: { room: ChatRoom; session: Session; onBack: () => void; onRead: () => void; onNavigate: (tab: AppTab) => void }) {
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
  const inFlight = useRef(false);
  const [details, setDetails] = useState(room);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const blocked = !!details.contact_unavailable;
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async (quiet = false) => {
    if (inFlight.current || AppState.currentState !== "active") return;
    const current = generation.current;
    inFlight.current = true;
    if (!quiet) setLoading(true);
    try {
      const data = await chatClient.getConversation(room.id, 80, { search, media: view === "media", starred: view === "starred" });
      if (current !== generation.current) return;
      setMessages(previous => quiet ? [...previous.filter(m => !data.messages.some(n => n.id === m.id) && m.created_at < (data.messages[0]?.created_at || "")), ...data.messages] : data.messages);
      if (!quiet) setHasOlder(data.messages.length === 80);
      setDetails(data.room);
      setError("");
      await chatClient.markRead(room.id).catch(() => undefined);
      readRef.current();
    } catch (reason) {
      if (current === generation.current && !quiet) setError(reason instanceof Error ? reason.message : "Conversation unavailable.");
    } finally { inFlight.current = false; if (!quiet) setLoading(false); }
  }, [room.id, search, view]);

  useEffect(() => {
    generation.current++; inFlight.current = false;
    setMessages([]); setHasOlder(false);
    const debounce = setTimeout(() => void reload(), search ? 350 : 0);
    const timer = setInterval(() => void reload(true), 6000);
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void reload(true); });
    return () => { generation.current++; clearTimeout(debounce); clearInterval(timer); subscription.remove(); };
  }, [reload]);
  useEffect(() => { let active = true; void loadChatPreferences().then(data => { if (active) { setPrefs(data.preferences.find(p => p.room_id === room.id) || null); setStars(data.starred); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [room.id]);
  const perform = async (action: () => Promise<unknown>) => { setError(""); try { await action(); await reload(true); } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); } };
  const preference = async (values: Record<string, unknown>) => {
    await updateChatPreference(room.id, values);
    const data = await loadChatPreferences(); setPrefs(data.preferences.find(p => p.room_id === room.id) || null); setStars(data.starred);
  };
  const loadOlder = async () => {
    if (!hasOlder || olderBusy || !messages[0]) return; setOlderBusy(true); const current = generation.current;
    try { const data = await chatClient.getConversation(room.id, 80, { before: messages[0].created_at, search, media: view === "media", starred: view === "starred" }); if (current === generation.current) { setMessages(rows => [...data.messages.filter(m => !rows.some(r => r.id === m.id)), ...rows]); setHasOlder(data.messages.length === 80); } }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load older messages."); } finally { setOlderBusy(false); }
  };
  const chooseImage = async (camera = false) => {
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error("Allow camera access to take a photo.");
      const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: .8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: .8 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.type === "video") {
        if (!asset.fileSize || asset.fileSize > 4 * 1024 * 1024) throw new Error("Choose a video under 4 MB for mobile chat.");
        setAttachment({ uri: asset.uri, name: asset.fileName || "video.mp4", type: asset.mimeType || "video/mp4", size: asset.fileSize });
      } else { const image = await manipulateAsync(asset.uri, [{ resize: { width: 1400 } }], { compress: .7, format: SaveFormat.JPEG }); setAttachment({ uri: image.uri, name: `photo-${Date.now()}.jpg`, type: "image/jpeg" }); }
      setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not select photo."); }
  };
  const chooseDocument = async () => {
    try { const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "audio/mp4"], copyToCacheDirectory: true }); if (result.canceled) return; const file = result.assets[0]; if (!file) return; if (!file.size || file.size > 4 * 1024 * 1024) throw new Error("Choose a PDF or M4A file under 4 MB."); setAttachment({ uri: file.uri, name: file.name, type: file.mimeType || "application/pdf", size: file.size }); setEditing(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not select document."); }
  };

  const send = async () => {
    const message = draft.trim();
    if ((!message && !attachment) || sending || blocked) return;
    setSending(true); setError("");
    try {
      if (editing) await chatClient.editMessage(room.id, editing.id, message);
      else { const uploaded = attachment ? await chatClient.uploadAttachment(room.id, attachment) : null; await chatClient.sendMessage(room.id, message, uploaded?.id, reply?.id); }
      setDraft(""); setAttachment(null); setReply(null); setEditing(null);
      await reload(true);
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 60);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Message could not be sent.");
    } finally { setSending(false); }
  };

  const toggleBlock = () => {
    if (!details.other?.id || blockBusy) return;
    const next = !details.blocked_by_me;
    Alert.alert(next ? "Block contact?" : "Unblock contact?", next ? "You will no longer exchange direct messages or group invitations. Shared group messages are not affected." : "This contact will be able to message you again.", [
      { text: "Cancel", style: "cancel" },
      { text: next ? "Block" : "Unblock", style: next ? "destructive" : "default", onPress: () => {
        setBlockBusy(true);
        void chatClient.blockContact(details.other!.id, next).then(() => reload(true))
          .catch(e => setError(e.message)).finally(() => setBlockBusy(false));
      } },
    ]);
  };
  const menuAction = (action: () => void) => { setMenuOpen(false); action(); };
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
    <View style={styles.header}><Pressable accessibilityLabel="Back to chats" onPress={onBack}><Ionicons name="arrow-back" size={26} color={colors.text} /></Pressable><Avatar uri={room.server?.icon_url || room.other?.avatar_url} name={roomName(room)} size={38} accent={room.order_id ? "yellow" : "blue"} /><View style={styles.headerCopy}><Text style={styles.title} numberOfLines={1}>{roomName(room)}</Text><Text style={styles.subtitle}>{view === "media" ? "Media and documents" : view === "starred" ? "Starred messages" : room.order_id ? `Order #${room.order_id}` : room.room_type === "group" ? "Group conversation" : "Direct message"}</Text></View>{room.room_type !== "group" ? <><Pressable accessibilityLabel="Video call" disabled={blocked} hitSlop={8} onPress={() => void perform(() => startCall(room.id, "video"))}><Ionicons name="videocam-outline" size={24} color={blocked ? colors.textDim : colors.text} /></Pressable><Pressable accessibilityLabel="Voice call" disabled={blocked} hitSlop={8} onPress={() => void perform(() => startCall(room.id, "audio"))}><Ionicons name="call-outline" size={23} color={blocked ? colors.textDim : colors.text} /></Pressable></> : null}<Pressable accessibilityLabel="Conversation menu" hitSlop={8} onPress={() => setMenuOpen(true)}><Ionicons name="ellipsis-vertical" size={24} color={colors.text} /></Pressable></View>
    {searchOpen ? <View style={styles.searchRow}><TextInput autoFocus accessibilityLabel="Search this conversation" value={search} onChangeText={setSearch} placeholder="Search this conversation" placeholderTextColor={colors.textDim} style={styles.searchInput} /><Pressable onPress={() => { setSearch(""); setSearchOpen(false); }}><Text style={styles.action}>Close</Text></Pressable></View> : null}
    {view !== "chat" ? <Pressable style={styles.searchRow} onPress={() => setView("chat")}><Text style={styles.action}>‹ Back to conversation</Text></Pressable> : null}
    {room.order_id ? <View style={styles.safety}><Text style={styles.safetyIcon}>◆</Text><Text style={styles.safetyText}>Protected transaction. Never share passwords, OTP codes, or card details.</Text></View> : null}
    {loading ? <View style={styles.center}><ActivityIndicator color={colors.yellow} /><Text style={styles.loadingText}>Loading messages</Text></View> : <FlatList ref={listRef} inverted data={[...messages].reverse()} keyExtractor={(item) => item.id} contentContainerStyle={styles.messages} ListFooterComponent={hasOlder ? <Pressable style={styles.older} disabled={olderBusy} onPress={() => void loadOlder()}><Text style={styles.action}>{olderBusy ? "Loading…" : "Load earlier messages"}</Text></Pressable> : null} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyIcon}>✦</Text><Text style={styles.emptyTitle}>{search || view !== "chat" ? "No matching messages" : "Start the conversation"}</Text><Text style={styles.emptyText}>{search || view !== "chat" ? "Try another search or return to the conversation." : "Say hello or ask about the order, product, or community."}</Text></View>} renderItem={({ item }) => {
      const own = item.sender_id === session.user.id;
      return <View style={[styles.messageRow, own && styles.messageRowOwn]}><Pressable accessibilityHint="Long press for message actions" onLongPress={() => setSelected(item)} style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}>{room.room_type === "group" && !own ? <Text style={styles.sender}>{item.sender?.username || item.sender?.full_name || roomName(room)}</Text> : null}{item.reply_to ? <View style={styles.quote}><Text style={styles.sender}>{item.reply_to.sender?.username || "Reply"}</Text><Text numberOfLines={2} style={styles.subtitle}>{item.reply_to.deleted_at ? "Message deleted" : item.reply_to.message || "Attachment"}</Text></View> : null}{item.attachment && !item.deleted_at ? <ChatMedia attachment={item.attachment} /> : null}{item.message || item.deleted_at ? <MessageText value={item.deleted_at ? "Message deleted" : item.message || ""} /> : null}<View style={styles.receipt}><Text style={styles.messageTime}>{stars.includes(item.id) ? "★ " : ""}{item.edited_at ? "Edited · " : ""}{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>{own ? <Ionicons name={item.is_read ? "checkmark-done" : "checkmark"} size={16} color={item.is_read ? colors.blue : colors.textDim} /> : null}</View>{item.reactions?.length ? <View style={styles.reactions}>{item.reactions.map(r => <Pressable key={r.emoji} style={[styles.reaction, r.reacted_by_me && { borderColor: colors.yellow }]} onPress={() => void perform(() => chatClient.toggleReaction(room.id, item.id, r.emoji))}><Text style={styles.messageText}>{r.emoji} {r.count}</Text></Pressable>)}</View> : null}</Pressable></View>;
    }} />}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {blocked ? <Text style={styles.error}>{details.blocked_by_me ? "You blocked this contact. Use the menu to unblock." : "Messaging is unavailable for this contact."}</Text> : null}
    {reply || editing ? <View style={styles.draftPreview}><View style={{ flex: 1 }}><Text style={styles.action}>{editing ? "Edit message" : `Reply to ${reply?.sender?.username || "message"}`}</Text><Text numberOfLines={2} style={styles.subtitle}>{(editing || reply)?.message || "Attachment"}</Text></View><Pressable accessibilityLabel="Cancel reply or edit" onPress={() => { setReply(null); if (editing) setDraft(""); setEditing(null); }}><Ionicons name="close" size={25} color={colors.text} /></Pressable></View> : null}
    {attachment ? <View style={styles.draftPreview}>{attachment.type.startsWith("image/") ? <Image source={{ uri: attachment.uri }} style={{ width: 52, height: 52, borderRadius: 8 }} /> : <Ionicons name={attachment.type.startsWith("audio/") ? "mic" : "document"} size={28} color={colors.yellow} />}<View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.action}>{attachment.name}</Text><Text style={styles.subtitle}>Ready to send · Remove to discard</Text></View><Pressable accessibilityLabel="Remove attachment" onPress={() => setAttachment(null)}><Ionicons name="close" size={25} color={colors.text} /></Pressable></View> : null}
    {attachment?.type.startsWith("audio/") ? <AudioPlayback url={attachment.uri} compact /> : null}
    {recording ? <VoiceRecorder onCancel={() => setRecording(false)} onReady={file => { setRecording(false); setAttachment(file); }} /> : <View style={styles.composer}><View style={styles.inputGroup}><TextInput editable={!blocked && !sending} accessibilityLabel="Message" value={draft} onChangeText={setDraft} placeholder="Message" placeholderTextColor={colors.textDim} style={styles.input} multiline maxLength={2000} /><Pressable accessibilityLabel="Attach file" disabled={blocked || sending || !!editing} onPress={() => Alert.alert("Add attachment", "Mobile uploads support files up to 4 MB.", [{ text: "Photo or video", onPress: () => void chooseImage() }, { text: "Document or voice file", onPress: () => void chooseDocument() }, { text: "Cancel", style: "cancel" }])}><Ionicons name="attach" size={25} color={colors.textMuted} /></Pressable>{!draft && !attachment ? <Pressable accessibilityLabel="Take photo" disabled={blocked || sending || !!editing} onPress={() => void chooseImage(true)}><Ionicons name="camera-outline" size={25} color={colors.textMuted} /></Pressable> : null}</View><Pressable accessibilityLabel={draft.trim() || attachment || editing ? "Send message" : "Record voice message"} disabled={sending || blocked} onPress={() => draft.trim() || attachment || editing ? void send() : setRecording(true)} style={[styles.send, (sending || blocked) && styles.sendDisabled]}>{sending ? <ActivityIndicator size="small" color={colors.background} /> : <Ionicons name={draft.trim() || attachment || editing ? "send" : "mic"} size={23} color={colors.background} />}</Pressable></View>}
    <ContactsSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} onOpenRoom={() => {}} inviteRoom={room} />
    <ContactsSheet allowGroups visible={newGroup} initialMode="group" onClose={() => setNewGroup(false)} onOpenRoom={() => { setNewGroup(false); onBack(); }} />
    <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}><Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}><ScrollView style={styles.menu} contentContainerStyle={{ paddingVertical: 8 }}>{[
      ["Create order", () => onNavigate("marketplace")],
      [room.room_type === "group" ? "Group information" : "View contact", () => Alert.alert(roomName(room), room.room_type === "group" ? `${details.members?.length || 0} members` : [details.other?.full_name, details.other?.username && `@${details.other.username}`].filter(Boolean).join("\n"))],
      ["Search", () => setSearchOpen(true)],
      [prefs?.pinned ? "Unpin chat" : "Pin chat", () => void perform(() => preference({ pinned: !prefs?.pinned }))],
      ["Add to list", () => { setListName(prefs?.list_name || ""); setListOpen(true); }],
      ["Media and documents", () => setView("media")],
      ["Links", () => { setView("chat"); setSearchOpen(true); setSearch("https://"); }],
      ["Starred messages", () => setView("starred")],
      [prefs?.muted ? "Unmute notifications" : "Mute notifications", () => void perform(() => preference({ muted: !prefs?.muted }))],
      [prefs?.archived ? "Unarchive chat" : "Archive chat", () => void perform(() => preference({ archived: !prefs?.archived }))],
      [room.room_type === "group" ? "Invite to group" : "New group", () => room.room_type === "group" ? setInviteOpen(true) : setNewGroup(true)],
      ["Clear chat for me", () => Alert.alert("Clear this chat?", "Earlier messages will be hidden on your account. Other participants keep their messages.", [{ text: "Cancel", style: "cancel" }, { text: "Clear chat", style: "destructive", onPress: () => void perform(async () => { await preference({ action: "clear" }); setMessages([]); setHasOlder(false); }) }])],
      ...(room.room_type !== "group" ? [[details.blocked_by_me ? "Unblock contact" : "Block contact", toggleBlock]] : []),
    ].map(([label, action]) => <Pressable key={String(label)} style={styles.menuItem} onPress={() => menuAction(action as () => void)}><Text style={styles.menuText}>{String(label)}</Text></Pressable>)}</ScrollView></Pressable></Modal>
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}><Pressable style={styles.bottomBackdrop} onPress={() => setSelected(null)}><View style={styles.actionSheet}>{selected && !selected.deleted_at ? <><View style={styles.reactions}>{["👍", "❤️", "😂", "😮", "😢", "🙏"].map(emoji => <Pressable key={emoji} style={styles.emoji} onPress={() => { const message = selected; setSelected(null); void perform(() => chatClient.toggleReaction(room.id, message.id, emoji)); }}><Text style={{ fontSize: 27 }}>{emoji}</Text></Pressable>)}</View>{[
      ["Reply", () => { setReply(selected); setEditing(null); }],
      [stars.includes(selected.id) ? "Unstar message" : "Star message", () => void perform(() => preference({ action: "star", messageId: selected.id, starred: !stars.includes(selected.id) }))],
      ...(selected.sender_id === session.user.id ? [["Edit message", () => { setEditing(selected); setDraft(selected.message || ""); setAttachment(null); setReply(null); }], ["Delete for everyone", () => Alert.alert("Delete message?", "The message will be removed for every participant.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void perform(() => chatClient.deleteMessage(room.id, selected.id)) }])]] : [["Report message", () => Alert.alert("Report message", "Choose a reason for the moderation team.", ["spam", "harassment", "scam"].map(reason => ({ text: reason, onPress: () => void perform(async () => { await chatClient.reportMessage(selected.id, reason); Alert.alert("Report submitted", "Your report was sent to the moderation team."); }) })).concat([{ text: "Cancel", onPress: () => {} }]))]]),
    ].map(([label, action]) => <Pressable key={String(label)} style={styles.menuItem} onPress={() => { (action as () => void)(); setSelected(null); }}><Text style={styles.menuText}>{String(label)}</Text></Pressable>)}</> : <Text style={styles.menuText}>This message was deleted.</Text>}</View></Pressable></Modal>
    <Modal visible={listOpen} transparent onRequestClose={() => setListOpen(false)}><View style={styles.bottomBackdrop}><View style={styles.actionSheet}><Text style={styles.title}>Chat list</Text><TextInput accessibilityLabel="Chat list name" value={listName} onChangeText={setListName} maxLength={40} placeholder="Friends, work, customers…" placeholderTextColor={colors.textDim} style={styles.searchInput} /><Text style={styles.subtitle}>Leave empty to remove this chat from its list.</Text><Pressable style={styles.menuItem} onPress={() => { setListOpen(false); void perform(() => preference({ listName })); }}><Text style={styles.action}>Save</Text></Pressable><Pressable style={styles.menuItem} onPress={() => setListOpen(false)}><Text style={styles.menuText}>Cancel</Text></Pressable></View></View></Modal>
  </KeyboardAvoidingView>;
}

function MessageText({ value }: { value: string }) { return <Text style={styles.messageText}>{value.split(/(https?:\/\/[^\s]+)/g).map((part, index) => /^https?:\/\//.test(part) ? <Text key={index} style={{ color: colors.blue, textDecorationLine: "underline" }} onPress={() => Alert.alert("Open link?", part, [{ text: "Cancel", style: "cancel" }, { text: "Open", onPress: () => void Linking.openURL(part).catch(() => Alert.alert("Link unavailable")) }])}>{part}</Text> : part)}</Text>; }

const styles = StyleSheet.create({
  searchRow:{flexDirection:"row",alignItems:"center",gap:12,paddingHorizontal:16,paddingVertical:8,backgroundColor:colors.panel},searchInput:{flex:1,minHeight:50,color:colors.text,fontSize:16},action:{color:colors.yellow,fontSize:14,fontWeight:"700"},older:{alignItems:"center",padding:18},quote:{borderLeftWidth:3,borderLeftColor:colors.yellow,backgroundColor:"rgba(0,0,0,.2)",padding:9,borderRadius:7,marginBottom:8},receipt:{flexDirection:"row",justifyContent:"flex-end",alignItems:"center",gap:5,marginTop:4},reactions:{flexDirection:"row",flexWrap:"wrap",gap:5,marginTop:6},reaction:{borderWidth:1,borderColor:colors.border,borderRadius:14,paddingHorizontal:7,paddingVertical:3},draftPreview:{flexDirection:"row",alignItems:"center",gap:12,padding:12,backgroundColor:colors.panel},inputGroup:{flex:1,flexDirection:"row",alignItems:"center",gap:10,paddingRight:14,borderRadius:25,backgroundColor:colors.panel},backdrop:{flex:1,backgroundColor:"rgba(0,0,0,.45)",alignItems:"flex-end",paddingTop:70,paddingBottom:30,paddingHorizontal:12},menu:{backgroundColor:colors.panel,borderRadius:18,maxHeight:"95%",width:275,borderWidth:1,borderColor:colors.border},menuItem:{paddingHorizontal:22,paddingVertical:17},menuText:{color:colors.text,fontSize:16},bottomBackdrop:{flex:1,justifyContent:"flex-end",backgroundColor:"rgba(0,0,0,.6)"},actionSheet:{padding:16,paddingBottom:35,borderTopLeftRadius:25,borderTopRightRadius:25,backgroundColor:colors.panel},emoji:{padding:7},
  root: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: "#070b12" },
  back: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 13, borderWidth: 1, borderColor: colors.borderStrong },
  backText: { color: colors.text, fontSize: 31, lineHeight: 32, fontWeight: "300" },
  headerCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 17, fontWeight: "700" },
  subtitle: { marginTop: 3, color: colors.textMuted, fontSize: 12 },
  online: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.green },
  safety: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, padding: 11, borderRadius: radius.medium, borderWidth: 1, borderColor: "rgba(255,208,0,.24)", backgroundColor: colors.yellowSoft },
  safetyIcon: { color: colors.yellow, fontSize: 12 },
  safetyText: { flex: 1, color: "#e7dba1", fontSize: 11, lineHeight: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 10, color: colors.textMuted, fontSize: 10 },
  messages: { flexGrow: 1, paddingHorizontal: 14, paddingVertical: 16 },
  empty: { alignItems: "center", padding: 30, transform: [{ scaleY: -1 }] },
  emptyIcon: { color: colors.yellow, fontSize: 35 },
  emptyTitle: { marginTop: 12, color: colors.text, fontSize: 19, fontWeight: "900" },
  emptyText: { marginTop: 7, color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: "center" },
  messageRow: { alignItems: "flex-start", marginBottom: 9 },
  messageRowOwn: { alignItems: "flex-end" },
  bubble: { maxWidth: "82%", paddingHorizontal: 13, paddingVertical: 10, borderRadius: 17, borderWidth: 1 },
  bubbleOther: { borderColor: "rgba(39,183,255,.22)", borderBottomLeftRadius: 5, backgroundColor: "#102235" },
  bubbleOwn: { borderColor: "rgba(255,208,0,.3)", borderBottomRightRadius: 5, backgroundColor: "#2b2405" },
  sender: { marginBottom: 4, color: colors.blue, fontSize: 12, fontWeight: "700" },
  senderOwn: { color: colors.yellow },
  messageText: { color: colors.text, fontSize: 16, lineHeight: 23 },
  messageTime: { alignSelf: "flex-end", marginTop: 5, color: colors.textDim, fontSize: 10 },
  error: { marginHorizontal: 14, marginBottom: 6, color: colors.red, fontSize: 12, textAlign: "center" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "#070b12" },
  input: { flex: 1, minHeight: 46, maxHeight: 112, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 11, borderRadius: 18, borderWidth: 1, borderColor: colors.borderStrong, color: colors.text, fontSize: 16, backgroundColor: colors.panel },
  send: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.yellow },
  sendDisabled: { opacity: .36 },
  sendText: { color: colors.background, fontSize: 19, fontWeight: "900" },
});
