import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { PrimaryButton } from "../components";
import { colors } from "../theme";
import { activatePasskeySetup, activatePasswordSetup, type SecureSetup } from "./secureSetup";
import { setupFeedback } from "./setupFeedback";

type Props = { userId: string; setup: SecureSetup | null; error: string; onActivated: () => void; onRetry: () => void };

export function SecureDeviceSetup(props: Props) {
  const setupKey = props.setup?.kind === "new" ? props.setup.plan.session.device.id : props.setup?.kind === "recover" ? props.setup.snapshot.roster_hash : "loading";
  return <SetupContent key={setupKey} {...props} />;
}

function SetupContent({ userId, setup, error, onActivated, onRetry }: Props) {
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState<ReturnType<typeof setupFeedback> | null>(null);
  const [password, setPassword] = useState(""), [usePasskey, setUsePasskey] = useState(false);
  const [help, setHelp] = useState(false), [removeDeviceIds, setRemoveDeviceIds] = useState<string[]>([]);
  const running = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const devices = setup?.kind === "recover" ? setup.snapshot.roster.devices : [];
  const passwordRecovery = setup?.kind === "recover" && Boolean(setup.snapshot.encrypted_backup.password) && !usePasskey;
  const hasPasskey = setup?.kind === "recover" && Boolean(setup.snapshot.encrypted_backup.passkey);
  const available = setup?.kind === "recover" && (passwordRecovery || hasPasskey);
  const full = devices.length >= 8 && !removeDeviceIds.length;
  const notice = feedback || (error ? setupFeedback(new Error(error)) : null);
  const activate = async () => {
    if (!setup || running.current || !available || full) return;
    running.current = true; setBusy(true); setFeedback(null);
    try {
      if (passwordRecovery) await activatePasswordSetup(userId, setup, password, removeDeviceIds);
      else await activatePasskeySetup(userId, setup, removeDeviceIds);
      setPassword(""); onActivated();
    }
    catch (reason) { if (alive.current) setFeedback(setupFeedback(reason)); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  // Only this explicit action opens the system prompt. Cancel/back never loops it.
  return <ScrollView style={s.scroll} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <View style={s.content}>
      {!setup && !error ? <View style={s.loading}><ActivityIndicator color={colors.yellow} /><Text accessibilityLiveRegion="polite" style={s.copy}>Menyiapkan chat…</Text></View> : <>
        <View style={s.icon}><Ionicons name={setup?.kind === "recover" ? "chatbubbles-outline" : "chatbubble-ellipses-outline"} size={34} color={colors.yellow} /></View>
        <Text accessibilityRole="header" style={s.title}>{!setup ? "Chat belum terhubung" : setup.kind === "new" ? "Menyiapkan chat" : "Buka chat Anda"}</Text>
        <Text style={s.copy}>{!setup ? "Periksa koneksi internet, lalu coba lagi." : setup.kind === "new" ? "Chat akan disiapkan otomatis. Anda tidak perlu membuat passkey." : passwordRecovery ? "Masukkan sandi cadangan yang Anda buat di perangkat lama." : available ? "Pulihkan chat menggunakan kunci akses yang pernah Anda simpan." : "Buka ComePlayers di perangkat yang pernah Anda gunakan, lalu aktifkan pemulihan chat di Pengaturan akun."}</Text>
        {passwordRecovery ? <TextInput accessibilityLabel="Sandi cadangan chat" placeholder="Sandi cadangan" placeholderTextColor={colors.textMuted} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024} editable={!busy} value={password} onChangeText={setPassword} style={s.password} /> : null}
        {passwordRecovery && hasPasskey ? <Pressable accessibilityRole="button" style={s.helpButton} disabled={busy} onPress={() => { setUsePasskey(true); setPassword(""); }}><Text style={s.link}>Gunakan kunci akses yang tersimpan</Text></Pressable> : null}
        {devices.length >= 8 ? <View style={s.devices}><Text style={s.deviceTitle}>Pilih perangkat lama untuk diganti</Text><Text style={s.hint}>Akun ini sudah terhubung ke 8 perangkat. Perangkat yang dipilih akan kehilangan akses chat.</Text>{devices.map((device, index) => <Pressable key={device.id} style={s.device} disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: removeDeviceIds.includes(device.id), disabled: busy }} onPress={() => setRemoveDeviceIds(current => current.includes(device.id) ? current.filter(id => id !== device.id) : [...current, device.id])}><Ionicons name={removeDeviceIds.includes(device.id) ? "checkbox" : "square-outline"} size={23} color={colors.yellow} /><Text style={s.deviceText}>Perangkat {index + 1} · {new Date(device.createdAt).toLocaleDateString("id-ID")}</Text></Pressable>)}</View> : null}
        {notice ? <Text accessibilityLiveRegion="polite" accessibilityRole={notice.kind === "cancelled" ? "text" : "alert"} style={[s.notice, notice.kind !== "cancelled" && s.error]}>{notice.message}</Text> : null}
        {available && !notice?.refresh ? <PrimaryButton label={busy ? "Menyiapkan chat…" : notice ? "Coba lagi" : "Lanjutkan"} loading={busy} disabled={busy || full || Boolean(passwordRecovery && password.length < 12)} onPress={() => void activate()} /> : <PrimaryButton label="Coba lagi" disabled={busy} onPress={onRetry} />}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: help }} style={s.helpButton} onPress={() => setHelp(value => !value)}><Text style={s.link}>{help ? "Tutup penjelasan" : "Kenapa perlu ini?"}</Text><Ionicons name={help ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} /></Pressable>
        {help ? <View style={s.help}>
          <Text style={s.deviceTitle}>Chat tetap milik Anda</Text>
          <Text style={s.helpCopy}>Di perangkat baru, chat lama dibuka dengan sandi cadangan atau kunci akses yang sebelumnya Anda simpan. Login saja tidak dapat membuka pesan terenkripsi.</Text>
          <Text style={s.helpCopy}>Belum mengatur pemulihan? Buka Profil → Chat & cadangan di perangkat lama. Anda tetap bisa memakai fitur lain melalui tombol kembali.</Text>
          <Pressable accessibilityRole="link" style={s.support} onPress={() => { void Linking.openURL("https://www.comeplayers.com/support").catch(() => setFeedback({ kind: "error", message: "Hubungi admin@comeplayers.com untuk bantuan.", refresh: false })); }}><Text style={s.link}>Hubungi dukungan</Text></Pressable>
        </View> : null}
        <View style={s.privacy}><Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} /><Text style={s.privacyText}>Chat pribadi dilindungi enkripsi end-to-end</Text></View>
      </>}
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  page: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 32 },
  content: { width: "100%", maxWidth: 420, alignSelf: "center", gap: 16 },
  loading: { alignItems: "center", gap: 16 },
  icon: { alignSelf: "center", width: 76, height: 76, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.yellowSoft, marginBottom: 6 },
  title: { color: colors.text, fontSize: 25, lineHeight: 32, fontWeight: "700", textAlign: "center" },
  copy: { color: colors.textMuted, fontSize: 15, lineHeight: 23, textAlign: "center" },
  password: { color: colors.text, borderWidth: 1, borderColor: colors.textDim, borderRadius: 14, padding: 16, minHeight: 52, backgroundColor: colors.panel },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: "center" },
  devices: { gap: 12, padding: 16, backgroundColor: colors.panel, borderRadius: 16 },
  deviceTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  device: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 },
  deviceText: { flex: 1, color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  notice: { color: colors.textMuted, textAlign: "center", fontSize: 14, lineHeight: 22 },
  error: { color: colors.red },
  helpButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  link: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  help: { padding: 18, gap: 12, borderRadius: 16, backgroundColor: colors.panel },
  helpCopy: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  support: { minHeight: 44, justifyContent: "center" },
  privacy: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 4 },
  privacyText: { flexShrink: 1, color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: "center" },
});
