import type { MatchMode, TeamId } from './MatchSettingsData';

export const ONLINE_PROFILE_VERSION = 2;
export const ONLINE_FRIEND_LIMIT = 24;
export const FRIEND_ROOM_PLAYER_LIMIT = 4;
export const FRIEND_ROOM_SPECTATOR_LIMIT = 2;
export const FRIEND_ROOM_RECONNECT_WINDOW_MS = 10 * 60 * 1000;

export type PresenceState = 'OFFLINE' | 'ONLINE' | 'IN_ROOM' | 'IN_MATCH';
export type CloudSyncState = 'LOCAL_ONLY' | 'READY_TO_LINK' | 'SYNCED' | 'CONFLICT';
export type FriendRoomPhase = 'LOBBY' | 'MATCH' | 'CLOSED';
export type FriendRoomRole = 'PLAYER' | 'SPECTATOR';
export type RealtimeProvider = 'LOCAL' | 'SUPABASE';
export type RealtimeConnectionState = 'DISABLED' | 'CONFIG_REQUIRED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';

export interface OnlineFriendData {
    readonly profileId: string;
    readonly displayName: string;
    readonly playerTag: string;
    readonly rating: number;
    readonly online: boolean;
    readonly lastSeenAt: number;
}

export interface FriendRoomSlotData {
    readonly slotId: string;
    readonly profileId: string;
    readonly displayName: string;
    readonly role: FriendRoomRole;
    readonly ready: boolean;
    readonly connected: boolean;
    readonly joinedAt: number;
    readonly disconnectedAt: number;
    readonly teamId?: TeamId;
}

export interface FriendRoomResumeData {
    readonly roomId: string;
    readonly inviteCode: string;
    readonly reconnectToken: string;
    readonly hostProfileId: string;
    readonly mode: MatchMode;
    readonly phase: FriendRoomPhase;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly expiresAt: number;
    readonly maxPlayers: number;
    readonly maxSpectators: number;
    readonly slots: readonly FriendRoomSlotData[];
    readonly serverRoomId?: string;
    readonly realtimeTopic?: string;
    readonly localRole?: FriendRoomRole;
}

export interface CloudProfileState {
    readonly state: CloudSyncState;
    readonly localGeneration: number;
    readonly remoteGeneration: number;
    readonly lastPreparedAt: number;
    readonly lastSyncedAt: number;
    readonly manifestChecksum: string;
}

export interface RealtimeBackendData {
    readonly provider: RealtimeProvider;
    readonly state: RealtimeConnectionState;
    readonly authUserId: string;
    readonly connectedRoomId: string;
    readonly roomTopic: string;
    readonly lastConnectedAt: number;
    readonly lastDisconnectedAt: number;
    readonly lastHeartbeatAt: number;
    readonly latencyMs: number;
    readonly reconnectAttempts: number;
    readonly lastError: string;
}

export interface OnlineProfileData {
    readonly version: number;
    readonly profileId: string;
    readonly displayName: string;
    readonly playerTag: string;
    readonly friendCode: string;
    readonly presence: PresenceState;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly friends: readonly OnlineFriendData[];
    readonly activeRoom: FriendRoomResumeData | null;
    readonly cloud: CloudProfileState;
    readonly realtime: RealtimeBackendData;
}

export function createDefaultOnlineProfile(now = 0): OnlineProfileData {
    const timestamp = safeTimestamp(now);
    return {
        version: ONLINE_PROFILE_VERSION,
        profileId: 'CP-LOCAL-0001',
        displayName: 'Guest Player',
        playerTag: 'LOCAL#0001',
        friendCode: 'CP0001',
        presence: 'OFFLINE',
        createdAt: timestamp,
        updatedAt: timestamp,
        friends: [],
        activeRoom: null,
        cloud: createDefaultCloudProfileState(),
        realtime: createDefaultRealtimeBackendData(),
    };
}

export function createDefaultCloudProfileState(): CloudProfileState {
    return {
        state: 'LOCAL_ONLY',
        localGeneration: 0,
        remoteGeneration: 0,
        lastPreparedAt: 0,
        lastSyncedAt: 0,
        manifestChecksum: '',
    };
}

export function createDefaultRealtimeBackendData(): RealtimeBackendData {
    return {
        provider: 'LOCAL',
        state: 'CONFIG_REQUIRED',
        authUserId: '',
        connectedRoomId: '',
        roomTopic: '',
        lastConnectedAt: 0,
        lastDisconnectedAt: 0,
        lastHeartbeatAt: 0,
        latencyMs: 0,
        reconnectAttempts: 0,
        lastError: '',
    };
}

export function normalizeOnlineProfile(value: unknown, now = 0): OnlineProfileData {
    const defaults = createDefaultOnlineProfile(now);
    if (!isRecord(value)) return defaults;
    const friends = Array.isArray(value.friends)
        ? value.friends
            .map(normalizeFriend)
            .filter((entry): entry is OnlineFriendData => entry !== null)
            .filter((entry, index, items) => items.findIndex((item) => item.profileId === entry.profileId) === index)
            .slice(0, ONLINE_FRIEND_LIMIT)
        : [];
    return {
        version: ONLINE_PROFILE_VERSION,
        profileId: safeIdentifier(value.profileId, defaults.profileId, 48),
        displayName: safeText(value.displayName, defaults.displayName, 24),
        playerTag: safeText(value.playerTag, defaults.playerTag, 18),
        friendCode: safeInviteCode(value.friendCode, defaults.friendCode),
        presence: normalizePresence(value.presence),
        createdAt: safeTimestamp(value.createdAt),
        updatedAt: safeTimestamp(value.updatedAt),
        friends,
        activeRoom: value.activeRoom === null ? null : normalizeFriendRoom(value.activeRoom),
        cloud: normalizeCloudProfileState(value.cloud),
        realtime: normalizeRealtimeBackendData(value.realtime),
    };
}

export function normalizeFriendRoom(value: unknown): FriendRoomResumeData | null {
    if (!isRecord(value)) return null;
    const mode: MatchMode = value.mode === 'TEAM' ? 'TEAM' : 'SOLO';
    const maxPlayers = clampInteger(value.maxPlayers, 2, FRIEND_ROOM_PLAYER_LIMIT, FRIEND_ROOM_PLAYER_LIMIT);
    const maxSpectators = clampInteger(value.maxSpectators, 0, FRIEND_ROOM_SPECTATOR_LIMIT, FRIEND_ROOM_SPECTATOR_LIMIT);
    const slots = Array.isArray(value.slots)
        ? value.slots
            .map(normalizeRoomSlot)
            .filter((slot): slot is FriendRoomSlotData => slot !== null)
            .filter((slot, index, items) => items.findIndex((item) => item.slotId === slot.slotId) === index)
            .slice(0, maxPlayers + maxSpectators)
        : [];
    const serverRoomId = safeIdentifier(value.serverRoomId, '', 64);
    const realtimeTopic = safeTopic(value.realtimeTopic);
    const localRole: FriendRoomRole | undefined = value.localRole === 'SPECTATOR'
        ? 'SPECTATOR'
        : value.localRole === 'PLAYER'
            ? 'PLAYER'
            : undefined;
    return {
        roomId: safeIdentifier(value.roomId, 'room-local', 64),
        inviteCode: safeInviteCode(value.inviteCode, 'CPROOM'),
        reconnectToken: safeIdentifier(value.reconnectToken, 'reconnect-local', 96),
        hostProfileId: safeIdentifier(value.hostProfileId, 'CP-LOCAL-0001', 48),
        mode,
        phase: normalizeRoomPhase(value.phase),
        createdAt: safeTimestamp(value.createdAt),
        updatedAt: safeTimestamp(value.updatedAt),
        expiresAt: safeTimestamp(value.expiresAt),
        maxPlayers,
        maxSpectators,
        slots: mode === 'TEAM' ? assignMissingTeams(slots) : slots.map(({ teamId: _teamId, ...slot }) => slot),
        ...(serverRoomId ? { serverRoomId } : {}),
        ...(realtimeTopic ? { realtimeTopic } : {}),
        ...(localRole ? { localRole } : {}),
    };
}

export function normalizeCloudProfileState(value: unknown): CloudProfileState {
    const defaults = createDefaultCloudProfileState();
    if (!isRecord(value)) return defaults;
    return {
        state: normalizeCloudState(value.state),
        localGeneration: nonNegativeInteger(value.localGeneration),
        remoteGeneration: nonNegativeInteger(value.remoteGeneration),
        lastPreparedAt: safeTimestamp(value.lastPreparedAt),
        lastSyncedAt: safeTimestamp(value.lastSyncedAt),
        manifestChecksum: safeIdentifier(value.manifestChecksum, '', 64),
    };
}

export function normalizeRealtimeBackendData(value: unknown): RealtimeBackendData {
    const defaults = createDefaultRealtimeBackendData();
    if (!isRecord(value)) return defaults;
    return {
        provider: value.provider === 'SUPABASE' ? 'SUPABASE' : 'LOCAL',
        state: normalizeRealtimeState(value.state),
        authUserId: safeIdentifier(value.authUserId, '', 64),
        connectedRoomId: safeIdentifier(value.connectedRoomId, '', 64),
        roomTopic: safeTopic(value.roomTopic),
        lastConnectedAt: safeTimestamp(value.lastConnectedAt),
        lastDisconnectedAt: safeTimestamp(value.lastDisconnectedAt),
        lastHeartbeatAt: safeTimestamp(value.lastHeartbeatAt),
        latencyMs: clampInteger(value.latencyMs, 0, 120_000, 0),
        reconnectAttempts: clampInteger(value.reconnectAttempts, 0, 100, 0),
        lastError: safeText(value.lastError, '', 180),
    };
}

function normalizeFriend(value: unknown): OnlineFriendData | null {
    if (!isRecord(value)) return null;
    const profileId = safeIdentifier(value.profileId, '', 48);
    if (!profileId) return null;
    return {
        profileId,
        displayName: safeText(value.displayName, 'ComePlayers Friend', 24),
        playerTag: safeText(value.playerTag, 'PLAYER#0000', 18),
        rating: clampInteger(value.rating, 0, 9_999, 1_000),
        online: value.online === true,
        lastSeenAt: safeTimestamp(value.lastSeenAt),
    };
}

function normalizeRoomSlot(value: unknown): FriendRoomSlotData | null {
    if (!isRecord(value)) return null;
    const slotId = safeIdentifier(value.slotId, '', 64);
    const profileId = safeIdentifier(value.profileId, '', 48);
    if (!slotId || !profileId) return null;
    const role: FriendRoomRole = value.role === 'SPECTATOR' ? 'SPECTATOR' : 'PLAYER';
    const teamId: TeamId | undefined = value.teamId === 'BLUE' || value.teamId === 'GOLD'
        ? value.teamId
        : undefined;
    return {
        slotId,
        profileId,
        displayName: safeText(value.displayName, 'ComePlayers Guest', 24),
        role,
        ready: value.ready === true,
        connected: value.connected !== false,
        joinedAt: safeTimestamp(value.joinedAt),
        disconnectedAt: safeTimestamp(value.disconnectedAt),
        ...(teamId ? { teamId } : {}),
    };
}

function assignMissingTeams(slots: readonly FriendRoomSlotData[]): readonly FriendRoomSlotData[] {
    let playerIndex = 0;
    return slots.map((slot) => {
        if (slot.role !== 'PLAYER') return slot;
        const teamId: TeamId = slot.teamId ?? (playerIndex % 2 === 0 ? 'BLUE' : 'GOLD');
        playerIndex += 1;
        return { ...slot, teamId };
    });
}

function normalizePresence(value: unknown): PresenceState {
    return value === 'ONLINE' || value === 'IN_ROOM' || value === 'IN_MATCH' ? value : 'OFFLINE';
}

function normalizeCloudState(value: unknown): CloudSyncState {
    return value === 'READY_TO_LINK' || value === 'SYNCED' || value === 'CONFLICT' ? value : 'LOCAL_ONLY';
}

function normalizeRealtimeState(value: unknown): RealtimeConnectionState {
    return value === 'DISABLED'
        || value === 'CONNECTING'
        || value === 'CONNECTED'
        || value === 'RECONNECTING'
        || value === 'ERROR'
        ? value
        : 'CONFIG_REQUIRED';
}

function normalizeRoomPhase(value: unknown): FriendRoomPhase {
    return value === 'MATCH' || value === 'CLOSED' ? value : 'LOBBY';
}

function safeInviteCode(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback;
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    return normalized.length === 6 ? normalized : fallback;
}

function safeTopic(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 128);
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
