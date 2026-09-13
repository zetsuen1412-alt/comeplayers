import { BoardTileData, TileType } from '../data/BoardData';
import { PropertyController, PropertyState } from './PropertyController';

export interface PropertyAccount {
    readonly id: string;
    money: number;
    readonly properties: number[];
}

export class PropertyPurchaseService {
    public constructor(private readonly properties: PropertyController) {}

    public purchase(account: PropertyAccount, tile: Readonly<BoardTileData>): PropertyState | undefined {
        if (!this.isPurchasable(tile) || account.money < tile.purchasePrice) return undefined;
        const state = this.properties.claim(tile.index, account.id);
        if (!state) return undefined;

        account.money -= tile.purchasePrice;
        account.properties.push(tile.index);
        return state;
    }

    public isPurchasable(tile: Readonly<BoardTileData>): boolean {
        return tile.tileType === TileType.City || tile.tileType === TileType.Tourist;
    }
}
