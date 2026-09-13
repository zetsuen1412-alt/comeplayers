export const MATCH_SETTINGS_VERSION = 4;
export const MATCH_PLAYER_COUNT_MIN = 2;
export const MATCH_PLAYER_COUNT_MAX = 4;
export const MATCH_TURN_SECONDS_MIN = 10;
export const MATCH_TURN_SECONDS_MAX = 90;

export type BotDifficulty = 'CASUAL' | 'SMART' | 'EXPERT';
export type MatchMode = 'SOLO' | 'TEAM';
export type TeamId = 'BLUE' | 'GOLD';

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['CASUAL', 'SMART', 'EXPERT'];
export const MATCH_MODES: readonly MatchMode[] = ['SOLO', 'TEAM'];

export interface MatchSettingsData {
    readonly version: number;
    readonly playerCount: number;
    readonly turnSeconds: number;
    readonly autoRollOnTimeout: boolean;
    readonly botDifficulty: BotDifficulty;
    readonly roundEventsEnabled: boolean;
    readonly matchMode: MatchMode;
    readonly rankedMode: boolean;
}

export function createDefaultMatchSettings(): MatchSettingsData {
    return {
        version: MATCH_SETTINGS_VERSION,
        playerCount: 4,
        turnSeconds: 20,
        autoRollOnTimeout: true,
        botDifficulty: 'SMART',
        roundEventsEnabled: true,
        matchMode: 'SOLO',
        rankedMode: false,
    };
}

export function normalizeMatchSettings(
    value: unknown,
    fallback: MatchSettingsData = createDefaultMatchSettings(),
): MatchSettingsData {
    const defaults = sanitizeMatchSettings(fallback, createDefaultMatchSettings());
    return isRecord(value) ? sanitizeMatchSettings(value, defaults) : defaults;
}

function sanitizeMatchSettings(
    value: Record<string, unknown> | MatchSettingsData,
    fallback: MatchSettingsData,
): MatchSettingsData {
    const matchMode = normalizeMatchMode(value.matchMode, fallback.matchMode);
    const requestedPlayerCount = boundedInteger(
        value.playerCount,
        fallback.playerCount,
        MATCH_PLAYER_COUNT_MIN,
        MATCH_PLAYER_COUNT_MAX,
    );
    return {
        version: MATCH_SETTINGS_VERSION,
        playerCount: matchMode === 'TEAM' ? MATCH_PLAYER_COUNT_MAX : requestedPlayerCount,
        turnSeconds: boundedInteger(
            value.turnSeconds,
            fallback.turnSeconds,
            MATCH_TURN_SECONDS_MIN,
            MATCH_TURN_SECONDS_MAX,
        ),
        autoRollOnTimeout: typeof value.autoRollOnTimeout === 'boolean'
            ? value.autoRollOnTimeout
            : fallback.autoRollOnTimeout,
        botDifficulty: normalizeBotDifficulty(value.botDifficulty, fallback.botDifficulty),
        roundEventsEnabled: typeof value.roundEventsEnabled === 'boolean'
            ? value.roundEventsEnabled
            : fallback.roundEventsEnabled,
        matchMode,
        rankedMode: typeof value.rankedMode === 'boolean' ? value.rankedMode : fallback.rankedMode,
    };
}

function normalizeBotDifficulty(value: unknown, fallback: BotDifficulty): BotDifficulty {
    return typeof value === 'string' && BOT_DIFFICULTIES.includes(value as BotDifficulty)
        ? value as BotDifficulty
        : fallback;
}

function normalizeMatchMode(value: unknown, fallback: MatchMode): MatchMode {
    return typeof value === 'string' && MATCH_MODES.includes(value as MatchMode)
        ? value as MatchMode
        : fallback;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(minimum, Math.min(Math.round(value), maximum));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
