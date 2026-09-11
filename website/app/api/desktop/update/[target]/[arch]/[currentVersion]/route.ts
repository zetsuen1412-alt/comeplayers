import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    target: string;
    arch: string;
    currentVersion: string;
  }>;
};

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

function cleanVersion(value: string) {
  return String(value || "").trim().replace(/^v/i, "");
}

function parseVersion(value: string) {
  const [core] = cleanVersion(value).split(/[+-]/);
  const parts = core.split(".").map((part) => Number(part));
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function compareVersions(nextVersion: string, currentVersion: string) {
  const next = parseVersion(nextVersion);
  const current = parseVersion(currentVersion);
  if (!next || !current) return 1;

  for (let index = 0; index < 3; index += 1) {
    if (next[index] > current[index]) return 1;
    if (next[index] < current[index]) return -1;
  }

  return 0;
}

function cleanPlatformPart(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function platformEnv(platform: string, suffix: "URL" | "SIGNATURE") {
  const platformKey = platform.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const key = `COMEPLAYERS_DESKTOP_UPDATE_${platformKey}_${suffix}`;
  return String(
    process.env[key] || process.env[`COMEPLAYERS_DESKTOP_UPDATE_${suffix}`] || ""
  ).trim();
}

export async function GET(_request: Request, context: RouteContext) {
  const { target, arch, currentVersion } = await context.params;
  const platform = `${cleanPlatformPart(target)}-${cleanPlatformPart(arch)}`;
  const version = cleanVersion(process.env.COMEPLAYERS_DESKTOP_UPDATE_VERSION || "");
  const url = platformEnv(platform, "URL");
  const signature = platformEnv(platform, "SIGNATURE");

  if (!version || !url || !signature || compareVersions(version, currentVersion) <= 0) {
    return new Response(null, { status: 204, headers: NO_STORE });
  }

  return NextResponse.json(
    {
      version,
      notes: process.env.COMEPLAYERS_DESKTOP_UPDATE_NOTES || "Latest ComePlayers update.",
      pub_date:
        process.env.COMEPLAYERS_DESKTOP_UPDATE_PUB_DATE || new Date().toISOString(),
      url,
      signature,
    },
    { headers: NO_STORE }
  );
}
