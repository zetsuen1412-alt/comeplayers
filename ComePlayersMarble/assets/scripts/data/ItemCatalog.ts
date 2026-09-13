export const ITEM_CATEGORIES = ['PENDANT', 'BOOSTER'] as const;

export type ItemCategory = typeof ITEM_CATEGORIES[number];

export interface MatchLoadoutBonus {
    readonly startingMoneyBonus: number;
    readonly freeUpgradeCredits: number;
    readonly freeWorldTravelCredits: number;
    readonly rentDiscountPercent: number;
    readonly rentDiscountCharges: number;
}

export interface ItemDefinition {
    readonly id: string;
    readonly name: string;
    readonly category: ItemCategory;
    readonly rarity: 'R' | 'SR' | 'UR';
    readonly price: number;
    readonly maxStack: number;
    readonly description: string;
    readonly matchBonus: MatchLoadoutBonus;
}

const NO_BONUS: MatchLoadoutBonus = Object.freeze({
    startingMoneyBonus: 0,
    freeUpgradeCredits: 0,
    freeWorldTravelCredits: 0,
    rentDiscountPercent: 0,
    rentDiscountCharges: 0,
});

export const ITEM_CATALOG: readonly ItemDefinition[] = Object.freeze([
    {
        id: 'banker-badge',
        name: 'BANKER BADGE',
        category: 'PENDANT',
        rarity: 'R',
        price: 45_000,
        maxStack: 1,
        description: 'Begin every match with CP 200,000 additional capital.',
        matchBonus: { ...NO_BONUS, startingMoneyBonus: 200_000 },
    },
    {
        id: 'travel-compass',
        name: 'TRAVEL COMPASS',
        category: 'PENDANT',
        rarity: 'SR',
        price: 55_000,
        maxStack: 1,
        description: 'Begin every match with one free World Travel ticket.',
        matchBonus: { ...NO_BONUS, freeWorldTravelCredits: 1 },
    },
    {
        id: 'architect-blueprint',
        name: 'ARCHITECT BLUEPRINT',
        category: 'PENDANT',
        rarity: 'SR',
        price: 60_000,
        maxStack: 1,
        description: 'Begin every match with one free property upgrade credit.',
        matchBonus: { ...NO_BONUS, freeUpgradeCredits: 1 },
    },
    {
        id: 'insurance-charm',
        name: 'INSURANCE CHARM',
        category: 'PENDANT',
        rarity: 'UR',
        price: 85_000,
        maxStack: 1,
        description: 'The first rent payment each match is reduced by 35%.',
        matchBonus: { ...NO_BONUS, rentDiscountPercent: 35, rentDiscountCharges: 1 },
    },
    {
        id: 'marble-fund',
        name: 'MARBLE FUND',
        category: 'BOOSTER',
        rarity: 'R',
        price: 14_000,
        maxStack: 20,
        description: 'Consumable: begin the next match with CP 150,000 extra.',
        matchBonus: { ...NO_BONUS, startingMoneyBonus: 150_000 },
    },
    {
        id: 'upgrade-permit',
        name: 'UPGRADE PERMIT',
        category: 'BOOSTER',
        rarity: 'R',
        price: 16_000,
        maxStack: 20,
        description: 'Consumable: receive one free upgrade credit in the next match.',
        matchBonus: { ...NO_BONUS, freeUpgradeCredits: 1 },
    },
    {
        id: 'first-class-ticket',
        name: 'FIRST CLASS TICKET',
        category: 'BOOSTER',
        rarity: 'SR',
        price: 18_000,
        maxStack: 20,
        description: 'Consumable: receive one free World Travel ticket in the next match.',
        matchBonus: { ...NO_BONUS, freeWorldTravelCredits: 1 },
    },
    {
        id: 'rent-shield',
        name: 'RENT SHIELD',
        category: 'BOOSTER',
        rarity: 'SR',
        price: 22_000,
        maxStack: 20,
        description: 'Consumable: reduce one rent payment by 50% in the next match.',
        matchBonus: { ...NO_BONUS, rentDiscountPercent: 50, rentDiscountCharges: 1 },
    },
]);

export function itemDefinition(id: string): ItemDefinition | undefined {
    return ITEM_CATALOG.find((definition) => definition.id === id);
}

export function itemDefinitionsByCategory(category: ItemCategory): readonly ItemDefinition[] {
    return ITEM_CATALOG.filter((definition) => definition.category === category);
}

export function emptyMatchLoadoutBonus(): MatchLoadoutBonus {
    return { ...NO_BONUS };
}

export function mergeMatchLoadoutBonuses(
    ...bonuses: readonly MatchLoadoutBonus[]
): MatchLoadoutBonus {
    return bonuses.reduce<MatchLoadoutBonus>((total, bonus) => ({
        startingMoneyBonus: total.startingMoneyBonus + bonus.startingMoneyBonus,
        freeUpgradeCredits: total.freeUpgradeCredits + bonus.freeUpgradeCredits,
        freeWorldTravelCredits: total.freeWorldTravelCredits + bonus.freeWorldTravelCredits,
        rentDiscountPercent: Math.max(total.rentDiscountPercent, bonus.rentDiscountPercent),
        rentDiscountCharges: total.rentDiscountCharges + bonus.rentDiscountCharges,
    }), emptyMatchLoadoutBonus());
}
