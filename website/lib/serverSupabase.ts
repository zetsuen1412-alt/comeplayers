import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { singleDeviceSessionsEnabled } from "@/lib/auth/accountSessionConfig";

function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!value) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }

  return value;
}

export type SupabaseRequestOptions = { signal?: AbortSignal };

function requestFetch({ signal }: SupabaseRequestOptions): typeof fetch | undefined {
  if (!signal) return undefined;
  return (input, init) => {
    signal.throwIfAborted();
    const original = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    return fetch(input, { ...init, signal: original ? AbortSignal.any([signal, original]) : signal });
  };
}

export function createSupabaseAuthClient(options: SupabaseRequestOptions = {}): SupabaseClient {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
  }

  return createClient(getSupabaseUrl(), anonKey, {
    global: { fetch: requestFetch(options) },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createSupabaseUserClient(accessToken: string, options: SupabaseRequestOptions = {}): SupabaseClient {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
  }

  if (!accessToken) {
    throw new Error("Authentication required.");
  }

  return createClient(getSupabaseUrl(), anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: requestFetch(options),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function createSupabaseAdmin(options: SupabaseRequestOptions = {}): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  return createClient(getSupabaseUrl(), serviceRoleKey, {
    global: { fetch: requestFetch(options) },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

// Session activation must verify identity/MFA before it can replace an older session.
export async function requireAccountIdentity(request: Request, options: SupabaseRequestOptions = {}): Promise<User> {
  const token = getBearerToken(request);

  if (!token) {
    throw new Error("Authentication required.");
  }

  const supabase = createSupabaseAuthClient(options);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    if (error && (!error.status || error.status >= 500 || error.name === "AuthRetryableFetchError")) {
      throw Object.assign(new Error("Sign-in verification is temporarily unavailable."), { status: 503 });
    }
    throw new Error("Invalid authentication token.");
  }

  // getUser above validates the token before its assurance claim is inspected.
  if (data.user.factors?.some(factor => factor.status === "verified")) {
    let assurance = "";
    try { assurance = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).aal; } catch { /* invalid claim fails closed */ }
    if (assurance !== "aal2") throw Object.assign(new Error("Complete two-step verification to continue."), { status: 403, code: "MFA_REQUIRED" });
  }

  return data.user;
}

export async function requireAuthenticatedUser(request: Request, options: SupabaseRequestOptions = {}): Promise<User> {
  if (!singleDeviceSessionsEnabled()) return requireAccountIdentity(request, options);
  const token = getBearerToken(request);
  if (!token) throw new Error("Authentication required.");
  const [user, { data, error }] = await Promise.all([
    requireAccountIdentity(request, options),
    createSupabaseUserClient(token, options).rpc("cp_account_session_state"),
  ]);
  if (error) throw Object.assign(new Error("Authentication session could not be verified. Please try again."), { status: 503 });
  if (!data?.active) throw Object.assign(new Error("This authentication session was replaced by a newer login."), { status: 401, code: "SESSION_REPLACED" });
  return user;
}

export function authErrorStatus(message: string) {
  if (message.includes("two-step verification")) return 403;
  return message.includes("Authentication") || message.includes("authentication")
    ? 401
    : 500;
}
