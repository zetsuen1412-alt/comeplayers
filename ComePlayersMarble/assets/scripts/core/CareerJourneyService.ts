import type {
    CareerJourneyCycleProgress,
    CareerJourneyProgression,
    CareerJourneySeasonArchive,
    CareerMatchActivity,
} from '../save/CareerProgressionData';

export type CareerJourneyMissionPeriod = 'DAILY' | 'WEEKLY';

export interface CareerJourneyRivalEntry {
    readonly rank: number;
    readonly name: string;
    readonly experience: number;
    readonly rating: number;
    readonly ratingGap: number;
    readonly completedTierCount: number;
    readonly prestigeLevel: number;
    readonly player: boolean;
}

export interface CareerJourneyRivalContractView {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly progress: number;
    readonly target: number;
    readonly rewardCredits: number;
    readonly rewardExperience: number;
    readonly completed: boolean;
    readonly claimed: boolean;
}

export interface CareerJourneyRivalGauntletView {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly progress: number;
    readonly target: number;
    readonly rewardCredits: number;
    readonly rewardExperience: number;
    readonly completed: boolean;
    readonly claimed: boolean;
}

export interface CareerJourneyMissionView {
    readonly id: string;
    readonly period: CareerJourneyMissionPeriod;
    readonly title: string;
    readonly description: string;
    readonly progress: number;
    readonly target: number;
    readonly rewardCredits: number;
    readonly rewardExperience: number;
    readonly completed: boolean;
    readonly claimed: boolean;
}

export interface CareerJourneySnapshot {
    readonly seasonId: string;
    readonly seasonTitle: string;
    readonly level: number;
    readonly maxLevel: number;
    readonly seasonExperience: number;
    readonly experienceIntoLevel: number;
    readonly experienceForNextLevel: number;
    readonly levelProgress: number;
    readonly prestigeLevel: number;
    readonly maxPrestigeLevel: number;
    readonly prestigeExperience: number;
    readonly experienceIntoPrestige: number;
    readonly experienceForNextPrestige: number;
    readonly prestigeProgress: number;
    readonly nextPrestigeRewardCredits: number;
    readonly totalRewardCredits: number;
    readonly seasonRewardCredits: number;
    readonly lifetimeJourneyExperience: number;
    readonly seasonsCompleted: number;
    readonly bestSeasonExperience: number;
    readonly seasonArchive: readonly CareerJourneySeasonArchive[];
    readonly rivalRating: number;
    readonly lastRivalRatingChange: number;
    readonly localRivalRank: number;
    readonly bestRivalRank: number;
    readonly seasonBestRivalRank: number;
    readonly totalRivalWins: number;
    readonly seasonRivalWins: number;
    readonly completedRivalContractCount: number;
    readonly rivalContractCompletionRate: number;
    readonly rivalRewardCredits: number;
    readonly rivalContracts: readonly CareerJourneyRivalContractView[];
    readonly rivalGauntletScore: number;
    readonly rivalGauntletDivision: string;
    readonly rivalGauntletProgress: number;
    readonly rivalGauntletTarget: number;
    readonly rivalGauntletNextRewardCredits: number;
    readonly rivalGauntletRewardCredits: number;
    readonly completedRivalGauntletCount: number;
    readonly rivalPodiumStreak: number;
    readonly bestRivalPodiumStreak: number;
    readonly rivalGauntlets: readonly CareerJourneyRivalGauntletView[];
    readonly localRivalBoard: readonly CareerJourneyRivalEntry[];
    readonly completedTierCount: number;
    readonly nextTierRewardCredits: number;
    readonly activeDayStreak: number;
    readonly bestActiveDayStreak: number;
    readonly seasonBestActiveDayStreak: number;
    readonly totalPerfectDaily: number;
    readonly totalPerfectWeekly: number;
    readonly perfectDailyCompleted: boolean;
    readonly perfectWeeklyCompleted: boolean;
    readonly dailyId: string;
    readonly weeklyId: string;
    readonly dailyResetAt: number;
    readonly weeklyResetAt: number;
    readonly completedDailyCount: number;
    readonly completedWeeklyCount: number;
    readonly dailyMissions: readonly CareerJourneyMissionView[];
    readonly weeklyMissions: readonly CareerJourneyMissionView[];
}
export interface CareerJourneyMatchContext {
    readonly won: boolean;
    readonly rank: number;
    readonly classicVictory: boolean;
    readonly performanceScore: number;
    readonly awardCount: number;
    readonly activity: Readonly<CareerMatchActivity>;
}

export interface CareerJourneyMatchReward {
    readonly progression: CareerJourneyProgression;
    readonly missionCredits: number;
    readonly tierCredits: number;
    readonly perfectCycleCredits: number;
    readonly prestigeCredits: number;
    readonly rivalCredits: number;
    readonly rivalExperience: number;
    readonly rivalRatingChange: number;
    readonly rivalGauntletCredits: number;
    readonly rivalGauntletExperience: number;
    readonly rivalGauntletScoreGained: number;
    readonly experienceGained: number;
    readonly streakBonusExperience: number;
    readonly completedMissionTitles: readonly string[];
    readonly completedRivalContractTitles: readonly string[];
    readonly completedRivalGauntletTitles: readonly string[];
    readonly completedPerfectCycleLabels: readonly string[];
    readonly unlockedTierLabels: readonly string[];
    readonly unlockedPrestigeLabels: readonly string[];
    readonly archivedSeasonLabels: readonly string[];
    readonly snapshot: CareerJourneySnapshot;
}
interface CareerJourneyMissionDefinition {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly target: number;
    readonly rewardCredits: number;
    readonly rewardExperience: number;
    readonly progress: (cycle: CareerJourneyCycleProgress) => number;
}

interface CareerJourneyRivalContractDefinition {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly target: number;
    readonly rewardCredits: number;
    readonly rewardExperience: number;
    readonly progress: (progression: Readonly<CareerJourneyProgression>) => number;
}

interface CareerJourneyRivalGauntletDefinition {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly target: number;
    readonly rewardCredits: number;
    readonly rewardExperience: number;
}

const JOURNEY_MAX_LEVEL = 20;
const JOURNEY_EXPERIENCE_PER_LEVEL = 500;
const JOURNEY_PRESTIGE_MAX_LEVEL = 10;
const JOURNEY_PRESTIGE_EXPERIENCE_PER_LEVEL = 1_000;
const JOURNEY_BASE_EXPERIENCE = JOURNEY_MAX_LEVEL * JOURNEY_EXPERIENCE_PER_LEVEL;
const JOURNEY_MAX_EXPERIENCE = JOURNEY_BASE_EXPERIENCE
    + JOURNEY_PRESTIGE_MAX_LEVEL * JOURNEY_PRESTIGE_EXPERIENCE_PER_LEVEL;
const JOURNEY_SEASON_ARCHIVE_LIMIT = 12;
const PERFECT_DAILY_REWARD_CREDITS = 20_000;
const PERFECT_DAILY_REWARD_EXPERIENCE = 250;
const PERFECT_WEEKLY_REWARD_CREDITS = 75_000;
const PERFECT_WEEKLY_REWARD_EXPERIENCE = 800;
const RIVAL_INITIAL_RATING = 1_000;
const RIVAL_BOARD_SIZE = 6;

const RIVAL_GAUNTLETS: readonly CareerJourneyRivalGauntletDefinition[] = [
    {
        id: 'gauntlet-qualifier',
        title: 'QUALIFIER SIGNAL',
        description: 'Earn 100 Rival Gauntlet points this season.',
        target: 100,
        rewardCredits: 10_000,
        rewardExperience: 100,
    },
    {
        id: 'gauntlet-bronze',
        title: 'BRONZE CIRCUIT',
        description: 'Earn 250 Rival Gauntlet points this season.',
        target: 250,
        rewardCredits: 20_000,
        rewardExperience: 200,
    },
    {
        id: 'gauntlet-silver',
        title: 'SILVER CIRCUIT',
        description: 'Earn 450 Rival Gauntlet points this season.',
        target: 450,
        rewardCredits: 30_000,
        rewardExperience: 300,
    },
    {
        id: 'gauntlet-gold',
        title: 'GOLD CIRCUIT',
        description: 'Earn 700 Rival Gauntlet points this season.',
        target: 700,
        rewardCredits: 45_000,
        rewardExperience: 450,
    },
    {
        id: 'gauntlet-elite',
        title: 'ELITE CIRCUIT',
        description: 'Earn 1,000 Rival Gauntlet points this season.',
        target: 1_000,
        rewardCredits: 70_000,
        rewardExperience: 700,
    },
    {
        id: 'gauntlet-champion',
        title: 'GAUNTLET CHAMPION',
        description: 'Earn 1,400 Rival Gauntlet points this season.',
        target: 1_400,
        rewardCredits: 120_000,
        rewardExperience: 1_200,
    },
];

const RIVAL_CONTRACTS: readonly CareerJourneyRivalContractDefinition[] = [
    {
        id: 'rival-debut',
        title: 'RIVAL DEBUT',
        description: 'Complete one match during the current Journey season.',
        target: 1,
        rewardCredits: 15_000,
        rewardExperience: 150,
        progress: (progression) => progression.seasonRivalMatches,
    },
    {
        id: 'rival-podium-hunter',
        title: 'PODIUM HUNTER',
        description: 'Reach the podium three times during the current Journey season.',
        target: 3,
        rewardCredits: 30_000,
        rewardExperience: 300,
        progress: (progression) => progression.seasonRivalPodiums,
    },
    {
        id: 'rival-elite-signal',
        title: 'ELITE SIGNAL',
        description: 'Earn two A-grade or S-grade performances this season.',
        target: 2,
        rewardCredits: 40_000,
        rewardExperience: 400,
        progress: (progression) => progression.seasonElitePerformances,
    },
    {
        id: 'rival-season-champion',
        title: 'RIVAL BOARD CHAMPION',
        description: 'Reach rank #1 on the local Rival Board this season.',
        target: 1,
        rewardCredits: 100_000,
        rewardExperience: 1_000,
        progress: (progression) => progression.seasonBestRivalRank === 1 ? 1 : 0,
    },
];

const DAILY_MISSION_POOL: readonly CareerJourneyMissionDefinition[] = [
    {
        id: 'daily-match',
        title: 'DAILY MATCH',
        description: 'Complete one Marble World match today.',
        target: 1,
        rewardCredits: 8_000,
        rewardExperience: 120,
        progress: (cycle) => cycle.matches,
    },
    {
        id: 'daily-podium',
        title: 'PODIUM PUSH',
        description: 'Finish one match in the top three today.',
        target: 1,
        rewardCredits: 10_000,
        rewardExperience: 150,
        progress: (cycle) => cycle.podiums,
    },
    {
        id: 'daily-builder',
        title: 'CITY SHIFT',
        description: 'Purchase or upgrade three properties today.',
        target: 3,
        rewardCredits: 9_000,
        rewardExperience: 140,
        progress: (cycle) => cycle.propertyActions,
    },
    {
        id: 'daily-travel',
        title: 'WORLD HOP',
        description: 'Use World Travel once today.',
        target: 1,
        rewardCredits: 12_000,
        rewardExperience: 170,
        progress: (cycle) => cycle.worldTravels,
    },
    {
        id: 'daily-arcade',
        title: 'ARCADE SIGNAL',
        description: 'Win one Game Center challenge today.',
        target: 1,
        rewardCredits: 12_000,
        rewardExperience: 170,
        progress: (cycle) => cycle.gameCenterWins,
    },
    {
        id: 'daily-takeover',
        title: 'CONTROL SHIFT',
        description: 'Complete one property takeover today.',
        target: 1,
        rewardCredits: 13_000,
        rewardExperience: 180,
        progress: (cycle) => cycle.takeovers,
    },
    {
        id: 'daily-win',
        title: 'DAILY CHAMPION',
        description: 'Win one Marble World match today.',
        target: 1,
        rewardCredits: 15_000,
        rewardExperience: 220,
        progress: (cycle) => cycle.wins,
    },
    {
        id: 'daily-classic',
        title: 'CLASSIC FINISH',
        description: 'Win by Triple, Line, or Tourism Monopoly today.',
        target: 1,
        rewardCredits: 20_000,
        rewardExperience: 260,
        progress: (cycle) => cycle.classicVictories,
    },
];

const WEEKLY_MISSION_POOL: readonly CareerJourneyMissionDefinition[] = [
    {
        id: 'weekly-matches',
        title: 'WEEKLY CIRCUIT',
        description: 'Complete five Marble World matches this week.',
        target: 5,
        rewardCredits: 30_000,
        rewardExperience: 420,
        progress: (cycle) => cycle.matches,
    },
    {
        id: 'weekly-wins',
        title: 'WINNING ROUTE',
        description: 'Win two Marble World matches this week.',
        target: 2,
        rewardCredits: 38_000,
        rewardExperience: 500,
        progress: (cycle) => cycle.wins,
    },
    {
        id: 'weekly-podiums',
        title: 'PODIUM SERIES',
        description: 'Reach the podium four times this week.',
        target: 4,
        rewardCredits: 32_000,
        rewardExperience: 440,
        progress: (cycle) => cycle.podiums,
    },
    {
        id: 'weekly-builder',
        title: 'DISTRICT ENGINEER',
        description: 'Purchase or upgrade fifteen properties this week.',
        target: 15,
        rewardCredits: 35_000,
        rewardExperience: 480,
        progress: (cycle) => cycle.propertyActions,
    },
    {
        id: 'weekly-travel',
        title: 'WORLD CIRCUIT',
        description: 'Use World Travel three times this week.',
        target: 3,
        rewardCredits: 36_000,
        rewardExperience: 500,
        progress: (cycle) => cycle.worldTravels,
    },
    {
        id: 'weekly-arcade',
        title: 'GAME CENTER TOUR',
        description: 'Win two Game Center challenges this week.',
        target: 2,
        rewardCredits: 36_000,
        rewardExperience: 500,
        progress: (cycle) => cycle.gameCenterWins,
    },
    {
        id: 'weekly-takeover',
        title: 'TAKEOVER CAMPAIGN',
        description: 'Complete three property takeovers this week.',
        target: 3,
        rewardCredits: 42_000,
        rewardExperience: 560,
        progress: (cycle) => cycle.takeovers,
    },
    {
        id: 'weekly-classic',
        title: 'CLASSIC VICTORY WEEK',
        description: 'Win once by Triple, Line, or Tourism Monopoly this week.',
        target: 1,
        rewardCredits: 50_000,
        rewardExperience: 650,
        progress: (cycle) => cycle.classicVictories,
    },
];

export class CareerJourneyService {
    public snapshot(
        progressionValue: Readonly<CareerJourneyProgression>,
        timestamp: number = Date.now(),
    ): CareerJourneySnapshot {
        const progression = this.alignProgression(progressionValue, timestamp);
        const dailyDefinitions = this.selectMissionDefinitions(DAILY_MISSION_POOL, progression.daily.id, 3);
        const weeklyDefinitions = this.selectMissionDefinitions(WEEKLY_MISSION_POOL, progression.weekly.id, 4);
        const completedTierCount = this.completedTierCount(progression.seasonExperience);
        const level = completedTierCount >= JOURNEY_MAX_LEVEL
            ? JOURNEY_MAX_LEVEL
            : completedTierCount + 1;
        const experienceIntoLevel = completedTierCount >= JOURNEY_MAX_LEVEL
            ? JOURNEY_EXPERIENCE_PER_LEVEL
            : progression.seasonExperience % JOURNEY_EXPERIENCE_PER_LEVEL;
        const nextTier = Math.min(JOURNEY_MAX_LEVEL, completedTierCount + 1);
        const prestigeExperience = Math.max(0, progression.seasonExperience - JOURNEY_BASE_EXPERIENCE);
        const prestigeLevel = this.prestigeLevel(progression.seasonExperience);
        const experienceIntoPrestige = prestigeLevel >= JOURNEY_PRESTIGE_MAX_LEVEL
            ? JOURNEY_PRESTIGE_EXPERIENCE_PER_LEVEL
            : prestigeExperience % JOURNEY_PRESTIGE_EXPERIENCE_PER_LEVEL;
        const localRivalBoard = this.localRivalBoard(
            progression.seasonExperience,
            progression.rivalRating,
            progression.seasonId,
        );
        const localRivalRank = localRivalBoard.find((entry) => entry.player)?.rank ?? localRivalBoard.length;
        const rivalContracts = RIVAL_CONTRACTS.map((definition) => this.rivalContractView(definition, progression));
        const completedRivalContractCount = rivalContracts.filter((contract) => contract.completed).length;
        const rivalGauntlets = RIVAL_GAUNTLETS.map((definition) => this.rivalGauntletView(definition, progression));
        const completedRivalGauntletCount = rivalGauntlets.filter((gauntlet) => gauntlet.completed).length;
        const nextRivalGauntlet = RIVAL_GAUNTLETS.find(
            (definition) => progression.seasonRivalGauntletScore < definition.target,
        );
        const previousGauntletTarget = completedRivalGauntletCount > 0
            ? RIVAL_GAUNTLETS[Math.min(completedRivalGauntletCount - 1, RIVAL_GAUNTLETS.length - 1)].target
            : 0;
        const gauntletRange = nextRivalGauntlet
            ? Math.max(1, nextRivalGauntlet.target - previousGauntletTarget)
            : 1;
        const rivalGauntletProgress = nextRivalGauntlet
            ? Math.max(0, Math.min(1, (progression.seasonRivalGauntletScore - previousGauntletTarget) / gauntletRange))
            : 1;
        const rivalGauntletDivision = completedRivalGauntletCount > 0
            ? RIVAL_GAUNTLETS[Math.min(completedRivalGauntletCount - 1, RIVAL_GAUNTLETS.length - 1)].title
            : 'OPEN QUALIFIER';
        return {
            seasonId: progression.seasonId,
            seasonTitle: this.seasonTitle(progression.seasonId),
            level,
            maxLevel: JOURNEY_MAX_LEVEL,
            seasonExperience: progression.seasonExperience,
            experienceIntoLevel,
            experienceForNextLevel: JOURNEY_EXPERIENCE_PER_LEVEL,
            levelProgress: completedTierCount >= JOURNEY_MAX_LEVEL
                ? 1
                : experienceIntoLevel / JOURNEY_EXPERIENCE_PER_LEVEL,
            prestigeLevel,
            maxPrestigeLevel: JOURNEY_PRESTIGE_MAX_LEVEL,
            prestigeExperience,
            experienceIntoPrestige,
            experienceForNextPrestige: JOURNEY_PRESTIGE_EXPERIENCE_PER_LEVEL,
            prestigeProgress: prestigeLevel >= JOURNEY_PRESTIGE_MAX_LEVEL
                ? 1
                : experienceIntoPrestige / JOURNEY_PRESTIGE_EXPERIENCE_PER_LEVEL,
            nextPrestigeRewardCredits: completedTierCount < JOURNEY_MAX_LEVEL
                || prestigeLevel >= JOURNEY_PRESTIGE_MAX_LEVEL
                ? 0
                : this.prestigeRewardCredits(prestigeLevel + 1),
            totalRewardCredits: progression.totalRewardCredits,
            seasonRewardCredits: progression.seasonRewardCredits,
            lifetimeJourneyExperience: progression.lifetimeJourneyExperience,
            seasonsCompleted: progression.seasonsCompleted,
            bestSeasonExperience: progression.bestSeasonExperience,
            seasonArchive: progression.seasonArchive,
            rivalRating: progression.rivalRating,
            lastRivalRatingChange: progression.lastRivalRatingChange,
            localRivalRank,
            bestRivalRank: progression.bestRivalRank,
            seasonBestRivalRank: progression.seasonBestRivalRank,
            totalRivalWins: progression.totalRivalWins,
            seasonRivalWins: progression.seasonRivalWins,
            completedRivalContractCount,
            rivalContractCompletionRate: RIVAL_CONTRACTS.length > 0
                ? completedRivalContractCount / RIVAL_CONTRACTS.length
                : 0,
            rivalRewardCredits: progression.totalRivalRewardCredits,
            rivalContracts,
            rivalGauntletScore: progression.seasonRivalGauntletScore,
            rivalGauntletDivision,
            rivalGauntletProgress,
            rivalGauntletTarget: nextRivalGauntlet?.target ?? RIVAL_GAUNTLETS[RIVAL_GAUNTLETS.length - 1].target,
            rivalGauntletNextRewardCredits: nextRivalGauntlet?.rewardCredits ?? 0,
            rivalGauntletRewardCredits: progression.totalRivalGauntletRewardCredits,
            completedRivalGauntletCount,
            rivalPodiumStreak: progression.rivalPodiumStreak,
            bestRivalPodiumStreak: progression.bestRivalPodiumStreak,
            rivalGauntlets,
            localRivalBoard,
            completedTierCount,
            nextTierRewardCredits: completedTierCount >= JOURNEY_MAX_LEVEL
                ? 0
                : this.tierRewardCredits(nextTier),
            activeDayStreak: progression.activeDayStreak,
            bestActiveDayStreak: progression.bestActiveDayStreak,
            seasonBestActiveDayStreak: progression.seasonBestActiveDayStreak,
            totalPerfectDaily: progression.totalPerfectDaily,
            totalPerfectWeekly: progression.totalPerfectWeekly,
            perfectDailyCompleted: this.isPerfectCycle(dailyDefinitions, progression.daily),
            perfectWeeklyCompleted: this.isPerfectCycle(weeklyDefinitions, progression.weekly),
            dailyId: progression.daily.id,
            weeklyId: progression.weekly.id,
            dailyResetAt: nextUtcDay(timestamp),
            weeklyResetAt: nextUtcWeek(timestamp),
            completedDailyCount: dailyDefinitions.filter((definition) => (
                definition.progress(progression.daily) >= definition.target
            )).length,
            completedWeeklyCount: weeklyDefinitions.filter((definition) => (
                definition.progress(progression.weekly) >= definition.target
            )).length,
            dailyMissions: dailyDefinitions.map((definition) => this.missionView('DAILY', definition, progression.daily)),
            weeklyMissions: weeklyDefinitions.map((definition) => this.missionView('WEEKLY', definition, progression.weekly)),
        };
    }

    public recordMatch(
        progressionValue: Readonly<CareerJourneyProgression>,
        context: Readonly<CareerJourneyMatchContext>,
        timestamp: number = Date.now(),
    ): CareerJourneyMatchReward {
        const archivedSeasonIdsBefore = new Set(progressionValue.seasonArchive.map((entry) => entry.seasonId));
        const aligned = this.alignProgression(progressionValue, timestamp);
        const archivedSeasonLabels = aligned.seasonArchive
            .filter((entry) => !archivedSeasonIdsBefore.has(entry.seasonId))
            .map((entry) => `SEASON ${entry.seasonId} ARCHIVED`);
        const dailyDefinitions = this.selectMissionDefinitions(DAILY_MISSION_POOL, aligned.daily.id, 3);
        const weeklyDefinitions = this.selectMissionDefinitions(WEEKLY_MISSION_POOL, aligned.weekly.id, 4);
        const streak = this.activityStreak(aligned, timestamp);
        const daily = this.incrementCycle(aligned.daily, context);
        const weekly = this.incrementCycle(aligned.weekly, context);
        const rivalRatingChange = this.rivalRatingChange(context);
        const rivalRating = Math.max(0, Math.min(9_999, aligned.rivalRating + rivalRatingChange));
        const rivalPodiumStreak = context.rank <= 3 ? aligned.rivalPodiumStreak + 1 : 0;
        const rivalGauntletScoreGained = this.rivalGauntletScoreGain(context, rivalPodiumStreak);
        const provisionalRivalProgression: CareerJourneyProgression = {
            ...aligned,
            rivalRating,
            lastRivalRatingChange: rivalRatingChange,
            seasonRivalMatches: aligned.seasonRivalMatches + 1,
            seasonRivalWins: aligned.seasonRivalWins + (context.won ? 1 : 0),
            seasonRivalPodiums: aligned.seasonRivalPodiums + (context.rank <= 3 ? 1 : 0),
            seasonElitePerformances: aligned.seasonElitePerformances + (context.performanceScore >= 74 ? 1 : 0),
            totalRivalWins: aligned.totalRivalWins + (context.won ? 1 : 0),
            seasonRivalGauntletScore: aligned.seasonRivalGauntletScore + rivalGauntletScoreGained,
            rivalPodiumStreak,
            bestRivalPodiumStreak: Math.max(aligned.bestRivalPodiumStreak, rivalPodiumStreak),
        };
        const nextRivalBoard = this.localRivalBoard(
            aligned.seasonExperience,
            rivalRating,
            aligned.seasonId,
        );
        const nextRivalRank = nextRivalBoard.find((entry) => entry.player)?.rank ?? RIVAL_BOARD_SIZE;
        const rivalProgression: CareerJourneyProgression = {
            ...provisionalRivalProgression,
            bestRivalRank: Math.min(aligned.bestRivalRank, nextRivalRank),
            seasonBestRivalRank: Math.min(aligned.seasonBestRivalRank, nextRivalRank),
        };
        const completedRivalContracts = this.newlyCompletedRivalContracts(aligned, rivalProgression);
        const rivalCredits = completedRivalContracts.reduce(
            (total, definition) => total + definition.rewardCredits,
            0,
        );
        const rivalExperience = completedRivalContracts.reduce(
            (total, definition) => total + definition.rewardExperience,
            0,
        );
        const completedRivalGauntlets = this.newlyCompletedRivalGauntlets(aligned, rivalProgression);
        const rivalGauntletCredits = completedRivalGauntlets.reduce(
            (total, definition) => total + definition.rewardCredits,
            0,
        );
        const rivalGauntletExperience = completedRivalGauntlets.reduce(
            (total, definition) => total + definition.rewardExperience,
            0,
        );

        const completedDaily = this.newlyCompleted(dailyDefinitions, aligned.daily, daily);
        const completedWeekly = this.newlyCompleted(weeklyDefinitions, aligned.weekly, weekly);
        const completedMissions = [...completedDaily, ...completedWeekly];
        const missionCredits = completedMissions.reduce((total, definition) => total + definition.rewardCredits, 0);
        const missionExperience = completedMissions.reduce((total, definition) => total + definition.rewardExperience, 0);

        const perfectDaily = this.isPerfectCycle(dailyDefinitions, daily)
            && aligned.perfectDailyIds.indexOf(daily.id) < 0;
        const perfectWeekly = this.isPerfectCycle(weeklyDefinitions, weekly)
            && aligned.perfectWeeklyIds.indexOf(weekly.id) < 0;
        const completedPerfectCycleLabels = [
            ...(perfectDaily ? ['PERFECT JOURNEY DAY'] : []),
            ...(perfectWeekly ? ['PERFECT JOURNEY WEEK'] : []),
        ];
        const perfectCycleCredits = (perfectDaily ? PERFECT_DAILY_REWARD_CREDITS : 0)
            + (perfectWeekly ? PERFECT_WEEKLY_REWARD_CREDITS : 0);
        const perfectCycleExperience = (perfectDaily ? PERFECT_DAILY_REWARD_EXPERIENCE : 0)
            + (perfectWeekly ? PERFECT_WEEKLY_REWARD_EXPERIENCE : 0);
        const streakBonusExperience = streak.firstMatchToday
            ? Math.min(100, 20 + Math.max(0, streak.activeDayStreak - 1) * 10)
            : 0;
        const matchExperience = this.matchExperience(context);
        const experienceGainedValue = matchExperience
            + missionExperience
            + perfectCycleExperience
            + rivalExperience
            + rivalGauntletExperience
            + streakBonusExperience;
        const previousExperience = aligned.seasonExperience;
        const seasonExperience = Math.min(JOURNEY_MAX_EXPERIENCE, previousExperience + experienceGainedValue);
        const unlockedTiers = this.newlyUnlockedTiers(previousExperience, seasonExperience, aligned.claimedTierIds);
        const unlockedPrestige = this.newlyUnlockedPrestige(
            previousExperience,
            seasonExperience,
            aligned.claimedPrestigeIds,
        );
        const tierCredits = unlockedTiers.reduce((total, tier) => total + this.tierRewardCredits(tier), 0);
        const prestigeCredits = unlockedPrestige.reduce(
            (total, prestige) => total + this.prestigeRewardCredits(prestige),
            0,
        );
        const rewardCreditsGained = missionCredits
            + tierCredits
            + perfectCycleCredits
            + prestigeCredits
            + rivalCredits
            + rivalGauntletCredits;
        const actualExperienceGained = Math.max(0, seasonExperience - previousExperience);
        const progression: CareerJourneyProgression = {
            seasonId: aligned.seasonId,
            seasonExperience,
            claimedTierIds: uniqueIds([
                ...aligned.claimedTierIds,
                ...unlockedTiers.map((tier) => this.tierId(tier)),
            ], 64),
            claimedPrestigeIds: uniqueIds([
                ...aligned.claimedPrestigeIds,
                ...unlockedPrestige.map((prestige) => this.prestigeId(prestige)),
            ], 32),
            perfectDailyIds: uniqueIds([
                ...aligned.perfectDailyIds,
                ...(perfectDaily ? [daily.id] : []),
            ], 64),
            perfectWeeklyIds: uniqueIds([
                ...aligned.perfectWeeklyIds,
                ...(perfectWeekly ? [weekly.id] : []),
            ], 32),
            totalRewardCredits: aligned.totalRewardCredits + rewardCreditsGained,
            seasonRewardCredits: aligned.seasonRewardCredits + rewardCreditsGained,
            activeDayStreak: streak.activeDayStreak,
            bestActiveDayStreak: Math.max(aligned.bestActiveDayStreak, streak.activeDayStreak),
            seasonBestActiveDayStreak: Math.max(aligned.seasonBestActiveDayStreak, streak.activeDayStreak),
            lastActiveDayId: streak.lastActiveDayId,
            totalPerfectDaily: aligned.totalPerfectDaily + (perfectDaily ? 1 : 0),
            totalPerfectWeekly: aligned.totalPerfectWeekly + (perfectWeekly ? 1 : 0),
            seasonPerfectDaily: aligned.seasonPerfectDaily + (perfectDaily ? 1 : 0),
            seasonPerfectWeekly: aligned.seasonPerfectWeekly + (perfectWeekly ? 1 : 0),
            lifetimeJourneyExperience: aligned.lifetimeJourneyExperience + actualExperienceGained,
            seasonsCompleted: aligned.seasonsCompleted,
            bestSeasonExperience: aligned.bestSeasonExperience,
            seasonArchive: aligned.seasonArchive,
            rivalRating: rivalProgression.rivalRating,
            lastRivalRatingChange: rivalProgression.lastRivalRatingChange,
            bestRivalRank: rivalProgression.bestRivalRank,
            seasonBestRivalRank: rivalProgression.seasonBestRivalRank,
            seasonRivalMatches: rivalProgression.seasonRivalMatches,
            seasonRivalWins: rivalProgression.seasonRivalWins,
            seasonRivalPodiums: rivalProgression.seasonRivalPodiums,
            seasonElitePerformances: rivalProgression.seasonElitePerformances,
            totalRivalWins: rivalProgression.totalRivalWins,
            claimedRivalContractIds: uniqueIds([
                ...aligned.claimedRivalContractIds,
                ...completedRivalContracts.map((definition) => definition.id),
            ], 16),
            totalRivalRewardCredits: aligned.totalRivalRewardCredits + rivalCredits,
            seasonRivalRewardCredits: aligned.seasonRivalRewardCredits + rivalCredits,
            seasonRivalGauntletScore: rivalProgression.seasonRivalGauntletScore,
            rivalPodiumStreak: rivalProgression.rivalPodiumStreak,
            bestRivalPodiumStreak: rivalProgression.bestRivalPodiumStreak,
            claimedRivalGauntletIds: uniqueIds([
                ...aligned.claimedRivalGauntletIds,
                ...completedRivalGauntlets.map((definition) => definition.id),
            ], 32),
            totalRivalGauntletRewardCredits: aligned.totalRivalGauntletRewardCredits + rivalGauntletCredits,
            seasonRivalGauntletRewardCredits: aligned.seasonRivalGauntletRewardCredits + rivalGauntletCredits,
            daily: {
                ...daily,
                claimedMissionIds: uniqueIds([
                    ...daily.claimedMissionIds,
                    ...completedDaily.map((definition) => definition.id),
                ], 16),
            },
            weekly: {
                ...weekly,
                claimedMissionIds: uniqueIds([
                    ...weekly.claimedMissionIds,
                    ...completedWeekly.map((definition) => definition.id),
                ], 16),
            },
        };
        return {
            progression,
            missionCredits,
            tierCredits,
            perfectCycleCredits,
            prestigeCredits,
            rivalCredits,
            rivalExperience,
            rivalRatingChange,
            rivalGauntletCredits,
            rivalGauntletExperience,
            rivalGauntletScoreGained,
            experienceGained: actualExperienceGained,
            streakBonusExperience,
            completedMissionTitles: completedMissions.map((definition) => definition.title),
            completedRivalContractTitles: completedRivalContracts.map((definition) => definition.title),
            completedRivalGauntletTitles: completedRivalGauntlets.map((definition) => definition.title),
            completedPerfectCycleLabels,
            unlockedTierLabels: unlockedTiers.map((tier) => `JOURNEY TIER ${tier}`),
            unlockedPrestigeLabels: unlockedPrestige.map((prestige) => `JOURNEY PRESTIGE ${prestige}`),
            archivedSeasonLabels,
            snapshot: this.snapshot(progression, timestamp),
        };
    }

    public alignProgression(
        progressionValue: Readonly<CareerJourneyProgression>,
        timestamp: number = Date.now(),
    ): CareerJourneyProgression {
        const seasonId = journeySeasonId(timestamp);
        const dailyId = journeyDayId(timestamp);
        const weeklyId = journeyWeekId(timestamp);
        const sameSeason = progressionValue.seasonId === seasonId;
        const hasPreviousSeason = progressionValue.seasonId.length > 0 && !sameSeason;
        const previousAlreadyArchived = progressionValue.seasonArchive.some(
            (entry) => entry.seasonId === progressionValue.seasonId,
        );
        const shouldArchivePrevious = hasPreviousSeason && !previousAlreadyArchived;
        const archivedPrevious: CareerJourneySeasonArchive | null = shouldArchivePrevious
            ? {
                seasonId: progressionValue.seasonId,
                seasonExperience: progressionValue.seasonExperience,
                completedTierCount: this.completedTierCount(progressionValue.seasonExperience),
                prestigeLevel: this.prestigeLevel(progressionValue.seasonExperience),
                rewardCredits: progressionValue.seasonRewardCredits,
                perfectDailyCount: progressionValue.seasonPerfectDaily,
                perfectWeeklyCount: progressionValue.seasonPerfectWeekly,
                bestActiveDayStreak: progressionValue.seasonBestActiveDayStreak,
                finalRivalRating: progressionValue.rivalRating,
                finalRivalRank: this.localRivalBoard(
                    progressionValue.seasonExperience,
                    progressionValue.rivalRating,
                    progressionValue.seasonId,
                ).find((entry) => entry.player)?.rank ?? RIVAL_BOARD_SIZE,
                completedRivalContractCount: progressionValue.claimedRivalContractIds.length,
                finalRivalGauntletScore: progressionValue.seasonRivalGauntletScore,
                bestRivalPodiumStreak: progressionValue.bestRivalPodiumStreak,
                completedRivalGauntletCount: progressionValue.claimedRivalGauntletIds.length,
                archivedAt: Math.max(0, Math.trunc(timestamp)),
            }
            : null;
        const seasonArchive = archivedPrevious
            ? [archivedPrevious, ...progressionValue.seasonArchive].slice(0, JOURNEY_SEASON_ARCHIVE_LIMIT)
            : progressionValue.seasonArchive.slice(0, JOURNEY_SEASON_ARCHIVE_LIMIT);
        return {
            seasonId,
            seasonExperience: sameSeason ? progressionValue.seasonExperience : 0,
            claimedTierIds: sameSeason ? progressionValue.claimedTierIds : [],
            claimedPrestigeIds: sameSeason ? progressionValue.claimedPrestigeIds : [],
            perfectDailyIds: sameSeason ? progressionValue.perfectDailyIds : [],
            perfectWeeklyIds: sameSeason ? progressionValue.perfectWeeklyIds : [],
            totalRewardCredits: progressionValue.totalRewardCredits,
            seasonRewardCredits: sameSeason ? progressionValue.seasonRewardCredits : 0,
            activeDayStreak: progressionValue.activeDayStreak,
            bestActiveDayStreak: progressionValue.bestActiveDayStreak,
            seasonBestActiveDayStreak: sameSeason ? progressionValue.seasonBestActiveDayStreak : 0,
            lastActiveDayId: progressionValue.lastActiveDayId,
            totalPerfectDaily: progressionValue.totalPerfectDaily,
            totalPerfectWeekly: progressionValue.totalPerfectWeekly,
            seasonPerfectDaily: sameSeason ? progressionValue.seasonPerfectDaily : 0,
            seasonPerfectWeekly: sameSeason ? progressionValue.seasonPerfectWeekly : 0,
            lifetimeJourneyExperience: progressionValue.lifetimeJourneyExperience,
            seasonsCompleted: progressionValue.seasonsCompleted + (shouldArchivePrevious ? 1 : 0),
            bestSeasonExperience: shouldArchivePrevious
                ? Math.max(progressionValue.bestSeasonExperience, progressionValue.seasonExperience)
                : progressionValue.bestSeasonExperience,
            seasonArchive,
            rivalRating: sameSeason ? progressionValue.rivalRating : RIVAL_INITIAL_RATING,
            lastRivalRatingChange: sameSeason ? progressionValue.lastRivalRatingChange : 0,
            bestRivalRank: progressionValue.bestRivalRank,
            seasonBestRivalRank: sameSeason ? progressionValue.seasonBestRivalRank : RIVAL_BOARD_SIZE,
            seasonRivalMatches: sameSeason ? progressionValue.seasonRivalMatches : 0,
            seasonRivalWins: sameSeason ? progressionValue.seasonRivalWins : 0,
            seasonRivalPodiums: sameSeason ? progressionValue.seasonRivalPodiums : 0,
            seasonElitePerformances: sameSeason ? progressionValue.seasonElitePerformances : 0,
            totalRivalWins: progressionValue.totalRivalWins,
            claimedRivalContractIds: sameSeason ? progressionValue.claimedRivalContractIds : [],
            totalRivalRewardCredits: progressionValue.totalRivalRewardCredits,
            seasonRivalRewardCredits: sameSeason ? progressionValue.seasonRivalRewardCredits : 0,
            seasonRivalGauntletScore: sameSeason ? progressionValue.seasonRivalGauntletScore : 0,
            rivalPodiumStreak: sameSeason ? progressionValue.rivalPodiumStreak : 0,
            bestRivalPodiumStreak: sameSeason ? progressionValue.bestRivalPodiumStreak : 0,
            claimedRivalGauntletIds: sameSeason ? progressionValue.claimedRivalGauntletIds : [],
            totalRivalGauntletRewardCredits: progressionValue.totalRivalGauntletRewardCredits,
            seasonRivalGauntletRewardCredits: sameSeason ? progressionValue.seasonRivalGauntletRewardCredits : 0,
            daily: progressionValue.daily.id === dailyId
                ? progressionValue.daily
                : createCycle(dailyId),
            weekly: progressionValue.weekly.id === weeklyId
                ? progressionValue.weekly
                : createCycle(weeklyId),
        };
    }

    private incrementCycle(
        cycle: Readonly<CareerJourneyCycleProgress>,
        context: Readonly<CareerJourneyMatchContext>,
    ): CareerJourneyCycleProgress {
        return {
            ...cycle,
            matches: cycle.matches + 1,
            wins: cycle.wins + (context.won ? 1 : 0),
            podiums: cycle.podiums + (context.rank <= 3 ? 1 : 0),
            propertyActions: cycle.propertyActions + context.activity.propertyActions,
            worldTravels: cycle.worldTravels + context.activity.worldTravels,
            gameCenterWins: cycle.gameCenterWins + context.activity.gameCenterWins,
            takeovers: cycle.takeovers + context.activity.takeovers,
            classicVictories: cycle.classicVictories + (context.classicVictory ? 1 : 0),
        };
    }

    private newlyCompleted(
        definitions: readonly CareerJourneyMissionDefinition[],
        before: Readonly<CareerJourneyCycleProgress>,
        after: Readonly<CareerJourneyCycleProgress>,
    ): readonly CareerJourneyMissionDefinition[] {
        return definitions.filter((definition) => (
            after.claimedMissionIds.indexOf(definition.id) < 0
            && definition.progress(after) >= definition.target
            && definition.progress(before) < definition.target
        ));
    }

    private newlyCompletedRivalContracts(
        before: Readonly<CareerJourneyProgression>,
        after: Readonly<CareerJourneyProgression>,
    ): readonly CareerJourneyRivalContractDefinition[] {
        return RIVAL_CONTRACTS.filter((definition) => (
            before.claimedRivalContractIds.indexOf(definition.id) < 0
            && definition.progress(after) >= definition.target
            && definition.progress(before) < definition.target
        ));
    }

    private rivalContractView(
        definition: Readonly<CareerJourneyRivalContractDefinition>,
        progression: Readonly<CareerJourneyProgression>,
    ): CareerJourneyRivalContractView {
        const progress = definition.progress(progression);
        return {
            id: definition.id,
            title: definition.title,
            description: definition.description,
            progress: Math.min(progress, definition.target),
            target: definition.target,
            rewardCredits: definition.rewardCredits,
            rewardExperience: definition.rewardExperience,
            completed: progress >= definition.target,
            claimed: progression.claimedRivalContractIds.indexOf(definition.id) >= 0,
        };
    }

    private newlyCompletedRivalGauntlets(
        before: Readonly<CareerJourneyProgression>,
        after: Readonly<CareerJourneyProgression>,
    ): readonly CareerJourneyRivalGauntletDefinition[] {
        return RIVAL_GAUNTLETS.filter((definition) => (
            before.claimedRivalGauntletIds.indexOf(definition.id) < 0
            && after.seasonRivalGauntletScore >= definition.target
            && before.seasonRivalGauntletScore < definition.target
        ));
    }

    private rivalGauntletView(
        definition: Readonly<CareerJourneyRivalGauntletDefinition>,
        progression: Readonly<CareerJourneyProgression>,
    ): CareerJourneyRivalGauntletView {
        return {
            id: definition.id,
            title: definition.title,
            description: definition.description,
            progress: Math.min(progression.seasonRivalGauntletScore, definition.target),
            target: definition.target,
            rewardCredits: definition.rewardCredits,
            rewardExperience: definition.rewardExperience,
            completed: progression.seasonRivalGauntletScore >= definition.target,
            claimed: progression.claimedRivalGauntletIds.indexOf(definition.id) >= 0,
        };
    }

    private rivalGauntletScoreGain(
        context: Readonly<CareerJourneyMatchContext>,
        podiumStreak: number,
    ): number {
        const placementScore = context.rank === 1
            ? 90
            : context.rank === 2
                ? 60
                : context.rank === 3
                    ? 40
                    : 20;
        const performanceScore = Math.max(0, Math.round(context.performanceScore * 0.45));
        const awardScore = Math.min(40, context.awardCount * 10);
        const classicScore = context.classicVictory ? 50 : 0;
        const podiumStreakScore = context.rank <= 3 ? Math.min(60, podiumStreak * 10) : 0;
        return Math.max(10, placementScore + performanceScore + awardScore + classicScore + podiumStreakScore);
    }

    private rivalRatingChange(context: Readonly<CareerJourneyMatchContext>): number {
        const placementChange = context.rank === 1
            ? 90
            : context.rank === 2
                ? 48
                : context.rank === 3
                    ? 18
                    : -28;
        const performanceChange = Math.max(-24, Math.min(36, Math.round((context.performanceScore - 58) * 0.72)));
        const awardChange = Math.min(24, context.awardCount * 8);
        const classicChange = context.classicVictory ? 40 : 0;
        return Math.max(-60, Math.min(180, placementChange + performanceChange + awardChange + classicChange));
    }

    private isPerfectCycle(
        definitions: readonly CareerJourneyMissionDefinition[],
        cycle: Readonly<CareerJourneyCycleProgress>,
    ): boolean {
        return definitions.length > 0
            && definitions.every((definition) => definition.progress(cycle) >= definition.target);
    }

    private activityStreak(
        progression: Readonly<CareerJourneyProgression>,
        timestamp: number,
    ): {
        readonly firstMatchToday: boolean;
        readonly activeDayStreak: number;
        readonly lastActiveDayId: string;
    } {
        const currentDayId = journeyDayId(timestamp);
        const firstMatchToday = progression.daily.matches === 0;
        if (!firstMatchToday) {
            return {
                firstMatchToday: false,
                activeDayStreak: progression.activeDayStreak,
                lastActiveDayId: currentDayId,
            };
        }
        const previousDayId = journeyDayId(timestamp - 86_400_000);
        const activeDayStreak = progression.lastActiveDayId === previousDayId
            ? progression.activeDayStreak + 1
            : progression.lastActiveDayId === currentDayId
                ? Math.max(1, progression.activeDayStreak)
                : 1;
        return {
            firstMatchToday: true,
            activeDayStreak,
            lastActiveDayId: currentDayId,
        };
    }

    private missionView(
        period: CareerJourneyMissionPeriod,
        definition: CareerJourneyMissionDefinition,
        cycle: Readonly<CareerJourneyCycleProgress>,
    ): CareerJourneyMissionView {
        const progress = definition.progress(cycle);
        return {
            id: definition.id,
            period,
            title: definition.title,
            description: definition.description,
            progress: Math.min(progress, definition.target),
            target: definition.target,
            rewardCredits: definition.rewardCredits,
            rewardExperience: definition.rewardExperience,
            completed: progress >= definition.target,
            claimed: cycle.claimedMissionIds.indexOf(definition.id) >= 0,
        };
    }

    private selectMissionDefinitions(
        pool: readonly CareerJourneyMissionDefinition[],
        cycleId: string,
        count: number,
    ): readonly CareerJourneyMissionDefinition[] {
        const selected: CareerJourneyMissionDefinition[] = [];
        let cursor = hashString(cycleId) % pool.length;
        const step = pool.length > 5 ? 3 : 1;
        while (selected.length < Math.min(count, pool.length)) {
            const definition = pool[cursor % pool.length] as CareerJourneyMissionDefinition;
            if (!selected.includes(definition)) selected.push(definition);
            cursor += step;
        }
        return selected;
    }

    private matchExperience(context: Readonly<CareerJourneyMatchContext>): number {
        const activityExperience = context.activity.propertyActions * 8
            + context.activity.worldTravels * 24
            + context.activity.gameCenterWins * 30
            + context.activity.takeovers * 28;
        return Math.min(
            340,
            70
                + (context.won ? 90 : 0)
                + (context.rank <= 3 ? 35 : 0)
                + (context.classicVictory ? 70 : 0)
                + Math.round(context.performanceScore * 0.55)
                + context.awardCount * 18
                + activityExperience,
        );
    }

    private newlyUnlockedTiers(
        previousExperience: number,
        nextExperience: number,
        claimedTierIds: readonly string[],
    ): readonly number[] {
        const unlocked: number[] = [];
        for (let tier = 1; tier <= JOURNEY_MAX_LEVEL; tier++) {
            const threshold = tier * JOURNEY_EXPERIENCE_PER_LEVEL;
            if (
                previousExperience < threshold
                && nextExperience >= threshold
                && claimedTierIds.indexOf(this.tierId(tier)) < 0
            ) {
                unlocked.push(tier);
            }
        }
        return unlocked;
    }

    private newlyUnlockedPrestige(
        previousExperience: number,
        nextExperience: number,
        claimedPrestigeIds: readonly string[],
    ): readonly number[] {
        const unlocked: number[] = [];
        for (let prestige = 1; prestige <= JOURNEY_PRESTIGE_MAX_LEVEL; prestige++) {
            const threshold = JOURNEY_BASE_EXPERIENCE
                + prestige * JOURNEY_PRESTIGE_EXPERIENCE_PER_LEVEL;
            if (
                previousExperience < threshold
                && nextExperience >= threshold
                && claimedPrestigeIds.indexOf(this.prestigeId(prestige)) < 0
            ) {
                unlocked.push(prestige);
            }
        }
        return unlocked;
    }

    private localRivalBoard(
        experienceValue: number,
        ratingValue: number,
        seasonId: string,
    ): readonly CareerJourneyRivalEntry[] {
        const experience = Math.max(0, Math.min(JOURNEY_MAX_EXPERIENCE, Math.trunc(experienceValue)));
        const rating = Math.max(0, Math.min(9_999, Math.trunc(ratingValue)));
        const seed = hashString(`${seasonId}:local-rivals-v97`);
        const names = ['NOVA', 'MIRA', 'ORBIT', 'KAI', 'RAY'];
        const baseRatings = [1_520, 1_340, 1_170, 980, 820];
        const entries: Array<{
            readonly name: string;
            readonly experience: number;
            readonly rating: number;
            readonly player: boolean;
        }> = [
            { name: 'YOU', experience, rating, player: true },
            ...names.map((name, index) => {
                const variance = ((seed >>> (index * 5)) % 121) - 60;
                const rivalRating = Math.max(0, (baseRatings[index] ?? RIVAL_INITIAL_RATING) + variance);
                const rivalExperience = Math.max(
                    0,
                    Math.min(
                        JOURNEY_MAX_EXPERIENCE,
                        Math.round((rivalRating / 1_600) * JOURNEY_MAX_EXPERIENCE * 0.72)
                            + ((seed >>> (index * 3 + 2)) % 420),
                    ),
                );
                return {
                    name,
                    experience: rivalExperience,
                    rating: rivalRating,
                    player: false,
                };
            }),
        ];
        return entries
            .sort((left, right) => right.rating - left.rating
                || right.experience - left.experience
                || left.name.localeCompare(right.name))
            .map((entry, index) => ({
                rank: index + 1,
                name: entry.name,
                experience: entry.experience,
                rating: entry.rating,
                ratingGap: entry.rating - rating,
                completedTierCount: this.completedTierCount(entry.experience),
                prestigeLevel: this.prestigeLevel(entry.experience),
                player: entry.player,
            }));
    }


    private completedTierCount(experience: number): number {
        return Math.max(0, Math.min(JOURNEY_MAX_LEVEL, Math.floor(experience / JOURNEY_EXPERIENCE_PER_LEVEL)));
    }

    private prestigeLevel(experience: number): number {
        return Math.max(
            0,
            Math.min(
                JOURNEY_PRESTIGE_MAX_LEVEL,
                Math.floor(Math.max(0, experience - JOURNEY_BASE_EXPERIENCE) / JOURNEY_PRESTIGE_EXPERIENCE_PER_LEVEL),
            ),
        );
    }

    private tierRewardCredits(tier: number): number {
        if (tier % 5 === 0) return 30_000 + tier * 1_500;
        return 8_000 + tier * 750;
    }

    private prestigeRewardCredits(prestige: number): number {
        if (prestige === JOURNEY_PRESTIGE_MAX_LEVEL) return 175_000;
        if (prestige % 5 === 0) return 100_000 + prestige * 5_000;
        return 40_000 + prestige * 10_000;
    }

    private tierId(tier: number): string {
        return `journey-tier-${tier}`;
    }

    private prestigeId(prestige: number): string {
        return `journey-prestige-${prestige}`;
    }

    private seasonTitle(seasonId: string): string {
        return `WORLD JOURNEY ${seasonId}`;
    }
}

export function createEmptyCareerJourneyCycle(id = ''): CareerJourneyCycleProgress {
    return createCycle(id);
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
        rivalRating: RIVAL_INITIAL_RATING,
        lastRivalRatingChange: 0,
        bestRivalRank: RIVAL_BOARD_SIZE,
        seasonBestRivalRank: RIVAL_BOARD_SIZE,
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
        daily: createCycle(''),
        weekly: createCycle(''),
    };
}

function createCycle(id: string): CareerJourneyCycleProgress {
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

function journeySeasonId(timestamp: number): string {
    const date = safeDate(timestamp);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function journeyDayId(timestamp: number): string {
    const date = safeDate(timestamp);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function journeyWeekId(timestamp: number): string {
    const date = safeDate(timestamp);
    const day = date.getUTCDay() || 7;
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day + 1));
    return journeyDayId(monday.getTime());
}

function nextUtcDay(timestamp: number): number {
    const date = safeDate(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function nextUtcWeek(timestamp: number): number {
    const date = safeDate(timestamp);
    const day = date.getUTCDay() || 7;
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + (8 - day));
}

function safeDate(timestamp: number): Date {
    return new Date(Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0);
}

function hashString(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
}

function uniqueIds(values: readonly string[], limit: number): readonly string[] {
    const unique = Array.from(new Set(values.filter((value) => value.length > 0)));
    return unique.slice(Math.max(0, unique.length - limit));
}
