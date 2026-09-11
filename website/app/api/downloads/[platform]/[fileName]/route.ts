import { NextResponse } from "next/server";
import {
  getAppRelease,
  type AppReleasePlatform,
} from "@/lib/appReleases";
import { createR2DownloadUrl, inspectR2Object } from "@/lib/r2Server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ platform: string; fileName: string }>;
};

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
};

function isPlatform(value: string): value is AppReleasePlatform {
  return value === "windows" || value === "android";
}

export async function GET(request: Request, context: RouteContext) {
  const { platform, fileName } = await context.params;
  if (!isPlatform(platform)) {
    return NextResponse.json({ error: "Unsupported app platform." }, { status: 404 });
  }

  const release = getAppRelease(platform);
  if (!release.available || decodeURIComponent(fileName) !== release.fileName) {
    return NextResponse.json(
      { error: "This ComePlayers release is not available yet." },
      { status: 404, headers: NO_STORE },
    );
  }

  try {
    const object = await inspectR2Object(release.objectKey);
    if (object.contentLength !== release.sizeBytes) {
      throw new Error("Published release size does not match its manifest.");
    }

    const signedUrl = await createR2DownloadUrl({
      objectKey: release.objectKey,
      fileName: release.fileName,
      contentType: release.contentType,
      disposition: "attachment",
      expiresIn: 300,
    });

    return NextResponse.redirect(new URL(signedUrl, request.url), {
      status: 307,
      headers: NO_STORE,
    });
  } catch (error) {
    console.error(`[app-download:${platform}] Release unavailable`, error);
    return NextResponse.json(
      { error: "The installer is temporarily unavailable. Please try again shortly." },
      { status: 503, headers: NO_STORE },
    );
  }
}
