import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { profileName, type ChatRoom, type PublicProfile } from "@comeplayers/chat-core";
import { Avatar, PrimaryButton, StateBlock } from "../components";
import { chatClient } from "../runtime";
import { colors } from "../theme";

export function ContactsSheet({ visible, onClose, onOpenRoom, inviteRoom, initialMode = "chat", allowGroups = false }: { visible: boolean; onClose: () => void; onOpenRoom: (room: ChatRoom) => void; inviteRoom?: ChatRoom | null; initialMode?: "chat" | "group" | "blocked"; allowGroups?: boolean }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"chat" | "group" | "blocked">("chat");
  const [selected, setSelected] = useState<PublicProfile[]>([]);
  const [title, setTitle] = useState("");
  useEffect(() => { if (visible) { setQuery(""); setMode(initialMode === "group" && !allowGroups ? "chat" : initialMode); setNotice(""); setSelected([]); setTitle(""); } }, [visible, initialMode, allowGroups]);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      const request = mode === "blocked" ? chatClient.listBlocked() : chatClient.searchContacts(query);
      void request.then(data => { if (active) setUsers(data); }).catch(e => { if (active) { setUsers([]); setNotice(e.message); } }).finally(() => { if (active) setLoading(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [visible, query, mode]);
  const choose = async (user: PublicProfile) => {
    if (busy) return;
    if (mode === "group") { setSelected(rows => rows.some(p => p.id === user.id) ? rows.filter(p => p.id !== user.id) : [...rows, user]); return; }
    setBusy(user.id); setNotice("");
    try {
      if (mode === "blocked") { await chatClient.blockContact(user.id, false); setUsers(rows => rows.filter(p => p.id !== user.id)); setNotice("Contact unblocked."); }
      else if (inviteRoom) { await chatClient.inviteMember(inviteRoom.id, user.id); setNotice(`Invitation sent to ${profileName(user)}.`); }
      else { const room = await chatClient.openContact(user.id); onClose(); onOpenRoom(room); }
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not open contact."); }
    finally { setBusy(""); }
  };
  const createGroup = async () => {
    if (busy || title.trim().length < 3) return;
    setBusy("group"); setNotice("");
    try { const data = await chatClient.createGroup({ title: title.trim(), memberIds: selected.map(p => p.id) }); onClose(); onOpenRoom(data.room); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not create group."); }
    finally { setBusy(""); }
  };
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent><View style={styles.backdrop}><View style={styles.sheet}>
    <View style={styles.header}><Pressable onPress={onClose} accessibilityLabel="Close contacts" style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><View><Text style={styles.heading}>{inviteRoom ? "Invite to group" : mode === "group" ? "New group" : mode === "blocked" ? "Blocked contacts" : "New chat"}</Text><Text style={styles.hint}>{inviteRoom?.title || "Connect with any ComePlayers user"}</Text></View></View>
    {!inviteRoom ? <View style={styles.modes}>{([['chat','Contacts'],['group','Community group'],['blocked','Blocked']] as const).filter(([id]) => id !== "group" || allowGroups).map(([id,label]) => <Pressable key={id} onPress={() => { setMode(id); setNotice(""); }} style={[styles.chip, mode===id && styles.active]}><Text style={styles.chipText}>{label}</Text></Pressable>)}</View> : null}
    {mode === "group" ? <><TextInput accessibilityLabel="Group name" value={title} onChangeText={setTitle} maxLength={80} placeholder="Group name" placeholderTextColor={colors.textDim} style={styles.input} /><Text style={styles.label}>{selected.length} selected{selected.length ? ` · ${selected.map(profileName).join(", ")}` : ""}</Text></> : null}
    {mode !== "blocked" ? <TextInput accessibilityLabel="Search contacts" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} placeholder="Username or phone number" placeholderTextColor={colors.textDim} style={styles.input} /> : null}
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.label}>{mode === "blocked" ? "BLOCKED CONTACTS" : query ? "SEARCH RESULTS" : "RECENT CONTACTS"}</Text>
      {loading ? <ActivityIndicator color={colors.yellow} style={{ margin: 25 }} /> : users.length ? users.map(user => <Pressable key={user.id} style={styles.row} onPress={() => void choose(user)} disabled={!!busy}><Avatar uri={user.avatar_url} name={profileName(user)} size={48} /><View style={styles.copy}><Text style={styles.name}>{profileName(user)}</Text><Text style={styles.hint}>@{user.username || "player"}</Text></View><Text style={styles.action}>{busy === user.id ? "…" : mode === "blocked" ? "Unblock" : mode === "group" ? selected.some(p=>p.id===user.id) ? "✓" : "+" : inviteRoom ? "Invite" : "Chat"}</Text></Pressable>) : <StateBlock title={query ? "No users found" : mode === "blocked" ? "No blocked contacts" : "Start a new conversation"} message={mode === "blocked" ? undefined : "Search a username or a complete verified phone number. Use +country code for international numbers."} />}
    </ScrollView>
    {mode === "group" ? <View style={{ padding: 16 }}><PrimaryButton label="Create group" onPress={() => void createGroup()} disabled={title.trim().length < 3 || !!busy} loading={busy === "group"} /></View> : null}
  </View></View></Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.65)", justifyContent: "flex-end" }, sheet: { height: "93%", backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" },
  header: { padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }, back: { padding: 8 }, backText: { color: colors.text, fontSize: 32 }, heading: { color: colors.text, fontSize: 22, fontWeight: "800" }, hint: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  modes: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 10 }, chip: { padding: 11, borderRadius: 22, backgroundColor: colors.panel }, active: { backgroundColor: colors.yellowSoft }, chipText: { color: colors.text, fontSize: 13 },
  input: { marginHorizontal: 16, marginBottom: 12, minHeight: 48, borderRadius: 24, paddingHorizontal: 18, color: colors.text, backgroundColor: colors.panel, fontSize: 15 }, label: { margin: 16, color: colors.textDim, fontSize: 11, fontWeight: "700" },
  notice: { color: colors.yellow, paddingHorizontal: 20, paddingVertical: 8, fontSize: 13 }, row: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 }, copy: { flex: 1 }, name: { color: colors.text, fontSize: 16, fontWeight: "600" }, action: { color: colors.yellow, fontSize: 14, fontWeight: "700", minWidth: 40, textAlign: "right" },
});
