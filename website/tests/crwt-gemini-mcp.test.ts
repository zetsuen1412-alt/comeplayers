import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/crwt-gemini-mcp/route";

const imageData = "test-image-response";

function toolRequest(name: string, args: Record<string, unknown>) {
  return new Request("http://localhost/api/crwt-gemini-mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

test("turnaround sends v1 enum values and preserves the reference image", async (t) => {
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only-gemini-key";
  t.after(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });
  const referenceUrl = "https://storage.googleapis.com/crwt-test/rindi.png";
  const referenceBytes = new Uint8Array([137, 80, 78, 71]);
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options?: RequestInit) => {
    calls.push(String(url));
    if (String(url) === referenceUrl) {
      const response = new Response(referenceBytes, {
        headers: { "content-type": "image/png" },
      });
      Object.defineProperty(response, "url", { value: referenceUrl });
      return response;
    }
    assert.equal(String(url), "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent");
    const body = JSON.parse(String(options?.body));
    // These are the documented generateContent enums; plain "16:9"/"4K" caused HTTP 400.
    assert.deepEqual(body.generationConfig.responseFormat.image, {
      aspectRatio: "ASPECT_RATIO_SIXTEEN_BY_NINE",
      imageSize: "IMAGE_SIZE_FOUR_K",
    });
    assert.deepEqual(body.generationConfig.responseModalities, ["TEXT", "IMAGE"]);
    assert.deepEqual(body.contents[0].parts[1].inline_data, {
      mime_type: "image/png", data: Buffer.from(referenceBytes).toString("base64"),
    });
    return Response.json({ candidates: [{ content: { parts: [
      { inlineData: { data: imageData, mimeType: "image/png" } },
    ] } }] });
  });
  const response = await POST(toolRequest("gemini_character_turnaround", {
    character_name: "Rindi", design_requirements: "Preserve pink twin-tails.",
    reference_image_url: referenceUrl, aspect_ratio: "16:9", image_size: "4K",
  }));
  const rpc = await response.json();
  assert.equal(response.status, 200);
  assert.equal(rpc.result.isError, undefined);
  assert.deepEqual(rpc.result.content, [{ type: "image", data: imageData, mimeType: "image/png" }]);
  assert.equal(calls.length, 2);
});

test("image generation defaults also use v1 enums", async (t) => {
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only-gemini-key";
  t.after(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });
  t.mock.method(globalThis, "fetch", async (_url: string, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body));
    assert.deepEqual(body.generationConfig.responseFormat.image, {
      aspectRatio: "ASPECT_RATIO_ONE_BY_ONE", imageSize: "IMAGE_SIZE_ONE_K",
    });
    return Response.json({ candidates: [{ content: { parts: [
      { inline_data: { data: imageData, mime_type: "image/png" } },
    ] } }] });
  });
  const rpc = await (await POST(toolRequest("gemini_generate_image", { prompt: "Test image" }))).json();
  assert.equal(rpc.result.isError, undefined);
  assert.equal(rpc.result.content[0].type, "image");
});

test("invalid image options fail before downloading references or using Gemini quota", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("Invalid options must not reach a network request");
  });
  for (const args of [{ aspect_ratio: "wide" }, { image_size: "8K" }, { aspect_ratio: "constructor" }]) {
    const rpc = await (await POST(toolRequest("gemini_generate_image", {
      prompt: "Test image", reference_image_url: "https://storage.googleapis.com/crwt-test/rindi.png", ...args,
    }))).json();
    assert.equal(rpc.result.isError, true);
    assert.match(rpc.result.content[0].text, /must be one of/);
  }
});
