import { useEffect, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { request } from "../api";
import { Avatar, PrimaryButton, StateBlock } from "../components";
import { loadStatuses, type StatusPost } from "../messagingApi";
import { colors } from "../theme";

export function StatusScreen({ userId, cameraRequest = 0 }: { userId: string; cameraRequest?: number }) {
  const [statuses, setStatuses] = useState<StatusPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [compose, setCompose] = useState(false);
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState("");
  const [background, setBackground] = useState("#183e38");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<StatusPost | null>(null);
  const reload = async () => { try { const r = await loadStatuses(); setStatuses(r.statuses); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Could not load statuses."); } finally { setLoading(false); } };
  useEffect(() => { void reload(); const timer = setInterval(() => void reload(), 30000); return () => clearInterval(timer); }, [userId]);
  const choosePhoto = async (camera: boolean) => {
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error("Allow camera access to take a status photo.");
      const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: .8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: .8 });
      if (result.canceled || !result.assets[0]) return;
      const image = await manipulateAsync(result.assets[0].uri, [{ resize: { width: 900 } }], { compress: .65, format: SaveFormat.JPEG });
      setPhoto(image.uri); setCompose(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not select photo."); }
  };
  useEffect(() => { if (cameraRequest) void choosePhoto(true); }, [cameraRequest]);
  useEffect(() => { if (!viewing) return; const timer = setTimeout(() => setViewing(null), Math.max(0, Date.parse(viewing.expires_at) - Date.now())); return () => clearTimeout(timer); }, [viewing?.id]);
  const post = async () => {
    if (busy) return; setBusy(true); setError("");
    try {
      const form = new FormData(); form.append("body", body); form.append("background", background);
      if (photo) form.append("file", { uri: photo, name: "status.jpg", type: "image/jpeg" } as unknown as Blob);
      await request("/api/messages/status", { method: "POST", body: form }, true);
      setCompose(false); setBody(""); setPhoto(""); await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not post status."); } finally { setBusy(false); }
  };
  const view = (status: StatusPost) => {
    setViewing(status);
    void request("/api/messages/status", { method: "POST", body: JSON.stringify({ id: status.id, action: "view" }) }, true).then(() => setStatuses(rows => rows.map(s => s.id === status.id ? { ...s, seen: true } : s))).catch(e => setError(e.message));
  };
  return <View style={s.root}><ScrollView contentContainerStyle={s.page}><View style={s.titleRow}><Text style={s.heading}>Status</Text><Pressable onPress={() => void reload()}><Text style={s.link}>Refresh</Text></Pressable></View><Text style={s.note}>Share moments with your contacts. Status disappears after 24 hours.</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tiles}><Pressable style={[s.tile, s.add]} onPress={() => setCompose(true)}><Text style={s.plus}>＋</Text><Text style={s.tileName}>My status</Text><Text style={s.addNote}>Add an update</Text></Pressable>{statuses.map(status => <Pressable key={status.id} onPress={() => view(status)} style={[s.tile, { backgroundColor: status.background }]}>{status.hasImage ? <StatusImage status={status} /> : <Text numberOfLines={5} style={s.tileBody}>{status.body}</Text>}<View style={s.avatar}><Avatar uri={status.author?.avatar_url} name={status.author?.username || "Contact"} size={42} accent={status.seen ? "blue" : "yellow"} /></View><View style={s.tileCaption}><Text numberOfLines={1} style={s.tileName}>{status.author_id === userId ? "My status" : status.author?.username || "Contact"}</Text></View></Pressable>)}</ScrollView>{loading ? <StateBlock loading title="Loading status" /> : !statuses.length ? <StateBlock title="No status updates yet" message="Your contacts' new statuses will appear here." /> : null}<View style={s.actions}><PrimaryButton label="Write a status" tone="neutral" onPress={() => setCompose(true)} /><PrimaryButton label="Take a photo" tone="neutral" onPress={() => void choosePhoto(true)} /></View>{error ? <Text style={s.error}>{error}</Text> : null}<Text style={s.note}>Manage your status audience in Profile → Settings. Blocked contacts cannot view your status.</Text></ScrollView>
    <Modal visible={compose} animationType="slide" onRequestClose={() => setCompose(false)}><View style={s.root}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"><View style={s.titleRow}><Text style={s.heading}>New status</Text><Pressable onPress={() => setCompose(false)}><Text style={s.link}>Close</Text></Pressable></View>{photo ? <Image source={{ uri: photo }} style={s.preview} resizeMode="contain" /> : null}<TextInput accessibilityLabel="Status text" multiline value={body} onChangeText={setBody} maxLength={700} style={[s.composer, { backgroundColor: background }]} placeholder="What's happening?" placeholderTextColor="#d1e2dc" /><View style={s.palette}>{["#183e38", "#4b2656", "#123e65", "#745124", "#31363d"].map(color => <Pressable key={color} accessibilityLabel={`Choose ${color}`} onPress={() => setBackground(color)} style={[s.swatch, { backgroundColor: color, borderColor: color === background ? colors.yellow : colors.border }]} />)}</View><View style={s.titleRow}><Pressable onPress={() => void choosePhoto(false)}><Text style={s.link}>Choose photo</Text></Pressable>{photo ? <Pressable onPress={() => setPhoto("")}><Text style={s.link}>Remove photo</Text></Pressable> : null}</View>{error ? <Text style={s.error}>{error}</Text> : null}<PrimaryButton label="Post status" disabled={busy || (!body.trim() && !photo)} loading={busy} onPress={() => void post()} /><Text style={s.note}>Visible to your eligible contacts for 24 hours.</Text></ScrollView></View></Modal>
    <Modal visible={!!viewing} animationType="fade" onRequestClose={() => setViewing(null)}>{viewing ? <View style={[s.viewer, { backgroundColor: viewing.background }]}><View style={s.viewerHeader}><Avatar uri={viewing.author?.avatar_url} name={viewing.author?.username || "Contact"} size={42} /><View style={{ flex: 1 }}><Text style={s.tileName}>{viewing.author?.username || "Contact"}</Text><Text style={s.addNote}>{new Date(viewing.created_at).toLocaleString()}</Text></View><Pressable onPress={() => setViewing(null)}><Text style={s.plus}>×</Text></Pressable></View><View style={s.viewerContent}>{viewing.hasImage ? <StatusImage status={viewing} contain /> : null}<Text style={s.viewerText}>{viewing.body}</Text></View>{viewing.author_id === userId ? <View style={s.viewerFooter}><Text style={s.tileName}>{viewing.viewCount || 0} views</Text><Pressable onPress={() => Alert.alert("Delete your status?", "It will be removed for your contacts.", [{ text: "Keep", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void request("/api/messages/status", { method: "DELETE", body: JSON.stringify({ id: viewing.id }) }, true).then(() => { setViewing(null); return reload(); }).catch(e => setError(e.message)) }])}><Text style={s.tileName}>Delete</Text></Pressable></View> : null}</View> : null}</Modal>
  </View>;
}
function StatusImage({ status, contain = false }: { status: StatusPost; contain?: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let current = true; void request<{ url: string }>("/api/messages/status", { method: "POST", body: JSON.stringify({ id: status.id, action: "image" }) }, true).then(r => { if (current) setUrl(r.url); }).catch(() => undefined); return () => { current = false; }; }, [status.id]);
  return url ? <Image source={{ uri: url }} style={contain ? { width: "100%", height: "70%" } : StyleSheet.absoluteFill} resizeMode={contain ? "contain" : "cover"} /> : <View style={StyleSheet.absoluteFill} />;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background }, page: { padding: 18, paddingBottom: 40, gap: 18 }, titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 }, heading: { fontSize: 25, fontWeight: "700", color: colors.text }, note: { fontSize: 14, color: colors.textMuted, lineHeight: 21 }, link: { color: colors.yellow, fontSize: 15, paddingVertical: 9 }, tiles: { gap: 12, paddingVertical: 8 }, tile: { width: 145, height: 220, borderRadius: 24, overflow: "hidden", padding: 14, justifyContent: "center" }, add: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderStrong, gap: 12 }, plus: { fontSize: 34, color: colors.text }, tileName: { color: "#fff", fontSize: 16, fontWeight: "700" }, addNote: { color: "#d1dfdd", fontSize: 12 }, tileBody: { color: "#fff", fontSize: 16, paddingTop: 30 }, avatar: { position: "absolute", left: 12, top: 12 }, tileCaption: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#0007", padding: 13 }, actions: { gap: 12 }, error: { color: colors.red, padding: 12 }, preview: { height: 200, width: "100%", borderRadius: 18 }, composer: { minHeight: 210, borderRadius: 20, color: "#fff", fontSize: 24, padding: 22, textAlignVertical: "top" }, palette: { flexDirection: "row", gap: 12 }, swatch: { width: 40, height: 40, borderRadius: 22, borderWidth: 3 }, viewer: { flex: 1, paddingTop: 40, paddingBottom: 30 }, viewerHeader: { flexDirection: "row", gap: 13, padding: 20, alignItems: "center" }, viewerContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }, viewerText: { color: "#fff", fontSize: 24, textAlign: "center", lineHeight: 34 }, viewerFooter: { flexDirection: "row", justifyContent: "space-between", padding: 22 } });
