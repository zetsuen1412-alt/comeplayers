import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { MatchMode, TeamId } from '../save/MatchSettingsData';
import type {
    FriendRoomPhase,
    FriendRoomResumeData,
    FriendRoomRole,
    FriendRoomSlotData,
    OnlineProfileData,
} from '../save/OnlineProfileData';
import {
    createSupabaseRuntimeClient,
    loadSupabaseRuntimeConfig,
    SupabaseRuntimeConfig,
} from './SupabaseRuntimeConfig';

export interface SupabaseRoomRegistry {
    readonly roomId: string;
    readonly inviteCode: string;
    readonly topic: string;
    readonly hostUserId: string;
    readonly mode: MatchMode;
    readonly phase: FriendRoomPhase;
    readonly maxPlayers: number;
    readonly maxSpectators: number;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly expiresAt: number;
}

export interface RealtimePresencePayload {
    readonly profileId: string;
    readonly displayName: string;
    readonly playerTag: string;
    readonly role: FriendRoomRole;
    readonly ready: boolean;
    readonly teamId?: TeamId;
    readonly onlineAt: number;
}

export interface RealtimeRoomStatePayload {
    readonly roomId: string;
    readonly inviteCode: string;
    readonly hostProfileId: string;
    readonly mode: MatchMode;
    readonly phase: FriendRoomPhase;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly expiresAt: number;
    readonly maxPlayers: number;
    readonly maxSpectators: number;
    readonly slots: readonly FriendRoomSlotData[];
}

export interface SupabaseRealtimeHandlers {
    readonly onRoomState?: (payload: RealtimeRoomStatePayload) => void;
    readonly onPresenceSync?: (presences: readonly RealtimePresencePayload[]) => void;
    readonly onReadyState?: (profileId: string, ready: boolean) => void;
    readonly onConnectionState?: (state: SupabaseRealtimeConnectionSnapshot) => void;
}

export interface SupabaseRealtimeConnectionSnapshot {
    readonly configured: boolean;
    readonly connected: boolean;
    readonly connecting: boolean;
    readonly roomId: string;
    readonly topic: string;
    readonly authUserId: string;
    readonly latencyMs: number;
    readonly lastError: string;
}

export interface SupabaseRealtimeActionResult<T = undefined> {
    readonly ok: boolean;
    readonly message: string;
    readonly data?: T;
    readonly snapshot: SupabaseRealtimeConnectionSnapshot;
}

export class SupabaseRealtimeRoomAdapter {
    private client: SupabaseClient | null = null;
    private channel: RealtimeChannel | null = null;
    private config: SupabaseRuntimeConfig | null = null;
    private handlers: SupabaseRealtimeHandlers = {};
    private registry: SupabaseRoomRegistry | null = null;
    private authUserId = '';
    private connecting = false;
    private connected = false;
    private latencyMs = 0;
    private lastError = '';

    public snapshot(): SupabaseRealtimeConnectionSnapshot {
        const runtimeConfig = loadSupabaseRuntimeConfig();
        return {
            configured: runtimeConfig.configured,
            connected: this.connected,
            connecting: this.connecting,
            roomId: this.registry?.roomId ?? '',
            topic: this.registry?.topic ?? '',
            authUserId: this.authUserId,
            latencyMs: this.latencyMs,
            lastError: this.lastError || (runtimeConfig.configured ? '' : runtimeConfig.message),
        };
    }

    public async createRoom(
        profile: OnlineProfileData,
        mode: MatchMode,
        settings: Readonly<Record<string, unknown>>,
    ): Promise<SupabaseRealtimeActionResult<SupabaseRoomRegistry>> {
        try {
            const client = await this.ensureClient();
            const response = await client.rpc('create_marble_realtime_room', {
                p_profile_id: profile.profileId,
                p_display_name: profile.displayName,
                p_mode: mode,
                p_settings: settings,
            });
            if (response.error) throw response.error;
            const registry = normalizeRoomRegistry(response.data);
            if (!registry) throw new Error('Supabase returned an invalid room registry payload.');
            this.registry = registry;
            return this.success(`Supabase room ${registry.inviteCode} created.`, registry);
        } catch (error: unknown) {
            return this.failure(errorMessage(error, 'Supabase room could not be created.'));
        }
    }

    public async joinRoom(
        inviteCode: string,
        profile: OnlineProfileData,
        role: FriendRoomRole,
    ): Promise<SupabaseRealtimeActionResult<SupabaseRoomRegistry>> {
        try {
            const normalizedCode = normalizeInviteCode(inviteCode);
            if (!normalizedCode) throw new Error('Enter a valid six-character invite code.');
            const client = await this.ensureClient();
            const response = await client.rpc('join_marble_realtime_room', {
                p_invite_code: normalizedCode,
                p_profile_id: profile.profileId,
                p_display_name: profile.displayName,
                p_role: role,
            });
            if (response.error) throw response.error;
            const registry = normalizeRoomRegistry(response.data);
            if (!registry) throw new Error('Supabase returned an invalid join payload.');
            this.registry = registry;
            return this.success(`Joined Supabase room ${registry.inviteCode} as ${role.toLowerCase()}.`, registry);
        } catch (error: unknown) {
            return this.failure(errorMessage(error, 'Supabase room could not be joined.'));
        }
    }

    public async connect(
        registry: SupabaseRoomRegistry,
        profile: OnlineProfileData,
        role: FriendRoomRole,
        ready: boolean,
        handlers: SupabaseRealtimeHandlers = {},
    ): Promise<SupabaseRealtimeActionResult> {
        this.connecting = true;
        this.handlers = handlers;
        this.registry = registry;
        this.emitState();
        try {
            const client = await this.ensureClient();
            await this.removeChannel();
            const channel = client.channel(registry.topic, {
                config: {
                    private: this.config?.privateChannels !== false,
                    broadcast: { ack: true, self: true },
                    presence: { key: profile.profileId },
                },
            });
            this.channel = channel;
            channel
                .on<RealtimeRoomStatePayload>('broadcast', { event: 'room_state' }, ({ payload }) => {
                    const normalized = normalizeRoomStatePayload(payload);
                    if (normalized) this.handlers.onRoomState?.(normalized);
                })
                .on<{ profileId: string; ready: boolean }>('broadcast', { event: 'ready_state' }, ({ payload }) => {
                    const profileId = safeIdentifier(payload.profileId, 48);
                    if (profileId) this.handlers.onReadyState?.(profileId, payload.ready === true);
                })
                .on('presence', { event: 'sync' }, () => {
                    if (!this.channel) return;
                    this.handlers.onPresenceSync?.(flattenPresence(this.channel.presenceState<RealtimePresencePayload>()));
                });

            await new Promise<void>((resolve, reject) => {
                let settled = false;
                channel.subscribe((status, error) => {
                    if (status === 'SUBSCRIBED' && !settled) {
                        settled = true;
                        resolve();
                        return;
                    }
                    if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !settled) {
                        settled = true;
                        reject(error ?? new Error(`Realtime channel ${status.toLowerCase()}.`));
                    }
                }, 12_000);
            });

            const presenceStatus = await channel.track({
                profileId: profile.profileId,
                displayName: profile.displayName,
                playerTag: profile.playerTag,
                role,
                ready,
                onlineAt: Date.now(),
            });
            if (presenceStatus !== 'ok') throw new Error(`Presence track failed: ${presenceStatus}.`);
            await this.updateOwnMembership({ ready, connected: true, last_seen_at: new Date().toISOString() });
            this.connected = true;
            this.connecting = false;
            this.lastError = '';
            this.emitState();
            await this.measureLatency();
            return this.success(`Realtime connected to ${registry.inviteCode}.`);
        } catch (error: unknown) {
            this.connected = false;
            this.connecting = false;
            this.lastError = errorMessage(error, 'Realtime connection failed.');
            await this.removeChannel();
            this.emitState();
            return this.failure(this.lastError);
        }
    }

    public async broadcastRoom(room: FriendRoomResumeData): Promise<SupabaseRealtimeActionResult> {
        const payload = roomStateFromLocalRoom(room);
        if (!payload) return this.failure('The active room cannot be converted to a realtime payload.');
        return this.send('room_state', payload, 'Room state synchronized.');
    }

    public async broadcastReady(profileId: string, ready: boolean): Promise<SupabaseRealtimeActionResult> {
        try {
            await this.updateOwnMembership({ ready, connected: true, last_seen_at: new Date().toISOString() });
        } catch (error: unknown) {
            return this.failure(errorMessage(error, 'Ready state could not be persisted.'));
        }
        return this.send('ready_state', { profileId, ready, sentAt: Date.now() }, 'Ready state persisted and synchronized.');
    }

    public async measureLatency(): Promise<SupabaseRealtimeActionResult> {
        if (!this.channel || !this.connected) return this.failure('Realtime is not connected.');
        const startedAt = Date.now();
        const status = await this.channel.send({
            type: 'broadcast',
            event: 'heartbeat',
            payload: { sentAt: startedAt, profileId: this.authUserId },
        });
        if (status !== 'ok') return this.failure(`Realtime heartbeat failed: ${status}.`);
        this.latencyMs = Math.max(0, Date.now() - startedAt);
        this.emitState();
        return this.success(`Realtime heartbeat acknowledged in ${this.latencyMs} ms.`);
    }

    public async disconnect(): Promise<SupabaseRealtimeActionResult> {
        try {
            await this.updateOwnMembership({ connected: false, last_seen_at: new Date().toISOString() });
        } catch {
            // The socket may already be offline; server expiry remains the fallback.
        }
        await this.removeChannel();
        this.connected = false;
        this.connecting = false;
        this.registry = null;
        this.latencyMs = 0;
        this.emitState();
        return this.success('Supabase Realtime disconnected. Local play remains available.');
    }

    private async send(event: string, payload: object, message: string): Promise<SupabaseRealtimeActionResult> {
        if (!this.channel || !this.connected) return this.failure('Realtime is not connected.');
        const status = await this.channel.send({ type: 'broadcast', event, payload });
        return status === 'ok'
            ? this.success(message)
            : this.failure(`Realtime send failed: ${status}.`);
    }

    private async updateOwnMembership(patch: Readonly<Record<string, unknown>>): Promise<void> {
        if (!this.client || !this.registry || !this.authUserId) return;
        const response = await this.client
            .from('marble_realtime_room_members')
            .update(patch)
            .eq('room_id', this.registry.roomId)
            .eq('user_id', this.authUserId);
        if (response.error) throw response.error;
    }

    private async ensureClient(): Promise<SupabaseClient> {
        const loaded = loadSupabaseRuntimeConfig();
        if (!loaded.configured || !loaded.config) throw new Error(loaded.message);
        if (!this.client || this.config?.projectUrl !== loaded.config.projectUrl || this.config.publishableKey !== loaded.config.publishableKey) {
            await this.removeChannel();
            this.config = loaded.config;
            this.client = createSupabaseRuntimeClient<SupabaseClient>(loaded.config.projectUrl, loaded.config.publishableKey, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: false,
                },
            });
        }
        let sessionResult = await this.client.auth.getSession();
        if (sessionResult.error) throw sessionResult.error;
        let session = sessionResult.data.session;
        if (!session && loaded.config.autoAnonymousAuth) {
            const signIn = await this.client.auth.signInAnonymously();
            if (signIn.error) throw signIn.error;
            session = signIn.data.session;
        }
        if (loaded.config.privateChannels && !session) {
            throw new Error('Private Realtime requires an authenticated session. Enable anonymous sign-ins or log in first.');
        }
        if (session) {
            this.authUserId = session.user.id;
            await this.client.realtime.setAuth(session.access_token);
        } else {
            this.authUserId = '';
        }
        return this.client;
    }

    private async removeChannel(): Promise<void> {
        if (!this.channel || !this.client) {
            this.channel = null;
            return;
        }
        try {
            await this.channel.untrack();
        } catch {
            // Best-effort presence cleanup during network loss.
        }
        try {
            await this.client.removeChannel(this.channel);
        } catch {
            // Socket teardown must not block local fallback.
        }
        this.channel = null;
    }

    private success<T = undefined>(message: string, data?: T): SupabaseRealtimeActionResult<T> {
        return {
            ok: true,
            message,
            ...(data === undefined ? {} : { data }),
            snapshot: this.snapshot(),
        };
    }

    private failure<T = undefined>(message: string): SupabaseRealtimeActionResult<T> {
        this.lastError = message;
        return { ok: false, message, snapshot: this.snapshot() };
    }

    private emitState(): void {
        this.handlers.onConnectionState?.(this.snapshot());
    }
}

export function normalizeRoomRegistry(value: unknown): SupabaseRoomRegistry | null {
    if (!isRecord(value)) return null;
    const roomId = safeIdentifier(value.roomId, 64);
    const inviteCode = normalizeInviteCode(value.inviteCode);
    const topic = safeTopic(value.topic);
    const hostUserId = safeIdentifier(value.hostUserId, 64);
    if (!roomId || !inviteCode || !topic || !hostUserId) return null;
    return {
        roomId,
        inviteCode,
        topic,
        hostUserId,
        mode: value.mode === 'TEAM' ? 'TEAM' : 'SOLO',
        phase: value.phase === 'MATCH' || value.phase === 'CLOSED' ? value.phase : 'LOBBY',
        maxPlayers: clampInteger(value.maxPlayers, 2, 4, 4),
        maxSpectators: clampInteger(value.maxSpectators, 0, 2, 2),
        createdAt: safeTimestamp(value.createdAt),
        updatedAt: safeTimestamp(value.updatedAt),
        expiresAt: safeTimestamp(value.expiresAt),
    };
}

export function normalizeRoomStatePayload(value: unknown): RealtimeRoomStatePayload | null {
    if (!isRecord(value)) return null;
    const roomId = safeIdentifier(value.roomId, 64);
    const inviteCode = normalizeInviteCode(value.inviteCode);
    const hostProfileId = safeIdentifier(value.hostProfileId, 48);
    if (!roomId || !inviteCode || !hostProfileId) return null;
    const slots = Array.isArray(value.slots)
        ? value.slots.map(normalizeSlot).filter((slot): slot is FriendRoomSlotData => slot !== null).slice(0, 6)
        : [];
    return {
        roomId,
        inviteCode,
        hostProfileId,
        mode: value.mode === 'TEAM' ? 'TEAM' : 'SOLO',
        phase: value.phase === 'MATCH' || value.phase === 'CLOSED' ? value.phase : 'LOBBY',
        createdAt: safeTimestamp(value.createdAt),
        updatedAt: safeTimestamp(value.updatedAt),
        expiresAt: safeTimestamp(value.expiresAt),
        maxPlayers: clampInteger(value.maxPlayers, 2, 4, 4),
        maxSpectators: clampInteger(value.maxSpectators, 0, 2, 2),
        slots,
    };
}

export function roomStateFromLocalRoom(room: FriendRoomResumeData): RealtimeRoomStatePayload | null {
    const normalized = normalizeRoomStatePayload(room);
    return normalized ? { ...normalized, updatedAt: Date.now() } : null;
}

export function flattenPresence(state: Readonly<Record<string, readonly RealtimePresencePayload[]>>): readonly RealtimePresencePayload[] {
    const presences: RealtimePresencePayload[] = [];
    Object.values(state).forEach((entries) => {
        entries.forEach((entry) => {
            const normalized = normalizePresence(entry);
            if (normalized && !presences.some((item) => item.profileId === normalized.profileId)) presences.push(normalized);
        });
    });
    return presences;
}

function normalizePresence(value: unknown): RealtimePresencePayload | null {
    if (!isRecord(value)) return null;
    const profileId = safeIdentifier(value.profileId, 48);
    if (!profileId) return null;
    const teamId: TeamId | undefined = value.teamId === 'BLUE' || value.teamId === 'GOLD' ? value.teamId : undefined;
    return {
        profileId,
        displayName: safeText(value.displayName, 'ComePlayers Player', 24),
        playerTag: safeText(value.playerTag, 'PLAYER#0000', 18),
        role: value.role === 'SPECTATOR' ? 'SPECTATOR' : 'PLAYER',
        ready: value.ready === true,
        ...(teamId ? { teamId } : {}),
        onlineAt: safeTimestamp(value.onlineAt),
    };
}

function normalizeSlot(value: unknown): FriendRoomSlotData | null {
    if (!isRecord(value)) return null;
    const slotId = safeIdentifier(value.slotId, 64);
    const profileId = safeIdentifier(value.profileId, 48);
    if (!slotId || !profileId) return null;
    const teamId: TeamId | undefined = value.teamId === 'BLUE' || value.teamId === 'GOLD' ? value.teamId : undefined;
    return {
        slotId,
        profileId,
        displayName: safeText(value.displayName, 'ComePlayers Player', 24),
        role: value.role === 'SPECTATOR' ? 'SPECTATOR' : 'PLAYER',
        ready: value.ready === true,
        connected: value.connected !== false,
        joinedAt: safeTimestamp(value.joinedAt),
        disconnectedAt: safeTimestamp(value.disconnectedAt),
        ...(teamId ? { teamId } : {}),
    };
}

function normalizeInviteCode(value: unknown): string {
    if (typeof value !== 'string') return '';
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    return normalized.length === 6 ? normalized : '';
}

function safeTopic(value: unknown): string {
    if (typeof value !== 'string') return '';
    const normalized = value.trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 128);
    return normalized.startsWith('marble-room:') ? normalized : '';
}

function safeIdentifier(value: unknown, maximumLength: number): string {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, maximumLength);
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

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function errorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 180);
    if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) return error.message.trim().slice(0, 180);
    return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
