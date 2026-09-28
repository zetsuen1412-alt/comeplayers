import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function uploader({ size, uploadStatus = 200 }) {
  const calls = [];
  class File {
    constructor(uri) { this.uri = uri; this.size = size; }
    async upload(url, options) {
      calls.push(['upload', url, options.httpMethod, options.headers]);
      options.onProgress?.({ bytesSent: size / 2, totalBytes: size });
      return { status: uploadStatus };
    }
  }
  const request = async (path, init) => {
    calls.push(['request', path, init?.method || 'GET']);
    if (path === '/api/messages/attachments') return { attachment: { id: 42, file_name: 'clip.mp4', mime_type: 'video/mp4', size_bytes: size }, upload: { url: 'https://r2.example/upload', headers: { 'Content-Type': 'video/mp4' } } };
    return { sizeBytes: size, mimeType: 'video/mp4' };
  };
  const legacy = async () => { calls.push(['legacy']); return { id: 43 }; };
  const source = readFileSync(new URL('../apps/mobile/src/chatAttachmentUpload.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const mod = { exports: {} };
  runInNewContext(outputText, { module: mod, exports: mod.exports, AbortController, setTimeout, clearTimeout,
    require(name) {
      if (name === 'expo-file-system') return { File };
      if (name === './api') return { request };
      if (name === './runtime') return { chatClient: { uploadAttachment: legacy } };
      throw Error(`Unexpected dependency: ${name}`);
    },
  });
  return { upload: mod.exports.uploadChatAttachment, calls };
}

test('mobile video uploads directly to R2 and is attached only after integrity approval', async () => {
  const { upload, calls } = uploader({ size: 25 * 1024 * 1024 });
  const progress = [];
  const attachment = await upload('room-1', { uri: 'file:///clip.mp4', name: 'clip.mp4', type: 'video/mp4' }, percent => progress.push(percent));
  assert.equal(attachment.id, 42);
  assert.equal(attachment.moderation_status, 'approved');
  assert.deepEqual(calls.map(call => call[0]), ['request', 'upload', 'request']);
  assert.equal(calls[1][2], 'PUT');
  assert.deepEqual(progress, [50]);
});

test('failed native video transfer never approves an attachment', async () => {
  const { upload, calls } = uploader({ size: 25 * 1024 * 1024, uploadStatus: 503 });
  await assert.rejects(upload('room-1', { uri: 'file:///clip.mp4', name: 'clip.mp4', type: 'video/mp4' }), /belum berhasil diunggah/);
  assert.deepEqual(calls.map(call => call[0]), ['request', 'upload']);
});

test('oversized video is rejected before preparing an upload', async () => {
  const { upload, calls } = uploader({ size: 100 * 1024 * 1024 + 1 });
  await assert.rejects(upload('room-1', { uri: 'file:///clip.mp4', name: 'clip.mp4', type: 'video/mp4' }), /100 MB/);
  assert.equal(calls.length, 0);
});
