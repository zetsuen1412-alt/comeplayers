import "server-only";

import { randomUUID } from "node:crypto";

const DOKU_MCP_PRODUCTION_URL = "https://mcp.doku.com/mcp";
const DOKU_MCP_SANDBOX_URL =
  "https://api-sandbox.doku.com/doku-mcp-server/mcp";
const DOKU_QRIS_TOOL_NAMES = [
  "generate_payment_qris",
  // Kept for older DOKU MCP deployments. The documented tool above must be
  // attempted first because this legacy name may accept a different schema.
  "create_qris_payment",
] as const;

type JsonRecord = Record<string, unknown>;

type McpResponse = {
  error?: {
    code?: number;
    message?: string;
  };
  result?: JsonRecord;
};

type DokuQrisPayload = {
  responseCode?: string;
  responseMessage?: string;
  referenceNo?: string;
  partnerReferenceNo?: string;
  invoiceNumber?: string;
  qrContent?: string;
  qrImageUrl?: string;
  terminalId?: string;
  validityPeriod?: string;
  additionalInfo?: {
    validityPeriod?: string;
  };
};

export class DokuMcpError extends Error {
  constructor(
    message: string,
    public readonly code: number | null = null,
  ) {
    super(message);
    this.name = "DokuMcpError";
  }
}

function getDokuMcpConfig() {
  const clientId = String(process.env.DOKU_CLIENT_ID || "").trim();
  const apiKey = String(process.env.DOKU_MCP_API_KEY || "").trim();
  const environment = String(process.env.DOKU_ENV || "sandbox").toLowerCase();
  const production = environment === "production" || environment === "live";

  if (!clientId || !apiKey) {
    throw new Error("DOKU QRIS credentials are not configured.");
  }

  // DOKU REST Secret Keys use the SK-* format and cannot authenticate the
  // MCP server. Fail early with a configuration hint instead of forwarding
  // the wrong credential and surfacing an opaque provider error.
  if (/^sk-/i.test(apiKey)) {
    throw new Error(
      "DOKU_MCP_API_KEY must be a DOKU MCP API key. The configured credential is a REST Secret Key; use it as DOKU_SECRET_KEY or request a separate MCP API key.",
    );
  }

  return {
    clientId,
    authorization: `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`,
    endpoint: production ? DOKU_MCP_PRODUCTION_URL : DOKU_MCP_SANDBOX_URL,
  };
}

function parseMcpBody(rawBody: string): McpResponse {
  try {
    return JSON.parse(rawBody) as McpResponse;
  } catch {
    const eventPayloads = rawBody
      .split(/\r?\n\r?\n/)
      .flatMap((event) =>
        event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim()),
      )
      .filter((value) => value && value !== "[DONE]");

    for (let index = eventPayloads.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(eventPayloads[index]) as McpResponse;
      } catch {
        // Keep looking for the last valid JSON-RPC data event.
      }
    }
  }

  throw new Error("DOKU QRIS returned an invalid response.");
}

async function callMcpRpc(input: {
  method: string;
  params?: JsonRecord;
  protocolVersion?: string;
  sessionId?: string | null;
}) {
  const config = getDokuMcpConfig();
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Client-Id": config.clientId,
      Authorization: config.authorization,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...(input.protocolVersion
        ? { "MCP-Protocol-Version": input.protocolVersion }
        : {}),
      ...(input.sessionId ? { "Mcp-Session-Id": input.sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: input.method,
      params: input.params || {},
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const rawBody = await response.text();
  if (!response.ok) {
    throw new DokuMcpError(
      `DOKU QRIS request failed (${response.status}).`,
      response.status,
    );
  }

  const payload = parseMcpBody(rawBody);
  if (payload.error) {
    throw new DokuMcpError(
      `DOKU QRIS rejected the request: ${String(payload.error.message || "provider error").slice(0, 180)}`,
      Number.isFinite(payload.error.code) ? Number(payload.error.code) : null,
    );
  }

  return {
    result: payload.result || {},
    sessionId: response.headers.get("mcp-session-id"),
  };
}

function parseToolResult(result: JsonRecord) {
  if (result.isError === true) {
    const providerText = Array.isArray(result.content)
      ? result.content
          .filter(
            (item): item is { type: string; text: string } =>
              Boolean(
                item &&
                  typeof item === "object" &&
                  (item as { type?: unknown }).type === "text" &&
                  typeof (item as { text?: unknown }).text === "string",
              ),
          )
          .map((item) => item.text)
          .join(" ")
      : "";
    throw new DokuMcpError(
      `DOKU QRIS could not create the code${providerText ? `: ${providerText.slice(0, 180)}` : "."}`,
    );
  }

  const candidates: JsonRecord[] = [];
  const addCandidate = (value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      candidates.push(value as JsonRecord);
    }
  };

  const collectNestedCandidates = (value: unknown, depth = 0) => {
    if (depth > 3 || !value || typeof value !== "object" || Array.isArray(value)) {
      return;
    }
    const record = value as JsonRecord;
    addCandidate(record);
    for (const key of ["data", "result", "response", "output", "payment"]) {
      if (key in record) collectNestedCandidates(record[key], depth + 1);
    }
  };

  collectNestedCandidates(result.structuredContent);

  for (const candidate of candidates) {
    if (
      "responseCode" in candidate ||
      "qrContent" in candidate ||
      "partnerReferenceNo" in candidate
    ) {
      return candidate as DokuQrisPayload;
    }
  }

  if (Array.isArray(result.content)) {
    for (const item of result.content) {
      if (
        !item ||
        typeof item !== "object" ||
        (item as { type?: unknown }).type !== "text" ||
        typeof (item as { text?: unknown }).text !== "string"
      ) {
        continue;
      }

      try {
        const parsed = JSON.parse((item as { text: string }).text);
        collectNestedCandidates(parsed);
        for (const candidate of candidates) {
          if (
            "responseCode" in candidate ||
            "qrContent" in candidate ||
            "partnerReferenceNo" in candidate
          ) {
            return candidate as DokuQrisPayload;
          }
        }
      } catch {
        // Ignore non-JSON status text and inspect the next content block.
      }
    }
  }

  throw new Error("DOKU QRIS did not return payment details.");
}

export function isTrustedDokuQrisImageUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["api.doku.com", "api-sandbox.doku.com"].includes(url.hostname) &&
      url.pathname === "/doku-mcp-server/api/qr/generate"
    );
  } catch {
    return false;
  }
}

function toJakartaTimestamp(timestamp: number) {
  return new Date(timestamp + 7 * 60 * 60_000)
    .toISOString()
    .replace("Z", "+07:00");
}

export async function createDokuQrisPayment(input: {
  invoiceNumber: string;
  amount: number;
  dueMinutes: number;
}) {
  const initialized = await callMcpRpc({
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: {
        name: "comeplayers-payment-server",
        version: "1.0.0",
      },
    },
  });
  const protocolVersion = String(
    initialized.result.protocolVersion || "2025-06-18",
  );
  const validityPeriod = toJakartaTimestamp(
    Date.now() + Math.max(5, input.dueMinutes) * 60_000,
  );

  let lastError: unknown = null;

  for (const toolName of DOKU_QRIS_TOOL_NAMES) {
    try {
      const called = await callMcpRpc({
        method: "tools/call",
        protocolVersion,
        sessionId: initialized.sessionId,
        params: {
          name: toolName,
          arguments: {
            toolRequest: {
              amount: {
                value: input.amount.toFixed(2),
                currency: "IDR",
              },
              partnerReferenceNo: input.invoiceNumber,
              validityPeriod,
            },
          },
        },
      });

      const data = parseToolResult(called.result);
      const responseCode = String(data.responseCode || "").trim();
      const partnerReferenceNo = String(data.partnerReferenceNo || "").trim();
      const responseMessage = String(data.responseMessage || "").trim();

      if (responseCode !== "2004700") {
        lastError = new DokuMcpError(
          `DOKU QRIS was not created: ${responseMessage || responseCode || "provider error"}`,
        );
        console.error("DOKU QRIS provider response", {
          toolName,
          responseCode: responseCode || null,
          responseMessage: responseMessage.slice(0, 180) || null,
          fields: Object.keys(data).sort(),
        });
        continue;
      }

      if (partnerReferenceNo !== input.invoiceNumber) {
        lastError = new Error("DOKU QRIS returned a mismatched invoice reference.");
        continue;
      }

      const referenceNo = String(
        data.referenceNo || data.invoiceNumber || partnerReferenceNo,
      ).trim();
      const qrContent = String(data.qrContent || "").trim();
      const qrImageUrl = String(data.qrImageUrl || "").trim();
      const providerValidity = String(
        data.additionalInfo?.validityPeriod || data.validityPeriod || validityPeriod,
      ).trim();
      const expiresAt = Date.parse(providerValidity);

      if (
        qrContent.length < 80 ||
        qrContent.length > 1024 ||
        !/^[\x20-\x7E]+$/.test(qrContent)
      ) {
        lastError = new Error("DOKU QRIS returned invalid QR content.");
        continue;
      }
      if (!isTrustedDokuQrisImageUrl(qrImageUrl)) {
        lastError = new Error("DOKU QRIS returned an untrusted QR image address.");
        continue;
      }
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 30_000) {
        lastError = new Error("DOKU QRIS returned an invalid expiry time.");
        continue;
      }

      return {
        invoiceNumber: partnerReferenceNo,
        referenceNo,
        qrContent,
        qrImageUrl,
        expiresAt: new Date(expiresAt).toISOString(),
        terminalId: String(data.terminalId || "").trim() || null,
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (
        !message.includes("not found") &&
        !message.includes("unknown tool") &&
        !message.includes("not created") &&
        !message.includes("invalid qr") &&
        !message.includes("untrusted qr") &&
        !message.includes("invalid expiry")
      ) {
        throw error;
      }
    }
  }

  throw lastError || new Error("DOKU QRIS tool is unavailable.");
}
