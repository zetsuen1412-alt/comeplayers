export const runtime = "nodejs";
export const maxDuration = 60;

const SERVER_NAME = "crazy-rich-gemini";
const SERVER_VERSION = "0.2.0";
const MODERN_PROTOCOL = "2026-07-28";
const LEGACY_PROTOCOL = "2025-11-25";

type RpcId = string | number | null;
type JsonObject = Record<string, unknown>;
type ToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  isError?: boolean;
};

type GeminiPart = {
  text?: string;
  inlineData?: { data?: string; mimeType?: string };
  inline_data?: { data?: string; mime_type?: string };
};

type ReferenceImagePart = {
  inline_data: { data: string; mime_type: string };
};

// Base64 adds one third to the byte size. Keep inline requests below Vercel's
// 4.5 MB payload limit, leaving room for the prompt and JSON-RPC envelope.
const MAX_INLINE_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_INLINE_IMAGE_BASE64 = 4 * Math.ceil(MAX_INLINE_IMAGE_BYTES / 3);
const MAX_JSON_RESPONSE_BYTES = 4 * 1024 * 1024;

const REFERENCE_IMAGE_PROPERTIES = {
  reference_image_url: { type: "string", format: "uri", minLength: 1 },
  reference_image_base64: {
    type: "string",
    minLength: 1,
    maxLength: MAX_INLINE_IMAGE_BASE64,
    description: "Raw canonical base64 of a local PNG, JPEG, or WebP image, up to 3 MiB. Do not include a data URL prefix.",
  },
  reference_image_mime_type: {
    type: "string",
    enum: ["image/png", "image/jpeg", "image/webp"],
  },
} as const;

const REQUIRED_REFERENCE_IMAGE_SOURCES = [
  {
    required: ["reference_image_url"],
    not: {
      anyOf: [
        { required: ["reference_image_base64"] },
        { required: ["reference_image_mime_type"] },
      ],
    },
  },
  {
    required: ["reference_image_base64", "reference_image_mime_type"],
    not: { required: ["reference_image_url"] },
  },
] as const;

const OPTIONAL_REFERENCE_IMAGE_SOURCES = [
  ...REQUIRED_REFERENCE_IMAGE_SOURCES,
  {
    not: {
      anyOf: [
        { required: ["reference_image_url"] },
        { required: ["reference_image_base64"] },
        { required: ["reference_image_mime_type"] },
      ],
    },
  },
] as const;

const DEFAULT_ALLOWED_IMAGE_HOSTS = [
  "oaiusercontent.com",
  "openaiusercontent.com",
  "files.openai.com",
  "d2ol7oe51mr4n9.cloudfront.net",
  "googleusercontent.com",
  "storage.googleapis.com",
];

// generateContent v1 uses protobuf enum names, unlike the Interactions API.
const IMAGE_ASPECT_RATIOS: Record<string, string> = {
  "1:1": "ASPECT_RATIO_ONE_BY_ONE",
  "4:3": "ASPECT_RATIO_FOUR_BY_THREE",
  "3:4": "ASPECT_RATIO_THREE_BY_FOUR",
  "16:9": "ASPECT_RATIO_SIXTEEN_BY_NINE",
  "9:16": "ASPECT_RATIO_NINE_BY_SIXTEEN",
};
const IMAGE_SIZES: Record<string, string> = {
  "1K": "IMAGE_SIZE_ONE_K",
  "2K": "IMAGE_SIZE_TWO_K",
  "4K": "IMAGE_SIZE_FOUR_K",
};

function allowedImageHosts() {
  const extra = (process.env.CRWT_GEMINI_ALLOWED_IMAGE_HOSTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED_IMAGE_HOSTS, ...extra])];
}

function hostAllowed(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return allowedImageHosts().some(
    (allowed) => host === allowed || host.endsWith("." + allowed),
  );
}

function json(data: unknown, status = 200) {
  const serialized = JSON.stringify(data) ?? "null";
  if (Buffer.byteLength(serialized, "utf8") > MAX_JSON_RESPONSE_BYTES) {
    throw new Error("Gemini response is too large for this connector. Request a smaller image size.");
  }
  return new Response(serialized, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function rpcResult(id: RpcId, result: unknown) {
  return json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: RpcId, code: number, message: string, data?: unknown) {
  return json({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  });
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function textArg(args: JsonObject, name: string, required = false) {
  const value = args[name];
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(name + " is required.");
    return "";
  }
  if (typeof value !== "string") throw new Error(name + " must be a string.");
  return value.trim();
}

function stringArrayArg(args: JsonObject, name: string) {
  const value = args[name];
  if (value === undefined) return [] as string[];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(name + " must be an array of strings.");
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function inlineImagePart(args: JsonObject): ReferenceImagePart {
  const data = textArg(args, "reference_image_base64", true);
  const mimeType = textArg(args, "reference_image_mime_type", true);
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    throw new Error("reference_image_mime_type must be image/png, image/jpeg, or image/webp.");
  }
  if (data.length > MAX_INLINE_IMAGE_BASE64) {
    throw new Error("Inline reference image is larger than 3 MiB.");
  }
  if (data !== args.reference_image_base64) {
    throw new Error("reference_image_base64 must be canonical base64 without a data URL prefix.");
  }
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.toString("base64") !== data) {
    throw new Error("reference_image_base64 must be canonical base64 without a data URL prefix.");
  }
  if (bytes.length > MAX_INLINE_IMAGE_BYTES) {
    throw new Error("Inline reference image is larger than 3 MiB.");
  }

  // Validate the declared format against the file header; no decoder or SDK
  // dependency is needed to catch mislabeled files and truncated headers.
  const png =
    bytes.length >= 33 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.toString("latin1", 12, 16) === "IHDR" &&
    bytes.readUInt32BE(16) > 0 &&
    bytes.readUInt32BE(20) > 0;
  const jpeg =
    bytes.length >= 12 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  const webp =
    bytes.length >= 20 &&
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.readUInt32LE(4) + 8 === bytes.length &&
    bytes.toString("latin1", 8, 12) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("latin1", 12, 16)) &&
    bytes.readUInt32LE(16) > 0 &&
    20 + bytes.readUInt32LE(16) + (bytes.readUInt32LE(16) & 1) <= bytes.length;
  const matchesMime =
    (mimeType === "image/png" && png) ||
    (mimeType === "image/jpeg" && jpeg) ||
    (mimeType === "image/webp" && webp);
  if (!matchesMime) {
    throw new Error("Inline reference image does not match its MIME type or has a truncated header.");
  }
  return { inline_data: { mime_type: mimeType, data } };
}

async function referenceImagePart(args: JsonObject, required = false) {
  const imageUrl = textArg(args, "reference_image_url");
  const hasUrl = args.reference_image_url !== undefined;
  const hasInline =
    args.reference_image_base64 !== undefined ||
    args.reference_image_mime_type !== undefined;
  if (hasUrl && hasInline) {
    throw new Error("Provide either reference_image_url or inline reference image fields, not both.");
  }
  if (hasInline) return inlineImagePart(args);
  if (imageUrl) return loadReferenceImage(imageUrl);
  if (hasUrl) throw new Error("reference_image_url must not be empty.");
  if (required) throw new Error("A character reference image is required.");
  return undefined;
}

async function loadReferenceImage(urlValue: string) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:") {
    throw new Error("reference_image_url must use HTTPS.");
  }
  if (!hostAllowed(url.hostname)) {
    throw new Error(
      "Image host is not allowlisted. Add it to CRWT_GEMINI_ALLOWED_IMAGE_HOSTS in Vercel if it is trusted.",
    );
  }

  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: { "user-agent": "CRWT-Gemini-MCP/0.1" },
  });
  if (!response.ok) {
    throw new Error("Could not download reference image: HTTP " + response.status);
  }

  const finalUrl = new URL(response.url);
  if (!hostAllowed(finalUrl.hostname)) {
    throw new Error("Reference image redirected to a non-allowlisted host.");
  }

  const contentType = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new Error("Reference URL did not return an image.");
  }

  const declaredLength = Number(response.headers.get("content-length") || "0");
  if (declaredLength > 15 * 1024 * 1024) {
    throw new Error("Reference image is larger than 15 MB.");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 15 * 1024 * 1024) {
    throw new Error("Reference image is larger than 15 MB.");
  }

  return {
    inline_data: {
      mime_type: contentType || "image/png",
      data: bytes.toString("base64"),
    },
  };
}

function geminiKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not configured in Vercel. Add it as an encrypted environment variable and redeploy.",
    );
  }
  return key;
}

async function callGemini(
  model: string,
  parts: unknown[],
  generationConfig?: JsonObject,
) {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1/models/" +
      encodeURIComponent(model) +
      ":generateContent",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": geminiKey(),
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        ...(generationConfig ? { generationConfig } : {}),
      }),
      signal: AbortSignal.timeout(55_000),
    },
  );

  const payload = (await response.json().catch(() => ({}))) as JsonObject;
  if (!response.ok) {
    const error = asObject(payload.error);
    const message =
      typeof error.message === "string"
        ? error.message
        : "Gemini API returned HTTP " + response.status;
    throw new Error(message);
  }
  return payload;
}

function responseParts(payload: JsonObject): GeminiPart[] {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const first = asObject(candidates[0]);
  const content = asObject(first.content);
  return Array.isArray(content.parts) ? (content.parts as GeminiPart[]) : [];
}

function extractText(payload: JsonObject) {
  return responseParts(payload)
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function extractImages(payload: JsonObject) {
  const images: Array<{ data: string; mimeType: string }> = [];
  for (const part of responseParts(payload)) {
    const camel = part.inlineData;
    const snake = part.inline_data;
    const data = camel?.data || snake?.data;
    const mimeType = camel?.mimeType || snake?.mime_type || "image/png";
    if (data) images.push({ data, mimeType });
  }
  return images;
}

async function geminiAnalyze(args: JsonObject): Promise<ToolResult> {
  const prompt = textArg(args, "prompt", true);
  const requestedModel = textArg(args, "model");
  const model =
    requestedModel === "gemini-3.5-flash-lite"
      ? requestedModel
      : "gemini-3.8-flash";

  const parts: unknown[] = [];
  const reference = await referenceImagePart(args);
  if (reference) parts.push(reference);
  parts.push({ text: prompt.slice(0, 16_000) });

  const payload = await callGemini(model, parts, {
    maxOutputTokens: 8192,
  });
  const text = extractText(payload) || "Gemini returned no text.";
  return {
    content: [
      {
        type: "text",
        text: "Gemini model: " + model + "\n\n" + text,
      },
    ],
  };
}

async function geminiGenerateImage(
  args: JsonObject,
  requireReference = false,
): Promise<ToolResult> {
  const prompt = textArg(args, "prompt", true);
  const requestedModel = textArg(args, "model");
  const model =
    requestedModel === "gemini-3-pro-image"
      ? requestedModel
      : "gemini-3.1-flash-image";
  const aspectRatio = textArg(args, "aspect_ratio") || "1:1";
  const imageSize = textArg(args, "image_size") || "1K";
  const apiAspectRatio = IMAGE_ASPECT_RATIOS[aspectRatio];
  const apiImageSize = IMAGE_SIZES[imageSize];
  if (!Object.hasOwn(IMAGE_ASPECT_RATIOS, aspectRatio)) {
    throw new Error("aspect_ratio must be one of 1:1, 4:3, 3:4, 16:9, 9:16.");
  }
  if (!Object.hasOwn(IMAGE_SIZES, imageSize)) {
    throw new Error("image_size must be one of 1K, 2K, 4K.");
  }

  const parts: unknown[] = [{ text: prompt.slice(0, 16_000) }];
  const reference = await referenceImagePart(args, requireReference);
  if (reference) parts.push(reference);

  const payload = await callGemini(model, parts, {
    responseModalities: ["TEXT", "IMAGE"],
    responseFormat: {
      image: {
        aspectRatio: apiAspectRatio,
        imageSize: apiImageSize,
      },
    },
  });

  const content: ToolResult["content"] = [];
  const text = extractText(payload);
  if (text) content.push({ type: "text", text });
  for (const image of extractImages(payload)) {
    content.push({ type: "image", data: image.data, mimeType: image.mimeType });
  }
  if (!content.some((item) => item.type === "image")) {
    throw new Error("Gemini completed the request but returned no image.");
  }
  return content.length
    ? { content }
    : { content: [{ type: "text", text: "Gemini returned no usable output." }] };
}

async function geminiTurnaround(args: JsonObject): Promise<ToolResult> {
  const characterName = textArg(args, "character_name", true);
  const requirements = textArg(args, "design_requirements", true);
  const views = stringArrayArg(args, "views");
  const requestedViews =
    views.length > 0
      ? views
      : [
          "front orthographic",
          "front three-quarter",
          "left side 90 degrees",
          "right side 90 degrees",
          "back three-quarter",
          "back orthographic",
        ];

  const prompt = [
    "Create a production-quality 3D character turnaround sheet for the EXACT SAME character shown in the reference image.",
    "Character: " + characterName + ".",
    "The reference image is the master identity. Do not redesign, simplify, age, recolor, mirror, or substitute the character.",
    "Preserve exactly these design requirements:",
    requirements,
    "Required views: " + requestedViews.join("; ") + ".",
    "All panels must depict the same physical character with identical head/body ratio, facial construction, hair geometry, clothing seams, accessories, footwear and colors.",
    "Use a neutral relaxed full-body modeling pose, hands slightly separated from the torso, feet fully visible.",
    "Keep props beside the character when needed so body geometry is not hidden.",
    "For hidden surfaces, continue the visible construction conservatively. Do not invent unrelated decoration.",
    "Neutral studio lighting, plain light gray background, no UI, no text labels, no scenery, no pedestal.",
    "Output one clean high-resolution sheet suitable as authoritative multi-view reference for a real playable 3D game unit.",
  ].join("\n");

  return geminiGenerateImage(
    {
      prompt,
      reference_image_url: args.reference_image_url,
      reference_image_base64: args.reference_image_base64,
      reference_image_mime_type: args.reference_image_mime_type,
      model:
        textArg(args, "model") === "gemini-3-pro-image"
          ? "gemini-3-pro-image"
          : "gemini-3.1-flash-image",
      aspect_ratio: textArg(args, "aspect_ratio") || "4:3",
      image_size: textArg(args, "image_size") || "1K",
    },
    true,
  );
}

const tools = [
  {
    name: "gemini_status",
    title: "Gemini Connector Status",
    description:
      "Check whether the Crazy Rich Gemini connector has a server-side API key configured. Does not reveal the key.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "gemini_analyze_reference",
    title: "Analyze Character Reference with Gemini",
    description:
      "Send a text prompt and optionally one trusted HTTPS or inline local reference image to Gemini for visual/design analysis.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 1, maxLength: 16000 },
        ...REFERENCE_IMAGE_PROPERTIES,
        model: {
          type: "string",
          enum: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
        },
      },
      required: ["prompt"],
      oneOf: OPTIONAL_REFERENCE_IMAGE_SOURCES,
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "gemini_generate_image",
    title: "Generate or Edit an Image with Gemini",
    description:
      "Generate an image with Gemini, optionally using one trusted HTTPS or inline local reference image. This consumes Gemini API quota.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 1, maxLength: 16000 },
        ...REFERENCE_IMAGE_PROPERTIES,
        model: {
          type: "string",
          enum: ["gemini-3.1-flash-image", "gemini-3-pro-image"],
        },
        aspect_ratio: {
          type: "string",
          enum: ["1:1", "4:3", "3:4", "16:9", "9:16"],
        },
        image_size: { type: "string", enum: ["1K", "2K", "4K"] },
      },
      required: ["prompt"],
      oneOf: OPTIONAL_REFERENCE_IMAGE_SOURCES,
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: "gemini_character_turnaround",
    title: "Generate Character Turnaround with Gemini",
    description:
      "Create a strict multi-view turnaround sheet from one approved character reference for Crazy Rich: World Tour. This consumes Gemini API quota.",
    inputSchema: {
      type: "object",
      properties: {
        character_name: { type: "string", minLength: 1, maxLength: 120 },
        design_requirements: {
          type: "string",
          minLength: 1,
          maxLength: 12000,
        },
        ...REFERENCE_IMAGE_PROPERTIES,
        views: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 120 },
          maxItems: 8,
        },
        model: {
          type: "string",
          enum: ["gemini-3.1-flash-image", "gemini-3-pro-image"],
        },
        aspect_ratio: {
          type: "string",
          enum: ["4:3", "16:9", "1:1"],
        },
        image_size: { type: "string", enum: ["1K", "2K", "4K"] },
      },
      required: ["character_name", "design_requirements"],
      oneOf: REQUIRED_REFERENCE_IMAGE_SOURCES,
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
  },
] as const;

async function callTool(name: string, args: JsonObject): Promise<ToolResult> {
  if (name === "gemini_status") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
              text_model: "gemini-3.8-flash",
              image_model: "gemini-3.1-flash-image",
              project: "Crazy Rich: World Tour",
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  if (name === "gemini_analyze_reference") return geminiAnalyze(args);
  if (name === "gemini_generate_image") return geminiGenerateImage(args);
  if (name === "gemini_character_turnaround") return geminiTurnaround(args);
  return {
    isError: true,
    content: [{ type: "text", text: "Unknown tool: " + name }],
  };
}

export async function GET() {
  return json(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      transport: "MCP Streamable HTTP / stateless JSON-RPC",
      endpoint: "/api/crwt-gemini-mcp",
      configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    },
    200,
  );
}

export async function POST(request: Request) {
  let body: JsonObject;
  try {
    body = asObject(await request.json());
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const id = (body.id ?? null) as RpcId;
  const method = typeof body.method === "string" ? body.method : "";

  if (method === "server/discover") {
    return rpcResult(id, {
      supportedVersions: [MODERN_PROTOCOL, LEGACY_PROTOCOL, "2025-06-18"],
      capabilities: { tools: { listChanged: false } },
      instructions:
        "Gemini tools for Crazy Rich: World Tour. Gemini API credentials stay server-side in Vercel.",
    });
  }

  if (method === "initialize") {
    const params = asObject(body.params);
    const requested =
      typeof params.protocolVersion === "string"
        ? params.protocolVersion
        : LEGACY_PROTOCOL;
    const protocolVersion = [
      MODERN_PROTOCOL,
      LEGACY_PROTOCOL,
      "2025-06-18",
    ].includes(requested)
      ? requested
      : LEGACY_PROTOCOL;

    return rpcResult(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions:
        "Gemini tools for Crazy Rich: World Tour. Gemini API credentials stay server-side in Vercel.",
    });
  }

  if (method === "notifications/initialized" || method.startsWith("notifications/")) {
    return new Response(null, { status: 202 });
  }

  if (method === "ping") return rpcResult(id, {});

  if (method === "tools/list") {
    return rpcResult(id, { tools });
  }

  if (method === "tools/call") {
    const params = asObject(body.params);
    const name = typeof params.name === "string" ? params.name : "";
    const args = asObject(params.arguments);

    try {
      const result = await callTool(name, args);
      return rpcResult(id, result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gemini connector failed.";
      return rpcResult(id, {
        isError: true,
        content: [{ type: "text", text: message }],
      });
    }
  }

  return rpcError(id, -32601, "Method not found: " + method);
}

export async function DELETE() {
  return new Response(null, { status: 405 });
}
