// Operator-only: run explicitly with --publish in the existing release environment.
// This stages a previously signature-verified APK; it does not reset E2EE or deploy the website.
import { createHash } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const release = {
  source: "https://expo.dev/artifacts/eas/bE3ODZNLfCl8QJkEcJhljzoWmTDVyt-ua-HDfcZLd9w.apk",
  key: "app-releases/android/0.13.0-19/ComePlayers_0.13.0_19_android.apk",
  fileName: "ComePlayers_0.13.0_19_android.apk",
  size: 138750410,
  sha256: "b9f1a31f63a51d0d95512c5668fd7a2492a9c85dd94ff5af30208b3fa066fb9d",
  contentType: "application/vnd.android.package-archive",
};

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error("Missing release environment configuration.");
  return value;
}

async function verifyBody(body, retain = false) {
  if (!body) throw new Error("Release body is missing.");
  const hash = createHash("sha256");
  const chunks = [];
  let size = 0;
  for await (const chunk of body) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > release.size) throw new Error("Release exceeds the approved size.");
    hash.update(bytes);
    if (retain) chunks.push(bytes);
  }
  if (size !== release.size || hash.digest("hex") !== release.sha256) {
    throw new Error("Release size or SHA-256 verification failed.");
  }
  return retain ? Buffer.concat(chunks, size) : undefined;
}

async function main() {
  if (process.argv[2] !== "--publish") throw new Error("Explicit --publish is required.");
  const endpoint = required("R2_ENDPOINT");
  const target = new URL(endpoint);
  if (target.protocol !== "https:" || !target.hostname.endsWith(".r2.cloudflarestorage.com")) {
    throw new Error("Unexpected release storage endpoint.");
  }
  const client = new S3Client({
    region: "auto",
    endpoint,
    maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
  const object = { Bucket: required("R2_BUCKET_NAME"), Key: release.key };
  const send = (command) => client.send(command, { abortSignal: AbortSignal.timeout(180000) });
  let exists = false;
  try {
    const head = await send(new HeadObjectCommand(object));
    if (head.ContentLength !== release.size) throw new Error("An incompatible object already exists.");
    exists = true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode !== 404) throw error;
  }
  if (!exists) {
    const response = await fetch(release.source, { signal: AbortSignal.timeout(180000) });
    const host = new URL(response.url).hostname;
    if (!response.ok || !["expo.dev", "wf-artifacts.eascdn.net"].includes(host)) {
      await response.body?.cancel();
      throw new Error("Approved Expo artifact is unavailable.");
    }
    const body = await verifyBody(response.body, true);
    try {
      await send(new PutObjectCommand({
        ...object,
        Body: body,
        ContentLength: release.size,
        ContentType: release.contentType,
        ContentDisposition: 'attachment; filename="' + release.fileName + '"',
        ContentMD5: createHash("md5").update(body).digest("base64"),
        CacheControl: "private, no-store, max-age=0",
        IfNoneMatch: "*",
        Metadata: { platform: "android", version: "0.13.0", "version-code": "19", sha256: release.sha256 },
      }));
    } catch (error) {
      // A concurrent publisher must still prove the existing bytes match below.
      if (error?.$metadata?.httpStatusCode !== 412) throw error;
    }
  }
  const stored = await send(new GetObjectCommand(object));
  await verifyBody(stored.Body);
  console.log(JSON.stringify({ status: "verified", key: release.key, sizeBytes: release.size, sha256: release.sha256 }));
  client.destroy();
}

main().catch(() => {
  // Do not print SDK errors: they can contain storage identifiers or signed URLs.
  console.error("Android build 19 staging failed; the website must not be promoted.");
  process.exitCode = 1;
});
