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

export function createSupabaseAuthClient(): SupabaseClient {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
  }

  return createClient(getSupabaseUrl(), anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createSupabaseUserClient(accessToken: string): SupabaseClient {
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
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function createSupabaseAdmin(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  return createClient(getSupabaseUrl(), serviceRoleKey, {
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
export async function requireAccountIdentity(request: Request): Promise<User> {
  const token = getBearerToken(request);

  if (!token) {
    throw new Error("Authentication required.");
  }

  const supabase = createSupabaseAuthClient();
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

export async function requireAuthenticatedUser(request: Request): Promise<User> {
  if (!singleDeviceSessionsEnabled()) return requireAccountIdentity(request);
  const token = getBearerToken(request);
  if (!token) throw new Error("Authentication required.");
  const [user, { data, error }] = await Promise.all([
    requireAccountIdentity(request),
    createSupabaseUserClient(token).rpc("cp_account_session_state"),
  ]);
  if (error) throw new Error("Authentication session could not be verified. Please try again.");
  if (!data?.active) throw Object.assign(new Error("This authentication session was replaced by a newer login."), { status: 401, code: "SESSION_REPLACED" });
  return user;
}

export function authErrorStatus(message: string) {
  if (message.includes("two-step verification")) return 403;
  return message.includes("Authentication") || message.includes("authentication")
    ? 401
    : 500;
}
