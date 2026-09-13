import type { MatchResultSummary } from './MatchResultService';
import type { BotDifficulty, MatchMode } from '../save/MatchSettingsData';
import {
    MatchReplayEvent,
    MatchReplayRecord,
    replayChecksum,
    REPLAY_EVENT_LIMIT,
} from '../save/ReplayLibraryData';

export interface MatchReplayRecorderOptions {
    readonly mode: MatchMode;
    readonly ranked: boolean;
    readonly botDifficulty: BotDifficulty;
    readonly playerCount: number;
    readonly startedAt: number;
}

export class MatchReplayRecorder {
    private readonly events: MatchReplayEvent[] = [];
    private sequence = 1;
    private completed = false;

    public constructor(
        private readonly options: MatchReplayRecorderOptions,
        private readonly now: () => number = Date.now,
    ) {
        this.record('SYSTEM', 'Match recorder initialized.');
    }

    public recordMessage(message: string, playerId?: string): void {
        this.record(classifyMessage(message), message, playerId);
    }

    public recordDice(playerId: string, first: number, second: number): void {
        this.record('ROLL', `Dice ${first} + ${second} = ${first + second}.`, playerId, [first, second]);
    }

    public recordMovement(playerId: string, path: readonly number[]): void {
        if (path.length === 0) return;
        this.record(
            'MOVE',
            `Moved ${path.length} spaces to tile ${path[path.length - 1] ?? 0}.`,
            playerId,
            path.slice(-16),
        );
    }

    public finish(summary: MatchResultSummary, replayId: string): MatchReplayRecord | null {
        if (this.completed) return null;
        const winner = summary.winningTeamId ? `Team ${summary.winningTeamId}` : summary.winnerId;
        const reason = summary.reason.replace(/_/g, ' ').toLowerCase();
        this.record('RESULT', `${winner} won by ${reason} after round ${summary.completedRound}.`, summary.winnerId, [summary.completedRound]);
        this.completed = true;
        const playedAt = safeTimestamp(this.options.startedAt);
        const durationMs = Math.max(0, this.safeNow() - playedAt);
        const events = this.events.slice(0, REPLAY_EVENT_LIMIT);
        return {
            id: replayId,
            playedAt,
            durationMs,
            mode: this.options.mode,
            ranked: this.options.ranked,
            botDifficulty: this.options.botDifficulty,
            playerCount: Math.max(2, Math.min(4, Math.trunc(this.options.playerCount))),
            completedRound: summary.completedRound,
            winnerId: summary.winnerId,
            ...(summary.winningTeamId ? { winningTeamId: summary.winningTeamId } : {}),
            eventCount: events.length,
            checksum: replayChecksum(events),
            events,
        };
    }

    public snapshot(): readonly MatchReplayEvent[] {
        return this.events;
    }

    private record(
        kind: MatchReplayEvent['kind'],
        message: string,
        playerId?: string,
        values: readonly number[] = [],
    ): void {
        if (this.completed || this.events.length >= REPLAY_EVENT_LIMIT) return;
        const normalized = normalizeMessage(message);
        if (!normalized) return;
        const previous = this.events[this.events.length - 1];
        if (previous && previous.kind === kind && previous.playerId === playerId && previous.message === normalized) return;
        const event: MatchReplayEvent = {
            sequence: this.sequence++,
            elapsedMs: Math.max(0, this.safeNow() - safeTimestamp(this.options.startedAt)),
            kind,
            ...(playerId ? { playerId } : {}),
            message: normalized,
            values: values
                .filter((value) => Number.isFinite(value))
                .map((value) => Math.trunc(value))
                .slice(0, 16),
        };
        this.events.push(event);
    }

    private safeNow(): number {
        const value = this.now();
        return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    }
}

function classifyMessage(message: string): MatchReplayEvent['kind'] {
    const upper = message.toUpperCase();
    if (upper.includes('ROLLED') || upper.includes('LEMPAR DADU')) return 'ROLL';
    if (upper.includes('MOVE') || upper.includes('TRAVEL') || upper.includes('TILE')) return 'MOVE';
    if (upper.includes('MATCH COMPLETE') || upper.includes('WINS')) return 'RESULT';
    if (upper.includes('PURCHASE') || upper.includes('UPGRADE') || upper.includes('TAKE OVER') || upper.includes('PAID') || upper.includes('FORTUNE') || upper.includes('SKILL')) return 'ACTION';
    return 'SYSTEM';
}

function normalizeMessage(value: string): string {
    return value.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function safeTimestamp(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
