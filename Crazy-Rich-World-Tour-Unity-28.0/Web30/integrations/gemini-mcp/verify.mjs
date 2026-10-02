import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const expectedTools = [
  "gemini_status",
  "gemini_analyze_reference",
  "gemini_generate_image",
  "gemini_character_turnaround",
];

// This check never calls an analysis or generation tool and consumes no Gemini quota.
export async function verify(baseUrl, { bypassSecret, fetchImpl = fetch } = {}) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" && !(
    base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
  )) throw new Error("Use an HTTPS deployment URL or a local HTTP server.");
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    throw new Error("Use only the deployment origin; keep credentials in the environment.");
  }

  const headers = { Accept: "application/json, text/event-stream" };
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret;
  const report = {
    checkedAt: new Date().toISOString(),
    deployment: base.origin,
    protocolPassed: false,
    geminiConfigured: null,
    readyForGeminiCalls: false,
    checks: [],
  };

  async function request(label, path, body) {
    const response = await fetchImpl(new URL(path, base), {
      method: body ? "POST" : "GET",
      redirect: "manual",
      headers: body ? { ...headers, "Content-Type": "application/json" } : headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    report.checks.push({ name: label, httpStatus: response.status });
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status}; check deployment access.`);
    if (response.status === 202) return null;
    if (!(response.headers.get("content-type") || "").includes("application/json")) {
      throw new Error(`${label}: expected JSON; deployment authentication may still be required.`);
    }
    return response.json();
  }

  let id = 0;
  async function rpc(method, params = {}) {
    const requestId = ++id;
    const body = await request(method, "/api/crwt-gemini-mcp", {
      jsonrpc: "2.0", id: requestId, method, params,
    });
    if (body?.jsonrpc !== "2.0" || body.id !== requestId || body.error || !body.result) {
      throw new Error(`${method}: invalid or unsuccessful JSON-RPC response.`);
    }
    return body.result;
  }

  try {
    const health = await request("health", "/api/crwt-gemini-mcp/health");
    if (health?.ok !== true || health.service !== "Crazy Rich Gemini MCP" ||
        typeof health.geminiConfigured !== "boolean") {
      throw new Error("Health response does not identify the Crazy Rich Gemini connector.");
    }
    report.geminiConfigured = health.geminiConfigured;
    const initialized = await rpc("initialize", {
      protocolVersion: "2025-11-25", capabilities: {},
      clientInfo: { name: "crwt-handoff-verifier", version: "1.0.0" },
    });
    if (initialized.serverInfo?.name !== "crazy-rich-gemini" ||
        initialized.protocolVersion !== "2025-11-25" || !initialized.capabilities?.tools) {
      throw new Error("Initialize response does not match the expected MCP server and protocol.");
    }
    report.serverInfo = initialized.serverInfo;
    await request("notifications/initialized", "/api/crwt-gemini-mcp", {
      jsonrpc: "2.0", method: "notifications/initialized",
    });
    const listed = await rpc("tools/list");
    report.tools = listed.tools?.map((tool) => tool.name);
    if (!expectedTools.every((name) => report.tools?.includes(name))) {
      throw new Error("Required Gemini tools are missing.");
    }
    await rpc("ping");
    const status = await rpc("tools/call", { name: "gemini_status", arguments: {} });
    const statusText = status.content?.find((item) => item.type === "text")?.text;
    const parsed = JSON.parse(statusText || "null");
    if (status.isError || parsed?.project !== "Crazy Rich: World Tour" ||
        parsed.configured !== report.geminiConfigured) {
      throw new Error("Gemini status does not agree with health.");
    }
    report.models = { text: parsed.text_model, image: parsed.image_model };
    report.protocolPassed = true;
    report.readyForGeminiCalls = report.geminiConfigured;
    if (!report.geminiConfigured) {
      report.blocker = "Set GEMINI_API_KEY for this Preview branch in Vercel and redeploy.";
    }
  } catch (error) {
    // Do not serialize fetch errors, headers, cookies, or secrets into reports.
    report.blocker = error instanceof Error && !error.cause
      ? error.message : "Deployment request failed; check network access and authentication.";
  }
  return report;
}

async function main() {
  const [baseUrl, ...args] = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  if (!baseUrl || !(args.length === 0 || (
    args.length === 2 && args[0] === "--output" && args[1]
  ))) {
    throw new Error("Usage: node verify.mjs https://<deployment-host> [--output report.json]");
  }
  const report = await verify(baseUrl, {
    bypassSecret: process.env.CRWT_VERCEL_AUTOMATION_BYPASS,
  });
  const serialized = JSON.stringify(report, null, 2) + "\n";
  if (outputIndex !== -1) await writeFile(resolve(args[outputIndex + 1]), serialized);
  process.stdout.write(serialized);
  process.exitCode = report.readyForGeminiCalls ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error("Verification could not run. Check arguments, deployment access, and output path.");
    process.exitCode = 1;
  });
}
