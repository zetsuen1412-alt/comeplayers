export enum PlayerAnimationState {
    Idle = 'Idle',
    Ready = 'Ready',
    RollDice = 'RollDice',
    Run = 'Run',
    Walk = 'Walk',
    Jump = 'Jump',
    Land = 'Land',
    Celebrate = 'Celebrate',
    Sad = 'Sad',
    Hit = 'Hit',
    Teleport = 'Teleport',
    IslandIdle = 'IslandIdle',
}

export enum ProceduralMotionProfile {
    Breathe = 'BREATHE',
    ReadyBounce = 'READY_BOUNCE',
    DiceAnticipation = 'DICE_ANTICIPATION',
    RunBounce = 'RUN_BOUNCE',
    WalkBounce = 'WALK_BOUNCE',
    JumpArc = 'JUMP_ARC',
    LandingSquash = 'LANDING_SQUASH',
    CelebrationBounce = 'CELEBRATION_BOUNCE',
    SadSlouch = 'SAD_SLOUCH',
    HitRecoil = 'HIT_RECOIL',
    TeleportStretch = 'TELEPORT_STRETCH',
    IslandFloat = 'ISLAND_FLOAT',
}

export interface PlayerAnimationDefinition {
    readonly loop: boolean;
    readonly fallbackDuration: number;
    readonly motion: ProceduralMotionProfile;
    readonly clipAliases: readonly string[];
}

export const PLAYER_ANIMATION_STATES: readonly PlayerAnimationState[] = Object.freeze([
    PlayerAnimationState.Idle,
    PlayerAnimationState.Ready,
    PlayerAnimationState.RollDice,
    PlayerAnimationState.Run,
    PlayerAnimationState.Walk,
    PlayerAnimationState.Jump,
    PlayerAnimationState.Land,
    PlayerAnimationState.Celebrate,
    PlayerAnimationState.Sad,
    PlayerAnimationState.Hit,
    PlayerAnimationState.Teleport,
    PlayerAnimationState.IslandIdle,
]);

export const PLAYER_ANIMATION_DEFINITIONS: Readonly<Record<PlayerAnimationState, PlayerAnimationDefinition>> = Object.freeze({
    [PlayerAnimationState.Idle]: {
        loop: true,
        fallbackDuration: 1.4,
        motion: ProceduralMotionProfile.Breathe,
        clipAliases: ['idle', 'stand'],
    },
    [PlayerAnimationState.Ready]: {
        loop: true,
        fallbackDuration: 0.8,
        motion: ProceduralMotionProfile.ReadyBounce,
        clipAliases: ['ready', 'battleidle'],
    },
    [PlayerAnimationState.RollDice]: {
        loop: false,
        fallbackDuration: 0.42,
        motion: ProceduralMotionProfile.DiceAnticipation,
        clipAliases: ['rolldice', 'diceroll', 'throwdice'],
    },
    [PlayerAnimationState.Run]: {
        loop: true,
        fallbackDuration: 0.12,
        motion: ProceduralMotionProfile.RunBounce,
        clipAliases: ['run', 'running'],
    },
    [PlayerAnimationState.Walk]: {
        loop: true,
        fallbackDuration: 0.18,
        motion: ProceduralMotionProfile.WalkBounce,
        clipAliases: ['walk', 'walking'],
    },
    [PlayerAnimationState.Jump]: {
        loop: false,
        fallbackDuration: 0.42,
        motion: ProceduralMotionProfile.JumpArc,
        clipAliases: ['jump'],
    },
    [PlayerAnimationState.Land]: {
        loop: false,
        fallbackDuration: 0.24,
        motion: ProceduralMotionProfile.LandingSquash,
        clipAliases: ['land', 'landing'],
    },
    [PlayerAnimationState.Celebrate]: {
        loop: true,
        fallbackDuration: 0.48,
        motion: ProceduralMotionProfile.CelebrationBounce,
        clipAliases: ['celebrate', 'victory', 'win'],
    },
    [PlayerAnimationState.Sad]: {
        loop: true,
        fallbackDuration: 1.1,
        motion: ProceduralMotionProfile.SadSlouch,
        clipAliases: ['sad', 'lose', 'defeat'],
    },
    [PlayerAnimationState.Hit]: {
        loop: false,
        fallbackDuration: 0.28,
        motion: ProceduralMotionProfile.HitRecoil,
        clipAliases: ['hit', 'damage', 'hurt'],
    },
    [PlayerAnimationState.Teleport]: {
        loop: false,
        fallbackDuration: 0.44,
        motion: ProceduralMotionProfile.TeleportStretch,
        clipAliases: ['teleport', 'warp', 'travel'],
    },
    [PlayerAnimationState.IslandIdle]: {
        loop: true,
        fallbackDuration: 1.5,
        motion: ProceduralMotionProfile.IslandFloat,
        clipAliases: ['islandidle', 'island', 'trappedidle'],
    },
});

export function resolvePlayerAnimationClipName(clipName: string): PlayerAnimationState | undefined {
    const normalizedName = normalizeClipName(clipName);
    if (!normalizedName) return undefined;
    let bestMatch: PlayerAnimationState | undefined;
    let bestAliasLength = 0;
    for (const state of PLAYER_ANIMATION_STATES) {
        const definition = PLAYER_ANIMATION_DEFINITIONS[state];
        const aliases = [state, ...definition.clipAliases];
        for (const alias of aliases) {
            const normalizedAlias = normalizeClipName(alias);
            if (normalizedAlias.length > bestAliasLength && normalizedName.endsWith(normalizedAlias)) {
                bestMatch = state;
                bestAliasLength = normalizedAlias.length;
            }
        }
    }
    return bestMatch;
}

export function isPlayerAnimationState(value: unknown): value is PlayerAnimationState {
    return typeof value === 'string'
        && PLAYER_ANIMATION_STATES.some((state) => state === value);
}

function normalizeClipName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
