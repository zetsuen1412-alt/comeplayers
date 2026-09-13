import { PropertyState } from './PropertyController';
import { BoardTileData, GAME_RULES, TileType } from '../data/BoardData';
import type { MatchMode, TeamId } from '../save/MatchSettingsData';
import { ClassicVictoryProgress, ClassicVictoryService } from '../core/ClassicVictoryService';
import { COLOR_MONOPOLY_RENT_MULTIPLIER } from '../core/ColorMonopolyService';

export type TakeoverReserveRisk = 'SAFE' | 'TIGHT' | 'DANGER';

export interface TakeoverStrategyParticipant {
    readonly id: string;
    readonly teamId?: TeamId;
    readonly properties: readonly number[];
    readonly bankrupt: boolean;
    readonly money: number;
}

export interface TakeoverStrategySnapshot {
    readonly reserveAfter: number;
    readonly reserveRisk: TakeoverReserveRisk;
    readonly buyerGroupOwnedBefore: number;
    readonly buyerGroupOwnedAfter: number;
    readonly groupRequired: number;
    readonly sellerGroupOwnedBefore: number;
    readonly sellerGroupOwnedAfter: number;
    readonly completesColorMonopoly: boolean;
    readonly breaksRivalColorMonopoly: boolean;
    readonly projectedRent: number;
    readonly victoryProgressGain: number;
    readonly strategicScore: number;
    readonly tags: readonly string[];
}

/**
 * Produces the strategic forecast shown before a classic property takeover.
 * It never mutates match state and supports both solo ownership and combined
 * team ownership scopes.
 */
export class TakeoverStrategyService {
    private readonly victory: ClassicVictoryService;

    public constructor(private readonly board: readonly BoardTileData[]) {
        this.victory = new ClassicVictoryService(board);
    }

    public analyze(
        buyerId: string,
        sellerId: string,
        tile: Readonly<BoardTileData>,
        state: Readonly<PropertyState>,
        takeoverCost: number,
        participants: readonly TakeoverStrategyParticipant[],
        matchMode: MatchMode,
    ): TakeoverStrategySnapshot {
        const buyer = participants.find((entry) => entry.id === buyerId);
        const groupIndices = this.colorGroupIndices(tile);
        const buyerOwnedBefore = this.scopeOwned(buyerId, participants, matchMode);
        const sellerOwnedBefore = this.scopeOwned(sellerId, participants, matchMode);
        const buyerOwnedAfter = new Set(buyerOwnedBefore);
        const sellerOwnedAfter = new Set(sellerOwnedBefore);
        buyerOwnedAfter.add(tile.index);
        sellerOwnedAfter.delete(tile.index);

        const buyerGroupOwnedBefore = this.ownedCount(buyerOwnedBefore, groupIndices);
        const buyerGroupOwnedAfter = this.ownedCount(buyerOwnedAfter, groupIndices);
        const sellerGroupOwnedBefore = this.ownedCount(sellerOwnedBefore, groupIndices);
        const sellerGroupOwnedAfter = this.ownedCount(sellerOwnedAfter, groupIndices);
        const groupRequired = groupIndices.length;
        const completesColorMonopoly = groupRequired >= 2
            && buyerGroupOwnedBefore < groupRequired
            && buyerGroupOwnedAfter === groupRequired;
        const breaksRivalColorMonopoly = groupRequired >= 2
            && sellerGroupOwnedBefore === groupRequired
            && sellerGroupOwnedAfter < groupRequired;

        const reserveAfter = Math.max(0, (buyer?.money ?? 0) - takeoverCost);
        const reserveRisk = this.reserveRisk(reserveAfter);
        const participantsAfter = participants.map((entry): TakeoverStrategyParticipant => {
            if (entry.id === buyerId) {
                return { ...entry, properties: Array.from(new Set([...entry.properties, tile.index])) };
            }
            if (entry.id === sellerId) {
                return { ...entry, properties: entry.properties.filter((index) => index !== tile.index) };
            }
            return entry;
        });
        const buyerProgressBefore = this.victory.progressFor(buyerId, participants, matchMode);
        const buyerProgressAfter = this.victory.progressFor(buyerId, participantsAfter, matchMode);
        const victoryProgressGain = Math.max(0, this.progressRatio(buyerProgressAfter) - this.progressRatio(buyerProgressBefore));
        const baseRent = Math.max(
            0,
            Math.round((tile.rentByBuildingLevel[state.buildingLevel] ?? tile.baseRent) * state.rentMultiplier),
        );
        const projectedRent = Math.max(
            0,
            Math.round(baseRent * (completesColorMonopoly ? COLOR_MONOPOLY_RENT_MULTIPLIER : 1)),
        );
        const strategicScore = this.strategicScore({
            takeoverCost,
            projectedRent,
            completesColorMonopoly,
            breaksRivalColorMonopoly,
            victoryProgressGain,
            reserveRisk,
            tile,
        });
        const tags = this.tags({
            completesColorMonopoly,
            breaksRivalColorMonopoly,
            victoryProgressGain,
            reserveRisk,
            projectedRent,
            takeoverCost,
            tile,
        });

        return {
            reserveAfter,
            reserveRisk,
            buyerGroupOwnedBefore,
            buyerGroupOwnedAfter,
            groupRequired,
            sellerGroupOwnedBefore,
            sellerGroupOwnedAfter,
            completesColorMonopoly,
            breaksRivalColorMonopoly,
            projectedRent,
            victoryProgressGain,
            strategicScore,
            tags,
        };
    }

    private colorGroupIndices(tile: Readonly<BoardTileData>): readonly number[] {
        if (tile.tileType !== TileType.City || !tile.colorGroup.startsWith('group-')) return [];
        return this.board
            .filter((entry) => entry.tileType === TileType.City && entry.colorGroup === tile.colorGroup)
            .map((entry) => entry.index);
    }

    private scopeOwned(
        playerId: string,
        participants: readonly TakeoverStrategyParticipant[],
        matchMode: MatchMode,
    ): ReadonlySet<number> {
        const player = participants.find((entry) => entry.id === playerId);
        if (!player) return new Set<number>();
        if (matchMode !== 'TEAM' || !player.teamId) return new Set(player.properties);
        return new Set(
            participants
                .filter((entry) => entry.teamId === player.teamId && !entry.bankrupt)
                .flatMap((entry) => entry.properties),
        );
    }

    private ownedCount(owned: ReadonlySet<number>, indices: readonly number[]): number {
        return indices.filter((index) => owned.has(index)).length;
    }

    private reserveRisk(reserveAfter: number): TakeoverReserveRisk {
        if (reserveAfter >= GAME_RULES.startingMoney * 0.22) return 'SAFE';
        if (reserveAfter >= GAME_RULES.startingMoney * 0.08) return 'TIGHT';
        return 'DANGER';
    }

    private progressRatio(progress: Readonly<ClassicVictoryProgress>): number {
        const triple = progress.requiredColorGroups > 0
            ? progress.completeColorGroups / progress.requiredColorGroups
            : 0;
        const line = progress.bestLineRequired > 0
            ? progress.bestLineOwned / progress.bestLineRequired
            : 0;
        const tourism = progress.tourismRequired > 0
            ? progress.tourismOwned / progress.tourismRequired
            : 0;
        return Math.max(triple, line, tourism);
    }

    private strategicScore(input: {
        readonly takeoverCost: number;
        readonly projectedRent: number;
        readonly completesColorMonopoly: boolean;
        readonly breaksRivalColorMonopoly: boolean;
        readonly victoryProgressGain: number;
        readonly reserveRisk: TakeoverReserveRisk;
        readonly tile: Readonly<BoardTileData>;
    }): number {
        const rentEfficiency = input.takeoverCost > 0
            ? Math.min(1, input.projectedRent / input.takeoverCost)
            : 0;
        let score = rentEfficiency * 32;
        if (input.completesColorMonopoly) score += 30;
        if (input.breaksRivalColorMonopoly) score += 24;
        if (input.tile.tileType === TileType.Tourist) score += 18;
        score += Math.min(22, input.victoryProgressGain * 110);
        if (input.reserveRisk === 'TIGHT') score -= 10;
        if (input.reserveRisk === 'DANGER') score -= 28;
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    private tags(input: {
        readonly completesColorMonopoly: boolean;
        readonly breaksRivalColorMonopoly: boolean;
        readonly victoryProgressGain: number;
        readonly reserveRisk: TakeoverReserveRisk;
        readonly projectedRent: number;
        readonly takeoverCost: number;
        readonly tile: Readonly<BoardTileData>;
    }): readonly string[] {
        const tags: string[] = [];
        if (input.completesColorMonopoly) tags.push('COLOR SET COMPLETE');
        if (input.breaksRivalColorMonopoly) tags.push('RIVAL SET BROKEN');
        if (input.victoryProgressGain >= 0.20) tags.push('VICTORY PATH BOOST');
        if (input.tile.tileType === TileType.Tourist) tags.push('TOURISM CONTROL');
        if (input.projectedRent >= input.takeoverCost * 0.45) tags.push('HIGH RENT YIELD');
        tags.push(`${input.reserveRisk} RESERVE`);
        return tags.length > 0 ? tags : ['CITY CONTROL'];
    }
}
