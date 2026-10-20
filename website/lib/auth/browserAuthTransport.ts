/**
 * Keep browser Auth traffic on the ComePlayers origin when the Supabase
 * hostname is unreachable from a user's network. The existing server relay
 * only permits public Auth routes against the configured Supabase project.
 * Other Supabase requests (database, storage, realtime and OAuth navigation)
 * keep their normal transport.
 */
const RELAYABLE_AUTH_ROUTE = /^(token|signup|recover|resend|verify|logout|user|factors(?:\/[0-9a-f-]{36}(?:\/(?:challenge|verify))?)?)$/i;

export function browserAuthTransport(
  supabaseUrl: string,
  appOrigin: string,
  transport: typeof fetch,
): typeof fetch {
  const authOrigin = new URL(supabaseUrl).origin;
  const app = new URL(appOrigin);
  if (app.protocol !== "https:" && app.hostname !== "localhost" && app.hostname !== "127.0.0.1") {
    throw new Error("Secure authentication connection required.");
  }

  return (input, init) => {
    const original = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    if (original.origin !== authOrigin || !original.pathname.startsWith("/auth/v1/")) {
      return transport(input, init);
    }

    const route = original.pathname.slice("/auth/v1/".length);
    if (!RELAYABLE_AUTH_ROUTE.test(route)) return transport(input, init);

    const relay = new URL(`/api/auth/mobile/${route}${original.search}`, app);
    return transport(input instanceof Request ? new Request(relay, input) : relay.toString(), init);
  };
}

/** Never display serialized objects (e.g. "{}") as authentication errors. */
export function readableAuthError(reason: unknown): string {
  const fallback = "Sign-in could not be completed. Please try again.";
  const message =
    typeof reason === "string"
      ? reason
      : reason && typeof reason === "object" && "message" in reason
        ? String((reason as { message?: unknown }).message ?? "")
        : "";
  const clean = message.trim();
  if (!clean || clean === "{}" || clean === "[object Object]" || clean === "undefined" || clean === "null") return fallback;
  if (/^(failed to fetch|networkerror|network request failed|load failed)$/i.test(clean)) {
    return "Could not connect to the sign-in service. Check your connection and try again.";
  }
  return clean;
}
