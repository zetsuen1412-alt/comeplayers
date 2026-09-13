import {
    BOT_DIFFICULTIES,
    BotDifficulty,
    MatchSettingsData,
    MatchMode,
    MATCH_SETTINGS_VERSION,
    normalizeMatchSettings,
} from '../save/MatchSettingsData';
import { LOCAL_PLAYER_TEMPLATES } from '../data/PlayerCatalog';

export type FrontEndMetaPage = 'SHOP' | 'CHARACTER' | 'DICE' | 'INVENTORY' | 'MISSIONS' | 'RANKED' | 'COMPETE' | 'ONLINE' | 'REPLAYS' | 'SETTINGS';

export interface FrontEndFeatureCard {
    readonly kicker: string;
    readonly title: string;
    readonly description: string;
}

export interface FrontEndMetaPageContent {
    readonly title: string;
    readonly subtitle: string;
    readonly cards: readonly [FrontEndFeatureCard, FrontEndFeatureCard, FrontEndFeatureCard];
}

export interface LocalRoomSlot {
    readonly name: string;
    readonly role: string;
    readonly team: string;
    readonly ready: boolean;
    readonly occupied: boolean;
}

export const FRONT_END_META_PAGES: readonly FrontEndMetaPage[] = [
    'SHOP',
    'CHARACTER',
    'DICE',
    'INVENTORY',
    'MISSIONS',
    'RANKED',
    'COMPETE',
    'ONLINE',
    'REPLAYS',
    'SETTINGS',
];

export const FRONT_END_META_CONTENT: Readonly<Record<FrontEndMetaPage, FrontEndMetaPageContent>> = {
    SHOP: {
        title: 'COMEPLAYERS SHOP',
        subtitle: 'Open character packs, buy pendants, and prepare one-match boosters with local CP.',
        cards: [
            {
                kicker: 'STARTER COLLECTION',
                title: 'CHARACTER PACK',
                description: 'Character cards and upgrade materials for your local collection.',
            },
            {
                kicker: 'FEATURED',
                title: 'DICE SKINS',
                description: 'Browse pendants and consumable match boosters beside cosmetic dice skins.',
            },
            {
                kicker: 'BOARD STYLE',
                title: 'CITY THEMES',
                description: 'Cosmetic board themes that do not change the match rules.',
            },
        ],
    },
    CHARACTER: {
        title: 'CHARACTER CARDS',
        subtitle: 'Browse your collection, equip a character, then safely combine two material cards.',
        cards: [
            {
                kicker: 'PREVIEW EQUIPPED  •  SR',
                title: 'ALEXIA',
                description: 'Explorer with a travel presentation bonus and an original animation.',
            },
            {
                kicker: 'DECK  1 / 8',
                title: 'STARTER DECK',
                description: 'One active character. Additional collection slots unlock over time.',
            },
            {
                kicker: 'UPGRADE LAB',
                title: 'COMBINE',
                description: 'The combine flow follows the reference hierarchy with new ComePlayers rules.',
            },
        ],
    },
    DICE: {
        title: 'DICE COLLECTION',
        subtitle: 'Every skin is cosmetic; outcomes still come from the authoritative match system.',
        cards: [
            {
                kicker: 'PREVIEW EQUIPPED',
                title: 'COMEPLAYERS GOLD',
                description: 'Warm gold body, dark pips, and strong contrast for smaller screens.',
            },
            {
                kicker: 'OWNED',
                title: 'NEON CIRCUIT',
                description: 'Electric cyan palette for night arenas and fast camera effects.',
            },
            {
                kicker: 'OWNED',
                title: 'MARBLE PEARL',
                description: 'Soft silver palette with blue pips for a classic look.',
            },
        ],
    },
    INVENTORY: {
        title: 'INVENTORY',
        subtitle: 'Equip one pendant and select one consumable booster before entering a room.',
        cards: [
            {
                kicker: 'PREVIEW CARDS',
                title: 'MATCH LOADOUT',
                description: 'One character, one pendant, and one optional booster can be prepared locally.',
            },
            {
                kicker: 'PREVIEW COSMETICS',
                title: '3 DICE SKINS',
                description: 'Three procedural palettes are available for presentation testing.',
            },
            {
                kicker: 'PREVIEW BOOSTERS',
                title: 'BOOSTERS',
                description: 'A selected booster is consumed only when a local match begins.',
            },
        ],
    },
    MISSIONS: {
        title: 'MISSIONS',
        subtitle: 'Short objectives that help players learn the core systems.',
        cards: [
            {
                kicker: 'PREVIEW  1 / 1',
                title: 'FIRST STEPS',
                description: 'Open the guide and learn how to win.',
            },
            {
                kicker: 'PREVIEW  0 / 3',
                title: 'CITY BUILDER',
                description: 'Buy or upgrade three cities in one match.',
            },
            {
                kicker: 'PREVIEW  0 / 1',
                title: 'WORLD TRAVELER',
                description: 'Use World Travel to move to a city of your choice.',
            },
        ],
    },
    RANKED: {
        title: 'RANKED ARENA',
        subtitle: 'Play fixed-rule local ranked matches, climb seasonal tiers, and earn a weekly CP reward.',
        cards: [
            {
                kicker: 'SEASON RATING',
                title: 'PLACEMENT QUEUE',
                description: 'Four-player matches use rating-based AI and authoritative local rules.',
            },
            {
                kicker: 'WEEKLY ACTIVITY',
                title: 'RANKED REWARD',
                description: 'Complete five ranked matches during the current local week.',
            },
            {
                kicker: 'LOCAL STANDINGS',
                title: 'LEADERBOARD',
                description: 'Compare your rating with simulated ComePlayers rivals on this device.',
            },
        ],
    },


    COMPETE: {
        title: 'COMPETITIVE CIRCUIT',
        subtitle: 'Enter server-ranked matchmaking, follow global standings, and play four/eight-player elimination cups.',
        cards: [
            {
                kicker: 'SUPABASE MATCHMAKING',
                title: 'SERVER RANKED QUEUE',
                description: 'Search by mode, region, rating window, and wait time. A private room is created atomically when enough players match.',
            },
            {
                kicker: 'SINGLE ELIMINATION',
                title: 'TOURNAMENT BRACKET',
                description: 'Create or join a four/eight-player cup. Finished authoritative matches advance winners into the next round.',
            },
            {
                kicker: 'GLOBAL PROFILE',
                title: 'COMPETITIVE LEADERBOARD',
                description: 'Track server rating, season points, streaks, tournament wins, and the top twenty ComePlayers competitors.',
            },
        ],
    },
    ONLINE: {
        title: 'ONLINE CENTER',
        subtitle: 'Run dice, property economy, bankruptcy, and victory through revisioned Postgres RPC while retaining offline fallback.',
        cards: [
            {
                kicker: 'SUPABASE REALTIME + RPC',
                title: 'SERVER AUTHORITY',
                description: 'Use authenticated private channels plus revisioned RPC commands for dice, purchases, upgrades, rent, and takeover.',
            },
            {
                kicker: 'SERVER ECONOMY',
                title: 'BANKRUPTCY REDUCER',
                description: 'Liquidate assets deterministically, settle rent, declare bankruptcy, and calculate Solo or Team winners.',
            },
            {
                kicker: 'APPEND-ONLY EVENTS',
                title: 'AUTHORITY CONSOLE',
                description: 'Inspect landing decisions, city ownership, building levels, net worth, winners, and reconnectable snapshots.',
            },
        ],
    },
    REPLAYS: {
        title: 'MATCH REPLAYS',
        subtitle: 'Review compact deterministic match timelines that are ready for future spectator playback.',
        cards: [
            {
                kicker: 'LATEST MATCH',
                title: 'REPLAY LIBRARY',
                description: 'Completed matches store rolls, movement, actions, result data, and a checksum.',
            },
            {
                kicker: 'TIMELINE',
                title: 'EVENT STREAM',
                description: 'A bounded event stream can drive a future replay camera or live spectator client.',
            },
            {
                kicker: 'PORTABLE DATA',
                title: 'EXPORT CONTRACT',
                description: 'Replay records are JSON-safe and capped to protect save size and performance.',
            },
        ],
    },
    SETTINGS: {
        title: 'SETTINGS',
        subtitle: 'Preferences are saved automatically on this device.',
        cards: [
            {
                kicker: 'AUDIO',
                title: 'MUSIC',
                description: 'Adjust the background music volume.',
            },
            {
                kicker: 'AUDIO',
                title: 'SFX',
                description: 'Adjust the game sound effects volume.',
            },
            {
                kicker: 'ACCESSIBILITY',
                title: 'CAMERA MOTION',
                description: 'Reduce camera movement and impact effects.',
            },
        ],
    },
};

export function createLocalRoomSettings(value: unknown): MatchSettingsData {
    return normalizeMatchSettings({ ...normalizeMatchSettings(value), rankedMode: false });
}

export function changeRoomPlayerCount(settings: MatchSettingsData, delta: number): MatchSettingsData {
    return normalizeMatchSettings({
        ...settings,
        version: MATCH_SETTINGS_VERSION,
        playerCount: settings.playerCount + integerDelta(delta),
        rankedMode: false,
    }, settings);
}

export function changeRoomTurnSeconds(settings: MatchSettingsData, delta: number): MatchSettingsData {
    return normalizeMatchSettings({
        ...settings,
        version: MATCH_SETTINGS_VERSION,
        turnSeconds: settings.turnSeconds + integerDelta(delta),
        rankedMode: false,
    }, settings);
}

export function toggleRoomAutoRoll(settings: MatchSettingsData): MatchSettingsData {
    return normalizeMatchSettings({
        ...settings,
        version: MATCH_SETTINGS_VERSION,
        autoRollOnTimeout: !settings.autoRollOnTimeout,
        rankedMode: false,
    }, settings);
}

export function cycleRoomBotDifficulty(settings: MatchSettingsData): MatchSettingsData {
    const current = BOT_DIFFICULTIES.indexOf(settings.botDifficulty);
    const next = BOT_DIFFICULTIES[(current + 1 + BOT_DIFFICULTIES.length) % BOT_DIFFICULTIES.length] as BotDifficulty;
    return normalizeMatchSettings({
        ...settings,
        version: MATCH_SETTINGS_VERSION,
        botDifficulty: next,
        rankedMode: false,
    }, settings);
}


export function toggleRoomMode(settings: MatchSettingsData): MatchSettingsData {
    const matchMode: MatchMode = settings.matchMode === 'SOLO' ? 'TEAM' : 'SOLO';
    return normalizeMatchSettings({
        ...settings,
        version: MATCH_SETTINGS_VERSION,
        matchMode,
        playerCount: matchMode === 'TEAM' ? 4 : settings.playerCount,
        rankedMode: false,
    }, settings);
}

export function toggleRoundEvents(settings: MatchSettingsData): MatchSettingsData {
    return normalizeMatchSettings({
        ...settings,
        version: MATCH_SETTINGS_VERSION,
        roundEventsEnabled: !settings.roundEventsEnabled,
        rankedMode: false,
    }, settings);
}

export function createLocalRoomSlots(settings: MatchSettingsData): readonly LocalRoomSlot[] {
    return LOCAL_PLAYER_TEMPLATES.map((template, index) => ({
        name: template.name,
        role: template.bot ? 'LOCAL BOT' : 'HOST',
        team: settings.matchMode === 'TEAM' ? (index % 2 === 0 ? 'TEAM BLUE' : 'TEAM GOLD') : 'SOLO',
        ready: index < settings.playerCount,
        occupied: index < settings.playerCount,
    }));
}

function integerDelta(value: number): number {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
}
