import { BUNDLED_SUPABASE_CONFIG } from './SupabaseProjectConfig';

export interface SupabaseRuntimeConfig {
    readonly projectUrl: string;
    readonly publishableKey: string;
    readonly privateChannels: boolean;
    readonly autoAnonymousAuth: boolean;
}

export interface SupabaseRuntimeConfigResult {
    readonly configured: boolean;
    readonly config: SupabaseRuntimeConfig | null;
    readonly message: string;
    readonly keyHint: string;
}

interface GlobalSupabaseConfigCandidate {
    readonly projectUrl?: unknown;
    readonly publishableKey?: unknown;
    readonly privateChannels?: unknown;
    readonly autoAnonymousAuth?: unknown;
}

interface SupabaseSdkRuntime {
    readonly createClient: (projectUrl: string, publishableKey: string, options?: unknown) => unknown;
}

declare global {
    // Runtime-only configuration. Never place a service_role or sb_secret key here.
    // eslint-disable-next-line no-var
    var COMEPLAYERS_SUPABASE: GlobalSupabaseConfigCandidate | undefined;
    // Optional browser SDK bridge. Keeping it external prevents Cocos from eagerly
    // evaluating the complete Supabase dependency graph while opening a local scene.
    // eslint-disable-next-line no-var
    var COMEPLAYERS_SUPABASE_SDK: SupabaseSdkRuntime | undefined;
}

export function loadSupabaseRuntimeConfig(
    source: unknown = globalThis.COMEPLAYERS_SUPABASE ?? BUNDLED_SUPABASE_CONFIG,
): SupabaseRuntimeConfigResult {
    if (!isRecord(source)) {
        return {
            configured: false,
            config: null,
            message: 'Supabase runtime config is missing.',
            keyHint: '',
        };
    }
    const projectUrl = normalizeUrl(source.projectUrl);
    const publishableKey = normalizeKey(source.publishableKey);
    const keyHint = publishableKey ? `${publishableKey.slice(0, 5)}…${publishableKey.slice(-4)}` : '';
    if (!projectUrl) {
        return {
            configured: false,
            config: null,
            message: 'Supabase projectUrl must be an HTTPS URL (localhost is allowed for local development).',
            keyHint,
        };
    }
    if (!publishableKey) {
        return {
            configured: false,
            config: null,
            message: 'Supabase publishable key is missing or unsafe. Secret/service-role keys are rejected.',
            keyHint,
        };
    }
    return {
        configured: true,
        config: {
            projectUrl,
            publishableKey,
            privateChannels: source.privateChannels !== false,
            autoAnonymousAuth: source.autoAnonymousAuth !== false,
        },
        message: 'Supabase runtime config is ready.',
        keyHint,
    };
}

export function installSupabaseRuntimeConfig(config: SupabaseRuntimeConfig): SupabaseRuntimeConfigResult {
    globalThis.COMEPLAYERS_SUPABASE = {
        projectUrl: config.projectUrl,
        publishableKey: config.publishableKey,
        privateChannels: config.privateChannels,
        autoAnonymousAuth: config.autoAnonymousAuth,
    };
    return loadSupabaseRuntimeConfig();
}

export function createSupabaseRuntimeClient<T>(
    projectUrl: string,
    publishableKey: string,
    options?: unknown,
): T {
    const browserGlobal = (globalThis as typeof globalThis & { supabase?: SupabaseSdkRuntime }).supabase;
    const runtime = globalThis.COMEPLAYERS_SUPABASE_SDK ?? browserGlobal;
    if (!runtime || typeof runtime.createClient !== 'function') {
        throw new Error(
            'Supabase SDK runtime is not attached. Local play remains available; attach the official browser SDK to COMEPLAYERS_SUPABASE_SDK before using online rooms.',
        );
    }
    return runtime.createClient(projectUrl, publishableKey, options) as T;
}

function normalizeUrl(value: unknown): string {
    if (typeof value !== 'string') return '';
    const candidate = value.trim().replace(/\/+$/, '');
    if (!candidate || candidate.length > 240) return '';
    try {
        const parsed = new URL(candidate);
        const localhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
        if (parsed.protocol !== 'https:' && !(localhost && parsed.protocol === 'http:')) return '';
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return '';
    }
}

function normalizeKey(value: unknown): string {
    if (typeof value !== 'string') return '';
    const candidate = value.trim();
    if (candidate.length < 24 || candidate.length > 4096) return '';
    const lower = candidate.toLowerCase();
    if (lower.includes('service_role') || lower.startsWith('sb_secret_')) return '';
    const publishable = candidate.startsWith('sb_publishable_');
    const legacyAnonJwt = candidate.startsWith('eyJ') && candidate.split('.').length === 3;
    return publishable || legacyAnonJwt ? candidate : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
