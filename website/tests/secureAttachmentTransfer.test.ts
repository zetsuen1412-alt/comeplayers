import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SECURE_ATTACHMENT } from "../lib/e2ee/secureAttachment";
import { readExactBytes } from "../lib/e2ee/historySync";

function streamed(chunks: Uint8Array[], headers?: HeadersInit) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }), { headers });
}

test("encrypted media accepts an 8 MiB file without reading beyond the declared size", async () => {
  const expected = MAX_SECURE_ATTACHMENT + 40;
  const downloaded = await readExactBytes(
    streamed([new Uint8Array(expected - 1), Uint8Array.of(42)]),
    expected,
  );
  assert.equal(downloaded.length, expected);
  assert.equal(downloaded.at(-1), 42);
});

test("encrypted media rejects oversized, truncated, and dishonest transfers", async () => {
  await assert.rejects(
    readExactBytes(streamed([]), MAX_SECURE_ATTACHMENT + 41),
    /Invalid encrypted attachment size/,
  );
  await assert.rejects(
    readExactBytes(streamed([new Uint8Array(40)]), 41),
    /incomplete/,
  );
  await assert.rejects(
    readExactBytes(streamed([new Uint8Array(42)]), 41),
    /exceeds the expected size/,
  );
  await assert.rejects(
    readExactBytes(streamed([new Uint8Array(41)], { "Content-Length": "42" }), 41),
    /size does not match/,
  );
});
