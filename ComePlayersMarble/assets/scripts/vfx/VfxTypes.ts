export enum VfxCue {
    DiceRoll = 'dice-roll',
    DicePower = 'dice-power',
    DoubleBonus = 'double-bonus',
    MovementStep = 'movement-step',
    LandingPulse = 'landing-pulse',
    PropertyPurchase = 'property-purchase',
    BuildingUpgrade = 'building-upgrade',
    CoinBurst = 'coin-burst',
    CardReveal = 'card-reveal',
    Travel = 'travel',
    Olympic = 'olympic',
    Celebration = 'celebration',
    LevelUp = 'level-up',
}

export enum VfxShape {
    Disc = 'DISC',
    Pillar = 'PILLAR',
    Spark = 'SPARK',
}

export interface VfxDefinition {
    readonly shape: VfxShape;
    readonly defaultColor: string;
    readonly duration: number;
    readonly startScale: number;
    readonly peakScale: number;
    readonly lift: number;
    readonly initialPoolSize: number;
    readonly maxPoolSize: number;
}

export interface VfxRequest {
    readonly cue: VfxCue;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly colorHex?: string;
    readonly count?: number;
    readonly radius?: number;
}

export const VFX_CUES: readonly VfxCue[] = Object.freeze([
    VfxCue.DiceRoll,
    VfxCue.DicePower,
    VfxCue.DoubleBonus,
    VfxCue.MovementStep,
    VfxCue.LandingPulse,
    VfxCue.PropertyPurchase,
    VfxCue.BuildingUpgrade,
    VfxCue.CoinBurst,
    VfxCue.CardReveal,
    VfxCue.Travel,
    VfxCue.Olympic,
    VfxCue.Celebration,
    VfxCue.LevelUp,
]);

export const VFX_DEFINITIONS: Readonly<Record<VfxCue, VfxDefinition>> = Object.freeze({
    [VfxCue.DiceRoll]: { shape: VfxShape.Disc, defaultColor: '#e9eef8', duration: 0.34, startScale: 0.18, peakScale: 1.25, lift: 0.16, initialPoolSize: 3, maxPoolSize: 8 },
    [VfxCue.DicePower]: { shape: VfxShape.Pillar, defaultColor: '#f5c323', duration: 0.62, startScale: 0.22, peakScale: 1.45, lift: 0.85, initialPoolSize: 2, maxPoolSize: 6 },
    [VfxCue.DoubleBonus]: { shape: VfxShape.Spark, defaultColor: '#ffe27a', duration: 0.82, startScale: 0.16, peakScale: 1.8, lift: 1.25, initialPoolSize: 4, maxPoolSize: 10 },
    [VfxCue.MovementStep]: { shape: VfxShape.Disc, defaultColor: '#1ecaff', duration: 0.24, startScale: 0.12, peakScale: 0.72, lift: 0.12, initialPoolSize: 5, maxPoolSize: 10 },
    [VfxCue.LandingPulse]: { shape: VfxShape.Disc, defaultColor: '#ffffff', duration: 0.52, startScale: 0.22, peakScale: 1.62, lift: 0.18, initialPoolSize: 3, maxPoolSize: 8 },
    [VfxCue.PropertyPurchase]: { shape: VfxShape.Pillar, defaultColor: '#f5c323', duration: 0.68, startScale: 0.18, peakScale: 1.22, lift: 1.35, initialPoolSize: 3, maxPoolSize: 8 },
    [VfxCue.BuildingUpgrade]: { shape: VfxShape.Spark, defaultColor: '#ff9b3d', duration: 0.72, startScale: 0.18, peakScale: 1.45, lift: 1.05, initialPoolSize: 3, maxPoolSize: 8 },
    [VfxCue.CoinBurst]: { shape: VfxShape.Spark, defaultColor: '#f5c323', duration: 0.66, startScale: 0.12, peakScale: 1.1, lift: 1.25, initialPoolSize: 5, maxPoolSize: 12 },
    [VfxCue.CardReveal]: { shape: VfxShape.Pillar, defaultColor: '#b562ff', duration: 0.72, startScale: 0.16, peakScale: 1.4, lift: 1.1, initialPoolSize: 2, maxPoolSize: 6 },
    [VfxCue.Travel]: { shape: VfxShape.Pillar, defaultColor: '#18d1ab', duration: 0.78, startScale: 0.16, peakScale: 1.55, lift: 1.45, initialPoolSize: 2, maxPoolSize: 6 },
    [VfxCue.Olympic]: { shape: VfxShape.Spark, defaultColor: '#ff7e37', duration: 0.76, startScale: 0.2, peakScale: 1.52, lift: 1.2, initialPoolSize: 2, maxPoolSize: 6 },
    [VfxCue.Celebration]: { shape: VfxShape.Disc, defaultColor: '#f5c323', duration: 1, startScale: 0.28, peakScale: 2.6, lift: 1.1, initialPoolSize: 4, maxPoolSize: 10 },
    [VfxCue.LevelUp]: { shape: VfxShape.Pillar, defaultColor: '#8be9ff', duration: 1.15, startScale: 0.18, peakScale: 2.1, lift: 1.8, initialPoolSize: 4, maxPoolSize: 10 },
});

export function isVfxRequest(value: unknown): value is VfxRequest {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { cue?: unknown; x?: unknown; y?: unknown; z?: unknown; colorHex?: unknown; count?: unknown; radius?: unknown };
    if (typeof candidate.cue !== 'string' || !VFX_CUES.some((cue) => cue === candidate.cue)) return false;
    if (!isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.y) || !isFiniteNumber(candidate.z)) return false;
    if (candidate.colorHex !== undefined && (typeof candidate.colorHex !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(candidate.colorHex))) return false;
    if (candidate.count !== undefined
        && (typeof candidate.count !== 'number'
            || !Number.isInteger(candidate.count)
            || candidate.count < 1
            || candidate.count > 12)) return false;
    return candidate.radius === undefined || (isFiniteNumber(candidate.radius) && candidate.radius >= 0 && candidate.radius <= 4);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}
