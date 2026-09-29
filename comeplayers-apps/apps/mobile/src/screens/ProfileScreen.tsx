import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { GoogleSignin, googleWebClientId } from "../googleAuth";
import { Avatar, BrandMark, Panel, PrimaryButton } from "../components";
import { loadAccountProfile, uploadAvatar } from "../api";
import { apiUrl, backendConfigured, supabase } from "../runtime";
import { colors, radius } from "../theme";
import type { AccountProfile } from "../types";
import { AccountSettings } from "./AccountSettings";
import { loadPreferences, type AccountPreferences } from "../messagingApi";
import { ProfileCommerce } from "./ProfileCommerce";
import type { CommerceLink } from "../commercePolicy";
import { authenticationMessage } from "../authTransport";
import { PrivateBackupSettings } from "./PrivateBackupSettings";
import { unregisterDeviceNotifications } from "../NotificationProvider";

export function ProfileScreen({ session, onAccountUpdated, commerceLink, onCommerceLinkHandled }: { session: Session | null; onAccountUpdated?: () => void; commerceLink?: CommerceLink | null; onCommerceLinkHandled?: () => void }) {
  const [section, setSection] = useState<"account" | "settings" | "security" | null>(null);
  const [account, setAccount] = useState<AccountPreferences | null>(null);
  const refreshAccount = () => { void loadPreferences().then(setAccount).catch(() => undefined); void loadAccountProfile().then(setProfile).catch(() => undefined); onAccountUpdated?.(); };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "forgot">("sign-in");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const authRunning = useRef(false);

  useEffect(() => {
    let active = true;
    if (!session) { setProfile(null); return; }
    void loadPreferences().then(value => { if (active) { setAccount(value); setProfile(value.profile); } })
      .catch((reason) => console.warn("[ComePlayers] Profile could not be loaded:", reason));
    return () => { active = false; };
  }, [session?.user.id]);

  const choosePhoto = async () => {
    setPhotoBusy(true);
    setMessage("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: .8,
      });
      if (result.canceled || !result.assets[0]) return;
      const resized = await manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 512, height: 512 } }],
        { compress: .68, format: SaveFormat.JPEG },
      );
      const updated = await uploadAvatar({
        uri: resized.uri,
        name: "comeplayers-avatar.jpg",
        type: "image/jpeg",
      });
      setProfile(updated);
      setMessage("Foto profil berhasil diganti.");
    } catch (reason) {
      setMessage("Foto belum bisa disimpan. Periksa koneksi lalu coba lagi.");
    } finally { setPhotoBusy(false); }
  };

  const submit = async () => {
    if (authRunning.current || loading || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
    if (mode === "sign-in" && !password) return;
    if (mode === "sign-up" && (password.length < 12 || password !== confirmPassword)) return;
    authRunning.current = true;
    setLoading(true); setMessage("");
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${apiUrl}/auth/callback?next=%2Freset-password` });
        if (error) throw error;
        setMessage("Jika email ini terdaftar, tautan untuk mengganti sandi akan dikirim. Periksa kotak masuk dan folder spam.");
      } else if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${apiUrl}/auth/callback?next=%2Faccount` } });
        if (error) throw error;
        if (!data.session) setMessage("Akun berhasil dibuat. Buka email Anda untuk mengonfirmasi pendaftaran.");
      }
    } catch (reason) { setMessage(authenticationMessage(reason)); }
    finally { authRunning.current = false; setLoading(false); }
  };

  const signInWithGoogle = async () => {
    if (authRunning.current || loading) return;
    if (!googleWebClientId) {
      setMessage("Google belum tersedia. Gunakan email atau perbarui ComePlayers dari Google Play.");
      return;
    }
    authRunning.current = true;
    setLoading(true);
    setMessage("");
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      if (result.type === "cancelled") return;
      const idToken = result.data.idToken;
      if (!idToken) throw new Error("Google did not return a secure login token.");
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });
      if (error) throw error;
    } catch (reason) {
      setMessage(authenticationMessage(reason));
    } finally {
      authRunning.current = false;
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    await unregisterDeviceNotifications();
    await Promise.allSettled([supabase.auth.signOut(), GoogleSignin.signOut()]);
    setLoading(false);
  };

  if (session) {
    const label = String(profile?.username || profile?.full_name || session.user.user_metadata?.username || session.user.user_metadata?.full_name || session.user.email || "ComePlayers User");
    const avatar = profile?.avatar_url || (typeof session.user.user_metadata?.avatar_url === "string" ? session.user.user_metadata.avatar_url : null);
    return <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.profileHero}>
        <Avatar uri={avatar} name={label} size={64} accent="yellow" />
        <Pressable accessibilityRole="button" disabled={photoBusy} onPress={() => void choosePhoto()} style={styles.photoButton}><Text style={styles.photoButtonText}>{photoBusy ? "Menyimpan…" : "Ganti foto"}</Text></Pressable>
        <Text style={styles.profileName}>{label}</Text><Text style={styles.profileEmail}>{session.user.email}</Text>
      </View>
      {message ? <Text accessibilityLiveRegion="polite" style={styles.profileMessage}>{message}</Text> : null}
      <Panel style={styles.panel}>
        {([["account", "Akun saya", "Nama, foto, dan nomor telepon"], ["settings", "Pengaturan", "Notifikasi dan privasi"], ["security", "Keamanan akun", "Sandi dan perangkat"]] as const).map(([id, title, detail]) => <Pressable key={id} accessibilityRole="button" style={styles.row} onPress={() => setSection(id)}><View style={{ flex: 1 }}><Text style={styles.rowValue}>{title}</Text><Text style={styles.rowLabel}>{detail}</Text></View><Text style={styles.rowValue}>›</Text></Pressable>)}
        <Pressable accessibilityRole="button" style={styles.row} onPress={() => setBackupOpen(true)}><View style={{ flex: 1 }}><Text style={styles.rowValue}>Chat & cadangan</Text><Text style={styles.rowLabel}>Pilihan untuk menyimpan riwayat chat</Text></View><Text style={styles.rowValue}>›</Text></Pressable>
      </Panel>
      <ProfileCommerce key={session.user.id} commerceLink={commerceLink} onLinkHandled={onCommerceLinkHandled} />
      <View style={styles.gap} /><PrimaryButton label="Keluar dari akun" tone="neutral" onPress={() => void signOut()} loading={loading} />
      <Text style={styles.note}>Keluar dari akun tidak menghapus data Anda.</Text>
      <Text style={styles.note}>ComePlayers {Constants.expoConfig?.version || ""}</Text>
      {section ? <AccountSettings section={section} onClose={() => setSection(null)} onUpdated={refreshAccount} /> : null}
      {backupOpen ? <PrivateBackupSettings userId={session.user.id} onClose={() => setBackupOpen(false)} /> : null}
    </ScrollView>;
  }

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const submitDisabled = !backendConfigured || !validEmail || (mode === "sign-in" ? !password : mode === "sign-up" ? password.length < 12 || password !== confirmPassword : false);
  const switchMode = (next: typeof mode) => { setMode(next); setEmailOpen(true); setMessage(""); setPassword(""); setConfirmPassword(""); };
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.signInHero}>
      <BrandMark compact />
      <Text style={styles.kicker}>COMEPLAYERS</Text>
      <Text style={styles.title}>{mode === "sign-in" ? "Selamat datang" : mode === "forgot" ? "Lupa sandi?" : "Buat akun"}</Text>
      <Text style={styles.subtitle}>{mode === "forgot" ? "Masukkan email Anda. Kami akan mengirim tautan untuk mengganti sandi." : "Ngobrol dengan teman dan berkumpul di komunitas. Masuk untuk mulai."}</Text>
    </View>
    {!backendConfigured ? <View style={styles.warning}><Text style={styles.warningTitle}>Belum bisa masuk</Text><Text style={styles.warningText}>Perbarui ComePlayers dari Google Play lalu coba lagi.</Text></View> : null}
    <Panel style={styles.form}>
      {mode !== "forgot" ? <Pressable accessibilityRole="button" accessibilityLabel="Masuk dengan Google" accessibilityState={{ disabled: loading || !backendConfigured || !googleWebClientId, busy: loading }} disabled={loading || !backendConfigured || !googleWebClientId} onPress={() => void signInWithGoogle()} style={({ pressed }) => [styles.googleButton, pressed && styles.googleButtonPressed]}><Text style={styles.googleIcon}>G</Text><Text style={styles.googleText}>{loading ? "Sebentar…" : "Masuk dengan Google"}</Text></Pressable> : null}
      {!googleWebClientId && backendConfigured ? <Text style={styles.message}>Google belum tersedia. Anda tetap bisa masuk dengan email.</Text> : null}
      {!emailOpen && mode === "sign-in" ? <PrimaryButton label="Gunakan email" tone="neutral" onPress={() => setEmailOpen(true)} disabled={loading} /> : <>
      <Text style={styles.label}>Email</Text>
      <TextInput accessibilityLabel="Email" editable={!loading} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" placeholder="nama@gmail.com" placeholderTextColor={colors.textMuted} style={styles.input} />
      {mode !== "forgot" ? <><Text style={styles.label}>Sandi</Text><TextInput accessibilityLabel="Sandi" editable={!loading} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} placeholder={mode === "sign-up" ? "Minimal 12 karakter" : "Masukkan sandi"} placeholderTextColor={colors.textMuted} style={styles.input} /></> : null}
      {mode === "sign-up" ? <><Text style={styles.label}>Ulangi sandi</Text><TextInput accessibilityLabel="Ulangi sandi" editable={!loading} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" placeholder="Masukkan sandi sekali lagi" placeholderTextColor={colors.textMuted} style={styles.input} /></> : null}
      <PrimaryButton label={mode === "sign-in" ? "Masuk" : mode === "forgot" ? "Kirim tautan" : "Buat akun"} onPress={() => void submit()} loading={loading} disabled={submitDisabled} />
      {mode === "sign-in" ? <Pressable accessibilityRole="button" disabled={loading} onPress={() => switchMode("forgot")}><Text style={styles.switch}>Lupa sandi?</Text></Pressable> : null}
      </>}
      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
      <Pressable accessibilityRole="button" disabled={loading} onPress={() => switchMode(mode === "sign-in" ? "sign-up" : "sign-in")}><Text style={styles.switch}>{mode === "sign-in" ? "Belum punya akun? Daftar" : "Kembali ke halaman masuk"}</Text></Pressable>
    </Panel>
    <Text style={styles.note}>Dengan melanjutkan, Anda menyetujui <Text accessibilityRole="link" onPress={() => void Linking.openURL(apiUrl + "/terms")}>Ketentuan layanan</Text> dan <Text accessibilityRole="link" onPress={() => void Linking.openURL(apiUrl + "/privacy")}>Kebijakan privasi</Text>.</Text>
    <Text style={styles.note}>ComePlayers {Constants.expoConfig?.version || ""}</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 16, paddingBottom: 38, backgroundColor: colors.background },
  signInHero: { padding: 22, borderRadius: 25, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  kicker: { color: colors.yellow, fontSize: 9, fontWeight: "900", letterSpacing: 1.8 },
  title: { marginTop: 9, color: colors.text, fontSize: 30, lineHeight: 35, fontWeight: "900" },
  subtitle: { marginTop: 10, color: colors.textMuted, fontSize: 17, lineHeight: 25 },
  warning: { marginTop: 12, padding: 14, borderRadius: radius.medium, borderWidth: 1, borderColor: "rgba(255,107,122,.35)", backgroundColor: "rgba(255,107,122,.08)" },
  warningTitle: { color: colors.red, fontSize: 11, fontWeight: "900" },
  warningText: { marginTop: 5, color: colors.textMuted, fontSize: 9, lineHeight: 14 },
  form: { marginTop: 14, padding: 18 },
  googleButton: { minHeight: 56, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 15, borderRadius: radius.medium, backgroundColor: "#ffffff" },
  googleButtonPressed: { opacity: .84 },
  googleIcon: { color: "#4285f4", fontSize: 20, fontWeight: "900" },
  googleText: { flexShrink: 1, color: "#202124", fontSize: 17, fontWeight: "700" },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 15 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textDim, fontSize: 11, fontWeight: "900" },
  label: { marginBottom: 7, color: colors.text, fontSize: 16, fontWeight: "600" },
  input: { minHeight: 54, fontSize: 17, paddingVertical: 12, marginBottom: 15, paddingHorizontal: 14, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.borderStrong, color: colors.text, backgroundColor: colors.panelStrong },
  message: { marginBottom: 12, color: colors.yellow, fontSize: 14, lineHeight: 21 },
  switch: { minHeight: 48, marginTop: 8, paddingVertical: 14, color: colors.blue, fontSize: 16, fontWeight: "600", textAlign: "center" },
  note: { marginTop: 15, paddingHorizontal: 10, color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  profileHero: { alignItems: "center", paddingVertical: 32, borderRadius: 26, borderWidth: 1, borderColor: "rgba(255,208,0,.25)", backgroundColor: "#151507" },
  photoButton: { minHeight: 48, justifyContent: "center", marginTop: 11, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.yellowSoft },
  photoButtonText: { color: colors.yellow, fontSize: 16, fontWeight: "600" },
  profileName: { marginTop: 14, color: colors.text, fontSize: 22, fontWeight: "900" },
  profileEmail: { marginTop: 5, color: colors.textMuted, fontSize: 15 },
  activeBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 13, paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: "rgba(54,226,160,.1)" },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  activeText: { color: colors.green, fontSize: 7, fontWeight: "900", letterSpacing: .8 },
  profileMessage: { marginTop: 12, paddingHorizontal: 12, color: colors.green, fontSize: 10, lineHeight: 15, textAlign: "center" },
  panel: { marginTop: 14, paddingHorizontal: 16 },
  row: { minHeight: 72, paddingVertical: 16, gap: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { marginTop: 5, color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  rowValue: { color: colors.text, fontSize: 18, fontWeight: "600" },
  gap: { height: 14 },
});
