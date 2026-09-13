import type {
    MatchReplayRecord,
    ReplayAcademyMetric,
    ReplayAcademySnapshot,
    ReplayAcademyDrill,
} from '../save/ReplayLibraryData';

const METRIC_LABELS: Readonly<Record<ReplayAcademyMetric, string>> = {
    TEMPO: 'DECISION TEMPO',
    ECONOMY: 'CITY ECONOMY',
    CONTROL: 'BOARD CONTROL',
    RESILIENCE: 'CASH RESILIENCE',
};

const METRIC_RECOMMENDATIONS: Readonly<Record<ReplayAcademyMetric, string>> = {
    TEMPO: 'Pre-plan the buy, upgrade, and skip decision before the token lands.',
    ECONOMY: 'Keep one dangerous toll in reserve before committing to development.',
    CONTROL: 'Use dice control, World Travel, and takeovers to create two board threats.',
    RESILIENCE: 'Avoid all-in builds and protect enough cash to survive one premium toll.',
};

export class ReplayAcademyService {
    public analyze(
        records: readonly MatchReplayRecord[],
        completedDrillIds: readonly string[] = [],
    ): ReplayAcademySnapshot {
        const analyzed = records.filter((record) => record.coach).slice(0, 5);
        if (analyzed.length === 0) return emptyAcademy(completedDrillIds);

        const coaches = analyzed.map((record) => record.coach!);
        const averageScore = average(coaches.map((coach) => coach.score));
        const metricScores: Readonly<Record<ReplayAcademyMetric, number>> = {
            TEMPO: average(coaches.map((coach) => coach.tempoScore)),
            ECONOMY: average(coaches.map((coach) => coach.economyScore)),
            CONTROL: average(coaches.map((coach) => coach.controlScore)),
            RESILIENCE: average(coaches.map((coach) => coach.resilienceScore)),
        };
        const focusMetric = (Object.keys(metricScores) as ReplayAcademyMetric[])
            .sort((left, right) => metricScores[left] - metricScores[right])[0] ?? 'CONTROL';
        const latest = coaches[0]!;
        const oldest = coaches[coaches.length - 1]!;
        const trendDelta = latest.score - oldest.score;
        const consistencyScore = consistency(coaches.map((coach) => coach.score));
        const recommendedReplay = [...analyzed]
            .sort((left, right) => reviewPriority(right) - reviewPriority(left))[0] ?? analyzed[0]!;
        const completed = new Set(completedDrillIds);
        const drills = buildDrills(metricScores, averageScore, consistencyScore, latest, completed);

        return {
            analyzedReplayCount: analyzed.length,
            averageScore,
            trendDelta,
            consistencyScore,
            academyTier: academyTier(averageScore),
            focusMetric,
            focusLabel: METRIC_LABELS[focusMetric],
            recommendation: METRIC_RECOMMENDATIONS[focusMetric],
            recommendedReplayId: recommendedReplay.id,
            completedDrillCount: drills.filter((drill) => drill.completed).length,
            drills,
        };
    }

    public completedDrills(
        previous: Readonly<ReplayAcademySnapshot>,
        latestRecord: Readonly<MatchReplayRecord>,
    ): readonly string[] {
        const coach = latestRecord.coach;
        if (!coach) return [];
        return previous.drills
            .filter((drill) => scoreForMetric(coach, drill.metric) >= drill.targetScore)
            .map((drill) => drill.id);
    }
}

function emptyAcademy(completedDrillIds: readonly string[]): ReplayAcademySnapshot {
    const completed = new Set(completedDrillIds);
    const drills: readonly ReplayAcademyDrill[] = [
        drill('academy-first-review', 'FIRST REVIEW', 'Complete one recorded match to unlock adaptive coaching.', 'CONTROL', 0, 50, completed),
        drill('academy-tempo-foundation', 'TEMPO FOUNDATION', 'Finish decisions with a stable match rhythm.', 'TEMPO', 0, 60, completed),
        drill('academy-reserve-foundation', 'RESERVE FOUNDATION', 'Protect enough cash to survive a dangerous toll.', 'RESILIENCE', 0, 60, completed),
    ];
    return {
        analyzedReplayCount: 0,
        averageScore: 0,
        trendDelta: 0,
        consistencyScore: 0,
        academyTier: 'UNRANKED ACADEMY',
        focusMetric: 'CONTROL',
        focusLabel: METRIC_LABELS.CONTROL,
        recommendation: 'Complete one local match to generate a personal training plan.',
        recommendedReplayId: '',
        completedDrillCount: drills.filter((entry) => entry.completed).length,
        drills,
    };
}

function buildDrills(
    metrics: Readonly<Record<ReplayAcademyMetric, number>>,
    averageScore: number,
    consistencyScore: number,
    latest: NonNullable<MatchReplayRecord['coach']>,
    completed: ReadonlySet<string>,
): readonly ReplayAcademyDrill[] {
    const focusMetric = (Object.keys(metrics) as ReplayAcademyMetric[])
        .sort((left, right) => metrics[left] - metrics[right])[0] ?? 'CONTROL';
    const focusTarget = Math.min(92, Math.max(65, metrics[focusMetric] + 8));
    const tempoTarget = Math.min(92, Math.max(68, metrics.TEMPO + 6));
    const eliteTarget = Math.min(95, Math.max(72, averageScore + 5));
    return [
        drill(
            `academy-focus-${focusMetric.toLowerCase()}`,
            `${METRIC_LABELS[focusMetric]} DRILL`,
            METRIC_RECOMMENDATIONS[focusMetric],
            focusMetric,
            scoreForMetric(latest, focusMetric),
            focusTarget,
            completed,
        ),
        drill(
            'academy-decision-rhythm',
            'DECISION RHYTHM',
            `Raise tempo while keeping consistency at ${consistencyScore}/100 or better.`,
            'TEMPO',
            latest.tempoScore,
            tempoTarget,
            completed,
        ),
        drill(
            'academy-elite-review',
            'ELITE REPLAY TARGET',
            'Produce a complete replay at or above the target coach score.',
            'CONTROL',
            latest.score,
            eliteTarget,
            completed,
        ),
    ];
}

function drill(
    id: string,
    title: string,
    description: string,
    metric: ReplayAcademyMetric,
    currentScore: number,
    targetScore: number,
    completed: ReadonlySet<string>,
): ReplayAcademyDrill {
    return {
        id,
        title,
        description,
        metric,
        currentScore: clamp(currentScore),
        targetScore: clamp(targetScore),
        completed: completed.has(id) || currentScore >= targetScore,
    };
}

function scoreForMetric(
    coach: NonNullable<MatchReplayRecord['coach']>,
    metric: ReplayAcademyMetric,
): number {
    if (metric === 'TEMPO') return coach.tempoScore;
    if (metric === 'ECONOMY') return coach.economyScore;
    if (metric === 'RESILIENCE') return coach.resilienceScore;
    return coach.controlScore;
}

function average(values: readonly number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function consistency(values: readonly number[]): number {
    if (values.length <= 1) return values.length === 1 ? 100 : 0;
    const mean = values.reduce((total, value) => total + value, 0) / values.length;
    const deviation = values.reduce((total, value) => total + Math.abs(value - mean), 0) / values.length;
    return clamp(100 - deviation * 2.5);
}

function reviewPriority(record: Readonly<MatchReplayRecord>): number {
    const coach = record.coach;
    if (!coach) return 0;
    const riskMoments = coach.keyMoments.filter((moment) => moment.impact === 'RISK').length;
    return (100 - coach.score) + riskMoments * 18 + Math.min(30, Math.round(coach.longestDecisionMs / 1_000));
}

function academyTier(score: number): string {
    if (score >= 90) return 'WORLD CLASS ACADEMY';
    if (score >= 82) return 'ELITE ACADEMY';
    if (score >= 72) return 'GOLD ACADEMY';
    if (score >= 62) return 'SILVER ACADEMY';
    if (score >= 50) return 'BRONZE ACADEMY';
    return 'FOUNDATION ACADEMY';
}

function clamp(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}
