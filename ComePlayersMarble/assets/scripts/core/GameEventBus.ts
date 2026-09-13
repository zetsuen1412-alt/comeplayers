import { EventTarget } from 'cc';

export const GameEvents = {
    AudioCue: 'audio-cue',
    MatchChanged: 'match-changed',
    Message: 'match-message',
    PlayerMovement: 'player-movement',
    VfxCue: 'vfx-cue',
} as const;

export type GameEventName = typeof GameEvents[keyof typeof GameEvents];
export type GameEventCallback = (payload?: unknown) => void;

export class GameEventBus {
    private readonly target = new EventTarget();

    public on(event: GameEventName, callback: GameEventCallback, context?: object): void {
        this.target.on(event, callback, context);
    }

    public off(event: GameEventName, callback: GameEventCallback, context?: object): void {
        this.target.off(event, callback, context);
    }

    public emit(event: GameEventName, payload?: unknown): void {
        this.target.emit(event, payload);
    }
}
