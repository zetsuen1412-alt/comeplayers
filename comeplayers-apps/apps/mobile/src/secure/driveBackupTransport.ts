export const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
export type DriveBackup = { id: string; name: string; size: string; modifiedTime: string };
export type BackupUploadSource = {
  name: string; size: number;
  upload: (url: string, options: { httpMethod: "PUT"; headers: Record<string, string>; signal?: AbortSignal; onProgress?: (progress: { bytesSent: number; totalBytes: number }) => void }) => Promise<{ status: number; body: string }>;
};
export function driveError(status: number): Error {
  return new Error(status === 401 ? "Google Drive authorization expired. Connect again and retry." :
    status === 403 ? "Google Drive access is unavailable. Check storage space and permission. ComePlayers must also have Drive API enabled." :
    status === 429 ? "Google Drive is busy. Please try again later." : "Google Drive transfer failed. Your previous backups are unchanged. Please retry.");
}
function accountId(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Invalid backup account.");
  return userId;
}
export function validateDriveBackup(value: unknown): DriveBackup {
  const file = value as Partial<DriveBackup> | null;
  if (!file || typeof file.id !== "string" || !/^[\w-]+$/.test(file.id) || typeof file.name !== "string" ||
    !file.name.endsWith(".cpbackup") || !Number.isSafeInteger(Number(file.size)) || Number(file.size) <= 0 ||
    Number(file.size) > 2 * 1024 ** 3 || typeof file.modifiedTime !== "string" || !Number.isFinite(Date.parse(file.modifiedTime))) {
    throw new Error("Google Drive returned an invalid or incomplete backup.");
  }
  return file as DriveBackup;
}
export async function uploadDriveBackup(source: BackupUploadSource, userId: string, token: string, progress?: (percent: number) => void, signal?: AbortSignal, request: typeof fetch = fetch): Promise<DriveBackup> {
  accountId(userId);
  if (!source.size || source.size > 2 * 1024 ** 3) throw new Error("The encrypted backup must be under 2 GB.");
  const response = await request("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,modifiedTime", {
    method: "POST", signal,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Upload-Content-Type": "application/octet-stream", "X-Upload-Content-Length": String(source.size) },
    body: JSON.stringify({ name: source.name, parents: ["appDataFolder"], appProperties: { comeplayersAccount: userId, archiveVersion: "2" } }),
  });
  if (!response.ok) throw driveError(response.status);
  const location = response.headers.get("Location");
  // Never forward the token or encrypted archive to an arbitrary upload host.
  const url = location ? new URL(location) : null;
  if (!url || url.origin !== "https://www.googleapis.com" || !url.pathname.startsWith("/upload/drive/v3/files") || url.username || url.password) throw new Error("Google Drive returned an invalid upload destination.");
  const result = await source.upload(url.href, {
    httpMethod: "PUT", signal,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream", "Content-Range": `bytes 0-${source.size - 1}/${source.size}` },
    onProgress: ({ bytesSent, totalBytes }) => progress?.(Math.min(99, Math.floor(bytesSent / Math.max(1, totalBytes) * 100))),
  });
  if (result.status !== 200 && result.status !== 201) throw driveError(result.status);
  const saved = validateDriveBackup(JSON.parse(result.body));
  if (Number(saved.size) !== source.size) throw new Error("The backup size could not be verified. Please retry.");
  progress?.(100);
  return saved;
}
export async function latestDriveBackup(userId: string, token: string, signal?: AbortSignal, request: typeof fetch = fetch): Promise<DriveBackup | null> {
  const q = `trashed = false and appProperties has { key='comeplayersAccount' and value='${accountId(userId)}' } and appProperties has { key='archiveVersion' and value='2' }`;
  const params = new URLSearchParams({ spaces: "appDataFolder", q, orderBy: "modifiedTime desc", pageSize: "1", fields: "files(id,name,size,modifiedTime)" });
  const response = await request(`${DRIVE_FILES}?${params}`, { signal, headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw driveError(response.status);
  const result = await response.json() as { files?: unknown[] };
  if (!Array.isArray(result.files)) throw new Error("Google Drive could not list your backups.");
  return result.files.length ? validateDriveBackup(result.files[0]) : null;
}
