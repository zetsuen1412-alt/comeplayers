import type { BotDifficulty, MatchMode } from './MatchSettingsData';
import type { TeamId } from './MatchSettingsData';

export const REPLAY_LIBRARY_VERSION = 4;
export const REPLAY_LIBRARY_LIMIT = 12;
export const REPLAY_EVENT_LIMIT = 180;

export type ReplayEventKind = 'SYSTEM' | 'ROLL' | 'MOVE' | 'ACTION' | 'RESULT';

export type ReplayCoachGrade = 'S' | 'A' | 'B' | 'C' | 'D';
export type ReplayCoachImpact = 'POSITIVE' | 'RISK' | 'TURNING_POINT';

export type ReplayAcademyMetric = 'TEMPO' | 'ECONOMY' | 'CONTROL' | 'RESILIENCE';

export interface ReplayAcademyDrill {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly metric: ReplayAcademyMetric;
    readonly currentScore: number;
    readonly targetScore: number;
    readonly completed: boolean;
}

export interface ReplayAcademySnapshot {
    readonly analyzedReplayCount: number;
    readonly averageScore: number;
    readonly trendDelta: number;
    readonly consistencyScore: number;
    readonly academyTier: string;
    readonly focusMetric: ReplayAcademyMetric;
    readonly focusLabel: string;
    readonly recommendation: string;
    readonly recommendedReplayId: string;
    readonly completedDrillCount: number;
    readonly drills: readonly ReplayAcademyDrill[];
}

export interface ReplayAcademyProgress {
    readonly bestAverageScore: number;
    readonly bestConsistencyScore: number;
    readonly completedDrillIds: readonly string[];
    readonly totalCompletedDrills: number;
    readonly lastFocusMetric: ReplayAcademyMetric;
    readonly liveObjectiveCompletions: number;
    readonly liveObjectiveStreak: number;
    readonly bestLiveObjectiveStreak: number;
    readonly totalLiveObjectiveCredits: number;
    readonly lastLiveObjectiveMetric: ReplayAcademyMetric;
}

export interface ReplayCoachKeyMoment {
    readonly sequence: number;
    readonly elapsedMs: number;
    readonly impact: ReplayCoachImpact;
    readonly label: string;
    readonly detail: string;
}

export interface ReplayCoachSummary {
    readonly version: number;
    readonly focusPlayerId: string;
    readonly score: number;
    readonly grade: ReplayCoachGrade;
    readonly tempoScore: number;
    readonly economyScore: number;
    readonly controlScore: number;
    readonly resilienceScore: number;
    readonly rollCount: number;
    readonly actionCount: number;
    readonly purchaseCount: number;
    readonly upgradeCount: number;
    readonly takeoverCount: number;
    readonly travelCount: number;
    readonly fortuneCount: number;
    readonly tollCount: number;
    readonly averageDecisionMs: number;
    readonly longestDecisionMs: number;
    readonly strengths: readonly string[];
    readonly focusAreas: readonly string[];
    readonly keyMoments: readonly ReplayCoachKeyMoment[];
}

export interface MatchReplayEvent {
    readonly sequence: number;
    readonly elapsedMs: number;
    readonly kind: ReplayEventKind;
    readonly playerId?: string;
    readonly message: string;
    readonly values: readonly number[];
}

export interface MatchReplayRecord {
    readonly id: string;
    readonly playedAt: number;
    readonly durationMs: number;
    readonly mode: MatchMode;
    readonly ranked: boolean;
    readonly botDifficulty: BotDifficulty;
    readonly playerCount: number;
    readonly completedRound: number;
    readonly winnerId: string;
    readonly winningTeamId?: TeamId;
    readonly eventCount: number;
    readonly checksum: string;
    readonly events: readonly MatchReplayEvent[];
    readonly coach?: ReplayCoachSummary;
}

export interface ReplayLibraryData {
    readonly version: number;
    readonly nextSequence: number;
    readonly academyProgress: ReplayAcademyProgress;
    readonly records: readonly MatchReplayRecord[];
}

export function createDefaultReplayLibrary(): ReplayLibraryData {
    return {
        version: REPLAY_LIBRARY_VERSION,
        nextSequence: 1,
        academyProgress: createDefaultReplayAcademyProgress(),
        records: [],
    };
}

export function normalizeReplayLibrary(value: unknown): ReplayLibraryData {
    const defaults = createDefaultReplayLibrary();
    if (!isRecord(value)) return defaults;
    const records = Array.isArray(value.records)
        ? value.records
            .map(normalizeReplayRecord)
            .filter((record): record is MatchReplayRecord => record !== null)
            .filter((record, index, items) => items.findIndex((item) => item.id === record.id) === index)
            .slice(0, REPLAY_LIBRARY_LIMIT)
        : [];
    return {
        version: REPLAY_LIBRARY_VERSION,
        nextSequence: Math.max(1, nonNegativeInteger(value.nextSequence)),
        academyProgress: normalizeReplayAcademyProgress(value.academyProgress),
        records,
    };
}

export function normalizeReplayRecord(value: unknown): MatchReplayRecord | null {
    if (!isRecord(value)) return null;
    const id = safeIdentifier(value.id, '', 64);
    if (!id) return null;
    const events = Array.isArray(value.events)
        ? value.events
            .map(normalizeReplayEvent)
            .filter((event): event is MatchReplayEvent => event !== null)
            .slice(0, REPLAY_EVENT_LIMIT)
        : [];
    const winningTeamId: TeamId | undefined = value.winningTeamId === 'BLUE' || value.winningTeamId === 'GOLD'
        ? value.winningTeamId
        : undefined;
    const coach = normalizeReplayCoachSummary(value.coach);
    return {
        id,
        playedAt: safeTimestamp(value.playedAt),
        durationMs: nonNegativeInteger(value.durationMs),
        mode: value.mode === 'TEAM' ? 'TEAM' : 'SOLO',
        ranked: value.ranked === true,
        botDifficulty: normalizeBotDifficulty(value.botDifficulty),
        playerCount: clampInteger(value.playerCount, 2, 4, 4),
        completedRound: Math.max(1, nonNegativeInteger(value.completedRound)),
        winnerId: safeIdentifier(value.winnerId, 'unknown', 48),
        ...(winningTeamId ? { winningTeamId } : {}),
        eventCount: Math.max(events.length, nonNegativeInteger(value.eventCount)),
        checksum: safeIdentifier(value.checksum, replayChecksum(events), 64),
        events,
        ...(coach ? { coach } : {}),
    };
}

export function replayChecksum(events: readonly MatchReplayEvent[]): string {
    let hash = 0x811c9dc5;
    for (const event of events) {
        const source = `${event.sequence}|${event.elapsedMs}|${event.kind}|${event.playerId ?? ''}|${event.message}|${event.values.join(',')}`;
        for (let index = 0; index < source.length; index++) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
    }
    return hash.toString(16).padStart(8, '0').toUpperCase();
}

function normalizeReplayEvent(value: unknown): MatchReplayEvent | null {
    if (!isRecord(value)) return null;
    const message = safeText(value.message, '', 180);
    if (!message) return null;
    const playerId = safeIdentifier(value.playerId, '', 48);
    return {
        sequence: Math.max(1, nonNegativeInteger(value.sequence)),
        elapsedMs: nonNegativeInteger(value.elapsedMs),
        kind: normalizeEventKind(value.kind),
        ...(playerId ? { playerId } : {}),
        message,
        values: Array.isArray(value.values)
            ? value.values
                .filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
                .map((entry) => Math.trunc(entry))
                .slice(0, 16)
            : [],
    };
}

function normalizeEventKind(value: unknown): ReplayEventKind {
    return value === 'ROLL' || value === 'MOVE' || value === 'ACTION' || value === 'RESULT'
        ? value
        : 'SYSTEM';
}

function normalizeBotDifficulty(value: unknown): BotDifficulty {
    return value === 'CASUAL' || value === 'EXPERT' ? value : 'SMART';
}

function safeIdentifier(value: unknown, fallback: string, maximumLength: number): string {
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, maximumLength);
    return normalized || fallback;
}

function safeText(value: unknown, fallback: string, maximumLength: number): string {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximumLength);
    return normalized || fallback;
}

function safeTimestamp(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.trunc(value));
}

function nonNegativeInteger(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.trunc(value));
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}


function normalizeReplayCoachSummary(value: unknown): ReplayCoachSummary | null {
    if (!isRecord(value)) return null;
    const focusPlayerId = safeIdentifier(value.focusPlayerId, '', 48);
    if (!focusPlayerId) return null;
    const keyMoments = Array.isArray(value.keyMoments)
        ? value.keyMoments.map(normalizeReplayCoachKeyMoment).filter((entry): entry is ReplayCoachKeyMoment => entry !== null).slice(0, 6)
        : [];
    return {
        version: Math.max(1, nonNegativeInteger(value.version)),
        focusPlayerId,
        score: clampInteger(value.score, 0, 100, 0),
        grade: normalizeReplayCoachGrade(value.grade),
        tempoScore: clampInteger(value.tempoScore, 0, 100, 0),
        economyScore: clampInteger(value.economyScore, 0, 100, 0),
        controlScore: clampInteger(value.controlScore, 0, 100, 0),
        resilienceScore: clampInteger(value.resilienceScore, 0, 100, 0),
        rollCount: nonNegativeInteger(value.rollCount),
        actionCount: nonNegativeInteger(value.actionCount),
        purchaseCount: nonNegativeInteger(value.purchaseCount),
        upgradeCount: nonNegativeInteger(value.upgradeCount),
        takeoverCount: nonNegativeInteger(value.takeoverCount),
        travelCount: nonNegativeInteger(value.travelCount),
        fortuneCount: nonNegativeInteger(value.fortuneCount),
        tollCount: nonNegativeInteger(value.tollCount),
        averageDecisionMs: nonNegativeInteger(value.averageDecisionMs),
        longestDecisionMs: nonNegativeInteger(value.longestDecisionMs),
        strengths: normalizeCoachTextList(value.strengths),
        focusAreas: normalizeCoachTextList(value.focusAreas),
        keyMoments,
    };
}

function normalizeReplayCoachKeyMoment(value: unknown): ReplayCoachKeyMoment | null {
    if (!isRecord(value)) return null;
    const detail = safeText(value.detail, '', 180);
    if (!detail) return null;
    return {
        sequence: Math.max(1, nonNegativeInteger(value.sequence)),
        elapsedMs: nonNegativeInteger(value.elapsedMs),
        impact: value.impact === 'POSITIVE' || value.impact === 'RISK' ? value.impact : 'TURNING_POINT',
        label: safeText(value.label, 'REPLAY FOCUS', 48),
        detail,
    };
}

function normalizeReplayCoachGrade(value: unknown): ReplayCoachGrade {
    return value === 'S' || value === 'A' || value === 'B' || value === 'C' ? value : 'D';
}

function normalizeCoachTextList(value: unknown): readonly string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => safeText(entry, '', 72))
        .filter((entry) => entry.length > 0)
        .slice(0, 3);
}

export function createDefaultReplayAcademyProgress(): ReplayAcademyProgress {
    return {
        bestAverageScore: 0,
        bestConsistencyScore: 0,
        completedDrillIds: [],
        totalCompletedDrills: 0,
        lastFocusMetric: 'CONTROL',
        liveObjectiveCompletions: 0,
        liveObjectiveStreak: 0,
        bestLiveObjectiveStreak: 0,
        totalLiveObjectiveCredits: 0,
        lastLiveObjectiveMetric: 'CONTROL',
    };
}

function normalizeReplayAcademyProgress(value: unknown): ReplayAcademyProgress {
    const defaults = createDefaultReplayAcademyProgress();
    if (!isRecord(value)) return defaults;
    const completedDrillIds = normalizeCoachTextList(value.completedDrillIds)
        .map((entry) => entry.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 64))
        .filter((entry, index, items) => entry.length > 0 && items.indexOf(entry) === index)
        .slice(0, 32);
    return {
        bestAverageScore: clampInteger(value.bestAverageScore, 0, 100, 0),
        bestConsistencyScore: clampInteger(value.bestConsistencyScore, 0, 100, 0),
        completedDrillIds,
        totalCompletedDrills: Math.max(completedDrillIds.length, nonNegativeInteger(value.totalCompletedDrills)),
        lastFocusMetric: normalizeReplayAcademyMetric(value.lastFocusMetric),
        liveObjectiveCompletions: nonNegativeInteger(value.liveObjectiveCompletions),
        liveObjectiveStreak: nonNegativeInteger(value.liveObjectiveStreak),
        bestLiveObjectiveStreak: Math.max(
            nonNegativeInteger(value.liveObjectiveStreak),
            nonNegativeInteger(value.bestLiveObjectiveStreak),
        ),
        totalLiveObjectiveCredits: nonNegativeInteger(value.totalLiveObjectiveCredits),
        lastLiveObjectiveMetric: normalizeReplayAcademyMetric(value.lastLiveObjectiveMetric),
    };
}

function normalizeReplayAcademyMetric(value: unknown): ReplayAcademyMetric {
    return value === 'TEMPO' || value === 'ECONOMY' || value === 'RESILIENCE' ? value : 'CONTROL';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
