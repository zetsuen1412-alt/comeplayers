export type RoundEventId =
    | 'SPONSOR_DROP'
    | 'CONSTRUCTION_GRANT'
    | 'TRAVEL_FESTIVAL'
    | 'INSURANCE_DAY'
    | 'CITY_MAINTENANCE'
    | 'COMEBACK_FUND';

export interface RoundEventPlayer {
    readonly id: string;
    readonly name: string;
    money: number;
    readonly properties: readonly number[];
    bankrupt: boolean;
    rentDiscountPercent: number;
    rentDiscountCharges: number;
    freeUpgradeCredits: number;
    freeWorldTravelCredits: number;
}

export interface RoundEventResult {
    readonly id: RoundEventId;
    readonly round: number;
    readonly title: string;
    readonly description: string;
    readonly accentHex: string;
    readonly affectedPlayerIds: readonly string[];
}

interface RoundEventDefinition {
    readonly id: RoundEventId;
    readonly title: string;
    readonly description: string;
    readonly accentHex: string;
    readonly apply: (players: RoundEventPlayer[]) => readonly string[];
}

const DEFINITIONS: readonly RoundEventDefinition[] = [
    {
        id: 'SPONSOR_DROP',
        title: 'SPONSOR DROP',
        description: 'Every active player receives CP 120,000.',
        accentHex: '#f5c323',
        apply: (players) => active(players).map((player) => {
            player.money += 120_000;
            return player.id;
        }),
    },
    {
        id: 'CONSTRUCTION_GRANT',
        title: 'CONSTRUCTION GRANT',
        description: 'Every active player receives one free building upgrade.',
        accentHex: '#56d7ff',
        apply: (players) => active(players).map((player) => {
            player.freeUpgradeCredits++;
            return player.id;
        }),
    },
    {
        id: 'TRAVEL_FESTIVAL',
        title: 'TRAVEL FESTIVAL',
        description: 'Every active player receives one free World Travel ticket.',
        accentHex: '#72f1b8',
        apply: (players) => active(players).map((player) => {
            player.freeWorldTravelCredits++;
            return player.id;
        }),
    },
    {
        id: 'INSURANCE_DAY',
        title: 'INSURANCE DAY',
        description: 'Every active player gains one 35% rent shield.',
        accentHex: '#bf9cff',
        apply: (players) => active(players).map((player) => {
            player.rentDiscountPercent = Math.max(player.rentDiscountPercent, 35);
            player.rentDiscountCharges++;
            return player.id;
        }),
    },
    {
        id: 'CITY_MAINTENANCE',
        title: 'CITY MAINTENANCE',
        description: 'Property owners pay CP 15,000 per city, capped to preserve CP 1.',
        accentHex: '#ff9b70',
        apply: (players) => active(players)
            .filter((player) => player.properties.length > 0)
            .map((player) => {
                const fee = Math.min(Math.max(0, player.money - 1), player.properties.length * 15_000);
                player.money -= fee;
                return player.id;
            }),
    },
    {
        id: 'COMEBACK_FUND',
        title: 'COMEBACK FUND',
        description: 'The active player with the lowest cash receives CP 250,000.',
        accentHex: '#ff79c6',
        apply: (players) => {
            const eligible = active(players).sort((a, b) => a.money - b.money || a.id.localeCompare(b.id));
            const recipient = eligible[0];
            if (!recipient) return [];
            recipient.money += 250_000;
            return [recipient.id];
        },
    },
];

export class RoundEventService {
    private readonly history: RoundEventResult[] = [];

    public constructor(private readonly seed: number) {}

    public trigger(round: number, players: RoundEventPlayer[]): RoundEventResult | undefined {
        if (round <= 1 || round % 2 !== 0 || players.filter((player) => !player.bankrupt).length <= 1) return undefined;
        const definition = DEFINITIONS[this.indexForRound(round)] as RoundEventDefinition;
        const affectedPlayerIds = definition.apply(players);
        const result: RoundEventResult = {
            id: definition.id,
            round,
            title: definition.title,
            description: definition.description,
            accentHex: definition.accentHex,
            affectedPlayerIds,
        };
        this.history.push(result);
        return result;
    }

    public snapshot(): readonly RoundEventResult[] {
        return this.history.map((entry) => ({ ...entry, affectedPlayerIds: [...entry.affectedPlayerIds] }));
    }

    private indexForRound(round: number): number {
        let value = (this.seed ^ Math.imul(round, 0x45d9f3b)) >>> 0;
        value ^= value >>> 16;
        value = Math.imul(value, 0x45d9f3b) >>> 0;
        value ^= value >>> 16;
        return (value >>> 0) % DEFINITIONS.length;
    }
}

function active(players: RoundEventPlayer[]): RoundEventPlayer[] {
    return players.filter((player) => !player.bankrupt);
}
