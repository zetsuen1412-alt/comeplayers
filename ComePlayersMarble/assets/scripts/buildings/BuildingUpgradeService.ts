import { BoardTileData } from '../data/BoardData';
import { PropertyAccount } from './PropertyPurchaseService';
import { MAX_BUILDING_LEVEL, PropertyController, PropertyState } from './PropertyController';

export const BUILDING_LEVEL_NAMES = ['Land', 'Villa', 'Building', 'Hotel', 'Landmark'] as const;

export class BuildingUpgradeService {
    public constructor(private readonly properties: PropertyController) {}

    public costFor(tile: Readonly<BoardTileData>, state: Readonly<PropertyState>): number {
        if (state.buildingLevel >= MAX_BUILDING_LEVEL) return 0;
        if (state.buildingLevel === MAX_BUILDING_LEVEL - 1) return tile.landmarkCost;
        return tile.buildingCosts[state.buildingLevel] ?? 0;
    }

    public upgrade(
        account: PropertyAccount,
        tile: Readonly<BoardTileData>,
        discount = 0,
    ): PropertyState | undefined {
        const state = this.properties.stateAt(tile.index);
        if (!state || state.ownerId !== account.id) return undefined;
        const baseCost = this.costFor(tile, state);
        if (baseCost <= 0) return undefined;
        const cost = Math.max(0, baseCost - Math.max(0, discount));
        if (account.money < cost) return undefined;

        const upgraded = this.properties.upgrade(tile.index);
        if (!upgraded) return undefined;
        account.money -= cost;
        return upgraded;
    }
}
