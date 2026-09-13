import type { AuthoritativeMatchEvent } from '../network/AuthoritativeMatchProtocol';

export interface AuthoritativePresentationCue {
    readonly sequence: number;
    readonly kind: AuthoritativeMatchEvent['kind'];
    readonly actorProfileId: string;
    readonly title: string;
    readonly message: string;
    readonly tileIndex: number;
    readonly fromTileIndex: number;
    readonly toTileIndex: number;
    readonly amount: number;
    readonly diceFirst: number;
    readonly diceSecond: number;
    readonly payload: Readonly<Record<string, unknown>>;
}

export class AuthoritativeEventPresentationQueue {
    private readonly queued: AuthoritativePresentationCue[] = [];
    private readonly seenSequences = new Set<number>();
    private lastSequence = 0;

    public constructor(private readonly capacity = 48) {}

    public push(event: AuthoritativeMatchEvent): AuthoritativePresentationCue | null {
        if (event.sequence <= 0 || event.sequence <= this.lastSequence || this.seenSequences.has(event.sequence)) return null;
        this.seenSequences.add(event.sequence);
        this.lastSequence = event.sequence;
        const cue = cueFromEvent(event);
        this.queued.push(cue);
        while (this.queued.length > this.capacity) this.queued.shift();
        if (this.seenSequences.size > this.capacity * 4) {
            const floor = Math.max(0, this.lastSequence - this.capacity * 3);
            for (const sequence of Array.from(this.seenSequences)) {
                if (sequence < floor) this.seenSequences.delete(sequence);
            }
        }
        return cue;
    }

    public drain(): AuthoritativePresentationCue[] {
        return this.queued.splice(0, this.queued.length);
    }

    public clearBefore(sequence: number): void {
        const safe = Math.max(0, Math.trunc(sequence));
        for (let index = this.queued.length - 1; index >= 0; index--) {
            const cue = this.queued[index];
            if (cue && cue.sequence <= safe) this.queued.splice(index, 1);
        }
        this.lastSequence = Math.max(this.lastSequence, safe);
    }

    public snapshot(): Readonly<{ queued: number; lastSequence: number; seen: number }> {
        return { queued: this.queued.length, lastSequence: this.lastSequence, seen: this.seenSequences.size };
    }
}

export function cueFromEvent(event: AuthoritativeMatchEvent): AuthoritativePresentationCue {
    const payload = event.payload;
    const diceFirst = numberField(payload, ['first', 'diceFirst'], 0, 6);
    const diceSecond = numberField(payload, ['second', 'diceSecond'], 0, 6);
    const tileIndex = numberField(payload, ['tileIndex', 'landingTileIndex', 'targetTileIndex'], -1, 31);
    const fromTileIndex = numberField(payload, ['from', 'fromPosition', 'fromTileIndex'], -1, 31);
    const toTileIndex = numberField(payload, ['to', 'toPosition', 'toTileIndex', 'targetTileIndex', 'tileIndex'], -1, 31);
    const amount = numberField(payload, ['amount', 'paid', 'saleValue', 'reward'], -2_000_000_000, 2_000_000_000, 0);
    return {
        sequence: event.sequence,
        kind: event.kind,
        actorProfileId: event.actorProfileId,
        title: titleFor(event.kind),
        message: messageFor(event.kind, payload),
        tileIndex,
        fromTileIndex,
        toTileIndex,
        amount,
        diceFirst,
        diceSecond,
        payload,
    };
}

function titleFor(kind: AuthoritativeMatchEvent['kind']): string {
    return kind.replace(/_/g, ' ');
}

function messageFor(kind: AuthoritativeMatchEvent['kind'], payload: Readonly<Record<string, unknown>>): string {
    const explicit = textField(payload, ['message', 'title']);
    if (explicit) return explicit;
    switch (kind) {
        case 'DICE_ROLLED': return `Server dice ${numberField(payload, ['first'], 0, 6)} + ${numberField(payload, ['second'], 0, 6)}.`;
        case 'PROPERTY_PURCHASED': return 'A city was purchased by the authoritative server.';
        case 'PROPERTY_UPGRADED': return 'A city building was upgraded.';
        case 'PROPERTY_TAKEN_OVER': return 'City ownership changed after a takeover.';
        case 'RENT_PAID': return 'Rent was transferred between players.';
        case 'CHARACTER_SKILL_ACTIVATED': return 'A character active skill was resolved by the server.';
        case 'WORLD_EVENT_RESOLVED': return 'A server World Event changed the match economy.';
        case 'MATCH_FINISHED': return 'The authoritative match reached its victory condition.';
        default: return titleFor(kind);
    }
}

function numberField(
    value: Readonly<Record<string, unknown>>,
    keys: readonly string[],
    minimum: number,
    maximum: number,
    fallback = minimum,
): number {
    for (const key of keys) {
        const candidate = value[key];
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
            return Math.max(minimum, Math.min(maximum, Math.trunc(candidate)));
        }
    }
    return fallback;
}

function textField(value: Readonly<Record<string, unknown>>, keys: readonly string[]): string {
    for (const key of keys) {
        const candidate = value[key];
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 160);
    }
    return '';
}
