// One-shot release operator for the verified ComePlayers Android 0.14.0 (21) APK.
// It is intentionally idempotent and refuses any byte mismatch.
import { createHash } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const release = {
  source: "https://expo.dev/artifacts/eas/StRy0kYnmjs-XkNZKW48--6RpBvbtStMGlbUoWy_MQ4.apk",
  key: "app-releases/android/0.14.0-21/ComePlayers_0.14.0_21_android.apk",
  fileName: "ComePlayers_0.14.0_21_android.apk",
  size: 139199850,
  sha256: "dd038b571a44e2945bbc7b5509d4734c47396f5b1ff52006bc15c1503b5f5ad1",
  contentType: "application/vnd.android.package-archive",
};

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error("Missing release storage configuration.");
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
    if (size > release.size) throw new Error("Release exceeds the verified size.");
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
  const send = (command) => client.send(command, { abortSignal: AbortSignal.timeout(240000) });

  let exists = false;
  try {
    const head = await send(new HeadObjectCommand(object));
    if (Number(head.ContentLength) !== release.size) throw new Error("An incompatible Android 21 object already exists.");
    exists = true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode !== 404) throw error;
  }

  if (!exists) {
    const response = await fetch(release.source, { signal: AbortSignal.timeout(240000) });
    const final = new URL(response.url);
    if (!response.ok || !["expo.dev", "wf-artifacts.eascdn.net"].includes(final.hostname)) {
      await response.body?.cancel();
      throw new Error("Verified Expo artifact is unavailable.");
    }
    const bytes = await verifyBody(response.body, true);
    try {
      await send(new PutObjectCommand({
        ...object,
        Body: bytes,
        ContentLength: release.size,
        ContentType: release.contentType,
        ContentDisposition: 'attachment; filename="' + release.fileName + '"',
        ContentMD5: createHash("md5").update(bytes).digest("base64"),
        CacheControl: "private, no-store, max-age=0",
        IfNoneMatch: "*",
        Metadata: {
          platform: "android",
          version: "0.14.0",
          "version-code": "21",
          sha256: release.sha256,
          "eas-build-id": "1591d5d5-9f27-4579-9f36-5d36ed951ba7",
        },
      }));
    } catch (error) {
      if (error?.$metadata?.httpStatusCode !== 412) throw error;
    }
  }

  const stored = await send(new GetObjectCommand(object));
  await verifyBody(stored.Body);
  console.log(JSON.stringify({
    status: "verified",
    key: release.key,
    sizeBytes: release.size,
    sha256: release.sha256,
    version: "0.14.0",
    versionCode: 21,
  }));
  client.destroy();
}

main().catch((error) => {
  console.error("Android 0.14.0 (21) staging failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
