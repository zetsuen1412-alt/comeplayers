import type { OnlineProfileActionResult, OnlineProfileService } from '../core/OnlineProfileService';
import type { MatchMode } from '../save/MatchSettingsData';
import {
    FRIEND_ROOM_RECONNECT_WINDOW_MS,
    FriendRoomResumeData,
    FriendRoomRole,
    FriendRoomSlotData,
    normalizeFriendRoom,
    PresenceState,
} from '../save/OnlineProfileData';
import {
    RealtimePresencePayload,
    RealtimeRoomStatePayload,
    SupabaseRealtimeConnectionSnapshot,
    SupabaseRealtimeRoomAdapter,
    SupabaseRoomRegistry,
} from './SupabaseRealtimeRoomAdapter';
import { loadSupabaseRuntimeConfig } from './SupabaseRuntimeConfig';
import type {
    AuthoritativeActionResult,
    AuthoritativeMatchEvent,
    AuthoritativeMatchSnapshot,
} from './AuthoritativeMatchProtocol';
import type {
    AuthoritativeEventHistory,
    AuthoritativeReplayArchiveHistory,
    AuthoritativeReplayArchiveSummary,
    AuthoritativeReplayLibrary,
    AuthoritativeReplayVisibility,
} from './AuthoritativeReplayProtocol';
import { AuthoritativeMatchNetworkService } from './AuthoritativeMatchNetworkService';
import { SupabaseAuthoritativeMatchAdapter } from './SupabaseAuthoritativeMatchAdapter';
import type { CompetitiveHubSnapshot, CompetitiveMode, TournamentDetail, TournamentMode } from './CompetitiveProtocol';
import { SupabaseCompetitiveAdapter } from './SupabaseCompetitiveAdapter';

export class RealtimeMultiplayerService {
    private readonly adapter: SupabaseRealtimeRoomAdapter;
    private readonly authorityAdapter: SupabaseAuthoritativeMatchAdapter;
    private activeRole: FriendRoomRole = 'PLAYER';
    private authorityListener: ((snapshot: AuthoritativeMatchSnapshot) => void) | null = null;
    private authorityEventListener: ((event: AuthoritativeMatchEvent) => void) | null = null;

    public constructor(
        private readonly profile: OnlineProfileService,
        adapter: SupabaseRealtimeRoomAdapter = new SupabaseRealtimeRoomAdapter(),
        private readonly now: () => number = Date.now,
        authorityAdapter: SupabaseAuthoritativeMatchAdapter = new SupabaseAuthoritativeMatchAdapter(),
        private readonly competitiveAdapter: SupabaseCompetitiveAdapter = new SupabaseCompetitiveAdapter(),
    ) {
        this.adapter = adapter;
        this.authorityAdapter = authorityAdapter;
    }


    public competitiveHub(): Promise<AuthoritativeActionResult<CompetitiveHubSnapshot>> {
        const profile = this.profile.snapshot();
        return this.competitiveAdapter.hub(profile.profileId, profile.displayName);
    }

    public joinCompetitiveQueue(mode: CompetitiveMode, region = 'GLOBAL'): Promise<AuthoritativeActionResult<CompetitiveHubSnapshot>> {
        const profile = this.profile.snapshot();
        return this.competitiveAdapter.joinQueue(profile.profileId, profile.displayName, mode, region);
    }

    public pollCompetitiveQueue(): Promise<AuthoritativeActionResult<CompetitiveHubSnapshot>> {
        const profile = this.profile.snapshot();
        return this.competitiveAdapter.pollQueue(profile.profileId, profile.displayName);
    }

    public subscribeCompetitiveQueue(
        listener: (result: AuthoritativeActionResult<CompetitiveHubSnapshot>) => void,
    ): Promise<AuthoritativeActionResult<CompetitiveHubSnapshot>> {
        const profile = this.profile.snapshot();
        return this.competitiveAdapter.subscribeQueue(profile.profileId, profile.displayName, listener);
    }

    public unsubscribeCompetitiveQueue(): Promise<void> {
        return this.competitiveAdapter.unsubscribeQueue();
    }

    public cancelCompetitiveQueue(): Promise<AuthoritativeActionResult<CompetitiveHubSnapshot>> {
        const profile = this.profile.snapshot();
        return this.competitiveAdapter.cancelQueue(profile.profileId, profile.displayName);
    }

    public finalizeCompetitiveMatch(): Promise<AuthoritativeActionResult<CompetitiveHubSnapshot>> {
        const profile = this.profile.snapshot();
        const roomId = profile.activeRoom?.serverRoomId ?? this.authorityAdapter.snapshot()?.roomId ?? '';
        if (!roomId) return Promise.resolve({ ok: false, message: 'No competitive server room is active.' });
        return this.competitiveAdapter.finalizeMatch(roomId, profile.profileId, profile.displayName);
    }

    public createTournament(name: string, capacity: 4 | 8, mode: TournamentMode = 'SOLO'): Promise<AuthoritativeActionResult<TournamentDetail>> {
        const profile = this.profile.snapshot();
        return this.competitiveAdapter.createTournament(profile.profileId, profile.displayName, name, capacity, mode);
    }

    public joinTournament(code: string): Promise<AuthoritativeActionResult<TournamentDetail>> {
        const profile = this.profile.snapshot();
        return this.competitiveAdapter.joinTournament(code, profile.profileId, profile.displayName);
    }

    public tournamentByCode(code: string): Promise<AuthoritativeActionResult<TournamentDetail>> {
        return this.competitiveAdapter.tournamentByCode(code);
    }

    public advanceTournament(code: string): Promise<AuthoritativeActionResult<TournamentDetail>> {
        return this.competitiveAdapter.advanceTournament(code);
    }


    public setAuthoritativeSnapshotListener(listener: ((snapshot: AuthoritativeMatchSnapshot) => void) | null): void {
        this.authorityListener = listener;
    }

    public setAuthoritativeEventListener(listener: ((event: AuthoritativeMatchEvent) => void) | null): void {
        this.authorityEventListener = listener;
    }

    public authoritativeSnapshot(): AuthoritativeMatchSnapshot | null {
        return this.authorityAdapter.snapshot();
    }

    public authoritativeEventHistory(afterSequence = 0, limit = 180): Promise<AuthoritativeActionResult<AuthoritativeEventHistory>> {
        const roomId = this.profile.dataSnapshot().activeRoom?.serverRoomId ?? this.authorityAdapter.snapshot()?.roomId ?? '';
        if (afterSequence > 0) return this.authorityAdapter.eventHistory(roomId, afterSequence, limit);
        return this.authorityAdapter.eventHistoryAll(roomId, limit, 12);
    }

    public publishAuthoritativeReplay(
        visibility: AuthoritativeReplayVisibility = 'UNLISTED',
    ): Promise<AuthoritativeActionResult<AuthoritativeReplayArchiveSummary>> {
        const roomId = this.profile.dataSnapshot().activeRoom?.serverRoomId ?? this.authorityAdapter.snapshot()?.roomId ?? '';
        return this.authorityAdapter.publishReplay(roomId, visibility);
    }

    public authoritativeReplayLibrary(limit = 20): Promise<AuthoritativeActionResult<AuthoritativeReplayLibrary>> {
        return this.authorityAdapter.replayLibrary(limit);
    }

    public authoritativeReplayByCode(replayCode: string): Promise<AuthoritativeActionResult<AuthoritativeReplayArchiveHistory>> {
        return this.authorityAdapter.replayByCode(replayCode, 180, 12);
    }

    public deleteAuthoritativeReplay(replayId: string): Promise<AuthoritativeActionResult<Record<string, unknown>>> {
        return this.authorityAdapter.deleteReplay(replayId);
    }

    public createAuthoritativeNetworkService(): AuthoritativeMatchNetworkService {
        return new AuthoritativeMatchNetworkService(this.authorityAdapter);
    }

    public async configureAuthoritativeLoadout(
        characterId: string,
        activeSkillId: string,
        pendantId: string,
        boosterId: string,
    ): Promise<OnlineProfileActionResult> {
        const data = this.profile.dataSnapshot();
        const roomId = data.activeRoom?.serverRoomId;
        if (!roomId) return this.profile.updateRealtimeBackend({}, 'Create or join a Supabase room before configuring a loadout.', false);
        const result = await this.authorityAdapter.configureLoadout({
            roomId, characterId, activeSkillId, pendantId, boosterId,
        });
        if (!result.ok) return this.applyFailure(result.message);
        return this.profile.updateRealtimeBackend({ lastError: '' }, result.message);
    }

    public async startAuthoritativeMatch(): Promise<OnlineProfileActionResult> {
        const data = this.profile.dataSnapshot();
        const room = data.activeRoom;
        if (!room?.serverRoomId || !room.realtimeTopic) {
            return this.profile.updateRealtimeBackend({}, 'Create or join a Supabase room before starting an authoritative match.', false);
        }
        if (room.localRole === 'SPECTATOR') {
            return this.profile.updateRealtimeBackend({}, 'Spectators cannot start an authoritative match.', false);
        }
        const result = await this.authorityAdapter.start(room.serverRoomId, data.profileId, {
            onSnapshot: (snapshot) => this.receiveAuthoritativeSnapshot(snapshot),
            onEvent: (event) => this.receiveAuthoritativeEvent(event),
        });
        if (!result.ok || !result.data) return this.applyFailure(result.message);
        const next = normalizeFriendRoom({ ...room, phase: 'MATCH', updatedAt: this.safeNow() });
        if (!next) return this.profile.updateRealtimeBackend({}, 'Authoritative match started, but local room state could not be updated.', false);
        return this.profile.replaceActiveRoom(next, 'IN_MATCH', result.message);
    }

    public async resumeAuthoritativeMatch(): Promise<OnlineProfileActionResult> {
        const data = this.profile.dataSnapshot();
        const room = data.activeRoom;
        if (!room?.serverRoomId) return this.profile.updateRealtimeBackend({}, 'No server room is available to resume.', false);
        const result = await this.authorityAdapter.resume(room.serverRoomId, data.profileId, {
            onSnapshot: (snapshot) => this.receiveAuthoritativeSnapshot(snapshot),
            onEvent: (event) => this.receiveAuthoritativeEvent(event),
        });
        if (!result.ok || !result.data) return this.applyFailure(result.message);
        const next = normalizeFriendRoom({ ...room, phase: 'MATCH', updatedAt: this.safeNow() });
        if (!next) return this.profile.updateRealtimeBackend({}, 'Authoritative state restored, but room state could not be updated.', false);
        return this.profile.replaceActiveRoom(next, 'IN_MATCH', result.message);
    }

    public async rollAuthoritativeDice(): Promise<OnlineProfileActionResult> {
        const result = await this.authorityAdapter.command('ROLL');
        if (!result.ok || !result.data?.lastDice) return this.applyFailure(result.message);
        const dice = result.data.lastDice;
        return this.profile.updateRealtimeBackend({ lastError: '' }, `Server roll ${dice.first} + ${dice.second} = ${dice.total}. Revision ${result.data.revision}.`);
    }

    public async activateAuthoritativeSkill(): Promise<OnlineProfileActionResult> {
        const player = this.authorityAdapter.snapshot()?.players.find((entry) => entry.profileId === this.profile.dataSnapshot().profileId);
        const result = await this.authorityAdapter.command('ACTIVATE_SKILL');
        if (!result.ok || !result.data) return this.applyFailure(result.message);
        const updated = result.data.players.find((entry) => entry.profileId === this.profile.dataSnapshot().profileId);
        return this.profile.updateRealtimeBackend(
            { lastError: '' },
            `${player?.activeSkillId || 'Character skill'} activated${updated?.skillUsed ? ' and locked for this match' : ''}. Revision ${result.data.revision}.`,
        );
    }

    public async endAuthoritativeTurn(): Promise<OnlineProfileActionResult> {
        const result = await this.authorityAdapter.command('END_TURN');
        if (!result.ok || !result.data) return this.applyFailure(result.message);
        if (result.data.phase === 'FINISHED') {
            const winner = result.data.winnerTeamId || result.data.winnerProfileId || 'server result';
            return this.profile.updateRealtimeBackend(
                { lastError: '' },
                `Server match finished: ${winner}. ${result.data.finishReason || 'Victory condition reached.'}`,
            );
        }
        return this.profile.updateRealtimeBackend({ lastError: '' }, `Server turn ended. Seat ${result.data.currentTurnSeat + 1} acts at revision ${result.data.revision}.`);
    }

    public async purchaseAuthoritativeProperty(): Promise<OnlineProfileActionResult> {
        const pending = this.authorityAdapter.snapshot()?.pendingAction;
        const result = await this.authorityAdapter.command('PURCHASE');
        if (!result.ok || !result.data) return this.applyFailure(result.message);
        return this.profile.updateRealtimeBackend(
            { lastError: '' },
            `Server purchase accepted${pending ? `: ${pending.displayName} for CP ${pending.cost.toLocaleString('en-US')}` : ''}. Revision ${result.data.revision}.`,
        );
    }

    public async upgradeAuthoritativeProperty(): Promise<OnlineProfileActionResult> {
        const pending = this.authorityAdapter.snapshot()?.pendingAction;
        const result = await this.authorityAdapter.command('UPGRADE');
        if (!result.ok || !result.data) return this.applyFailure(result.message);
        return this.profile.updateRealtimeBackend(
            { lastError: '' },
            `Server upgrade accepted${pending ? `: ${pending.displayName} to level ${pending.targetLevel}` : ''}. Revision ${result.data.revision}.`,
        );
    }

    public async takeoverAuthoritativeProperty(): Promise<OnlineProfileActionResult> {
        const pending = this.authorityAdapter.snapshot()?.pendingAction;
        const result = await this.authorityAdapter.command('TAKEOVER');
        if (!result.ok || !result.data) return this.applyFailure(result.message);
        return this.profile.updateRealtimeBackend(
            { lastError: '' },
            `Server takeover accepted${pending ? `: ${pending.displayName} for CP ${pending.cost.toLocaleString('en-US')}` : ''}. Revision ${result.data.revision}.`,
        );
    }

    public async chooseAuthoritativeGameCenter(selectedNumber: number): Promise<OnlineProfileActionResult> {
        const result = await this.authorityAdapter.command('GAME_CENTER_CHOICE', { selectedNumber });
        if (!result.ok || !result.data) return this.applyFailure(result.message);
        const special = result.data.specialResult;
        return this.profile.updateRealtimeBackend(
            { lastError: '' },
            special?.message ?? `Game Center choice ${selectedNumber} accepted at revision ${result.data.revision}.`,
        );
    }

    public async selectAuthoritativeOlympic(tileIndex: number): Promise<OnlineProfileActionResult> {
        const result = await this.authorityAdapter.command('SELECT_OLYMPIC', { tileIndex });
        if (!result.ok || !result.data) return this.applyFailure(result.message);
        const special = result.data.specialResult;
        return this.profile.updateRealtimeBackend(
            { lastError: '' },
            special?.message ?? `Olympic property ${tileIndex} accepted at revision ${result.data.revision}.`,
        );
    }

    public async selectAuthoritativeTravel(tileIndex: number): Promise<OnlineProfileActionResult> {
        const result = await this.authorityAdapter.command('SELECT_TRAVEL', { tileIndex });
        if (!result.ok || !result.data) return this.applyFailure(result.message);
        const special = result.data.specialResult;
        return this.profile.updateRealtimeBackend(
            { lastError: '' },
            special?.message ?? `World Travel destination ${tileIndex} accepted at revision ${result.data.revision}.`,
        );
    }

    public async createAndConnect(
        mode: MatchMode,
        settings: Readonly<Record<string, unknown>> = {},
    ): Promise<OnlineProfileActionResult> {
        const config = loadSupabaseRuntimeConfig();
        if (!config.configured) {
            return this.profile.updateRealtimeBackend({
                provider: 'LOCAL',
                state: 'CONFIG_REQUIRED',
                lastError: config.message,
            }, config.message, false);
        }
        this.profile.updateRealtimeBackend({
            provider: 'SUPABASE',
            state: 'CONNECTING',
            lastError: '',
        }, 'Connecting to Supabase Realtime.');

        let room = this.profile.dataSnapshot().activeRoom;
        if (!room || room.phase === 'CLOSED') {
            const createdLocal = this.profile.createFriendRoom(mode);
            if (!createdLocal.ok || !createdLocal.snapshot.activeRoom) return createdLocal;
            room = createdLocal.snapshot.activeRoom;
        }
        const created = await this.adapter.createRoom(this.profile.dataSnapshot(), mode, settings);
        if (!created.ok || !created.data) return this.applyFailure(created.message);
        this.activeRole = 'PLAYER';
        const linkedRoom = linkRoomToRegistry(room, created.data, 'PLAYER');
        const linked = this.profile.replaceActiveRoom(
            linkedRoom,
            'IN_ROOM',
            `Room ${created.data.inviteCode} registered with Supabase.`,
        );
        if (!linked.ok) return linked;
        return this.connectRegistry(created.data, linkedRoom, 'PLAYER');
    }

    public async joinAndConnect(
        inviteCode: string,
        role: FriendRoomRole = 'PLAYER',
    ): Promise<OnlineProfileActionResult> {
        const config = loadSupabaseRuntimeConfig();
        if (!config.configured) {
            return this.profile.updateRealtimeBackend({
                provider: 'LOCAL',
                state: 'CONFIG_REQUIRED',
                lastError: config.message,
            }, config.message, false);
        }
        this.profile.updateRealtimeBackend({
            provider: 'SUPABASE',
            state: 'CONNECTING',
            lastError: '',
        }, `Joining room ${inviteCode.toUpperCase()}.`);
        const joined = await this.adapter.joinRoom(inviteCode, this.profile.dataSnapshot(), role);
        if (!joined.ok || !joined.data) return this.applyFailure(joined.message);
        this.activeRole = role;
        const room = createJoinedRoom(this.profile.dataSnapshot(), joined.data, role, this.safeNow());
        const saved = this.profile.replaceActiveRoom(room, 'IN_ROOM', joined.message);
        if (!saved.ok) return saved;
        return this.connectRegistry(joined.data, room, role);
    }

    public async reconnect(): Promise<OnlineProfileActionResult> {
        const data = this.profile.dataSnapshot();
        const room = data.activeRoom;
        if (!room?.serverRoomId || !room.realtimeTopic) {
            return this.profile.updateRealtimeBackend({
                state: 'ERROR',
                lastError: 'No Supabase room metadata is available for reconnect.',
                reconnectAttempts: data.realtime.reconnectAttempts + 1,
            }, 'No Supabase room metadata is available for reconnect.', false);
        }
        const registry: SupabaseRoomRegistry = {
            roomId: room.serverRoomId,
            inviteCode: room.inviteCode,
            topic: room.realtimeTopic,
            hostUserId: data.realtime.authUserId || room.hostProfileId,
            mode: room.mode,
            phase: room.phase,
            maxPlayers: room.maxPlayers,
            maxSpectators: room.maxSpectators,
            createdAt: room.createdAt,
            updatedAt: room.updatedAt,
            expiresAt: room.expiresAt,
        };
        this.profile.updateRealtimeBackend({
            provider: 'SUPABASE',
            state: 'RECONNECTING',
            reconnectAttempts: data.realtime.reconnectAttempts + 1,
            lastError: '',
        }, `Reconnecting to room ${room.inviteCode}.`);
        return this.connectRegistry(registry, room, room.localRole ?? 'PLAYER');
    }

    public async disconnect(): Promise<OnlineProfileActionResult> {
        await this.authorityAdapter.disconnect();
        const result = await this.adapter.disconnect();
        const now = this.safeNow();
        return this.profile.updateRealtimeBackend({
            provider: loadSupabaseRuntimeConfig().configured ? 'SUPABASE' : 'LOCAL',
            state: loadSupabaseRuntimeConfig().configured ? 'DISABLED' : 'CONFIG_REQUIRED',
            connectedRoomId: '',
            roomTopic: '',
            lastDisconnectedAt: now,
            latencyMs: 0,
            lastError: result.ok ? '' : result.message,
        }, result.message, result.ok);
    }

    public async synchronizeActiveRoom(): Promise<OnlineProfileActionResult> {
        const room = this.profile.dataSnapshot().activeRoom;
        if (!room) return this.profile.updateRealtimeBackend({}, 'No active room is available to synchronize.', false);
        const result = await this.adapter.broadcastRoom(room);
        if (!result.ok) return this.applyFailure(result.message);
        return this.applyConnectionSnapshot(result.snapshot, result.message);
    }

    public async synchronizeReadyState(): Promise<OnlineProfileActionResult> {
        const data = this.profile.dataSnapshot();
        const room = data.activeRoom;
        const slot = room?.slots.find((entry) => entry.profileId === data.profileId);
        if (!room || !slot) return this.profile.updateRealtimeBackend({}, 'Local player slot is not available.', false);
        const result = await this.adapter.broadcastReady(data.profileId, slot.ready);
        if (!result.ok) return this.applyFailure(result.message);
        return this.applyConnectionSnapshot(result.snapshot, result.message);
    }

    public async heartbeat(): Promise<OnlineProfileActionResult> {
        const result = await this.adapter.measureLatency();
        if (!result.ok) return this.applyFailure(result.message);
        return this.applyConnectionSnapshot(result.snapshot, result.message);
    }

    public connectionSnapshot(): SupabaseRealtimeConnectionSnapshot {
        return this.adapter.snapshot();
    }

    private async connectRegistry(
        registry: SupabaseRoomRegistry,
        room: FriendRoomResumeData,
        role: FriendRoomRole,
    ): Promise<OnlineProfileActionResult> {
        const data = this.profile.dataSnapshot();
        const localSlot = room.slots.find((slot) => slot.profileId === data.profileId);
        const connected = await this.adapter.connect(
            registry,
            data,
            role,
            localSlot?.ready ?? role === 'SPECTATOR',
            {
                onRoomState: (payload) => this.receiveRoomState(payload),
                onPresenceSync: (presences) => this.receivePresence(presences),
                onReadyState: (profileId, ready) => this.receiveReadyState(profileId, ready),
            },
        );
        if (!connected.ok) return this.applyFailure(connected.message);
        const applied = this.applyConnectionSnapshot(connected.snapshot, connected.message);
        if (room.hostProfileId === data.profileId) await this.adapter.broadcastRoom(room);
        return applied;
    }

    private receiveRoomState(payload: RealtimeRoomStatePayload): void {
        const current = this.profile.dataSnapshot();
        const room = current.activeRoom;
        const next = normalizeFriendRoom({
            ...payload,
            reconnectToken: room?.reconnectToken ?? `server-${payload.roomId}-${current.profileId}`,
            serverRoomId: room?.serverRoomId ?? current.realtime.connectedRoomId,
            realtimeTopic: room?.realtimeTopic ?? current.realtime.roomTopic,
            localRole: room?.localRole ?? this.activeRole,
        });
        if (next) this.profile.replaceActiveRoom(next, 'IN_ROOM', 'Realtime room state received.');
    }

    private receivePresence(presences: readonly RealtimePresencePayload[]): void {
        const current = this.profile.dataSnapshot();
        const room = current.activeRoom;
        if (!room) return;
        const now = this.safeNow();
        const presenceIds = new Set(presences.map((presence) => presence.profileId));
        const slots: FriendRoomSlotData[] = room.slots.map((slot) => ({
            ...slot,
            connected: presenceIds.has(slot.profileId),
            disconnectedAt: presenceIds.has(slot.profileId) ? 0 : (slot.disconnectedAt || now),
        }));
        presences.forEach((presence) => {
            const index = slots.findIndex((slot) => slot.profileId === presence.profileId);
            if (index >= 0) {
                const existing = slots[index];
                if (existing) {
                    slots[index] = {
                        ...existing,
                        displayName: presence.displayName,
                        role: presence.role,
                        ready: presence.ready,
                        connected: true,
                        disconnectedAt: 0,
                        ...(presence.teamId ? { teamId: presence.teamId } : {}),
                    };
                }
                return;
            }
            slots.push({
                slotId: `${room.roomId}-${presence.role.toLowerCase()}-${presence.profileId}`.slice(0, 64),
                profileId: presence.profileId,
                displayName: presence.displayName,
                role: presence.role,
                ready: presence.ready,
                connected: true,
                joinedAt: presence.onlineAt || now,
                disconnectedAt: 0,
                ...(presence.teamId ? { teamId: presence.teamId } : {}),
            });
        });
        const next = normalizeFriendRoom({ ...room, slots, updatedAt: now });
        if (!next) return;
        this.profile.replaceActiveRoom(next, 'IN_ROOM', `Presence synchronized: ${presences.length} connected.`);
        if (room.hostProfileId === current.profileId) void this.adapter.broadcastRoom(next);
    }

    private receiveReadyState(profileId: string, ready: boolean): void {
        const current = this.profile.dataSnapshot();
        const room = current.activeRoom;
        if (!room) return;
        let changed = false;
        const slots = room.slots.map((slot) => {
            if (slot.profileId !== profileId || slot.role !== 'PLAYER') return slot;
            changed = true;
            return { ...slot, ready };
        });
        if (!changed) return;
        const next = normalizeFriendRoom({ ...room, slots, updatedAt: this.safeNow() });
        if (!next) return;
        this.profile.replaceActiveRoom(next, 'IN_ROOM', `${profileId} ready state synchronized.`);
        if (room.hostProfileId === current.profileId) void this.adapter.broadcastRoom(next);
    }


    private receiveAuthoritativeEvent(event: AuthoritativeMatchEvent): void {
        this.authorityEventListener?.(event);
    }

    private receiveAuthoritativeSnapshot(snapshot: AuthoritativeMatchSnapshot): void {
        this.authorityListener?.(snapshot);
    }

    private applyFailure(message: string): OnlineProfileActionResult {
        const data = this.profile.dataSnapshot();
        return this.profile.updateRealtimeBackend({
            provider: loadSupabaseRuntimeConfig().configured ? 'SUPABASE' : 'LOCAL',
            state: loadSupabaseRuntimeConfig().configured ? 'ERROR' : 'CONFIG_REQUIRED',
            lastError: message,
            lastDisconnectedAt: this.safeNow(),
            reconnectAttempts: data.realtime.reconnectAttempts + 1,
        }, message, false);
    }

    private applyConnectionSnapshot(
        snapshot: SupabaseRealtimeConnectionSnapshot,
        message: string,
    ): OnlineProfileActionResult {
        const now = this.safeNow();
        return this.profile.updateRealtimeBackend({
            provider: snapshot.configured ? 'SUPABASE' : 'LOCAL',
            state: snapshot.connected ? 'CONNECTED' : snapshot.connecting ? 'CONNECTING' : snapshot.configured ? 'DISABLED' : 'CONFIG_REQUIRED',
            authUserId: snapshot.authUserId,
            connectedRoomId: snapshot.roomId,
            roomTopic: snapshot.topic,
            lastConnectedAt: snapshot.connected ? now : this.profile.dataSnapshot().realtime.lastConnectedAt,
            lastHeartbeatAt: snapshot.connected ? now : this.profile.dataSnapshot().realtime.lastHeartbeatAt,
            latencyMs: snapshot.latencyMs,
            reconnectAttempts: snapshot.connected ? 0 : this.profile.dataSnapshot().realtime.reconnectAttempts,
            lastError: snapshot.lastError,
        }, message, snapshot.connected || !snapshot.lastError);
    }

    private safeNow(): number {
        const value = this.now();
        return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    }
}

function linkRoomToRegistry(
    room: FriendRoomResumeData,
    registry: SupabaseRoomRegistry,
    role: FriendRoomRole,
): FriendRoomResumeData {
    return normalizeFriendRoom({
        ...room,
        inviteCode: registry.inviteCode,
        mode: registry.mode,
        phase: registry.phase,
        createdAt: registry.createdAt,
        updatedAt: registry.updatedAt,
        expiresAt: registry.expiresAt,
        maxPlayers: registry.maxPlayers,
        maxSpectators: registry.maxSpectators,
        serverRoomId: registry.roomId,
        realtimeTopic: registry.topic,
        localRole: role,
    }) ?? room;
}

function createJoinedRoom(
    profile: ReturnType<OnlineProfileService['dataSnapshot']>,
    registry: SupabaseRoomRegistry,
    role: FriendRoomRole,
    now: number,
): FriendRoomResumeData {
    const playerIndex = 1;
    const slot: FriendRoomSlotData = {
        slotId: `${registry.roomId}-${role.toLowerCase()}-${profile.profileId}`.slice(0, 64),
        profileId: profile.profileId,
        displayName: profile.displayName,
        role,
        ready: role === 'SPECTATOR',
        connected: true,
        joinedAt: now,
        disconnectedAt: 0,
        ...(registry.mode === 'TEAM' && role === 'PLAYER'
            ? { teamId: playerIndex % 2 === 0 ? 'BLUE' as const : 'GOLD' as const }
            : {}),
    };
    return {
        roomId: `remote-${registry.roomId}`.slice(0, 64),
        inviteCode: registry.inviteCode,
        reconnectToken: `server-${registry.roomId}-${profile.profileId}`.slice(0, 96),
        hostProfileId: `SUPABASE-HOST-${registry.hostUserId.slice(0, 20)}`.slice(0, 48),
        mode: registry.mode,
        phase: registry.phase,
        createdAt: registry.createdAt,
        updatedAt: registry.updatedAt,
        expiresAt: Math.max(registry.expiresAt, now + FRIEND_ROOM_RECONNECT_WINDOW_MS),
        maxPlayers: registry.maxPlayers,
        maxSpectators: registry.maxSpectators,
        slots: [slot],
        serverRoomId: registry.roomId,
        realtimeTopic: registry.topic,
        localRole: role,
    };
}
