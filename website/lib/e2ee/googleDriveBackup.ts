import { BROWSER_BACKUP_VERSION, MAX_BROWSER_BACKUP_BYTES } from "./browserBackup";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email";
const clientId = String(
  process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID ||
  process.env.NEXT_PUBLIC_GOOGLE_AUTH_WEB_CLIENT_ID ||
  "",
).trim();

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleOauth = {
  initTokenClient: (options: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: unknown) => void;
    include_granted_scopes?: boolean;
    hint?: string;
  }) => GoogleTokenClient;
};

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOauth } };
  }
}

export type GoogleDriveConnection = {
  accessToken: string;
  email: string;
  expiresAt: number;
};

export type DriveBackupFile = {
  id: string;
  name: string;
  size: string;
  modifiedTime: string;
};

export type DriveBackupPreference = {
  version: 1;
  enabled: boolean;
  email: string;
  rootFingerprint: string;
  lastBackupAt: string | null;
  needsReconnect: boolean;
};

let googleScript: Promise<void> | null = null;
let connection: GoogleDriveConnection | null = null;

function preferenceKey(userId: string) {
  return `cp.e2ee.drive.v1.${userId}`;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function validateUserId(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Akun Google Drive tidak valid.");
}

function validateFingerprint(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error("Identitas enkripsi Google Drive tidak valid.");
}

export function driveOAuthConfigured() {
  return Boolean(clientId);
}

export function readDriveBackupPreference(userId: string): DriveBackupPreference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(preferenceKey(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<DriveBackupPreference>;
    if (
      value.version !== 1 ||
      typeof value.enabled !== "boolean" ||
      typeof value.email !== "string" ||
      typeof value.rootFingerprint !== "string" ||
      !/^[0-9a-f]{64}$/i.test(value.rootFingerprint) ||
      (value.lastBackupAt !== null && value.lastBackupAt !== undefined && (
        typeof value.lastBackupAt !== "string" || !Number.isFinite(Date.parse(value.lastBackupAt))
      )) ||
      typeof value.needsReconnect !== "boolean"
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

export function writeDriveBackupPreference(userId: string, value: DriveBackupPreference) {
  if (typeof window === "undefined") return;
  validateUserId(userId);
  validateFingerprint(value.rootFingerprint);
  window.localStorage.setItem(preferenceKey(userId), JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("cp:e2ee-drive-pref", { detail: { userId } }));
}

async function loadGoogleOauth() {
  if (typeof window === "undefined") throw new Error("Google Drive hanya tersedia di browser.");
  if (window.google?.accounts?.oauth2) return;
  if (!clientId) {
    throw new Error("Google Drive backup untuk web belum dikonfigurasi. Gunakan aplikasi ComePlayers Android atau hubungi admin.");
  }
  if (!googleScript) {
    googleScript = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-cp-google-oauth="1"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Google authorization gagal dimuat.")), { once: true });
        if (window.google?.accounts?.oauth2) resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.cpGoogleOauth = "1";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Google authorization gagal dimuat."));
      document.head.appendChild(script);
    });
  }
  await googleScript;
  if (!window.google?.accounts?.oauth2) throw new Error("Google authorization tidak tersedia.");
}

async function token(expectedEmail: string): Promise<GoogleDriveConnection> {
  await loadGoogleOauth();
  const oauth = window.google!.accounts!.oauth2!;
  const response = await new Promise<GoogleTokenResponse>((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPE,
      include_granted_scopes: true,
      hint: expectedEmail,
      callback: resolve,
      error_callback: reject,
    });
    client.requestAccessToken({ prompt: "consent" });
  }).catch((reason) => {
    throw reason instanceof Error ? reason : new Error("Google Drive connection dibatalkan.");
  });
  if (!response.access_token || response.error) {
    throw new Error(response.error_description || "Izin Google Drive tidak diberikan.");
  }
  const profile = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${response.access_token}` },
    cache: "no-store",
  });
  if (!profile.ok) throw new Error("Email Google Drive tidak dapat diverifikasi.");
  const user = await profile.json() as { email?: unknown; email_verified?: unknown };
  if (typeof user.email !== "string" || user.email_verified === false) {
    throw new Error("Google Drive tidak mengembalikan email terverifikasi.");
  }
  if (normalizeEmail(user.email) !== normalizeEmail(expectedEmail)) {
    throw new Error(`Gunakan Google Drive dengan email akun ComePlayers: ${expectedEmail}`);
  }
  return {
    accessToken: response.access_token,
    email: user.email,
    expiresAt: Date.now() + Math.max(60, Number(response.expires_in || 3600) - 60) * 1000,
  };
}

export async function connectGoogleDrive(expectedEmail: string, interactive = true): Promise<GoogleDriveConnection> {
  if (!expectedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expectedEmail)) {
    throw new Error("Email akun ComePlayers tidak tersedia.");
  }
  if (
    connection &&
    normalizeEmail(connection.email) === normalizeEmail(expectedEmail) &&
    connection.expiresAt > Date.now() + 60_000
  ) return connection;
  if (!interactive) {
    throw new Error("Google Drive perlu dihubungkan kembali dari pengaturan backup.");
  }
  connection = await token(expectedEmail);
  return connection;
}

function driveError(status: number) {
  return new Error(
    status === 401 ? "Izin Google Drive kedaluwarsa. Hubungkan kembali lalu coba lagi." :
    status === 403 ? "Google Drive tidak dapat digunakan. Pastikan izin Drive diberikan dan penyimpanan tersedia." :
    status === 429 ? "Google Drive sedang sibuk. Coba lagi beberapa saat." :
    "Transfer Google Drive gagal. Backup sebelumnya tidak berubah.",
  );
}

function validFile(value: unknown): DriveBackupFile {
  const file = value as Partial<DriveBackupFile> | null;
  if (
    !file ||
    typeof file.id !== "string" ||
    !/^[\w-]+$/.test(file.id) ||
    typeof file.name !== "string" ||
    !file.name.endsWith(".cpbackup") ||
    typeof file.size !== "string" ||
    !Number.isSafeInteger(Number(file.size)) ||
    Number(file.size) <= 0 ||
    Number(file.size) > MAX_BROWSER_BACKUP_BYTES ||
    typeof file.modifiedTime !== "string" ||
    !Number.isFinite(Date.parse(file.modifiedTime))
  ) throw new Error("Google Drive mengembalikan backup yang tidak valid.");
  return file as DriveBackupFile;
}

export async function uploadBrowserDriveBackup(
  blob: Blob,
  userId: string,
  rootFingerprint: string,
  drive: GoogleDriveConnection,
): Promise<DriveBackupFile> {
  validateUserId(userId);
  validateFingerprint(rootFingerprint);
  if (!blob.size || blob.size > MAX_BROWSER_BACKUP_BYTES) {
    throw new Error("Backup terenkripsi harus berukuran di bawah 1 GB.");
  }
  const response = await fetch(`${DRIVE_UPLOAD}?uploadType=resumable&fields=id,name,size,modifiedTime`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${drive.accessToken}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Type": "application/octet-stream",
      "X-Upload-Content-Length": String(blob.size),
    },
    body: JSON.stringify({
      name: `ComePlayers-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.cpbackup`,
      parents: ["appDataFolder"],
      appProperties: {
        comeplayersAccount: userId,
        rootFingerprint,
        archiveVersion: String(BROWSER_BACKUP_VERSION),
      },
    }),
  });
  if (!response.ok) throw driveError(response.status);
  const location = response.headers.get("Location");
  const upload = location ? new URL(location) : null;
  if (
    !upload ||
    upload.origin !== "https://www.googleapis.com" ||
    !upload.pathname.startsWith("/upload/drive/v3/files") ||
    upload.username ||
    upload.password
  ) throw new Error("Google Drive mengembalikan tujuan upload yang tidak valid.");
  const savedResponse = await fetch(upload.href, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${drive.accessToken}`,
      "Content-Type": "application/octet-stream",
      "Content-Range": `bytes 0-${blob.size - 1}/${blob.size}`,
    },
    body: blob,
  });
  if (!savedResponse.ok) throw driveError(savedResponse.status);
  const saved = validFile(await savedResponse.json());
  if (Number(saved.size) !== blob.size) throw new Error("Ukuran backup Google Drive tidak cocok.");
  return saved;
}

export async function latestBrowserDriveBackup(
  userId: string,
  rootFingerprint: string,
  drive: GoogleDriveConnection,
): Promise<DriveBackupFile | null> {
  validateUserId(userId);
  validateFingerprint(rootFingerprint);
  const q = `trashed = false and appProperties has { key='comeplayersAccount' and value='${userId}' } and appProperties has { key='rootFingerprint' and value='${rootFingerprint}' } and appProperties has { key='archiveVersion' and value='${BROWSER_BACKUP_VERSION}' }`;
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q,
    orderBy: "modifiedTime desc",
    pageSize: "1",
    fields: "files(id,name,size,modifiedTime)",
  });
  const response = await fetch(`${DRIVE_FILES}?${params}`, {
    headers: { Authorization: `Bearer ${drive.accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw driveError(response.status);
  const data = await response.json() as { files?: unknown[] };
  if (!Array.isArray(data.files)) throw new Error("Daftar backup Google Drive tidak dapat dibaca.");
  return data.files.length ? validFile(data.files[0]) : null;
}

export async function downloadLatestBrowserDriveBackup(
  userId: string,
  rootFingerprint: string,
  drive: GoogleDriveConnection,
): Promise<{ file: DriveBackupFile; blob: Blob }> {
  const file = await latestBrowserDriveBackup(userId, rootFingerprint, drive);
  if (!file) throw new Error("Belum ada backup ComePlayers untuk akun dan identitas enkripsi ini di Google Drive.");
  const response = await fetch(`${DRIVE_FILES}/${encodeURIComponent(file.id)}?alt=media`, {
    headers: { Authorization: `Bearer ${drive.accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw driveError(response.status);
  const blob = await response.blob();
  if (blob.size !== Number(file.size) || blob.size > MAX_BROWSER_BACKUP_BYTES) {
    throw new Error("Download backup Google Drive tidak lengkap.");
  }
  return { file, blob };
}
