import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createChatClient } from "@comeplayers/chat-core";
import { createClient, type Session } from "@supabase/supabase-js";
import { authTransport } from "./authTransport";

function clean(value: string | undefined): string {
  return String(value || "").trim().replace(/\/$/, "");
}

export const apiUrl =
  clean(process.env.EXPO_PUBLIC_COMEPLAYERS_API_URL) ||
  "https://www.comeplayers.com";

const configuredSupabaseUrl = clean(process.env.EXPO_PUBLIC_SUPABASE_URL);
const configuredSupabaseAnonKey = clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

export const backendConfigured = Boolean(
  configuredSupabaseUrl && configuredSupabaseAnonKey
);
const authStorageKey = `sb-${new URL(configuredSupabaseUrl || "https://placeholder.supabase.co").hostname.split(".")[0]}-auth-token`;

// Read the SDK's existing device cache for immediate local UI only. API requests
// still use accessToken() and server-side authentication; this is no auth grant.
export async function cachedDeviceSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(authStorageKey);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Session;
    return saved.user?.id && typeof saved.access_token === "string" && typeof saved.refresh_token === "string" ? saved : null;
  } catch { return null; }
}

export const supabase = createClient(
  configuredSupabaseUrl || "https://placeholder.supabase.co",
  configuredSupabaseAnonKey || "mobile-preview-placeholder-key",
  {
    global: { fetch: authTransport(configuredSupabaseUrl || "https://placeholder.supabase.co", apiUrl, fetch) },
    auth: {
      storage: AsyncStorage,
      storageKey: authStorageKey,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = supabase.auth
      .refreshSession()
      .then(({ data, error }) => {
        if (error) throw error;
        return data.session?.access_token || null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

export async function accessToken(forceRefresh = false): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;

  const expiresAtMs = Number(data.session.expires_at || 0) * 1000;
  const expiresSoon = !expiresAtMs || expiresAtMs <= Date.now() + 90_000;
  if (!forceRefresh && !expiresSoon) return data.session.access_token;

  try {
    return await refreshAccessToken();
  } catch (reason) {
    console.warn("[ComePlayers] Session refresh failed:", reason);
    return forceRefresh || expiresSoon ? null : data.session.access_token;
  }
}

export const chatClient = createChatClient({
  baseUrl: apiUrl,
  getAccessToken: accessToken,
});
