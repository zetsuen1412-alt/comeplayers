import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  attachmentSignatureMatches,
  detectAttachmentMime,
  isR2StoragePath,
  r2ObjectKeyFromStoragePath,
  r2StoragePath,
  safeAttachmentName,
  validateAttachmentMetadata,
} from "../lib/chatAttachmentPolicy";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

test("V31 detects supported attachment signatures", () => {
  assert.equal(
    detectAttachmentMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])),
    "image/jpeg",
  );
  assert.equal(
    detectAttachmentMime(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    "image/png",
  );
  assert.equal(
    detectAttachmentMime(
      Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
      ]),
    ),
    "image/webp",
  );
  assert.equal(
    detectAttachmentMime(
      Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
    ),
    "image/gif",
  );
  assert.equal(
    detectAttachmentMime(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])),
    "application/pdf",
  );
  assert.equal(
    attachmentSignatureMatches(
      Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]),
      "image/png",
    ),
    false,
  );
});

test("V31 validates metadata and safe object paths", () => {
  assert.deepEqual(
    validateAttachmentMetadata({ mimeType: "image/png", sizeBytes: 123 }),
    { mimeType: "image/png", sizeBytes: 123 },
  );
  assert.throws(
    () => validateAttachmentMetadata({ mimeType: "text/html", sizeBytes: 123 }),
    /Only JPG/,
  );
  assert.throws(
    () => validateAttachmentMetadata({ mimeType: "image/png", sizeBytes: 0 }),
    /between 1 byte/,
  );
  assert.equal(safeAttachmentName("../../hello world.png"), "hello-world.png");
  assert.equal(r2StoragePath("chat/room/file.png"), "r2:chat/room/file.png");
  assert.equal(isR2StoragePath("r2:chat/room/file.png"), true);
  assert.equal(
    r2ObjectKeyFromStoragePath("r2:chat/room/file.png"),
    "chat/room/file.png",
  );
});

test("V31 keeps R2 credentials server-only and uses presigned PUT/GET URLs", () => {
  const env = read(".env.example");
  const r2 = read("lib/r2Server.ts");
  const uploadRoute = read("app/api/messages/attachments/route.ts");
  const accessRoute = read("app/api/messages/attachments/[id]/route.ts");
  const page = read("app/messages/page.tsx");

  assert.match(env, /R2_ACCOUNT_ID/);
  assert.match(env, /R2_ACCESS_KEY_ID/);
  assert.match(env, /R2_SECRET_ACCESS_KEY/);
  assert.equal(env.includes("NEXT_PUBLIC_R2_SECRET_ACCESS_KEY"), false);
  assert.match(r2, /PutObjectCommand/);
  assert.match(r2, /GetObjectCommand/);
  assert.match(r2, /getSignedUrl/);
  assert.match(uploadRoute, /moderation_status: "pending"/);
  assert.match(uploadRoute, /consumeRedisRateLimit/);
  assert.match(accessRoute, /inspectR2Object/);
  assert.match(accessRoute, /attachmentSignatureMatches/);
  assert.match(accessRoute, /supabase-legacy/);
  assert.match(uploadRoute, /legacyMultipartUpload/);
  assert.match(page, /new FormData\(\)/);
  assert.match(page, /body: formData/);
});
