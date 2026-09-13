import { Node, Quat, tween, Tween, Vec3 } from 'cc';
import {
    CAMERA_IMPACT_DEFINITIONS,
    CameraImpactCue,
} from './CameraPresentationTypes';

export interface CameraShakeSnapshot {
    readonly reducedMotion: boolean;
    readonly active: boolean;
    readonly played: number;
    readonly suppressed: number;
}

const SHAKE_PATTERN: ReadonlyArray<readonly [number, number, number]> = Object.freeze([
    [-1, 0.45, 0.3],
    [0.85, -0.55, -0.2],
    [-0.65, 0.35, -0.35],
    [0.5, -0.25, 0.25],
    [-0.35, 0.2, 0.15],
    [0.2, -0.12, -0.1],
    [-0.1, 0.06, 0.05],
]);

export class CameraShakeController {
    private readonly originPosition: Vec3;
    private readonly originRotation: Quat;
    private active = false;
    private played = 0;
    private suppressed = 0;
    private destroyed = false;

    public constructor(
        private readonly target: Node,
        private reducedMotion: boolean,
    ) {
        this.originPosition = target.position.clone();
        this.originRotation = target.rotation.clone();
    }

    public play(cue: CameraImpactCue, intensity = 1): boolean {
        if (this.destroyed) return false;
        if (this.reducedMotion || intensity <= 0) {
            this.suppressed++;
            return false;
        }

        const definition = CAMERA_IMPACT_DEFINITIONS[cue];
        const safeIntensity = Math.min(1, Math.max(0, intensity));
        const segmentDuration = definition.duration / (definition.samples + 1);
        this.cancel();

        let sequence = tween(this.target);
        for (let index = 0; index < definition.samples; index++) {
            const pattern = SHAKE_PATTERN[index % SHAKE_PATTERN.length];
            if (!pattern) continue;
            const decay = 1 - (index / definition.samples);
            const horizontal = definition.amplitude * safeIntensity * decay;
            const vertical = definition.verticalAmplitude * safeIntensity * decay;
            const offset = new Vec3(
                pattern[0] * horizontal,
                pattern[1] * vertical,
                pattern[2] * horizontal,
            );
            const position = this.originPosition.clone().add(offset);
            const localRotation = new Quat();
            Quat.fromEuler(
                localRotation,
                pattern[1] * definition.rollDegrees * 0.45 * safeIntensity * decay,
                pattern[2] * definition.rollDegrees * 0.35 * safeIntensity * decay,
                pattern[0] * definition.rollDegrees * safeIntensity * decay,
            );
            const rotation = new Quat();
            Quat.multiply(rotation, this.originRotation, localRotation);
            sequence = sequence.to(
                segmentDuration,
                { position, rotation },
                { easing: 'quadInOut' },
            );
        }

        this.active = true;
        this.played++;
        sequence
            .to(
                segmentDuration,
                {
                    position: this.originPosition.clone(),
                    rotation: this.originRotation.clone(),
                },
                { easing: 'quadInOut' },
            )
            .call(() => {
                if (!this.destroyed) this.active = false;
            })
            .start();
        return true;
    }

    public setReducedMotion(reducedMotion: boolean): void {
        this.reducedMotion = reducedMotion;
        if (reducedMotion) this.cancel();
    }

    public cancel(): void {
        Tween.stopAllByTarget(this.target);
        this.target.setPosition(this.originPosition);
        this.target.setRotation(this.originRotation);
        this.active = false;
    }

    public snapshot(): CameraShakeSnapshot {
        return {
            reducedMotion: this.reducedMotion,
            active: this.active,
            played: this.played,
            suppressed: this.suppressed,
        };
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.cancel();
        this.destroyed = true;
    }
}
