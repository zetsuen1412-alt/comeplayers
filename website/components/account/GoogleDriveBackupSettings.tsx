"use client";

import { useEffect, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import type { AccountSnapshot } from "@/lib/e2ee/account";
import { openBrowserVault, type BrowserVault } from "@/lib/e2ee/browserVault";
import { unlockBrowserPasskeyRecovery } from "@/lib/e2ee/browserPasskey";
import { DRIVE_BACKUP_KEY_KIND, exportBrowserBackup, restoreBrowserBackup } from "@/lib/e2ee/browserBackup";
import {
  connectGoogleDrive,
  downloadLatestBrowserDriveBackup,
  driveOAuthConfigured,
  readDriveBackupPreference,
  uploadBrowserDriveBackup,
  writeDriveBackupPreference,
  type DriveBackupPreference,
} from "@/lib/e2ee/googleDriveBackup";

async function passkeyBackupKey(userId: string) {
  const response = await authenticatedFetchJson<{ account: AccountSnapshot | null }>("/api/messages/secure/account");
  const account = response.account;
  if (!account || account.roster.identity.userId !== userId || !account.encrypted_backup.passkey) {
    throw new Error("Selesaikan pengaturan E2EE dan passkey di Messages terlebih dahulu.");
  }
  return unlockBrowserPasskeyRecovery(account.encrypted_backup.passkey, account.roster.identity);
}

function formatTime(value: string | null) {
  if (!value) return "Belum pernah";
  return new Date(value).toLocaleString("id-ID");
}

export default function GoogleDriveBackupSettings({ userId, email }: { userId: string; email: string }) {
  const [preference, setPreference] = useState<DriveBackupPreference | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const read = () => setPreference(readDriveBackupPreference(userId));
    read();
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ userId?: string }>).detail?.userId === userId) read();
    };
    window.addEventListener("cp:e2ee-drive-pref", changed);
    return () => window.removeEventListener("cp:e2ee-drive-pref", changed);
  }, [userId]);

  async function vault(): Promise<BrowserVault> {
    const value = await openBrowserVault(userId);
    if (!value) throw new Error("Buka salah satu direct message dan aktifkan E2EE di perangkat ini terlebih dahulu.");
    return value;
  }

  async function key(current: BrowserVault, forcePasskey = false) {
    if (!forcePasskey) {
      const saved = await current.get<string>(DRIVE_BACKUP_KEY_KIND, userId);
      if (saved && /^[0-9a-f]{64}$/i.test(saved)) return saved;
    }
    setStatus("Konfirmasi passkey akun untuk membuka kunci backup…");
    return passkeyBackupKey(userId);
  }

  async function run(action: "enable" | "backup" | "restore" | "disable") {
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      const current = await vault();
      if (action === "disable") {
        await current.remove(DRIVE_BACKUP_KEY_KIND, userId);
        const next: DriveBackupPreference = {
          version: 1,
          enabled: false,
          email: preference?.email || email,
          rootFingerprint: current.checkpoint.rootFingerprint,
          lastBackupAt: preference?.lastBackupAt || null,
          needsReconnect: false,
        };
        writeDriveBackupPreference(userId, next);
        setPreference(next);
        setStatus("Backup otomatis dimatikan. Backup terenkripsi yang sudah ada di Google Drive tidak dihapus.");
        return;
      }
      if (!driveOAuthConfigured()) {
        throw new Error("Google Drive backup web belum dikonfigurasi. Backup Google Drive tetap tersedia di aplikasi ComePlayers Android.");
      }
      const recoveryKey = await key(current, action === "enable" || action === "restore");
      try {
        setStatus(`Hubungkan Google Drive dengan email ${email}…`);
        const drive = await connectGoogleDrive(email, true);
        if (action === "restore") {
          setStatus("Mengunduh backup terenkripsi terbaru dari Google Drive…");
          const { file, blob } = await downloadLatestBrowserDriveBackup(userId, current.checkpoint.rootFingerprint, drive);
          setStatus("Memverifikasi dan memulihkan riwayat ke perangkat ini…");
          const result = await restoreBrowserBackup(current, blob, recoveryKey);
          await current.put(DRIVE_BACKUP_KEY_KIND, userId, recoveryKey);
          const next: DriveBackupPreference = {
            version: 1,
            enabled: true,
            email: drive.email,
            rootFingerprint: current.checkpoint.rootFingerprint,
            lastBackupAt: file.modifiedTime,
            needsReconnect: false,
          };
          writeDriveBackupPreference(userId, next);
          setPreference(next);
          setStatus(`Pemulihan selesai: ${result.restored} catatan dipulihkan, ${result.skipped} catatan perangkat yang lebih baru dipertahankan. Muat ulang Messages bila percakapan sedang terbuka.`);
        } else {
          setStatus("Mengenkripsi riwayat lokal di perangkat ini…");
          const blob = await exportBrowserBackup(current, recoveryKey);
          setStatus("Mengunggah backup terenkripsi ke Google Drive…");
          const saved = await uploadBrowserDriveBackup(blob, userId, current.checkpoint.rootFingerprint, drive);
          if (action === "enable") await current.put(DRIVE_BACKUP_KEY_KIND, userId, recoveryKey);
          const next: DriveBackupPreference = {
            version: 1,
            enabled: action === "enable" || preference?.enabled === true,
            email: drive.email,
            rootFingerprint: current.checkpoint.rootFingerprint,
            lastBackupAt: saved.modifiedTime,
            needsReconnect: false,
          };
          writeDriveBackupPreference(userId, next);
          setPreference(next);
          setStatus(action === "enable" ? "Backup otomatis Google Drive aktif. ComePlayers hanya mengunggah arsip terenkripsi." : "Backup terenkripsi terbaru berhasil disimpan ke Google Drive.");
        }
      } finally {
        // JavaScript strings cannot be reliably wiped; the key is never sent to ComePlayers or Google.
      }
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Backup Google Drive gagal.");
    } finally {
      setBusy(false);
    }
  }

  const configured = driveOAuthConfigured();
  const enabled = Boolean(
    preference?.enabled &&
    preference.rootFingerprint &&
    preference.email &&
    preference.rootFingerprint === preference.rootFingerprint,
  );

  return <section className="border-b border-cyan-400/15 px-6 py-7 md:px-8 md:py-9">
    <p className="inline-flex rounded-full border border-cyan-400/35 bg-cyan-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200">
      E2EE & Google Drive
    </p>
    <h2 className="mt-4 text-2xl font-black">Riwayat Messages tersimpan di perangkat</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
      Direct message baru dienkripsi end-to-end. Riwayat yang sudah dibuka disimpan di penyimpanan terenkripsi perangkat ini. Untuk pindah perangkat, gunakan passkey akun dan backup terenkripsi Google Drive—tanpa kode recovery.
    </p>

    <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300 md:grid-cols-2">
      <div><span className="block text-xs font-black uppercase tracking-wider text-slate-500">Google Drive</span>{preference?.email || email}</div>
      <div><span className="block text-xs font-black uppercase tracking-wider text-slate-500">Backup terakhir</span>{formatTime(preference?.lastBackupAt || null)}</div>
      <div><span className="block text-xs font-black uppercase tracking-wider text-slate-500">Backup otomatis</span>{enabled ? "Aktif" : "Nonaktif"}</div>
      <div><span className="block text-xs font-black uppercase tracking-wider text-slate-500">Recovery code</span>Tidak digunakan</div>
    </div>

    {!configured ? <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">
      Google Drive untuk browser memerlukan konfigurasi OAuth web. Aplikasi Android dapat memakai koneksi Google yang sudah ada. E2EE dan penyimpanan lokal tetap berfungsi di web.
    </p> : null}

    <div className="mt-5 flex flex-wrap gap-3">
      {!enabled ? <button type="button" disabled={busy || !configured} onClick={() => void run("enable")} className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-black disabled:opacity-40">
        {busy ? "Memproses…" : "Aktifkan backup otomatis Google Drive"}
      </button> : <button type="button" disabled={busy} onClick={() => void run("disable")} className="rounded-xl border border-white/15 px-5 py-3 font-black text-slate-200 disabled:opacity-40">Matikan backup otomatis</button>}
      <button type="button" disabled={busy || !configured} onClick={() => void run("backup")} className="rounded-xl border border-cyan-400/35 px-5 py-3 font-black text-cyan-200 disabled:opacity-40">Backup sekarang</button>
      <button type="button" disabled={busy || !configured} onClick={() => void run("restore")} className="rounded-xl border border-cyan-400/35 px-5 py-3 font-black text-cyan-200 disabled:opacity-40">Pulihkan backup terbaru</button>
    </div>

    <p className="mt-4 text-xs leading-5 text-slate-500">
      Saat pertama kali mengaktifkan Google Drive, pengguna harus menyetujui izin Google satu kali. ComePlayers mencocokkan akun Drive dengan email login {email || "Anda"} dan hanya memakai folder data aplikasi yang tersembunyi. Arsip Drive dienkripsi sebelum diunggah.
    </p>
    {status ? <p role="status" className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-200">{status}</p> : null}
  </section>;
}
