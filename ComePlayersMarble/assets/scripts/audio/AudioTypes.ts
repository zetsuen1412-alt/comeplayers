export enum AudioCategory {
    Music = 'Music',
    UI = 'UI',
    Dice = 'Dice',
    Movement = 'Movement',
    Property = 'Property',
    Card = 'Card',
    Celebration = 'Celebration',
    Ambience = 'Ambience',
}

export enum AudioCue {
    MatchMusic = 'match-music',
    BoardAmbience = 'board-ambience',
    UIConfirm = 'ui-confirm',
    UICancel = 'ui-cancel',
    TurnStart = 'turn-start',
    DiceRoll = 'dice-roll',
    DiceLand = 'dice-land',
    DoubleBonus = 'double-bonus',
    MovementStep = 'movement-step',
    PlayerLand = 'player-land',
    PropertyPurchase = 'property-purchase',
    BuildingUpgrade = 'building-upgrade',
    PropertyBuild = 'property-build',
    PropertyPayment = 'property-payment',
    CardReveal = 'card-reveal',
    CardResolve = 'card-resolve',
    Travel = 'travel',
    GameCenterWin = 'game-center-win',
    LevelUp = 'level-up',
    MatchWin = 'match-win',
}

export interface AudioCueDefinition {
    readonly category: AudioCategory;
    readonly baseGain: number;
    readonly cooldownMs: number;
    readonly loop: boolean;
}

export interface AudioCueRequest {
    readonly cue: AudioCue;
    readonly volumeScale?: number;
}

export const AUDIO_CATEGORIES: readonly AudioCategory[] = Object.freeze([
    AudioCategory.Music,
    AudioCategory.UI,
    AudioCategory.Dice,
    AudioCategory.Movement,
    AudioCategory.Property,
    AudioCategory.Card,
    AudioCategory.Celebration,
    AudioCategory.Ambience,
]);

export const AUDIO_CUES: readonly AudioCue[] = Object.freeze([
    AudioCue.MatchMusic,
    AudioCue.BoardAmbience,
    AudioCue.UIConfirm,
    AudioCue.UICancel,
    AudioCue.TurnStart,
    AudioCue.DiceRoll,
    AudioCue.DiceLand,
    AudioCue.DoubleBonus,
    AudioCue.MovementStep,
    AudioCue.PlayerLand,
    AudioCue.PropertyPurchase,
    AudioCue.BuildingUpgrade,
    AudioCue.PropertyBuild,
    AudioCue.PropertyPayment,
    AudioCue.CardReveal,
    AudioCue.CardResolve,
    AudioCue.Travel,
    AudioCue.GameCenterWin,
    AudioCue.LevelUp,
    AudioCue.MatchWin,
]);

export const AUDIO_CUE_DEFINITIONS: Readonly<Record<AudioCue, AudioCueDefinition>> = Object.freeze({
    [AudioCue.MatchMusic]: { category: AudioCategory.Music, baseGain: 0.38, cooldownMs: 0, loop: true },
    [AudioCue.BoardAmbience]: { category: AudioCategory.Ambience, baseGain: 0.26, cooldownMs: 0, loop: true },
    [AudioCue.UIConfirm]: { category: AudioCategory.UI, baseGain: 0.72, cooldownMs: 45, loop: false },
    [AudioCue.UICancel]: { category: AudioCategory.UI, baseGain: 0.62, cooldownMs: 45, loop: false },
    [AudioCue.TurnStart]: { category: AudioCategory.UI, baseGain: 0.68, cooldownMs: 500, loop: false },
    [AudioCue.DiceRoll]: { category: AudioCategory.Dice, baseGain: 0.82, cooldownMs: 180, loop: false },
    [AudioCue.DiceLand]: { category: AudioCategory.Dice, baseGain: 0.78, cooldownMs: 120, loop: false },
    [AudioCue.DoubleBonus]: { category: AudioCategory.Celebration, baseGain: 0.88, cooldownMs: 350, loop: false },
    [AudioCue.MovementStep]: { category: AudioCategory.Movement, baseGain: 0.42, cooldownMs: 55, loop: false },
    [AudioCue.PlayerLand]: { category: AudioCategory.Movement, baseGain: 0.58, cooldownMs: 100, loop: false },
    [AudioCue.PropertyPurchase]: { category: AudioCategory.Property, baseGain: 0.82, cooldownMs: 150, loop: false },
    [AudioCue.BuildingUpgrade]: { category: AudioCategory.Property, baseGain: 0.84, cooldownMs: 150, loop: false },
    [AudioCue.PropertyBuild]: { category: AudioCategory.Property, baseGain: 0.78, cooldownMs: 120, loop: false },
    [AudioCue.PropertyPayment]: { category: AudioCategory.Property, baseGain: 0.68, cooldownMs: 120, loop: false },
    [AudioCue.CardReveal]: { category: AudioCategory.Card, baseGain: 0.75, cooldownMs: 250, loop: false },
    [AudioCue.CardResolve]: { category: AudioCategory.Card, baseGain: 0.66, cooldownMs: 180, loop: false },
    [AudioCue.Travel]: { category: AudioCategory.Movement, baseGain: 0.72, cooldownMs: 220, loop: false },
    [AudioCue.GameCenterWin]: { category: AudioCategory.Celebration, baseGain: 0.86, cooldownMs: 400, loop: false },
    [AudioCue.LevelUp]: { category: AudioCategory.Celebration, baseGain: 0.92, cooldownMs: 600, loop: false },
    [AudioCue.MatchWin]: { category: AudioCategory.Celebration, baseGain: 0.95, cooldownMs: 800, loop: false },
});

export function isAudioCueRequest(value: unknown): value is AudioCueRequest {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { cue?: unknown; volumeScale?: unknown };
    if (typeof candidate.cue !== 'string' || !AUDIO_CUES.some((cue) => cue === candidate.cue)) return false;
    return candidate.volumeScale === undefined
        || (typeof candidate.volumeScale === 'number' && Number.isFinite(candidate.volumeScale));
}

export function cueFromClipName(name: string): AudioCue | undefined {
    const normalized = name.trim().toLowerCase().replace(/[_\s]+/g, '-');
    return AUDIO_CUES.find((cue) => cue === normalized);
}
