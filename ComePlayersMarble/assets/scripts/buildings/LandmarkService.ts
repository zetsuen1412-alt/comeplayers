import { MAX_BUILDING_LEVEL, PropertyState } from './PropertyController';

export class LandmarkService {
    public isLandmark(state: Readonly<PropertyState>): boolean {
        return state.buildingLevel === MAX_BUILDING_LEVEL;
    }

    public canTakeOver(state: Readonly<PropertyState>): boolean {
        return !this.isLandmark(state) && !state.protected;
    }
}
