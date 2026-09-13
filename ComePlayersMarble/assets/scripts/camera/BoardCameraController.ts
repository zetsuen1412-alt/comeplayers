import { Camera, Color, director, Node, Quat, Vec3 } from 'cc';
import {
    CAMERA_TRANSITION_PROFILES,
    CameraImpactCue,
    CameraState,
} from './CameraPresentationTypes';
import {
    CLASSIC_COMFORT_CAMERA_FAR,
    CLASSIC_COMFORT_CAMERA_FOV,
    CLASSIC_COMFORT_CAMERA_NEAR,
    classicCardPose,
    classicDicePose,
    classicOverviewPose,
    classicResultPose,
    classicTargetPose,
} from './ClassicComfortCameraPreset';
import { CameraSequenceController, CameraSequenceStep } from './CameraSequenceController';
import { CameraShakeController } from './CameraShakeController';

export { CameraImpactCue, CameraState } from './CameraPresentationTypes';

export interface CameraPresentationSnapshot {
    readonly state: CameraState;
    readonly reducedMotion: boolean;
    readonly sequencePlaying: boolean;
    readonly impactActive: boolean;
    readonly impactsPlayed: number;
    readonly impactsSuppressed: number;
}

/**
 * Stable isometric board camera inspired by the classic PC marble client.
 * The full board remains readable during normal turns; event shots use only
 * a small target bias instead of close zooms or per-tile tracking.
 * V105 video-reference tuning keeps the entire board visible during normal gameplay.
 */
export class BoardCameraController {
    public state = CameraState.BoardOverview;
    private readonly presentationRoot: Node;
    private readonly cameraNode: Node;
    private readonly camera: Camera;
    private readonly originalParent: Node | null;
    private readonly ownsCamera: boolean;
    private readonly sequenceController: CameraSequenceController;
    private readonly shakeController: CameraShakeController;
    private destroyed = false;

    public constructor(private reducedMotion: boolean) {
        const scene = director.getScene();
        if (!scene) throw new Error('[ComePlayers] Camera requires an active scene.');
        const existing = director.getScene()?.getComponentInChildren(Camera);
        if (existing) {
            this.camera = existing;
            this.cameraNode = existing.node;
            this.ownsCamera = false;
        } else {
            this.cameraNode = new Node('RuntimeCamera');
            scene.addChild(this.cameraNode);
            this.camera = this.cameraNode.addComponent(Camera);
            this.ownsCamera = true;
        }
        this.originalParent = this.cameraNode.parent;
        const cameraWorldPosition = this.cameraNode.getWorldPosition(new Vec3());
        const cameraWorldRotation = this.cameraNode.getWorldRotation(new Quat());
        this.presentationRoot = new Node('RuntimeCameraPresentationRig');
        scene.addChild(this.presentationRoot);
        this.presentationRoot.setWorldPosition(cameraWorldPosition);
        this.presentationRoot.setWorldRotation(cameraWorldRotation);
        this.cameraNode.setParent(this.presentationRoot, true);
        this.cameraNode.setPosition(0, 0, 0);
        this.cameraNode.setRotation(new Quat());
        this.sequenceController = new CameraSequenceController(this.presentationRoot, reducedMotion);
        this.shakeController = new CameraShakeController(this.cameraNode, reducedMotion);
        this.camera.projection = Camera.ProjectionType.PERSPECTIVE;
        this.camera.clearColor = new Color(31, 104, 158, 255);
        this.camera.fov = CLASSIC_COMFORT_CAMERA_FOV;
        this.camera.near = CLASSIC_COMFORT_CAMERA_NEAR;
        this.camera.far = CLASSIC_COMFORT_CAMERA_FAR;
        this.overview(true);
    }

    public openingSequence(): void {
        if (this.destroyed) return;
        this.state = CameraState.BoardOverview;
        const overview = classicOverviewPose();
        this.sequenceController.play([
            {
                position: overview.position.clone().add3f(1.0, 1.4, 1.0),
                euler: overview.euler.clone(),
                target: overview.target.clone(),
                duration: 0.42,
            },
            {
                position: overview.position,
                euler: overview.euler,
                target: overview.target,
                duration: 0.58,
            },
        ], false);
    }

    public turnFocus(position: Readonly<Vec3>): void {
        const pose = classicTargetPose(position, 0.14, 0);
        this.transition(CameraState.TileFocus, pose.position, pose.euler, pose.target);
    }

    public overview(immediate = false): void {
        const pose = classicOverviewPose();
        this.transition(CameraState.BoardOverview, pose.position, pose.euler, pose.target, immediate);
    }

    public diceFocus(): void {
        const pose = classicDicePose(false);
        this.transition(CameraState.DiceFocus, pose.position, pose.euler, pose.target);
    }

    public diceReveal(_total: number, _isDouble: boolean): void {
        const pose = classicDicePose(true);
        this.transition(CameraState.DiceFocus, pose.position, pose.euler, pose.target);
    }

    /** Frames the complete route once before movement, instead of tracking every tile. */
    public movementFocus(destination: Readonly<Vec3>): void {
        const pose = classicTargetPose(destination, 0.12, 0);
        this.transition(CameraState.PlayerFollow, pose.position, pose.euler, pose.target);
    }

    /** Kept for presentation compatibility; classic mode intentionally avoids per-step panning. */
    public follow(_position: Readonly<Vec3>): void {
        if (this.destroyed) return;
        this.state = CameraState.PlayerFollow;
    }

    public focus(position: Readonly<Vec3>): void {
        const pose = classicTargetPose(position, 0.16, -0.12);
        this.transition(CameraState.TileFocus, pose.position, pose.euler, pose.target);
    }

    public landingSequence(position: Readonly<Vec3>, dramatic = false): void {
        if (this.destroyed) return;
        this.state = CameraState.TileFocus;
        const approach = classicTargetPose(position, dramatic ? 0.16 : 0.14, dramatic ? -0.16 : -0.10);
        const settle = classicTargetPose(position, dramatic ? 0.20 : 0.17, dramatic ? -0.24 : -0.14);
        this.sequenceController.play([
            {
                position: approach.position,
                euler: approach.euler,
                target: approach.target,
                duration: dramatic ? 0.30 : 0.24,
            },
            {
                position: settle.position,
                euler: settle.euler,
                target: settle.target,
                duration: dramatic ? 0.38 : 0.30,
                hold: dramatic ? 0.06 : 0.02,
            },
        ], false);
    }

    public propertyFocus(position: Readonly<Vec3>): void {
        const pose = classicTargetPose(position, 0.18, -0.16);
        this.transition(CameraState.PropertyFocus, pose.position, pose.euler, pose.target);
    }

    public cardFocus(): void {
        const pose = classicCardPose();
        this.transition(CameraState.CardFocus, pose.position, pose.euler, pose.target);
    }

    public resultFocus(): void {
        const pose = classicResultPose();
        this.transition(CameraState.ResultFocus, pose.position, pose.euler, pose.target);
    }

    public impact(cue: CameraImpactCue, intensity = 1): boolean {
        return this.shakeController.play(cue, intensity);
    }

    public setReducedMotion(reducedMotion: boolean): void {
        this.reducedMotion = reducedMotion;
        this.sequenceController.setReducedMotion(reducedMotion);
        this.shakeController.setReducedMotion(reducedMotion);
    }

    public snapshot(): CameraPresentationSnapshot {
        const sequence = this.sequenceController.snapshot();
        const shake = this.shakeController.snapshot();
        return {
            state: this.state,
            reducedMotion: this.reducedMotion,
            sequencePlaying: sequence.playing,
            impactActive: shake.active,
            impactsPlayed: shake.played,
            impactsSuppressed: shake.suppressed,
        };
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.sequenceController.destroy();
        this.shakeController.destroy();
        if (this.ownsCamera) {
            if (this.cameraNode.isValid) this.cameraNode.destroy();
        } else if (this.cameraNode.isValid) {
            const fallbackParent = director.getScene();
            const parent = this.originalParent?.isValid ? this.originalParent : fallbackParent;
            if (parent) this.cameraNode.setParent(parent, true);
        }
        if (this.presentationRoot.isValid) this.presentationRoot.destroy();
    }

    private transition(
        state: CameraState,
        position: Vec3,
        euler: Vec3,
        target: Vec3,
        immediate = false,
    ): void {
        if (this.destroyed) return;
        this.state = state;
        const profile = CAMERA_TRANSITION_PROFILES[state];
        const steps: CameraSequenceStep[] = [];
        if (profile.settleDuration > 0 && profile.settleDistance > 0) {
            const approach = position.clone().add3f(
                profile.settleDistance,
                profile.settleDistance * 0.35,
                profile.settleDistance,
            );
            steps.push({
                position: approach,
                euler: euler.clone(),
                target: target.clone(),
                duration: Math.max(0.001, profile.duration - profile.settleDuration),
            });
        }
        steps.push({
            position,
            euler,
            target,
            duration: profile.settleDuration > 0
                ? profile.settleDuration
                : profile.duration,
        });
        this.sequenceController.play(steps, immediate);
    }
}
