import type {
    MatchReplayEvent,
    MatchReplayRecord,
    ReplayCoachKeyMoment,
    ReplayCoachSummary,
} from '../save/ReplayLibraryData';

const POSITIVE_MOMENT_PATTERNS: readonly RegExp[] = [
    /TRIPLE MONOPOLY/i,
    /LINE MONOPOLY/i,
    /TOURISM MONOPOLY/i,
    /COLOR MONOPOLY/i,
    /TAKE\s?OVER|ACQUIRE/i,
    /LANDMARK|HOTEL/i,
    /WORLD TRAVEL/i,
    /WON|WINS|VICTORY/i,
];

const RISK_MOMENT_PATTERNS: readonly RegExp[] = [
    /BANKRUPT/i,
    /LIQUIDATION/i,
    /PAID .*RENT|TOLL/i,
    /DANGER/i,
    /ISLAND|PRISON/i,
];

export class ReplayCoachService {
    public analyze(record: Readonly<MatchReplayRecord>, focusPlayerId = record.winnerId): ReplayCoachSummary {
        const events = record.events;
        const playerEvents = events.filter((event) => !event.playerId || event.playerId === focusPlayerId);
        const rollEvents = playerEvents.filter((event) => event.kind === 'ROLL');
        const moveEvents = playerEvents.filter((event) => event.kind === 'MOVE');
        const actionEvents = playerEvents.filter((event) => event.kind === 'ACTION');
        const allMessages = playerEvents.map((event) => event.message.toUpperCase());

        const purchaseCount = countMessages(allMessages, /PURCHASE|PURCHASED|BOUGHT|BUY /);
        const upgradeCount = countMessages(allMessages, /UPGRADE|BUILDING|VILLA|HOTEL|LANDMARK/);
        const takeoverCount = countMessages(allMessages, /TAKE\s?OVER|ACQUIRE/);
        const travelCount = countMessages(allMessages, /WORLD TRAVEL|TRAVELLED|TRAVELED/);
        const fortuneCount = countMessages(allMessages, /FORTUNE|CHANCE CARD|SIGNAL CARD/);
        const tollCount = countMessages(allMessages, /PAID .*RENT|TOLL|RENT PAYMENT/);
        const liquidationCount = countMessages(allMessages, /LIQUIDATION|REPOSSESSION/);
        const bankruptcyCount = countMessages(allMessages, /BANKRUPT/);
        const classicVictoryCount = countMessages(allMessages, /TRIPLE MONOPOLY|LINE MONOPOLY|TOURISM MONOPOLY/);
        const doublesCount = rollEvents.filter((event) => event.values.length >= 2 && event.values[0] === event.values[1]).length;
        const decisionGaps = decisionIntervals(playerEvents);
        const averageDecisionMs = average(decisionGaps);
        const longestDecisionMs = decisionGaps.length > 0 ? Math.max(...decisionGaps) : 0;

        const tempoScore = clampScore(100 - Math.max(0, averageDecisionMs - 3_500) / 140 - Math.max(0, longestDecisionMs - 15_000) / 260);
        const economyScore = clampScore(
            46
            + purchaseCount * 6
            + upgradeCount * 7
            + takeoverCount * 9
            + classicVictoryCount * 18
            - tollCount * 2
            - liquidationCount * 12
            - bankruptcyCount * 25,
        );
        const controlScore = clampScore(
            42
            + moveEvents.length * 2
            + travelCount * 10
            + fortuneCount * 4
            + doublesCount * 2
            + takeoverCount * 5,
        );
        const resilienceScore = clampScore(
            70
            - liquidationCount * 16
            - bankruptcyCount * 35
            - Math.max(0, tollCount - 2) * 4
            + (record.winnerId === focusPlayerId ? 18 : 0),
        );
        const score = clampScore(
            tempoScore * 0.20
            + economyScore * 0.32
            + controlScore * 0.26
            + resilienceScore * 0.22,
        );

        const strengths = buildStrengths({
            tempoScore,
            economyScore,
            controlScore,
            resilienceScore,
            purchaseCount,
            upgradeCount,
            takeoverCount,
            travelCount,
            classicVictoryCount,
        });
        const focusAreas = buildFocusAreas({
            averageDecisionMs,
            longestDecisionMs,
            purchaseCount,
            upgradeCount,
            takeoverCount,
            tollCount,
            liquidationCount,
            bankruptcyCount,
            rollCount: rollEvents.length,
        });

        return {
            version: 1,
            focusPlayerId,
            score,
            grade: scoreToGrade(score),
            tempoScore,
            economyScore,
            controlScore,
            resilienceScore,
            rollCount: rollEvents.length,
            actionCount: actionEvents.length,
            purchaseCount,
            upgradeCount,
            takeoverCount,
            travelCount,
            fortuneCount,
            tollCount,
            averageDecisionMs,
            longestDecisionMs,
            strengths,
            focusAreas,
            keyMoments: selectKeyMoments(events, focusPlayerId),
        };
    }
}

function countMessages(messages: readonly string[], pattern: RegExp): number {
    return messages.reduce((count, message) => count + (pattern.test(message) ? 1 : 0), 0);
}

function decisionIntervals(events: readonly MatchReplayEvent[]): number[] {
    const relevant = events.filter((event) => event.kind === 'ROLL' || event.kind === 'MOVE' || event.kind === 'ACTION');
    const gaps: number[] = [];
    for (let index = 1; index < relevant.length; index++) {
        const previous = relevant[index - 1];
        const current = relevant[index];
        if (!previous || !current) continue;
        const gap = Math.max(0, current.elapsedMs - previous.elapsedMs);
        if (gap <= 120_000) gaps.push(gap);
    }
    return gaps;
}

function average(values: readonly number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function clampScore(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreToGrade(score: number): ReplayCoachSummary['grade'] {
    if (score >= 90) return 'S';
    if (score >= 80) return 'A';
    if (score >= 68) return 'B';
    if (score >= 52) return 'C';
    return 'D';
}

function buildStrengths(metrics: {
    readonly tempoScore: number;
    readonly economyScore: number;
    readonly controlScore: number;
    readonly resilienceScore: number;
    readonly purchaseCount: number;
    readonly upgradeCount: number;
    readonly takeoverCount: number;
    readonly travelCount: number;
    readonly classicVictoryCount: number;
}): readonly string[] {
    const strengths: string[] = [];
    if (metrics.classicVictoryCount > 0) strengths.push('CLASSIC VICTORY CONVERSION');
    if (metrics.takeoverCount > 0) strengths.push('STRATEGIC TAKEOVER PRESSURE');
    if (metrics.upgradeCount >= 2) strengths.push('PROPERTY DEVELOPMENT');
    if (metrics.purchaseCount >= 3) strengths.push('BOARD EXPANSION');
    if (metrics.travelCount > 0) strengths.push('WORLD TRAVEL ROUTING');
    if (metrics.tempoScore >= 80) strengths.push('FAST DECISION TEMPO');
    if (metrics.resilienceScore >= 80) strengths.push('STRONG CASH RESILIENCE');
    if (metrics.controlScore >= 78) strengths.push('BOARD CONTROL');
    if (strengths.length === 0) strengths.push('CONSISTENT MATCH COMPLETION');
    return strengths.slice(0, 3);
}

function buildFocusAreas(metrics: {
    readonly averageDecisionMs: number;
    readonly longestDecisionMs: number;
    readonly purchaseCount: number;
    readonly upgradeCount: number;
    readonly takeoverCount: number;
    readonly tollCount: number;
    readonly liquidationCount: number;
    readonly bankruptcyCount: number;
    readonly rollCount: number;
}): readonly string[] {
    const focus: string[] = [];
    if (metrics.averageDecisionMs > 8_000 || metrics.longestDecisionMs > 25_000) focus.push('PRE-PLAN ACTIONS BEFORE LANDING');
    if (metrics.liquidationCount > 0) focus.push('KEEP A LARGER CASH RESERVE');
    if (metrics.bankruptcyCount > 0) focus.push('AVOID ALL-IN DEVELOPMENT');
    if (metrics.tollCount >= 3) focus.push('USE DICE CONTROL TO AVOID TOLL LANES');
    if (metrics.purchaseCount >= 3 && metrics.upgradeCount === 0) focus.push('CONVERT LAND INTO RENT PRESSURE');
    if (metrics.purchaseCount === 0 && metrics.rollCount >= 3) focus.push('TARGET HIGH-VALUE EMPTY DISTRICTS');
    if (metrics.takeoverCount === 0 && metrics.purchaseCount >= 2) focus.push('WATCH TAKEOVER WINDOWS');
    if (focus.length === 0) focus.push('REVIEW ONE KEY TURN AND REPEAT THE WINNING ROUTE');
    return focus.slice(0, 3);
}

function selectKeyMoments(events: readonly MatchReplayEvent[], focusPlayerId: string): readonly ReplayCoachKeyMoment[] {
    const moments: ReplayCoachKeyMoment[] = [];
    for (const event of events) {
        if (event.playerId && event.playerId !== focusPlayerId) continue;
        const positive = POSITIVE_MOMENT_PATTERNS.some((pattern) => pattern.test(event.message));
        const risk = RISK_MOMENT_PATTERNS.some((pattern) => pattern.test(event.message));
        if (!positive && !risk && event.kind !== 'RESULT') continue;
        moments.push({
            sequence: event.sequence,
            elapsedMs: event.elapsedMs,
            impact: event.kind === 'RESULT' ? 'TURNING_POINT' : risk ? 'RISK' : 'POSITIVE',
            label: event.kind === 'RESULT' ? 'MATCH RESULT' : risk ? 'RISK MOMENT' : 'KEY PLAY',
            detail: event.message,
        });
    }
    if (moments.length === 0) {
        const fallback = events.find((event) => event.kind === 'ACTION') ?? events.find((event) => event.kind === 'MOVE') ?? events[0];
        if (fallback) {
            moments.push({
                sequence: fallback.sequence,
                elapsedMs: fallback.elapsedMs,
                impact: 'TURNING_POINT',
                label: 'REPLAY FOCUS',
                detail: fallback.message,
            });
        }
    }
    return moments.slice(-4);
}
