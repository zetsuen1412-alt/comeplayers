/**
 * ComePlayers Marble V61 bundled Supabase configuration.
 *
 * A Supabase publishable key is designed for public clients. Never paste a
 * service_role key or an sb_secret_ key into this file. Keep both fields empty
 * when you only want local/offline play.
 */
export const BUNDLED_SUPABASE_CONFIG = {
    projectUrl: '',
    publishableKey: '',
    privateChannels: true,
    autoAnonymousAuth: true,
} as const;
