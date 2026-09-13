import { director, Node, Quat, tween, Tween, Vec3 } from 'cc';
import type { DiceAuthorityResult } from '../network/NetworkService';
import {
    DiceSkinPreset,
    diceFaceDefinition,
    normalizeDiceFace,
} from './DicePresentationTypes';
import type { DiceFaceValue } from './DicePresentationTypes';
import { DiceVisualFactory } from './DiceVisualFactory';
import type { DiceVisualSnapshot } from './DiceVisualFactory';

const DIE_REST_HEIGHT = 1.9;
const DICE_FORWARD_REST = 0;
const NORMAL_SCALE = new Vec3(1, 1, 1);

export interface DiceControllerOptions {
    readonly host?: Node;
    readonly skinPreset?: DiceSkinPreset;
}

export interface DiceControllerSnapshot extends DiceVisualSnapshot {
    readonly faceValues: readonly [DiceFaceValue, DiceFaceValue];
    readonly destroyed: boolean;
    readonly rollCount: number;
    readonly lastTotal: number;
    readonly lastWasDouble: boolean;
    readonly lastWasPowerRoll: boolean;
}

export class DiceController {
    private readonly root = new Node('RuntimeDice');
    private readonly visuals: DiceVisualFactory;
    private readonly dice: readonly [Node, Node];
    private faceValues: [DiceFaceValue, DiceFaceValue] = [1, 1];
    private destroyed = false;
    private rollCount = 0;
    private lastTotal = 2;
    private lastWasDouble = true;
    private lastWasPowerRoll = false;

    public constructor(options: DiceControllerOptions = {}) {
        const host = options.host ?? director.getScene();
        if (!host) throw new Error('DiceController requires an active scene or an explicit host node.');

        this.visuals = new DiceVisualFactory(options.skinPreset);
        host.addChild(this.root);
        this.dice = [this.createDie('Dice-1', -1.08), this.createDie('Dice-2', 1.08)];
        this.applyFace(this.dice[0], this.faceValues[0]);
        this.applyFace(this.dice[1], this.faceValues[1]);
    }

    public async roll(result: DiceAuthorityResult, timeoutSeconds: number): Promise<void> {
        if (this.destroyed) return;
        const first = normalizeDiceFace(result.first);
        const second = normalizeDiceFace(result.second);
        this.rollCount += 1;

        const animation = Promise.all([
            this.animateDie(this.dice[0], first, 0, -1),
            this.animateDie(this.dice[1], second, 0.07, 1),
        ]).then(() => undefined);

        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<void>((resolve) => {
            timeoutHandle = setTimeout(resolve, Math.max(0, timeoutSeconds) * 1000);
        });
        await Promise.race([animation, timeout]);
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
        if (this.destroyed) return;

        for (const die of this.dice) Tween.stopAllByTarget(die);
        this.applyFace(this.dice[0], first);
        this.applyFace(this.dice[1], second);
        this.faceValues = [first, second];
        this.lastTotal = first + second;
        this.lastWasDouble = first === second;
        this.lastWasPowerRoll = this.lastWasDouble || this.lastTotal >= 10;
        await this.pulseResult(this.lastWasPowerRoll);
    }

    public setSkin(preset: DiceSkinPreset): DiceSkinPreset {
        return this.visuals.setSkin(preset);
    }

    public snapshot(): DiceControllerSnapshot {
        return {
            ...this.visuals.snapshot(),
            faceValues: [this.faceValues[0], this.faceValues[1]],
            destroyed: this.destroyed,
            rollCount: this.rollCount,
            lastTotal: this.lastTotal,
            lastWasDouble: this.lastWasDouble,
            lastWasPowerRoll: this.lastWasPowerRoll,
        };
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const die of this.dice) Tween.stopAllByTarget(die);
        if (this.root.isValid) this.root.destroy();
        this.visuals.destroy();
    }

    private createDie(name: string, x: number): Node {
        const node = this.visuals.createDie(name);
        node.setPosition(x, DIE_REST_HEIGHT, DICE_FORWARD_REST);
        this.root.addChild(node);
        return node;
    }

    private animateDie(
        node: Node,
        face: DiceFaceValue,
        delay: number,
        direction: -1 | 1,
    ): Promise<void> {
        const x = node.position.x;
        const anticipation = new Quat();
        const firstSpin = new Quat();
        const secondSpin = new Quat();
        const reboundSpin = new Quat();
        const settle = this.rotationFor(face);
        Quat.fromEuler(anticipation, direction * -18, direction * 24, direction * -12);
        Quat.fromEuler(firstSpin, 470 + face * 37, 650 - face * 13, 410 + face * 41);
        Quat.fromEuler(secondSpin, 730 - face * 17, 920 + face * 23, 610 - face * 29);
        Quat.fromEuler(reboundSpin, 22 + face * 4, direction * (38 + face * 3), direction * -16);

        node.setScale(1, 1, 1);
        return new Promise((resolve) => {
            tween(node)
                .delay(delay)
                .to(0.09, {
                    position: new Vec3(x - direction * 0.09, 1.72, 0.12),
                    scale: new Vec3(1.08, 0.76, 1.08),
                    rotation: anticipation,
                }, { easing: 'quadIn' })
                .to(0.16, {
                    position: new Vec3(x + direction * 0.24, 2.72, 0.2),
                    scale: new Vec3(0.94, 1.18, 0.94),
                    rotation: firstSpin,
                }, { easing: 'quadOut' })
                .to(0.27, {
                    position: new Vec3(x + direction * 0.72, 4.82, -0.42),
                    scale: NORMAL_SCALE,
                    rotation: secondSpin,
                }, { easing: 'sineOut' })
                .to(0.21, {
                    position: new Vec3(x + direction * 0.30, 2.02, 0.18),
                    scale: new Vec3(1.06, 0.86, 1.06),
                    rotation: firstSpin,
                }, { easing: 'quadIn' })
                .to(0.1, {
                    position: new Vec3(x - direction * 0.14, 2.52, -0.08),
                    scale: new Vec3(0.97, 1.06, 0.97),
                    rotation: reboundSpin,
                }, { easing: 'quadOut' })
                .to(0.09, {
                    position: new Vec3(x + direction * 0.04, 1.96, 0.06),
                    scale: new Vec3(1.025, 0.94, 1.025),
                    rotation: settle,
                }, { easing: 'quadIn' })
                .to(0.13, {
                    position: new Vec3(x, DIE_REST_HEIGHT, DICE_FORWARD_REST),
                    rotation: settle,
                    scale: NORMAL_SCALE,
                }, { easing: 'backOut' })
                .call(() => resolve())
                .start();
        });
    }

    private pulseResult(powerRoll: boolean): Promise<void> {
        const peak = powerRoll ? new Vec3(1.18, 1.18, 1.18) : new Vec3(1.08, 1.08, 1.08);
        return Promise.all(this.dice.map((die) => new Promise<void>((resolve) => {
            tween(die)
                .to(0.1, { scale: peak }, { easing: 'quadOut' })
                .to(0.16, { scale: NORMAL_SCALE }, { easing: 'quadInOut' })
                .call(() => resolve())
                .start();
        }))).then(() => undefined);
    }

    private applyFace(node: Node, face: DiceFaceValue): void {
        const rotation = diceFaceDefinition(face).settleEuler;
        node.setRotationFromEuler(new Vec3(rotation[0], rotation[1], rotation[2]));
        node.setPosition(node.position.x, DIE_REST_HEIGHT, DICE_FORWARD_REST);
        node.setScale(NORMAL_SCALE);
    }

    private rotationFor(face: DiceFaceValue): Quat {
        const rotation = diceFaceDefinition(face).settleEuler;
        const quaternion = new Quat();
        Quat.fromEuler(quaternion, rotation[0], rotation[1], rotation[2]);
        return quaternion;
    }
}
