import type { MatchMode } from '../save/MatchSettingsData';
import {
    CloudSyncState,
    FriendRoomResumeData,
    FriendRoomRole,
    normalizeOnlineProfile,
    OnlineProfileData,
    PresenceState,
    RealtimeBackendData,
    RealtimeConnectionState,
    RealtimeProvider,
} from '../save/OnlineProfileData';
import { FriendRoomService, stableHash } from '../network/FriendRoomService';

export interface OnlineProfileStoreSaveResult {
    readonly data: OnlineProfileData;
    readonly persisted: boolean;
}

export interface OnlineProfileStore {
    loadOnlineProfile(): OnlineProfileData;
    saveOnlineProfile(data: OnlineProfileData): OnlineProfileStoreSaveResult;
}

export interface OnlineProfileSnapshot {
    readonly profileId: string;
    readonly displayName: string;
    readonly playerTag: string;
    readonly friendCode: string;
    readonly presence: PresenceState;
    readonly friendCount: number;
    readonly onlineFriendCount: number;
    readonly activeRoom: FriendRoomResumeData | null;
    readonly cloudState: CloudSyncState;
    readonly cloudLocalGeneration: number;
    readonly cloudRemoteGeneration: number;
    readonly cloudManifestChecksum: string;
    readonly lastPreparedAt: number;
    readonly lastSyncedAt: number;
    readonly realtimeProvider: RealtimeProvider;
    readonly realtimeState: RealtimeConnectionState;
    readonly realtimeAuthUserId: string;
    readonly realtimeConnectedRoomId: string;
    readonly realtimeTopic: string;
    readonly realtimeLastConnectedAt: number;
    readonly realtimeLastDisconnectedAt: number;
    readonly realtimeLastHeartbeatAt: number;
    readonly realtimeLatencyMs: number;
    readonly realtimeReconnectAttempts: number;
    readonly realtimeLastError: string;
}

export interface OnlineProfileActionResult {
    readonly ok: boolean;
    readonly persisted: boolean;
    readonly message: string;
    readonly snapshot: OnlineProfileSnapshot;
}

export interface CloudBackupManifest {
    readonly profileId: string;
    readonly playerTag: string;
    readonly saveRevision: number;
    readonly saveUpdatedAt: number;
    readonly localGeneration: number;
    readonly checksum: string;
    readonly createdAt: number;
}

export class OnlineProfileService {
    private data: OnlineProfileData;
    private readonly roomService: FriendRoomService;
    private simulatedGuestSequence = 1;

    public constructor(
        private readonly store: OnlineProfileStore,
        private readonly now: () => number = Date.now,
    ) {
        this.roomService = new FriendRoomService(now);
        this.data = this.ensureIdentity(store.loadOnlineProfile());
    }

    public snapshot(): OnlineProfileSnapshot {
        this.expireRoomIfNeeded();
        return {
            profileId: this.data.profileId,
            displayName: this.data.displayName,
            playerTag: this.data.playerTag,
            friendCode: this.data.friendCode,
            presence: this.data.presence,
            friendCount: this.data.friends.length,
            onlineFriendCount: this.data.friends.filter((friend) => friend.online).length,
            activeRoom: this.data.activeRoom,
            cloudState: this.data.cloud.state,
            cloudLocalGeneration: this.data.cloud.localGeneration,
            cloudRemoteGeneration: this.data.cloud.remoteGeneration,
            cloudManifestChecksum: this.data.cloud.manifestChecksum,
            lastPreparedAt: this.data.cloud.lastPreparedAt,
            lastSyncedAt: this.data.cloud.lastSyncedAt,
            realtimeProvider: this.data.realtime.provider,
            realtimeState: this.data.realtime.state,
            realtimeAuthUserId: this.data.realtime.authUserId,
            realtimeConnectedRoomId: this.data.realtime.connectedRoomId,
            realtimeTopic: this.data.realtime.roomTopic,
            realtimeLastConnectedAt: this.data.realtime.lastConnectedAt,
            realtimeLastDisconnectedAt: this.data.realtime.lastDisconnectedAt,
            realtimeLastHeartbeatAt: this.data.realtime.lastHeartbeatAt,
            realtimeLatencyMs: this.data.realtime.latencyMs,
            realtimeReconnectAttempts: this.data.realtime.reconnectAttempts,
            realtimeLastError: this.data.realtime.lastError,
        };
    }


    public dataSnapshot(): OnlineProfileData {
        this.expireRoomIfNeeded();
        return normalizeOnlineProfile(this.data, this.safeNow());
    }

    public replaceActiveRoom(
        room: FriendRoomResumeData | null,
        presence: PresenceState,
        message: string,
    ): OnlineProfileActionResult {
        return this.commit({
            ...this.data,
            activeRoom: room,
            presence,
            updatedAt: this.safeNow(),
        }, message);
    }

    public updateRealtimeBackend(
        patch: Partial<RealtimeBackendData>,
        message: string,
        ok = true,
    ): OnlineProfileActionResult {
        const now = this.safeNow();
        const realtime: RealtimeBackendData = {
            ...this.data.realtime,
            ...patch,
        };
        return this.commit({
            ...this.data,
            realtime,
            updatedAt: now,
        }, message, ok);
    }

    public createFriendRoom(mode: MatchMode): OnlineProfileActionResult {
        const room = this.roomService.createRoom(this.data, mode);
        return this.commit({
            ...this.data,
            presence: 'IN_ROOM',
            activeRoom: room,
            updatedAt: this.safeNow(),
        }, `Friend room ${room.inviteCode} created. Invite code and reconnect token were saved locally.`);
    }

    public addSimulatedRoomGuest(role: FriendRoomRole): OnlineProfileActionResult {
        const room = this.data.activeRoom;
        if (!room || room.phase === 'CLOSED') return this.result(false, true, 'Create a friend room first.');
        const action = this.roomService.addSimulatedGuest(room, role, this.simulatedGuestSequence++);
        if (!action.ok || !action.room) return this.result(false, true, action.message);
        return this.commit({
            ...this.data,
            activeRoom: action.room,
            presence: 'IN_ROOM',
            updatedAt: this.safeNow(),
        }, action.message);
    }

    public toggleHostReady(): OnlineProfileActionResult {
        const room = this.data.activeRoom;
        if (!room) return this.result(false, true, 'No friend room is active.');
        const action = this.roomService.toggleReady(room, this.data.profileId);
        if (!action.ok || !action.room) return this.result(false, true, action.message);
        return this.commit({
            ...this.data,
            activeRoom: action.room,
            updatedAt: this.safeNow(),
        }, action.message);
    }

    public simulateDisconnect(): OnlineProfileActionResult {
        const room = this.data.activeRoom;
        if (!room) return this.result(false, true, 'No friend room is active.');
        const action = this.roomService.disconnect(room, this.data.profileId);
        if (!action.ok || !action.room) return this.result(false, true, action.message);
        return this.commit({
            ...this.data,
            activeRoom: action.room,
            presence: 'OFFLINE',
            updatedAt: this.safeNow(),
        }, action.message);
    }

    public reconnectActiveRoom(): OnlineProfileActionResult {
        const room = this.data.activeRoom;
        if (!room) return this.result(false, true, 'No reconnect session is available.');
        const action = this.roomService.reconnect(room, room.reconnectToken);
        if (!action.ok || !action.room) {
            if (action.room) {
                return this.commit({ ...this.data, activeRoom: action.room, presence: 'OFFLINE' }, action.message, false);
            }
            return this.result(false, true, action.message);
        }
        return this.commit({
            ...this.data,
            activeRoom: action.room,
            presence: 'IN_ROOM',
            updatedAt: this.safeNow(),
        }, action.message);
    }

    public leaveFriendRoom(): OnlineProfileActionResult {
        const room = this.data.activeRoom;
        if (!room) return this.result(false, true, 'No friend room is active.');
        this.roomService.close(room);
        return this.commit({
            ...this.data,
            activeRoom: null,
            presence: 'ONLINE',
            updatedAt: this.safeNow(),
        }, 'Friend room closed and reconnect data cleared.');
    }

    public rotateFriendCode(): OnlineProfileActionResult {
        const now = this.safeNow();
        const nextCode = friendCodeFromSeed(`${this.data.profileId}|${this.data.friendCode}|${now}|${this.data.cloud.localGeneration}`);
        return this.commit({
            ...this.data,
            friendCode: nextCode,
            updatedAt: now,
        }, `Friend code rotated to ${nextCode}.`);
    }

    public prepareCloudBackup(saveRevision: number, saveUpdatedAt: number): {
        readonly result: OnlineProfileActionResult;
        readonly manifest: CloudBackupManifest | null;
    } {
        const now = this.safeNow();
        const localGeneration = this.data.cloud.localGeneration + 1;
        const manifest: CloudBackupManifest = {
            profileId: this.data.profileId,
            playerTag: this.data.playerTag,
            saveRevision: Math.max(0, Math.trunc(saveRevision)),
            saveUpdatedAt: Math.max(0, Math.trunc(saveUpdatedAt)),
            localGeneration,
            checksum: cloudManifestChecksum(
                this.data.profileId,
                saveRevision,
                saveUpdatedAt,
                localGeneration,
            ),
            createdAt: now,
        };
        const result = this.commit({
            ...this.data,
            cloud: {
                ...this.data.cloud,
                state: 'READY_TO_LINK',
                localGeneration,
                lastPreparedAt: now,
                manifestChecksum: manifest.checksum,
            },
            updatedAt: now,
        }, `Cloud backup manifest ${manifest.checksum} prepared. Connect a backend adapter to upload it.`);
        return { result, manifest: result.ok ? manifest : null };
    }

    public applyRemoteGeneration(remoteGeneration: number, remoteChecksum: string): OnlineProfileActionResult {
        const normalizedRemote = Math.max(0, Math.trunc(remoteGeneration));
        const checksum = remoteChecksum.trim().toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 64);
        const conflict = normalizedRemote > 0
            && this.data.cloud.localGeneration > 0
            && normalizedRemote !== this.data.cloud.localGeneration
            && checksum !== this.data.cloud.manifestChecksum;
        const now = this.safeNow();
        return this.commit({
            ...this.data,
            cloud: {
                ...this.data.cloud,
                state: conflict ? 'CONFLICT' : 'SYNCED',
                remoteGeneration: normalizedRemote,
                lastSyncedAt: conflict ? this.data.cloud.lastSyncedAt : now,
                manifestChecksum: checksum || this.data.cloud.manifestChecksum,
            },
            updatedAt: now,
        }, conflict
            ? 'Cloud conflict detected. Local data was preserved until the user chooses a version.'
            : 'Cloud generation acknowledged by the local profile.');
    }

    public resolveCloudConflict(preferLocal: boolean): OnlineProfileActionResult {
        if (this.data.cloud.state !== 'CONFLICT') return this.result(false, true, 'No cloud conflict is active.');
        const generation = preferLocal
            ? this.data.cloud.localGeneration
            : Math.max(this.data.cloud.localGeneration, this.data.cloud.remoteGeneration);
        const now = this.safeNow();
        return this.commit({
            ...this.data,
            cloud: {
                ...this.data.cloud,
                state: preferLocal ? 'READY_TO_LINK' : 'SYNCED',
                localGeneration: generation,
                remoteGeneration: preferLocal ? this.data.cloud.remoteGeneration : generation,
                lastSyncedAt: preferLocal ? this.data.cloud.lastSyncedAt : now,
            },
            updatedAt: now,
        }, preferLocal
            ? 'Local save selected. Prepare and upload a new cloud manifest.'
            : 'Remote generation selected as the active cloud baseline.');
    }

    private ensureIdentity(value: OnlineProfileData): OnlineProfileData {
        const normalized = normalizeOnlineProfile(value, this.safeNow());
        if (normalized.profileId !== 'CP-LOCAL-0001') return normalized;
        const now = this.safeNow();
        const suffix = stableHash(`${now}|ComePlayersMarble|profile`).toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
        const digits = String(stableHash(`${suffix}|tag`) % 10_000).padStart(4, '0');
        const next = normalizeOnlineProfile({
            ...normalized,
            profileId: `CP-${suffix}`,
            playerTag: `MARBLE#${digits}`,
            friendCode: friendCodeFromSeed(`${suffix}|friend`),
            presence: 'ONLINE',
            createdAt: normalized.createdAt || now,
            updatedAt: now,
        }, now);
        const saved = this.store.saveOnlineProfile(next);
        return normalizeOnlineProfile(saved.data, now);
    }

    private expireRoomIfNeeded(): void {
        const room = this.data.activeRoom;
        const now = this.safeNow();
        if (!room || room.phase === 'CLOSED' || room.expiresAt === 0 || now <= room.expiresAt) return;
        const closed = this.roomService.close(room);
        const saved = this.store.saveOnlineProfile(normalizeOnlineProfile({
            ...this.data,
            activeRoom: closed,
            presence: 'OFFLINE',
            updatedAt: now,
        }, now));
        this.data = normalizeOnlineProfile(saved.data, now);
    }

    private commit(
        next: OnlineProfileData,
        message: string,
        success = true,
    ): OnlineProfileActionResult {
        const previous = this.data;
        const saved = this.store.saveOnlineProfile(normalizeOnlineProfile(next, this.safeNow()));
        this.data = normalizeOnlineProfile(saved.data, this.safeNow());
        if (!saved.persisted) {
            this.store.saveOnlineProfile(previous);
            this.data = previous;
            return this.result(false, false, 'Online profile change could not be persisted; previous data was restored.');
        }
        return this.result(success, true, message);
    }

    private result(ok: boolean, persisted: boolean, message: string): OnlineProfileActionResult {
        return { ok, persisted, message, snapshot: this.snapshot() };
    }

    private safeNow(): number {
        const value = this.now();
        return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    }
}

export function friendCodeFromSeed(seed: string): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let hash = stableHash(seed);
    let output = '';
    for (let index = 0; index < 6; index++) {
        output += alphabet[hash % alphabet.length] ?? 'C';
        hash = Math.imul(hash ^ (index + 23), 1103515245) + 12345;
        hash >>>= 0;
    }
    return output;
}

export function cloudManifestChecksum(
    profileId: string,
    saveRevision: number,
    saveUpdatedAt: number,
    generation: number,
): string {
    const seed = `${profileId}|${Math.max(0, Math.trunc(saveRevision))}|${Math.max(0, Math.trunc(saveUpdatedAt))}|${Math.max(0, Math.trunc(generation))}`;
    const first = stableHash(seed).toString(16).padStart(8, '0');
    const second = stableHash(`${seed}|cloud`).toString(16).padStart(8, '0');
    return `${first}${second}`.toUpperCase();
}
