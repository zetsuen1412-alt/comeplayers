import type { AuthoritativeActionResult } from './AuthoritativeMatchProtocol';

export type CompetitiveMode = 'SOLO' | 'TEAM';
export type CompetitiveRealtimeState = 'DISCONNECTED' | 'CONNECTING' | 'SUBSCRIBED' | 'ERROR';
export type TournamentMode = 'SOLO' | 'TEAM';
export type CompetitiveQueueStatus = 'IDLE' | 'SEARCHING' | 'MATCHED' | 'CANCELLED' | 'EXPIRED';
export type TournamentStatus = 'OPEN' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
export type TournamentMatchStatus = 'PENDING' | 'READY' | 'ACTIVE' | 'FINISHED' | 'BYE';

export interface CompetitiveProfile {
    readonly userId: string;
    readonly profileId: string;
    readonly displayName: string;
    readonly rating: number;
    readonly tier: string;
    readonly seasonPoints: number;
    readonly wins: number;
    readonly losses: number;
    readonly matches: number;
    readonly streak: number;
    readonly bestStreak: number;
    readonly tournamentWins: number;
    readonly seasonId: string;
    readonly seasonEndsAt: number;
    readonly lifetimeWins: number;
    readonly lifetimeLosses: number;
    readonly lifetimeTournamentWins: number;
    readonly updatedAt: number;
}

export interface CompetitiveMatchedRoom {
    readonly roomId: string;
    readonly inviteCode: string;
    readonly topic: string;
    readonly mode: CompetitiveMode;
}

export interface CompetitiveQueueSnapshot {
    readonly status: CompetitiveQueueStatus;
    readonly mode: CompetitiveMode;
    readonly region: string;
    readonly rating: number;
    readonly waitSeconds: number;
    readonly searchRange: number;
    readonly queuedAt: number;
    readonly expiresAt: number;
    readonly matchedRoom: CompetitiveMatchedRoom | null;
}

export interface TournamentEntry {
    readonly userId: string;
    readonly profileId: string;
    readonly displayName: string;
    readonly seed: number;
    readonly teamNumber: number;
    readonly teamName: string;
    readonly eliminated: boolean;
    readonly joinedAt: number;
    readonly self: boolean;
}

export interface TournamentBracketMatch {
    readonly matchId: string;
    readonly round: number;
    readonly slot: number;
    readonly status: TournamentMatchStatus;
    readonly playerOneProfileId: string;
    readonly playerOneName: string;
    readonly playerTwoProfileId: string;
    readonly playerTwoName: string;
    readonly winnerProfileId: string;
    readonly roomId: string;
    readonly inviteCode: string;
    readonly topic: string;
    readonly selfMatch: boolean;
    readonly teamOneNumber: number;
    readonly teamTwoNumber: number;
}

export interface TournamentSummary {
    readonly tournamentId: string;
    readonly tournamentCode: string;
    readonly name: string;
    readonly mode: TournamentMode;
    readonly status: TournamentStatus;
    readonly capacity: number;
    readonly entryCount: number;
    readonly teamCount: number;
    readonly currentRound: number;
    readonly totalRounds: number;
    readonly hostProfileId: string;
    readonly championProfileId: string;
    readonly championDisplayName: string;
    readonly joined: boolean;
    readonly owned: boolean;
    readonly createdAt: number;
}

export interface TournamentDetail extends TournamentSummary {
    readonly entries: readonly TournamentEntry[];
    readonly matches: readonly TournamentBracketMatch[];
    readonly activeMatch: TournamentBracketMatch | null;
}

export interface CompetitiveLeaderboardEntry {
    readonly rank: number;
    readonly profileId: string;
    readonly displayName: string;
    readonly rating: number;
    readonly tier: string;
    readonly wins: number;
    readonly losses: number;
    readonly tournamentWins: number;
    readonly self: boolean;
}

export interface CompetitiveHubSnapshot {
    readonly profile: CompetitiveProfile;
    readonly queue: CompetitiveQueueSnapshot;
    readonly tournaments: readonly TournamentSummary[];
    readonly leaderboard: readonly CompetitiveLeaderboardEntry[];
    readonly currentTournament: TournamentDetail | null;
}

export type CompetitiveActionResult<T = CompetitiveHubSnapshot> = AuthoritativeActionResult<T>;

export function normalizeCompetitiveHub(value: unknown): CompetitiveHubSnapshot | null {
    if (!isRecord(value)) return null;
    const profile = normalizeProfile(value.profile);
    const queue = normalizeQueue(value.queue);
    if (!profile || !queue) return null;
    const tournaments = Array.isArray(value.tournaments)
        ? value.tournaments.map(normalizeTournamentSummary).filter((entry): entry is TournamentSummary => entry !== null).slice(0, 24)
        : [];
    const leaderboard = Array.isArray(value.leaderboard)
        ? value.leaderboard.map(normalizeLeaderboardEntry).filter((entry): entry is CompetitiveLeaderboardEntry => entry !== null).slice(0, 50)
        : [];
    const currentTournament = value.currentTournament === null || value.currentTournament === undefined
        ? null
        : normalizeTournamentDetail(value.currentTournament);
    return { profile, queue, tournaments, leaderboard, currentTournament };
}

export function normalizeTournamentDetail(value: unknown): TournamentDetail | null {
    const summary = normalizeTournamentSummary(value);
    if (!summary || !isRecord(value)) return null;
    const entries = Array.isArray(value.entries)
        ? value.entries.map(normalizeTournamentEntry).filter((entry): entry is TournamentEntry => entry !== null).slice(0, 8)
        : [];
    const matches = Array.isArray(value.matches)
        ? value.matches.map(normalizeTournamentMatch).filter((entry): entry is TournamentBracketMatch => entry !== null).slice(0, 16)
        : [];
    const activeMatch = value.activeMatch === null || value.activeMatch === undefined
        ? null
        : normalizeTournamentMatch(value.activeMatch);
    return { ...summary, entries, matches, activeMatch };
}

function normalizeProfile(value: unknown): CompetitiveProfile | null {
    if (!isRecord(value)) return null;
    const userId = identifier(value.userId, 64);
    const profileId = identifier(value.profileId, 48);
    if (!userId || !profileId) return null;
    const rating = integer(value.rating, 0, 10_000, 1_000);
    return {
        userId,
        profileId,
        displayName: text(value.displayName, 'ComePlayers', 24),
        rating,
        tier: text(value.tier, tierForRating(rating), 24),
        seasonPoints: integer(value.seasonPoints, 0, 1_000_000, 0),
        wins: integer(value.wins, 0, 1_000_000, 0),
        losses: integer(value.losses, 0, 1_000_000, 0),
        matches: integer(value.matches, 0, 1_000_000, 0),
        streak: integer(value.streak, 0, 100_000, 0),
        bestStreak: integer(value.bestStreak, 0, 100_000, 0),
        tournamentWins: integer(value.tournamentWins, 0, 100_000, 0),
        seasonId: text(value.seasonId, currentSeasonId(), 16),
        seasonEndsAt: timestampOrZero(value.seasonEndsAt),
        lifetimeWins: integer(value.lifetimeWins, 0, 1_000_000, 0),
        lifetimeLosses: integer(value.lifetimeLosses, 0, 1_000_000, 0),
        lifetimeTournamentWins: integer(value.lifetimeTournamentWins, 0, 100_000, 0),
        updatedAt: timestamp(value.updatedAt),
    };
}

function normalizeQueue(value: unknown): CompetitiveQueueSnapshot | null {
    if (!isRecord(value)) return null;
    const status: CompetitiveQueueStatus =
        value.status === 'SEARCHING' || value.status === 'MATCHED' || value.status === 'CANCELLED' || value.status === 'EXPIRED'
            ? value.status
            : 'IDLE';
    const matchedRoom = value.matchedRoom === null || value.matchedRoom === undefined
        ? null
        : normalizeMatchedRoom(value.matchedRoom);
    return {
        status,
        mode: value.mode === 'TEAM' ? 'TEAM' : 'SOLO',
        region: region(value.region),
        rating: integer(value.rating, 0, 10_000, 1_000),
        waitSeconds: integer(value.waitSeconds, 0, 86_400, 0),
        searchRange: integer(value.searchRange, 100, 2_000, 150),
        queuedAt: timestampOrZero(value.queuedAt),
        expiresAt: timestampOrZero(value.expiresAt),
        matchedRoom,
    };
}

function normalizeMatchedRoom(value: unknown): CompetitiveMatchedRoom | null {
    if (!isRecord(value)) return null;
    const roomId = identifier(value.roomId, 64);
    const inviteCode = code(value.inviteCode, 6);
    const topic = typeof value.topic === 'string' && /^marble-room:[0-9a-f-]{36}$/.test(value.topic) ? value.topic : '';
    if (!roomId || !inviteCode || !topic) return null;
    return { roomId, inviteCode, topic, mode: value.mode === 'TEAM' ? 'TEAM' : 'SOLO' };
}

function normalizeTournamentSummary(value: unknown): TournamentSummary | null {
    if (!isRecord(value)) return null;
    const tournamentId = identifier(value.tournamentId, 64);
    const tournamentCode = code(value.tournamentCode, 8);
    if (!tournamentId || !tournamentCode) return null;
    const status: TournamentStatus = value.status === 'ACTIVE' || value.status === 'FINISHED' || value.status === 'CANCELLED'
        ? value.status
        : 'OPEN';
    return {
        tournamentId,
        tournamentCode,
        name: text(value.name, 'ComePlayers Cup', 48),
        mode: value.mode === 'TEAM' ? 'TEAM' : 'SOLO',
        status,
        capacity: integer(value.capacity, 4, 8, 4),
        entryCount: integer(value.entryCount, 0, 8, 0),
        teamCount: integer(value.teamCount, 0, 4, 0),
        currentRound: integer(value.currentRound, 0, 4, 0),
        totalRounds: integer(value.totalRounds, 2, 3, 2),
        hostProfileId: identifier(value.hostProfileId, 48),
        championProfileId: identifier(value.championProfileId, 48),
        championDisplayName: text(value.championDisplayName, '', 24),
        joined: value.joined === true,
        owned: value.owned === true,
        createdAt: timestamp(value.createdAt),
    };
}

function normalizeTournamentEntry(value: unknown): TournamentEntry | null {
    if (!isRecord(value)) return null;
    const userId = identifier(value.userId, 64);
    const profileId = identifier(value.profileId, 48);
    if (!profileId) return null;
    return {
        userId,
        profileId,
        displayName: text(value.displayName, 'Player', 24),
        seed: integer(value.seed, 0, 8, 0),
        teamNumber: integer(value.teamNumber, 0, 4, 0),
        teamName: text(value.teamName, '', 32),
        eliminated: value.eliminated === true,
        joinedAt: timestamp(value.joinedAt),
        self: value.self === true,
    };
}

function normalizeTournamentMatch(value: unknown): TournamentBracketMatch | null {
    if (!isRecord(value)) return null;
    const matchId = identifier(value.matchId, 64);
    if (!matchId) return null;
    const status: TournamentMatchStatus = value.status === 'READY' || value.status === 'ACTIVE' || value.status === 'FINISHED' || value.status === 'BYE'
        ? value.status
        : 'PENDING';
    return {
        matchId,
        round: integer(value.round, 1, 4, 1),
        slot: integer(value.slot, 1, 8, 1),
        status,
        playerOneProfileId: identifier(value.playerOneProfileId, 48),
        playerOneName: text(value.playerOneName, 'TBD', 24),
        playerTwoProfileId: identifier(value.playerTwoProfileId, 48),
        playerTwoName: text(value.playerTwoName, 'TBD', 24),
        winnerProfileId: identifier(value.winnerProfileId, 48),
        roomId: identifier(value.roomId, 64),
        inviteCode: code(value.inviteCode, 6),
        topic: typeof value.topic === 'string' && /^marble-room:[0-9a-f-]{36}$/.test(value.topic) ? value.topic : '',
        selfMatch: value.selfMatch === true,
        teamOneNumber: integer(value.teamOneNumber, 0, 4, 0),
        teamTwoNumber: integer(value.teamTwoNumber, 0, 4, 0),
    };
}

function normalizeLeaderboardEntry(value: unknown): CompetitiveLeaderboardEntry | null {
    if (!isRecord(value)) return null;
    const profileId = identifier(value.profileId, 48);
    if (!profileId) return null;
    const rating = integer(value.rating, 0, 10_000, 1_000);
    return {
        rank: integer(value.rank, 1, 100_000, 1),
        profileId,
        displayName: text(value.displayName, 'ComePlayers', 24),
        rating,
        tier: text(value.tier, tierForRating(rating), 24),
        wins: integer(value.wins, 0, 1_000_000, 0),
        losses: integer(value.losses, 0, 1_000_000, 0),
        tournamentWins: integer(value.tournamentWins, 0, 100_000, 0),
        self: value.self === true,
    };
}

function currentSeasonId(): string {
    const date = new Date();
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function tierForRating(rating: number): string {
    if (rating >= 2_200) return 'MASTER';
    if (rating >= 1_900) return 'DIAMOND';
    if (rating >= 1_600) return 'PLATINUM';
    if (rating >= 1_300) return 'GOLD';
    if (rating >= 1_100) return 'SILVER';
    return 'BRONZE';
}

function code(value: unknown, length: number): string {
    if (typeof value !== 'string') return '';
    const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, length);
    return normalized.length === length ? normalized : '';
}

function region(value: unknown): string {
    if (typeof value !== 'string') return 'GLOBAL';
    return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16) || 'GLOBAL';
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

function timestampOrZero(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.trunc(value));
}

function integer(value: unknown, minimum: number, maximum: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
