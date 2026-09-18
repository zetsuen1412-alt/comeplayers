import { useEffect, useRef, useState } from "react";
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
import { fingerprint } from "../secure/crypto";
import {
  disableAutomaticDriveBackup,
  enableAutomaticDriveBackup,
  readAutomaticDriveBackup,
  type AutomaticDriveBackupPreference,
} from "../secure/driveBackupPreference";

export function PrivateBackupSettings({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { messenger, reopen } = usePrivateMessenger();
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const [automatic, setAutomatic] = useState<AutomaticDriveBackupPreference | null>(null);
  const running = useRef(false), controller = useRef<AbortController | null>(null);

  const refreshAutomatic = () => {
    void readAutomaticDriveBackup(userId).then(setAutomatic);
  };

  useEffect(() => {
    refreshAutomatic();
    return () => { controller.current?.abort(); };
  }, [userId, messenger]);

  async function currentSession() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== userId) throw new Error("The signed-in account changed. Reopen backup settings.");
    if (!data.session.user.email) throw new Error("Your ComePlayers account email is unavailable.");
    return data.session;
  }

  async function disableAutomatic() {
    if (running.current) return;
    running.current = true; setBusy(true); setStatus("");
    try {
      await disableAutomaticDriveBackup(userId);
      refreshAutomatic();
      setStatus("Automatic Google Drive backup is off. Existing encrypted backups in Drive were not deleted.");
    } catch (reason) {
      setStatus(passkeyError(reason));
    } finally {
      running.current = false; setBusy(false);
    }
  }

  async function perform(action: "enable-auto" | "drive-backup" | "drive-restore" | "export" | "import") {
    if (running.current || !messenger) return;
    running.current = true; setBusy(true); setStatus("");
    const abort = new AbortController(); controller.current = abort;
    let file: File | undefined, paused = false;
    try {
      const session = await currentSession();
      const account = await fetchRecoveryAccount(mobileSecureTransport), passkey = account?.encrypted_backup.passkey;
      if (!account || !passkey || account.roster.identity.userId !== userId) throw new Error("Complete account passkey setup before saving or restoring encrypted backups.");
      setStatus("Confirm your account passkey…");
      // The user never types a recovery code. The passkey derives the backup key locally.
      const key = await unlockNativePasskeyRecovery(passkey, account.roster.identity);
      checkBackupCancellation(abort.signal); await currentSession();
      if (action === "enable-auto" || action === "drive-backup") {
        const { backup, email } = await backUpToGoogleDrive(userId, key, setStatus, abort.signal, session.user.email);
        if (action === "enable-auto" || automatic?.enabled) {
          await enableAutomaticDriveBackup(userId, key, email, fingerprint(account.roster.identity), backup.modifiedTime);
          refreshAutomatic();
        }
        setStatus(action === "enable-auto"
          ? `Automatic encrypted backup is active for ${email}. No recovery code is required.`
          : `Encrypted backup saved to Google Drive (${email}).`);
      } else if (action === "export") {
        if (!await Sharing.isAvailableAsync()) throw new Error("File sharing is unavailable on this device.");
        setStatus("Encrypting your verified history…");
        file = await exportVerifiedBackup(userId, key, abort.signal);
        checkBackupCancellation(abort.signal);
        await Sharing.shareAsync(file.uri, { mimeType: "application/octet-stream", dialogTitle: "Save encrypted ComePlayers backup" });
        setStatus("Backup file prepared. Check that it was saved in the location you selected.");
      } else {
        let driveEmail = "";
        let driveModifiedAt = new Date().toISOString();
        if (action === "drive-restore") {
          const downloaded = await downloadGoogleDriveBackup(userId, setStatus, abort.signal, session.user.email);
          file = downloaded.file; driveEmail = downloaded.email; driveModifiedAt = downloaded.backup.modifiedTime;
        } else {
          const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
          if (picked.canceled || !picked.assets[0]) return;
          file = new File(picked.assets[0].uri);
        }
        checkBackupCancellation(abort.signal); await currentSession();
        setStatus("Checking and restoring encrypted history. Keep this screen open…");
        await messenger.pause(); paused = true;
        await restoreVerifiedBackup(userId, file.uri, key, abort.signal);
        paused = false; reopen();
        if (action === "drive-restore" && driveEmail) {
          await enableAutomaticDriveBackup(userId, key, driveEmail, fingerprint(account.roster.identity), driveModifiedAt);
          refreshAutomatic();
        }
        setStatus("History restored. Newer messages and this device's verification were preserved.");
      }
    } catch (reason) {
      setStatus(abort.signal.aborted ? "Transfer cancelled. Completed backups and existing history are unchanged." : passkeyError(reason));
    } finally {
      try { if (file?.exists) file.delete(); } finally {
        if (paused) reopen();
        running.current = false; controller.current = null; setBusy(false);
      }
    }
  }

  return <Modal visible animationType="slide" onRequestClose={() => { if (!running.current) onClose(); }}><ScrollView contentContainerStyle={s.page}>
    <Pressable disabled={busy} onPress={onClose}><Text style={s.link}>‹ Back to profile</Text></Pressable>
    <Text style={s.title}>End-to-end encrypted Messages</Text>
    <Text style={s.text}>Direct-message history is stored in this device's encrypted vault. On a new device, sign in to the same ComePlayers account and confirm the synced passkey. There is no recovery code to type or save.</Text>
    <View style={s.card}><Text style={s.label}>THIS DEVICE</Text><Text selectable style={s.value}>{messenger?.vault.descriptor.deviceId || "Verify this device first"}</Text><Text style={s.text}>Account {userId.slice(0, 8)}…</Text></View>

    <Text style={s.title}>Google Drive backup</Text>
    <Text style={s.text}>ComePlayers recommends Google Drive for device replacement. The Drive account must use the same email as your ComePlayers login. Google receives only an encrypted archive inside the private app-data folder.</Text>
    <View style={s.card}>
      <Text style={s.label}>AUTOMATIC BACKUP</Text>
      <Text style={s.value}>{automatic?.enabled ? "Active" : "Off"}</Text>
      <Text style={s.text}>{automatic?.email || "Not connected"}</Text>
      <Text style={s.text}>Last backup: {automatic?.lastBackupAt ? new Date(automatic.lastBackupAt).toLocaleString() : "Never"}</Text>
      {automatic?.needsReconnect ? <Text style={s.warning}>Reconnect Google Drive from this screen so automatic backup can continue.</Text> : null}
    </View>
    {automatic?.enabled
      ? <PrimaryButton label="Turn off automatic backup" tone="neutral" disabled={busy} onPress={() => void disableAutomatic()} />
      : <PrimaryButton label="Enable automatic Google Drive backup" disabled={busy || !messenger} onPress={() => void perform("enable-auto")} />}
    <PrimaryButton label="Back up now" tone="neutral" disabled={busy || !messenger} onPress={() => void perform("drive-backup")} />
    <PrimaryButton label="Restore latest Google Drive backup" tone="neutral" disabled={busy || !messenger} onPress={() => void perform("drive-restore")} />

    <Text style={s.title}>Extra encrypted file</Text>
    <Text style={s.text}>You can also keep a manual encrypted copy outside Google Drive. It uses the same account passkey and does not expose the decryption key.</Text>
    <PrimaryButton label="Save encrypted backup file" tone="neutral" disabled={busy || !messenger} onPress={() => void perform("export")} />
    <PrimaryButton label="Restore from backup file" tone="neutral" disabled={busy || !messenger} onPress={() => void perform("import")} />
    <Text style={s.text}>Backups created before an encryption-identity reset do not belong to the new identity. Existing local history is never deleted just because a backup fails.</Text>
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
  warning: { color: colors.yellow, fontSize: 13, lineHeight: 19 },
});
