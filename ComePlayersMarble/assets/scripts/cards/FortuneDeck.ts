import { FORTUNE_CARDS, FortuneCardData } from './FortuneCardData';

/** Seeded, draw-without-replacement deck. A fresh shuffle starts after every full cycle. */
export class FortuneDeck {
    private state: number;
    private drawPile: FortuneCardData[] = [];

    public constructor(seed: number = Date.now()) {
        this.state = seed | 0;
        if (this.state === 0) this.state = 0x6d2b79f5;
    }

    public draw(): FortuneCardData {
        if (this.drawPile.length === 0) this.refill();
        const card = this.drawPile.pop();
        if (!card) throw new Error('Fortune deck cannot draw from an empty card set.');
        return card;
    }

    public drawMany(count: number): readonly FortuneCardData[] {
        const target = Math.max(1, Math.min(FORTUNE_CARDS.length, Math.trunc(count)));
        const selected: FortuneCardData[] = [];
        const selectedIds = new Set<string>();
        let attempts = 0;
        while (selected.length < target && attempts < FORTUNE_CARDS.length * 3) {
            attempts++;
            const card = this.draw();
            if (selectedIds.has(card.id)) continue;
            selected.push(card);
            selectedIds.add(card.id);
        }
        if (selected.length !== target) throw new Error(`Fortune deck could not create ${target} unique choices.`);
        return selected;
    }

    public randomIndex(maxExclusive: number): number {
        if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) return 0;
        return this.nextUint() % maxExclusive;
    }

    private refill(): void {
        this.drawPile = [...FORTUNE_CARDS];
        for (let index = this.drawPile.length - 1; index > 0; index--) {
            const swapIndex = this.randomIndex(index + 1);
            const value = this.drawPile[index] as FortuneCardData;
            this.drawPile[index] = this.drawPile[swapIndex] as FortuneCardData;
            this.drawPile[swapIndex] = value;
        }
    }

    private nextUint(): number {
        let value = this.state;
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        this.state = value | 0;
        return value >>> 0;
    }
}
