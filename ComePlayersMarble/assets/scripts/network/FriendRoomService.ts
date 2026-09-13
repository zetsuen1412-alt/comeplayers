import type { MatchMode, TeamId } from '../save/MatchSettingsData';
import {
    FRIEND_ROOM_PLAYER_LIMIT,
    FRIEND_ROOM_RECONNECT_WINDOW_MS,
    FRIEND_ROOM_SPECTATOR_LIMIT,
    FriendRoomResumeData,
    FriendRoomRole,
    FriendRoomSlotData,
    normalizeFriendRoom,
    OnlineProfileData,
} from '../save/OnlineProfileData';

export interface FriendRoomActionResult {
    readonly ok: boolean;
    readonly message: string;
    readonly room: FriendRoomResumeData | null;
}

export class FriendRoomService {
    public constructor(
        private readonly now: () => number = Date.now,
    ) {}

    public createRoom(profile: OnlineProfileData, mode: MatchMode): FriendRoomResumeData {
        const timestamp = this.safeNow();
        const roomSeed = `${profile.profileId}|${profile.friendCode}|${timestamp}|${mode}`;
        const roomId = `room-${stableHash(roomSeed).toString(16).padStart(8, '0')}`;
        const inviteCode = inviteCodeFromSeed(`${roomSeed}|invite`);
        const reconnectToken = `reconnect-${stableHash(`${roomSeed}|resume`).toString(16).padStart(8, '0')}-${timestamp.toString(36)}`;
        const hostSlot: FriendRoomSlotData = {
            slotId: `${roomId}-host`,
            profileId: profile.profileId,
            displayName: profile.displayName,
            role: 'PLAYER',
            ready: true,
            connected: true,
            joinedAt: timestamp,
            disconnectedAt: 0,
            ...(mode === 'TEAM' ? { teamId: 'BLUE' as TeamId } : {}),
        };
        return {
            roomId,
            inviteCode,
            reconnectToken,
            hostProfileId: profile.profileId,
            mode,
            phase: 'LOBBY',
            createdAt: timestamp,
            updatedAt: timestamp,
            expiresAt: timestamp + FRIEND_ROOM_RECONNECT_WINDOW_MS,
            maxPlayers: FRIEND_ROOM_PLAYER_LIMIT,
            maxSpectators: FRIEND_ROOM_SPECTATOR_LIMIT,
            slots: [hostSlot],
        };
    }

    public addSimulatedGuest(
        room: FriendRoomResumeData,
        role: FriendRoomRole,
        guestIndex: number,
    ): FriendRoomActionResult {
        const normalized = normalizeFriendRoom(room);
        if (!normalized || normalized.phase === 'CLOSED') {
            return { ok: false, message: 'Friend room is no longer available.', room: null };
        }
        const playerCount = normalized.slots.filter((slot) => slot.role === 'PLAYER').length;
        const spectatorCount = normalized.slots.filter((slot) => slot.role === 'SPECTATOR').length;
        if (role === 'PLAYER' && playerCount >= normalized.maxPlayers) {
            return { ok: false, message: 'All player slots are full.', room: normalized };
        }
        if (role === 'SPECTATOR' && spectatorCount >= normalized.maxSpectators) {
            return { ok: false, message: 'All spectator slots are full.', room: normalized };
        }
        const timestamp = this.safeNow();
        const suffix = Math.max(1, Math.trunc(guestIndex));
        const profileId = `CP-GUEST-${String(suffix).padStart(4, '0')}`;
        if (normalized.slots.some((slot) => slot.profileId === profileId)) {
            return { ok: false, message: 'That simulated guest is already in the room.', room: normalized };
        }
        const playerPosition = normalized.slots.filter((slot) => slot.role === 'PLAYER').length;
        const slot: FriendRoomSlotData = {
            slotId: `${normalized.roomId}-${role.toLowerCase()}-${suffix}`,
            profileId,
            displayName: role === 'PLAYER' ? `Marble Guest ${suffix}` : `Spectator ${suffix}`,
            role,
            ready: role === 'SPECTATOR',
            connected: true,
            joinedAt: timestamp,
            disconnectedAt: 0,
            ...(normalized.mode === 'TEAM' && role === 'PLAYER'
                ? { teamId: playerPosition % 2 === 0 ? 'BLUE' as TeamId : 'GOLD' as TeamId }
                : {}),
        };
        const next = normalizeFriendRoom({
            ...normalized,
            updatedAt: timestamp,
            expiresAt: timestamp + FRIEND_ROOM_RECONNECT_WINDOW_MS,
            slots: [...normalized.slots, slot],
        });
        return {
            ok: next !== null,
            message: next
                ? `${slot.displayName} joined as ${role.toLowerCase()}.`
                : 'The room update could not be normalized.',
            room: next,
        };
    }

    public toggleReady(room: FriendRoomResumeData, profileId: string): FriendRoomActionResult {
        const normalized = normalizeFriendRoom(room);
        if (!normalized || normalized.phase !== 'LOBBY') {
            return { ok: false, message: 'Ready state can only change in the lobby.', room: normalized };
        }
        const timestamp = this.safeNow();
        let changed = false;
        const slots = normalized.slots.map((slot) => {
            if (slot.profileId !== profileId || slot.role !== 'PLAYER') return slot;
            changed = true;
            return { ...slot, ready: !slot.ready };
        });
        if (!changed) return { ok: false, message: 'Player slot was not found.', room: normalized };
        const next = normalizeFriendRoom({
            ...normalized,
            updatedAt: timestamp,
            expiresAt: timestamp + FRIEND_ROOM_RECONNECT_WINDOW_MS,
            slots,
        });
        return {
            ok: next !== null,
            message: next?.slots.find((slot) => slot.profileId === profileId)?.ready
                ? 'Player is ready.'
                : 'Player is not ready.',
            room: next,
        };
    }

    public disconnect(room: FriendRoomResumeData, profileId: string): FriendRoomActionResult {
        const normalized = normalizeFriendRoom(room);
        if (!normalized) return { ok: false, message: 'Friend room was not found.', room: null };
        const timestamp = this.safeNow();
        let changed = false;
        const slots = normalized.slots.map((slot) => {
            if (slot.profileId !== profileId) return slot;
            changed = true;
            return { ...slot, connected: false, disconnectedAt: timestamp, ready: false };
        });
        if (!changed) return { ok: false, message: 'Player slot was not found.', room: normalized };
        const next = normalizeFriendRoom({
            ...normalized,
            updatedAt: timestamp,
            expiresAt: timestamp + FRIEND_ROOM_RECONNECT_WINDOW_MS,
            slots,
        });
        return { ok: next !== null, message: 'Connection state saved for reconnect.', room: next };
    }

    public reconnect(room: FriendRoomResumeData, reconnectToken: string): FriendRoomActionResult {
        const normalized = normalizeFriendRoom(room);
        if (!normalized || normalized.reconnectToken !== reconnectToken) {
            return { ok: false, message: 'Reconnect token is invalid.', room: normalized };
        }
        const timestamp = this.safeNow();
        if (normalized.expiresAt > 0 && timestamp > normalized.expiresAt) {
            return {
                ok: false,
                message: 'Reconnect window expired.',
                room: normalizeFriendRoom({ ...normalized, phase: 'CLOSED', updatedAt: timestamp }),
            };
        }
        const slots = normalized.slots.map((slot) => slot.profileId === normalized.hostProfileId
            ? { ...slot, connected: true, disconnectedAt: 0 }
            : slot);
        const next = normalizeFriendRoom({
            ...normalized,
            updatedAt: timestamp,
            expiresAt: timestamp + FRIEND_ROOM_RECONNECT_WINDOW_MS,
            slots,
        });
        return { ok: next !== null, message: 'Friend room session restored.', room: next };
    }

    public close(room: FriendRoomResumeData): FriendRoomResumeData | null {
        const timestamp = this.safeNow();
        return normalizeFriendRoom({
            ...room,
            phase: 'CLOSED',
            updatedAt: timestamp,
            expiresAt: timestamp,
            slots: room.slots.map((slot) => ({ ...slot, connected: false, ready: false, disconnectedAt: timestamp })),
        });
    }

    public canStart(room: FriendRoomResumeData): boolean {
        const normalized = normalizeFriendRoom(room);
        if (!normalized || normalized.phase !== 'LOBBY') return false;
        const players = normalized.slots.filter((slot) => slot.role === 'PLAYER' && slot.connected);
        return players.length >= 2 && players.every((slot) => slot.ready);
    }

    private safeNow(): number {
        const value = this.now();
        return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    }
}

export function inviteCodeFromSeed(seed: string): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let value = stableHash(seed);
    let code = '';
    for (let index = 0; index < 6; index++) {
        code += alphabet[value % alphabet.length] ?? 'C';
        value = Math.imul(value ^ (index + 17), 1664525) + 1013904223;
        value >>>= 0;
    }
    return code;
}

export function stableHash(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}
