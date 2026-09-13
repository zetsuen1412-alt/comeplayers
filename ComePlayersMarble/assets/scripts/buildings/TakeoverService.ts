import { BoardTileData } from '../data/BoardData';
import { LandmarkService } from './LandmarkService';
import { PropertyController, PropertyState } from './PropertyController';

export type TakeoverBlockReason =
    | 'LANDMARK'
    | 'PROTECTED'
    | 'BUYER_BANKRUPT'
    | 'INSUFFICIENT_FUNDS'
    | 'INVALID_OWNERSHIP';

export interface TakeoverAccount {
    readonly id: string;
    money: number;
    readonly properties: number[];
    readonly bankrupt: boolean;
}

export interface TakeoverQuote {
    readonly propertyValue: number;
    readonly cost: number;
    readonly available: boolean;
    readonly blockReason?: TakeoverBlockReason;
}

export interface TakeoverResult {
    readonly tileIndex: number;
    readonly previousOwnerId: string;
    readonly ownerId: string;
    readonly cost: number;
    readonly state: PropertyState;
}

export class TakeoverService {
    private readonly landmarks = new LandmarkService();

    public constructor(private readonly properties: PropertyController) {}

    public quote(
        buyer: Readonly<TakeoverAccount>,
        tile: Readonly<BoardTileData>,
        state: Readonly<PropertyState>,
    ): TakeoverQuote {
        const propertyValue = this.propertyValue(tile, state);
        const cost = Math.max(0, Math.round(propertyValue * tile.takeoverCostMultiplier));
        let blockReason: TakeoverBlockReason | undefined;
        if (state.ownerId === buyer.id) blockReason = 'INVALID_OWNERSHIP';
        else if (this.landmarks.isLandmark(state)) blockReason = 'LANDMARK';
        else if (state.protected) blockReason = 'PROTECTED';
        else if (buyer.bankrupt) blockReason = 'BUYER_BANKRUPT';
        else if (buyer.money < cost) blockReason = 'INSUFFICIENT_FUNDS';
        return { propertyValue, cost, available: blockReason === undefined, blockReason };
    }

    public takeOver(
        buyer: TakeoverAccount,
        seller: TakeoverAccount,
        tile: Readonly<BoardTileData>,
    ): TakeoverResult | undefined {
        const state = this.properties.stateAt(tile.index);
        if (!state || state.ownerId !== seller.id || buyer.id === seller.id) return undefined;
        if (seller.properties.indexOf(tile.index) < 0 || buyer.properties.indexOf(tile.index) >= 0) return undefined;
        const quote = this.quote(buyer, tile, state);
        if (!quote.available) return undefined;

        const transferred = this.properties.transfer(tile.index, buyer.id);
        if (!transferred) return undefined;
        const sellerPropertyIndex = seller.properties.indexOf(tile.index);
        seller.properties.splice(sellerPropertyIndex, 1);
        buyer.properties.push(tile.index);
        buyer.money -= quote.cost;
        seller.money += quote.cost;
        return {
            tileIndex: tile.index,
            previousOwnerId: seller.id,
            ownerId: buyer.id,
            cost: quote.cost,
            state: transferred,
        };
    }

    private propertyValue(tile: Readonly<BoardTileData>, state: Readonly<PropertyState>): number {
        const regularLevel = Math.min(state.buildingLevel, tile.buildingCosts.length);
        const buildingValue = tile.buildingCosts
            .slice(0, regularLevel)
            .reduce((total, cost) => total + cost, 0);
        const landmarkValue = this.landmarks.isLandmark(state) ? tile.landmarkCost : 0;
        return tile.purchasePrice + buildingValue + landmarkValue;
    }
}
