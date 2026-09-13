import type { MatchResultSummary } from './MatchResultService';
import type { BotDifficulty, MatchMode, MatchSettingsData } from '../save/MatchSettingsData';
import { MATCH_SETTINGS_VERSION, normalizeMatchSettings } from '../save/MatchSettingsData';
import {
    createDefaultRankedProgression,
    normalizeRankedProgression,
    RankedMatchRecord,
    RankedProgressionData,
    rankedSeasonId,
    rankedWeekId,
    RANKED_PLACEMENT_MATCHES,
    RANKED_WEEKLY_MATCH_TARGET,
    RankedTier,
} from '../save/RankedProgressionData';

export interface RankedProgressionStoreSaveResult {
    readonly data: RankedProgressionData;
    readonly persisted: boolean;
}

export interface RankedProgressionStore {
    loadRankedProgression(): RankedProgressionData;
    saveRankedProgression(data: RankedProgressionData): RankedProgressionStoreSaveResult;
}

export interface RankedLeaderboardEntry {
    readonly rank: number;
    readonly name: string;
    readonly rating: number;
    readonly tier: RankedTier;
    readonly player: boolean;
}

export interface RankedProgressionSnapshot {
    readonly seasonId: string;
    readonly weekId: string;
    readonly rating: number;
    readonly peakRating: number;
    readonly tier: RankedTier;
    readonly tierProgress: number;
    readonly nextTierRating: number | null;
    readonly placementMatches: number;
    readonly placementsRemaining: number;
    readonly provisional: boolean;
    readonly seasonMatches: number;
    readonly seasonWins: number;
    readonly seasonWinRate: number;
    readonly lifetimeMatches: number;
    readonly lifetimeWins: number;
    readonly currentWinStreak: number;
    readonly bestWinStreak: number;
    readonly weeklyMatches: number;
    readonly weeklyTarget: number;
    readonly weeklyRewardCredits: number;
    readonly weeklyRewardAvailable: boolean;
    readonly weeklyRewardClaimed: boolean;
    readonly matchmakingDifficulty: BotDifficulty;
    readonly leaderboard: readonly RankedLeaderboardEntry[];
    readonly recentMatches: readonly RankedMatchRecord[];
}

export interface RankedMatchReward {
    readonly persisted: boolean;
    readonly placement: number;
    readonly won: boolean;
    readonly ratingBefore: number;
    readonly ratingDelta: number;
    readonly ratingAfter: number;
    readonly tierBefore: RankedTier;
    readonly tierAfter: RankedTier;
    readonly promoted: boolean;
    readonly snapshot: RankedProgressionSnapshot;
}

export interface RankedWeeklyClaimResult {
    readonly ok: boolean;
    readonly persisted: boolean;
    readonly credits: number;
    readonly message: string;
    readonly snapshot: RankedProgressionSnapshot;
}

const TIER_THRESHOLDS: readonly { readonly tier: RankedTier; readonly minimum: number }[] = [
    { tier: 'BRONZE', minimum: 600 },
    { tier: 'SILVER', minimum: 900 },
    { tier: 'GOLD', minimum: 1_100 },
    { tier: 'PLATINUM', minimum: 1_300 },
    { tier: 'DIAMOND', minimum: 1_500 },
    { tier: 'MASTER', minimum: 1_700 },
];

const WEEKLY_REWARDS: Readonly<Record<RankedTier, number>> = {
    BRONZE: 25_000,
    SILVER: 35_000,
    GOLD: 50_000,
    PLATINUM: 70_000,
    DIAMOND: 90_000,
    MASTER: 120_000,
};

export class RankedProgressionService {
    private data: RankedProgressionData;

    public constructor(
        private readonly store: RankedProgressionStore,
        private readonly now: () => number = Date.now,
    ) {
        this.data = this.normalizePeriods(store.loadRankedProgression());
    }

    public snapshot(): RankedProgressionSnapshot {
        this.refreshPeriods();
        const tier = rankedTierForRating(this.data.rating);
        const band = tierBand(tier);
        const nextTierRating = nextTierMinimum(tier);
        const span = nextTierRating === null ? 1 : Math.max(1, nextTierRating - band.minimum);
        const tierProgress = nextTierRating === null
            ? 1
            : Math.max(0, Math.min(1, (this.data.rating - band.minimum) / span));
        return {
            seasonId: this.data.seasonId,
            weekId: this.data.weekId,
            rating: this.data.rating,
            peakRating: this.data.peakRating,
            tier,
            tierProgress,
            nextTierRating,
            placementMatches: this.data.placementMatches,
            placementsRemaining: Math.max(0, RANKED_PLACEMENT_MATCHES - this.data.placementMatches),
            provisional: this.data.placementMatches < RANKED_PLACEMENT_MATCHES,
            seasonMatches: this.data.seasonMatches,
            seasonWins: this.data.seasonWins,
            seasonWinRate: this.data.seasonMatches > 0 ? this.data.seasonWins / this.data.seasonMatches : 0,
            lifetimeMatches: this.data.lifetimeMatches,
            lifetimeWins: this.data.lifetimeWins,
            currentWinStreak: this.data.currentWinStreak,
            bestWinStreak: this.data.bestWinStreak,
            weeklyMatches: this.data.weeklyMatches,
            weeklyTarget: RANKED_WEEKLY_MATCH_TARGET,
            weeklyRewardCredits: WEEKLY_REWARDS[tier],
            weeklyRewardAvailable: this.data.weeklyMatches >= RANKED_WEEKLY_MATCH_TARGET && !this.data.weeklyRewardClaimed,
            weeklyRewardClaimed: this.data.weeklyRewardClaimed,
            matchmakingDifficulty: rankedBotDifficultyForRating(this.data.rating, this.data.placementMatches),
            leaderboard: createLocalLeaderboard(this.data.rating),
            recentMatches: this.data.recentMatches,
        };
    }

    public createMatchSettings(mode: MatchMode): MatchSettingsData {
        const snapshot = this.snapshot();
        return normalizeMatchSettings({
            version: MATCH_SETTINGS_VERSION,
            playerCount: 4,
            turnSeconds: 20,
            autoRollOnTimeout: true,
            botDifficulty: snapshot.matchmakingDifficulty,
            roundEventsEnabled: true,
            matchMode: mode,
            rankedMode: true,
        });
    }

    public recordMatch(
        summary: Readonly<MatchResultSummary>,
        humanPlayerId: string,
        botDifficulty: BotDifficulty,
    ): RankedMatchReward {
        this.refreshPeriods();
        const human = summary.entries.find((entry) => entry.playerId === humanPlayerId);
        if (!human) throw new Error(`Human player ${humanPlayerId} is missing from ranked result.`);
        const won = summary.winningTeamId
            ? human.teamId === summary.winningTeamId
            : human.rank === 1;
        const ratingBefore = this.data.rating;
        const tierBefore = rankedTierForRating(ratingBefore);
        const ratingDelta = calculateRatingDelta(
            summary.matchMode,
            human.rank,
            won,
            botDifficulty,
            this.data.placementMatches,
            this.data.currentWinStreak,
        );
        const ratingAfter = clampRating(ratingBefore + ratingDelta);
        const currentWinStreak = won ? this.data.currentWinStreak + 1 : 0;
        const sequence = this.data.nextMatchSequence;
        const record: RankedMatchRecord = {
            id: `ranked-${sequence}`,
            playedAt: safeTimestamp(this.now()),
            seasonId: this.data.seasonId,
            mode: summary.matchMode,
            botDifficulty,
            placement: human.rank,
            won,
            ratingBefore,
            ratingDelta: ratingAfter - ratingBefore,
            ratingAfter,
        };
        const next = normalizeRankedProgression({
            ...this.data,
            rating: ratingAfter,
            peakRating: Math.max(this.data.peakRating, ratingAfter),
            placementMatches: Math.min(RANKED_PLACEMENT_MATCHES, this.data.placementMatches + 1),
            seasonMatches: this.data.seasonMatches + 1,
            seasonWins: this.data.seasonWins + (won ? 1 : 0),
            lifetimeMatches: this.data.lifetimeMatches + 1,
            lifetimeWins: this.data.lifetimeWins + (won ? 1 : 0),
            currentWinStreak,
            bestWinStreak: Math.max(this.data.bestWinStreak, currentWinStreak),
            weeklyMatches: this.data.weeklyMatches + 1,
            nextMatchSequence: sequence + 1,
            recentMatches: [record, ...this.data.recentMatches],
        });
        const previous = this.data;
        const saved = this.store.saveRankedProgression(next);
        this.data = normalizeRankedProgression(saved.data);
        if (!saved.persisted) {
            this.store.saveRankedProgression(previous);
            this.data = previous;
        }
        const tierAfter = rankedTierForRating(saved.persisted ? this.data.rating : ratingBefore);
        return {
            persisted: saved.persisted,
            placement: human.rank,
            won,
            ratingBefore,
            ratingDelta: saved.persisted ? this.data.rating - ratingBefore : 0,
            ratingAfter: saved.persisted ? this.data.rating : ratingBefore,
            tierBefore,
            tierAfter,
            promoted: tierRank(tierAfter) > tierRank(tierBefore),
            snapshot: this.snapshot(),
        };
    }

    public claimWeeklyReward(): RankedWeeklyClaimResult {
        this.refreshPeriods();
        const snapshot = this.snapshot();
        if (snapshot.weeklyRewardClaimed) {
            return { ok: false, persisted: true, credits: 0, message: 'Weekly ranked reward already claimed.', snapshot };
        }
        if (!snapshot.weeklyRewardAvailable) {
            return {
                ok: false,
                persisted: true,
                credits: 0,
                message: `Complete ${Math.max(0, snapshot.weeklyTarget - snapshot.weeklyMatches)} more ranked matches.`,
                snapshot,
            };
        }
        const previous = this.data;
        const saved = this.store.saveRankedProgression({ ...this.data, weeklyRewardClaimed: true });
        this.data = normalizeRankedProgression(saved.data);
        if (!saved.persisted) {
            this.store.saveRankedProgression(previous);
            this.data = previous;
        }
        return {
            ok: saved.persisted,
            persisted: saved.persisted,
            credits: saved.persisted ? snapshot.weeklyRewardCredits : 0,
            message: saved.persisted
                ? `Weekly ranked reward: CP ${snapshot.weeklyRewardCredits.toLocaleString('en-US')}.`
                : 'Weekly ranked reward could not be saved.',
            snapshot: this.snapshot(),
        };
    }

    public revokeWeeklyRewardClaim(): boolean {
        this.refreshPeriods();
        if (!this.data.weeklyRewardClaimed) return true;
        const saved = this.store.saveRankedProgression({ ...this.data, weeklyRewardClaimed: false });
        this.data = normalizeRankedProgression(saved.data);
        return saved.persisted;
    }

    private refreshPeriods(): void {
        const normalized = this.normalizePeriods(this.data);
        if (JSON.stringify(normalized) === JSON.stringify(this.data)) return;
        const saved = this.store.saveRankedProgression(normalized);
        this.data = normalizeRankedProgression(saved.data);
    }

    private normalizePeriods(value: RankedProgressionData): RankedProgressionData {
        const timestamp = safeTimestamp(this.now());
        const currentSeason = rankedSeasonId(timestamp);
        const currentWeek = rankedWeekId(timestamp);
        const normalized = normalizeRankedProgression(value);
        if (normalized.seasonId !== currentSeason) {
            return normalizeRankedProgression({
                ...createDefaultRankedProgression(timestamp),
                lifetimeMatches: normalized.lifetimeMatches,
                lifetimeWins: normalized.lifetimeWins,
                bestWinStreak: normalized.bestWinStreak,
                nextMatchSequence: normalized.nextMatchSequence,
            });
        }
        if (normalized.weekId !== currentWeek) {
            return normalizeRankedProgression({
                ...normalized,
                weekId: currentWeek,
                weeklyMatches: 0,
                weeklyRewardClaimed: false,
            });
        }
        return normalized;
    }
}

export function rankedTierForRating(ratingValue: number): RankedTier {
    const rating = clampRating(ratingValue);
    let tier: RankedTier = 'BRONZE';
    for (const entry of TIER_THRESHOLDS) {
        if (rating >= entry.minimum) tier = entry.tier;
    }
    return tier;
}

export function rankedBotDifficultyForRating(ratingValue: number, placementMatches = RANKED_PLACEMENT_MATCHES): BotDifficulty {
    if (placementMatches < RANKED_PLACEMENT_MATCHES) return 'SMART';
    if (ratingValue < 900) return 'CASUAL';
    if (ratingValue < 1_300) return 'SMART';
    return 'EXPERT';
}

function calculateRatingDelta(
    mode: MatchMode,
    placement: number,
    won: boolean,
    difficulty: BotDifficulty,
    placementMatches: number,
    currentWinStreak: number,
): number {
    const base = mode === 'TEAM'
        ? won ? 26 : -20
        : ([0, 34, 12, -10, -26][placement] ?? -26);
    const difficultyBonus = difficulty === 'EXPERT' ? 4 : difficulty === 'CASUAL' ? -4 : 0;
    const streakBonus = won ? Math.min(6, currentWinStreak * 2) : 0;
    const provisional = placementMatches < RANKED_PLACEMENT_MATCHES
        ? base >= 0 ? 1.35 : 0.75
        : 1;
    return Math.max(-40, Math.min(45, Math.round((base + difficultyBonus + streakBonus) * provisional)));
}

function createLocalLeaderboard(playerRating: number): readonly RankedLeaderboardEntry[] {
    const rivals = [
        { name: 'NOVA ACE', offset: 165 },
        { name: 'LUX CITY', offset: 95 },
        { name: 'ONYX PRIME', offset: 45 },
        { name: 'MIRA TOUR', offset: -35 },
        { name: 'VOLT RUSH', offset: -85 },
        { name: 'REX BANKER', offset: -145 },
    ];
    return [
        ...rivals.map((rival) => ({ name: rival.name, rating: clampRating(playerRating + rival.offset), player: false })),
        { name: 'GUEST PLAYER', rating: clampRating(playerRating), player: true },
    ]
        .sort((left, right) => right.rating - left.rating || left.name.localeCompare(right.name))
        .map((entry, index) => ({
            ...entry,
            rank: index + 1,
            tier: rankedTierForRating(entry.rating),
        }));
}

function tierBand(tier: RankedTier): { readonly minimum: number } {
    return TIER_THRESHOLDS.find((entry) => entry.tier === tier) ?? TIER_THRESHOLDS[0] as { readonly minimum: number };
}

function nextTierMinimum(tier: RankedTier): number | null {
    const index = TIER_THRESHOLDS.findIndex((entry) => entry.tier === tier);
    return index >= 0 && index < TIER_THRESHOLDS.length - 1
        ? (TIER_THRESHOLDS[index + 1] as { readonly minimum: number }).minimum
        : null;
}

function tierRank(tier: RankedTier): number {
    return TIER_THRESHOLDS.findIndex((entry) => entry.tier === tier);
}

function clampRating(value: number): number {
    if (!Number.isFinite(value)) return 1_000;
    return Math.max(600, Math.min(2_400, Math.trunc(value)));
}

function safeTimestamp(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
