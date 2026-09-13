import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { GoogleSignin, googleWebClientId } from "../googleAuth";
import { Avatar, BrandMark, Panel, PrimaryButton } from "../components";
import { loadAccountProfile, uploadAvatar } from "../api";
import { apiUrl, backendConfigured, supabase } from "../runtime";
import { colors, radius } from "../theme";
import type { AccountProfile } from "../types";
import { AccountSettings } from "./AccountSettings";
import { PrivateBackupSettings } from "./PrivateBackupSettings";
import { PasskeyRecoverySettings } from "./PasskeyRecoverySettings";
import { loadPreferences, type AccountPreferences } from "../messagingApi";
import { authenticationMessage } from "../authTransport";

export function ProfileScreen({ session, onAccountUpdated }: { session: Session | null; onAccountUpdated?: () => void }) {
  const [backupOpen, setBackupOpen] = useState(false);
  const [passkeyOpen, setPasskeyOpen] = useState(false);
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

  useEffect(() => {
    let active = true;
    if (!session) { setProfile(null); return; }
    void loadPreferences().then(value => { if (active) setAccount(value); }).catch(() => undefined);
    void loadAccountProfile()
      .then((value) => active && setProfile(value))
      .catch((reason) => console.warn("[ComePlayers] Profile could not be loaded:", reason));
    return () => { active = false; };
  }, [session]);

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
      setMessage("Profile photo updated across ComePlayers.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Profile photo could not be updated.");
    } finally { setPhotoBusy(false); }
  };

  const submit = async () => {
    if (loading || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
    if (mode === "sign-in" && !password) return;
    if (mode === "sign-up" && (password.length < 12 || password !== confirmPassword)) return;
    setLoading(true); setMessage("");
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${apiUrl}/auth/callback?next=%2Freset-password` });
        if (error) throw error;
        setMessage("If an account uses this email, a password reset link will arrive shortly. Check your inbox and spam folder.");
      } else if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${apiUrl}/auth/callback?next=%2Faccount` } });
        if (error) throw error;
        if (!data.session) setMessage("Account created. Check your email to confirm your address.");
      }
    } catch (reason) { setMessage(authenticationMessage(reason)); }
    finally { setLoading(false); }
  };

  const signInWithGoogle = async () => {
    if (!googleWebClientId) {
      setMessage("Google sign-in is not configured for this release.");
      return;
    }
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
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    await Promise.allSettled([supabase.auth.signOut(), GoogleSignin.signOut()]);
    setLoading(false);
  };

  if (session) {
    const label = String(profile?.username || profile?.full_name || session.user.user_metadata?.username || session.user.user_metadata?.full_name || session.user.email || "ComePlayers User");
    const avatar = profile?.avatar_url || (typeof session.user.user_metadata?.avatar_url === "string" ? session.user.user_metadata.avatar_url : null);
    return <ScrollView contentContainerStyle={styles.page}><View style={styles.profileHero}><Avatar uri={avatar} name={label} size={92} accent="yellow" /><Pressable disabled={photoBusy} onPress={() => void choosePhoto()} style={styles.photoButton}><Text style={styles.photoButtonText}>{photoBusy ? "Uploading..." : "Change profile photo"}</Text></Pressable><Text style={styles.profileName}>{label}</Text><Text style={styles.profileEmail}>{session.user.email}</Text><View style={styles.activeBadge}><View style={styles.activeDot} /><Text style={styles.activeText}>SYNCED WITH COMEPLAYERS</Text></View></View>{message ? <Text style={styles.profileMessage}>{message}</Text> : null}<Panel style={styles.panel}><Row label="Phone identity" value={account?.phoneVerified ? "Verified" : "Not verified"} />{([["account", "Account", "Profile, username and phone"], ["settings", "Settings", "Notifications and privacy"], ["security", "Security", "Password, verification and devices"]] as const).map(([id, title, detail]) => <Pressable key={id} accessibilityRole="button" style={styles.row} onPress={() => setSection(id)}><View><Text style={[styles.rowValue, {fontSize: 16}]}>{title}</Text><Text style={[styles.rowLabel, {marginTop: 5}]}>{detail}</Text></View><Text style={styles.rowValue}>›</Text></Pressable>)}</Panel><View style={styles.gap} /><PrimaryButton label="Account recovery with passkey" tone="neutral" onPress={() => setPasskeyOpen(true)} />{passkeyOpen ? <PasskeyRecoverySettings userId={session.user.id} onClose={() => setPasskeyOpen(false)} /> : null}<View style={styles.gap} /><PrimaryButton label="Private chat backup & storage" tone="neutral" onPress={() => setBackupOpen(true)} />{backupOpen ? <PrivateBackupSettings userId={session.user.id} onClose={() => setBackupOpen(false)} /> : null}<View style={styles.gap} /><PrimaryButton label="Sign out" tone="neutral" onPress={() => void signOut()} loading={loading} /><Text style={styles.note}>Your profile photo is visible to other ComePlayers members. Signing out does not delete your data.</Text>{section ? <AccountSettings section={section} onClose={() => setSection(null)} onUpdated={refreshAccount} /> : null}</ScrollView>;
  }

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const submitDisabled = !backendConfigured || !validEmail || (mode === "sign-in" ? !password : mode === "sign-up" ? password.length < 12 || password !== confirmPassword : false);
  const switchMode = (next: typeof mode) => { setMode(next); setMessage(""); setPassword(""); setConfirmPassword(""); };
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.signInHero}>
      <BrandMark />
      <Text style={styles.kicker}>COMEPLAYERS</Text>
      <Text style={styles.title}>{mode === "sign-in" ? "Welcome back." : mode === "forgot" ? "Reset your password." : "Create your account."}</Text>
      <Text style={styles.subtitle}>{mode === "forgot" ? "We'll send a link to your email so you can choose a new password." : "Sign in to chat, play and explore the marketplace. Use your Google account or email and password."}</Text>
    </View>
    {!backendConfigured ? <View style={styles.warning}><Text style={styles.warningTitle}>Sign-in is temporarily unavailable</Text><Text style={styles.warningText}>Please try again with the latest ComePlayers release.</Text></View> : null}
    <Panel style={styles.form}>
      {mode !== "forgot" ? <><Pressable accessibilityRole="button" disabled={loading || !backendConfigured || !googleWebClientId} onPress={() => void signInWithGoogle()} style={({ pressed }) => [styles.googleButton, pressed && styles.googleButtonPressed]}><Text style={styles.googleIcon}>G</Text><Text style={styles.googleText}>Continue with Google / Gmail</Text></Pressable><View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>OR USE EMAIL</Text><View style={styles.dividerLine} /></View></> : null}
      <Text style={styles.label}>EMAIL ADDRESS</Text>
      <TextInput accessibilityLabel="Email address" editable={!loading} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" placeholder="player@example.com" placeholderTextColor={colors.textDim} style={styles.input} />
      {mode !== "forgot" ? <><Text style={styles.label}>PASSWORD</Text><TextInput accessibilityLabel="Password" editable={!loading} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} placeholder={mode === "sign-up" ? "At least 12 characters" : "Your password"} placeholderTextColor={colors.textDim} style={styles.input} /></> : null}
      {mode === "sign-up" ? <><Text style={styles.label}>CONFIRM PASSWORD</Text><TextInput accessibilityLabel="Confirm password" editable={!loading} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" placeholder="Repeat your password" placeholderTextColor={colors.textDim} style={styles.input} /></> : null}
      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
      <PrimaryButton label={mode === "sign-in" ? "Sign in with email" : mode === "forgot" ? "Send reset link" : "Create account"} onPress={() => void submit()} loading={loading} disabled={submitDisabled} />
      {mode === "sign-in" ? <Pressable accessibilityRole="button" disabled={loading} onPress={() => switchMode("forgot")}><Text style={styles.switch}>Forgot password?</Text></Pressable> : null}
      <Pressable accessibilityRole="button" disabled={loading} onPress={() => switchMode(mode === "sign-in" ? "sign-up" : "sign-in")}><Text style={styles.switch}>{mode === "sign-in" ? "New to ComePlayers? Create an account" : "Back to sign in"}</Text></Pressable>
    </Panel>
    <Text style={styles.note}>By continuing, you agree to our <Text accessibilityRole="link" onPress={() => void Linking.openURL(apiUrl + "/terms")}>Terms of Service</Text> and <Text accessibilityRole="link" onPress={() => void Linking.openURL(apiUrl + "/privacy")}>Privacy Policy</Text>.</Text>
  </ScrollView>;
}

function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 16, paddingBottom: 38, backgroundColor: colors.background },
  signInHero: { padding: 22, borderRadius: 25, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  kicker: { color: colors.yellow, fontSize: 9, fontWeight: "900", letterSpacing: 1.8 },
  title: { marginTop: 9, color: colors.text, fontSize: 30, lineHeight: 35, fontWeight: "900" },
  subtitle: { marginTop: 10, color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  warning: { marginTop: 12, padding: 14, borderRadius: radius.medium, borderWidth: 1, borderColor: "rgba(255,107,122,.35)", backgroundColor: "rgba(255,107,122,.08)" },
  warningTitle: { color: colors.red, fontSize: 11, fontWeight: "900" },
  warningText: { marginTop: 5, color: colors.textMuted, fontSize: 9, lineHeight: 14 },
  form: { marginTop: 14, padding: 18 },
  googleButton: { height: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 15, borderRadius: radius.medium, backgroundColor: "#ffffff" },
  googleButtonPressed: { opacity: .84 },
  googleIcon: { color: "#4285f4", fontSize: 20, fontWeight: "900" },
  googleText: { color: "#202124", fontSize: 14, fontWeight: "800" },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 15 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textDim, fontSize: 11, fontWeight: "900" },
  label: { marginBottom: 7, color: colors.textMuted, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  input: { height: 50, marginBottom: 15, paddingHorizontal: 14, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.borderStrong, color: colors.text, backgroundColor: colors.panelStrong },
  message: { marginBottom: 12, color: colors.yellow, fontSize: 14, lineHeight: 21 },
  switch: { marginTop: 16, paddingVertical: 5, color: colors.blue, fontSize: 13, fontWeight: "800", textAlign: "center" },
  note: { marginTop: 15, paddingHorizontal: 10, color: colors.textDim, fontSize: 12, lineHeight: 18, textAlign: "center" },
  profileHero: { alignItems: "center", paddingVertical: 32, borderRadius: 26, borderWidth: 1, borderColor: "rgba(255,208,0,.25)", backgroundColor: "#151507" },
  photoButton: { marginTop: 11, paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.yellowSoft },
  photoButtonText: { color: colors.yellow, fontSize: 9, fontWeight: "900" },
  profileName: { marginTop: 14, color: colors.text, fontSize: 22, fontWeight: "900" },
  profileEmail: { marginTop: 5, color: colors.textMuted, fontSize: 11 },
  activeBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 13, paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: "rgba(54,226,160,.1)" },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  activeText: { color: colors.green, fontSize: 7, fontWeight: "900", letterSpacing: .8 },
  profileMessage: { marginTop: 12, paddingHorizontal: 12, color: colors.green, fontSize: 10, lineHeight: 15, textAlign: "center" },
  panel: { marginTop: 14, paddingHorizontal: 16 },
  row: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { color: colors.textMuted, fontSize: 10 },
  rowValue: { color: colors.text, fontSize: 10, fontWeight: "900" },
  gap: { height: 14 },
});
