import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../runtime";
import { openVerifiedVault } from "./verifiedVault";
import { backUpToGoogleDrive } from "./googleDriveBackup";
import { fingerprint } from "./crypto";
import type { AccountRoster } from "./multiDevice";

const KEY_KIND = "drive-backup-key-v1";
const AUTO_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type AutomaticDriveBackupPreference = {
  version: 1;
  enabled: boolean;
  email: string;
  rootFingerprint: string;
  lastBackupAt: string | null;
  needsReconnect: boolean;
};

const preferenceKey = (userId: string) => `cp.drive.backup.v1.${userId}`;

export async function readAutomaticDriveBackup(userId: string): Promise<AutomaticDriveBackupPreference | null> {
  try {
    const raw = await AsyncStorage.getItem(preferenceKey(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AutomaticDriveBackupPreference>;
    if (
      value.version !== 1 ||
      typeof value.enabled !== "boolean" ||
      typeof value.email !== "string" ||
      typeof value.rootFingerprint !== "string" ||
      !/^[0-9a-f]{64}$/i.test(value.rootFingerprint) ||
      typeof value.needsReconnect !== "boolean" ||
      (value.lastBackupAt !== null && value.lastBackupAt !== undefined && (
        typeof value.lastBackupAt !== "string" || !Number.isFinite(Date.parse(value.lastBackupAt))
      ))
    ) return null;
    return {
      version: 1,
      enabled: value.enabled,
      email: value.email,
      rootFingerprint: value.rootFingerprint,
      lastBackupAt: value.lastBackupAt || null,
      needsReconnect: value.needsReconnect,
    };
  } catch {
    return null;
  }
}

async function savePreference(userId: string, value: AutomaticDriveBackupPreference) {
  await AsyncStorage.setItem(preferenceKey(userId), JSON.stringify(value));
}

export async function enableAutomaticDriveBackup(
  userId: string,
  recoveryKey: string,
  email: string,
  rootFingerprint: string,
  lastBackupAt: string,
) {
  const vault = await openVerifiedVault(userId);
  if (!vault) throw new Error("Verify this device in Messages before enabling automatic backup.");
  if (!/^[0-9a-f]{64}$/i.test(recoveryKey)) throw new Error("The account passkey did not unlock a valid backup key.");
  await vault.put(KEY_KIND, userId, recoveryKey);
  const preference: AutomaticDriveBackupPreference = {
    version: 1,
    enabled: true,
    email,
    rootFingerprint,
    lastBackupAt,
    needsReconnect: false,
  };
  await savePreference(userId, preference);
  return preference;
}

export async function disableAutomaticDriveBackup(userId: string) {
  const current = await readAutomaticDriveBackup(userId);
  const vault = await openVerifiedVault(userId);
  await vault?.remove(KEY_KIND, userId);
  if (current) await savePreference(userId, { ...current, enabled: false, needsReconnect: false });
}

let running: Promise<void> | null = null;

export function maybeRunAutomaticDriveBackup(userId: string): Promise<void> {
  if (running) return running;
  const operation = (async () => {
    const preference = await readAutomaticDriveBackup(userId);
    if (!preference?.enabled) return;
    if (preference.lastBackupAt && Date.now() - Date.parse(preference.lastBackupAt) < AUTO_INTERVAL_MS) return;
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session || session.user.id !== userId || !session.user.email) return;
    if (session.user.email.trim().toLowerCase() !== preference.email.trim().toLowerCase()) return;
    const vault = await openVerifiedVault(userId);
    if (!vault) return;
    const key = await vault.get<string>(KEY_KIND, userId);
    if (!key || !/^[0-9a-f]{64}$/i.test(key)) return;
    const roster = await vault.get<AccountRoster>("account-roster", userId);
    if (!roster || fingerprint(roster.identity) !== preference.rootFingerprint) return;
    try {
      const controller = new AbortController();
      const { backup, email } = await backUpToGoogleDrive(userId, key, () => undefined, controller.signal, session.user.email);
      await savePreference(userId, {
        ...preference,
        email,
        lastBackupAt: backup.modifiedTime,
        needsReconnect: false,
      });
    } catch {
      const latest = await readAutomaticDriveBackup(userId);
      if (latest?.enabled) await savePreference(userId, { ...latest, needsReconnect: true });
    }
  })();
  const tracked = operation.finally(() => { if (running === tracked) running = null; });
  running = tracked;
  return tracked;
}
