export type AuthoritativeMatchPhase = 'WAITING' | 'ACTIVE' | 'FINISHED';
export type AuthoritativeMatchMode = 'SOLO' | 'TEAM';
export type AuthoritativeCommandKind =
    | 'ROLL'
    | 'PURCHASE'
    | 'UPGRADE'
    | 'TAKEOVER'
    | 'GAME_CENTER_CHOICE'
    | 'SELECT_OLYMPIC'
    | 'SELECT_TRAVEL'
    | 'ACTIVATE_SKILL'
    | 'END_TURN';
export type AuthoritativePendingActionKind =
    | 'PURCHASE'
    | 'UPGRADE'
    | 'TAKEOVER'
    | 'GAME_CENTER'
    | 'OLYMPIC'
    | 'WORLD_TRAVEL';
export type AuthoritativeSpecialResultKind =
    | 'FORTUNE'
    | 'GAME_CENTER'
    | 'OLYMPIC'
    | 'WORLD_TRAVEL'
    | 'ISLAND'
    | 'TAX'
    | 'BONUS_GAME';
export type AuthoritativeEventKind =
    | 'MATCH_STARTED'
    | 'DICE_ROLLED'
    | 'LANDING_RESOLVED'
    | 'PROPERTY_PURCHASED'
    | 'PROPERTY_UPGRADED'
    | 'RENT_PAID'
    | 'PROPERTY_TAKEN_OVER'
    | 'ASSET_LIQUIDATED'
    | 'PLAYER_BANKRUPT'
    | 'SPECIAL_TILE_RESOLVED'
    | 'FORTUNE_CARD_DRAWN'
    | 'GAME_CENTER_RESOLVED'
    | 'OLYMPIC_APPLIED'
    | 'OLYMPIC_EXPIRED'
    | 'WORLD_TRAVEL_COMPLETED'
    | 'LOADOUT_APPLIED'
    | 'CHARACTER_SKILL_ACTIVATED'
    | 'WORLD_EVENT_RESOLVED'
    | 'ISLAND_ENTERED'
    | 'ISLAND_TURN_SKIPPED'
    | 'TURN_ENDED'
    | 'MATCH_FINISHED';

export interface AuthoritativeMatchPlayer {
    readonly profileId: string;
    readonly displayName: string;
    readonly seat: number;
    readonly teamId?: 'BLUE' | 'GOLD';
    readonly position: number;
    readonly money: number;
    readonly bankrupt: boolean;
    readonly propertyCount: number;
    readonly netWorth: number;
    readonly islandTurns: number;
    readonly travelCredits: number;
    readonly rentShieldPercent: number;
    readonly rentShieldCharges: number;
    readonly characterId: string;
    readonly activeSkillId: string;
    readonly skillUsed: boolean;
    readonly pendantId: string;
    readonly boosterId: string;
    readonly freeUpgradeCredits: number;
}

export interface AuthoritativeDiceResult {
    readonly first: number;
    readonly second: number;
    readonly total: number;
    readonly isDouble: boolean;
}

export interface AuthoritativeLanding {
    readonly tileIndex: number;
    readonly tileType: string;
    readonly displayName: string;
}

export interface AuthoritativePendingAction {
    readonly kind: AuthoritativePendingActionKind;
    readonly tileIndex: number;
    readonly displayName: string;
    readonly cost: number;
    readonly targetLevel: number;
    readonly ownerProfileId: string;
    readonly options: readonly number[];
}

export interface AuthoritativeSpecialResult {
    readonly kind: AuthoritativeSpecialResultKind;
    readonly title: string;
    readonly message: string;
    readonly amount: number;
    readonly tileIndex: number;
    readonly targetTileIndex: number;
    readonly cardId: string;
}

export interface AuthoritativeProperty {
    readonly tileIndex: number;
    readonly displayName: string;
    readonly tileType: string;
    readonly ownerProfileId: string;
    readonly ownerSeat: number;
    readonly buildingLevel: number;
    readonly rent: number;
    readonly propertyValue: number;
    readonly takeoverCost: number;
    readonly rentMultiplier: number;
    readonly protected: boolean;
    readonly olympicUntilRound: number;
}


export interface AuthoritativeWorldEvent {
    readonly id: string;
    readonly title: string;
    readonly message: string;
    readonly amount: number;
    readonly round: number;
    readonly targetProfileId: string;
}

export interface AuthoritativeMatchSnapshot {
    readonly matchId: string;
    readonly roomId: string;
    readonly topic: string;
    readonly phase: AuthoritativeMatchPhase;
    readonly mode: AuthoritativeMatchMode;
    readonly revision: number;
    readonly round: number;
    readonly maxRounds: number;
    readonly currentTurnSeat: number;
    readonly currentTurnProfileId: string;
    readonly awaitingEndTurn: boolean;
    readonly lastDice: AuthoritativeDiceResult | null;
    readonly pendingAction: AuthoritativePendingAction | null;
    readonly landing: AuthoritativeLanding | null;
    readonly specialResult: AuthoritativeSpecialResult | null;
    readonly worldEvent: AuthoritativeWorldEvent | null;
    readonly winnerProfileId: string;
    readonly winnerTeamId: '' | 'BLUE' | 'GOLD';
    readonly finishReason: string;
    readonly lastEventSequence: number;
    readonly players: readonly AuthoritativeMatchPlayer[];
    readonly properties: readonly AuthoritativeProperty[];
    readonly updatedAt: number;
}

export interface AuthoritativeMatchEvent {
    readonly matchId: string;
    readonly sequence: number;
    readonly kind: AuthoritativeEventKind;
    readonly actorProfileId: string;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly createdAt: number;
}

export interface AuthoritativeActionResult<T = AuthoritativeMatchSnapshot> {
    readonly ok: boolean;
    readonly message: string;
    readonly data?: T;
}

const EVENT_KINDS: readonly AuthoritativeEventKind[] = [
    'MATCH_STARTED', 'DICE_ROLLED', 'LANDING_RESOLVED', 'PROPERTY_PURCHASED',
    'PROPERTY_UPGRADED', 'RENT_PAID', 'PROPERTY_TAKEN_OVER', 'ASSET_LIQUIDATED',
    'PLAYER_BANKRUPT', 'SPECIAL_TILE_RESOLVED', 'FORTUNE_CARD_DRAWN',
    'GAME_CENTER_RESOLVED', 'OLYMPIC_APPLIED', 'OLYMPIC_EXPIRED',
    'WORLD_TRAVEL_COMPLETED', 'LOADOUT_APPLIED', 'CHARACTER_SKILL_ACTIVATED',
    'WORLD_EVENT_RESOLVED', 'ISLAND_ENTERED', 'ISLAND_TURN_SKIPPED',
    'TURN_ENDED', 'MATCH_FINISHED',
];

const PENDING_KINDS: readonly AuthoritativePendingActionKind[] = [
    'PURCHASE', 'UPGRADE', 'TAKEOVER', 'GAME_CENTER', 'OLYMPIC', 'WORLD_TRAVEL',
];

const SPECIAL_KINDS: readonly AuthoritativeSpecialResultKind[] = [
    'FORTUNE', 'GAME_CENTER', 'OLYMPIC', 'WORLD_TRAVEL', 'ISLAND', 'TAX', 'BONUS_GAME',
];

export function normalizeAuthoritativeSnapshot(value: unknown): AuthoritativeMatchSnapshot | null {
    if (!isRecord(value)) return null;
    const matchId = identifier(value.matchId, 64);
    const roomId = identifier(value.roomId, 64);
    const topic = typeof value.topic === 'string' && /^marble-room:[0-9a-f-]{36}$/.test(value.topic)
        ? value.topic
        : '';
    if (!matchId || !roomId || !topic) return null;
    const players = Array.isArray(value.players)
        ? value.players.map(normalizePlayer).filter((entry): entry is AuthoritativeMatchPlayer => entry !== null).slice(0, 4)
        : [];
    const properties = Array.isArray(value.properties)
        ? value.properties.map(normalizeProperty).filter((entry): entry is AuthoritativeProperty => entry !== null).slice(0, 32)
        : [];
    const lastDice = value.lastDice === null || value.lastDice === undefined ? null : normalizeDice(value.lastDice);
    const pendingAction = value.pendingAction === null || value.pendingAction === undefined
        ? null
        : normalizePendingAction(value.pendingAction);
    const landing = value.landing === null || value.landing === undefined ? null : normalizeLanding(value.landing);
    const specialResult = value.specialResult === null || value.specialResult === undefined
        ? null
        : normalizeSpecialResult(value.specialResult);
    const worldEvent = value.worldEvent === null || value.worldEvent === undefined
        ? null
        : normalizeWorldEvent(value.worldEvent);
    const winnerTeamId = value.winnerTeamId === 'BLUE' || value.winnerTeamId === 'GOLD' ? value.winnerTeamId : '';
    return {
        matchId,
        roomId,
        topic,
        phase: value.phase === 'ACTIVE' || value.phase === 'FINISHED' ? value.phase : 'WAITING',
        mode: value.mode === 'TEAM' ? 'TEAM' : 'SOLO',
        revision: integer(value.revision, 0, Number.MAX_SAFE_INTEGER, 0),
        round: integer(value.round, 1, 999, 1),
        maxRounds: integer(value.maxRounds, 4, 50, 12),
        currentTurnSeat: integer(value.currentTurnSeat, 0, 3, 0),
        currentTurnProfileId: identifier(value.currentTurnProfileId, 48),
        awaitingEndTurn: value.awaitingEndTurn === true,
        lastDice,
        pendingAction,
        landing,
        specialResult,
        worldEvent,
        winnerProfileId: identifier(value.winnerProfileId, 48),
        winnerTeamId,
        finishReason: text(value.finishReason, '', 48),
        lastEventSequence: integer(value.lastEventSequence, 0, Number.MAX_SAFE_INTEGER, 0),
        players,
        properties,
        updatedAt: timestamp(value.updatedAt),
    };
}

export function normalizeAuthoritativeEvent(value: unknown): AuthoritativeMatchEvent | null {
    if (!isRecord(value)) return null;
    const matchId = identifier(value.matchId, 64);
    const kind = typeof value.kind === 'string' && EVENT_KINDS.includes(value.kind as AuthoritativeEventKind)
        ? value.kind as AuthoritativeEventKind
        : null;
    if (!matchId || !kind) return null;
    return {
        matchId,
        sequence: integer(value.sequence, 1, Number.MAX_SAFE_INTEGER, 1),
        kind,
        actorProfileId: identifier(value.actorProfileId, 48),
        payload: isRecord(value.payload) ? value.payload : {},
        createdAt: timestamp(value.createdAt),
    };
}

export function idempotencyKey(prefix: string, profileId: string, revision: number, now = Date.now()): string {
    const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'cmd';
    const safeProfile = profileId.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(-16) || 'player';
    return `${safePrefix}-${safeProfile}-${Math.max(0, Math.trunc(revision)).toString(36)}-${Math.max(0, Math.trunc(now)).toString(36)}`.slice(0, 80);
}

function normalizePlayer(value: unknown): AuthoritativeMatchPlayer | null {
    if (!isRecord(value)) return null;
    const profileId = identifier(value.profileId, 48);
    if (!profileId) return null;
    const teamId = value.teamId === 'BLUE' || value.teamId === 'GOLD' ? value.teamId : undefined;
    const money = integer(value.money, 0, 2_000_000_000, 2_000_000);
    return {
        profileId,
        displayName: text(value.displayName, 'ComePlayers Player', 24),
        seat: integer(value.seat, 0, 3, 0),
        ...(teamId ? { teamId } : {}),
        position: integer(value.position, 0, 31, 0),
        money,
        bankrupt: value.bankrupt === true,
        propertyCount: integer(value.propertyCount, 0, 32, 0),
        netWorth: integer(value.netWorth, 0, 4_000_000_000, money),
        islandTurns: integer(value.islandTurns, 0, 8, 0),
        travelCredits: integer(value.travelCredits, 0, 8, 0),
        rentShieldPercent: integer(value.rentShieldPercent, 0, 90, 0),
        rentShieldCharges: integer(value.rentShieldCharges, 0, 8, 0),
        characterId: identifier(value.characterId, 32),
        activeSkillId: identifier(value.activeSkillId, 40),
        skillUsed: value.skillUsed === true,
        pendantId: identifier(value.pendantId, 40),
        boosterId: identifier(value.boosterId, 40),
        freeUpgradeCredits: integer(value.freeUpgradeCredits, 0, 8, 0),
    };
}

function normalizeProperty(value: unknown): AuthoritativeProperty | null {
    if (!isRecord(value)) return null;
    const ownerProfileId = identifier(value.ownerProfileId, 48);
    const tileIndex = integer(value.tileIndex, 0, 31, -1);
    if (!ownerProfileId || tileIndex < 0) return null;
    return {
        tileIndex,
        displayName: text(value.displayName, `City ${tileIndex}`, 32),
        tileType: identifier(value.tileType, 24),
        ownerProfileId,
        ownerSeat: integer(value.ownerSeat, 0, 3, 0),
        buildingLevel: integer(value.buildingLevel, 0, 4, 0),
        rent: integer(value.rent, 0, 2_000_000_000, 0),
        propertyValue: integer(value.propertyValue, 0, 2_000_000_000, 0),
        takeoverCost: integer(value.takeoverCost, 0, 2_000_000_000, 0),
        rentMultiplier: decimal(value.rentMultiplier, 0.5, 6, 1),
        protected: value.protected === true,
        olympicUntilRound: integer(value.olympicUntilRound, 0, 999, 0),
    };
}

function normalizePendingAction(value: unknown): AuthoritativePendingAction | null {
    if (!isRecord(value)) return null;
    const kind = typeof value.kind === 'string' && PENDING_KINDS.includes(value.kind as AuthoritativePendingActionKind)
        ? value.kind as AuthoritativePendingActionKind
        : null;
    if (!kind) return null;
    const options = Array.isArray(value.options)
        ? value.options
            .map((entry) => strictInteger(entry, 0, 31))
            .filter((entry): entry is number => entry !== null)
            .filter((entry, index, entries) => entries.indexOf(entry) === index)
            .slice(0, 32)
        : [];
    return {
        kind,
        tileIndex: integer(value.tileIndex, 0, 31, 0),
        displayName: text(value.displayName, 'Board Decision', 40),
        cost: integer(value.cost, 0, 2_000_000_000, 0),
        targetLevel: integer(value.targetLevel, 0, 4, 0),
        ownerProfileId: identifier(value.ownerProfileId, 48),
        options,
    };
}

function normalizeSpecialResult(value: unknown): AuthoritativeSpecialResult | null {
    if (!isRecord(value)) return null;
    const kind = typeof value.kind === 'string' && SPECIAL_KINDS.includes(value.kind as AuthoritativeSpecialResultKind)
        ? value.kind as AuthoritativeSpecialResultKind
        : null;
    if (!kind) return null;
    return {
        kind,
        title: text(value.title, kind.replace('_', ' '), 40),
        message: text(value.message, 'Server special tile resolved.', 140),
        amount: integer(value.amount, -2_000_000_000, 2_000_000_000, 0),
        tileIndex: integer(value.tileIndex, 0, 31, 0),
        targetTileIndex: integer(value.targetTileIndex, 0, 31, 0),
        cardId: identifier(value.cardId, 40),
    };
}

function normalizeWorldEvent(value: unknown): AuthoritativeWorldEvent | null {
    if (!isRecord(value)) return null;
    const id = identifier(value.id, 40);
    if (!id) return null;
    return {
        id,
        title: text(value.title, 'World Event', 48),
        message: text(value.message, 'A server World Event was resolved.', 160),
        amount: integer(value.amount, -2_000_000_000, 2_000_000_000, 0),
        round: integer(value.round, 1, 999, 1),
        targetProfileId: identifier(value.targetProfileId, 48),
    };
}

function normalizeLanding(value: unknown): AuthoritativeLanding | null {
    if (!isRecord(value)) return null;
    return {
        tileIndex: integer(value.tileIndex, 0, 31, 0),
        tileType: identifier(value.tileType, 24),
        displayName: text(value.displayName, 'Board Tile', 32),
    };
}

function normalizeDice(value: unknown): AuthoritativeDiceResult | null {
    if (!isRecord(value)) return null;
    if (!Number.isInteger(value.first) || !Number.isInteger(value.second)) return null;
    const first = value.first as number;
    const second = value.second as number;
    if (first < 1 || first > 6 || second < 1 || second > 6) return null;
    return { first, second, total: first + second, isDouble: first === second };
}

function identifier(value: unknown, limit: number): string {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, limit);
}

function text(value: unknown, fallback: string, limit: number): string {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit);
    return normalized || fallback;
}

function integer(value: unknown, minimum: number, maximum: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function strictInteger(value: unknown, minimum: number, maximum: number): number | null {
    if (typeof value !== 'number' || !Number.isInteger(value)) return null;
    return value >= minimum && value <= maximum ? value : null;
}

function decimal(value: unknown, minimum: number, maximum: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(minimum, Math.min(maximum, value));
}

function timestamp(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.trunc(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
