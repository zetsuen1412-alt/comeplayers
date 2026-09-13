import type { MatchResultSummary } from './MatchResultService';
import { CareerJourneyService, type CareerJourneySnapshot } from './CareerJourneyService';
import { CareerLegacyService, type CareerLegacyMilestoneView } from './CareerLegacyService';
import {
    CareerMatchActivity,
    CareerMatchRecord,
    CareerProgressionData,
    normalizeCareerMatchActivity,
    normalizeCareerProgression,
} from '../save/CareerProgressionData';

export interface CareerProgressionStoreSaveResult {
    readonly data: CareerProgressionData;
    readonly persisted: boolean;
}

export interface CareerProgressionStore {
    loadCareerProgression(): CareerProgressionData;
    saveCareerProgression(data: CareerProgressionData): CareerProgressionStoreSaveResult;
}

export interface CareerMissionView {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly progress: number;
    readonly target: number;
    readonly rewardCredits: number;
    readonly completed: boolean;
    readonly claimed: boolean;
}

export interface CareerHighlightReelEntry {
    readonly matchId: string;
    readonly playedAt: number;
    readonly title: string;
    readonly performanceGrade: 'S' | 'A' | 'B' | 'C' | 'D';
    readonly performanceScore: number;
    readonly rank: number;
    readonly reason: string;
    readonly tacticalTag: string;
    readonly replayPriority: number;
}

export interface CareerProgressionSnapshot {
    readonly level: number;
    readonly experience: number;
    readonly experienceForNextLevel: number;
    readonly levelProgress: number;
    readonly totalMatches: number;
    readonly wins: number;
    readonly podiums: number;
    readonly winRate: number;
    readonly rankTitle: string;
    readonly currentWinStreak: number;
    readonly bestWinStreak: number;
    readonly totalRewardCredits: number;
    readonly propertyActions: number;
    readonly worldTravels: number;
    readonly gameCenterWins: number;
    readonly takeovers: number;
    readonly masteryScore: number;
    readonly masteryTier: string;
    readonly masteryProgress: number;
    readonly masteryTarget: number;
    readonly achievementBadges: readonly string[];
    readonly completedMissionCount: number;
    readonly missionCompletionRate: number;
    readonly recentAverageRank: number;
    readonly recentForm: string;
    readonly momentumScore: number;
    readonly recommendedMissionTitle: string;
    readonly missions: readonly CareerMissionView[];
    readonly averagePerformanceScore: number;
    readonly bestPerformanceScore: number;
    readonly sGradeCount: number;
    readonly eliteGradeCount: number;
    readonly totalAwards: number;
    readonly classicVictoryWins: number;
    readonly highlightMatches: number;
    readonly highestNetWorth: number;
    readonly legacyScore: number;
    readonly legacyTier: string;
    readonly legacyProgress: number;
    readonly legacyTarget: number;
    readonly completedLegacyMilestoneCount: number;
    readonly legacyMilestoneCompletionRate: number;
    readonly recommendedLegacyMilestoneTitle: string;
    readonly legacyMilestones: readonly CareerLegacyMilestoneView[];
    readonly journey: CareerJourneySnapshot;
    readonly highlightReel: readonly CareerHighlightReelEntry[];
    readonly recentMatches: readonly CareerMatchRecord[];
}

export interface CareerMatchReward {
    readonly persisted: boolean;
    readonly rank: number;
    readonly matchCredits: number;
    readonly missionCredits: number;
    readonly legacyMilestoneCredits: number;
    readonly journeyMissionCredits: number;
    readonly journeyTierCredits: number;
    readonly journeyPerfectCycleCredits: number;
    readonly journeyPrestigeCredits: number;
    readonly journeyRivalCredits: number;
    readonly journeyRivalExperience: number;
    readonly journeyRivalRatingChange: number;
    readonly journeyRivalGauntletCredits: number;
    readonly journeyRivalGauntletExperience: number;
    readonly journeyRivalGauntletScoreGained: number;
    readonly journeyExperienceGained: number;
    readonly journeyStreakBonusExperience: number;
    readonly totalCredits: number;
    readonly experienceGained: number;
    readonly levelBefore: number;
    readonly levelAfter: number;
    readonly completedMissionTitles: readonly string[];
    readonly completedLegacyMilestoneTitles: readonly string[];
    readonly completedJourneyMissionTitles: readonly string[];
    readonly completedJourneyRivalContractTitles: readonly string[];
    readonly completedJourneyRivalGauntletTitles: readonly string[];
    readonly completedJourneyPerfectCycleLabels: readonly string[];
    readonly unlockedJourneyTierLabels: readonly string[];
    readonly unlockedJourneyPrestigeLabels: readonly string[];
    readonly archivedJourneySeasonLabels: readonly string[];
    readonly matchHighlightTitle: string;
    readonly performanceScore: number;
    readonly performanceGrade: 'S' | 'A' | 'B' | 'C' | 'D';
    readonly awardCount: number;
    readonly snapshot: CareerProgressionSnapshot;
}

interface CareerMissionDefinition {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly target: number;
    readonly rewardCredits: number;
    readonly progress: (data: CareerProgressionData) => number;
}

const MISSIONS: readonly CareerMissionDefinition[] = [
    {
        id: 'first-match',
        title: 'FIRST MATCH',
        description: 'Complete one local Marble World match.',
        target: 1,
        rewardCredits: 10_000,
        progress: (data) => data.totalMatches,
    },
    {
        id: 'city-builder',
        title: 'CITY BUILDER',
        description: 'Purchase or upgrade ten properties.',
        target: 10,
        rewardCredits: 15_000,
        progress: (data) => data.propertyActions,
    },
    {
        id: 'world-traveler',
        title: 'WORLD TRAVELER',
        description: 'Use World Travel at least once.',
        target: 1,
        rewardCredits: 12_000,
        progress: (data) => data.worldTravels,
    },
    {
        id: 'marble-champion',
        title: 'MARBLE CHAMPION',
        description: 'Win three local matches.',
        target: 3,
        rewardCredits: 30_000,
        progress: (data) => data.wins,
    },
    {
        id: 'podium-regular',
        title: 'PODIUM REGULAR',
        description: 'Finish on the podium five times.',
        target: 5,
        rewardCredits: 24_000,
        progress: (data) => data.podiums,
    },
    {
        id: 'takeover-specialist',
        title: 'TAKEOVER SPECIALIST',
        description: 'Complete five property takeovers.',
        target: 5,
        rewardCredits: 28_000,
        progress: (data) => data.takeovers,
    },
    {
        id: 'game-center-ace',
        title: 'GAME CENTER ACE',
        description: 'Win three Game Center challenges.',
        target: 3,
        rewardCredits: 22_000,
        progress: (data) => data.gameCenterWins,
    },
    {
        id: 'hot-streak',
        title: 'HOT STREAK',
        description: 'Build a three-match winning streak.',
        target: 3,
        rewardCredits: 35_000,
        progress: (data) => data.bestWinStreak,
    },
    {
        id: 'marble-veteran',
        title: 'MARBLE VETERAN',
        description: 'Complete ten Marble World matches.',
        target: 10,
        rewardCredits: 40_000,
        progress: (data) => data.totalMatches,
    },
    {
        id: 'global-explorer',
        title: 'GLOBAL EXPLORER',
        description: 'Use World Travel five times.',
        target: 5,
        rewardCredits: 32_000,
        progress: (data) => data.worldTravels,
    },
    {
        id: 'world-conqueror',
        title: 'WORLD CONQUEROR',
        description: 'Win ten Marble World matches.',
        target: 10,
        rewardCredits: 75_000,
        progress: (data) => data.wins,
    },
    {
        id: 'unstoppable',
        title: 'UNSTOPPABLE',
        description: 'Reach a five-match winning streak.',
        target: 5,
        rewardCredits: 80_000,
        progress: (data) => data.bestWinStreak,
    },
    {
        id: 'property-tycoon',
        title: 'PROPERTY TYCOON',
        description: 'Complete fifty property purchases or upgrades.',
        target: 50,
        rewardCredits: 55_000,
        progress: (data) => data.propertyActions,
    },
];

export class CareerProgressionService {
    private data: CareerProgressionData;
    private readonly legacy = new CareerLegacyService();
    private readonly journey = new CareerJourneyService();

    public constructor(
        private readonly store: CareerProgressionStore,
        private readonly now: () => number = Date.now,
    ) {
        this.data = normalizeCareerProgression(store.loadCareerProgression());
    }

    public snapshot(): CareerProgressionSnapshot {
        const nextLevelExperience = experienceForLevel(this.data.level);
        return {
            level: this.data.level,
            experience: this.data.experience,
            experienceForNextLevel: nextLevelExperience,
            levelProgress: Math.max(0, Math.min(1, this.data.experience / nextLevelExperience)),
            totalMatches: this.data.totalMatches,
            wins: this.data.wins,
            podiums: this.data.podiums,
            winRate: this.data.totalMatches > 0 ? this.data.wins / this.data.totalMatches : 0,
            rankTitle: rankTitle(this.data.level),
            currentWinStreak: this.data.currentWinStreak,
            bestWinStreak: this.data.bestWinStreak,
            totalRewardCredits: this.data.totalRewardCredits,
            propertyActions: this.data.propertyActions,
            worldTravels: this.data.worldTravels,
            gameCenterWins: this.data.gameCenterWins,
            takeovers: this.data.takeovers,
            masteryScore: this.calculateMasteryScore(),
            masteryTier: masteryTier(this.calculateMasteryScore()),
            masteryProgress: masteryProgress(this.calculateMasteryScore()).progress,
            masteryTarget: masteryProgress(this.calculateMasteryScore()).target,
            achievementBadges: this.achievementBadges(),
            completedMissionCount: this.completedMissionCount(),
            missionCompletionRate: MISSIONS.length > 0 ? this.completedMissionCount() / MISSIONS.length : 0,
            recentAverageRank: this.recentAverageRank(),
            recentForm: this.recentForm(),
            momentumScore: this.momentumScore(),
            recommendedMissionTitle: this.recommendedMissionTitle(),
            missions: MISSIONS.map((mission) => this.missionView(mission)),
            averagePerformanceScore: this.legacy.averagePerformanceScore(this.data),
            bestPerformanceScore: this.data.bestPerformanceScore,
            sGradeCount: this.data.sGradeCount,
            eliteGradeCount: this.data.eliteGradeCount,
            totalAwards: this.data.totalAwards,
            classicVictoryWins: this.data.classicVictoryWins,
            highlightMatches: this.data.highlightMatches,
            highestNetWorth: this.data.highestNetWorth,
            legacyScore: this.legacy.legacyScore(this.data),
            legacyTier: this.legacy.legacyTier(this.data),
            legacyProgress: this.legacy.legacyProgress(this.data).progress,
            legacyTarget: this.legacy.legacyProgress(this.data).target,
            completedLegacyMilestoneCount: this.legacy.completedCount(this.data),
            legacyMilestoneCompletionRate: this.legacy.milestoneViews(this.data).length > 0
                ? this.legacy.completedCount(this.data) / this.legacy.milestoneViews(this.data).length
                : 0,
            recommendedLegacyMilestoneTitle: this.legacy.recommendedMilestoneTitle(this.data),
            legacyMilestones: this.legacy.milestoneViews(this.data),
            journey: this.journey.snapshot(this.data.journey, this.now()),
            highlightReel: this.highlightReel(),
            recentMatches: this.data.recentMatches,
        };
    }

    public recordMatch(
        summary: Readonly<MatchResultSummary>,
        humanPlayerId: string,
        activityValue: Readonly<CareerMatchActivity>,
    ): CareerMatchReward {
        const humanEntry = summary.entries.find((entry) => entry.playerId === humanPlayerId);
        if (!humanEntry) throw new Error(`Human player ${humanPlayerId} is missing from the match result.`);

        const activity = normalizeCareerMatchActivity(activityValue);
        const legacyMatch = this.legacy.createMatchSnapshot(summary, humanPlayerId);
        const levelBefore = this.data.level;
        const matchCredits = this.calculateMatchCredits(humanEntry.rank, activity);
        const experienceGained = this.calculateExperience(humanEntry.rank, activity);
        const won = summary.winningTeamId
            ? humanEntry.teamId === summary.winningTeamId
            : humanEntry.rank === 1;
        const currentWinStreak = won ? this.data.currentWinStreak + 1 : 0;

        let next: CareerProgressionData = normalizeCareerProgression({
            ...this.data,
            totalMatches: this.data.totalMatches + 1,
            wins: this.data.wins + (won ? 1 : 0),
            podiums: this.data.podiums + (humanEntry.rank <= 3 ? 1 : 0),
            propertyActions: this.data.propertyActions + activity.propertyActions,
            worldTravels: this.data.worldTravels + activity.worldTravels,
            gameCenterWins: this.data.gameCenterWins + activity.gameCenterWins,
            takeovers: this.data.takeovers + activity.takeovers,
            currentWinStreak,
            bestWinStreak: Math.max(this.data.bestWinStreak, currentWinStreak),
            performanceScoreTotal: this.data.performanceScoreTotal + legacyMatch.performanceScore,
            performanceMatchCount: this.data.performanceMatchCount + 1,
            bestPerformanceScore: Math.max(this.data.bestPerformanceScore, legacyMatch.performanceScore),
            sGradeCount: this.data.sGradeCount + (legacyMatch.performanceGrade === 'S' ? 1 : 0),
            eliteGradeCount: this.data.eliteGradeCount + (
                legacyMatch.performanceGrade === 'S' || legacyMatch.performanceGrade === 'A' ? 1 : 0
            ),
            totalAwards: this.data.totalAwards + legacyMatch.awardCount,
            classicVictoryWins: this.data.classicVictoryWins + (legacyMatch.classicVictory ? 1 : 0),
            highlightMatches: this.data.highlightMatches + (legacyMatch.highlight ? 1 : 0),
            highestNetWorth: Math.max(this.data.highestNetWorth, humanEntry.netWorth),
        });

        const newlyCompleted = MISSIONS.filter((mission) => (
            mission.progress(next) >= mission.target
            && next.claimedMissionIds.indexOf(mission.id) < 0
        ));
        const missionCredits = newlyCompleted.reduce((total, mission) => total + mission.rewardCredits, 0);
        const newlyCompletedLegacy = this.legacy.newlyCompleted(next);
        const legacyMilestoneCredits = newlyCompletedLegacy.reduce(
            (total, milestone) => total + milestone.rewardCredits,
            0,
        );
        const timestamp = safeTimestamp(this.now());
        const journeyReward = this.journey.recordMatch(next.journey, {
            won,
            rank: humanEntry.rank,
            classicVictory: legacyMatch.classicVictory,
            performanceScore: legacyMatch.performanceScore,
            awardCount: legacyMatch.awardCount,
            activity,
        }, timestamp);
        const journeyMissionCredits = journeyReward.missionCredits;
        const journeyTierCredits = journeyReward.tierCredits;
        const journeyPerfectCycleCredits = journeyReward.perfectCycleCredits;
        const journeyPrestigeCredits = journeyReward.prestigeCredits;
        const journeyRivalCredits = journeyReward.rivalCredits;
        const journeyRivalGauntletCredits = journeyReward.rivalGauntletCredits;
        const totalCredits = matchCredits
            + missionCredits
            + legacyMilestoneCredits
            + journeyMissionCredits
            + journeyTierCredits
            + journeyPerfectCycleCredits
            + journeyPrestigeCredits
            + journeyRivalCredits
            + journeyRivalGauntletCredits;
        const leveled = applyExperience(next.level, next.experience, experienceGained);
        const matchSequence = next.nextMatchSequence;
        const record: CareerMatchRecord = {
            id: `match-${matchSequence}`,
            playedAt: timestamp,
            rank: humanEntry.rank,
            playerCount: summary.entries.length,
            completedRound: summary.completedRound,
            reason: summary.reason,
            netWorth: humanEntry.netWorth,
            rewardCredits: totalCredits,
            experienceGained,
            performanceScore: legacyMatch.performanceScore,
            performanceGrade: legacyMatch.performanceGrade,
            awardCount: legacyMatch.awardCount,
            highlightTitle: legacyMatch.highlightTitle,
            classicVictory: legacyMatch.classicVictory,
            activity,
        };

        next = normalizeCareerProgression({
            ...next,
            level: leveled.level,
            experience: leveled.experience,
            totalRewardCredits: next.totalRewardCredits + totalCredits,
            claimedMissionIds: [
                ...next.claimedMissionIds,
                ...newlyCompleted.map((mission) => mission.id),
            ],
            claimedLegacyMilestoneIds: [
                ...next.claimedLegacyMilestoneIds,
                ...newlyCompletedLegacy.map((milestone) => milestone.id),
            ],
            journey: journeyReward.progression,
            nextMatchSequence: matchSequence + 1,
            recentMatches: [record, ...next.recentMatches],
        });

        const previous = this.data;
        const saved = this.store.saveCareerProgression(next);
        this.data = normalizeCareerProgression(saved.data);
        if (!saved.persisted) {
            this.store.saveCareerProgression(previous);
            this.data = normalizeCareerProgression(previous);
        }

        return {
            persisted: saved.persisted,
            rank: humanEntry.rank,
            matchCredits,
            missionCredits,
            legacyMilestoneCredits,
            journeyMissionCredits,
            journeyTierCredits,
            journeyPerfectCycleCredits,
            journeyPrestigeCredits,
            journeyRivalCredits,
            journeyRivalExperience: saved.persisted ? journeyReward.rivalExperience : 0,
            journeyRivalRatingChange: saved.persisted ? journeyReward.rivalRatingChange : 0,
            journeyRivalGauntletCredits: saved.persisted ? journeyReward.rivalGauntletCredits : 0,
            journeyRivalGauntletExperience: saved.persisted ? journeyReward.rivalGauntletExperience : 0,
            journeyRivalGauntletScoreGained: saved.persisted ? journeyReward.rivalGauntletScoreGained : 0,
            journeyExperienceGained: saved.persisted ? journeyReward.experienceGained : 0,
            journeyStreakBonusExperience: saved.persisted ? journeyReward.streakBonusExperience : 0,
            totalCredits: saved.persisted ? totalCredits : 0,
            experienceGained: saved.persisted ? experienceGained : 0,
            levelBefore,
            levelAfter: saved.persisted ? this.data.level : levelBefore,
            completedMissionTitles: saved.persisted
                ? newlyCompleted.map((mission) => mission.title)
                : [],
            completedLegacyMilestoneTitles: saved.persisted
                ? newlyCompletedLegacy.map((milestone) => milestone.title)
                : [],
            completedJourneyMissionTitles: saved.persisted
                ? journeyReward.completedMissionTitles
                : [],
            completedJourneyRivalContractTitles: saved.persisted
                ? journeyReward.completedRivalContractTitles
                : [],
            completedJourneyRivalGauntletTitles: saved.persisted
                ? journeyReward.completedRivalGauntletTitles
                : [],
            completedJourneyPerfectCycleLabels: saved.persisted
                ? journeyReward.completedPerfectCycleLabels
                : [],
            unlockedJourneyTierLabels: saved.persisted
                ? journeyReward.unlockedTierLabels
                : [],
            unlockedJourneyPrestigeLabels: saved.persisted
                ? journeyReward.unlockedPrestigeLabels
                : [],
            archivedJourneySeasonLabels: saved.persisted
                ? journeyReward.archivedSeasonLabels
                : [],
            matchHighlightTitle: legacyMatch.highlightTitle,
            performanceScore: legacyMatch.performanceScore,
            performanceGrade: legacyMatch.performanceGrade,
            awardCount: legacyMatch.awardCount,
            snapshot: this.snapshot(),
        };
    }

    private highlightReel(): readonly CareerHighlightReelEntry[] {
        return this.data.recentMatches
            .filter((match) => (
                match.highlightTitle !== 'CAREER MATCH RECORD'
                || match.performanceGrade === 'S'
                || match.performanceGrade === 'A'
                || match.classicVictory
            ))
            .slice(0, 5)
            .map((match) => ({
                matchId: match.id,
                playedAt: match.playedAt,
                title: match.highlightTitle,
                performanceGrade: match.performanceGrade,
                performanceScore: match.performanceScore,
                rank: match.rank,
                reason: match.reason,
                tacticalTag: this.tacticalHighlightTag(match),
                replayPriority: this.replayPriority(match),
            }));
    }

    private tacticalHighlightTag(match: Readonly<CareerMatchRecord>): string {
        if (match.classicVictory) return `${match.reason.replace(/_/g, ' ')} STUDY`;
        if (match.activity.takeovers >= 2) return 'TAKEOVER COMMAND';
        if (match.activity.propertyActions >= 6) return 'CITY ARCHITECT';
        if (match.activity.worldTravels >= 2) return 'WORLD ROUTER';
        if (match.activity.gameCenterWins >= 2) return 'ARCADE CONTROL';
        if (match.rank === 1) return 'VICTORY CONTROL';
        if (match.performanceScore >= 85) return 'ELITE PERFORMANCE';
        return match.rank <= 3 ? 'PODIUM ANALYSIS' : 'RECOVERY STUDY';
    }

    private replayPriority(match: Readonly<CareerMatchRecord>): number {
        const score = match.performanceScore
            + match.awardCount * 6
            + (match.classicVictory ? 30 : 0)
            + match.activity.takeovers * 5
            + match.activity.worldTravels * 4
            + match.activity.gameCenterWins * 4
            + Math.min(20, match.activity.propertyActions * 2);
        return Math.max(0, Math.min(200, Math.round(score)));
    }

    private completedMissionCount(): number {
        return MISSIONS.filter((mission) => mission.progress(this.data) >= mission.target).length;
    }

    private recentAverageRank(): number {
        const recent = this.data.recentMatches.slice(0, 5);
        if (recent.length === 0) return 0;
        return recent.reduce((total, match) => total + match.rank, 0) / recent.length;
    }

    private recentForm(): string {
        const recent = this.data.recentMatches.slice(0, 5);
        if (recent.length === 0) return 'UNRANKED';
        const average = this.recentAverageRank();
        if (average <= 1.5) return 'DOMINANT';
        if (average <= 2.5) return 'STRONG';
        if (average <= 3.5) return 'STEADY';
        return 'RECOVERING';
    }

    private momentumScore(): number {
        const recent = this.data.recentMatches.slice(0, 5);
        if (recent.length === 0) return 0;
        const weighted = recent.reduce((total, match, index) => {
            const weight = Math.max(1, 5 - index);
            const rankScore = Math.max(0, match.playerCount - match.rank + 1);
            return total + rankScore * weight;
        }, 0);
        const maximum = recent.reduce(
            (total, match, index) => total + match.playerCount * Math.max(1, 5 - index),
            0,
        );
        return maximum > 0 ? Math.round((weighted / maximum) * 100) : 0;
    }

    private recommendedMissionTitle(): string {
        const active = MISSIONS
            .filter((mission) => mission.progress(this.data) < mission.target)
            .map((mission) => ({ mission, ratio: mission.progress(this.data) / mission.target }))
            .sort((left, right) => right.ratio - left.ratio)[0];
        return active?.mission.title ?? 'ALL MISSIONS COMPLETE';
    }

    private calculateMasteryScore(): number {
        const score = this.data.wins * 120
            + this.data.podiums * 45
            + this.data.propertyActions * 6
            + this.data.worldTravels * 30
            + this.data.gameCenterWins * 55
            + this.data.takeovers * 40
            + this.data.bestWinStreak * 75;
        return Math.max(0, Math.min(999_999, Math.trunc(score)));
    }


    private achievementBadges(): readonly string[] {
        const badges: string[] = [];
        if (this.data.totalMatches >= 1) badges.push('DEBUT');
        if (this.data.wins >= 3) badges.push('CHAMPION');
        if (this.data.bestWinStreak >= 3) badges.push('HOT STREAK');
        if (this.data.propertyActions >= 50) badges.push('TYCOON');
        if (this.data.worldTravels >= 5) badges.push('EXPLORER');
        if (this.data.takeovers >= 5) badges.push('TAKEOVER ACE');
        if (this.data.gameCenterWins >= 3) badges.push('ARCADE ACE');
        if (this.calculateMasteryScore() >= 5_000) badges.push('MARBLE ELITE');
        return badges;
    }

    private missionView(mission: CareerMissionDefinition): CareerMissionView {
        const progress = mission.progress(this.data);
        return {
            id: mission.id,
            title: mission.title,
            description: mission.description,
            progress: Math.min(progress, mission.target),
            target: mission.target,
            rewardCredits: mission.rewardCredits,
            completed: progress >= mission.target,
            claimed: this.data.claimedMissionIds.indexOf(mission.id) >= 0,
        };
    }

    private calculateMatchCredits(rank: number, activity: CareerMatchActivity): number {
        const rankReward = [0, 30_000, 18_000, 12_000, 8_000][rank] ?? 8_000;
        const performance = activity.propertyActions * 1_000
            + activity.worldTravels * 3_000
            + activity.gameCenterWins * 5_000
            + activity.takeovers * 4_000;
        return Math.min(75_000, 15_000 + rankReward + performance);
    }

    private calculateExperience(rank: number, activity: CareerMatchActivity): number {
        return 100
            + Math.max(0, 5 - rank) * 50
            + activity.propertyActions * 8
            + activity.worldTravels * 20
            + activity.gameCenterWins * 25
            + activity.takeovers * 18;
    }
}

export function experienceForLevel(level: number): number {
    return 500 + Math.max(0, Math.trunc(level) - 1) * 150;
}

function applyExperience(levelValue: number, experienceValue: number, gained: number): {
    readonly level: number;
    readonly experience: number;
} {
    let level = Math.max(1, Math.trunc(levelValue));
    let experience = Math.max(0, Math.trunc(experienceValue)) + Math.max(0, Math.trunc(gained));
    while (level < 999 && experience >= experienceForLevel(level)) {
        experience -= experienceForLevel(level);
        level++;
    }
    return { level, experience };
}

function rankTitle(level: number): string {
    if (level >= 30) return 'WORLD MASTER';
    if (level >= 20) return 'MARBLE LEGEND';
    if (level >= 12) return 'CITY TYCOON';
    if (level >= 6) return 'PRO PLAYER';
    if (level >= 3) return 'RISING STAR';
    return 'ROOKIE';
}

function safeTimestamp(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}


function masteryTier(score: number): string {
    if (score >= 10_000) return 'WORLD CLASS';
    if (score >= 5_000) return 'MARBLE ELITE';
    if (score >= 2_500) return 'CITY MASTER';
    if (score >= 1_000) return 'CONTENDER';
    if (score >= 250) return 'RISING PLAYER';
    return 'NEWCOMER';
}

function masteryProgress(scoreValue: number): { readonly progress: number; readonly target: number } {
    const score = Math.max(0, Math.trunc(scoreValue));
    const thresholds = [250, 1_000, 2_500, 5_000, 10_000];
    const target = thresholds.find((value) => score < value) ?? 10_000;
    return { progress: Math.min(score, target), target };
}
