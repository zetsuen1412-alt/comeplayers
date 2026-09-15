import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { supabase } from "../runtime";

export function PrivateBackupSettings({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { messenger, reopen } = usePrivateMessenger();
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const running = useRef(false), controller = useRef<AbortController | null>(null);
  async function assertUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== userId) throw new Error("The signed-in account changed. Reopen backup settings.");
  }
  async function perform(action: "drive-backup" | "drive-restore" | "export" | "import") {
    if (running.current || !messenger) return;
    running.current = true; setBusy(true); setStatus("");
    const abort = new AbortController(); controller.current = abort;
    let file: File | undefined, paused = false;
    try {
      await assertUser();
      const account = await fetchRecoveryAccount(mobileSecureTransport), passkey = account?.encrypted_backup.passkey;
      if (!account || !passkey || account.roster.identity.userId !== userId) throw new Error("Complete account passkey setup before saving or restoring encrypted backups.");
      setStatus("Confirm your account passkey…");
      // Keep the derived key out of React state, input fields, logs and uploads.
      const key = await unlockNativePasskeyRecovery(passkey, account.roster.identity);
      checkBackupCancellation(abort.signal); await assertUser();
      if (action === "drive-backup") {
        const { email } = await backUpToGoogleDrive(userId, key, setStatus, abort.signal);
        setStatus(`Encrypted backup saved to Google Drive (${email}). Restore it with the same synced account passkey.`);
      } else if (action === "export") {
        if (!await Sharing.isAvailableAsync()) throw new Error("File sharing is unavailable on this device.");
        setStatus("Encrypting your verified history…");
        file = await exportVerifiedBackup(userId, key, abort.signal);
        checkBackupCancellation(abort.signal);
        await Sharing.shareAsync(file.uri, { mimeType: "application/octet-stream", dialogTitle: "Save encrypted ComePlayers backup" });
        setStatus("Backup file prepared. Check that it was saved in the location you selected.");
      } else {
        if (action === "drive-restore") file = (await downloadGoogleDriveBackup(userId, setStatus, abort.signal)).file;
        else {
          const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
          if (picked.canceled || !picked.assets[0]) return;
          file = new File(picked.assets[0].uri);
        }
        checkBackupCancellation(abort.signal); await assertUser();
        setStatus("Checking and restoring encrypted history. Keep this screen open…");
        await messenger.pause(); paused = true;
        await restoreVerifiedBackup(userId, file.uri, key, abort.signal);
        paused = false; reopen();
        setStatus("History restored. Newer messages and this device's verification were preserved.");
      }
    } catch (reason) {
      setStatus(abort.signal.aborted ? "Transfer cancelled. Completed backups and existing history are unchanged." : passkeyError(reason));
    } finally {
      try { if (file?.exists) file.delete(); } finally {
        if (paused) messenger.resume();
        running.current = false; controller.current = null; setBusy(false);
      }
    }
  }
  return <Modal visible animationType="slide" onRequestClose={() => { if (!running.current) onClose(); }}><ScrollView contentContainerStyle={s.page}>
    <Pressable disabled={busy} onPress={onClose}><Text style={s.link}>‹ Back to profile</Text></Pressable>
    <Text style={s.title}>Encrypted history and devices</Text>
    <Text style={s.text}>Sign in to the same ComePlayers account, then confirm your synced passkey to open encrypted Messages on another device. No recovery code is required.</Text>
    <View style={s.card}><Text style={s.label}>THIS DEVICE</Text><Text selectable style={s.value}>{messenger?.vault.descriptor.deviceId || "Verify this device first"}</Text><Text style={s.text}>Account {userId.slice(0, 8)}…</Text></View>
    <Text style={s.title}>Extra encrypted backups</Text>
    <Text style={s.text}>Each action asks for your account passkey. Google Drive or your selected file storage receives only an encrypted archive. Use the same synced password manager to restore it.</Text>
    <PrimaryButton label="Back up to Google Drive" disabled={busy || !messenger} onPress={() => void perform("drive-backup")} />
    <PrimaryButton label="Restore latest Google Drive backup" tone="neutral" disabled={busy || !messenger} onPress={() => void perform("drive-restore")} />
    <PrimaryButton label="Save encrypted backup file" tone="neutral" disabled={busy || !messenger} onPress={() => void perform("export")} />
    <PrimaryButton label="Restore from backup file" tone="neutral" disabled={busy || !messenger} onPress={() => void perform("import")} />
    <Text style={s.text}>Backups created before an encryption-identity reset do not belong to the new identity. The reset does not erase files already exported to personal storage.</Text>
    {status ? <Text accessibilityLiveRegion="polite" style={s.text}>{status}</Text> : null}
    {busy ? <Pressable onPress={() => controller.current?.abort()}><Text style={s.link}>Cancel transfer</Text></Pressable> : null}
  </ScrollView></Modal>;
}
const s = StyleSheet.create({
  page: { flexGrow: 1, padding: 24, gap: 20, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  text: { color: colors.textMuted, fontSize: 15, lineHeight: 23 },
  link: { color: colors.yellow, fontSize: 16 },
  card: { backgroundColor: colors.panel, borderRadius: 16, padding: 18, gap: 8 },
  label: { color: colors.textDim, fontSize: 11, letterSpacing: 1.5 },
  value: { color: colors.text, fontSize: 14 },
});
