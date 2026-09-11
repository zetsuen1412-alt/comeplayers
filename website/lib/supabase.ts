import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAuthStorage } from "@/lib/auth/sessionStorage";

let browserClient: SupabaseClient | null = null;

function requiredPublicEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is missing.`);
  }
  return value;
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(
      requiredPublicEnv(
        "NEXT_PUBLIC_SUPABASE_URL",
        process.env.NEXT_PUBLIC_SUPABASE_URL
      ),
      requiredPublicEnv(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: supabaseAuthStorage,
        },
      }
    );
  }

  return browserClient;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const client = getSupabaseBrowserClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
