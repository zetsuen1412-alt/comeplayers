import type {
    AuthoritativeMatchEvent,
    AuthoritativeMatchSnapshot,
    AuthoritativeProperty,
} from '../network/AuthoritativeMatchProtocol';
import type { AuthoritativeEventHistory } from '../network/AuthoritativeReplayProtocol';
import { cueFromEvent } from './AuthoritativeEventPresentationQueue';
import type { Authoritative3DBoardPresenter } from './Authoritative3DBoardPresenter';

export type AuthoritativeReplayState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'SEEKING' | 'FINISHED' | 'STOPPED';

export interface AuthoritativeReplayStatus {
    readonly state: AuthoritativeReplayState;
    readonly index: number;
    readonly eventCount: number;
    readonly speed: number;
    readonly currentSequence: number;
    readonly progress: number;
    readonly currentCreatedAt: number;
}

const CHECKPOINT_INTERVAL = 12;

export class AuthoritativeReplayPlayer {
    private stateValue: AuthoritativeReplayState = 'IDLE';
    private index = 0;
    private speedValue = 1;
    private generation = 0;
    private historyValue: AuthoritativeEventHistory | null = null;
    private readonly checkpoints = new Map<number, AuthoritativeMatchSnapshot>();

    public constructor(
        private readonly presenter: Authoritative3DBoardPresenter,
        private readonly onFrame?: (snapshot: AuthoritativeMatchSnapshot, event: AuthoritativeMatchEvent | null) => void,
        private readonly onStatus?: (status: AuthoritativeReplayStatus) => void,
    ) {}

    public status(): AuthoritativeReplayStatus {
        const events = this.historyValue?.events ?? [];
        const eventCount = events.length;
        const current = events[Math.max(0, this.index - 1)];
        return {
            state: this.stateValue,
            index: this.index,
            eventCount,
            speed: this.speedValue,
            currentSequence: current?.sequence ?? 0,
            progress: eventCount > 0 ? this.index / eventCount : 0,
            currentCreatedAt: current?.createdAt ?? 0,
        };
    }

    public load(history: AuthoritativeEventHistory): AuthoritativeMatchSnapshot {
        this.stop();
        this.historyValue = history;
        this.index = 0;
        this.stateValue = 'IDLE';
        this.buildCheckpoints(history);
        const baseline = this.snapshotAt(0);
        this.presenter.resetForReplay(baseline);
        this.onFrame?.(baseline, null);
        this.emitStatus();
        return baseline;
    }

    public async play(): Promise<void> {
        const history = this.historyValue;
        if (!history || history.events.length === 0 || this.stateValue === 'PLAYING') return;
        if (this.index >= history.events.length) this.seekToIndex(0);
        const generation = ++this.generation;
        this.stateValue = 'PLAYING';
        this.emitStatus();
        let snapshot = this.snapshotAt(this.index);
        while (this.index < history.events.length && generation === this.generation) {
            const state = this.stateValue as AuthoritativeReplayState;
            if (state === 'PAUSED') {
                await wait(80);
                continue;
            }
            if (state === 'STOPPED' || state === 'SEEKING') return;
            const event = history.events[this.index];
            if (!event) break;
            snapshot = applyReplayEvent(snapshot, event, history.snapshot);
            this.presenter.enqueue(cueFromEvent(event), snapshot);
            this.onFrame?.(snapshot, event);
            this.index += 1;
            this.emitStatus();
            await wait(Math.max(70, Math.round(520 / this.speedValue)));
        }
        if (generation === this.generation && this.index >= history.events.length) {
            this.stateValue = 'FINISHED';
            this.presenter.synchronize(history.snapshot, '');
            this.onFrame?.(history.snapshot, null);
            this.emitStatus();
        }
    }

    public pause(): void {
        if (this.stateValue !== 'PLAYING') return;
        this.stateValue = 'PAUSED';
        this.emitStatus();
    }

    public resume(): void {
        if (this.stateValue !== 'PAUSED') return;
        this.stateValue = 'PLAYING';
        this.emitStatus();
    }

    public togglePause(): void {
        if (this.stateValue === 'PLAYING') this.pause();
        else if (this.stateValue === 'PAUSED') this.resume();
        else if (this.stateValue === 'IDLE' || this.stateValue === 'FINISHED') void this.play();
    }

    public setSpeed(speed: number): number {
        const allowed = [0.5, 1, 2, 4];
        this.speedValue = allowed.reduce((closest, candidate) => (
            Math.abs(candidate - speed) < Math.abs(closest - speed) ? candidate : closest
        ), 1);
        this.emitStatus();
        return this.speedValue;
    }

    public cycleSpeed(): number {
        const allowed = [0.5, 1, 2, 4];
        const index = allowed.indexOf(this.speedValue);
        return this.setSpeed(allowed[(index + 1) % allowed.length] ?? 1);
    }

    public seekToProgress(progress: number): AuthoritativeMatchSnapshot | null {
        const history = this.historyValue;
        if (!history) return null;
        const normalized = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
        return this.seekToIndex(Math.round(history.events.length * normalized));
    }

    public seekToIndex(targetIndex: number): AuthoritativeMatchSnapshot | null {
        const history = this.historyValue;
        if (!history) return null;
        this.generation += 1;
        this.stateValue = 'SEEKING';
        this.index = Math.max(0, Math.min(history.events.length, Math.trunc(targetIndex)));
        const snapshot = this.index >= history.events.length ? history.snapshot : this.snapshotAt(this.index);
        this.presenter.resetForReplay(snapshot);
        this.onFrame?.(snapshot, this.index > 0 ? history.events[this.index - 1] ?? null : null);
        this.stateValue = this.index >= history.events.length ? 'FINISHED' : 'PAUSED';
        this.emitStatus();
        return snapshot;
    }

    public step(delta: number): AuthoritativeMatchSnapshot | null {
        if (!this.historyValue) return null;
        if (!Number.isFinite(delta) || delta === 0) return this.snapshotAt(this.index);
        return this.seekToIndex(this.index + Math.trunc(delta));
    }

    public restart(): AuthoritativeMatchSnapshot | null {
        const history = this.historyValue;
        if (!history) return null;
        this.generation += 1;
        this.index = 0;
        this.stateValue = 'IDLE';
        const baseline = this.snapshotAt(0);
        this.presenter.resetForReplay(baseline);
        this.onFrame?.(baseline, null);
        this.emitStatus();
        return baseline;
    }

    public skipToEnd(): AuthoritativeMatchSnapshot | null {
        const history = this.historyValue;
        if (!history) return null;
        this.generation += 1;
        this.index = history.events.length;
        this.stateValue = 'FINISHED';
        this.presenter.resetForReplay(history.snapshot);
        this.onFrame?.(history.snapshot, null);
        this.emitStatus();
        return history.snapshot;
    }

    public stop(): void {
        this.generation += 1;
        this.stateValue = 'STOPPED';
        this.emitStatus();
    }

    private snapshotAt(eventCount: number): AuthoritativeMatchSnapshot {
        const history = this.historyValue;
        if (!history) throw new Error('Load replay history before requesting a snapshot.');
        const target = Math.max(0, Math.min(history.events.length, Math.trunc(eventCount)));
        const checkpointIndex = Math.floor(target / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
        let cursor = checkpointIndex;
        let snapshot = this.checkpoints.get(checkpointIndex) ?? createReplayBaseline(history);
        while (cursor < target) {
            const event = history.events[cursor];
            if (event) snapshot = applyReplayEvent(snapshot, event, history.snapshot);
            cursor += 1;
        }
        return snapshot;
    }

    private buildCheckpoints(history: AuthoritativeEventHistory): void {
        this.checkpoints.clear();
        let snapshot = createReplayBaseline(history);
        this.checkpoints.set(0, snapshot);
        for (let index = 0; index < history.events.length; index++) {
            const event = history.events[index];
            if (event) snapshot = applyReplayEvent(snapshot, event, history.snapshot);
            const count = index + 1;
            if (count % CHECKPOINT_INTERVAL === 0 || count === history.events.length) {
                this.checkpoints.set(count, snapshot);
            }
        }
    }

    private emitStatus(): void {
        this.onStatus?.(this.status());
    }
}

export function createReplayBaseline(history: AuthoritativeEventHistory): AuthoritativeMatchSnapshot {
    const matchStarted = history.events.find((event) => event.kind === 'MATCH_STARTED');
    const startingMoney = numberField(matchStarted?.payload, 'startingMoney', 2_000_000);
    const players = history.snapshot.players.map((player) => ({
        ...player,
        position: 0,
        money: startingMoney,
        bankrupt: false,
        propertyCount: 0,
        netWorth: startingMoney,
        islandTurns: 0,
        skillUsed: false,
        freeUpgradeCredits: 0,
        travelCredits: 0,
        rentShieldCharges: 0,
    }));
    return {
        ...history.snapshot,
        phase: 'ACTIVE',
        revision: 0,
        round: 1,
        currentTurnSeat: 0,
        currentTurnProfileId: players[0]?.profileId ?? '',
        awaitingEndTurn: false,
        lastDice: null,
        pendingAction: null,
        landing: null,
        specialResult: null,
        worldEvent: null,
        winnerProfileId: '',
        winnerTeamId: '',
        finishReason: '',
        lastEventSequence: 0,
        players,
        properties: [],
        updatedAt: history.events[0]?.createdAt ?? history.snapshot.updatedAt,
    };
}

export function replaySnapshotThrough(history: AuthoritativeEventHistory, eventCount: number): AuthoritativeMatchSnapshot {
    let snapshot = createReplayBaseline(history);
    const limit = Math.max(0, Math.min(history.events.length, Math.trunc(eventCount)));
    for (let index = 0; index < limit; index++) {
        const event = history.events[index];
        if (event) snapshot = applyReplayEvent(snapshot, event, history.snapshot);
    }
    return snapshot;
}

export function applyReplayEvent(
    snapshot: AuthoritativeMatchSnapshot,
    event: AuthoritativeMatchEvent,
    finalSnapshot: AuthoritativeMatchSnapshot,
): AuthoritativeMatchSnapshot {
    let players = snapshot.players.map((player) => ({ ...player }));
    let properties = snapshot.properties.map((property) => ({ ...property }));
    let round = snapshot.round;
    let currentTurnSeat = snapshot.currentTurnSeat;
    let currentTurnProfileId = snapshot.currentTurnProfileId;
    let phase = snapshot.phase;
    let winnerProfileId = snapshot.winnerProfileId;
    let winnerTeamId = snapshot.winnerTeamId;
    let finishReason = snapshot.finishReason;
    let lastDice = snapshot.lastDice;
    let awaitingEndTurn = snapshot.awaitingEndTurn;
    const actorIndex = players.findIndex((player) => player.profileId === event.actorProfileId);
    const actor = actorIndex >= 0 ? players[actorIndex] : undefined;

    if (event.kind === 'MATCH_STARTED') {
        phase = 'ACTIVE';
        currentTurnSeat = 0;
        currentTurnProfileId = players[0]?.profileId ?? '';
    } else if (event.kind === 'DICE_ROLLED') {
        const first = numberField(event.payload, 'first', 0);
        const second = numberField(event.payload, 'second', 0);
        const to = numberField(event.payload, 'to', actor?.position ?? 0);
        const salary = numberField(event.payload, 'salary', event.payload.passedStart === true ? 200_000 : 0);
        lastDice = { first, second, total: first + second, isDouble: first === second };
        awaitingEndTurn = true;
        if (actor && actorIndex >= 0) players[actorIndex] = { ...actor, position: to, money: actor.money + salary };
    } else if (event.kind === 'WORLD_TRAVEL_COMPLETED') {
        const to = numberField(event.payload, 'to', numberField(event.payload, 'targetTileIndex', actor?.position ?? 0));
        if (actor && actorIndex >= 0) players[actorIndex] = { ...actor, position: to };
    } else if (event.kind === 'PROPERTY_PURCHASED' || event.kind === 'PROPERTY_UPGRADED' || event.kind === 'PROPERTY_TAKEN_OVER' || event.kind === 'OLYMPIC_APPLIED') {
        const tileIndex = numberField(event.payload, 'tileIndex', -1);
        const authoritative = finalSnapshot.properties.find((property) => property.tileIndex === tileIndex);
        if (authoritative) properties = upsertProperty(properties, authoritative);
    } else if (event.kind === 'ASSET_LIQUIDATED') {
        const tileIndex = numberField(event.payload, 'tileIndex', -1);
        properties = properties.filter((property) => property.tileIndex !== tileIndex);
        const saleValue = numberField(event.payload, 'saleValue', 0);
        if (actor && actorIndex >= 0) players[actorIndex] = { ...actor, money: actor.money + saleValue };
    } else if (event.kind === 'RENT_PAID') {
        const paid = numberField(event.payload, 'amountPaid', 0);
        const ownerProfileId = textField(event.payload, 'ownerProfileId');
        if (actor && actorIndex >= 0) players[actorIndex] = { ...actor, money: Math.max(0, actor.money - paid) };
        const ownerIndex = players.findIndex((player) => player.profileId === ownerProfileId);
        const owner = ownerIndex >= 0 ? players[ownerIndex] : undefined;
        if (owner && ownerIndex >= 0) players[ownerIndex] = { ...owner, money: owner.money + paid };
    } else if (event.kind === 'PLAYER_BANKRUPT') {
        if (actor && actorIndex >= 0) players[actorIndex] = { ...actor, bankrupt: true, money: 0 };
    } else if (event.kind === 'TURN_ENDED') {
        round = numberField(event.payload, 'round', round);
        currentTurnSeat = numberField(event.payload, 'nextSeat', currentTurnSeat);
        currentTurnProfileId = players.find((player) => player.seat === currentTurnSeat)?.profileId ?? currentTurnProfileId;
        awaitingEndTurn = false;
    } else if (event.kind === 'MATCH_FINISHED') {
        phase = 'FINISHED';
        winnerProfileId = textField(event.payload, 'winnerProfileId') || finalSnapshot.winnerProfileId;
        const team = textField(event.payload, 'winnerTeamId');
        winnerTeamId = team === 'BLUE' || team === 'GOLD' ? team : finalSnapshot.winnerTeamId;
        finishReason = textField(event.payload, 'finishReason') || finalSnapshot.finishReason;
    }

    players = players.map((player) => {
        const propertyCount = properties.filter((property) => property.ownerProfileId === player.profileId).length;
        return { ...player, propertyCount, netWorth: player.money + properties.filter((property) => property.ownerProfileId === player.profileId).reduce((sum, property) => sum + property.propertyValue, 0) };
    });

    return {
        ...snapshot,
        phase,
        revision: Math.max(snapshot.revision, event.sequence),
        round,
        currentTurnSeat,
        currentTurnProfileId,
        awaitingEndTurn,
        lastDice,
        winnerProfileId,
        winnerTeamId,
        finishReason,
        lastEventSequence: event.sequence,
        players,
        properties,
        updatedAt: event.createdAt,
    };
}

function upsertProperty(properties: readonly AuthoritativeProperty[], value: AuthoritativeProperty): AuthoritativeProperty[] {
    return [...properties.filter((property) => property.tileIndex !== value.tileIndex), { ...value }]
        .sort((left, right) => left.tileIndex - right.tileIndex);
}

function numberField(payload: Readonly<Record<string, unknown>> | undefined, key: string, fallback: number): number {
    const value = payload?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function textField(payload: Readonly<Record<string, unknown>>, key: string): string {
    const value = payload[key];
    return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
}
