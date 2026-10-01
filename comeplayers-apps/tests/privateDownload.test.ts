import test from "node:test";
import assert from "node:assert/strict";
import { readExactBytes } from "../apps/mobile/src/secure/boundedDownload";
import { MAX_SECURE_ATTACHMENT } from "../apps/mobile/src/secure/secureAttachment";

test("encrypted downloads enforce authenticated size with and without Content-Length", async () => {
  assert.deepEqual(await readExactBytes(new Response(new Uint8Array([1, 2, 3])), 3), new Uint8Array([1, 2, 3]));
  await assert.rejects(readExactBytes(new Response(new Uint8Array([1, 2])), 3), /incomplete/);
  await assert.rejects(readExactBytes(new Response(new Uint8Array([1, 2, 3, 4])), 3), /exceeds/);
  await assert.rejects(readExactBytes(new Response(new Uint8Array(3), { headers: { "content-length": "1000000000" } }), 3), /does not match/);
  await assert.rejects(readExactBytes(new Response(), MAX_SECURE_ATTACHMENT + 41), /Invalid attachment size/);
});
test("oversized stream is cancelled before reading its remaining chunks", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(10)); }, cancel() { cancelled = true; } });
  await assert.rejects(readExactBytes(new Response(stream), 3), /exceeds/);
  assert.equal(cancelled, true);
});
test("a stalled encrypted download times out and cancels its reader", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(readExactBytes(new Response(stream), 1, 10), /timed out/);
  assert.equal(cancelled, true);
});
