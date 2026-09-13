export type ClassicLobbyRoomMode = 'SOLO' | 'TEAM';
export type ClassicLobbyRoomFilter = 'ALL' | ClassicLobbyRoomMode;

export interface ClassicLobbyRoom {
    readonly id: string;
    readonly number: number;
    readonly title: string;
    readonly host: string;
    readonly mode: ClassicLobbyRoomMode;
    readonly map: string;
    readonly players: number;
    readonly capacity: number;
    readonly rank: string;
    readonly locked: boolean;
    readonly event: boolean;
}

export const CLASSIC_CHANNELS: readonly string[] = [
    'ROOKIE CHANNEL',
    'CASUAL CHANNEL',
    'MASTER CHANNEL',
];

export const CLASSIC_LOBBY_ROOMS: readonly ClassicLobbyRoom[] = [
    {
        id: 'room-021', number: 21, title: 'WELCOME ROOKIES', host: 'ALEXIA', mode: 'SOLO',
        map: 'SKYLINE CIRCUIT', players: 1, capacity: 4, rank: 'OPEN', locked: false, event: false,
    },
    {
        id: 'room-034', number: 34, title: 'FAST BUILD ONLY', host: 'NOVA', mode: 'SOLO',
        map: 'SKYLINE CIRCUIT', players: 3, capacity: 4, rank: 'OPEN', locked: false, event: false,
    },
    {
        id: 'room-046', number: 46, title: 'TEAM NIGHT', host: 'LUX', mode: 'TEAM',
        map: 'NEON HARBOR', players: 2, capacity: 4, rank: 'TEAM', locked: false, event: false,
    },
    {
        id: 'room-052', number: 52, title: 'LANDMARK RUSH', host: 'ONYX', mode: 'SOLO',
        map: 'GOLDEN DISTRICT', players: 4, capacity: 4, rank: 'FULL', locked: false, event: true,
    },
    {
        id: 'room-067', number: 67, title: 'FRIENDS TABLE', host: 'MIRA', mode: 'TEAM',
        map: 'SKYLINE CIRCUIT', players: 2, capacity: 4, rank: 'PRIVATE', locked: true, event: false,
    },
    {
        id: 'room-081', number: 81, title: 'WORLD TRAVEL CUP', host: 'VOLT', mode: 'SOLO',
        map: 'WORLD TOUR', players: 3, capacity: 4, rank: 'EVENT', locked: false, event: true,
    },
];

export function filterClassicLobbyRooms(
    filter: ClassicLobbyRoomFilter,
): readonly ClassicLobbyRoom[] {
    return filter === 'ALL'
        ? CLASSIC_LOBBY_ROOMS
        : CLASSIC_LOBBY_ROOMS.filter((room) => room.mode === filter);
}

export function classicLobbyRoomStatus(room: ClassicLobbyRoom): string {
    if (room.locked) return 'LOCKED';
    if (room.players >= room.capacity) return 'FULL';
    return room.event ? 'EVENT' : 'JOIN';
}
