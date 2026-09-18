import { File, Paths } from "expo-file-system";
import { googleDriveAccess } from "../googleAuth";
import { newId } from "./crypto";
import { exportVerifiedBackup } from "./verifiedBackup";
import { DRIVE_FILES, latestDriveBackup, uploadDriveBackup } from "./driveBackupTransport";
import { checkBackupCancellation } from "./backupCancellation";

export async function backUpToGoogleDrive(userId: string, recoveryKey: string, status: (message: string) => void, signal: AbortSignal, expectedEmail?: string | null) {
  status("Connect your Google Drive account…");
  const { accessToken, email } = await googleDriveAccess(expectedEmail);
  checkBackupCancellation(signal);
  status("Encrypting your verified history on this device…");
  const file = await exportVerifiedBackup(userId, recoveryKey, signal);
  try {
    checkBackupCancellation(signal);
    const backup = await uploadDriveBackup(file, userId, accessToken, percent => status(`Uploading encrypted backup: ${percent}%`), signal);
    return { backup, email };
  } finally { if (file.exists) file.delete(); }
}

export async function downloadGoogleDriveBackup(userId: string, status: (message: string) => void, signal: AbortSignal, expectedEmail?: string | null): Promise<{ file: File; email: string; backup: import("./driveBackupTransport").DriveBackup }> {
  status("Connect the Google account used for your backup…");
  const { accessToken, email } = await googleDriveAccess(expectedEmail);
  checkBackupCancellation(signal);
  const backup = await latestDriveBackup(userId, accessToken, signal);
  if (!backup) throw new Error("No ComePlayers history backup was found in this Google account.");
  const file = new File(Paths.cache, `ComePlayers-restore-${newId()}.cpbackup`);
  try {
    await File.downloadFileAsync(`${DRIVE_FILES}/${encodeURIComponent(backup.id)}?alt=media`, file, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal,
      onProgress: ({ bytesWritten }) => status(`Downloading encrypted backup: ${Math.min(100, Math.floor(bytesWritten / Number(backup.size) * 100))}%`),
    });
    if (file.size !== Number(backup.size)) throw new Error("The backup download is incomplete. Please retry.");
    return { file, email, backup };
  } catch (error) { if (file.exists) file.delete(); throw error; }
}
