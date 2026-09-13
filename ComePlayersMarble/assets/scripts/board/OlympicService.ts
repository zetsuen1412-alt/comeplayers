import { PropertyController } from '../buildings/PropertyController';
import { GAME_RULES } from '../data/BoardData';

export interface OlympicDecision {
    readonly propertyIndices: readonly number[];
    readonly multiplierStep: number;
    readonly maximumMultiplier: number;
}

export interface OlympicResult {
    readonly tileIndex: number;
    readonly previousMultiplier: number;
    readonly multiplier: number;
}

export type OlympicRentThreat = 'MEDIUM' | 'HIGH' | 'EXTREME';

export interface OlympicDestination {
    readonly tileIndex: number;
    readonly currentRent: number;
    readonly projectedRent: number;
    readonly rentGain: number;
    readonly gainPercent: number;
    readonly threat: OlympicRentThreat;
    readonly currentMultiplier: number;
    readonly projectedMultiplier: number;
}

export class OlympicService {
    public createDecision(ownerId: string, properties: PropertyController): OlympicDecision | undefined {
        const propertyIndices = properties.values()
            .filter((state) => state.ownerId === ownerId && state.rentMultiplier < GAME_RULES.olympicMaxRentMultiplier)
            .map((state) => state.tileIndex);
        if (propertyIndices.length === 0) return undefined;
        return {
            propertyIndices,
            multiplierStep: GAME_RULES.olympicRentMultiplierStep,
            maximumMultiplier: GAME_RULES.olympicMaxRentMultiplier,
        };
    }

    public confirm(
        ownerId: string,
        properties: PropertyController,
        decision: Readonly<OlympicDecision>,
        tileIndex: number,
    ): OlympicResult | undefined {
        if (decision.propertyIndices.indexOf(tileIndex) < 0) return undefined;
        const current = properties.stateAt(tileIndex);
        if (!current || current.ownerId !== ownerId) return undefined;
        const previousMultiplier = current.rentMultiplier;
        const updated = properties.boostRentMultiplier(
            tileIndex,
            ownerId,
            decision.multiplierStep,
            decision.maximumMultiplier,
        );
        if (!updated) return undefined;
        return { tileIndex, previousMultiplier, multiplier: updated.rentMultiplier };
    }
}
