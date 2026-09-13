import { BoardTileData, GAME_RULES, TileType } from '../data/BoardData';
import type { TeamId } from '../save/MatchSettingsData';

export interface WorldTravelAccount {
    money: number;
    tileIndex: number;
    freeWorldTravelCredits: number;
}

export interface WorldTravelDecision {
    readonly cost: number;
    readonly usesFreeTicket: boolean;
    readonly destinationIndices: readonly number[];
}

export interface WorldTravelResult {
    readonly destinationIndex: number;
    readonly path: readonly number[];
    readonly paid: number;
    readonly usedFreeTicket: boolean;
}

export type WorldTravelStrategicTag = 'SET_COMPLETE' | 'TOURISM_TARGET' | 'OPEN_PROPERTY' | 'OWN_CITY' | 'TEAM_SAFE' | 'RIVAL_TOLL';
export type WorldTravelReserveRisk = 'SAFE' | 'TIGHT' | 'DANGER';

export interface WorldTravelDestination {
    readonly tileIndex: number;
    readonly displayName: string;
    readonly tileType: TileType;
    readonly purchasePrice: number;
    readonly rent: number;
    readonly ownerId?: string;
    readonly ownerTeamId?: TeamId;
    readonly buildingLevel: number;
    readonly strategicTag: WorldTravelStrategicTag;
    readonly reserveAfter: number;
    readonly reserveRisk: WorldTravelReserveRisk;
    readonly completesColorMonopoly: boolean;
    readonly victoryProgress: string;
    readonly strategicScore: number;
}

export class WorldTravelService {
    public createDecision(
        account: Readonly<WorldTravelAccount>,
        board: readonly BoardTileData[],
    ): WorldTravelDecision | undefined {
        const usesFreeTicket = account.freeWorldTravelCredits > 0;
        const cost = usesFreeTicket ? 0 : GAME_RULES.worldTravelCost;
        if (account.money < cost) return undefined;

        const destinationIndices = board
            .filter((tile) => this.isValidDestination(tile) && tile.index !== account.tileIndex)
            .map((tile) => tile.index);
        if (destinationIndices.length === 0) return undefined;
        return { cost, usesFreeTicket, destinationIndices };
    }

    public confirm(
        account: WorldTravelAccount,
        decision: Readonly<WorldTravelDecision>,
        destinationIndex: number,
    ): WorldTravelResult | undefined {
        if (decision.destinationIndices.indexOf(destinationIndex) < 0) return undefined;
        if (decision.usesFreeTicket) {
            if (account.freeWorldTravelCredits <= 0) return undefined;
            account.freeWorldTravelCredits--;
        } else {
            if (account.money < decision.cost) return undefined;
            account.money -= decision.cost;
        }
        account.tileIndex = destinationIndex;
        return {
            destinationIndex,
            path: [destinationIndex],
            paid: decision.cost,
            usedFreeTicket: decision.usesFreeTicket,
        };
    }

    public isValidDestination(tile: Readonly<BoardTileData>): boolean {
        return tile.tileType === TileType.City || tile.tileType === TileType.Tourist;
    }
}
