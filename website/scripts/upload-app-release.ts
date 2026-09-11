import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local"), override: false });

type Platform = "windows" | "android";

function required(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function parsePlatform(value: string | undefined): Platform {
  if (value === "windows" || value === "android") return value;
  throw new Error("Platform must be windows or android.");
}

async function sha256(filePath: string) {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  return hash.digest("hex").toUpperCase();
}

async function main() {
  const platform = parsePlatform(process.argv[2]);
  const filePath = path.resolve(requiredArgument(3, "release file"));
  const version = requiredArgument(4, "release version");
  const file = await stat(filePath);
  if (!file.isFile() || file.size <= 0) throw new Error("Release file is empty or missing.");

  const accountId = required("R2_ACCOUNT_ID");
  const endpoint = String(
    process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
  ).replace(/\/$/, "");
  const bucket = required("R2_BUCKET_NAME");
  const fileName = path.basename(filePath);
  const objectKey = `app-releases/${platform}/${version}/${fileName}`;
  const contentType =
    platform === "windows"
      ? "application/vnd.microsoft.portable-executable"
      : "application/vnd.android.package-archive";
  const digest = await sha256(filePath);

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: createReadStream(filePath),
      ContentLength: file.size,
      ContentType: contentType,
      CacheControl: "private, no-store, max-age=0",
      Metadata: {
        platform,
        version,
        sha256: digest,
      },
    }),
  );

  process.stdout.write(
    `${JSON.stringify({ platform, version, fileName, objectKey, sizeBytes: file.size, sha256: digest }, null, 2)}\n`,
  );
}

function requiredArgument(index: number, label: string) {
  const value = String(process.argv[index] || "").trim();
  if (!value) throw new Error(`Missing ${label}.`);
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
