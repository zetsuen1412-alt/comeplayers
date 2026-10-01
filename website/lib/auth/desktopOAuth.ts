import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sanitizeAuthRedirect } from "@/lib/auth/redirect";

const PENDING_KEY = "comeplayers_desktop_oauth_pending";
const OAUTH_STORAGE_KEY = "comeplayers-desktop-oauth";
const MAX_AGE_MS = 5 * 60 * 1000;

export const DESKTOP_OAUTH_STATE_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;
export const DESKTOP_OAUTH_CODE_PATTERN = /^[A-Za-z0-9_-]{20,512}$/;

type PendingDesktopOAuth = {
  state: string;
  next: string;
  createdAt: number;
};

let desktopOAuthClient: SupabaseClient | null = null;

export function getDesktopOAuthClient(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error("Desktop authentication requires a browser window.");
  }
  if (!desktopOAuthClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("ComePlayers authentication is unavailable.");
    desktopOAuthClient = createClient(url, key, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: false,
        autoRefreshToken: false,
        persistSession: true,
        storage: window.sessionStorage,
        storageKey: OAUTH_STORAGE_KEY,
      },
    });
  }
  return desktopOAuthClient;
}

export function isDesktopNativeShell() {
  if (typeof window === "undefined") return false;
  const bridge = (window as typeof window & {
    __TAURI_INTERNALS__?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
  }).__TAURI_INTERNALS__;
  return typeof bridge?.invoke === "function";
}

export async function openDesktopGoogleOAuth(url: string) {
  const bridge = (window as typeof window & {
    __TAURI_INTERNALS__?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
  }).__TAURI_INTERNALS__;
  if (!bridge?.invoke) throw new Error("Please update the ComePlayers desktop application.");
  await bridge.invoke("open_google_oauth", { url });
}

export function createDesktopOAuthState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function savePendingDesktopOAuth(
  storage: Pick<Storage, "setItem">,
  state: string,
  next: string,
  createdAt = Date.now()
) {
  if (!DESKTOP_OAUTH_STATE_PATTERN.test(state)) throw new Error("Invalid desktop login state.");
  storage.setItem(
    PENDING_KEY,
    JSON.stringify({ state, next: sanitizeAuthRedirect(next), createdAt } satisfies PendingDesktopOAuth)
  );
}

export function consumePendingDesktopOAuth(
  storage: Pick<Storage, "getItem" | "removeItem">,
  state: string,
  now = Date.now()
) {
  if (!DESKTOP_OAUTH_STATE_PATTERN.test(state)) return null;
  const raw = storage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as PendingDesktopOAuth;
    if (
      typeof pending.createdAt !== "number" ||
      pending.createdAt > now ||
      now - pending.createdAt > MAX_AGE_MS
    ) {
      storage.removeItem(PENDING_KEY);
      return null;
    }
    if (pending.state !== state) return null;
    storage.removeItem(PENDING_KEY);
    return sanitizeAuthRedirect(pending.next);
  } catch {
    storage.removeItem(PENDING_KEY);
    return null;
  }
}

export function clearPendingDesktopOAuth(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(PENDING_KEY);
  storage.removeItem(`${OAUTH_STORAGE_KEY}-code-verifier`);
  storage.removeItem(OAUTH_STORAGE_KEY);
}
