import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File } from "expo-file-system";
import { PrimaryButton } from "../components";
import { exportVerifiedBackup, restoreVerifiedBackup } from "../secure/verifiedBackup";
import { backUpToGoogleDrive, downloadGoogleDriveBackup } from "../secure/googleDriveBackup";
import { checkBackupCancellation } from "../secure/backupCancellation";
import { usePrivateMessenger } from "../secure/PrivateProvider";
import { SecureDeviceSetup } from "../secure/SecureDeviceSetup";
import { colors } from "../theme";
import { type AccountSnapshot, fetchRecoveryAccount } from "../secure/accountRecovery";
import { mobileSecureTransport } from "../secure/mobileSecureTransport";
import { passkeyError, unlockNativePasskeyRecovery } from "../secure/nativePasskey";
import { enablePasswordBackup } from "../secure/passwordBackupSetup";
import { openPasswordRecovery } from "../secure/passwordRecovery";
import { supabase } from "../runtime";
import { fingerprint } from "../secure/crypto";
import {
  disableAutomaticDriveBackup,
  enableAutomaticDriveBackup,
  readAutomaticDriveBackup,
  type AutomaticDriveBackupPreference,
} from "../secure/driveBackupPreference";

export function PrivateBackupSettings({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { messenger, setup, error, reopen } = usePrivateMessenger();
  const [account, setAccount] = useState<AccountSnapshot | null>(null), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const [automatic, setAutomatic] = useState<AutomaticDriveBackupPreference | null>(null);
  const running = useRef(false), controller = useRef<AbortController | null>(null);

  const refreshAutomatic = () => {
    void readAutomaticDriveBackup(userId).then(setAutomatic);
  };

  useEffect(() => {
    refreshAutomatic();
    let alive = true;
    void fetchRecoveryAccount(mobileSecureTransport).then(value => { if (alive) setAccount(value); }).catch(() => { if (alive) setStatus("Status cadangan belum bisa dimuat. Buka kembali halaman ini."); });
    return () => { alive = false; controller.current?.abort(); };
  }, [userId, messenger]);

  async function currentSession() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== userId) throw new Error("The signed-in account changed. Reopen backup settings.");
    if (!data.session.user.email) throw new Error("Your ComePlayers account email is unavailable.");
    return data.session;
  }

  async function savePassword() {
    if (running.current) return;
    if (password !== confirmation) { setStatus("Konfirmasi sandi belum sama."); return; }
    running.current = true; setBusy(true); setStatus("Melindungi cadangan…");
    try {
      await currentSession(); await enablePasswordBackup(userId, password);
      setAccount(await fetchRecoveryAccount(mobileSecureTransport)); setConfirmation("");
      setStatus("Sandi cadangan siap. Pilih Google Drive atau simpan file untuk mencadangkan riwayat chat.");
    } catch (reason) { setStatus(passkeyError(reason)); }
    finally { running.current = false; setBusy(false); }
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
      const account = await fetchRecoveryAccount(mobileSecureTransport), passkey = account?.encrypted_backup.passkey, recovery = account?.encrypted_backup.password;
      if (!account || (!passkey && !recovery) || account.roster.identity.userId !== userId) throw new Error("Atur sandi cadangan terlebih dahulu.");
      setStatus(recovery ? "Membuka cadangan…" : "Konfirmasi kunci akses yang tersimpan…");
      const key = recovery ? await openPasswordRecovery(recovery, password, account.roster.identity) : await unlockNativePasskeyRecovery(passkey!, account.roster.identity);
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

  if (!messenger) return <Modal visible animationType="slide" onRequestClose={onClose}><View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 24 }}>
    <Pressable accessibilityRole="button" style={{ padding: 20, minHeight: 48 }} onPress={onClose}><Text style={s.link}>‹ Kembali</Text></Pressable>
    <SecureDeviceSetup userId={userId} setup={setup} error={error} onActivated={reopen} onRetry={reopen} />
  </View></Modal>;
  return <Modal visible animationType="slide" onRequestClose={() => { if (!running.current) onClose(); }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onClose}><Text style={s.link}>‹ Kembali</Text></Pressable>
    <Text accessibilityRole="header" style={s.title}>Chat & cadangan</Text>
    <View style={s.card}><Text style={s.value}>Chat siap digunakan</Text><Text style={s.text}>Pesan pribadi dienkripsi otomatis di perangkat ini. Passkey tidak diperlukan untuk mulai chat.</Text></View>
    <Text style={s.title}>Cadangan chat · opsional</Text>
    <Text style={s.text}>Cadangkan chat untuk memulihkannya saat berganti atau kehilangan ponsel. Tanpa cadangan atau perangkat lama, pesan terenkripsi tidak bisa dipulihkan hanya dengan login.</Text>
    {account && !account.encrypted_backup.password ? <View style={s.card}>
      <Text style={s.value}>Buat sandi cadangan</Text>
      <Text style={s.text}>Gunakan minimal 12 karakter, misalnya beberapa kata acak. Sandi ini berbeda dari sandi login dan tidak dikirim ke ComePlayers. Simpan baik-baik; kami tidak dapat meresetnya untuk membuka cadangan.</Text>
      <TextInput accessibilityLabel="Sandi cadangan baru" secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024} editable={!busy} placeholder="Sandi cadangan" placeholderTextColor={colors.textDim} value={password} onChangeText={setPassword} style={s.input} />
      <TextInput accessibilityLabel="Ulangi sandi cadangan" secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024} editable={!busy} placeholder="Ulangi sandi cadangan" placeholderTextColor={colors.textDim} value={confirmation} onChangeText={setConfirmation} style={s.input} />
      <PrimaryButton label="Simpan sandi cadangan" loading={busy} disabled={busy || password.length < 12 || !confirmation} onPress={() => void savePassword()} />
    </View> : null}
    {account?.encrypted_backup.password ? <View style={s.card}><Text style={s.value}>Dilindungi sandi cadangan</Text><TextInput accessibilityLabel="Sandi cadangan chat" secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024} editable={!busy} placeholder="Masukkan sandi cadangan" placeholderTextColor={colors.textDim} value={password} onChangeText={setPassword} style={s.input} /></View> : account?.encrypted_backup.passkey ? <Text style={s.text}>Cadangan lama Anda menggunakan kunci akses yang tersimpan. Metode ini tetap tersedia untuk memulihkan chat lama.</Text> : null}
    <Text style={s.title}>Google Drive</Text>
    <Text style={s.text}>Gunakan akun Google dengan email yang sama seperti akun ComePlayers. Hanya salinan terenkripsi yang disimpan di Drive.</Text>
    <View style={s.card}>
      <Text style={s.label}>CADANGAN OTOMATIS</Text>
      <Text style={s.value}>{automatic?.enabled ? "Aktif" : "Nonaktif"}</Text>
      <Text style={s.text}>{automatic?.email || "Belum terhubung"}</Text>
      <Text style={s.text}>Terakhir dicadangkan: {automatic?.lastBackupAt ? new Date(automatic.lastBackupAt).toLocaleString() : "Belum pernah"}</Text>
      {automatic?.needsReconnect ? <Text style={s.warning}>Hubungkan kembali Google Drive untuk melanjutkan cadangan otomatis.</Text> : null}
    </View>
    {automatic?.enabled
      ? <PrimaryButton label="Matikan cadangan otomatis" tone="neutral" disabled={busy} onPress={() => void disableAutomatic()} />
      : <PrimaryButton label="Aktifkan cadangan otomatis" disabled={busy || !messenger || !(account?.encrypted_backup.passkey || account?.encrypted_backup.password) || Boolean(account?.encrypted_backup.password && password.length < 12)} onPress={() => void perform("enable-auto")} />}
    <PrimaryButton label="Cadangkan sekarang" tone="neutral" disabled={busy || !messenger || !(account?.encrypted_backup.passkey || account?.encrypted_backup.password) || Boolean(account?.encrypted_backup.password && password.length < 12)} onPress={() => void perform("drive-backup")} />
    <PrimaryButton label="Pulihkan dari Google Drive" tone="neutral" disabled={busy || !messenger || !(account?.encrypted_backup.passkey || account?.encrypted_backup.password) || Boolean(account?.encrypted_backup.password && password.length < 12)} onPress={() => void perform("drive-restore")} />

    <Text style={s.title}>File cadangan</Text>
    <Text style={s.text}>Simpan salinan terenkripsi di tempat pilihan Anda. Gunakan sandi cadangan atau kunci akses yang sama untuk membukanya.</Text>
    <PrimaryButton label="Simpan file cadangan" tone="neutral" disabled={busy || !messenger || !(account?.encrypted_backup.passkey || account?.encrypted_backup.password) || Boolean(account?.encrypted_backup.password && password.length < 12)} onPress={() => void perform("export")} />
    <PrimaryButton label="Pulihkan dari file" tone="neutral" disabled={busy || !messenger || !(account?.encrypted_backup.passkey || account?.encrypted_backup.password) || Boolean(account?.encrypted_backup.password && password.length < 12)} onPress={() => void perform("import")} />
    <Text style={s.text}>Riwayat di perangkat ini tetap tersimpan jika proses cadangan gagal.</Text>
    {status ? <Text accessibilityLiveRegion="polite" style={s.text}>{status}</Text> : null}
    {busy ? <Pressable onPress={() => controller.current?.abort()}><Text style={s.link}>Batalkan transfer</Text></Pressable> : null}
  </ScrollView></Modal>;
}
const s = StyleSheet.create({
  input: { color: colors.text, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.textDim, borderRadius: 12, padding: 14, minHeight: 50 },
  page: { flexGrow: 1, padding: 24, gap: 20, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  text: { color: colors.textMuted, fontSize: 15, lineHeight: 23 },
  link: { color: colors.yellow, fontSize: 16 },
  card: { backgroundColor: colors.panel, borderRadius: 16, padding: 18, gap: 8 },
  label: { color: colors.textDim, fontSize: 11, letterSpacing: 1.5 },
  value: { color: colors.text, fontSize: 14 },
  warning: { color: colors.yellow, fontSize: 13, lineHeight: 19 },
});
