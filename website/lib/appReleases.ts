export type AppReleasePlatform = "windows" | "android";

export type AppRelease = {
  platform: AppReleasePlatform;
  label: string;
  version: string;
  fileName: string;
  objectKey: string;
  contentType: string;
  sha256: string;
  sizeBytes: number;
  available: boolean;
  downloadPath: string;
};

const DEFAULT_RELEASES: Record<
  AppReleasePlatform,
  Omit<AppRelease, "available" | "downloadPath">
> = {
  windows: {
    platform: "windows",
    label: "Windows 10/11 (64-bit)",
    version: "0.5.3",
    fileName: "ComePlayers_0.5.3_x64-setup.exe",
    objectKey: "app-releases/windows/0.5.3/ComePlayers_0.5.3_x64-setup.exe",
    contentType: "application/vnd.microsoft.portable-executable",
    sha256: "1059CDBC4681FD609A2CFC79736423EA04EFB15C13718F97106F85EEDDED99BF",
    sizeBytes: 4_165_396,
  },
  android: {
    platform: "android",
    label: "Android 8.0 or newer",
    version: "0.14.0 (21)",
    fileName: "ComePlayers_0.14.0_21_android.apk",
    objectKey: "app-releases/android/0.14.0-21/ComePlayers_0.14.0_21_android.apk",
    contentType: "application/vnd.android.package-archive",
    sha256: "DD038B571A44E2945BBC7B5509D4734C47396F5B1FF52006BC15C1503B5F5AD1",
    sizeBytes: 139_199_850,
  },
};

function clean(value: string | undefined, fallback: string) {
  return String(value || fallback).trim();
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAppRelease(platform: AppReleasePlatform): AppRelease {
  const fallback = DEFAULT_RELEASES[platform];
  const prefix = `COMEPLAYERS_${platform.toUpperCase()}_RELEASE`;
  const version = clean(process.env[`${prefix}_VERSION`], fallback.version);
  const fileName = clean(process.env[`${prefix}_FILENAME`], fallback.fileName);
  const objectKey = clean(process.env[`${prefix}_OBJECT_KEY`], fallback.objectKey);
  const sha256 = clean(process.env[`${prefix}_SHA256`], fallback.sha256).toUpperCase();
  const sizeBytes = positiveNumber(process.env[`${prefix}_SIZE_BYTES`], fallback.sizeBytes);
  const available = Boolean(version && fileName && objectKey && sha256 && sizeBytes);

  return {
    ...fallback,
    version,
    fileName,
    objectKey,
    sha256,
    sizeBytes,
    available,
    downloadPath: available
      ? `/api/downloads/${platform}/${encodeURIComponent(fileName)}`
      : "",
  };
}

export function formatReleaseSize(bytes: number) {
  if (!bytes) return "—";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
