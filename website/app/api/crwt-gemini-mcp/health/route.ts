export const runtime = "nodejs";

export async function GET() {
  return Response.json(
    {
      ok: true,
      service: "Crazy Rich Gemini MCP",
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      endpoint: "/api/crwt-gemini-mcp",
      textModel: "gemini-3.8-flash",
      imageModel: "gemini-3.1-flash-image",
    },
    {
      headers: { "cache-control": "no-store" },
    },
  );
}
