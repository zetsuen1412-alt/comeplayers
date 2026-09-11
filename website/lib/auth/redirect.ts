const AUTH_CALLBACK_PATH = "/auth/confirm";
const DEFAULT_AUTH_REDIRECT = "/";

const SUPPORTED_EMAIL_OTP_TYPES = new Set([
  "signup",
  "email",
  "recovery",
  "email_change",
] as const);

type SupportedEmailOtpType =
  | "signup"
  | "email"
  | "recovery"
  | "email_change";

export type AuthCallbackAction =
  | { kind: "resume-session" }
  | { kind: "verify-signup"; type: "signup" }
  | {
      kind: "verify-and-redirect";
      type: Exclude<SupportedEmailOtpType, "signup">;
    }
  | { kind: "invalid"; message: string };

export function sanitizeAuthRedirect(
  value: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT
) {
  const requested = String(value || "").trim();
  if (!requested) return fallback;
  if (!requested.startsWith("/") || requested.startsWith("//")) return fallback;
  if (requested.startsWith("/api/") || requested.startsWith("/_next/")) {
    return fallback;
  }

  try {
    const parsed = new URL(requested, "https://comeplayers.local");
    if (parsed.origin !== "https://comeplayers.local") return fallback;
    if (parsed.pathname === AUTH_CALLBACK_PATH) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Only a freshly verified signup token is allowed to show the one-time
 * welcome screen. Existing sessions (including OAuth callbacks) resume their
 * requested destination without presenting email verification again.
 */
export function resolveAuthCallbackAction(
  tokenHash: string | null | undefined,
  type: string | null | undefined
): AuthCallbackAction {
  const hasToken = Boolean(tokenHash);
  const hasType = Boolean(type);

  if (!hasToken && !hasType) {
    return { kind: "resume-session" };
  }

  if (!hasToken || !hasType || !SUPPORTED_EMAIL_OTP_TYPES.has(type as SupportedEmailOtpType)) {
    return {
      kind: "invalid",
      message: "This email link type is not supported.",
    };
  }

  if (type === "signup") {
    return { kind: "verify-signup", type };
  }

  return {
    kind: "verify-and-redirect",
    type: type as Exclude<SupportedEmailOtpType, "signup">,
  };
}

export function buildAuthCallbackUrl(origin: string, next?: string) {
  const url = new URL(AUTH_CALLBACK_PATH, origin);
  url.searchParams.set("next", sanitizeAuthRedirect(next));
  return url.toString();
}
