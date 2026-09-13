export const CAREER_PROGRESSION_VERSION = 7;
export const CAREER_MATCH_HISTORY_LIMIT = 8;

export type CareerPerformanceGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export type CareerMatchEndReason =
    | 'LAST_PLAYER'
    | 'LAST_TEAM'
    | 'ROUND_LIMIT'
    | 'TRIPLE_MONOPOLY'
    | 'LINE_MONOPOLY'
    | 'TOURISM_MONOPOLY';

export interface CareerMatchActivity {
    readonly propertyActions: number;
    readonly worldTravels: number;
    readonly gameCenterWins: number;
    readonly takeovers: number;
}


export interface CareerJourneyCycleProgress {
    readonly id: string;
    readonly matches: number;
    readonly wins: number;
    readonly podiums: number;
    readonly propertyActions: number;
    readonly worldTravels: number;
    readonly gameCenterWins: number;
    readonly takeovers: number;
    readonly classicVictories: number;
    readonly claimedMissionIds: readonly string[];
}

export interface CareerJourneySeasonArchive {
    readonly seasonId: string;
    readonly seasonExperience: number;
    readonly completedTierCount: number;
    readonly prestigeLevel: number;
    readonly rewardCredits: number;
    readonly perfectDailyCount: number;
    readonly perfectWeeklyCount: number;
    readonly bestActiveDayStreak: number;
    readonly finalRivalRating: number;
    readonly finalRivalRank: number;
    readonly completedRivalContractCount: number;
    readonly finalRivalGauntletScore: number;
    readonly bestRivalPodiumStreak: number;
    readonly completedRivalGauntletCount: number;
    readonly archivedAt: number;
}

export interface CareerJourneyProgression {
    readonly seasonId: string;
    readonly seasonExperience: number;
    readonly claimedTierIds: readonly string[];
    readonly claimedPrestigeIds: readonly string[];
    readonly perfectDailyIds: readonly string[];
    readonly perfectWeeklyIds: readonly string[];
    readonly totalRewardCredits: number;
    readonly seasonRewardCredits: number;
    readonly activeDayStreak: number;
    readonly bestActiveDayStreak: number;
    readonly seasonBestActiveDayStreak: number;
    readonly lastActiveDayId: string;
    readonly totalPerfectDaily: number;
    readonly totalPerfectWeekly: number;
    readonly seasonPerfectDaily: number;
    readonly seasonPerfectWeekly: number;
    readonly lifetimeJourneyExperience: number;
    readonly seasonsCompleted: number;
    readonly bestSeasonExperience: number;
    readonly seasonArchive: readonly CareerJourneySeasonArchive[];
    readonly rivalRating: number;
    readonly lastRivalRatingChange: number;
    readonly bestRivalRank: number;
    readonly seasonBestRivalRank: number;
    readonly seasonRivalMatches: number;
    readonly seasonRivalWins: number;
    readonly seasonRivalPodiums: number;
    readonly seasonElitePerformances: number;
    readonly totalRivalWins: number;
    readonly claimedRivalContractIds: readonly string[];
    readonly totalRivalRewardCredits: number;
    readonly seasonRivalRewardCredits: number;
    readonly seasonRivalGauntletScore: number;
    readonly rivalPodiumStreak: number;
    readonly bestRivalPodiumStreak: number;
    readonly claimedRivalGauntletIds: readonly string[];
    readonly totalRivalGauntletRewardCredits: number;
    readonly seasonRivalGauntletRewardCredits: number;
    readonly daily: CareerJourneyCycleProgress;
    readonly weekly: CareerJourneyCycleProgress;
}

export interface CareerMatchRecord {
    readonly id: string;
    readonly playedAt: number;
    readonly rank: number;
    readonly playerCount: number;
    readonly completedRound: number;
    readonly reason: CareerMatchEndReason;
    readonly netWorth: number;
    readonly rewardCredits: number;
    readonly experienceGained: number;
    readonly performanceScore: number;
    readonly performanceGrade: CareerPerformanceGrade;
    readonly awardCount: number;
    readonly highlightTitle: string;
    readonly classicVictory: boolean;
    readonly activity: CareerMatchActivity;
}

export interface CareerProgressionData {
    readonly version: number;
    readonly level: number;
    readonly experience: number;
    readonly totalMatches: number;
    readonly wins: number;
    readonly podiums: number;
    readonly propertyActions: number;
    readonly worldTravels: number;
    readonly gameCenterWins: number;
    readonly takeovers: number;
    readonly totalRewardCredits: number;
    readonly currentWinStreak: number;
    readonly bestWinStreak: number;
    readonly performanceScoreTotal: number;
    readonly performanceMatchCount: number;
    readonly bestPerformanceScore: number;
    readonly sGradeCount: number;
    readonly eliteGradeCount: number;
    readonly totalAwards: number;
    readonly classicVictoryWins: number;
    readonly highlightMatches: number;
    readonly highestNetWorth: number;
    readonly claimedMissionIds: readonly string[];
    readonly claimedLegacyMilestoneIds: readonly string[];
    readonly journey: CareerJourneyProgression;
    readonly nextMatchSequence: number;
    readonly recentMatches: readonly CareerMatchRecord[];
}

export function createEmptyCareerMatchActivity(): CareerMatchActivity {
    return {
        propertyActions: 0,
        worldTravels: 0,
        gameCenterWins: 0,
        takeovers: 0,
    };
}

export function createEmptyCareerJourneyCycle(id = ''): CareerJourneyCycleProgress {
    return {
        id,
        matches: 0,
        wins: 0,
        podiums: 0,
        propertyActions: 0,
        worldTravels: 0,
        gameCenterWins: 0,
        takeovers: 0,
        classicVictories: 0,
        claimedMissionIds: [],
    };
}

export function createDefaultCareerJourneyProgression(): CareerJourneyProgression {
    return {
        seasonId: '',
        seasonExperience: 0,
        claimedTierIds: [],
        claimedPrestigeIds: [],
        perfectDailyIds: [],
        perfectWeeklyIds: [],
        totalRewardCredits: 0,
        seasonRewardCredits: 0,
        activeDayStreak: 0,
        bestActiveDayStreak: 0,
        seasonBestActiveDayStreak: 0,
        lastActiveDayId: '',
        totalPerfectDaily: 0,
        totalPerfectWeekly: 0,
        seasonPerfectDaily: 0,
        seasonPerfectWeekly: 0,
        lifetimeJourneyExperience: 0,
        seasonsCompleted: 0,
        bestSeasonExperience: 0,
        seasonArchive: [],
        rivalRating: 1_000,
        lastRivalRatingChange: 0,
        bestRivalRank: 6,
        seasonBestRivalRank: 6,
        seasonRivalMatches: 0,
        seasonRivalWins: 0,
        seasonRivalPodiums: 0,
        seasonElitePerformances: 0,
        totalRivalWins: 0,
        claimedRivalContractIds: [],
        totalRivalRewardCredits: 0,
        seasonRivalRewardCredits: 0,
        seasonRivalGauntletScore: 0,
        rivalPodiumStreak: 0,
        bestRivalPodiumStreak: 0,
        claimedRivalGauntletIds: [],
        totalRivalGauntletRewardCredits: 0,
        seasonRivalGauntletRewardCredits: 0,
        daily: createEmptyCareerJourneyCycle(),
        weekly: createEmptyCareerJourneyCycle(),
    };
}

export function createDefaultCareerProgression(): CareerProgressionData {
    return {
        version: CAREER_PROGRESSION_VERSION,
        level: 1,
        experience: 0,
        totalMatches: 0,
        wins: 0,
        podiums: 0,
        propertyActions: 0,
        worldTravels: 0,
        gameCenterWins: 0,
        takeovers: 0,
        totalRewardCredits: 0,
        currentWinStreak: 0,
        bestWinStreak: 0,
        performanceScoreTotal: 0,
        performanceMatchCount: 0,
        bestPerformanceScore: 0,
        sGradeCount: 0,
        eliteGradeCount: 0,
        totalAwards: 0,
        classicVictoryWins: 0,
        highlightMatches: 0,
        highestNetWorth: 0,
        claimedMissionIds: [],
        claimedLegacyMilestoneIds: [],
        journey: createDefaultCareerJourneyProgression(),
        nextMatchSequence: 1,
        recentMatches: [],
    };
}

export function normalizeCareerProgression(value: unknown): CareerProgressionData {
    const defaults = createDefaultCareerProgression();
    if (!isRecord(value)) return defaults;

    const claimedMissionIds = normalizeIdList(value.claimedMissionIds, 32);
    const claimedLegacyMilestoneIds = normalizeIdList(value.claimedLegacyMilestoneIds, 32);
    const journey = normalizeCareerJourneyProgression(value.journey);
    const recentMatches = Array.isArray(value.recentMatches)
        ? value.recentMatches
            .map((entry) => normalizeMatchRecord(entry))
            .filter((entry): entry is CareerMatchRecord => entry !== null)
            .slice(0, CAREER_MATCH_HISTORY_LIMIT)
        : [];

    const normalizedTotalMatches = boundedInteger(value.totalMatches, 0, 9_999_999, defaults.totalMatches);
    const derivedPerformanceTotal = recentMatches.reduce((total, match) => total + match.performanceScore, 0);
    const derivedBestPerformance = recentMatches.reduce((best, match) => Math.max(best, match.performanceScore), 0);
    const derivedSGrades = recentMatches.filter((match) => match.performanceGrade === 'S').length;
    const derivedEliteGrades = recentMatches.filter((match) => match.performanceGrade === 'S' || match.performanceGrade === 'A').length;
    const derivedAwards = recentMatches.reduce((total, match) => total + match.awardCount, 0);
    const derivedClassicWins = recentMatches.filter((match) => match.classicVictory).length;
    const derivedHighlights = recentMatches.filter((match) => match.highlightTitle !== 'CAREER MATCH RECORD').length;
    const derivedHighestNetWorth = recentMatches.reduce((highest, match) => Math.max(highest, match.netWorth), 0);

    return {
        version: CAREER_PROGRESSION_VERSION,
        level: boundedInteger(value.level, 1, 999, defaults.level),
        experience: boundedInteger(value.experience, 0, 99_999_999, defaults.experience),
        totalMatches: normalizedTotalMatches,
        wins: boundedInteger(value.wins, 0, 9_999_999, defaults.wins),
        podiums: boundedInteger(value.podiums, 0, 9_999_999, defaults.podiums),
        propertyActions: boundedInteger(value.propertyActions, 0, 99_999_999, defaults.propertyActions),
        worldTravels: boundedInteger(value.worldTravels, 0, 99_999_999, defaults.worldTravels),
        gameCenterWins: boundedInteger(value.gameCenterWins, 0, 99_999_999, defaults.gameCenterWins),
        takeovers: boundedInteger(value.takeovers, 0, 99_999_999, defaults.takeovers),
        totalRewardCredits: boundedInteger(value.totalRewardCredits, 0, 999_999_999, defaults.totalRewardCredits),
        currentWinStreak: boundedInteger(value.currentWinStreak, 0, 999_999, defaults.currentWinStreak),
        bestWinStreak: boundedInteger(value.bestWinStreak, 0, 999_999, defaults.bestWinStreak),
        performanceScoreTotal: boundedInteger(
            value.performanceScoreTotal,
            0,
            999_999_999,
            derivedPerformanceTotal,
        ),
        performanceMatchCount: boundedInteger(
            value.performanceMatchCount,
            0,
            9_999_999,
            recentMatches.filter((match) => match.performanceScore > 0).length,
        ),
        bestPerformanceScore: boundedInteger(value.bestPerformanceScore, 0, 100, derivedBestPerformance),
        sGradeCount: boundedInteger(value.sGradeCount, 0, 9_999_999, derivedSGrades),
        eliteGradeCount: boundedInteger(value.eliteGradeCount, 0, 9_999_999, derivedEliteGrades),
        totalAwards: boundedInteger(value.totalAwards, 0, 99_999_999, derivedAwards),
        classicVictoryWins: boundedInteger(value.classicVictoryWins, 0, 9_999_999, derivedClassicWins),
        highlightMatches: boundedInteger(value.highlightMatches, 0, 9_999_999, derivedHighlights),
        highestNetWorth: boundedInteger(value.highestNetWorth, 0, 999_999_999, derivedHighestNetWorth),
        claimedMissionIds,
        claimedLegacyMilestoneIds,
        journey,
        nextMatchSequence: boundedInteger(value.nextMatchSequence, 1, 9_999_999, defaults.nextMatchSequence),
        recentMatches,
    };
}

export function normalizeCareerJourneyProgression(value: unknown): CareerJourneyProgression {
    const defaults = createDefaultCareerJourneyProgression();
    if (!isRecord(value)) return defaults;
    return {
        seasonId: safeString(value.seasonId, '', 32),
        seasonExperience: boundedInteger(value.seasonExperience, 0, 99_999_999, 0),
        claimedTierIds: normalizeIdList(value.claimedTierIds, 64),
        claimedPrestigeIds: normalizeIdList(value.claimedPrestigeIds, 32),
        perfectDailyIds: normalizeIdList(value.perfectDailyIds, 64),
        perfectWeeklyIds: normalizeIdList(value.perfectWeeklyIds, 32),
        totalRewardCredits: boundedInteger(value.totalRewardCredits, 0, 999_999_999, 0),
        seasonRewardCredits: boundedInteger(value.seasonRewardCredits, 0, 999_999_999, boundedInteger(value.totalRewardCredits, 0, 999_999_999, 0)),
        activeDayStreak: boundedInteger(value.activeDayStreak, 0, 9_999, 0),
        bestActiveDayStreak: boundedInteger(value.bestActiveDayStreak, 0, 9_999, 0),
        seasonBestActiveDayStreak: boundedInteger(value.seasonBestActiveDayStreak, 0, 9_999, boundedInteger(value.bestActiveDayStreak, 0, 9_999, 0)),
        lastActiveDayId: safeString(value.lastActiveDayId, '', 32),
        totalPerfectDaily: boundedInteger(value.totalPerfectDaily, 0, 999_999, 0),
        totalPerfectWeekly: boundedInteger(value.totalPerfectWeekly, 0, 999_999, 0),
        seasonPerfectDaily: boundedInteger(value.seasonPerfectDaily, 0, 999_999, boundedInteger(value.totalPerfectDaily, 0, 999_999, 0)),
        seasonPerfectWeekly: boundedInteger(value.seasonPerfectWeekly, 0, 999_999, boundedInteger(value.totalPerfectWeekly, 0, 999_999, 0)),
        lifetimeJourneyExperience: boundedInteger(value.lifetimeJourneyExperience, 0, 999_999_999, boundedInteger(value.seasonExperience, 0, 99_999_999, 0)),
        seasonsCompleted: boundedInteger(value.seasonsCompleted, 0, 999, 0),
        bestSeasonExperience: boundedInteger(value.bestSeasonExperience, 0, 99_999_999, 0),
        seasonArchive: normalizeCareerJourneySeasonArchive(value.seasonArchive),
        rivalRating: boundedInteger(value.rivalRating, 0, 9_999, 1_000),
        lastRivalRatingChange: boundedSignedInteger(value.lastRivalRatingChange, -999, 999, 0),
        bestRivalRank: boundedInteger(value.bestRivalRank, 1, 6, 6),
        seasonBestRivalRank: boundedInteger(value.seasonBestRivalRank, 1, 6, 6),
        seasonRivalMatches: boundedInteger(value.seasonRivalMatches, 0, 999_999, 0),
        seasonRivalWins: boundedInteger(value.seasonRivalWins, 0, 999_999, 0),
        seasonRivalPodiums: boundedInteger(value.seasonRivalPodiums, 0, 999_999, 0),
        seasonElitePerformances: boundedInteger(value.seasonElitePerformances, 0, 999_999, 0),
        totalRivalWins: boundedInteger(value.totalRivalWins, 0, 9_999_999, 0),
        claimedRivalContractIds: normalizeIdList(value.claimedRivalContractIds, 16),
        totalRivalRewardCredits: boundedInteger(value.totalRivalRewardCredits, 0, 999_999_999, 0),
        seasonRivalRewardCredits: boundedInteger(value.seasonRivalRewardCredits, 0, 999_999_999, 0),
        seasonRivalGauntletScore: boundedInteger(value.seasonRivalGauntletScore, 0, 99_999_999, 0),
        rivalPodiumStreak: boundedInteger(value.rivalPodiumStreak, 0, 9_999, 0),
        bestRivalPodiumStreak: boundedInteger(value.bestRivalPodiumStreak, 0, 9_999, 0),
        claimedRivalGauntletIds: normalizeIdList(value.claimedRivalGauntletIds, 32),
        totalRivalGauntletRewardCredits: boundedInteger(value.totalRivalGauntletRewardCredits, 0, 999_999_999, 0),
        seasonRivalGauntletRewardCredits: boundedInteger(value.seasonRivalGauntletRewardCredits, 0, 999_999_999, 0),
        daily: normalizeCareerJourneyCycle(value.daily),
        weekly: normalizeCareerJourneyCycle(value.weekly),
    };
}

function normalizeCareerJourneySeasonArchive(value: unknown): readonly CareerJourneySeasonArchive[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => normalizeCareerJourneySeasonRecord(entry))
        .filter((entry): entry is CareerJourneySeasonArchive => entry !== null)
        .filter((entry, index, items) => items.findIndex((item) => item.seasonId === entry.seasonId) === index)
        .slice(0, 12);
}

function normalizeCareerJourneySeasonRecord(value: unknown): CareerJourneySeasonArchive | null {
    if (!isRecord(value)) return null;
    const seasonId = safeString(value.seasonId, '', 32);
    if (!seasonId) return null;
    return {
        seasonId,
        seasonExperience: boundedInteger(value.seasonExperience, 0, 99_999_999, 0),
        completedTierCount: boundedInteger(value.completedTierCount, 0, 20, 0),
        prestigeLevel: boundedInteger(value.prestigeLevel, 0, 10, 0),
        rewardCredits: boundedInteger(value.rewardCredits, 0, 999_999_999, 0),
        perfectDailyCount: boundedInteger(value.perfectDailyCount, 0, 999_999, 0),
        perfectWeeklyCount: boundedInteger(value.perfectWeeklyCount, 0, 999_999, 0),
        bestActiveDayStreak: boundedInteger(value.bestActiveDayStreak, 0, 9_999, 0),
        finalRivalRating: boundedInteger(value.finalRivalRating, 0, 9_999, 1_000),
        finalRivalRank: boundedInteger(value.finalRivalRank, 1, 6, 6),
        completedRivalContractCount: boundedInteger(value.completedRivalContractCount, 0, 8, 0),
        finalRivalGauntletScore: boundedInteger(value.finalRivalGauntletScore, 0, 99_999_999, 0),
        bestRivalPodiumStreak: boundedInteger(value.bestRivalPodiumStreak, 0, 9_999, 0),
        completedRivalGauntletCount: boundedInteger(value.completedRivalGauntletCount, 0, 16, 0),
        archivedAt: boundedInteger(value.archivedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    };
}

function normalizeCareerJourneyCycle(value: unknown): CareerJourneyCycleProgress {
    if (!isRecord(value)) return createEmptyCareerJourneyCycle();
    return {
        id: safeString(value.id, '', 32),
        matches: boundedInteger(value.matches, 0, 999_999, 0),
        wins: boundedInteger(value.wins, 0, 999_999, 0),
        podiums: boundedInteger(value.podiums, 0, 999_999, 0),
        propertyActions: boundedInteger(value.propertyActions, 0, 9_999_999, 0),
        worldTravels: boundedInteger(value.worldTravels, 0, 999_999, 0),
        gameCenterWins: boundedInteger(value.gameCenterWins, 0, 999_999, 0),
        takeovers: boundedInteger(value.takeovers, 0, 999_999, 0),
        classicVictories: boundedInteger(value.classicVictories, 0, 999_999, 0),
        claimedMissionIds: normalizeIdList(value.claimedMissionIds, 16),
    };
}

function normalizeMatchRecord(value: unknown): CareerMatchRecord | null {
    if (!isRecord(value)) return null;
    const id = typeof value.id === 'string' ? value.id.trim().slice(0, 64) : '';
    if (!id) return null;
    const performanceScore = boundedInteger(value.performanceScore, 0, 100, 0);
    const performanceGrade = normalizePerformanceGrade(value.performanceGrade, performanceScore);
    const highlightTitle = typeof value.highlightTitle === 'string'
        ? value.highlightTitle.trim().slice(0, 96) || 'CAREER MATCH RECORD'
        : 'CAREER MATCH RECORD';
    return {
        id,
        playedAt: boundedInteger(value.playedAt, 0, Number.MAX_SAFE_INTEGER, 0),
        rank: boundedInteger(value.rank, 1, 4, 4),
        playerCount: boundedInteger(value.playerCount, 2, 4, 4),
        completedRound: boundedInteger(value.completedRound, 1, 999, 1),
        reason: normalizeMatchReason(value.reason),
        netWorth: boundedInteger(value.netWorth, 0, 999_999_999, 0),
        rewardCredits: boundedInteger(value.rewardCredits, 0, 9_999_999, 0),
        experienceGained: boundedInteger(value.experienceGained, 0, 9_999_999, 0),
        performanceScore,
        performanceGrade,
        awardCount: boundedInteger(value.awardCount, 0, 5, 0),
        highlightTitle,
        classicVictory: value.classicVictory === true,
        activity: normalizeActivity(value.activity),
    };
}

export function normalizeCareerMatchActivity(value: unknown): CareerMatchActivity {
    return normalizeActivity(value);
}

function normalizeActivity(value: unknown): CareerMatchActivity {
    if (!isRecord(value)) return createEmptyCareerMatchActivity();
    return {
        propertyActions: boundedInteger(value.propertyActions, 0, 999, 0),
        worldTravels: boundedInteger(value.worldTravels, 0, 999, 0),
        gameCenterWins: boundedInteger(value.gameCenterWins, 0, 999, 0),
        takeovers: boundedInteger(value.takeovers, 0, 999, 0),
    };
}

function normalizeIdList(value: unknown, limit: number): readonly string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim().slice(0, 64))
        .filter((entry, index, values) => entry.length > 0 && values.indexOf(entry) === index)
        .slice(0, limit);
}

function normalizePerformanceGrade(value: unknown, score: number): CareerPerformanceGrade {
    if (value === 'S' || value === 'A' || value === 'B' || value === 'C' || value === 'D') return value;
    if (score >= 88) return 'S';
    if (score >= 74) return 'A';
    if (score >= 60) return 'B';
    if (score >= 45) return 'C';
    return 'D';
}

function normalizeMatchReason(value: unknown): CareerMatchEndReason {
    if (value === 'LAST_PLAYER') return 'LAST_PLAYER';
    if (value === 'LAST_TEAM') return 'LAST_TEAM';
    if (value === 'TRIPLE_MONOPOLY') return 'TRIPLE_MONOPOLY';
    if (value === 'LINE_MONOPOLY') return 'LINE_MONOPOLY';
    if (value === 'TOURISM_MONOPOLY') return 'TOURISM_MONOPOLY';
    return 'ROUND_LIMIT';
}

function safeString(value: unknown, fallback: string, maximumLength: number): string {
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().slice(0, maximumLength);
    return normalized || fallback;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function boundedSignedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
