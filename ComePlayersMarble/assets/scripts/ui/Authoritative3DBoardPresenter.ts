import {
    Camera,
    Color,
    director,
    Layers,
    Node,
    tween,
    Tween,
    Vec3,
} from 'cc';
import {
    CLASSIC_COMFORT_CAMERA_FAR,
    CLASSIC_COMFORT_CAMERA_FOV,
    CLASSIC_COMFORT_CAMERA_NEAR,
    classicDicePose,
    classicOverviewPose,
    classicResultPose,
    classicTargetPose,
} from '../camera/ClassicComfortCameraPreset';
import { BoardView } from '../board/BoardView';
import type { PlayerState } from '../core/MatchModel';
import { createBoardData } from '../data/BoardData';
import { DiceController } from '../dice/DiceController';
import type {
    AuthoritativeMatchPlayer,
    AuthoritativeMatchSnapshot,
} from '../network/AuthoritativeMatchProtocol';
import { PlayerAnimationState } from '../player/PlayerAnimationTypes';
import { VfxManager } from '../vfx/VfxManager';
import { VfxCue } from '../vfx/VfxTypes';
import type { AuthoritativePresentationCue } from './AuthoritativeEventPresentationQueue';
import {
    boardPath,
    shouldAcceptPresentationSequence,
    shouldForceAuthoritativeReconcile,
} from './Authoritative3DPresentationMath';

const PLAYER_COLORS = ['#1ecaff', '#ff6597', '#f5c323', '#4ddc97'] as const;
const MAX_PRESENTATION_QUEUE = 48;

interface QueuedPresentation {
    readonly cue: AuthoritativePresentationCue;
    readonly snapshot: AuthoritativeMatchSnapshot;
}

export interface Authoritative3DBoardPresenterSnapshot {
    readonly initialized: boolean;
    readonly presenting: boolean;
    readonly queued: number;
    readonly lastPresentedSequence: number;
    readonly playerCount: number;
    readonly propertyVisualCount: number;
    readonly forcedReconciliations: number;
}

/**
 * Replays authoritative Supabase events on the procedural Cocos 3D board.
 * Postgres snapshots remain the source of truth; this class only presents them.
 */
export class Authoritative3DBoardPresenter {
    private readonly stage = new Node('Authoritative3DStage');
    private readonly cameraNode = new Node('Authoritative3DCamera');
    private readonly camera: Camera;
    private readonly board = createBoardData();
    private readonly queue: QueuedPresentation[] = [];
    private readonly players = new Map<string, PlayerState>();
    private readonly propertyFingerprints = new Map<number, string>();
    private readonly olympicFingerprints = new Map<number, string>();
    private boardView: BoardView | null = null;
    private dice: DiceController | null = null;
    private vfx: VfxManager | null = null;
    private localProfileId = '';
    private playerSignature = '';
    private latestSnapshot: AuthoritativeMatchSnapshot | null = null;
    private initialized = false;
    private presenting = false;
    private destroyed = false;
    private lastPresentedSequence = 0;
    private forcedReconciliations = 0;
    private queueGeneration = 0;
    private spectatorSeat = -1;
    private spectatorAutoFollow = true;
    private cameraTweenState: { px: number; py: number; pz: number; tx: number; ty: number; tz: number } | null = null;

    public constructor(private readonly reducedMotion = false) {
        const scene = director.getScene();
        if (!scene) throw new Error('[ComePlayers] Authoritative 3D presenter requires an active scene.');
        scene.addChild(this.stage);
        this.stage.addChild(this.cameraNode);
        this.camera = this.cameraNode.addComponent(Camera);
        this.camera.projection = Camera.ProjectionType.PERSPECTIVE;
        this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        this.camera.visibility = Layers.Enum.DEFAULT;
        this.camera.clearColor = new Color(31, 104, 158, 255);
        this.camera.fov = CLASSIC_COMFORT_CAMERA_FOV;
        this.camera.near = CLASSIC_COMFORT_CAMERA_NEAR;
        this.camera.far = CLASSIC_COMFORT_CAMERA_FAR;
        this.overview(true);
    }

    public synchronize(snapshot: AuthoritativeMatchSnapshot, localProfileId: string): void {
        if (this.destroyed) return;
        this.latestSnapshot = snapshot;
        this.localProfileId = localProfileId;
        this.ensureRuntime(snapshot);
        this.synchronizeProperties(snapshot);
        this.synchronizePlayerStates(snapshot);

        const missedEvents = shouldForceAuthoritativeReconcile(
            this.initialized,
            snapshot.lastEventSequence,
            this.lastPresentedSequence,
        );
        const safeToSnap = !this.initialized || missedEvents || (!this.presenting && this.queue.length === 0 && snapshot.lastEventSequence <= this.lastPresentedSequence);
        if (safeToSnap) {
            if (missedEvents) {
                this.forcedReconciliations += 1;
                this.queue.length = 0;
            }
            this.snapPlayers(snapshot);
            this.lastPresentedSequence = Math.max(this.lastPresentedSequence, snapshot.lastEventSequence);
        }
        this.applyTurnAnimations(snapshot);
        this.initialized = true;
    }

    public enqueue(cue: AuthoritativePresentationCue, snapshot: AuthoritativeMatchSnapshot): boolean {
        if (this.destroyed || !shouldAcceptPresentationSequence(
            cue.sequence,
            this.lastPresentedSequence,
            this.queue.map((entry) => entry.cue.sequence),
        )) return false;
        this.latestSnapshot = snapshot;
        this.queue.push({ cue, snapshot });
        this.queue.sort((left, right) => left.cue.sequence - right.cue.sequence);
        while (this.queue.length > MAX_PRESENTATION_QUEUE) this.queue.shift();
        if (!this.presenting) void this.drain();
        return true;
    }

    public resetForReplay(snapshot: AuthoritativeMatchSnapshot): void {
        if (this.destroyed) return;
        this.queueGeneration += 1;
        this.queue.length = 0;
        this.presenting = false;
        this.lastPresentedSequence = 0;
        this.initialized = false;
        this.latestSnapshot = snapshot;
        this.ensureRuntime(snapshot);
        this.synchronizeProperties(snapshot);
        this.synchronizePlayerStates(snapshot);
        this.snapPlayers(snapshot);
        this.applyTurnAnimations(snapshot);
        this.initialized = true;
        this.overview(true);
    }

    public showOverview(): void {
        this.spectatorSeat = -1;
        this.spectatorAutoFollow = false;
        this.overview(false);
    }

    public focusPlayer(snapshot: AuthoritativeMatchSnapshot, seat: number): number {
        const player = snapshot.players.find((entry) => entry.seat === seat && !entry.bankrupt)
            ?? snapshot.players.find((entry) => entry.seat === seat);
        if (!player) return this.spectatorSeat;
        this.spectatorSeat = player.seat;
        this.spectatorAutoFollow = false;
        const position = this.board[player.position]?.worldPosition;
        if (position) this.focus(position, 0.38);
        return this.spectatorSeat;
    }

    public focusNextPlayer(snapshot: AuthoritativeMatchSnapshot): number {
        const seats = snapshot.players.slice().sort((left, right) => left.seat - right.seat).map((player) => player.seat);
        if (seats.length === 0) return -1;
        const currentIndex = seats.indexOf(this.spectatorSeat);
        const nextSeat = seats[(currentIndex + 1 + seats.length) % seats.length] ?? seats[0] ?? -1;
        return this.focusPlayer(snapshot, nextSeat);
    }

    public toggleAutoFollow(snapshot: AuthoritativeMatchSnapshot): boolean {
        this.spectatorAutoFollow = !this.spectatorAutoFollow;
        if (this.spectatorAutoFollow) {
            this.spectatorSeat = snapshot.currentTurnSeat;
            this.focusPlayerInternal(snapshot, snapshot.currentTurnSeat);
        }
        return this.spectatorAutoFollow;
    }

    public isAutoFollowEnabled(): boolean {
        return this.spectatorAutoFollow;
    }

    public snapshot(): Authoritative3DBoardPresenterSnapshot {
        return {
            initialized: this.initialized,
            presenting: this.presenting,
            queued: this.queue.length,
            lastPresentedSequence: this.lastPresentedSequence,
            playerCount: this.players.size,
            propertyVisualCount: this.propertyFingerprints.size,
            forcedReconciliations: this.forcedReconciliations,
        };
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.queueGeneration += 1;
        this.queue.length = 0;
        Tween.stopAllByTarget(this.cameraNode);
        if (this.cameraTweenState) Tween.stopAllByTarget(this.cameraTweenState);
        this.boardView?.destroy();
        this.boardView = null;
        this.dice?.destroy();
        this.dice = null;
        this.vfx?.destroy();
        this.vfx = null;
        this.players.clear();
        this.propertyFingerprints.clear();
        this.olympicFingerprints.clear();
        if (this.stage.isValid) this.stage.destroy();
    }

    private ensureRuntime(snapshot: AuthoritativeMatchSnapshot): void {
        const signature = snapshot.players
            .slice()
            .sort((left, right) => left.seat - right.seat)
            .map((player) => `${player.profileId}:${player.seat}`)
            .join('|');
        if (this.boardView && signature === this.playerSignature) return;

        this.boardView?.destroy();
        this.dice?.destroy();
        this.vfx?.destroy();
        this.players.clear();
        this.propertyFingerprints.clear();
        this.olympicFingerprints.clear();

        this.boardView = new BoardView(this.board, { host: this.stage });
        const playerStates = snapshot.players
            .slice()
            .sort((left, right) => left.seat - right.seat)
            .map((player) => this.createPlayerState(player));
        for (const player of playerStates) this.players.set(player.id, player);
        this.boardView.spawnPlayers(playerStates);
        this.dice = new DiceController({ host: this.stage });
        this.vfx = new VfxManager(this.stage);
        this.playerSignature = signature;
        this.snapPlayers(snapshot);
    }

    private createPlayerState(player: AuthoritativeMatchPlayer): PlayerState {
        return {
            id: player.profileId,
            name: player.displayName,
            color: PLAYER_COLORS[player.seat] ?? '#ffffff',
            money: player.money,
            tileIndex: player.position,
            properties: [],
            islandTurns: player.islandTurns,
            bankrupt: player.bankrupt,
            bot: player.profileId !== this.localProfileId,
            teamId: player.teamId,
            rentDiscountPercent: player.rentShieldPercent,
            rentDiscountCharges: player.rentShieldCharges,
            freeUpgradeCredits: player.freeUpgradeCredits,
            freeWorldTravelCredits: player.travelCredits,
        };
    }

    private synchronizePlayerStates(snapshot: AuthoritativeMatchSnapshot): void {
        for (const serverPlayer of snapshot.players) {
            const player = this.players.get(serverPlayer.profileId);
            if (!player) continue;
            player.name = serverPlayer.displayName;
            player.money = serverPlayer.money;
            player.bankrupt = serverPlayer.bankrupt;
            player.islandTurns = serverPlayer.islandTurns;
            player.teamId = serverPlayer.teamId;
            player.rentDiscountPercent = serverPlayer.rentShieldPercent;
            player.rentDiscountCharges = serverPlayer.rentShieldCharges;
            player.freeUpgradeCredits = serverPlayer.freeUpgradeCredits;
            player.freeWorldTravelCredits = serverPlayer.travelCredits;
        }
    }

    private snapPlayers(snapshot: AuthoritativeMatchSnapshot): void {
        for (const serverPlayer of snapshot.players) {
            const player = this.players.get(serverPlayer.profileId);
            if (!player) continue;
            player.tileIndex = serverPlayer.position;
            this.boardView?.snapPlayer(player.id, player.tileIndex, serverPlayer.seat);
        }
    }

    private synchronizeProperties(snapshot: AuthoritativeMatchSnapshot): void {
        const active = new Set<number>();
        for (const property of snapshot.properties) {
            active.add(property.tileIndex);
            const fingerprint = [
                property.ownerProfileId,
                property.ownerSeat,
                property.buildingLevel,
                property.rentMultiplier,
                property.olympicUntilRound,
            ].join(':');
            if (this.propertyFingerprints.get(property.tileIndex) !== fingerprint) {
                const color = PLAYER_COLORS[property.ownerSeat] ?? '#ffffff';
                this.boardView?.markOwner(property.tileIndex, color);
                this.boardView?.updateProperty(property.tileIndex, color, property.buildingLevel);
                this.propertyFingerprints.set(property.tileIndex, fingerprint);
            }
            const olympicActive = property.olympicUntilRound >= snapshot.round && property.rentMultiplier > 1;
            const olympicFingerprint = olympicActive ? `${property.rentMultiplier}:${property.olympicUntilRound}` : '';
            if (this.olympicFingerprints.get(property.tileIndex) !== olympicFingerprint) {
                if (olympicActive) this.boardView?.updateOlympic(property.tileIndex, property.rentMultiplier);
                else this.boardView?.clearOlympic(property.tileIndex);
                if (olympicFingerprint) this.olympicFingerprints.set(property.tileIndex, olympicFingerprint);
                else this.olympicFingerprints.delete(property.tileIndex);
            }
        }
        for (const tileIndex of Array.from(this.propertyFingerprints.keys())) {
            if (active.has(tileIndex)) continue;
            this.boardView?.clearProperty(tileIndex);
            this.boardView?.clearOlympic(tileIndex);
            this.propertyFingerprints.delete(tileIndex);
            this.olympicFingerprints.delete(tileIndex);
        }
        this.synchronizeColorMonopolyPresentation(snapshot);
    }

    private synchronizeColorMonopolyPresentation(snapshot: AuthoritativeMatchSnapshot): void {
        const groups = new Map<string, number[]>();
        for (const tile of this.board) {
            if (!tile.colorGroup.startsWith('group-')) continue;
            const indices = groups.get(tile.colorGroup) ?? [];
            indices.push(tile.index);
            groups.set(tile.colorGroup, indices);
        }
        const ownerByTile = new Map(snapshot.properties.map((property) => [property.tileIndex, property] as const));
        const scopes = snapshot.mode === 'TEAM'
            ? (['BLUE', 'GOLD'] as const).map((teamId) => ({
                id: teamId,
                color: teamId === 'BLUE' ? '#39bce8' : '#f2c94c',
                owns: (tileIndex: number) => {
                    const property = ownerByTile.get(tileIndex);
                    const owner = snapshot.players.find((player) => player.seat === property?.ownerSeat);
                    return owner?.teamId === teamId;
                },
            }))
            : snapshot.players.filter((player) => !player.bankrupt).map((player) => ({
                id: player.profileId,
                color: PLAYER_COLORS[player.seat] ?? '#f2c94c',
                owns: (tileIndex: number) => ownerByTile.get(tileIndex)?.ownerProfileId === player.profileId,
            }));
        const completed = scopes.flatMap((scope) => Array.from(groups.entries())
            .filter(([, tileIndices]) => tileIndices.length >= 2 && tileIndices.every(scope.owns))
            .map(([groupId, tileIndices]) => ({ groupId, tileIndices, color: scope.color })));
        this.boardView?.syncColorMonopolies(completed);
    }

    private applyTurnAnimations(snapshot: AuthoritativeMatchSnapshot): void {
        const states = snapshot.players
            .map((serverPlayer) => this.players.get(serverPlayer.profileId))
            .filter((player): player is PlayerState => player !== undefined);
        this.boardView?.setTurnAnimations(states, snapshot.currentTurnProfileId);
        if (this.spectatorAutoFollow && !this.presenting) {
            this.spectatorSeat = snapshot.currentTurnSeat;
            this.focusPlayerInternal(snapshot, snapshot.currentTurnSeat);
        }
    }

    private async drain(): Promise<void> {
        const generation = this.queueGeneration;
        this.presenting = true;
        try {
            while (this.queue.length > 0 && !this.destroyed && generation === this.queueGeneration) {
                const entry = this.queue.shift();
                if (!entry || entry.cue.sequence <= this.lastPresentedSequence) continue;
                await this.play(entry.cue, entry.snapshot);
                this.lastPresentedSequence = entry.cue.sequence;
                this.synchronizeProperties(entry.snapshot);
                this.synchronizePlayerStates(entry.snapshot);
                this.applyTurnAnimations(entry.snapshot);
            }
            if (this.latestSnapshot && !this.destroyed) {
                this.snapPlayers(this.latestSnapshot);
                this.synchronizeProperties(this.latestSnapshot);
                this.applyTurnAnimations(this.latestSnapshot);
                this.overview(false);
            }
        } finally {
            if (generation === this.queueGeneration) this.presenting = false;
        }
    }

    private async play(cue: AuthoritativePresentationCue, snapshot: AuthoritativeMatchSnapshot): Promise<void> {
        const actor = this.players.get(cue.actorProfileId);
        if (cue.kind === 'DICE_ROLLED' && cue.diceFirst > 0 && cue.diceSecond > 0) {
            this.focusDice();
            this.playVfx(VfxCue.DiceRoll, 0, '#ffffff', 4, 1.2);
            await this.dice?.roll({ first: cue.diceFirst, second: cue.diceSecond }, 2.2);
            if (cue.diceFirst === cue.diceSecond || cue.diceFirst + cue.diceSecond >= 10) {
                this.playVfx(VfxCue.DicePower, 0, '#f5c323', 5, 1.4);
            }
            await wait(this.reducedMotion ? 40 : 160);
        }

        if (actor && isMovementCue(cue) && cue.toTileIndex >= 0) {
            const from = cue.fromTileIndex >= 0 ? cue.fromTileIndex : actor.tileIndex;
            const path = cue.kind === 'WORLD_TRAVEL_COMPLETED'
                ? [cue.toTileIndex]
                : boardPath(from, cue.toTileIndex, this.board.length);
            const target = this.board[cue.toTileIndex]?.worldPosition;
            if (target) this.focus(target, 0.36);
            await this.boardView?.move(actor, path, this.reducedMotion ? 0.035 : 0.11, (tileIndex) => {
                actor.tileIndex = tileIndex;
                const position = this.board[tileIndex]?.worldPosition;
                if (position) this.playVfx(VfxCue.MovementStep, tileIndex, actor.color, 1, 0.35);
            });
            this.playVfx(cue.kind === 'WORLD_TRAVEL_COMPLETED' ? VfxCue.Travel : VfxCue.LandingPulse, cue.toTileIndex, actor.color, 4, 0.8);
        }

        const targetTile = cue.tileIndex >= 0 ? cue.tileIndex : cue.toTileIndex;
        if (targetTile >= 0) {
            const position = this.board[targetTile]?.worldPosition;
            if (position && isPropertyCue(cue)) this.focus(position, 0.3);
        }

        switch (cue.kind) {
            case 'PROPERTY_PURCHASED':
                this.playVfx(VfxCue.PropertyPurchase, targetTile, actor?.color ?? '#f5c323', 6, 1.2);
                break;
            case 'PROPERTY_UPGRADED':
                this.playVfx(VfxCue.BuildingUpgrade, targetTile, '#ff9b3d', 7, 1.15);
                break;
            case 'PROPERTY_TAKEN_OVER':
                this.playVfx(VfxCue.PropertyPurchase, targetTile, actor?.color ?? '#ffffff', 9, 1.5);
                break;
            case 'RENT_PAID':
            case 'ASSET_LIQUIDATED':
                this.playVfx(VfxCue.CoinBurst, targetTile, '#f5c323', 7, 1.2);
                break;
            case 'FORTUNE_CARD_DRAWN':
            case 'CHARACTER_SKILL_ACTIVATED':
            case 'WORLD_EVENT_RESOLVED':
                this.playVfx(VfxCue.CardReveal, targetTile, '#b562ff', 6, 1.1);
                break;
            case 'OLYMPIC_APPLIED':
                this.playVfx(VfxCue.Olympic, targetTile, '#ff7e37', 8, 1.15);
                break;
            case 'WORLD_TRAVEL_COMPLETED':
                this.playVfx(VfxCue.Travel, targetTile, '#18d1ab', 8, 1.2);
                break;
            case 'PLAYER_BANKRUPT':
                if (actor) this.boardView?.playPlayerAnimation(actor.id, PlayerAnimationState.Sad);
                break;
            case 'MATCH_FINISHED':
                this.presentMatchResult(snapshot);
                break;
            default:
                break;
        }
        await wait(this.reducedMotion ? 50 : presentationDelay(cue.kind));
    }

    private focusPlayerInternal(snapshot: AuthoritativeMatchSnapshot, seat: number): void {
        const player = snapshot.players.find((entry) => entry.seat === seat);
        if (!player) return;
        const position = this.board[player.position]?.worldPosition;
        if (position) this.focus(position, 0.32);
    }

    private presentMatchResult(snapshot: AuthoritativeMatchSnapshot): void {
        const states = snapshot.players
            .map((entry) => this.players.get(entry.profileId))
            .filter((player): player is PlayerState => player !== undefined);
        this.boardView?.showResultAnimations(states, snapshot.winnerProfileId, snapshot.winnerTeamId);
        this.playVfx(VfxCue.Celebration, 0, '#f5c323', 12, 3.2);
        this.resultCamera();
    }

    private playVfx(cue: VfxCue, tileIndex: number, colorHex: string, count: number, radius: number): void {
        const position = this.board[Math.max(0, Math.min(this.board.length - 1, tileIndex))]?.worldPosition ?? Vec3.ZERO;
        this.vfx?.play({
            cue,
            x: position.x,
            y: position.y + 0.4,
            z: position.z,
            colorHex,
            count,
            radius,
        });
    }

    private overview(immediate: boolean): void {
        const pose = classicOverviewPose();
        this.moveCamera(pose.position, pose.target, immediate ? 0 : 0.65);
    }

    private focusDice(): void {
        const pose = classicDicePose(false);
        this.moveCamera(pose.position, pose.target, this.reducedMotion ? 0.01 : 0.48);
    }

    private focus(position: Readonly<Vec3>, duration: number): void {
        const pose = classicTargetPose(position, 0.02, -0.08);
        this.moveCamera(pose.position, pose.target, this.reducedMotion ? 0.01 : Math.max(0.48, duration));
    }

    private resultCamera(): void {
        const pose = classicResultPose();
        this.moveCamera(pose.position, pose.target, this.reducedMotion ? 0.01 : 0.72);
    }

    private moveCamera(position: Vec3, target: Vec3, duration: number): void {
        if (!this.cameraNode.isValid) return;
        Tween.stopAllByTarget(this.cameraNode);
        if (this.cameraTweenState) Tween.stopAllByTarget(this.cameraTweenState);
        if (duration <= 0) {
            this.cameraNode.setPosition(position);
            this.cameraNode.lookAt(target, Vec3.UP);
            return;
        }
        const startPosition = this.cameraNode.getPosition(new Vec3());
        const state = {
            px: startPosition.x,
            py: startPosition.y,
            pz: startPosition.z,
            tx: 0,
            ty: 0.25,
            tz: 0,
        };
        this.cameraTweenState = state;
        tween(state)
            .to(duration, {
                px: position.x,
                py: position.y,
                pz: position.z,
                tx: target.x,
                ty: target.y,
                tz: target.z,
            }, {
                easing: 'quadInOut',
                onUpdate: (frame) => {
                    this.cameraNode.setPosition(frame.px, frame.py, frame.pz);
                    this.cameraNode.lookAt(new Vec3(frame.tx, frame.ty, frame.tz), Vec3.UP);
                },
            })
            .call(() => {
                this.cameraTweenState = null;
                this.cameraNode.setPosition(position);
                this.cameraNode.lookAt(target, Vec3.UP);
            })
            .start();
    }
}

function isMovementCue(cue: AuthoritativePresentationCue): boolean {
    return cue.kind === 'DICE_ROLLED' || cue.kind === 'WORLD_TRAVEL_COMPLETED';
}

function isPropertyCue(cue: AuthoritativePresentationCue): boolean {
    return cue.kind === 'PROPERTY_PURCHASED'
        || cue.kind === 'PROPERTY_UPGRADED'
        || cue.kind === 'PROPERTY_TAKEN_OVER';
}

function presentationDelay(kind: AuthoritativePresentationCue['kind']): number {
    if (kind === 'MATCH_FINISHED' || kind === 'WORLD_EVENT_RESOLVED') return 820;
    if (kind === 'PROPERTY_PURCHASED' || kind === 'PROPERTY_UPGRADED' || kind === 'PROPERTY_TAKEN_OVER') return 480;
    return 260;
}

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
}
