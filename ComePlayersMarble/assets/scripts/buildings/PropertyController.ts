export const MAX_BUILDING_LEVEL = 4;

export interface PropertyState {
    readonly tileIndex: number;
    ownerId: string;
    buildingLevel: number;
    rentMultiplier: number;
    protected: boolean;
    protectionCharges: number;
}

export class PropertyController {
    private readonly properties = new Map<number, PropertyState>();

    public stateAt(tileIndex: number): PropertyState | undefined {
        return this.properties.get(tileIndex);
    }

    public claim(tileIndex: number, ownerId: string): PropertyState | undefined {
        if (this.properties.has(tileIndex)) return undefined;
        const state: PropertyState = {
            tileIndex,
            ownerId,
            buildingLevel: 0,
            rentMultiplier: 1,
            protected: false,
            protectionCharges: 0,
        };
        this.properties.set(tileIndex, state);
        return state;
    }

    public upgrade(tileIndex: number): PropertyState | undefined {
        const state = this.properties.get(tileIndex);
        if (!state || state.buildingLevel >= MAX_BUILDING_LEVEL) return undefined;
        state.buildingLevel++;
        return state;
    }

    public downgrade(tileIndex: number): PropertyState | undefined {
        const state = this.properties.get(tileIndex);
        if (!state || state.buildingLevel <= 0) return undefined;
        state.buildingLevel--;
        return state;
    }

    public release(tileIndex: number, ownerId?: string): PropertyState | undefined {
        const state = this.properties.get(tileIndex);
        if (!state || (ownerId !== undefined && state.ownerId !== ownerId)) return undefined;
        this.properties.delete(tileIndex);
        return state;
    }

    public transfer(tileIndex: number, ownerId: string): PropertyState | undefined {
        const state = this.properties.get(tileIndex);
        if (!state || state.protected) return undefined;
        state.ownerId = ownerId;
        return state;
    }

    public protect(tileIndex: number, charges: number): PropertyState | undefined {
        const state = this.properties.get(tileIndex);
        if (!state || charges <= 0) return undefined;
        state.protectionCharges += Math.max(1, Math.trunc(charges));
        state.protected = true;
        return state;
    }

    public consumeProtection(tileIndex: number): boolean {
        const state = this.properties.get(tileIndex);
        if (!state || !state.protected) return false;
        state.protectionCharges = Math.max(0, state.protectionCharges - 1);
        state.protected = state.protectionCharges > 0;
        return true;
    }

    public boostRentMultiplier(
        tileIndex: number,
        ownerId: string,
        step: number,
        maximum: number,
    ): PropertyState | undefined {
        const state = this.properties.get(tileIndex);
        if (!state || state.ownerId !== ownerId || step <= 0 || state.rentMultiplier >= maximum) return undefined;
        state.rentMultiplier = Math.min(maximum, Math.round((state.rentMultiplier + step) * 100) / 100);
        return state;
    }

    public synchronize(states: readonly PropertyState[]): void {
        this.properties.clear();
        for (const state of states) {
            if (!Number.isInteger(state.tileIndex) || state.tileIndex < 0 || state.tileIndex > 63) continue;
            this.properties.set(state.tileIndex, {
                tileIndex: state.tileIndex,
                ownerId: state.ownerId,
                buildingLevel: Math.max(0, Math.min(MAX_BUILDING_LEVEL, Math.trunc(state.buildingLevel))),
                rentMultiplier: Math.max(0.5, Math.min(6, state.rentMultiplier)),
                protected: state.protected,
                protectionCharges: Math.max(0, Math.trunc(state.protectionCharges)),
            });
        }
    }

    public values(): readonly PropertyState[] {
        return Array.from(this.properties.values());
    }
}
