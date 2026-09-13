import {
    AuthoritativeMatchEvent,
    AuthoritativeMatchSnapshot,
    normalizeAuthoritativeEvent,
    normalizeAuthoritativeSnapshot,
} from './AuthoritativeMatchProtocol';

export type AuthoritativeReplayVisibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC';

export interface AuthoritativeReplayArchiveSummary {
    readonly replayId: string;
    readonly replayCode: string;
    readonly ownerUserId: string;
    readonly sourceRoomId: string;
    readonly sourceMatchId: string;
    readonly title: string;
    readonly visibility: AuthoritativeReplayVisibility;
    readonly mode: 'SOLO' | 'TEAM';
    readonly winnerProfileId: string;
    readonly winnerTeamId: '' | 'BLUE' | 'GOLD';
    readonly finishReason: string;
    readonly round: number;
    readonly eventCount: number;
    readonly checksum: string;
    readonly createdAt: number;
    readonly owned: boolean;
}

export interface AuthoritativeEventHistory {
    readonly snapshot: AuthoritativeMatchSnapshot;
    readonly events: readonly AuthoritativeMatchEvent[];
    readonly firstSequence: number;
    readonly lastSequence: number;
    readonly hasMore: boolean;
    readonly checksum: string;
}

export interface AuthoritativeReplayArchiveHistory extends AuthoritativeEventHistory {
    readonly archive: AuthoritativeReplayArchiveSummary;
}

export interface AuthoritativeReplayLibrary {
    readonly entries: readonly AuthoritativeReplayArchiveSummary[];
    readonly count: number;
}

export function normalizeAuthoritativeEventHistory(value: unknown): AuthoritativeEventHistory | null {
    if (!isRecord(value)) return null;
    const snapshot = normalizeAuthoritativeSnapshot(value.snapshot);
    if (!snapshot) return null;
    const events = normalizeEvents(value.events);
    const firstSequence = integer(value.firstSequence, 0, Number.MAX_SAFE_INTEGER, events[0]?.sequence ?? 0);
    const lastSequence = integer(value.lastSequence, 0, Number.MAX_SAFE_INTEGER, events[events.length - 1]?.sequence ?? 0);
    const checksum = checksumValue(value.checksum, events);
    return {
        snapshot,
        events,
        firstSequence,
        lastSequence,
        hasMore: value.hasMore === true,
        checksum,
    };
}

export function normalizeAuthoritativeReplayArchiveSummary(value: unknown): AuthoritativeReplayArchiveSummary | null {
    if (!isRecord(value)) return null;
    const replayId = identifier(value.replayId, 64);
    const replayCode = replayCodeValue(value.replayCode);
    const sourceRoomId = identifier(value.sourceRoomId, 64);
    const sourceMatchId = identifier(value.sourceMatchId, 64);
    if (!replayId || !replayCode || !sourceRoomId || !sourceMatchId) return null;
    const visibility = value.visibility === 'PRIVATE' || value.visibility === 'PUBLIC' ? value.visibility : 'UNLISTED';
    const winnerTeamId = value.winnerTeamId === 'BLUE' || value.winnerTeamId === 'GOLD' ? value.winnerTeamId : '';
    return {
        replayId,
        replayCode,
        ownerUserId: identifier(value.ownerUserId, 64),
        sourceRoomId,
        sourceMatchId,
        title: text(value.title, 'ComePlayers Marble Replay', 80),
        visibility,
        mode: value.mode === 'TEAM' ? 'TEAM' : 'SOLO',
        winnerProfileId: identifier(value.winnerProfileId, 48),
        winnerTeamId,
        finishReason: text(value.finishReason, '', 80),
        round: integer(value.round, 1, 999, 1),
        eventCount: integer(value.eventCount, 0, 100_000, 0),
        checksum: checksumValue(value.checksum, []),
        createdAt: timestamp(value.createdAt),
        owned: value.owned === true,
    };
}

export function normalizeAuthoritativeReplayArchiveHistory(value: unknown): AuthoritativeReplayArchiveHistory | null {
    if (!isRecord(value)) return null;
    const history = normalizeAuthoritativeEventHistory(value);
    const archive = normalizeAuthoritativeReplayArchiveSummary(value.archive);
    if (!history || !archive) return null;
    return { ...history, archive };
}

export function normalizeAuthoritativeReplayLibrary(value: unknown): AuthoritativeReplayLibrary | null {
    if (!isRecord(value)) return null;
    const entries = Array.isArray(value.entries)
        ? value.entries
            .map(normalizeAuthoritativeReplayArchiveSummary)
            .filter((entry): entry is AuthoritativeReplayArchiveSummary => entry !== null)
            .slice(0, 40)
        : [];
    return {
        entries,
        count: integer(value.count, 0, 100_000, entries.length),
    };
}

export function mergeAuthoritativeEventHistories(
    pages: readonly AuthoritativeEventHistory[],
): AuthoritativeEventHistory | null {
    if (pages.length === 0) return null;
    const latest = pages[pages.length - 1];
    if (!latest) return null;
    const events = normalizeEvents(pages.flatMap((page) => page.events));
    return {
        snapshot: latest.snapshot,
        events,
        firstSequence: events[0]?.sequence ?? 0,
        lastSequence: events[events.length - 1]?.sequence ?? 0,
        hasMore: latest.hasMore,
        checksum: historyChecksum(events),
    };
}

export function mergeAuthoritativeReplayArchiveHistories(
    pages: readonly AuthoritativeReplayArchiveHistory[],
): AuthoritativeReplayArchiveHistory | null {
    if (pages.length === 0) return null;
    const latest = pages[pages.length - 1];
    if (!latest) return null;
    const merged = mergeAuthoritativeEventHistories(pages);
    if (!merged) return null;
    return { ...merged, archive: latest.archive };
}

export function historyChecksum(events: readonly AuthoritativeMatchEvent[]): string {
    let hash = 2166136261;
    for (const event of events) {
        const serialized = `${event.sequence}|${event.kind}|${event.actorProfileId}|${stableStringify(event.payload)}|${event.createdAt}`;
        for (let index = 0; index < serialized.length; index++) {
            hash ^= serialized.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
    }
    const block = (hash >>> 0).toString(16).padStart(8, '0');
    return block.repeat(8).slice(0, 64);
}

function normalizeEvents(value: unknown): AuthoritativeMatchEvent[] {
    return Array.isArray(value)
        ? value
            .map(normalizeAuthoritativeEvent)
            .filter((entry): entry is AuthoritativeMatchEvent => entry !== null)
            .sort((left, right) => left.sequence - right.sequence)
            .filter((entry, index, entries) => index === 0 || entry.sequence !== entries[index - 1]?.sequence)
            .slice(0, 2_160)
        : [];
}

function checksumValue(value: unknown, events: readonly AuthoritativeMatchEvent[]): string {
    return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
        ? value.toLowerCase()
        : historyChecksum(events);
}

function replayCodeValue(value: unknown): string {
    if (typeof value !== 'string') return '';
    const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    return normalized.length === 8 ? normalized : '';
}

function identifier(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, maxLength);
}

function text(value: unknown, fallback: string, maxLength: number): string {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLength);
    return normalized || fallback;
}

function timestamp(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return Date.now();
    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : Date.now();
}

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown, minimum: number, maximum: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}
