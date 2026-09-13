export interface DiceAuthorityResult {
    readonly first: number;
    readonly second: number;
}

export type DiceControlParity = 'AUTO' | 'ODD' | 'EVEN';
export type DiceControlRange = 'LOW' | 'MID' | 'HIGH';

export interface DiceControlRequest {
    readonly parity: DiceControlParity;
    readonly range: DiceControlRange;
    /**
     * A value between 0 and 1. Dice control improves the chance of landing in the
     * selected range, but never guarantees an exact result.
     */
    readonly accuracy: number;
}

export interface NetworkService {
    requestDiceRoll(playerId: string): Promise<DiceAuthorityResult>;
    completeTurn?(playerId: string): Promise<void>;
    setDiceControl?(playerId: string, request: DiceControlRequest | null): void;
}

/** Local authority with a seedable PRNG. Visual dice never decide the result. */
export class LocalMatchNetworkService implements NetworkService {
    private state: number;
    private readonly diceControls = new Map<string, DiceControlRequest>();

    public constructor(seed: number = Date.now()) {
        this.state = seed | 0;
        if (this.state === 0) this.state = 0x6d2b79f5;
    }

    public setDiceControl(playerId: string, request: DiceControlRequest | null): void {
        if (!request) {
            this.diceControls.delete(playerId);
            return;
        }
        this.diceControls.set(playerId, {
            parity: request.parity,
            range: request.range,
            accuracy: clamp01(request.accuracy),
        });
    }

    public requestDiceRoll(playerId: string): Promise<DiceAuthorityResult> {
        const control = this.diceControls.get(playerId) ?? null;
        this.diceControls.delete(playerId);
        if (!control) return Promise.resolve(this.rollPair());

        const attempts = 3 + Math.round(control.accuracy * 5);
        let best = this.rollPair();
        let bestScore = diceControlScore(best, control);
        for (let attempt = 1; attempt < attempts; attempt++) {
            const candidate = this.rollPair();
            const candidateScore = diceControlScore(candidate, control);
            if (candidateScore > bestScore) {
                best = candidate;
                bestScore = candidateScore;
            }
            if (candidateScore >= 9 && this.random01() <= 0.55 + control.accuracy * 0.35) {
                best = candidate;
                break;
            }
        }
        return Promise.resolve(best);
    }

    private rollPair(): DiceAuthorityResult {
        return { first: this.d6(), second: this.d6() };
    }

    private d6(): number {
        let value = this.state;
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        this.state = value | 0;
        return 1 + ((value >>> 0) % 6);
    }

    private random01(): number {
        return (this.d6() - 1) / 5;
    }
}

function diceControlScore(result: Readonly<DiceAuthorityResult>, control: Readonly<DiceControlRequest>): number {
    const total = result.first + result.second;
    const parityMatches = control.parity === 'AUTO'
        || (control.parity === 'ODD' && total % 2 === 1)
        || (control.parity === 'EVEN' && total % 2 === 0);
    const rangeMatches = control.range === 'LOW'
        ? total <= 5
        : control.range === 'MID'
            ? total >= 6 && total <= 8
            : total >= 9;
    const targetCenter = control.range === 'LOW' ? 4 : control.range === 'MID' ? 7 : 10.5;
    const closeness = Math.max(0, 3 - Math.abs(total - targetCenter));
    return (parityMatches ? 4.25 : 0) + (rangeMatches ? 4 : 0) + closeness * 0.35;
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}
