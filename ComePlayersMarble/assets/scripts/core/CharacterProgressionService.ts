import {
    CHARACTER_CARD_CATALOG,
    characterCardDefinition,
    CharacterCardDefinition,
    characterRarityAt,
    characterRarityRank,
} from '../data/CharacterCardData';
import {
    emptyMatchLoadoutBonus,
    ItemDefinition,
    itemDefinition,
    MatchLoadoutBonus,
    mergeMatchLoadoutBonuses,
} from '../data/ItemCatalog';
import {
    CHARACTER_COLLECTION_LIMIT,
    CharacterCardInstance,
    CharacterProgressionData,
    InventoryItemStack,
    normalizeCharacterProgression,
} from '../save/CharacterProgressionData';

export const CHARACTER_PACK_COST = 25_000;
export const UPGRADE_POINT_REDEEM_COST = 3;
export const CHARACTER_CARD_UPGRADE_COST = 1;

export interface CharacterProgressionStore {
    loadCharacterProgression(): CharacterProgressionData;
    saveCharacterProgression(data: CharacterProgressionData): CharacterProgressionStoreSaveResult;
}

export interface CharacterProgressionStoreSaveResult {
    readonly data: CharacterProgressionData;
    readonly persisted: boolean;
}

export interface CharacterCardView extends CharacterCardInstance {
    readonly definition: CharacterCardDefinition;
    readonly power: number;
}

export interface InventoryItemView extends InventoryItemStack {
    readonly definition: ItemDefinition;
    readonly equipped: boolean;
    readonly selected: boolean;
}

export interface CharacterProgressionSnapshot {
    readonly credits: number;
    readonly upgradePoints: number;
    readonly equippedCardId: string;
    readonly equippedPendantId: string;
    readonly selectedBoosterId: string;
    readonly cards: readonly CharacterCardView[];
    readonly items: readonly InventoryItemView[];
}

export interface CharacterProgressionActionResult {
    readonly ok: boolean;
    readonly message: string;
    readonly snapshot: CharacterProgressionSnapshot;
    readonly revealedCard?: CharacterCardView;
}

export interface MatchLoadoutPreparation {
    readonly persisted: boolean;
    readonly message: string;
    readonly bonus: MatchLoadoutBonus;
    readonly pendant?: ItemDefinition;
    readonly booster?: ItemDefinition;
    readonly snapshot: CharacterProgressionSnapshot;
}

export class CharacterProgressionService {
    private data: CharacterProgressionData;

    public constructor(private readonly store: CharacterProgressionStore) {
        this.data = normalizeCharacterProgression(store.loadCharacterProgression());
    }

    public snapshot(): CharacterProgressionSnapshot {
        return {
            credits: this.data.credits,
            upgradePoints: this.data.upgradePoints,
            equippedCardId: this.data.equippedCardId,
            equippedPendantId: this.data.equippedPendantId,
            selectedBoosterId: this.data.selectedBoosterId,
            cards: this.data.cards.map((card) => this.cardView(card)),
            items: this.data.items.map((stack) => this.itemView(stack)),
        };
    }

    public equippedCharacter(): CharacterCardView {
        const card = this.data.cards.find((entry) => entry.id === this.data.equippedCardId)
            ?? this.data.cards[0];
        if (!card) throw new Error('Character progression has no cards.');
        return this.cardView(card);
    }

    public grantCredits(amount: number, reason = 'Match reward'): CharacterProgressionActionResult {
        const credits = Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0;
        if (credits <= 0) return this.failure('No credits were awarded.');
        if (!this.persist({
            ...this.data,
            credits: Math.min(9_999_999, this.data.credits + credits),
        })) return this.persistenceFailure();
        return this.success(`${reason}: +CP ${credits.toLocaleString('en-US')}.`);
    }

    public purchasePack(): CharacterProgressionActionResult {
        if (this.data.cards.length >= CHARACTER_COLLECTION_LIMIT) {
            return this.failure('Collection is full. Combine cards before opening another pack.');
        }
        if (this.data.credits < CHARACTER_PACK_COST) {
            return this.failure(`You need CP ${CHARACTER_PACK_COST.toLocaleString('en-US')} to open this pack.`);
        }
        return this.grantGeneratedCard({
            credits: this.data.credits - CHARACTER_PACK_COST,
            upgradePoints: this.data.upgradePoints,
        }, 'Character pack opened.');
    }

    public redeemUpgradePoints(): CharacterProgressionActionResult {
        if (this.data.cards.length >= CHARACTER_COLLECTION_LIMIT) {
            return this.failure('Collection is full. Combine cards before redeeming a reward.');
        }
        if (this.data.upgradePoints < UPGRADE_POINT_REDEEM_COST) {
            return this.failure(`Collect ${UPGRADE_POINT_REDEEM_COST} upgrade points to redeem a card.`);
        }
        return this.grantGeneratedCard({
            credits: this.data.credits,
            upgradePoints: this.data.upgradePoints - UPGRADE_POINT_REDEEM_COST,
        }, 'Upgrade points redeemed.');
    }

    public purchaseItem(definitionId: string): CharacterProgressionActionResult {
        const definition = itemDefinition(definitionId);
        if (!definition) return this.failure('That shop item does not exist.');
        const current = this.itemQuantity(definition.id);
        if (current >= definition.maxStack) {
            return this.failure(`${definition.name} already reached its inventory limit.`);
        }
        if (this.data.credits < definition.price) {
            return this.failure(`You need CP ${definition.price.toLocaleString('en-US')} to buy ${definition.name}.`);
        }
        const items = this.withItemQuantity(definition.id, current + 1);
        const equippedPendantId = definition.category === 'PENDANT' && !this.data.equippedPendantId
            ? definition.id
            : this.data.equippedPendantId;
        const selectedBoosterId = definition.category === 'BOOSTER' && !this.data.selectedBoosterId
            ? definition.id
            : this.data.selectedBoosterId;
        if (!this.persist({
            ...this.data,
            credits: this.data.credits - definition.price,
            items,
            equippedPendantId,
            selectedBoosterId,
        })) return this.persistenceFailure();
        return this.success(`${definition.name} purchased. CP ${definition.price.toLocaleString('en-US')} spent.`);
    }

    public equipPendant(definitionId: string): CharacterProgressionActionResult {
        const definition = itemDefinition(definitionId);
        if (!definition || definition.category !== 'PENDANT') return this.failure('Choose a valid pendant.');
        if (this.itemQuantity(definition.id) <= 0) return this.failure('That pendant is not owned.');
        if (this.data.equippedPendantId === definition.id) return this.success(`${definition.name} is already equipped.`);
        if (!this.persist({ ...this.data, equippedPendantId: definition.id })) return this.persistenceFailure();
        return this.success(`${definition.name} equipped for future matches.`);
    }

    public selectBooster(definitionId: string): CharacterProgressionActionResult {
        const definition = itemDefinition(definitionId);
        if (!definition || definition.category !== 'BOOSTER') return this.failure('Choose a valid booster.');
        if (this.itemQuantity(definition.id) <= 0) return this.failure('That booster is not available.');
        if (this.data.selectedBoosterId === definition.id) return this.success(`${definition.name} is already selected.`);
        if (!this.persist({ ...this.data, selectedBoosterId: definition.id })) return this.persistenceFailure();
        return this.success(`${definition.name} selected and will be consumed when the next match begins.`);
    }

    public prepareMatchLoadout(): MatchLoadoutPreparation {
        const pendant = itemDefinition(this.data.equippedPendantId);
        const booster = itemDefinition(this.data.selectedBoosterId);
        const ownedPendant = pendant?.category === 'PENDANT' && this.itemQuantity(pendant.id) > 0
            ? pendant
            : undefined;
        const usableBooster = booster?.category === 'BOOSTER' && this.itemQuantity(booster.id) > 0
            ? booster
            : undefined;
        let persisted = true;
        if (usableBooster) {
            const remaining = this.itemQuantity(usableBooster.id) - 1;
            persisted = this.persist({
                ...this.data,
                items: this.withItemQuantity(usableBooster.id, remaining),
                selectedBoosterId: remaining > 0 ? usableBooster.id : '',
            });
        }
        const appliedBooster = persisted ? usableBooster : undefined;
        const bonus = mergeMatchLoadoutBonuses(
            ownedPendant?.matchBonus ?? emptyMatchLoadoutBonus(),
            appliedBooster?.matchBonus ?? emptyMatchLoadoutBonus(),
        );
        const names = [ownedPendant?.name, appliedBooster?.name].filter((name): name is string => Boolean(name));
        return {
            persisted,
            message: names.length > 0 ? `Loadout active: ${names.join(' + ')}.` : 'No pendant or booster loadout active.',
            bonus,
            pendant: ownedPendant,
            booster: appliedBooster,
            snapshot: this.snapshot(),
        };
    }

    public equip(cardId: string): CharacterProgressionActionResult {
        const card = this.data.cards.find((entry) => entry.id === cardId);
        if (!card) return this.failure('That character card is no longer in the collection.');
        if (this.data.equippedCardId === cardId) {
            return this.success(`${this.cardView(card).definition.name} is already equipped.`);
        }
        if (!this.persist({ ...this.data, equippedCardId: cardId })) {
            return this.persistenceFailure();
        }
        return this.success(`${this.cardView(card).definition.name} equipped.`);
    }

    public upgrade(cardId: string): CharacterProgressionActionResult {
        const card = this.data.cards.find((entry) => entry.id === cardId);
        if (!card) return this.failure('That character card is no longer in the collection.');
        if (card.stars >= 5) return this.failure('This character card already has the maximum 5 stars.');
        if (this.data.upgradePoints < CHARACTER_CARD_UPGRADE_COST) {
            return this.failure(`You need ${CHARACTER_CARD_UPGRADE_COST} upgrade point to increase this card's star level.`);
        }

        const upgraded: CharacterCardInstance = { ...card, stars: card.stars + 1 };
        const cards = this.data.cards.map((entry) => entry.id === cardId ? upgraded : entry);
        if (!this.persist({
            ...this.data,
            cards,
            upgradePoints: this.data.upgradePoints - CHARACTER_CARD_UPGRADE_COST,
        })) return this.persistenceFailure();

        const revealedCard = this.snapshot().cards.find((entry) => entry.id === cardId);
        return {
            ok: true,
            message: `${revealedCard?.definition.name ?? 'Character card'} upgraded to ${upgraded.stars} stars.`,
            snapshot: this.snapshot(),
            revealedCard,
        };
    }

    public combine(firstCardId: string, secondCardId: string): CharacterProgressionActionResult {
        if (firstCardId === secondCardId) return this.failure('Choose two different material cards.');
        const first = this.data.cards.find((entry) => entry.id === firstCardId);
        const second = this.data.cards.find((entry) => entry.id === secondCardId);
        if (!first || !second) return this.failure('One of the selected material cards is missing.');

        const nextSequence = this.nextAvailableSequence();
        const result = this.createCombinedCard(first, second, nextSequence);
        const resultView = this.cardView(result);
        const sourcePower = Math.max(this.cardView(first).power, this.cardView(second).power);
        if (resultView.power <= sourcePower) {
            return this.failure('These materials cannot produce a stronger card. Pair equal rarities or choose a card below maximum power.');
        }
        const consumedEquipped = first.id === this.data.equippedCardId || second.id === this.data.equippedCardId;
        const remaining = this.data.cards.filter((entry) => entry.id !== first.id && entry.id !== second.id);
        const cards = [...remaining, result];
        if (!this.persist({
            ...this.data,
            cards,
            equippedCardId: consumedEquipped ? result.id : this.data.equippedCardId,
            nextCardSequence: nextSequence + 1,
            upgradePoints: Math.min(999, this.data.upgradePoints + 1),
        })) return this.persistenceFailure();
        const revealedCard = this.snapshot().cards.find((entry) => entry.id === result.id);
        return {
            ok: true,
            message: 'Two material cards combined. You earned 1 upgrade point.',
            snapshot: this.snapshot(),
            revealedCard,
        };
    }

    private grantGeneratedCard(
        balance: Pick<CharacterProgressionData, 'credits' | 'upgradePoints'>,
        message: string,
    ): CharacterProgressionActionResult {
        const nextSequence = this.nextAvailableSequence();
        const card = this.createGeneratedCard(nextSequence, this.data.rewardSequence);
        if (!this.persist({
            ...this.data,
            ...balance,
            cards: [...this.data.cards, card],
            nextCardSequence: nextSequence + 1,
            rewardSequence: this.data.rewardSequence + 1,
        })) return this.persistenceFailure();
        const revealedCard = this.snapshot().cards.find((entry) => entry.id === card.id);
        return {
            ok: true,
            message,
            snapshot: this.snapshot(),
            revealedCard,
        };
    }

    private createGeneratedCard(sequence: number, rewardSequence: number): CharacterCardInstance {
        const catalogIndex = (rewardSequence * 5 + sequence * 3) % CHARACTER_CARD_CATALOG.length;
        const definition = CHARACTER_CARD_CATALOG[catalogIndex] as CharacterCardDefinition;
        const rarityBoost = rewardSequence > 0 && rewardSequence % 5 === 0 ? 1 : 0;
        return {
            id: `card-${sequence}`,
            definitionId: definition.id,
            rarity: characterRarityAt(characterRarityRank(definition.baseRarity) + rarityBoost),
            stars: 1 + (rewardSequence % 3 === 2 ? 1 : 0),
        };
    }

    private createCombinedCard(
        first: CharacterCardInstance,
        second: CharacterCardInstance,
        sequence: number,
    ): CharacterCardInstance {
        const source = [this.cardView(first), this.cardView(second)].sort((left, right) =>
            right.power - left.power
            || left.definition.id.localeCompare(right.definition.id)
            || left.id.localeCompare(right.id)
        )[0] as CharacterCardView;
        const sameRarityBonus = first.rarity === second.rarity ? 1 : 0;
        const rarity = characterRarityAt(
            Math.max(characterRarityRank(first.rarity), characterRarityRank(second.rarity)) + sameRarityBonus,
        );
        return {
            id: `card-${sequence}`,
            definitionId: source.definition.id,
            rarity,
            stars: Math.min(5, Math.max(first.stars, second.stars) + 1),
        };
    }

    private cardView(card: CharacterCardInstance): CharacterCardView {
        const definition = characterCardDefinition(card.definitionId);
        if (!definition) throw new Error(`Unknown character definition: ${card.definitionId}`);
        return {
            ...card,
            definition,
            power: definition.basePower + card.stars * 8 + characterRarityRank(card.rarity) * 18,
        };
    }

    private itemView(stack: InventoryItemStack): InventoryItemView {
        const definition = itemDefinition(stack.definitionId);
        if (!definition) throw new Error(`Unknown item definition: ${stack.definitionId}`);
        return {
            ...stack,
            definition,
            equipped: definition.category === 'PENDANT' && this.data.equippedPendantId === definition.id,
            selected: definition.category === 'BOOSTER' && this.data.selectedBoosterId === definition.id,
        };
    }

    private itemQuantity(definitionId: string): number {
        return this.data.items.find((stack) => stack.definitionId === definitionId)?.quantity ?? 0;
    }

    private withItemQuantity(definitionId: string, quantity: number): readonly InventoryItemStack[] {
        const definition = itemDefinition(definitionId);
        if (!definition) return this.data.items;
        const bounded = Math.max(0, Math.min(definition.maxStack, Math.trunc(quantity)));
        const remaining = this.data.items.filter((stack) => stack.definitionId !== definitionId);
        return bounded > 0 ? [...remaining, { definitionId, quantity: bounded }] : remaining;
    }

    private nextAvailableSequence(): number {
        let sequence = Math.max(1, Math.trunc(this.data.nextCardSequence));
        const ids = new Set(this.data.cards.map((card) => card.id));
        while (ids.has(`card-${sequence}`)) sequence++;
        return sequence;
    }

    private persist(data: CharacterProgressionData): boolean {
        const previous = this.data;
        const saved = this.store.saveCharacterProgression(data);
        this.data = normalizeCharacterProgression(saved.data);
        if (saved.persisted) return true;

        this.store.saveCharacterProgression(previous);
        this.data = normalizeCharacterProgression(previous);
        return false;
    }

    private success(message: string): CharacterProgressionActionResult {
        return { ok: true, message, snapshot: this.snapshot() };
    }

    private failure(message: string): CharacterProgressionActionResult {
        return { ok: false, message, snapshot: this.snapshot() };
    }

    private persistenceFailure(): CharacterProgressionActionResult {
        return this.failure('Progress could not be saved. No cards, items, or currency were changed.');
    }
}
