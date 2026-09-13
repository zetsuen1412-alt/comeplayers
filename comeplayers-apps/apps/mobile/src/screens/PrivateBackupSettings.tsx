import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File } from "expo-file-system";
import { PrimaryButton } from "../components";
import { exportVerifiedBackup, restoreVerifiedBackup } from "../secure/verifiedBackup";
import { backUpToGoogleDrive, downloadGoogleDriveBackup } from "../secure/googleDriveBackup";
import { checkBackupCancellation } from "../secure/backupCancellation";
import { usePrivateMessenger } from "../secure/PrivateProvider";
import { colors } from "../theme";
import { fetchRecoveryAccount } from "../secure/accountRecovery";
import { mobileSecureTransport } from "../secure/mobileSecureTransport";
import { passkeyError, unlockNativePasskeyRecovery } from "../secure/nativePasskey";

export function PrivateBackupSettings({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { messenger, reopen } = usePrivateMessenger();
  const [recoveryKey, setRecoveryKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [usingPasskey, setUsingPasskey] = useState(false), [manual, setManual] = useState(false);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const validKey = /^[0-9a-f]{64}$/i.test(recoveryKey.replace(/\s/g, ""));
  async function unlockBackup() {
    if (running.current || !messenger) return;
    running.current = true; setBusy(true); setStatus("");
    try {
      const snapshot = await fetchRecoveryAccount(mobileSecureTransport), passkey = snapshot?.encrypted_backup.passkey;
      if (!snapshot || !passkey) throw new Error("Enable passkey recovery in Profile first, or use your existing recovery key.");
      setRecoveryKey(await unlockNativePasskeyRecovery(passkey, snapshot.roster.identity));
      setUsingPasskey(true); setManual(false); setStatus("Passkey unlocked. You can now save or restore backups protected by this passkey.");
    } catch (reason) { setStatus(passkeyError(reason)); }
    finally { running.current = false; setBusy(false); }
  }
  async function perform(action: "drive-backup" | "drive-restore" | "export" | "import") {
    if (running.current || !messenger || !validKey) return;
    running.current = true; setBusy(true); setStatus("");
    const abort = new AbortController(); controller.current = abort;
    let file: File | undefined, paused = false;
    try {
      if (action === "drive-backup") {
        const { email } = await backUpToGoogleDrive(userId, recoveryKey, setStatus, abort.signal);
        setStatus(`Encrypted backup saved to Google Drive (${email}). ${usingPasskey ? "Restore it with the same synced passkey." : "Keep your recovery key separately."}`);
      } else if (action === "export") {
        if (!await Sharing.isAvailableAsync()) throw new Error("File sharing is unavailable on this device.");
        setStatus("Encrypting your verified history…");
        file = await exportVerifiedBackup(userId, recoveryKey, abort.signal);
        await Sharing.shareAsync(file.uri, { mimeType: "application/octet-stream", dialogTitle: "Save encrypted ComePlayers backup" });
        setStatus("Backup file prepared. Check that it was saved in the location you selected.");
      } else {
        if (action === "drive-restore") file = (await downloadGoogleDriveBackup(userId, setStatus, abort.signal)).file;
        else {
          const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
          if (picked.canceled || !picked.assets[0]) return;
          file = new File(picked.assets[0].uri);
        }
        checkBackupCancellation(abort.signal);
        setStatus("Checking and restoring encrypted history. Keep this screen open…");
        await messenger.pause(); paused = true;
        await restoreVerifiedBackup(userId, file.uri, recoveryKey, abort.signal);
        paused = false;
        reopen();
        setStatus("History restored. Newer messages and this device's verification were preserved.");
      }
      setRecoveryKey(""); setUsingPasskey(false);
    } catch (error) {
      setStatus(abort.signal.aborted ? "Transfer cancelled. Existing history and completed backups are unchanged." : error instanceof Error ? error.message : "Backup operation failed.");
    } finally {
      if (file?.exists) file.delete();
      if (paused) messenger.resume();
      running.current = false; controller.current = null; setBusy(false);
    }
  }
  const deviceId = messenger?.vault.descriptor.deviceId;
  return <Modal visible animationType="slide" onRequestClose={() => { if (!running.current) onClose(); }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
    <Pressable disabled={busy} onPress={onClose}><Text style={s.link}>‹ Back to profile</Text></Pressable>
    <Text style={s.title}>Encrypted history and devices</Text>
    <Text style={s.text}>New private messages, attachments and private call keys are end-to-end encrypted. ComePlayers keeps retained ciphertext so another verified device can restore your history without receiving your plaintext keys.</Text>
    <View style={s.card}><Text style={s.label}>THIS DEVICE</Text><Text selectable style={s.value}>{deviceId || "Opening verified device…"}</Text><Text style={s.text}>Account {userId.slice(0, 8)}…</Text></View>
    <Text style={s.title}>Restore on another phone or PC</Text>
    <Text style={s.text}>Sign in to the same ComePlayers account, then unlock your synced passkey. Your new device downloads the encrypted history and opens it locally. Enable passkey recovery in Profile before replacing your current device.</Text>
    <Text style={s.title}>Encrypted history backup</Text>
    <Text style={s.text}>Save an extra copy of the history and media already downloaded to this phone. Google Drive receives an encrypted archive. Your recovery key stays on this device and is never included in the upload.</Text>
    <Text style={s.text}>Use the same Google account and passkey to restore a passkey-protected backup. Older backups made with a recovery key still need that original key.</Text>
    <PrimaryButton label={usingPasskey && validKey ? "Account passkey unlocked" : "Unlock backups with account passkey"} disabled={busy || !messenger} onPress={() => void unlockBackup()} />
    <Pressable disabled={busy} onPress={() => { setManual(value => !value); setRecoveryKey(""); setUsingPasskey(false); }}><Text style={s.link}>{manual ? "Hide recovery key" : "Use an existing recovery key"}</Text></Pressable>
    {manual ? <TextInput accessibilityLabel="Recovery key for encrypted backup" value={recoveryKey} onChangeText={setRecoveryKey} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="64-character recovery key" placeholderTextColor={colors.textDim} style={s.input} /> : null}
    <PrimaryButton label="Back up to Google Drive" disabled={busy || !validKey || !messenger} onPress={() => void perform("drive-backup")} />
    <PrimaryButton label="Restore latest Google Drive backup" tone="neutral" disabled={busy || !validKey || !messenger} onPress={() => void perform("drive-restore")} />
    <PrimaryButton label="Save encrypted backup file" tone="neutral" disabled={busy || !validKey || !messenger} onPress={() => void perform("export")} />
    <PrimaryButton label="Restore from backup file" tone="neutral" disabled={busy || !validKey || !messenger} onPress={() => void perform("import")} />
    {status ? <Text accessibilityLiveRegion="polite" style={s.text}>{status}</Text> : null}
    {busy ? <Pressable onPress={() => controller.current?.abort()}><Text style={s.link}>Cancel transfer</Text></Pressable> : null}
  </ScrollView></Modal>;
}

const s = StyleSheet.create({
  page: { flexGrow: 1, padding: 24, gap: 20, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" }, text: { color: colors.textMuted, fontSize: 15, lineHeight: 23 },
  link: { color: colors.yellow, fontSize: 16 }, card: { backgroundColor: colors.panel, borderRadius: 16, padding: 18, gap: 8 },
  label: { color: colors.textDim, fontSize: 11, letterSpacing: 1.5 }, value: { color: colors.text, fontSize: 14 },
  input: { color: colors.text, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  warning: { color: colors.yellow, backgroundColor: colors.panelStrong, borderRadius: 14, padding: 16, fontSize: 14, lineHeight: 21 },
});
