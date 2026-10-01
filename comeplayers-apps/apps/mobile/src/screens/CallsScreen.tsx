import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ChatRoom } from "@comeplayers/chat-core";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Avatar, PrimaryButton, StateBlock } from "../components";
import { useCalls } from "../CallProvider";
import { loadCalls, createCall, changeCall, type CallRecord } from "../messagingApi";
import { callActivityAt, callActivityPreview, sortCallsByActivity } from "../callActivity";
import { chatClient } from "../runtime";
import { colors } from "../theme";
import { ContactsSheet } from "./ContactsSheet";

export function CallsScreen({ userId }: { userId: string }) {
  const { startCall } = useCalls();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [choose, setChoose] = useState(false);
  const [keypad, setKeypad] = useState(false);
  const [phone, setPhone] = useState("");
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleRoom, setScheduleRoom] = useState<ChatRoom | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = generation.current;
    try {
      const result = await loadCalls();
      if (current === generation.current) { setCalls(result.calls); setError(""); }
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : "Could not load calls.");
    } finally { if (current === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    generation.current++;
    setCalls([]); setLoading(true);
    void reload();
    const timer = setInterval(() => void reload(), 10000);
    return () => { generation.current++; clearInterval(timer); };
  }, [userId, reload]);
  const open = async (room: ChatRoom) => {
    setChoose(false);
    if (scheduleMode) { setScheduleRoom(room); return; }
    try { await startCall(room.id, "audio"); } catch (e) { setError(e instanceof Error ? e.message : "Call unavailable."); }
  };
  const dial = async () => {
    setBusy(true); setError("");
    try { const room = await chatClient.openContact(phone); await startCall(room.id, "audio"); setKeypad(false); setPhone(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Contact not found."); } finally { setBusy(false); }
  };
  const scheduled = calls.filter(c => c.status === "scheduled");
  const visible = sortCallsByActivity(calls.filter(c => c.status !== "scheduled" && `${c.other?.username || ""} ${c.other?.full_name || ""}`.toLowerCase().includes(search.toLowerCase())));
  return <View style={s.root}><View style={s.shortcuts}>{[["call-outline", "Call", () => { setScheduleMode(false); setChoose(true); }], ["calendar-outline", "Schedule", () => { setScheduleMode(true); setChoose(true); }], ["keypad-outline", "Keypad", () => setKeypad(true)]].map(([icon, label, action]) => <Pressable key={String(label)} style={s.shortcut} onPress={action as () => void}><View style={s.circle}><Ionicons name={icon as "call-outline" | "calendar-outline" | "keypad-outline"} size={28} color={colors.text} /></View><Text style={s.label}>{String(label)}</Text></Pressable>)}</View><TextInput accessibilityLabel="Search call history" style={s.search} placeholder="Search calls" placeholderTextColor={colors.textDim} value={search} onChangeText={setSearch} />
    {error ? <Text style={s.error}>{error}</Text> : null}<FlatList data={visible} keyExtractor={c => c.id} refreshing={loading} onRefresh={() => void reload()} contentContainerStyle={{ paddingBottom: 80 }} ListHeaderComponent={<>{scheduled.length ? <Text style={s.heading}>Scheduled</Text> : null}{scheduled.map(c => <View key={c.id} style={s.row}><View style={{ flex: 1 }}><Text style={s.name}>{c.other?.username || "Contact"}</Text><Text style={s.detail}>{new Date(c.scheduled_at!).toLocaleString()}</Text></View>{c.caller_id === userId ? <Pressable onPress={() => void startCall(c.room_id, c.media).then(() => changeCall(c.id, "end")).then(reload).catch(e => setError(e.message))}><Text style={s.action}>Start</Text></Pressable> : null}<Pressable onPress={() => Alert.alert("Cancel scheduled call?", "This removes the scheduled call for both participants.", [{ text: "Keep", style: "cancel" }, { text: "Cancel call", onPress: () => void changeCall(c.id, "end").then(reload).catch(e => setError(e.message)) }])}><Text style={s.action}>×</Text></Pressable></View>)}<Text style={s.heading}>Recent</Text></>} ListEmptyComponent={<StateBlock loading={loading} title="No calls yet" message="Choose a contact to start a voice or video call." />} renderItem={({ item: c }) => <Pressable style={s.row} onPress={() => Alert.alert(c.other?.username || "Call contact", `${new Date(c.created_at).toLocaleString()} · ${c.status}`, [{ text: "Close", style: "cancel" }, { text: "Voice call", onPress: () => void startCall(c.room_id, "audio").catch(e => setError(e.message)) }, { text: "Video call", onPress: () => void startCall(c.room_id, "video").catch(e => setError(e.message)) }])}><Avatar size={54} uri={c.other?.avatar_url} name={c.other?.username || "Contact"} /><View style={{ flex: 1 }}><Text style={[s.name, c.status === "missed" && c.callee_id === userId && { color: colors.red }]}>{c.other?.username || c.other?.full_name || "Contact"}</Text><Text style={s.detail}>{c.caller_id === userId ? "↗" : "↙"} {callActivityPreview(c, userId)} · {new Date(callActivityAt(c)).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}{c.answered_at && c.ended_at ? ` · ${Math.max(0, Math.round((Date.parse(c.ended_at) - Date.parse(c.answered_at)) / 1000))}s` : ""}</Text></View><Ionicons name={c.media === "video" ? "videocam-outline" : "call-outline"} size={25} color={colors.text} /></Pressable>} />
    <ContactsSheet visible={choose} onClose={() => setChoose(false)} onOpenRoom={room => void open(room)} />
    <Modal visible={keypad || !!scheduleRoom} transparent animationType="slide" onRequestClose={() => { setKeypad(false); setScheduleRoom(null); }}><View style={s.scrim}><View style={s.sheet}><Text style={s.heading}>{keypad ? "Call by phone number" : "Schedule a call"}</Text><Text style={s.detail}>{keypad ? "Enter a full phone number. Your Account country is used for local formats." : "Enter the date and time in your device's local timezone."}</Text><TextInput autoCapitalize="none" keyboardType={keypad ? "phone-pad" : "default"} style={s.search} value={keypad ? phone : scheduleDate} onChangeText={keypad ? setPhone : setScheduleDate} placeholder={keypad ? "08… or +country code…" : "2026-09-10 14:30"} placeholderTextColor={colors.textDim} />{error ? <Text style={s.error}>{error}</Text> : null}<PrimaryButton loading={busy} label={keypad ? "Call" : "Save schedule"} onPress={() => { if (keypad) { void dial(); return; } const date = new Date(scheduleDate.replace(" ", "T")); if (!Number.isFinite(date.getTime())) { setError("Enter a valid date and time."); return; } setBusy(true); void createCall(scheduleRoom!.id, "audio", date.toISOString()).then(() => { setScheduleRoom(null); setScheduleDate(""); return reload(); }).catch(e => setError(e.message)).finally(() => setBusy(false)); }} /><Pressable onPress={() => { setKeypad(false); setScheduleRoom(null); }}><Text style={s.close}>Close</Text></Pressable></View></View></Modal>
  </View>;
}
const s = StyleSheet.create({ root: { flex: 1 }, shortcuts: { flexDirection: "row", gap: 28, padding: 18 }, shortcut: { alignItems: "center", gap: 9 }, circle: { width: 62, height: 62, borderRadius: 32, backgroundColor: colors.panel, alignItems: "center", justifyContent: "center" }, icon: { color: colors.text, fontSize: 28 }, label: { fontSize: 13, color: colors.textMuted }, search: { margin: 16, padding: 14, minHeight: 50, backgroundColor: colors.panel, borderRadius: 25, color: colors.text, fontSize: 16 }, heading: { fontSize: 22, color: colors.text, fontWeight: "700", paddingHorizontal: 18, marginVertical: 15 }, row: { paddingHorizontal: 18, paddingVertical: 15, flexDirection: "row", alignItems: "center", gap: 14 }, name: { color: colors.text, fontSize: 17, fontWeight: "600" }, detail: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 5 }, action: { color: colors.yellow, padding: 10, fontSize: 17 }, error: { color: colors.red, padding: 14 }, scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "#0009" }, sheet: { padding: 20, paddingBottom: 40, backgroundColor: colors.background, borderTopLeftRadius: 26, borderTopRightRadius: 26, gap: 12 }, close: { color: colors.textMuted, textAlign: "center", padding: 15 } });
