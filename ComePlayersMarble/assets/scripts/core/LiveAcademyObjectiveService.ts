import type { ReplayAcademyMetric, ReplayAcademySnapshot } from '../save/ReplayLibraryData';

export interface LiveAcademyRuntimeMetrics {
    readonly fastRolls: number;
    readonly propertyActions: number;
    readonly controlActions: number;
    readonly cash: number;
    readonly bankrupt: boolean;
    readonly finished: boolean;
}

export interface LiveAcademyObjectiveState {
    readonly id: string;
    readonly metric: ReplayAcademyMetric;
    readonly title: string;
    readonly description: string;
    readonly current: number;
    readonly target: number;
    readonly unit: 'DECISIONS' | 'ACTIONS' | 'CONTROL' | 'CASH';
    readonly completed: boolean;
    readonly rewardCredits: number;
    readonly progressLabel: string;
}

const BASE_REWARD_CREDITS = 5_000;

export class LiveAcademyObjectiveService {
    public create(academy: Readonly<ReplayAcademySnapshot>): LiveAcademyObjectiveState {
        switch (academy.focusMetric) {
            case 'TEMPO':
                return this.state(
                    'live-academy-tempo',
                    'TEMPO',
                    'FAST DECISION DRILL',
                    'Roll with at least 60% of the turn timer remaining three times.',
                    0,
                    3,
                    'DECISIONS',
                    false,
                );
            case 'ECONOMY':
                return this.state(
                    'live-academy-economy',
                    'ECONOMY',
                    'CITY ECONOMY DRILL',
                    'Complete three property purchase or development actions in one match.',
                    0,
                    3,
                    'ACTIONS',
                    false,
                );
            case 'RESILIENCE':
                return this.state(
                    'live-academy-resilience',
                    'RESILIENCE',
                    'CASH RESERVE DRILL',
                    'Finish the match solvent with at least CP 250,000 cash remaining.',
                    0,
                    250_000,
                    'CASH',
                    false,
                );
            default:
                return this.state(
                    'live-academy-control',
                    'CONTROL',
                    'BOARD CONTROL DRILL',
                    'Complete one takeover or World Travel action in one match.',
                    0,
                    1,
                    'CONTROL',
                    false,
                );
        }
    }

    public evaluate(
        objective: Readonly<LiveAcademyObjectiveState>,
        metrics: Readonly<LiveAcademyRuntimeMetrics>,
    ): LiveAcademyObjectiveState {
        if (objective.metric === 'TEMPO') {
            const current = Math.min(objective.target, Math.max(0, Math.trunc(metrics.fastRolls)));
            return this.withProgress(objective, current, current >= objective.target);
        }
        if (objective.metric === 'ECONOMY') {
            const current = Math.min(objective.target, Math.max(0, Math.trunc(metrics.propertyActions)));
            return this.withProgress(objective, current, current >= objective.target);
        }
        if (objective.metric === 'CONTROL') {
            const current = Math.min(objective.target, Math.max(0, Math.trunc(metrics.controlActions)));
            return this.withProgress(objective, current, current >= objective.target);
        }
        const current = Math.max(0, Math.trunc(metrics.cash));
        const completed = metrics.finished && !metrics.bankrupt && current >= objective.target;
        return this.withProgress(objective, current, completed);
    }

    public rewardForStreak(streakAfterCompletion: number): number {
        const streakBonus = Math.max(0, Math.min(5, Math.trunc(streakAfterCompletion))) * 1_000;
        return BASE_REWARD_CREDITS + streakBonus;
    }

    private withProgress(
        objective: Readonly<LiveAcademyObjectiveState>,
        current: number,
        completed: boolean,
    ): LiveAcademyObjectiveState {
        return this.state(
            objective.id,
            objective.metric,
            objective.title,
            objective.description,
            current,
            objective.target,
            objective.unit,
            completed,
        );
    }

    private state(
        id: string,
        metric: ReplayAcademyMetric,
        title: string,
        description: string,
        current: number,
        target: number,
        unit: LiveAcademyObjectiveState['unit'],
        completed: boolean,
    ): LiveAcademyObjectiveState {
        return {
            id,
            metric,
            title,
            description,
            current,
            target,
            unit,
            completed,
            rewardCredits: BASE_REWARD_CREDITS,
            progressLabel: progressLabel(unit, current, target, completed),
        };
    }
}

function progressLabel(
    unit: LiveAcademyObjectiveState['unit'],
    current: number,
    target: number,
    completed: boolean,
): string {
    if (completed) return 'COMPLETE';
    if (unit === 'CASH') {
        return `CP ${Math.max(0, current).toLocaleString('en-US')} / CP ${target.toLocaleString('en-US')}`;
    }
    return `${Math.max(0, current)} / ${target}`;
}
