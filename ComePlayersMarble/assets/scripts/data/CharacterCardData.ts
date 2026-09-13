export const CHARACTER_RARITIES = ['R', 'SR', 'UR'] as const;

export type CharacterRarity = typeof CHARACTER_RARITIES[number];

export interface CharacterActiveSkillDefinition {
    readonly id: string;
    readonly name: string;
    readonly description: string;
}

export interface CharacterCardDefinition {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    readonly baseRarity: CharacterRarity;
    readonly basePower: number;
    readonly passive: string;
    readonly activeSkill: CharacterActiveSkillDefinition;
}

export const CHARACTER_CARD_CATALOG: readonly CharacterCardDefinition[] = [
    {
        id: 'alexia',
        name: 'ALEXIA',
        role: 'URBAN EXPLORER',
        baseRarity: 'SR',
        basePower: 72,
        passive: 'Travel Focus: clearer destination guidance.',
        activeSkill: {
            id: 'route-override',
            name: 'ROUTE OVERRIDE',
            description: 'Gain one free World Travel ticket for this match.',
        },
    },
    {
        id: 'nova',
        name: 'NOVA',
        role: 'CIRCUIT COURIER',
        baseRarity: 'R',
        basePower: 46,
        passive: 'Quick Route: faster movement presentation.',
        activeSkill: {
            id: 'turbo-capital',
            name: 'TURBO CAPITAL',
            description: 'Receive CP 250,000 emergency capital.',
        },
    },
    {
        id: 'lux',
        name: 'LUX',
        role: 'SKYLINE TACTICIAN',
        baseRarity: 'R',
        basePower: 49,
        passive: 'City Sense: highlights economy decisions.',
        activeSkill: {
            id: 'instant-permit',
            name: 'INSTANT PERMIT',
            description: 'Gain one free property upgrade credit.',
        },
    },
    {
        id: 'onyx',
        name: 'ONYX',
        role: 'NIGHT ARCHITECT',
        baseRarity: 'SR',
        basePower: 69,
        passive: 'Build Rhythm: stronger upgrade feedback.',
        activeSkill: {
            id: 'rent-barrier',
            name: 'RENT BARRIER',
            description: 'Reduce the next rent payment by 60%.',
        },
    },
    {
        id: 'mira',
        name: 'MIRA',
        role: 'HARBOR PILOT',
        baseRarity: 'R',
        basePower: 44,
        passive: 'Safe Passage: calmer travel presentation.',
        activeSkill: {
            id: 'safe-passage',
            name: 'SAFE PASSAGE',
            description: 'Escape Island immediately and gain one travel ticket.',
        },
    },
    {
        id: 'volt',
        name: 'VOLT',
        role: 'NEON MECHANIC',
        baseRarity: 'R',
        basePower: 51,
        passive: 'Charge Up: brighter dice and landing cues.',
        activeSkill: {
            id: 'overcharge',
            name: 'OVERCHARGE',
            description: 'Gain CP 120,000 and one free upgrade credit.',
        },
    },
];

export function characterCardDefinition(id: string): CharacterCardDefinition | undefined {
    return CHARACTER_CARD_CATALOG.find((definition) => definition.id === id);
}

export function isCharacterRarity(value: unknown): value is CharacterRarity {
    return typeof value === 'string' && CHARACTER_RARITIES.indexOf(value as CharacterRarity) >= 0;
}

export function characterRarityRank(rarity: CharacterRarity): number {
    return CHARACTER_RARITIES.indexOf(rarity);
}

export function characterRarityAt(rank: number): CharacterRarity {
    const safeRank = Math.max(0, Math.min(CHARACTER_RARITIES.length - 1, Math.trunc(rank)));
    return CHARACTER_RARITIES[safeRank] as CharacterRarity;
}
