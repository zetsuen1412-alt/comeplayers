import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type R2Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

let cachedClient: S3Client | null = null;
let cachedSignature = "";

function readR2Config(): R2Config {
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const endpoint = String(
    process.env.R2_ENDPOINT ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : ""),
  )
    .trim()
    .replace(/\/$/, "");
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucket = String(process.env.R2_BUCKET_NAME || "").trim();

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Cloudflare R2 is not configured.");
  }
  return { endpoint, accessKeyId, secretAccessKey, bucket };
}

export function isR2Configured() {
  try {
    readR2Config();
    return true;
  } catch {
    return false;
  }
}

function clientAndBucket() {
  const config = readR2Config();
  const signature = [
    config.endpoint,
    config.accessKeyId,
    config.secretAccessKey,
    config.bucket,
  ].join("|");
  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedSignature = signature;
  }
  return { client: cachedClient, bucket: config.bucket };
}

export async function createR2UploadUrl(input: {
  objectKey: string;
  contentType: string;
  expiresIn?: number;
}) {
  const { client, bucket } = clientAndBucket();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
    }),
    { expiresIn: Math.max(30, Math.min(300, input.expiresIn || 90)) },
  );
}

export async function createR2DownloadUrl(input: {
  objectKey: string;
  fileName: string;
  contentType: string;
  expiresIn?: number;
  disposition?: "inline" | "attachment";
}) {
  const { client, bucket } = clientAndBucket();
  const safeName = input.fileName.replace(/["\\\r\n]/g, "_");
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: input.objectKey,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: `${input.disposition || "inline"}; filename="${safeName}"`,
      ResponseCacheControl: "private, max-age=0, no-store",
    }),
    { expiresIn: Math.max(30, Math.min(3600, input.expiresIn || 120)) },
  );
}

export async function putR2Object(input: {
  objectKey: string;
  contentType: string;
  body: Uint8Array;
}) {
  const { client, bucket } = clientAndBucket();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.objectKey,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: "private, max-age=0, no-store",
    }),
  );
}

export async function inspectR2Object(objectKey: string) {
  const { client, bucket } = clientAndBucket();
  const head = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }),
  );
  const sample = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Range: "bytes=0-15",
    }),
  );
  if (!sample.Body || typeof sample.Body.transformToByteArray !== "function") {
    throw new Error("Could not inspect the uploaded attachment.");
  }
  return {
    contentLength: Number(head.ContentLength || 0),
    contentType: String(head.ContentType || "").split(";")[0].trim().toLowerCase(),
    sample: await sample.Body.transformToByteArray(),
    etag: String(head.ETag || "").replace(/^"|"$/g, ""),
  };
}

export async function deleteR2Object(objectKey: string) {
  const { client, bucket } = clientAndBucket();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }),
  );
}
