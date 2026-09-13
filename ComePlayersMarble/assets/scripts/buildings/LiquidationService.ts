import { BoardTileData } from '../data/BoardData';
import { PropertyController, PropertyState } from './PropertyController';

export const LIQUIDATION_BUILDING_RECOVERY_RATE = 0.70;
export const LIQUIDATION_LAND_RECOVERY_RATE = 0.60;

export type LiquidationAssetKind = 'BUILDING' | 'PROPERTY';

export interface LiquidationAccount {
    readonly id: string;
    money: number;
    readonly properties: number[];
}

export interface LiquidationRecord {
    readonly tileIndex: number;
    readonly tileName: string;
    readonly kind: LiquidationAssetKind;
    readonly levelBefore: number;
    readonly levelAfter: number;
    readonly recovered: number;
}

export interface LiquidationSummary {
    readonly requiredCash: number;
    readonly cashBefore: number;
    readonly shortfallBefore: number;
    readonly recovered: number;
    readonly cashAfter: number;
    readonly survived: boolean;
    readonly records: readonly LiquidationRecord[];
}

export type LiquidationPreserveScore = (
    tile: Readonly<BoardTileData>,
    state: Readonly<PropertyState>,
) => number;

interface LiquidationCandidate {
    readonly tile: Readonly<BoardTileData>;
    readonly state: Readonly<PropertyState>;
    readonly preserveScore: number;
}

export class LiquidationService {
    public constructor(private readonly properties: PropertyController) {}

    public coverShortfall(
        account: LiquidationAccount,
        requiredCash: number,
        board: readonly BoardTileData[],
        preserveScore: LiquidationPreserveScore = () => 0,
    ): LiquidationSummary {
        const target = Math.max(0, Math.round(requiredCash));
        const cashBefore = Math.max(0, account.money);
        const shortfallBefore = Math.max(0, target - cashBefore);
        const records: LiquidationRecord[] = [];

        if (shortfallBefore <= 0) {
            return {
                requiredCash: target,
                cashBefore,
                shortfallBefore: 0,
                recovered: 0,
                cashAfter: account.money,
                survived: true,
                records,
            };
        }

        while (account.money < target) {
            const candidates = this.ownedCandidates(account, board, preserveScore)
                .filter((candidate) => candidate.state.buildingLevel > 0)
                .sort((left, right) => this.compareCandidates(left, right));
            const candidate = candidates[0];
            if (!candidate) break;

            const before = candidate.state.buildingLevel;
            const recovered = this.buildingRecovery(candidate.tile, before);
            const downgraded = this.properties.downgrade(candidate.tile.index);
            if (!downgraded) break;
            account.money += recovered;
            records.push({
                tileIndex: candidate.tile.index,
                tileName: candidate.tile.displayName,
                kind: 'BUILDING',
                levelBefore: before,
                levelAfter: downgraded.buildingLevel,
                recovered,
            });
        }

        if (account.money < target) {
            const candidates = this.ownedCandidates(account, board, preserveScore)
                .sort((left, right) => this.compareCandidates(left, right));
            for (const candidate of candidates) {
                if (account.money >= target) break;
                const state = this.properties.stateAt(candidate.tile.index);
                if (!state || state.ownerId !== account.id) continue;
                const recovered = Math.max(0, Math.round(candidate.tile.purchasePrice * LIQUIDATION_LAND_RECOVERY_RATE));
                const released = this.properties.release(candidate.tile.index, account.id);
                if (!released) continue;
                const propertyIndex = account.properties.indexOf(candidate.tile.index);
                if (propertyIndex >= 0) account.properties.splice(propertyIndex, 1);
                account.money += recovered;
                records.push({
                    tileIndex: candidate.tile.index,
                    tileName: candidate.tile.displayName,
                    kind: 'PROPERTY',
                    levelBefore: state.buildingLevel,
                    levelAfter: -1,
                    recovered,
                });
            }
        }

        const recovered = Math.max(0, account.money - cashBefore);
        return {
            requiredCash: target,
            cashBefore,
            shortfallBefore,
            recovered,
            cashAfter: account.money,
            survived: account.money >= target,
            records,
        };
    }

    private ownedCandidates(
        account: Readonly<LiquidationAccount>,
        board: readonly BoardTileData[],
        preserveScore: LiquidationPreserveScore,
    ): LiquidationCandidate[] {
        return account.properties.flatMap((tileIndex): LiquidationCandidate[] => {
            const tile = board[tileIndex];
            const state = this.properties.stateAt(tileIndex);
            if (!tile || !state || state.ownerId !== account.id) return [];
            return [{ tile, state, preserveScore: preserveScore(tile, state) }];
        });
    }

    private compareCandidates(left: LiquidationCandidate, right: LiquidationCandidate): number {
        if (left.preserveScore !== right.preserveScore) return left.preserveScore - right.preserveScore;
        if (left.state.buildingLevel !== right.state.buildingLevel) {
            return left.state.buildingLevel - right.state.buildingLevel;
        }
        if (left.tile.purchasePrice !== right.tile.purchasePrice) {
            return left.tile.purchasePrice - right.tile.purchasePrice;
        }
        return left.tile.index - right.tile.index;
    }

    private buildingRecovery(tile: Readonly<BoardTileData>, levelBefore: number): number {
        const sourceCost = levelBefore >= 4
            ? tile.landmarkCost
            : (tile.buildingCosts[levelBefore - 1] ?? 0);
        return Math.max(0, Math.round(sourceCost * LIQUIDATION_BUILDING_RECOVERY_RATE));
    }
}
