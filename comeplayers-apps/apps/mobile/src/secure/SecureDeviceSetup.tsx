import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { PrimaryButton } from "../components";
import { colors } from "../theme";
import { activatePasskeySetup, activateSecureSetup, type SecureSetup } from "./secureSetup";
import { passkeyError } from "./nativePasskey";
import { newId, utf8 } from "./crypto";

export function SecureDeviceSetup({ userId, setup, error, onActivated, onRetry }: { userId: string; setup: SecureSetup | null; error: string; onActivated: () => void; onRetry: () => void }) {
  const [saved, setSaved] = useState(false), [recoveryKey, setRecoveryKey] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [manual, setManual] = useState(false);
  const activatePasskey = async () => {
    if (!setup || busy) return;
    setBusy(true); setMessage("");
    try { await activatePasskeySetup(userId, setup); onActivated(); }
    catch (reason) { setMessage(passkeyError(reason)); }
    finally { setBusy(false); }
  };
  const activate = async () => {
    if (!setup || busy || (setup.kind === "new" && !saved)) return;
    setBusy(true); setMessage("");
    try { await activateSecureSetup(userId, setup, recoveryKey); onActivated(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "This device could not be verified."); }
    finally { setBusy(false); }
  };
  const saveRecoveryFile = async () => {
    if (setup?.kind !== "new" || busy) return;
    setBusy(true); setMessage("");
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error("Saving files is unavailable on this device.");
      const file = new File(Paths.cache, `ComePlayers-recovery-${newId()}.txt`); file.create();
      const handle = file.open();
      try { handle.writeBytes(utf8(`ComePlayers encrypted Messages recovery key\n\nAccount: ${userId}\nRecovery key: ${setup.recoveryKey}\n\nKeep this file private. ComePlayers cannot replace this key.\n`)); }
      finally { handle.close(); }
      await Sharing.shareAsync(file.uri, { mimeType: "text/plain", dialogTitle: "Save ComePlayers recovery key", UTI: "public.plain-text" });
      setMessage("The plain-text recovery file was handed to your chosen storage app. Confirm it finished saving and keep that file private before activation.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The recovery file could not be saved."); }
    finally { setBusy(false); }
  };
  return <Modal visible animationType="slide" onRequestClose={() => undefined}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <View style={s.lock}><Text style={s.lockText}>🔒</Text></View>
    <Text style={s.title}>{setup?.kind === "recover" ? "Verify this device" : "Protect your Messages"}</Text>
    {!setup && !error ? <><ActivityIndicator color={colors.yellow} /><Text style={s.copy}>Checking your encrypted ComePlayers identity…</Text></> : null}
    {error ? <><Text style={s.error}>{error}</Text><PrimaryButton label="Try again" onPress={onRetry} /></> : null}
    {setup?.kind === "new" ? <>
      <Text style={s.copy}>Protect your encrypted Messages with a passkey saved in your password manager. On a new phone or PC, sign in to ComePlayers and unlock with your fingerprint or device PIN to restore synced history.</Text>
      <PrimaryButton label="Protect Messages with a passkey" loading={busy} disabled={busy} onPress={() => void activatePasskey()} />
      <Text style={s.warning}>Use the same synced password manager on your new device. Your passkey and encryption keys are never sent to ComePlayers.</Text>
      <Pressable accessibilityRole="button" onPress={() => setManual(value => !value)}><Text style={s.copy}>{manual ? "Hide recovery key option" : "Use a recovery key instead"}</Text></Pressable>
      {manual ? <>
      <Text selectable style={s.key}>{setup.recoveryKey.match(/.{1,4}/g)?.join(" ")}</Text>
      <Text style={s.warning}>ComePlayers cannot recover this key. The optional .txt export contains the recovery key in plain text, so put it in a password manager, an encrypted Drive folder, or another place only you can open.</Text>
      <PrimaryButton label="Export recovery key (.txt)" tone="neutral" loading={busy} disabled={busy} onPress={() => void saveRecoveryFile()} />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: saved }} onPress={() => setSaved(value => !value)} style={s.check}><Text style={s.checkText}>{saved ? "☑" : "☐"} I saved this recovery key safely</Text></Pressable>
      <PrimaryButton label="Activate encrypted Messages" loading={busy} disabled={!saved || busy} onPress={() => void activate()} />
      </> : null}
    </> : null}
    {setup?.kind === "recover" ? <>
      {setup.snapshot.encrypted_backup.passkey ? <>
        <Text style={s.copy}>You are signed in. Unlock the passkey saved for this account to download and restore your encrypted history.</Text>
        <PrimaryButton label="Unlock and restore Messages" loading={busy} disabled={busy} onPress={() => void activatePasskey()} />
        <Pressable accessibilityRole="button" onPress={() => setManual(value => !value)}><Text style={s.copy}>{manual ? "Hide recovery key option" : "Use my recovery key"}</Text></Pressable>
      </> : <Text style={s.copy}>Passkey recovery has not been enabled for this account. Enable it from Profile on your previous verified device, or enter your saved recovery key here once.</Text>}
      {manual || !setup.snapshot.encrypted_backup.passkey ? <>
      <TextInput accessibilityLabel="Encrypted Messages recovery key" value={recoveryKey} onChangeText={setRecoveryKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="64-character recovery key" placeholderTextColor={colors.textDim} style={s.input} />
      <PrimaryButton label="Verify and restore this device" loading={busy} disabled={busy || !/^[0-9a-f]{64}$/i.test(recoveryKey.replace(/\s/g, ""))} onPress={() => void activate()} />
      </> : null}
    </> : null}
    {message ? <Text style={s.error}>{message}</Text> : null}
    <Text style={s.note}>Messages, files and private call keys are end-to-end encrypted. The server retains ciphertext so verified devices can restore history, but it never receives your plaintext encryption keys.</Text>
  </ScrollView></Modal>;
}

const s = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: "center", padding: 28, gap: 20, backgroundColor: colors.background },
  lock: { alignSelf: "center", width: 82, height: 82, borderRadius: 41, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel },
  lockText: { fontSize: 34 }, title: { color: colors.text, fontSize: 28, lineHeight: 35, fontWeight: "800", textAlign: "center" },
  copy: { color: colors.textMuted, fontSize: 15, lineHeight: 23, textAlign: "center" },
  key: { color: colors.yellow, backgroundColor: colors.panelStrong, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 18, fontSize: 16, lineHeight: 26, textAlign: "center" },
  warning: { color: colors.textMuted, fontSize: 13, lineHeight: 20 }, check: { paddingVertical: 8 }, checkText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  input: { color: colors.text, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, fontSize: 16 },
  error: { color: colors.red, textAlign: "center", lineHeight: 21 }, note: { color: colors.textDim, fontSize: 12, lineHeight: 18, textAlign: "center" },
});
