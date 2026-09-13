import { Vec3 } from 'cc';

export interface ClassicComfortCameraPose {
    readonly position: Vec3;
    readonly euler: Vec3;
    readonly target: Vec3;
}

/**
 * V107 tuning: closer to the monopoli1 reference.
 * - stable full-board isometric overview
 * - very small camera drift during gameplay
 * - board center stays readable while still allowing light focus nudges
 */
export const CLASSIC_COMFORT_CAMERA_FOV = 33;
export const CLASSIC_COMFORT_CAMERA_NEAR = 0.1;
export const CLASSIC_COMFORT_CAMERA_FAR = 260;
export const CLASSIC_COMFORT_BOARD_HALF_EXTENT = 10.75;
export const CLASSIC_COMFORT_TARGET_BIAS = 0.18;
export const CLASSIC_COMFORT_POSITION_BIAS = 0.035;

const OVERVIEW_POSITION = Object.freeze({ x: 20.25, y: 25.6, z: 20.25 });
const OVERVIEW_EULER = Object.freeze({ x: -52, y: 45, z: 0 });
const OVERVIEW_TARGET = Object.freeze({ x: 0, y: 0.32, z: 0 });

export function classicOverviewPose(): ClassicComfortCameraPose {
    return {
        position: new Vec3(OVERVIEW_POSITION.x, OVERVIEW_POSITION.y, OVERVIEW_POSITION.z),
        euler: new Vec3(OVERVIEW_EULER.x, OVERVIEW_EULER.y, OVERVIEW_EULER.z),
        target: new Vec3(OVERVIEW_TARGET.x, OVERVIEW_TARGET.y, OVERVIEW_TARGET.z),
    };
}

export function classicDicePose(reveal = false): ClassicComfortCameraPose {
    const yShift = reveal ? -0.55 : -0.25;
    const xzShift = reveal ? -0.22 : -0.08;
    return {
        position: new Vec3(
            OVERVIEW_POSITION.x + xzShift,
            OVERVIEW_POSITION.y + yShift,
            OVERVIEW_POSITION.z + xzShift,
        ),
        euler: new Vec3(OVERVIEW_EULER.x, OVERVIEW_EULER.y, OVERVIEW_EULER.z),
        target: new Vec3(0, reveal ? 0.48 : 0.42, 0),
    };
}

export function classicTargetPose(
    target: Readonly<Vec3>,
    bias = CLASSIC_COMFORT_TARGET_BIAS,
    heightOffset = 0,
): ClassicComfortCameraPose {
    const clampedX = clamp(target.x, -CLASSIC_COMFORT_BOARD_HALF_EXTENT, CLASSIC_COMFORT_BOARD_HALF_EXTENT);
    const clampedZ = clamp(target.z, -CLASSIC_COMFORT_BOARD_HALF_EXTENT, CLASSIC_COMFORT_BOARD_HALF_EXTENT);
    const targetBias = Math.max(0.08, bias);
    const positionBias = CLASSIC_COMFORT_POSITION_BIAS * Math.min(1.0, targetBias / 0.18);
    return {
        position: new Vec3(
            OVERVIEW_POSITION.x + clampedX * positionBias,
            OVERVIEW_POSITION.y + clamp(heightOffset, -0.45, 0.25),
            OVERVIEW_POSITION.z + clampedZ * positionBias,
        ),
        euler: new Vec3(OVERVIEW_EULER.x, OVERVIEW_EULER.y, OVERVIEW_EULER.z),
        target: new Vec3(
            clampedX * targetBias,
            OVERVIEW_TARGET.y,
            clampedZ * targetBias,
        ),
    };
}

export function classicCardPose(): ClassicComfortCameraPose {
    return {
        position: new Vec3(20.05, 25.3, 20.05),
        euler: new Vec3(OVERVIEW_EULER.x, OVERVIEW_EULER.y, OVERVIEW_EULER.z),
        target: new Vec3(0, 0.42, 0),
    };
}

export function classicResultPose(): ClassicComfortCameraPose {
    return {
        position: new Vec3(20.35, 26.0, 20.35),
        euler: new Vec3(OVERVIEW_EULER.x, OVERVIEW_EULER.y, OVERVIEW_EULER.z),
        target: new Vec3(0, 0.38, 0),
    };
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}
