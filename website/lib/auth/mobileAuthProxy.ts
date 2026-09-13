const AUTH_PATHS = /^(token|signup|recover|resend|verify|logout|user|factors(?:\/[0-9a-f-]{36}(?:\/(?:challenge|verify))?)?)$/i;
const ALLOWED_METHODS: Record<string, string[]> = {
  token: ["POST"], signup: ["POST"], recover: ["POST"], resend: ["POST"],
  verify: ["POST"], logout: ["POST"], user: ["GET", "PUT"], factors: ["GET", "POST", "DELETE"],
};
const NO_CACHE = { "Cache-Control": "no-store, private", "Pragma": "no-cache" };

/** Fixed-project Auth relay. Never accepts an upstream host or an admin API path. */
export async function relayMobileAuth(request: Request, segments: string[], config: {
  supabaseUrl: string; publicKey: string; fetch: typeof fetch;
}): Promise<Response> {
  const route = segments.join("/");
  if (!AUTH_PATHS.test(route) || !ALLOWED_METHODS[segments[0]]?.includes(request.method)) {
    return Response.json({ error: "Unsupported authentication request." }, { status: 404, headers: NO_CACHE });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403, headers: NO_CACHE });
  }
  const upstream = new URL(`/auth/v1/${route}`, config.supabaseUrl);
  if (upstream.protocol !== "https:") throw new Error("HTTPS authentication backend required.");
  const incomingUrl = new URL(request.url);
  for (const name of ["grant_type", "redirect_to", "scope"]) {
    const value = incomingUrl.searchParams.get(name);
    if (value) upstream.searchParams.set(name, value);
  }
  let body: string | undefined;
  if (request.method !== "GET") {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 32768) {
            await reader.cancel();
            return Response.json({ error: "Authentication request is too large." }, { status: 413, headers: NO_CACHE });
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    body = Buffer.concat(chunks).toString("utf8");
    if (body) {
      try { JSON.parse(body); } catch {
        return Response.json({ error: "Invalid authentication request." }, { status: 400, headers: NO_CACHE });
      }
    }
  }
  try {
    const headers = new Headers({ apikey: config.publicKey, "Content-Type": "application/json" });
    const authorization = request.headers.get("authorization");
    if (authorization) headers.set("Authorization", authorization);
    const apiVersion = request.headers.get("x-supabase-api-version");
    if (apiVersion) headers.set("x-supabase-api-version", apiVersion);
    const response = await config.fetch(upstream, {
      method: request.method, headers, body, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    const outgoing = new Headers(NO_CACHE);
    outgoing.set("Content-Type", response.headers.get("content-type") || "application/json");
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) outgoing.set("Retry-After", retryAfter);
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return Response.json({ message: "ComePlayers sign-in is temporarily unavailable. Please try again.", code: "AUTH_CONNECTION_UNAVAILABLE" }, { status: 503, headers: NO_CACHE });
  }
}
