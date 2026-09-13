export enum CameraState {
    BoardOverview = 'BoardOverview',
    DiceFocus = 'DiceFocus',
    PlayerFollow = 'PlayerFollow',
    TileFocus = 'TileFocus',
    PropertyFocus = 'PropertyFocus',
    CardFocus = 'CardFocus',
    ResultFocus = 'ResultFocus',
}

export enum CameraImpactCue {
    DiceLand = 'dice-land',
    PlayerLand = 'player-land',
    Property = 'property',
    CardReveal = 'card-reveal',
    Travel = 'travel',
    Hit = 'hit',
    Celebration = 'celebration',
}

export interface CameraTransitionProfile {
    readonly duration: number;
    readonly settleDuration: number;
    readonly settleDistance: number;
}

export interface CameraImpactDefinition {
    readonly amplitude: number;
    readonly verticalAmplitude: number;
    readonly duration: number;
    readonly rollDegrees: number;
    readonly samples: number;
}

export const CAMERA_STATES: readonly CameraState[] = Object.freeze([
    CameraState.BoardOverview,
    CameraState.DiceFocus,
    CameraState.PlayerFollow,
    CameraState.TileFocus,
    CameraState.PropertyFocus,
    CameraState.CardFocus,
    CameraState.ResultFocus,
]);

export const CAMERA_IMPACT_CUES: readonly CameraImpactCue[] = Object.freeze([
    CameraImpactCue.DiceLand,
    CameraImpactCue.PlayerLand,
    CameraImpactCue.Property,
    CameraImpactCue.CardReveal,
    CameraImpactCue.Travel,
    CameraImpactCue.Hit,
    CameraImpactCue.Celebration,
]);

export const CAMERA_TRANSITION_PROFILES: Readonly<Record<CameraState, CameraTransitionProfile>> = Object.freeze({
    [CameraState.BoardOverview]: { duration: 0.42, settleDuration: 0, settleDistance: 0 },
    [CameraState.DiceFocus]: { duration: 0.28, settleDuration: 0.04, settleDistance: 0.03 },
    [CameraState.PlayerFollow]: { duration: 0.32, settleDuration: 0, settleDistance: 0 },
    [CameraState.TileFocus]: { duration: 0.32, settleDuration: 0.04, settleDistance: 0.03 },
    [CameraState.PropertyFocus]: { duration: 0.34, settleDuration: 0.05, settleDistance: 0.04 },
    [CameraState.CardFocus]: { duration: 0.28, settleDuration: 0.03, settleDistance: 0.02 },
    [CameraState.ResultFocus]: { duration: 0.36, settleDuration: 0.05, settleDistance: 0.04 },
});

export const CAMERA_IMPACT_DEFINITIONS: Readonly<Record<CameraImpactCue, CameraImpactDefinition>> = Object.freeze({
    [CameraImpactCue.DiceLand]: { amplitude: 0.020, verticalAmplitude: 0.010, duration: 0.14, rollDegrees: 0.08, samples: 4 },
    [CameraImpactCue.PlayerLand]: { amplitude: 0.016, verticalAmplitude: 0.010, duration: 0.12, rollDegrees: 0.07, samples: 4 },
    [CameraImpactCue.Property]: { amplitude: 0.024, verticalAmplitude: 0.014, duration: 0.16, rollDegrees: 0.10, samples: 5 },
    [CameraImpactCue.CardReveal]: { amplitude: 0.018, verticalAmplitude: 0.012, duration: 0.15, rollDegrees: 0.08, samples: 4 },
    [CameraImpactCue.Travel]: { amplitude: 0.028, verticalAmplitude: 0.016, duration: 0.18, rollDegrees: 0.12, samples: 5 },
    [CameraImpactCue.Hit]: { amplitude: 0.034, verticalAmplitude: 0.020, duration: 0.20, rollDegrees: 0.14, samples: 6 },
    [CameraImpactCue.Celebration]: { amplitude: 0.032, verticalAmplitude: 0.018, duration: 0.22, rollDegrees: 0.14, samples: 6 },
});

export function isCameraImpactCue(value: unknown): value is CameraImpactCue {
    return typeof value === 'string' && CAMERA_IMPACT_CUES.some((cue) => cue === value);
}
