"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { BrowserVault } from "@/lib/e2ee/browserVault";
import { DRIVE_BACKUP_KEY_KIND, exportBrowserBackup } from "@/lib/e2ee/browserBackup";
import {
  connectGoogleDrive,
  readDriveBackupPreference,
  uploadBrowserDriveBackup,
  writeDriveBackupPreference,
} from "@/lib/e2ee/googleDriveBackup";

const MINIMUM_BACKUP_INTERVAL = 5 * 60 * 1000;

export default function GoogleDriveAutoBackupAgent({ userId, vault }: { userId: string; vault: BrowserVault }) {
  useEffect(() => {
    let active = true;
    let running = false;

    async function backup() {
      if (!active || running || document.visibilityState !== "visible") return;
      const preference = readDriveBackupPreference(userId);
      if (
        !preference?.enabled ||
        preference.rootFingerprint !== vault.checkpoint.rootFingerprint ||
        (preference.lastBackupAt && Date.now() - Date.parse(preference.lastBackupAt) < MINIMUM_BACKUP_INTERVAL)
      ) return;
      running = true;
      try {
        const { data } = await supabase.auth.getSession();
        const email = data.session?.user.id === userId ? data.session.user.email || "" : "";
        if (!email || email.trim().toLowerCase() !== preference.email.trim().toLowerCase()) return;
        const key = await vault.get<string>(DRIVE_BACKUP_KEY_KIND, userId);
        if (!key || !/^[0-9a-f]{64}$/i.test(key)) return;
        const drive = await connectGoogleDrive(email, false);
        const blob = await exportBrowserBackup(vault, key);
        const saved = await uploadBrowserDriveBackup(blob, userId, vault.checkpoint.rootFingerprint, drive);
        if (!active) return;
        writeDriveBackupPreference(userId, {
          ...preference,
          email: drive.email,
          lastBackupAt: saved.modifiedTime,
          needsReconnect: false,
        });
      } catch {
        if (!active) return;
        const preference = readDriveBackupPreference(userId);
        if (preference?.enabled) {
          writeDriveBackupPreference(userId, { ...preference, needsReconnect: true });
        }
      } finally {
        running = false;
      }
    }

    const timer = window.setInterval(() => { void backup(); }, MINIMUM_BACKUP_INTERVAL);
    const visible = () => { if (document.visibilityState === "visible") void backup(); };
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ userId?: string }>).detail?.userId === userId) void backup();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("cp:e2ee-drive-pref", changed);
    void backup();
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("cp:e2ee-drive-pref", changed);
    };
  }, [userId, vault]);

  return null;
}
