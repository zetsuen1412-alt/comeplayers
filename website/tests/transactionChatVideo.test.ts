import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  CHAT_STANDARD_ATTACHMENT_MAX_BYTES,
  CHAT_VIDEO_ATTACHMENT_MAX_BYTES,
  detectAttachmentMime,
  validateAttachmentMetadata,
} from "../lib/chatAttachmentPolicy";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

test("transaction chat validates MP4, WebM, and MOV video containers", () => {
  assert.equal(
    detectAttachmentMime(
      Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
    ),
    "video/mp4",
  );
  assert.equal(
    detectAttachmentMime(
      Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]),
    ),
    "video/quicktime",
  );
  assert.equal(
    detectAttachmentMime(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])),
    "video/webm",
  );
});

test("transaction chat keeps images small while allowing practical video uploads", () => {
  assert.deepEqual(
    validateAttachmentMetadata({
      mimeType: "video/mp4",
      sizeBytes: CHAT_VIDEO_ATTACHMENT_MAX_BYTES,
    }),
    { mimeType: "video/mp4", sizeBytes: CHAT_VIDEO_ATTACHMENT_MAX_BYTES },
  );
  assert.throws(
    () =>
      validateAttachmentMetadata({
        mimeType: "video/mp4",
        sizeBytes: CHAT_VIDEO_ATTACHMENT_MAX_BYTES + 1,
      }),
    /100 MB/,
  );
  assert.throws(
    () =>
      validateAttachmentMetadata({
        mimeType: "image/png",
        sizeBytes: CHAT_STANDARD_ATTACHMENT_MAX_BYTES + 1,
      }),
    /10 MB/,
  );
});

test("buyer and seller chat uses the dedicated page with direct video playback", () => {
  const chat = read("app/chat/ChatClient.tsx");
  const styles = read("app/chat/chat.module.css");
  const marketplace = read("components/marketplace/ProductVariantPurchase.tsx");
  const messages = read("app/messages/page.tsx");
  const attachmentRoute = read("app/api/messages/attachments/[id]/route.ts");

  assert.match(chat, /SecureDirectConversation/);
  const secureView = read("components/messages/SecureConversationView.tsx");
  assert.match(secureView, /<video controls/);
  assert.match(secureView, /video\/mp4/);
  assert.match(read("lib/e2ee/webMessenger.ts"), /history\.sendAttachment/);
  assert.match(styles, /\.videoAttachment[\s\S]*?object-fit: contain/);
  assert.match(marketplace, /href=\{`\/chat\?seller=/);
  assert.doesNotMatch(marketplace, /href=\{`\/messages\?seller=/);
  assert.match(messages, /function openRoom\(room: Room\)[\s\S]*?router\.push\(`\/chat\?room=/);
  assert.match(messages, /router\.replace\(`\/chat\?\$\{transactionParams\.toString\(\)\}`\)/);
  assert.match(attachmentRoute, /isVideoAttachmentMime\(mimeType\) \? 1800 : 120/);
});
