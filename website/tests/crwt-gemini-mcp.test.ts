import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/crwt-gemini-mcp/route";

const imageData = "test-image-response";

// Actual one-pixel images, encoded locally as test fixtures. No user images,
// live keys, or external network calls are used by this suite.
const inlineFixtures = {
  "image/png": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPgEpEDAABoAD1UCKP3AAAAAElFTkSuQmCC",
  "image/jpeg": "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDxGiiitjI//9k=",
  "image/webp": "UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoBAAEAAUAmJZQCdAFAAAD+/DeBV/fU6D4r4AAA",
};

function mockGeminiKey(t: import("node:test").TestContext) {
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only-gemini-key";
  t.after(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });
}

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

for (const name of ["gemini_analyze_reference", "gemini_generate_image", "gemini_character_turnaround"]) {
  for (const [mime, data] of Object.entries(inlineFixtures)) {
    test(`${name} passes an inline ${mime} reference directly to Gemini`, async (t) => {
      mockGeminiKey(t);
      let calls = 0;
      t.mock.method(globalThis, "fetch", async (url: string, options?: RequestInit) => {
        calls++;
        assert.match(String(url), /^https:\/\/generativelanguage\.googleapis\.com\/v1\/models\//);
        const body = JSON.parse(String(options?.body));
        const reference = body.contents[0].parts.find((part: { inline_data?: unknown }) => part.inline_data);
        assert.deepEqual(reference.inline_data, { mime_type: mime, data });
        if (name === "gemini_character_turnaround") {
          assert.match(body.contents[0].parts[0].text, /Alexia/);
          assert.match(body.contents[0].parts[0].text, /Blue eyes/);
          assert.deepEqual(body.generationConfig.responseFormat.image, {
            aspectRatio: "ASPECT_RATIO_FOUR_BY_THREE", imageSize: "IMAGE_SIZE_ONE_K",
          });
        }
        return Response.json({ candidates: [{ content: { parts: [
          { text: "Offline analysis." },
          { inlineData: { data: imageData, mimeType: "image/png" } },
        ] } }] });
      });
      const rpc = await (await POST(toolRequest(name, {
        prompt: "Analyze or render this character.",
        character_name: "Alexia", design_requirements: "Blue eyes.",
        reference_image_base64: data, reference_image_mime_type: mime,
      }))).json();
      assert.equal(rpc.result.isError, undefined);
      assert.equal(calls, 1, "Inline input must not trigger a reference URL download");
    });
  }
}

test("invalid inline data and conflicting references fail before any network call", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    assert.fail("Invalid references must not reach the network");
  });
  const png = inlineFixtures["image/png"];
  const zeroWidthPng = Buffer.from(png, "base64");
  zeroWidthPng.writeUInt32BE(0, 16);
  const invalidWebp = Buffer.from(inlineFixtures["image/webp"], "base64");
  invalidWebp.writeUInt32LE(1, 4);
  const truncatedWebp = Buffer.from(inlineFixtures["image/webp"], "base64");
  truncatedWebp.writeUInt32LE(10000, 16);
  const spoofedPng = Buffer.from(png, "base64");
  spoofedPng[12] |= 0x80;
  const cases: Array<{ args: Record<string, unknown>; error: RegExp }> = [
    { args: { reference_image_base64: "bad!", reference_image_mime_type: "image/png" }, error: /canonical base64/ },
    { args: { reference_image_base64: "AB==", reference_image_mime_type: "image/png" }, error: /canonical base64/ },
    { args: { reference_image_base64: "data:image/png;base64," + png, reference_image_mime_type: "image/png" }, error: /canonical base64/ },
    { args: { reference_image_base64: " " + png, reference_image_mime_type: "image/png" }, error: /canonical base64/ },
    { args: { reference_image_base64: "", reference_image_mime_type: "image/png" }, error: /is required/ },
    { args: { reference_image_base64: 123, reference_image_mime_type: "image/png" }, error: /must be a string/ },
    { args: { reference_image_base64: png }, error: /mime_type is required/ },
    { args: { reference_image_mime_type: "image/png" }, error: /base64 is required/ },
    { args: { reference_image_base64: png, reference_image_mime_type: "image/gif" }, error: /must be image\/png/ },
    { args: { reference_image_base64: png, reference_image_mime_type: "image/jpeg" }, error: /does not match/ },
    { args: { reference_image_base64: "iVBORw==", reference_image_mime_type: "image/png" }, error: /truncated header/ },
    { args: { reference_image_base64: "/9j/2Q==", reference_image_mime_type: "image/jpeg" }, error: /truncated header/ },
    { args: { reference_image_base64: zeroWidthPng.toString("base64"), reference_image_mime_type: "image/png" }, error: /does not match/ },
    { args: { reference_image_base64: spoofedPng.toString("base64"), reference_image_mime_type: "image/png" }, error: /does not match/ },
    { args: { reference_image_base64: invalidWebp.toString("base64"), reference_image_mime_type: "image/webp" }, error: /does not match/ },
    { args: { reference_image_base64: truncatedWebp.toString("base64"), reference_image_mime_type: "image/webp" }, error: /does not match/ },
    { args: { reference_image_base64: "A".repeat(4194308), reference_image_mime_type: "image/png" }, error: /larger than 3 MiB/ },
    { args: { reference_image_url: "https://storage.googleapis.com/crwt-test/alexia.png", reference_image_base64: png, reference_image_mime_type: "image/png" }, error: /not both/ },
    { args: { reference_image_url: "", reference_image_base64: png, reference_image_mime_type: "image/png" }, error: /not both/ },
    { args: { reference_image_url: "" }, error: /must not be empty/ },
  ];
  for (const name of ["gemini_analyze_reference", "gemini_generate_image", "gemini_character_turnaround"]) {
    for (const scenario of cases) {
      const rpc = await (await POST(toolRequest(name, {
        prompt: "Test", character_name: "Alexia", design_requirements: "Blue eyes.",
        ...scenario.args,
      }))).json();
      assert.equal(rpc.result.isError, true);
      assert.match(rpc.result.content[0].text, scenario.error);
      assert.ok(!rpc.result.content[0].text.includes(png), "Errors must not echo image data");
    }
  }
  assert.equal(calls, 0);
});

test("turnaround requires a reference while text-only analysis remains available", async (t) => {
  mockGeminiKey(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, options?: RequestInit) => {
    calls++;
    const body = JSON.parse(String(options?.body));
    assert.deepEqual(body.contents[0].parts, [{ text: "Test analysis" }]);
    return Response.json({ candidates: [{ content: { parts: [{ text: "Offline analysis." }] } }] });
  });
  const missing = await (await POST(toolRequest("gemini_character_turnaround", {
    character_name: "Alexia", design_requirements: "Blue eyes.",
  }))).json();
  assert.equal(missing.result.isError, true);
  assert.match(missing.result.content[0].text, /reference image is required/);
  assert.equal(calls, 0);
  const analysis = await (await POST(toolRequest("gemini_analyze_reference", { prompt: "Test analysis" }))).json();
  assert.equal(analysis.result.isError, undefined);
  assert.equal(calls, 1);
});

test("tools/list advertises paired inline inputs and the exact-one turnaround source requirement", async () => {
  const request = new Request("http://localhost/api/crwt-gemini-mcp", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const rpc = await (await POST(request)).json();
  for (const tool of rpc.result.tools.filter((entry: { name: string }) => entry.name !== "gemini_status")) {
    const schema = tool.inputSchema;
    assert.equal(schema.properties.reference_image_base64.maxLength, 4194304);
    assert.deepEqual(schema.properties.reference_image_mime_type.enum, ["image/png", "image/jpeg", "image/webp"]);
    assert.ok(schema.oneOf.some((source: { required?: string[] }) =>
      source.required?.includes("reference_image_base64") && source.required?.includes("reference_image_mime_type")));
    if (tool.name === "gemini_character_turnaround") {
      assert.equal(schema.oneOf.length, 2);
      assert.deepEqual(schema.required, ["character_name", "design_requirements"]);
    } else assert.equal(schema.oneOf.length, 3);
  }
});

test("an oversized Gemini output becomes a safe small tool error", async (t) => {
  mockGeminiKey(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ candidates: [{ content: { parts: [
      { inlineData: { data: "a".repeat(4 * 1024 * 1024), mimeType: "image/png" } },
    ] } }] });
  });
  const response = await POST(toolRequest("gemini_generate_image", { prompt: "Test image" }));
  const text = await response.text();
  const rpc = JSON.parse(text);
  assert.equal(rpc.result.isError, true);
  assert.match(rpc.result.content[0].text, /too large/);
  assert.ok(Buffer.byteLength(text, "utf8") < 1024);
  assert.equal(calls, 1);
});
