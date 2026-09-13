import { Vec3 } from 'cc';

export enum TileType {
    Start = 'START',
    City = 'CITY',
    Fortune = 'FORTUNE',
    GameCenter = 'GAME_CENTER',
    Island = 'ISLAND',
    Olympic = 'OLYMPIC',
    WorldTravel = 'WORLD_TRAVEL',
    Tax = 'TAX',
    Bonus = 'BONUS_GAME',
    Tourist = 'TOURIST_AREA',
}

export interface BoardTileData {
    readonly id: string;
    readonly index: number;
    readonly displayName: string;
    readonly tileType: TileType;
    readonly region: string;
    readonly purchasePrice: number;
    readonly baseRent: number;
    readonly buildingCosts: readonly number[];
    readonly rentByBuildingLevel: readonly number[];
    readonly landmarkCost: number;
    readonly takeoverCostMultiplier: number;
    readonly colorGroup: string;
    readonly worldPosition: Vec3;
    readonly iconKey: string;
    readonly prefabKey: string;
    readonly description: string;
}

export interface GameRules {
    readonly startingMoney: number;
    readonly startSalary: number;
    readonly turnSeconds: number;
    readonly maxRounds: number;
    readonly minimumPlayers: number;
    readonly maximumPlayers: number;
    readonly extraTurnOnDouble: boolean;
    readonly diceTimeoutSeconds: number;
    readonly islandTurnPenalty: number;
    readonly worldTravelCost: number;
    readonly olympicRentMultiplierStep: number;
    readonly olympicMaxRentMultiplier: number;
    readonly gameCenterOptionCount: number;
    readonly gameCenterWinReward: number;
    readonly gameCenterSafeEntry: number;
    readonly gameCenterBalancedEntry: number;
    readonly gameCenterJackpotEntry: number;
    readonly gameCenterSafeReward: number;
    readonly gameCenterBalancedReward: number;
    readonly gameCenterJackpotReward: number;
    readonly gameCenterReserveFloor: number;
    readonly taxAmount: number;
    readonly bonusReward: number;
}

export const GAME_RULES: GameRules = {
    startingMoney: 2_000_000,
    startSalary: 200_000,
    turnSeconds: 20,
    maxRounds: 12,
    minimumPlayers: 2,
    maximumPlayers: 4,
    extraTurnOnDouble: true,
    diceTimeoutSeconds: 3,
    islandTurnPenalty: 2,
    worldTravelCost: 150_000,
    olympicRentMultiplierStep: 0.5,
    olympicMaxRentMultiplier: 3,
    gameCenterOptionCount: 3,
    gameCenterWinReward: 520_000,
    gameCenterSafeEntry: 40_000,
    gameCenterBalancedEntry: 80_000,
    gameCenterJackpotEntry: 150_000,
    gameCenterSafeReward: 120_000,
    gameCenterBalancedReward: 260_000,
    gameCenterJackpotReward: 520_000,
    gameCenterReserveFloor: 100_000,
    taxAmount: 100_000,
    bonusReward: 120_000,
};

const TILE_TYPES: readonly TileType[] = [
    TileType.Start, TileType.City, TileType.Fortune, TileType.City,
    TileType.Tourist, TileType.GameCenter, TileType.City, TileType.City,
    TileType.Island, TileType.City, TileType.Fortune, TileType.City,
    TileType.Tourist, TileType.Olympic, TileType.City, TileType.City,
    TileType.WorldTravel, TileType.City, TileType.Fortune, TileType.City,
    TileType.Tourist, TileType.Tax, TileType.City, TileType.City,
    TileType.Bonus, TileType.City, TileType.Fortune, TileType.City,
    TileType.Tourist, TileType.City, TileType.City, TileType.City,
];

const CITY_NAMES: readonly string[] = [
    'Nova Bay', 'Aurora Port', 'Zenith', 'Luma City', 'Orion',
    'Solara', 'Vesper', 'Arcadia', 'Nexus', 'Celestia', 'Astra',
    'Helios', 'Mirage', 'Titan', 'Eclipse', 'Polaris', 'Neon Harbor',
    'Silverpeak', 'Goldhaven', 'Alexia City', 'Quantum',
];

const TOURIST_NAMES: readonly string[] = [
    'Alexia Park', 'Neon Falls', 'Sky Temple', 'Marble Observatory',
];

const SPECIAL_NAMES: Readonly<Record<TileType, string>> = {
    [TileType.Start]: 'START',
    [TileType.City]: 'City',
    [TileType.Fortune]: 'Fortune Signal',
    [TileType.GameCenter]: 'Game Center',
    [TileType.Island]: 'Island',
    [TileType.Olympic]: 'Olympic',
    [TileType.WorldTravel]: 'World Travel',
    [TileType.Tax]: 'System Tax',
    [TileType.Bonus]: 'Bonus Game',
    [TileType.Tourist]: 'Tourist Area',
};

function boardPosition(index: number): Vec3 {
    const halfExtent = 10.5;
    const segment = (halfExtent * 2) / 8;
    const side = Math.floor(index / 8);
    const step = index % 8;
    const offset = -halfExtent + step * segment;

    switch (side) {
        case 0: return new Vec3(offset, 0, -halfExtent);
        case 1: return new Vec3(halfExtent, 0, offset);
        case 2: return new Vec3(-offset, 0, halfExtent);
        default: return new Vec3(-halfExtent, 0, -offset);
    }
}

export function createBoardData(): readonly BoardTileData[] {
    let cityNameIndex = 0;
    let touristNameIndex = 0;
    return TILE_TYPES.map((tileType, index): BoardTileData => {
        const purchasable = tileType === TileType.City || tileType === TileType.Tourist;
        const displayName = tileType === TileType.Tourist
            ? (TOURIST_NAMES[touristNameIndex++] ?? `Tourist Area ${index}`)
            : tileType === TileType.City
                ? (CITY_NAMES[cityNameIndex++] ?? `City ${index}`)
                : SPECIAL_NAMES[tileType];
        const tier = 1 + Math.floor(index / 8);
        const baseRent = purchasable ? 14_000 + tier * 5_000 : 0;
        const effectiveBaseRent = tileType === TileType.Tourist ? baseRent + 8_000 : baseRent;

        return {
            id: `tile-${index}`,
            index,
            displayName,
            tileType,
            region: tileType === TileType.Tourist
                ? 'ComePlayers Tourism'
                : purchasable ? 'ComePlayers World' : 'Special District',
            purchasePrice: tileType === TileType.Tourist
                ? 130_000 + tier * 20_000
                : purchasable ? 80_000 + tier * 20_000 : 0,
            baseRent: effectiveBaseRent,
            buildingCosts: purchasable ? [30_000, 50_000, 80_000] : [],
            rentByBuildingLevel: purchasable
                ? [
                    effectiveBaseRent,
                    Math.round(effectiveBaseRent * 2),
                    Math.round(effectiveBaseRent * 4),
                    Math.round(effectiveBaseRent * 7),
                    Math.round(effectiveBaseRent * 12),
                ]
                : [],
            landmarkCost: purchasable ? 180_000 : 0,
            takeoverCostMultiplier: 2,
            colorGroup: tileType === TileType.Tourist
                ? 'tourist'
                : tileType === TileType.City ? `group-${Math.floor(index / 4)}` : 'special',
            worldPosition: boardPosition(index),
            iconKey: tileType.toLowerCase(),
            prefabKey: 'runtime-tile',
            description: tileType === TileType.Tourist
                ? `Tourism landmark in ${displayName}; collect every tourism tile for Tourism Monopoly.`
                : purchasable
                    ? `Premium property in ${displayName}.`
                    : `Special ${displayName} tile.`,
        };
    });
}
