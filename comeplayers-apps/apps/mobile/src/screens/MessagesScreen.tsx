import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Session } from "@supabase/supabase-js";
import { filterRooms, isGroupRoom, profileName, roomName, roomPreview, roomUnreadCount, type ChatRoom, type PublicProfile, type PartyInvitation } from "@comeplayers/chat-core";
import { Avatar, StateBlock } from "../components";
import { chatClient } from "../runtime";
import { colors } from "../theme";
import type { AppTab } from "../types";
import { ContactsSheet } from "./ContactsSheet";
import { CallsScreen } from "./CallsScreen";
import { StatusScreen } from "./StatusScreen";
import { MessageToolsScreen } from "./MessageToolsScreen";
import { type AccountPreferences } from "../messagingApi";
import { useInbox } from "../InboxProvider";
import { ChatProblemNotice } from "./ChatProblemNotice";

export function MessagesScreen({ session, account, onOpenRoom, onNavigate, onUnreadChange }: { session: Session | null; account?: AccountPreferences | null; onOpenRoom: (room: ChatRoom) => void; onNavigate: (tab: AppTab) => void; onUnreadChange: (count: number) => void }) {
  const { rooms, preferences, loading, error: inboxError, reload } = useInbox();
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<"chat" | "calls" | "status" | "tools">("chat");
  const [archived, setArchived] = useState(false);
  const [selectedList, setSelectedList] = useState("");
  const [menu, setMenu] = useState(false);
  const [composeMode, setComposeMode] = useState<"chat" | "group" | "blocked">("chat");
  const [cameraRequest, setCameraRequest] = useState(0);
  const [contacts, setContacts] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [compose, setCompose] = useState(false);
  const [busy, setBusy] = useState("");
  const [invitations, setInvitations] = useState<PartyInvitation[]>([]);


  const userId = session?.user.id;
  const phoneBlocked = !!account?.phoneRequired && !account.phoneVerified;
  useEffect(() => { setError(inboxError); }, [inboxError]);
  useEffect(() => {
    setInvitations([]);
    let active = true;
    const refreshInvites = () => { if (userId && !phoneBlocked) void chatClient.listInvitations().then(data => { if (active) setInvitations(data.received); }).catch(() => undefined); };
    refreshInvites();
    const timer = setInterval(() => { if (AppState.currentState === "active") refreshInvites(); }, 60000);
    return () => { active = false; clearInterval(timer); };
  }, [reload, userId, phoneBlocked]);
  useEffect(() => {
    let active = true;
    setContacts([]);
    if (!userId || phoneBlocked || section !== "chat" || query.trim().length < 2) { setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      void chatClient.searchContacts(query).then(data => { if (active) setContacts(data); })
        .catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setSearching(false); });
    }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [query, userId, phoneBlocked, section]);
  const prefsByRoom = useMemo(() => new Map(preferences.map(p => [p.room_id, p])), [preferences]);
  const visible = useMemo(() => filterRooms(rooms, { query }).filter(r => !!prefsByRoom.get(r.id)?.archived === archived && (!selectedList || prefsByRoom.get(r.id)?.list_name === selectedList)).sort((a, b) => Number(!!prefsByRoom.get(b.id)?.pinned) - Number(!!prefsByRoom.get(a.id)?.pinned)), [rooms, archived, query, prefsByRoom, selectedList]);
  const composeWith = (mode: "chat" | "group" | "blocked") => { setMenu(false); setComposeMode(mode); setCompose(true); };
  const openContact = async (profile: PublicProfile) => {
    if (busy) return;
    setBusy(profile.id);
    try { onOpenRoom(await chatClient.openContact(profile.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Chat belum bisa dibuka."); }
    finally { setBusy(""); }
  };
  const answer = async (invite: PartyInvitation, action: "accept" | "decline") => {
    if (busy) return;
    setBusy(invite.id);
    try { await chatClient.respondToInvitation(invite.id, action); setInvitations(rows => rows.filter(r => r.id !== invite.id)); await reload(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Undangan belum bisa diperbarui."); }
    finally { setBusy(""); }
  };
  if (!session) return <StateBlock title="Mulai mengobrol" message="Masuk untuk mengobrol dengan teman dan keluarga." actionLabel="Masuk" onAction={() => onNavigate("profile")} />;
  if (phoneBlocked) return <StateBlock title="Lengkapi nomor telepon" message="Verifikasi nomor telepon di pengaturan akun untuk melanjutkan." actionLabel="Buka akun" onAction={() => onNavigate("profile")} />;
  return <View style={styles.root}>
    <View style={styles.header}><Text style={styles.title}>{section === "chat" ? (archived ? "Arsip chat" : selectedList || "Chat") : section === "calls" ? "Panggilan" : section === "status" ? "Status" : "Fitur"}</Text><Pressable accessibilityRole="button" accessibilityLabel="Buat status foto" style={styles.iconButton} hitSlop={12} onPress={() => { setSection("status"); setCameraRequest(v => v + 1); }}><Ionicons name="camera-outline" size={26} color={colors.text} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Pilihan chat" style={styles.iconButton} hitSlop={12} onPress={() => setMenu(true)}><Ionicons name="ellipsis-vertical" size={24} color={colors.text} /></Pressable></View>
    <View style={styles.tabs}>{([["chat", "Chat", "chatbubble-ellipses-outline"], ["calls", "Panggilan", "call-outline"], ["status", "Status", "ellipse-outline"], ["tools", "Fitur", "storefront-outline"]] as const).map(([id, label, icon]) => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: section === id }} onPress={() => setSection(id)} style={[styles.tab, section === id && styles.tabActive]}><Ionicons name={icon} size={23} color={section === id ? colors.yellow : colors.textMuted} /><Text style={[styles.tabLabel, section === id && styles.chipTextActive]}>{label}</Text></Pressable>)}</View>
    {section === "calls" ? <CallsScreen userId={session.user.id} /> : section === "status" ? <StatusScreen userId={session.user.id} cameraRequest={cameraRequest} /> : section === "tools" ? <MessageToolsScreen onNavigate={onNavigate} onNewGroup={() => composeWith("group")} onAccount={() => onNavigate("profile")} /> : <>
    <View style={styles.search}><Text style={styles.searchIcon}>⌕</Text><TextInput style={styles.input} accessibilityLabel="Cari chat atau teman" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} placeholder="Cari teman atau chat" placeholderTextColor={colors.textDim} />{query ? <Pressable accessibilityLabel="Hapus pencarian" onPress={() => setQuery("")} hitSlop={12}><Text style={styles.clear}>×</Text></Pressable> : null}</View>
    {error ? <ChatProblemNotice title="Daftar chat belum bisa diperbarui" error={error} onRetry={() => void reload()} /> : null}
    <FlatList data={visible} keyExtractor={r => r.id} refreshing={loading && !!rooms.length} onRefresh={() => void reload()} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}
      ListHeaderComponent={<>
        {invitations.map(invite => <View key={invite.id} style={styles.invitation}><View style={styles.copy}><Text style={styles.name}>{invite.room?.title || "Undangan grup"}</Text><Text style={styles.preview}>{profileName(invite.inviter)} mengundang Anda</Text></View><Pressable disabled={!!busy} onPress={() => void answer(invite,"accept")}><Text style={styles.action}>Gabung</Text></Pressable><Pressable accessibilityLabel="Tolak undangan" disabled={!!busy} onPress={() => void answer(invite,"decline")}><Text style={styles.clear}>×</Text></Pressable></View>)}
        {query.trim().length >= 2 ? <><Text style={styles.section}>TEMAN</Text>{searching ? <ActivityIndicator color={colors.yellow} /> : contacts.length ? contacts.map(p => <Pressable key={p.id} style={styles.row} onPress={() => void openContact(p)} disabled={!!busy}><Avatar uri={p.avatar_url} name={profileName(p)} size={52} /><View style={styles.copy}><Text style={styles.name}>{profileName(p)}</Text><Text style={styles.preview}>@{p.username}</Text></View><Text style={styles.action}>{busy === p.id ? "…" : "Chat"}</Text></Pressable>) : <Text style={styles.hint}>Teman belum ditemukan. Coba nama pengguna atau nomor telepon lengkap.</Text>}<Text style={styles.section}>CHAT</Text></> : null}
      </>}
      ListEmptyComponent={loading ? <StateBlock loading title="Memuat chat…" /> : <StateBlock title={archived ? "Arsip masih kosong" : query ? "Chat tidak ditemukan" : "Ayo mulai mengobrol"} message={query ? "Coba nama lain atau nomor telepon teman." : archived ? "Chat yang Anda arsipkan akan muncul di sini." : "Pilih teman, lalu kirim pesan pertama Anda."} actionLabel={!query && !archived ? "Chat baru" : undefined} onAction={!query && !archived ? () => composeWith("chat") : undefined} />}
      renderItem={({item:room}) => <Pressable onPress={() => onOpenRoom(room)} style={({pressed}) => [styles.row,pressed && {backgroundColor:colors.panel}]}><Avatar uri={isGroupRoom(room) ? room.server?.icon_url : room.other?.avatar_url} name={roomName(room)} size={56} accent={isGroupRoom(room) ? "yellow" : "blue"} /><View style={styles.copy}><View style={styles.nameLine}><Text style={[styles.name,!!roomUnreadCount(room) && styles.unread]} numberOfLines={1}>{roomName(room)}</Text><Text style={[styles.time,!!roomUnreadCount(room) && styles.activeTime]}>{chatTime(room.last_message_at || room.created_at)}</Text></View><View style={styles.previewLine}><Text numberOfLines={1} style={styles.preview}>{isGroupRoom(room) ? "◉ " : room.order_id ? "Pesanan · " : ""}{prefsByRoom.get(room.id)?.pinned ? "⌖ " : ""}{prefsByRoom.get(room.id)?.muted ? "Dibisukan · " : ""}{prefsByRoom.get(room.id)?.cleared_before && (!room.last_message_at || room.last_message_at <= prefsByRoom.get(room.id)!.cleared_before!) ? "Chat dikosongkan" : room.last_message ? roomPreview(room) : isGroupRoom(room) ? "Chat komunitas" : "Belum ada pesan"}</Text>{roomUnreadCount(room) ? <View style={styles.badge}><Text style={styles.badgeText}>{roomUnreadCount(room) > 99 ? "99+" : roomUnreadCount(room)}</Text></View> : null}</View></View></Pressable>}
    />
    <Pressable style={styles.fab} accessibilityRole="button" accessibilityLabel="Chat baru" onPress={() => composeWith("chat")}><Ionicons name="chatbox-ellipses" size={24} color={colors.background} /><Text style={styles.fabLabel}>Chat baru</Text></Pressable>
    </>}
    <ContactsSheet visible={compose} initialMode={composeMode} onClose={() => setCompose(false)} onOpenRoom={onOpenRoom} />
    <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}><Pressable style={styles.backdrop} onPress={() => setMenu(false)}><View style={styles.menu}>{[["Komunitas", () => { setMenu(false); onNavigate("community"); }], ["Semua chat", () => { setSelectedList(""); setArchived(false); setSection("chat"); setMenu(false); }], ...Array.from(new Set(preferences.map(p => p.list_name).filter(Boolean))).map(name => [`Daftar · ${name}`, () => { setSelectedList(name); setArchived(false); setSection("chat"); setMenu(false); }]), [archived ? "Kembali ke chat" : "Arsip chat", () => { setSection("chat"); setArchived(v => !v); setMenu(false); }], ["Kontak diblokir", () => composeWith("blocked")], ["Pengaturan", () => { setMenu(false); onNavigate("profile"); }]].map(([label, action]) => <Pressable key={String(label)} style={styles.menuItem} onPress={action as () => void}><Text style={styles.menuText}>{String(label)}</Text></Pressable>)}</View></Pressable></Modal>
  </View>;
}
function chatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value); const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
  today.setDate(today.getDate()-1);
  return date.toDateString() === today.toDateString() ? "Kemarin" : date.toLocaleDateString([], {month:"short",day:"numeric"});
}
const styles = StyleSheet.create({
  header:{flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:16,paddingTop:18,paddingBottom:16},title:{flex:1,color:colors.text,fontSize:27,fontWeight:"800"},tabs:{flexDirection:"row",borderBottomWidth:1,borderBottomColor:colors.border,paddingHorizontal:10},tab:{flex:1,alignItems:"center",gap:6,paddingVertical:13,borderBottomWidth:3,borderBottomColor:"transparent"},tabActive:{borderBottomColor:colors.yellow},tabLabel:{fontSize:14,fontWeight:"600",color:colors.textMuted},backdrop:{flex:1,backgroundColor:"rgba(0,0,0,.5)",paddingTop:55,paddingHorizontal:14,alignItems:"flex-end"},menu:{backgroundColor:colors.panel,borderRadius:18,paddingVertical:8,minWidth:230,borderWidth:1,borderColor:colors.border},menuItem:{padding:18},menuText:{color:colors.text,fontSize:16},
  root:{flex:1,backgroundColor:colors.background},search:{flexDirection:"row",alignItems:"center",gap:10,marginHorizontal:16,marginTop:12,paddingHorizontal:16,borderRadius:26,backgroundColor:colors.panel},searchIcon:{color:colors.textMuted,fontSize:27},input:{flex:1,minHeight:52,color:colors.text,fontSize:17},clear:{fontSize:25,color:colors.textMuted},
  filters:{flexDirection:"row",gap:8,paddingHorizontal:16,paddingVertical:14},chip:{paddingHorizontal:18,paddingVertical:9,borderRadius:24,backgroundColor:colors.panel},chipActive:{backgroundColor:colors.yellowSoft},chipText:{fontSize:14,color:colors.textMuted},chipTextActive:{color:colors.yellow,fontWeight:"700"},
  list:{paddingBottom:100},row:{flexDirection:"row",alignItems:"center",gap:14,paddingHorizontal:18,paddingVertical:14},copy:{flex:1,minWidth:0},nameLine:{flexDirection:"row",alignItems:"center",gap:8},name:{flex:1,color:colors.text,fontSize:18,fontWeight:"600"},unread:{fontWeight:"800"},time:{color:colors.textMuted,fontSize:12},activeTime:{color:colors.yellow},previewLine:{flexDirection:"row",alignItems:"center",gap:8,marginTop:6},preview:{flex:1,color:colors.textMuted,fontSize:15,lineHeight:22},badge:{minWidth:22,height:22,borderRadius:12,paddingHorizontal:5,backgroundColor:colors.yellow,alignItems:"center",justifyContent:"center"},badgeText:{color:colors.background,fontSize:11,fontWeight:"800"},
  fab:{position:"absolute",right:16,bottom:20,minHeight:56,paddingHorizontal:20,borderRadius:28,backgroundColor:colors.yellow,flexDirection:"row",gap:10,alignItems:"center",justifyContent:"center",elevation:5},fabLabel:{color:colors.background,fontSize:16,fontWeight:"800"},iconButton:{minWidth:48,minHeight:48,alignItems:"center",justifyContent:"center"},fabText:{color:colors.background,fontSize:31},error:{color:colors.red,paddingHorizontal:20,paddingVertical:8,fontSize:12},section:{color:colors.textDim,fontSize:11,fontWeight:"700",letterSpacing:1.2,paddingHorizontal:20,marginVertical:12},hint:{color:colors.textMuted,fontSize:13,paddingHorizontal:20,paddingVertical:12},action:{color:colors.yellow,fontSize:14,fontWeight:"700"},invitation:{flexDirection:"row",gap:20,alignItems:"center",padding:18,backgroundColor:colors.panel,marginHorizontal:12,marginBottom:8,borderRadius:14},
});
