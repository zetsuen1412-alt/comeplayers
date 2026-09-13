import type { BotDifficulty, MatchMode } from './MatchSettingsData';

export const RANKED_PROGRESSION_VERSION = 1;
export const RANKED_MATCH_HISTORY_LIMIT = 10;
export const RANKED_PLACEMENT_MATCHES = 5;
export const RANKED_WEEKLY_MATCH_TARGET = 5;

export type RankedTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'MASTER';

export interface RankedMatchRecord {
    readonly id: string;
    readonly playedAt: number;
    readonly seasonId: string;
    readonly mode: MatchMode;
    readonly botDifficulty: BotDifficulty;
    readonly placement: number;
    readonly won: boolean;
    readonly ratingBefore: number;
    readonly ratingDelta: number;
    readonly ratingAfter: number;
}

export interface RankedProgressionData {
    readonly version: number;
    readonly seasonId: string;
    readonly weekId: string;
    readonly rating: number;
    readonly peakRating: number;
    readonly placementMatches: number;
    readonly seasonMatches: number;
    readonly seasonWins: number;
    readonly lifetimeMatches: number;
    readonly lifetimeWins: number;
    readonly currentWinStreak: number;
    readonly bestWinStreak: number;
    readonly weeklyMatches: number;
    readonly weeklyRewardClaimed: boolean;
    readonly nextMatchSequence: number;
    readonly recentMatches: readonly RankedMatchRecord[];
}

export function createDefaultRankedProgression(timestamp = 0): RankedProgressionData {
    return {
        version: RANKED_PROGRESSION_VERSION,
        seasonId: rankedSeasonId(timestamp),
        weekId: rankedWeekId(timestamp),
        rating: 1_000,
        peakRating: 1_000,
        placementMatches: 0,
        seasonMatches: 0,
        seasonWins: 0,
        lifetimeMatches: 0,
        lifetimeWins: 0,
        currentWinStreak: 0,
        bestWinStreak: 0,
        weeklyMatches: 0,
        weeklyRewardClaimed: false,
        nextMatchSequence: 1,
        recentMatches: [],
    };
}

export function normalizeRankedProgression(value: unknown): RankedProgressionData {
    const defaults = createDefaultRankedProgression();
    if (!isRecord(value)) return defaults;
    const recentMatches = Array.isArray(value.recentMatches)
        ? value.recentMatches
            .map((entry) => normalizeRankedMatchRecord(entry))
            .filter((entry): entry is RankedMatchRecord => entry !== null)
            .slice(0, RANKED_MATCH_HISTORY_LIMIT)
        : [];
    return {
        version: RANKED_PROGRESSION_VERSION,
        seasonId: safeId(value.seasonId, defaults.seasonId),
        weekId: safeId(value.weekId, defaults.weekId),
        rating: boundedInteger(value.rating, 600, 2_400, defaults.rating),
        peakRating: boundedInteger(value.peakRating, 600, 2_400, defaults.peakRating),
        placementMatches: boundedInteger(value.placementMatches, 0, RANKED_PLACEMENT_MATCHES, 0),
        seasonMatches: boundedInteger(value.seasonMatches, 0, 9_999_999, 0),
        seasonWins: boundedInteger(value.seasonWins, 0, 9_999_999, 0),
        lifetimeMatches: boundedInteger(value.lifetimeMatches, 0, 99_999_999, 0),
        lifetimeWins: boundedInteger(value.lifetimeWins, 0, 99_999_999, 0),
        currentWinStreak: boundedInteger(value.currentWinStreak, 0, 999_999, 0),
        bestWinStreak: boundedInteger(value.bestWinStreak, 0, 999_999, 0),
        weeklyMatches: boundedInteger(value.weeklyMatches, 0, 999, 0),
        weeklyRewardClaimed: value.weeklyRewardClaimed === true,
        nextMatchSequence: boundedInteger(value.nextMatchSequence, 1, 9_999_999, 1),
        recentMatches,
    };
}

export function rankedSeasonId(timestamp: number): string {
    const date = safeDate(timestamp);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function rankedWeekId(timestamp: number): string {
    const date = safeDate(timestamp);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function normalizeRankedMatchRecord(value: unknown): RankedMatchRecord | null {
    if (!isRecord(value)) return null;
    const id = safeId(value.id, '');
    if (!id) return null;
    return {
        id,
        playedAt: boundedInteger(value.playedAt, 0, Number.MAX_SAFE_INTEGER, 0),
        seasonId: safeId(value.seasonId, 'unknown'),
        mode: value.mode === 'TEAM' ? 'TEAM' : 'SOLO',
        botDifficulty: value.botDifficulty === 'CASUAL'
            ? 'CASUAL'
            : value.botDifficulty === 'EXPERT' ? 'EXPERT' : 'SMART',
        placement: boundedInteger(value.placement, 1, 4, 4),
        won: value.won === true,
        ratingBefore: boundedInteger(value.ratingBefore, 600, 2_400, 1_000),
        ratingDelta: boundedInteger(value.ratingDelta, -100, 100, 0),
        ratingAfter: boundedInteger(value.ratingAfter, 600, 2_400, 1_000),
    };
}

function safeDate(timestamp: number): Date {
    const value = Number.isFinite(timestamp) ? Math.max(0, Math.trunc(timestamp)) : 0;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : new Date(0);
}

function safeId(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim().slice(0, 64)
        : fallback;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
