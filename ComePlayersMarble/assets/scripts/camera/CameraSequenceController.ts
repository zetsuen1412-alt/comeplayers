import { Node, Tween, tween, Vec3 } from 'cc';

export interface CameraSequenceStep {
    readonly position: Vec3;
    readonly euler: Vec3;
    readonly target?: Vec3;
    readonly duration: number;
    readonly hold?: number;
}

export interface CameraSequenceSnapshot {
    readonly reducedMotion: boolean;
    readonly playing: boolean;
    readonly queuedStepCount: number;
}

interface TweenFrameState {
    px: number;
    py: number;
    pz: number;
    tx: number;
    ty: number;
    tz: number;
}

export class CameraSequenceController {
    private finalStep: CameraSequenceStep | null = null;
    private playing = false;
    private queuedStepCount = 0;
    private destroyed = false;
    private lastLookTarget = new Vec3(0, 0, 0);
    private tweenState: TweenFrameState | null = null;

    public constructor(
        private readonly target: Node,
        private reducedMotion: boolean,
    ) {}

    public play(steps: readonly CameraSequenceStep[], immediate = false): boolean {
        if (this.destroyed || steps.length === 0) return false;
        this.cancel(false);
        const finalStep = steps[steps.length - 1];
        if (!finalStep) return false;
        this.finalStep = this.cloneStep(finalStep);
        this.queuedStepCount = steps.length;

        if (immediate || this.reducedMotion) {
            this.apply(this.finalStep);
            this.queuedStepCount = 0;
            return true;
        }

        const currentPosition = this.target.getPosition(new Vec3());
        const state: TweenFrameState = {
            px: currentPosition.x,
            py: currentPosition.y,
            pz: currentPosition.z,
            tx: this.lastLookTarget.x,
            ty: this.lastLookTarget.y,
            tz: this.lastLookTarget.z,
        };

        this.tweenState = state;
        let sequence = tween(state);
        for (const step of steps) {
            const target = step.target?.clone() ?? this.lastLookTarget.clone();
            sequence = sequence.to(
                Math.max(0.001, step.duration),
                {
                    px: step.position.x,
                    py: step.position.y,
                    pz: step.position.z,
                    tx: target.x,
                    ty: target.y,
                    tz: target.z,
                },
                {
                    easing: 'quadInOut',
                    onUpdate: (value: TweenFrameState) => this.applyState(value),
                },
            );
            const hold = Math.max(0, step.hold ?? 0);
            if (hold > 0) sequence = sequence.delay(hold);
        }

        this.playing = true;
        sequence
            .call(() => {
                if (this.destroyed) return;
                this.playing = false;
                this.queuedStepCount = 0;
                this.tweenState = null;
                if (this.finalStep) this.apply(this.finalStep);
            })
            .start();
        return true;
    }

    public setReducedMotion(reducedMotion: boolean): void {
        if (this.reducedMotion === reducedMotion) return;
        this.reducedMotion = reducedMotion;
        if (reducedMotion) this.cancel(true);
    }

    public cancel(finalize: boolean): void {
        Tween.stopAllByTarget(this.target);
        if (this.tweenState) Tween.stopAllByTarget(this.tweenState);
        this.playing = false;
        this.queuedStepCount = 0;
        if (finalize && this.finalStep) this.apply(this.finalStep);
    }

    public snapshot(): CameraSequenceSnapshot {
        return {
            reducedMotion: this.reducedMotion,
            playing: this.playing,
            queuedStepCount: this.queuedStepCount,
        };
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.cancel(false);
        this.destroyed = true;
        this.finalStep = null;
        this.tweenState = null;
    }

    private apply(step: CameraSequenceStep): void {
        this.target.setPosition(step.position);
        if (step.target) {
            this.lastLookTarget = step.target.clone();
            this.target.lookAt(step.target, Vec3.UP);
            return;
        }
        this.target.setRotationFromEuler(step.euler);
    }

    private applyState(step: TweenFrameState): void {
        this.target.setPosition(step.px, step.py, step.pz);
        this.lastLookTarget.set(step.tx, step.ty, step.tz);
        this.target.lookAt(this.lastLookTarget, Vec3.UP);
    }

    private cloneStep(step: CameraSequenceStep): CameraSequenceStep {
        return {
            position: step.position.clone(),
            euler: step.euler.clone(),
            target: step.target?.clone(),
            duration: step.duration,
            hold: step.hold,
        };
    }
}
