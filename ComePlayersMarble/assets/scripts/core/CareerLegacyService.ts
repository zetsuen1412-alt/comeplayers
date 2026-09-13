import type {
    CareerPerformanceGrade,
    CareerProgressionData,
} from '../save/CareerProgressionData';
import { MatchAwardsService } from './MatchAwardsService';
import type { MatchResultSummary } from './MatchResultService';

export interface CareerLegacyMilestoneView {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly progress: number;
    readonly target: number;
    readonly rewardCredits: number;
    readonly completed: boolean;
    readonly claimed: boolean;
}

export interface CareerLegacyMatchSnapshot {
    readonly performanceScore: number;
    readonly performanceGrade: CareerPerformanceGrade;
    readonly awardCount: number;
    readonly highlight: boolean;
    readonly highlightTitle: string;
    readonly classicVictory: boolean;
}

interface CareerLegacyMilestoneDefinition {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly target: number;
    readonly rewardCredits: number;
    readonly progress: (data: CareerProgressionData) => number;
}

const LEGACY_MILESTONES: readonly CareerLegacyMilestoneDefinition[] = [
    {
        id: 'first-honor',
        title: 'FIRST HONOR',
        description: 'Earn your first Match Legacy Award.',
        target: 1,
        rewardCredits: 15_000,
        progress: (data) => data.totalAwards,
    },
    {
        id: 'elite-performance',
        title: 'ELITE PERFORMANCE',
        description: 'Finish a match with an A grade or better.',
        target: 74,
        rewardCredits: 20_000,
        progress: (data) => data.bestPerformanceScore,
    },
    {
        id: 's-grade-masterclass',
        title: 'S-GRADE MASTERCLASS',
        description: 'Finish a match with an S performance grade.',
        target: 1,
        rewardCredits: 35_000,
        progress: (data) => data.sGradeCount,
    },
    {
        id: 'classic-finisher',
        title: 'CLASSIC FINISHER',
        description: 'Win by Triple, Line, or Tourism Monopoly.',
        target: 1,
        rewardCredits: 40_000,
        progress: (data) => data.classicVictoryWins,
    },
    {
        id: 'legacy-collector',
        title: 'LEGACY COLLECTOR',
        description: 'Earn ten Match Legacy Awards.',
        target: 10,
        rewardCredits: 50_000,
        progress: (data) => data.totalAwards,
    },
    {
        id: 'marble-icon',
        title: 'MARBLE ICON',
        description: 'Reach a performance score of 95 or higher.',
        target: 95,
        rewardCredits: 75_000,
        progress: (data) => data.bestPerformanceScore,
    },
    {
        id: 'millionaire-board',
        title: 'MILLIONAIRE BOARD',
        description: 'Finish a match with CP 1,000,000 net worth.',
        target: 1_000_000,
        rewardCredits: 60_000,
        progress: (data) => data.highestNetWorth,
    },
    {
        id: 'highlight-reel',
        title: 'HIGHLIGHT REEL',
        description: 'Create ten elite match highlights.',
        target: 10,
        rewardCredits: 80_000,
        progress: (data) => data.highlightMatches,
    },
];

const STRUCTURAL_VICTORIES = new Set<MatchResultSummary['reason']>([
    'TRIPLE_MONOPOLY',
    'LINE_MONOPOLY',
    'TOURISM_MONOPOLY',
]);

export class CareerLegacyService {
    private readonly awards = new MatchAwardsService();

    public createMatchSnapshot(
        summary: Readonly<MatchResultSummary>,
        humanPlayerId: string,
    ): CareerLegacyMatchSnapshot {
        const awardSummary = this.awards.create(summary);
        const performance = awardSummary.performances.find((entry) => entry.playerId === humanPlayerId);
        const humanEntry = summary.entries.find((entry) => entry.playerId === humanPlayerId);
        if (!performance || !humanEntry) {
            throw new Error(`Career legacy could not resolve player ${humanPlayerId}.`);
        }

        const won = summary.winningTeamId
            ? humanEntry.teamId === summary.winningTeamId
            : summary.winnerId === humanPlayerId;
        const classicVictory = won && STRUCTURAL_VICTORIES.has(summary.reason);
        const humanAwards = awardSummary.awards.filter((award) => award.playerId === humanPlayerId);
        const highlight = classicVictory
            || performance.score >= 74
            || humanAwards.length >= 2
            || humanEntry.rank === 1;

        return {
            performanceScore: performance.score,
            performanceGrade: performance.grade,
            awardCount: humanAwards.length,
            highlight,
            highlightTitle: this.highlightTitle(
                summary,
                performance.grade,
                humanAwards.map((award) => award.title),
                humanEntry.rank,
                classicVictory,
            ),
            classicVictory,
        };
    }

    public milestoneViews(data: Readonly<CareerProgressionData>): readonly CareerLegacyMilestoneView[] {
        return LEGACY_MILESTONES.map((milestone) => this.milestoneView(milestone, data));
    }

    public newlyCompleted(data: Readonly<CareerProgressionData>): readonly CareerLegacyMilestoneView[] {
        return LEGACY_MILESTONES
            .filter((milestone) => (
                milestone.progress(data) >= milestone.target
                && data.claimedLegacyMilestoneIds.indexOf(milestone.id) < 0
            ))
            .map((milestone) => this.milestoneView(milestone, data));
    }

    public completedCount(data: Readonly<CareerProgressionData>): number {
        return LEGACY_MILESTONES.filter((milestone) => milestone.progress(data) >= milestone.target).length;
    }

    public averagePerformanceScore(data: Readonly<CareerProgressionData>): number {
        if (data.performanceMatchCount <= 0) return 0;
        return Math.round(data.performanceScoreTotal / data.performanceMatchCount);
    }

    public legacyScore(data: Readonly<CareerProgressionData>): number {
        const score = data.bestPerformanceScore * 12
            + data.totalAwards * 150
            + data.sGradeCount * 500
            + data.eliteGradeCount * 180
            + data.classicVictoryWins * 600
            + data.highlightMatches * 120
            + Math.floor(data.highestNetWorth / 5_000);
        return Math.max(0, Math.min(999_999, Math.trunc(score)));
    }

    public legacyTier(data: Readonly<CareerProgressionData>): string {
        const score = this.legacyScore(data);
        if (score >= 20_000) return 'HALL OF FAME';
        if (score >= 10_000) return 'WORLD LEGEND';
        if (score >= 5_000) return 'MARBLE STAR';
        if (score >= 2_000) return 'CITY ICON';
        if (score >= 750) return 'RISING LEGACY';
        return 'NEW LEGACY';
    }

    public legacyProgress(data: Readonly<CareerProgressionData>): {
        readonly progress: number;
        readonly target: number;
    } {
        const score = this.legacyScore(data);
        const thresholds = [750, 2_000, 5_000, 10_000, 20_000];
        const target = thresholds.find((value) => score < value) ?? 20_000;
        return { progress: Math.min(score, target), target };
    }

    public recommendedMilestoneTitle(data: Readonly<CareerProgressionData>): string {
        const active = LEGACY_MILESTONES
            .filter((milestone) => milestone.progress(data) < milestone.target)
            .map((milestone) => ({
                milestone,
                ratio: milestone.progress(data) / milestone.target,
            }))
            .sort((left, right) => right.ratio - left.ratio)[0];
        return active?.milestone.title ?? 'ALL LEGACY MILESTONES COMPLETE';
    }

    private milestoneView(
        milestone: CareerLegacyMilestoneDefinition,
        data: Readonly<CareerProgressionData>,
    ): CareerLegacyMilestoneView {
        const progress = milestone.progress(data);
        return {
            id: milestone.id,
            title: milestone.title,
            description: milestone.description,
            progress: Math.min(progress, milestone.target),
            target: milestone.target,
            rewardCredits: milestone.rewardCredits,
            completed: progress >= milestone.target,
            claimed: data.claimedLegacyMilestoneIds.indexOf(milestone.id) >= 0,
        };
    }

    private highlightTitle(
        summary: Readonly<MatchResultSummary>,
        grade: CareerPerformanceGrade,
        awardTitles: readonly string[],
        rank: number,
        classicVictory: boolean,
    ): string {
        if (classicVictory) {
            if (summary.reason === 'TRIPLE_MONOPOLY') return 'TRIPLE MONOPOLY CHAMPION';
            if (summary.reason === 'LINE_MONOPOLY') return 'LINE MONOPOLY CHAMPION';
            return 'TOURISM MONOPOLY CHAMPION';
        }
        if (grade === 'S') return 'S-GRADE MASTERCLASS';
        if (awardTitles.length >= 3) return 'TRIPLE HONOR PERFORMANCE';
        if (awardTitles.length > 0) return awardTitles[0] as string;
        if (rank === 1) return 'FIRST PLACE FINISH';
        if (grade === 'A') return 'ELITE PERFORMANCE';
        return 'CAREER MATCH RECORD';
    }
}
