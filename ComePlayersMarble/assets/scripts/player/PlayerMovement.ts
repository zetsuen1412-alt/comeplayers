import { Node, tween, Tween, Vec3 } from 'cc';
import { BoardTileData } from '../data/BoardData';

const MIN_STEP_SECONDS = 0.07;
const MAX_HOP_HEIGHT = 0.30;

export interface PlayerMovementSnapshot {
    readonly generation: number;
    readonly completedSteps: number;
    readonly cancelledRuns: number;
}

export class PlayerMovement {
    private generation = 0;
    private completedSteps = 0;
    private cancelledRuns = 0;

    public async move(
        playerNode: Node,
        path: readonly number[],
        board: readonly BoardTileData[],
        stepSeconds: number,
        onStep: (index: number) => void,
    ): Promise<void> {
        const run = ++this.generation;
        const duration = Math.max(MIN_STEP_SECONDS, stepSeconds);
        for (const index of path) {
            if (run !== this.generation || !playerNode.isValid) return;
            const tile = board[index];
            if (!tile) continue;
            const destination = tile.worldPosition.clone().add3f(0, 1, 0);
            await this.moveOneStep(playerNode, destination, duration, index === path[path.length - 1]);
            if (run !== this.generation) return;
            this.completedSteps += 1;
            onStep(index);
        }
    }

    public cancel(playerNode?: Node): void {
        this.generation++;
        this.cancelledRuns += 1;
        if (playerNode?.isValid) {
            Tween.stopAllByTarget(playerNode);
            playerNode.setScale(1, 1, 1);
        }
    }

    public snapshot(): PlayerMovementSnapshot {
        return {
            generation: this.generation,
            completedSteps: this.completedSteps,
            cancelledRuns: this.cancelledRuns,
        };
    }

    private moveOneStep(node: Node, destination: Vec3, duration: number, finalStep: boolean): Promise<void> {
        const start = node.position.clone();
        const yaw = movementYawDegrees(start, destination);
        const hopHeight = movementHopHeight(start, destination);
        const apex = new Vec3(
            (start.x + destination.x) * 0.5,
            Math.max(start.y, destination.y) + hopHeight,
            (start.z + destination.z) * 0.5,
        );
        const stretch = new Vec3(0.985, 1.025, 0.985);
        const squash = finalStep ? new Vec3(1.045, 0.94, 1.045) : new Vec3(1.018, 0.975, 1.018);
        const normal = new Vec3(1, 1, 1);

        node.setRotationFromEuler(new Vec3(0, yaw, 0));
        return new Promise((resolve) => {
            tween(node)
                .to(duration * 0.48, { position: apex, scale: stretch }, { easing: 'sineOut' })
                .to(duration * 0.46, { position: destination, scale: normal }, { easing: 'sineIn' })
                .to(duration * (finalStep ? 0.04 : 0.025), { scale: squash }, { easing: 'quadOut' })
                .to(duration * (finalStep ? 0.08 : 0.035), { scale: normal }, { easing: 'quadInOut' })
                .call(() => resolve())
                .start();
        });
    }
}

export function movementYawDegrees(from: Readonly<Vec3>, to: Readonly<Vec3>): number {
    const deltaX = to.x - from.x;
    const deltaZ = to.z - from.z;
    if (Math.abs(deltaX) < 0.0001 && Math.abs(deltaZ) < 0.0001) return 0;
    return Math.atan2(deltaX, deltaZ) * 180 / Math.PI;
}

export function movementHopHeight(from: Readonly<Vec3>, to: Readonly<Vec3>): number {
    const deltaX = to.x - from.x;
    const deltaZ = to.z - from.z;
    const distance = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
    return Math.min(MAX_HOP_HEIGHT, 0.11 + distance * 0.045);
}
