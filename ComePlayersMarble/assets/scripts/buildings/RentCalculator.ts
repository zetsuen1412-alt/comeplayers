import { BoardTileData } from '../data/BoardData';
import { PropertyState } from './PropertyController';

export class RentCalculator {
    public calculate(tile: Readonly<BoardTileData>, state: Readonly<PropertyState>): number {
        const configuredRent = tile.rentByBuildingLevel[state.buildingLevel] ?? tile.baseRent;
        return Math.max(0, Math.round(configuredRent * state.rentMultiplier));
    }
}
