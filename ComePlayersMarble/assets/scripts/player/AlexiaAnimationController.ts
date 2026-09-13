import {
    _decorator,
    AnimationClip,
    Component,
    Node,
    SkeletalAnimation,
    tween,
    Tween,
    Vec3,
} from 'cc';
import {
    PLAYER_ANIMATION_DEFINITIONS,
    PlayerAnimationState,
    ProceduralMotionProfile,
    resolvePlayerAnimationClipName,
} from './PlayerAnimationTypes';

const { ccclass, property } = _decorator;

export type PlayerAnimationSource = 'AUTHORED' | 'PROCEDURAL' | 'NONE';

export interface PlayerAnimationSnapshot {
    readonly currentState: PlayerAnimationState;
    readonly source: PlayerAnimationSource;
    readonly authoredStateCount: number;
    readonly proceduralFallbackEnabled: boolean;
}

@ccclass('AlexiaAnimationController')
export class AlexiaAnimationController extends Component {
    @property({ type: Node, tooltip: 'Animated visual root. The movement rig must remain a separate parent.' })
    public visualRoot: Node | null = null;

    @property({ type: SkeletalAnimation, tooltip: 'Final Alexia model SkeletalAnimation; discovered automatically when empty.' })
    public skeletalAnimation: SkeletalAnimation | null = null;

    @property({ type: [AnimationClip], tooltip: 'Clips named after their states, such as Alexia_Idle or Alexia_RollDice.' })
    public animationClips: AnimationClip[] = [];

    @property({ range: [0, 0.6, 0.02], slide: true, tooltip: 'Durasi cross-fade antar clip final.' })
    public crossFadeSeconds = 0.18;

    @property({ tooltip: 'Use lightweight transform motion while final clips are unavailable.' })
    public proceduralFallback = true;

    private readonly authoredStates = new Set<PlayerAnimationState>();
    private currentState = PlayerAnimationState.Idle;
    private source: PlayerAnimationSource = 'NONE';
    private basePosition = new Vec3();
    private baseScale = new Vec3(1, 1, 1);
    private configured = false;

    protected override onLoad(): void {
        this.configure(this.visualRoot ?? this.node, this.animationClips);
    }

    protected override onDestroy(): void {
        this.stopCurrentVisualTween();
        this.skeletalAnimation?.stop();
        this.authoredStates.clear();
        this.configured = false;
    }

    public configure(visualRoot: Node, additionalClips: readonly AnimationClip[] = []): void {
        this.stopCurrentVisualTween();
        this.visualRoot = visualRoot;
        this.basePosition.set(visualRoot.position);
        this.baseScale.set(visualRoot.scale);
        this.skeletalAnimation = this.skeletalAnimation
            ?? visualRoot.getComponentInChildren(SkeletalAnimation)
            ?? null;
        this.authoredStates.clear();

        const uniqueClips = Array.from(new Set<AnimationClip>([
            ...this.animationClips,
            ...additionalClips,
        ]));
        if (this.skeletalAnimation) {
            for (const clip of uniqueClips) {
                const state = resolvePlayerAnimationClipName(clip.name);
                if (!state) continue;
                this.skeletalAnimation.addClip(clip, state);
                this.authoredStates.add(state);
            }
        }

        this.configured = true;
        this.play(this.currentState);
    }

    public play(state: PlayerAnimationState): PlayerAnimationSource {
        if (!this.configured) this.configure(this.visualRoot ?? this.node, this.animationClips);
        this.currentState = state;
        this.resetVisual();

        const definition = PLAYER_ANIMATION_DEFINITIONS[state];
        const animation = this.skeletalAnimation;
        if (animation && this.authoredStates.has(state)) {
            const animationState = animation.getState(state);
            animationState.wrapMode = definition.loop
                ? AnimationClip.WrapMode.Loop
                : AnimationClip.WrapMode.Normal;
            animation.crossFade(state, this.safeCrossFade());
            this.source = 'AUTHORED';
            return this.source;
        }

        animation?.stop();
        if (this.proceduralFallback && this.visualRoot?.isValid) {
            this.playProcedural(definition.motion);
            this.source = 'PROCEDURAL';
            return this.source;
        }

        this.source = 'NONE';
        return this.source;
    }

    public snapshot(): PlayerAnimationSnapshot {
        return {
            currentState: this.currentState,
            source: this.source,
            authoredStateCount: this.authoredStates.size,
            proceduralFallbackEnabled: this.proceduralFallback,
        };
    }

    private playProcedural(profile: ProceduralMotionProfile): void {
        const target = this.visualRoot;
        if (!target) return;
        const basePosition = this.basePosition.clone();
        const baseScale = this.baseScale.clone();
        const position = (y: number, x = 0): Vec3 => basePosition.clone().add3f(x, y, 0);
        const scale = (x: number, y: number, z: number): Vec3 => new Vec3(
            baseScale.x * x,
            baseScale.y * y,
            baseScale.z * z,
        );

        switch (profile) {
            case ProceduralMotionProfile.Breathe:
                tween(target).repeatForever(
                    tween<Node>()
                        .to(0.7, { scale: scale(1.02, 1.05, 1.02) }, { easing: 'sineInOut' })
                        .to(0.7, { scale: baseScale }, { easing: 'sineInOut' }),
                ).start();
                break;
            case ProceduralMotionProfile.ReadyBounce:
                tween(target).repeatForever(
                    tween<Node>()
                        .to(0.38, { position: position(0.08), scale: scale(1.04, 0.98, 1.04) }, { easing: 'sineOut' })
                        .to(0.38, { position: basePosition, scale: baseScale }, { easing: 'sineIn' }),
                ).start();
                break;
            case ProceduralMotionProfile.DiceAnticipation:
                tween(target)
                    .to(0.1, { position: position(-0.08), scale: scale(1.12, 0.82, 1.12) }, { easing: 'quadIn' })
                    .to(0.16, { position: position(0.28), scale: scale(0.9, 1.18, 0.9) }, { easing: 'quadOut' })
                    .to(0.16, { position: basePosition, scale: baseScale }, { easing: 'bounceOut' })
                    .start();
                break;
            case ProceduralMotionProfile.RunBounce:
                tween(target).repeatForever(
                    tween<Node>()
                        .to(0.06, { position: position(0.2), scale: scale(0.96, 1.06, 0.96) }, { easing: 'quadOut' })
                        .to(0.06, { position: basePosition, scale: baseScale }, { easing: 'quadIn' }),
                ).start();
                break;
            case ProceduralMotionProfile.WalkBounce:
                tween(target).repeatForever(
                    tween<Node>()
                        .to(0.09, { position: position(0.12), scale: scale(0.98, 1.03, 0.98) }, { easing: 'sineOut' })
                        .to(0.09, { position: basePosition, scale: baseScale }, { easing: 'sineIn' }),
                ).start();
                break;
            case ProceduralMotionProfile.JumpArc:
                tween(target)
                    .to(0.18, { position: position(0.58), scale: scale(0.94, 1.08, 0.94) }, { easing: 'quadOut' })
                    .to(0.24, { position: basePosition, scale: baseScale }, { easing: 'bounceOut' })
                    .start();
                break;
            case ProceduralMotionProfile.LandingSquash:
                tween(target)
                    .to(0.08, { position: position(-0.08), scale: scale(1.16, 0.72, 1.16) }, { easing: 'quadIn' })
                    .to(0.16, { position: basePosition, scale: baseScale }, { easing: 'backOut' })
                    .start();
                break;
            case ProceduralMotionProfile.CelebrationBounce:
                tween(target).repeatForever(
                    tween<Node>()
                        .to(0.2, { position: position(0.5), scale: scale(1.08, 1.08, 1.08) }, { easing: 'quadOut' })
                        .to(0.24, { position: basePosition, scale: baseScale }, { easing: 'bounceOut' }),
                ).start();
                break;
            case ProceduralMotionProfile.SadSlouch:
                tween(target).repeatForever(
                    tween<Node>()
                        .to(0.55, { position: position(-0.05), scale: scale(1.04, 0.88, 1.04) }, { easing: 'sineInOut' })
                        .to(0.55, { position: basePosition, scale: scale(1.02, 0.92, 1.02) }, { easing: 'sineInOut' }),
                ).start();
                break;
            case ProceduralMotionProfile.HitRecoil:
                tween(target)
                    .to(0.08, { position: position(0, -0.16), scale: scale(0.88, 0.9, 1.08) }, { easing: 'quadOut' })
                    .to(0.2, { position: basePosition, scale: baseScale }, { easing: 'backOut' })
                    .start();
                break;
            case ProceduralMotionProfile.TeleportStretch:
                tween(target)
                    .to(0.14, { position: position(0.3), scale: scale(0.42, 1.55, 0.42) }, { easing: 'quadIn' })
                    .to(0.1, { position: position(0.42), scale: scale(0.06, 0.06, 0.06) }, { easing: 'quadIn' })
                    .to(0.2, { position: basePosition, scale: baseScale }, { easing: 'backOut' })
                    .start();
                break;
            case ProceduralMotionProfile.IslandFloat:
                tween(target).repeatForever(
                    tween<Node>()
                        .to(0.75, { position: position(0.1), scale: scale(1.06, 0.94, 1.06) }, { easing: 'sineInOut' })
                        .to(0.75, { position: basePosition, scale: baseScale }, { easing: 'sineInOut' }),
                ).start();
                break;
        }
    }

    private resetVisual(): void {
        this.stopCurrentVisualTween();
        const target = this.visualRoot;
        if (!target?.isValid) return;
        target.setPosition(this.basePosition);
        target.setScale(this.baseScale);
    }

    private stopCurrentVisualTween(): void {
        if (this.visualRoot?.isValid) Tween.stopAllByTarget(this.visualRoot);
    }

    private safeCrossFade(): number {
        if (!Number.isFinite(this.crossFadeSeconds)) return 0.18;
        return Math.max(0, Math.min(this.crossFadeSeconds, 0.6));
    }
}
