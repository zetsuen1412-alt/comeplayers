import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../components";
import { colors } from "../theme";
import { activatePasskeySetup, type SecureSetup } from "./secureSetup";
import { passkeyError } from "./nativePasskey";

export function SecureDeviceSetup({ userId, setup, error, onActivated, onRetry, onDismiss }: { userId: string; setup: SecureSetup | null; error: string; onActivated: () => void; onRetry: () => void; onDismiss?: () => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [removeDeviceIds, setRemoveDeviceIds] = useState<string[]>([]);
  const running = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const devices = setup?.kind === "recover" ? setup.snapshot.roster.devices : [];
  const available = setup?.kind === "new" || (setup?.kind === "recover" && Boolean(setup.snapshot.encrypted_backup.passkey));
  const full = devices.length >= 8 && !removeDeviceIds.length;
  const activate = async () => {
    if (!setup || running.current || !available || full) return;
    running.current = true; setBusy(true); setMessage("");
    try { await activatePasskeySetup(userId, setup, removeDeviceIds); if (alive.current) onActivated(); }
    catch (reason) { if (alive.current) setMessage(passkeyError(reason)); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  // A user gesture is intentional: do not create passkeys or loop OS prompts in an effect.
  return <Modal visible animationType="slide" onRequestClose={() => { if (!running.current) onDismiss?.(); }}>
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={s.lock}>🔒</Text>
      <Text style={s.title}>{setup?.kind === "new" ? "Protect your Messages" : "Open encrypted Messages"}</Text>
      {!setup && !error ? <><ActivityIndicator color={colors.yellow} /><Text style={s.copy}>Checking your secure account…</Text></> : null}
      {setup?.kind === "new" ? <Text style={s.copy}>Save a passkey in your synced password manager. On another device, sign in to the same ComePlayers account and confirm your fingerprint or device PIN. You do not need a recovery code.</Text> : null}
      {setup?.kind === "recover" && available ? <Text style={s.copy}>You are signed in. Use this account's synced passkey to open your encrypted history. Your device may ask for a fingerprint or PIN.</Text> : null}
      {setup?.kind === "recover" && !available ? <Text style={s.copy}>This account still uses the previous recovery method. The approved reset has not reached this account yet. Refresh after the new release is active; your login and business data are unchanged.</Text> : null}
      {devices.length >= 8 ? <View style={s.devices}><Text style={s.warning}>Eight devices are registered. Select the old device you want to replace:</Text>{devices.map((device, index) => <Pressable key={device.id} disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: removeDeviceIds.includes(device.id) }} onPress={() => setRemoveDeviceIds(current => current.includes(device.id) ? current.filter(id => id !== device.id) : [...current, device.id])}><Text style={s.copy}>{removeDeviceIds.includes(device.id) ? "☑" : "☐"} Device {index + 1} · {new Date(device.createdAt).toLocaleDateString()}</Text></Pressable>)}</View> : null}
      {available ? <PrimaryButton label={setup?.kind === "new" ? "Protect with account passkey" : "Continue with account passkey"} loading={busy} disabled={busy || full} onPress={() => void activate()} /> : null}
      {error || message ? <Text accessibilityRole="alert" style={s.error}>{message || error}</Text> : null}
      <PrimaryButton label="Refresh account status" tone="neutral" disabled={busy} onPress={onRetry} />
      {onDismiss ? <PrimaryButton label="Use other ComePlayers features" tone="neutral" disabled={busy} onPress={onDismiss} /> : null}
      <Text style={s.note}>ComePlayers stores ciphertext, not your plaintext encryption keys. Use the same synced password manager when changing devices. Passkey support is required for the new recovery method.</Text>
    </ScrollView>
  </Modal>;
}
const s = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: "center", padding: 28, gap: 20, backgroundColor: colors.background },
  lock: { textAlign: "center", fontSize: 40 },
  title: { color: colors.text, fontSize: 28, lineHeight: 35, fontWeight: "800", textAlign: "center" },
  copy: { color: colors.textMuted, fontSize: 15, lineHeight: 23, textAlign: "center" },
  devices: { gap: 12, padding: 16, backgroundColor: colors.panel, borderRadius: 14 },
  warning: { color: colors.yellow, fontSize: 13, lineHeight: 20 },
  error: { color: colors.red, textAlign: "center", lineHeight: 21 },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 18, textAlign: "center" },
});
