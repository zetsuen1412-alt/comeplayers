import {
    characterCardDefinition,
    CharacterRarity,
    isCharacterRarity,
} from '../data/CharacterCardData';
import { itemDefinition } from '../data/ItemCatalog';

export const CHARACTER_PROGRESSION_VERSION = 2;
export const DEFAULT_CHARACTER_CREDITS = 125_000;
export const CHARACTER_COLLECTION_LIMIT = 48;
export const ITEM_STACK_LIMIT = 20;

export interface CharacterCardInstance {
    readonly id: string;
    readonly definitionId: string;
    readonly rarity: CharacterRarity;
    readonly stars: number;
}

export interface InventoryItemStack {
    readonly definitionId: string;
    readonly quantity: number;
}

export interface CharacterProgressionData {
    readonly version: number;
    readonly credits: number;
    readonly upgradePoints: number;
    readonly equippedCardId: string;
    readonly equippedPendantId: string;
    readonly selectedBoosterId: string;
    readonly nextCardSequence: number;
    readonly rewardSequence: number;
    readonly cards: readonly CharacterCardInstance[];
    readonly items: readonly InventoryItemStack[];
}

export function createDefaultCharacterProgression(): CharacterProgressionData {
    return {
        version: CHARACTER_PROGRESSION_VERSION,
        credits: DEFAULT_CHARACTER_CREDITS,
        upgradePoints: 0,
        equippedCardId: 'card-1',
        equippedPendantId: 'travel-compass',
        selectedBoosterId: 'rent-shield',
        nextCardSequence: 4,
        rewardSequence: 0,
        cards: [
            { id: 'card-1', definitionId: 'alexia', rarity: 'SR', stars: 2 },
            { id: 'card-2', definitionId: 'nova', rarity: 'R', stars: 1 },
            { id: 'card-3', definitionId: 'lux', rarity: 'R', stars: 1 },
        ],
        items: [
            { definitionId: 'travel-compass', quantity: 1 },
            { definitionId: 'rent-shield', quantity: 2 },
            { definitionId: 'upgrade-permit', quantity: 1 },
        ],
    };
}

export function normalizeCharacterProgression(value: unknown): CharacterProgressionData {
    const defaults = createDefaultCharacterProgression();
    if (!isRecord(value)) return defaults;

    const usedIds = new Set<string>();
    const cards = Array.isArray(value.cards)
        ? value.cards
            .map((entry) => normalizeCard(entry, usedIds))
            .filter((entry): entry is CharacterCardInstance => entry !== null)
            .slice(0, CHARACTER_COLLECTION_LIMIT)
        : [];
    const safeCards = cards.length > 0 ? cards : defaults.cards;
    const requestedEquipped = normalizedId(value.equippedCardId);
    const equippedCardId = safeCards.some((card) => card.id === requestedEquipped)
        ? requestedEquipped
        : (safeCards[0] as CharacterCardInstance).id;

    const normalizedItems = normalizeItems(value.items);
    const safeItems = normalizedItems.length > 0 || Array.isArray(value.items)
        ? normalizedItems
        : defaults.items;
    const ownedPendantIds = safeItems
        .filter((stack) => itemDefinition(stack.definitionId)?.category === 'PENDANT' && stack.quantity > 0)
        .map((stack) => stack.definitionId);
    const ownedBoosterIds = safeItems
        .filter((stack) => itemDefinition(stack.definitionId)?.category === 'BOOSTER' && stack.quantity > 0)
        .map((stack) => stack.definitionId);
    const requestedPendant = normalizedId(value.equippedPendantId);
    const requestedBooster = normalizedId(value.selectedBoosterId);

    return {
        version: CHARACTER_PROGRESSION_VERSION,
        credits: boundedInteger(value.credits, 0, 9_999_999, defaults.credits),
        upgradePoints: boundedInteger(value.upgradePoints, 0, 999, defaults.upgradePoints),
        equippedCardId,
        equippedPendantId: ownedPendantIds.includes(requestedPendant)
            ? requestedPendant
            : (ownedPendantIds[0] ?? ''),
        selectedBoosterId: ownedBoosterIds.includes(requestedBooster)
            ? requestedBooster
            : (ownedBoosterIds[0] ?? ''),
        nextCardSequence: boundedInteger(value.nextCardSequence, 1, 9_999_999, defaults.nextCardSequence),
        rewardSequence: boundedInteger(
            value.rewardSequence ?? value.packSequence,
            0,
            9_999_999,
            defaults.rewardSequence,
        ),
        cards: safeCards,
        items: safeItems,
    };
}

function normalizeItems(value: unknown): InventoryItemStack[] {
    if (!Array.isArray(value)) return [];
    const quantities = new Map<string, number>();
    for (const entry of value) {
        if (!isRecord(entry)) continue;
        const definitionId = normalizedId(entry.definitionId);
        const definition = itemDefinition(definitionId);
        if (!definition) continue;
        const quantity = boundedInteger(entry.quantity, 0, Math.min(ITEM_STACK_LIMIT, definition.maxStack), 0);
        if (quantity <= 0) continue;
        quantities.set(
            definition.id,
            Math.min(definition.maxStack, (quantities.get(definition.id) ?? 0) + quantity),
        );
    }
    // Cocos Creator's web transpiler does not expand a Map iterator correctly
    // when it appears behind array spread (`[...map.entries()]`). Array.from
    // keeps the normalized inventory as concrete tuples in both editor and web
    // builds instead of producing one iterator-shaped item with undefined IDs.
    return Array.from(
        quantities.entries(),
        ([definitionId, quantity]) => ({ definitionId, quantity }),
    );
}

function normalizeCard(value: unknown, usedIds: Set<string>): CharacterCardInstance | null {
    if (!isRecord(value)) return null;
    const id = normalizedId(value.id);
    const definitionId = normalizedId(value.definitionId);
    const definition = characterCardDefinition(definitionId);
    if (!id || usedIds.has(id) || !definition) return null;
    usedIds.add(id);
    return {
        id,
        definitionId: definition.id,
        rarity: isCharacterRarity(value.rarity) ? value.rarity : definition.baseRarity,
        stars: boundedInteger(value.stars, 1, 5, 1),
    };
}

function normalizedId(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, 64);
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
