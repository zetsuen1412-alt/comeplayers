import {
    AnimationClip,
    Color,
    director,
    instantiate,
    Material,
    MeshRenderer,
    Node,
    Prefab,
    primitives,
    resources,
    tween,
    Tween,
    utils,
    Vec3,
} from 'cc';
import { PlayerState } from '../core/MatchModel';
import type { MatchAward } from '../core/MatchAwardsService';
import { BoardTileData, TileType } from '../data/BoardData';
import { AlexiaAnimationController } from '../player/AlexiaAnimationController';
import { PlayerAnimationState } from '../player/PlayerAnimationTypes';
import { PlayerMovement } from '../player/PlayerMovement';

const CITY_GROUP_COLORS: readonly Color[] = [
    new Color(72, 182, 221),
    new Color(236, 126, 170),
    new Color(246, 190, 72),
    new Color(105, 195, 143),
    new Color(151, 123, 218),
    new Color(238, 137, 77),
    new Color(74, 198, 193),
    new Color(218, 112, 203),
];

const SPECIAL_COLORS: Readonly<Record<TileType, Color>> = {
    [TileType.Start]: new Color(30, 202, 255),
    [TileType.City]: new Color(60, 68, 82),
    [TileType.Fortune]: new Color(126, 77, 220),
    [TileType.GameCenter]: new Color(255, 191, 26),
    [TileType.Island]: new Color(45, 151, 199),
    [TileType.Olympic]: new Color(248, 98, 64),
    [TileType.WorldTravel]: new Color(24, 209, 171),
    [TileType.Tax]: new Color(206, 67, 82),
    [TileType.Bonus]: new Color(245, 195, 35),
    [TileType.Tourist]: new Color(68, 166, 240),
};

type SurfaceFinish = 'MATTE' | 'GLOSS' | 'METAL' | 'GLOW';

export interface BoardViewOptions {
    readonly host?: Node | null;
    readonly humanPrefab?: Prefab | null;
    readonly humanAnimationClips?: readonly AnimationClip[];
    readonly humanPrefabScale?: number;
}

export interface BoardAnimationSnapshot {
    readonly controllerCount: number;
    readonly authoredStateCount: number;
    readonly proceduralControllerCount: number;
}

export class BoardView {
    private readonly root = new Node('RuntimeBoard');
    private readonly playerNodes = new Map<string, Node>();
    private readonly playerAnimations = new Map<string, AlexiaAnimationController>();
    private readonly ownerMarkers = new Map<number, Node>();
    private readonly buildingMarkers = new Map<number, Node>();
    private readonly travelHighlights: Node[] = [];
    private readonly olympicMarkers = new Map<number, Node>();
    private readonly colorMonopolyMarkers = new Map<number, Node>();
    private readonly olympicHighlights: Node[] = [];
    private readonly materialCache = new Map<string, Material>();
    private readonly ambientNodes: Node[] = [];
    private readonly movementRouteMarkers: Node[] = [];
    private readonly centerTurnLamps: Node[] = [];
    private readonly resultAwardMarkers: Node[] = [];
    private activeTileMarker: Node | null = null;
    private activeTurnSpotlight: Node | null = null;
    private readonly movement = new PlayerMovement();

    public constructor(
        private readonly board: readonly BoardTileData[],
        private readonly options: BoardViewOptions = {},
    ) {
        const host = this.options.host ?? director.getScene();
        host?.addChild(this.root);
        this.createVideoReferenceFloorV105();
        for (const tile of board) this.createVideoReferenceTileV105(tile);
        this.playBoardEntrance();
    }

    public spawnPlayers(players: readonly PlayerState[]): void {
        players.forEach((player, index) => {
            const rig = new Node(player.bot ? `PlayerRig-${player.name}` : 'PlayerRig-Alexia');
            const humanPrefab = player.bot ? null : this.options.humanPrefab;
            const visual = humanPrefab
                ? instantiate(humanPrefab)
                : this.createPlayerPiece(
                    player.bot ? `BotVisual-${player.name}` : 'Alexia-Placeholder-Visual',
                    this.colorFromHex(player.color),
                    player.bot,
                );
            if (humanPrefab) {
                visual.name = 'Alexia-Visual';
                const scale = this.safePrefabScale();
                visual.setScale(
                    visual.scale.x * scale,
                    visual.scale.y * scale,
                    visual.scale.z * scale,
                );
            } else {
                visual.setScale(0.75, 0.75, 0.75);
            }
            visual.setPosition(Vec3.ZERO);
            rig.addChild(visual);

            const spawnOffset = new Vec3((index % 2) * 0.6 - 0.3, 1, Math.floor(index / 2) * 0.6 - 0.3);
            rig.setPosition(this.board[0]?.worldPosition.clone().add(spawnOffset) ?? spawnOffset);
            this.root.addChild(rig);

            const existingController = visual.getComponentInChildren(AlexiaAnimationController);
            const controller = existingController ?? visual.addComponent(AlexiaAnimationController);
            controller.configure(
                existingController?.visualRoot ?? visual,
                player.bot ? [] : (this.options.humanAnimationClips ?? []),
            );
            controller.play(PlayerAnimationState.Idle);
            this.playerNodes.set(player.id, rig);
            this.playerAnimations.set(player.id, controller);
        });
    }

    public async move(
        player: PlayerState,
        path: readonly number[],
        stepSeconds: number,
        onStep: (index: number) => void,
        movementState?: PlayerAnimationState,
    ): Promise<void> {
        const playerNode = this.playerNodes.get(player.id);
        if (!playerNode) return Promise.resolve();
        const controller = this.playerAnimations.get(player.id);
        controller?.play(movementState ?? (
            path.length >= 8 ? PlayerAnimationState.Run : PlayerAnimationState.Walk
        ));
        try {
            await this.movement.move(playerNode, path, this.board, stepSeconds, onStep);
        } finally {
            controller?.play(
                player.islandTurns > 0 ? PlayerAnimationState.IslandIdle : PlayerAnimationState.Idle,
            );
        }
    }


    public snapPlayer(playerId: string, tileIndex: number, seat = 0): boolean {
        const playerNode = this.playerNodes.get(playerId);
        const tile = this.board[tileIndex];
        if (!playerNode || !tile) return false;
        this.movement.cancel(playerNode);
        const offset = playerSeatOffset(seat);
        playerNode.setPosition(tile.worldPosition.clone().add(offset));
        playerNode.setScale(1, 1, 1);
        return true;
    }

    public playerPosition(playerId: string): Vec3 | null {
        const playerNode = this.playerNodes.get(playerId);
        return playerNode?.isValid ? playerNode.position.clone() : null;
    }

    public tilePosition(tileIndex: number): Vec3 | null {
        const tile = this.board[tileIndex];
        return tile ? tile.worldPosition.clone() : null;
    }

    public showMovementRoute(path: readonly number[], colorHex: string): void {
        this.showVideoReferenceRouteV105(path, colorHex);
        return;
        this.clearMovementRoute();
        const routeColor = this.colorFromHex(colorHex);
        let previous: Vec3 | null = null;
        path.forEach((tileIndex, index) => {
            const tile = this.board[tileIndex];
            if (!tile) return;
            const point = tile.worldPosition.clone().add3f(0, 1.00, 0);
            if (previous) {
                const delta = point.clone().subtract(previous);
                const distance = Math.sqrt(delta.x * delta.x + delta.z * delta.z);
                const segment = this.primitive(
                    `ClassicRouteRailV85-${tileIndex}-${index}`,
                    primitives.box({ width: 0.16, height: 0.07, length: Math.max(0.12, distance - 0.24) }),
                    routeColor,
                    'GLOW',
                );
                segment.setPosition(new Vec3(
                    (previous.x + point.x) * 0.5,
                    point.y - 0.08,
                    (previous.z + point.z) * 0.5,
                ));
                const yaw = Math.atan2(delta.x, delta.z) * 180 / Math.PI;
                segment.setRotationFromEuler(new Vec3(0, yaw, 0));
                segment.setScale(0.05, 0.05, 0.05);
                this.root.addChild(segment);
                tween(segment)
                    .delay(Math.max(0, index - 1) * 0.035)
                    .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
                    .start();
                this.movementRouteMarkers.push(segment);

                if (index % 2 === 1) {
                    const arrow = this.primitive(
                        `ClassicRouteArrowV85-${tileIndex}-${index}`,
                        primitives.cylinder(0.04, 0.17, 0.34, { radialSegments: 12 }),
                        new Color(255, 235, 148),
                        'GLOW',
                    );
                    arrow.setPosition(segment.position.clone().add3f(0, 0.11, 0));
                    arrow.setRotationFromEuler(new Vec3(90, yaw, 0));
                    arrow.setScale(0.1, 0.1, 0.1);
                    this.root.addChild(arrow);
                    tween(arrow)
                        .delay(index * 0.035 + 0.04)
                        .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                        .start();
                    this.movementRouteMarkers.push(arrow);
                }
            }

            const destination = index === path.length - 1;
            const marker = this.primitive(
                `ClassicRouteMarkerV85-${tileIndex}-${index}`,
                primitives.cylinder(destination ? 0.34 : 0.18, destination ? 0.34 : 0.18, destination ? 0.09 : 0.06, { radialSegments: 24 }),
                destination ? new Color(255, 225, 112) : routeColor,
                'GLOW',
            );
            marker.setPosition(point);
            marker.setScale(0.15, 0.15, 0.15);
            this.root.addChild(marker);
            tween(marker)
                .delay(index * 0.04)
                .to(0.16, { scale: new Vec3(destination ? 1.42 : 1.06, destination ? 1.42 : 1.06, destination ? 1.42 : 1.06) }, { easing: 'backOut' })
                .to(0.08, { scale: new Vec3(destination ? 1.12 : 0.88, destination ? 1.12 : 0.88, destination ? 1.12 : 0.88) }, { easing: 'quadInOut' })
                .start();
            this.movementRouteMarkers.push(marker);

            if (!destination && index > 0) {
                const stepGate = this.primitive(
                    `ClassicRouteStepGateV85-${tileIndex}-${index}`,
                    primitives.torus(0.34, 0.045, { radialSegments: 22, tubularSegments: 8 }),
                    index % 2 === 0 ? new Color(255, 231, 139) : routeColor,
                    'GLOW',
                );
                stepGate.setPosition(point.clone().add3f(0, 0.42, 0));
                stepGate.setScale(0.16, 0.16, 0.16);
                this.root.addChild(stepGate);
                tween(stepGate)
                    .delay(index * 0.04 + 0.03)
                    .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                    .repeatForever(
                        tween<Node>()
                            .to(0.34, { position: point.clone().add3f(0, 0.58, 0) }, { easing: 'sineInOut' })
                            .to(0.34, { position: point.clone().add3f(0, 0.42, 0) }, { easing: 'sineInOut' }),
                    )
                    .start();
                this.movementRouteMarkers.push(stepGate);
            }

            if (destination) {
                const destinationRing = this.primitive(
                    `ClassicRouteDestinationRingV85-${tileIndex}`,
                    primitives.torus(0.82, 0.075, { radialSegments: 28, tubularSegments: 10 }),
                    new Color(255, 230, 124),
                    'GLOW',
                );
                destinationRing.setPosition(point.clone().add3f(0, 0.08, 0));
                destinationRing.setRotationFromEuler(new Vec3(90, 0, 0));
                this.root.addChild(destinationRing);
                this.pulse(destinationRing, 0.82, 1.24, 0.48);
                this.movementRouteMarkers.push(destinationRing);

                for (let finIndex = 0; finIndex < 4; finIndex++) {
                    const angle = Math.PI * 2 * finIndex / 4;
                    const fin = this.primitive(
                        `ClassicRouteDestinationFinV85-${tileIndex}-${finIndex}`,
                        primitives.box({ width: 0.13, height: 0.22, length: 0.52 }),
                        finIndex % 2 === 0 ? new Color(255, 232, 139) : routeColor,
                        'GLOW',
                    );
                    fin.setPosition(point.clone().add3f(Math.cos(angle) * 0.84, 0.24, Math.sin(angle) * 0.84));
                    fin.setRotationFromEuler(new Vec3(0, -angle * 180 / Math.PI, 18));
                    fin.setScale(0.12, 0.12, 0.12);
                    this.root.addChild(fin);
                    tween(fin)
                        .delay(index * 0.04 + finIndex * 0.035)
                        .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                        .start();
                    this.movementRouteMarkers.push(fin);
                }

                const beacon = this.primitive(
                    `ClassicRouteDestinationBeaconV85-${tileIndex}`,
                    primitives.cylinder(0.04, 0.34, 0.82, { radialSegments: 18 }),
                    new Color(255, 225, 112),
                    'GLOW',
                );
                beacon.setPosition(point.clone().add3f(0, 0.64, 0));
                beacon.setScale(0.18, 0.18, 0.18);
                this.root.addChild(beacon);
                tween(beacon)
                    .delay(index * 0.04 + 0.05)
                    .to(0.20, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                    .repeatForever(
                        tween<Node>()
                            .to(0.38, { position: point.clone().add3f(0, 0.92, 0) }, { easing: 'sineInOut' })
                            .to(0.38, { position: point.clone().add3f(0, 0.64, 0) }, { easing: 'sineInOut' }),
                    )
                    .start();
                this.movementRouteMarkers.push(beacon);
            }
            previous = point;
        });
    }

    public clearMovementRoute(): void {
        for (const marker of this.movementRouteMarkers) {
            if (!marker.isValid) continue;
            Tween.stopAllByTarget(marker);
            marker.destroy();
        }
        this.movementRouteMarkers.length = 0;
    }

    public highlightTile(tileIndex: number, colorHex: string): void {
        this.highlightVideoReferenceTileV105(tileIndex, colorHex);
        return;
        if (this.activeTileMarker?.isValid) {
            Tween.stopAllByTarget(this.activeTileMarker);
            this.activeTileMarker.destroy();
        }
        const tile = this.board[tileIndex];
        if (!tile) {
            this.activeTileMarker = null;
            return;
        }
        const focus = new Node(`ClassicActiveTileFocusV85-${tileIndex}`);
        focus.setPosition(tile.worldPosition.clone().add3f(0, 0.91, 0));
        this.root.addChild(focus);

        const accent = this.colorFromHex(colorHex);
        const inner = this.primitive(
            `ClassicActiveTileInnerV85-${tileIndex}`,
            primitives.cylinder(0.70, 0.70, 0.055, { radialSegments: 28 }),
            accent,
            'GLOW',
        );
        focus.addChild(inner);
        const outer = this.primitive(
            `ClassicActiveTileOuterV85-${tileIndex}`,
            primitives.torus(0.98, 0.075, { radialSegments: 30, tubularSegments: 10 }),
            new Color(255, 231, 136),
            'GLOW',
        );
        outer.setPosition(0, 0.06, 0);
        outer.setRotationFromEuler(new Vec3(90, 0, 0));
        focus.addChild(outer);
        const beam = this.primitive(
            `ClassicActiveTileBeamV85-${tileIndex}`,
            primitives.cylinder(0.05, 0.42, 0.94, { radialSegments: 18 }),
            new Color(accent.r, accent.g, accent.b, 180),
            'GLOW',
        );
        beam.setPosition(0, 0.52, 0);
        focus.addChild(beam);

        focus.setScale(0.74, 0.74, 0.74);
        tween(focus).repeatForever(
            tween<Node>()
                .to(0.46, { scale: new Vec3(1.10, 1.10, 1.10) }, { easing: 'sineInOut' })
                .to(0.46, { scale: new Vec3(0.78, 0.78, 0.78) }, { easing: 'sineInOut' }),
        ).start();
        this.spin(outer, 42, 1);
        this.activeTileMarker = focus;
    }

    public playLandingCelebration(tileIndex: number, colorHex: string): void {
        this.playVideoReferenceLandingV105(tileIndex, colorHex);
        return;
        const tile = this.board[tileIndex];
        if (!tile) return;
        const accent = this.colorFromHex(colorHex);
        const origin = tile.worldPosition.clone().add3f(0, 0.96, 0);

        [0, 0.09].forEach((delay, ringIndex) => {
            const ring = this.primitive(
                `ClassicLandingShockwaveV85-${tileIndex}-${ringIndex}`,
                primitives.torus(0.42, 0.065, { radialSegments: 28, tubularSegments: 10 }),
                ringIndex === 0 ? new Color(255, 229, 120) : accent,
                'GLOW',
            );
            ring.setPosition(origin.clone().add3f(0, 0.03 + ringIndex * 0.04, 0));
            ring.setRotationFromEuler(new Vec3(90, 0, 0));
            ring.setScale(0.25, 0.25, 0.25);
            this.root.addChild(ring);
            tween(ring)
                .delay(delay)
                .to(0.34, { scale: new Vec3(2.65, 2.65, 2.65) }, { easing: 'quadOut' })
                .to(0.18, { scale: Vec3.ZERO }, { easing: 'quadIn' })
                .call(() => { if (ring.isValid) ring.destroy(); })
                .start();
        });

        for (let index = 0; index < 12; index++) {
            const angle = (Math.PI * 2 * index) / 12;
            const spark = this.primitive(
                `ClassicLandingSparkV85-${tileIndex}-${index}`,
                primitives.sphere(index % 3 === 0 ? 0.095 : 0.07, { segments: 8 }),
                index % 2 === 0 ? new Color(255, 225, 112) : accent,
                'GLOW',
            );
            spark.setPosition(origin);
            spark.setScale(0.32, 0.32, 0.32);
            this.root.addChild(spark);
            const radius = 1.18 + (index % 3) * 0.14;
            const destination = origin.clone().add3f(
                Math.cos(angle) * radius,
                0.72 + (index % 4) * 0.14,
                Math.sin(angle) * radius,
            );
            tween(spark)
                .to(0.30, { position: destination, scale: new Vec3(1.08, 1.08, 1.08) }, { easing: 'quadOut' })
                .to(0.23, { position: destination.clone().add3f(0, -0.48, 0), scale: Vec3.ZERO }, { easing: 'quadIn' })
                .call(() => { if (spark.isValid) spark.destroy(); })
                .start();
        }

        const landingCrown = this.primitive(
            `ClassicLandingCrownV85-${tileIndex}`,
            primitives.torus(0.48, 0.07, { radialSegments: 26, tubularSegments: 9 }),
            new Color(255, 230, 124),
            'GLOW',
        );
        landingCrown.setPosition(origin.clone().add3f(0, 1.18, 0));
        landingCrown.setRotationFromEuler(new Vec3(90, 0, 0));
        landingCrown.setScale(0.15, 0.15, 0.15);
        this.root.addChild(landingCrown);
        tween(landingCrown)
            .to(0.22, { scale: new Vec3(1.25, 1.25, 1.25), position: origin.clone().add3f(0, 1.72, 0) }, { easing: 'backOut' })
            .to(0.22, { scale: Vec3.ZERO, position: origin.clone().add3f(0, 2.10, 0) }, { easing: 'quadIn' })
            .call(() => { if (landingCrown.isValid) landingCrown.destroy(); })
            .start();

        for (let index = 0; index < 4; index++) {
            const ray = this.primitive(
                `ClassicLandingRayV85-${tileIndex}-${index}`,
                primitives.box({ width: 0.08, height: 1.35, length: 0.08 }),
                index % 2 === 0 ? accent : new Color(255, 235, 145),
                'GLOW',
            );
            const angle = Math.PI * 2 * index / 4 + Math.PI / 4;
            ray.setPosition(origin.clone().add3f(Math.cos(angle) * 0.46, 0.58, Math.sin(angle) * 0.46));
            ray.setScale(0.2, 0.1, 0.2);
            this.root.addChild(ray);
            tween(ray)
                .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
                .to(0.24, { scale: Vec3.ZERO }, { easing: 'quadIn' })
                .call(() => { if (ray.isValid) ray.destroy(); })
                .start();
        }
    }

    public clearProperty(tileIndex: number): void {
        const owner = this.ownerMarkers.get(tileIndex);
        if (owner?.isValid) owner.destroy();
        this.ownerMarkers.delete(tileIndex);
        const building = this.buildingMarkers.get(tileIndex);
        if (building?.isValid) building.destroy();
        this.buildingMarkers.delete(tileIndex);
    }

    public playLiquidationSequence(
        tileIndex: number,
        releasedToBank: boolean,
        accentHex = '#ffb45f',
    ): void {
        const tile = this.board[tileIndex];
        if (!tile) return;
        const accent = this.colorFromHex(accentHex);
        const root = new Node(`ClassicLiquidationAuctionV90-${tileIndex}`);
        root.setPosition(tile.worldPosition.clone().add3f(0, 0.18, 0));
        this.root.addChild(root);

        for (let index = 0; index < 3; index++) {
            const ring = this.primitive(
                `ClassicLiquidationAuctionRingV90-${tileIndex}-${index}`,
                primitives.torus(0.48 + index * 0.20, 0.055, { radialSegments: 28, tubularSegments: 9 }),
                index === 1 ? new Color(255, 220, 134) : accent,
                'GLOW',
            );
            ring.setRotationFromEuler(new Vec3(90, 0, 0));
            ring.setScale(0.12, 0.12, 0.12);
            root.addChild(ring);
            tween(ring)
                .delay(index * 0.07)
                .to(0.30, { scale: new Vec3(1.18, 1.18, 1.18) }, { easing: 'backOut' })
                .to(0.24, { scale: Vec3.ZERO }, { easing: 'quadIn' })
                .start();
        }

        const beam = this.primitive(
            `ClassicLiquidationRecoveryBeamV90-${tileIndex}`,
            primitives.cylinder(0.08, 0.44, releasedToBank ? 2.70 : 1.90, { radialSegments: 20 }),
            releasedToBank ? new Color(255, 115, 92, 145) : new Color(accent.r, accent.g, accent.b, 135),
            'GLOW',
        );
        beam.setPosition(0, releasedToBank ? 1.34 : 0.94, 0);
        beam.setScale(0.10, 0.10, 0.10);
        root.addChild(beam);
        tween(beam)
            .to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .to(0.34, { scale: Vec3.ZERO }, { easing: 'quadIn' })
            .start();

        const bankSeal = this.primitive(
            `ClassicLiquidationBankSealV90-${tileIndex}`,
            primitives.cylinder(0.32, 0.32, 0.10, { radialSegments: 24 }),
            releasedToBank ? new Color(255, 105, 86) : new Color(255, 221, 132),
            releasedToBank ? 'GLOW' : 'METAL',
        );
        bankSeal.setPosition(0, releasedToBank ? 1.88 : 1.36, 0);
        bankSeal.setRotationFromEuler(new Vec3(90, 0, 0));
        bankSeal.setScale(0.08, 0.08, 0.08);
        root.addChild(bankSeal);
        tween(bankSeal)
            .to(0.28, { scale: new Vec3(1.20, 1.20, 1.20) }, { easing: 'backOut' })
            .to(0.20, { scale: new Vec3(0.92, 0.92, 0.92) }, { easing: 'quadInOut' })
            .to(0.22, { scale: Vec3.ZERO }, { easing: 'quadIn' })
            .call(() => { if (root.isValid) root.destroy(); })
            .start();
    }

    public playTakeoverSequence(
        tileIndex: number,
        previousOwnerHex: string,
        newOwnerHex: string,
        strategicImpact = false,
    ): void {
        const tile = this.board[tileIndex];
        if (!tile) return;
        const previousColor = this.colorFromHex(previousOwnerHex);
        const newColor = this.colorFromHex(newOwnerHex);
        const root = new Node(`ClassicTakeoverDirectorV91-${tileIndex}`);
        root.setPosition(tile.worldPosition.clone().add3f(0, 0.20, 0));
        this.root.addChild(root);

        const oldRing = this.primitive(
            `ClassicTakeoverOldOwnerRingV91-${tileIndex}`,
            primitives.torus(0.68, 0.07, { radialSegments: 30, tubularSegments: 10 }),
            previousColor,
            'GLOW',
        );
        oldRing.setRotationFromEuler(new Vec3(90, 0, 0));
        root.addChild(oldRing);
        tween(oldRing)
            .to(0.20, { scale: new Vec3(1.18, 1.18, 1.18) }, { easing: 'quadOut' })
            .to(0.30, { scale: Vec3.ZERO }, { easing: 'quadIn' })
            .start();

        const newRing = this.primitive(
            `ClassicTakeoverNewOwnerRingV91-${tileIndex}`,
            primitives.torus(strategicImpact ? 0.94 : 0.76, 0.08, { radialSegments: 32, tubularSegments: 10 }),
            newColor,
            'GLOW',
        );
        newRing.setRotationFromEuler(new Vec3(90, 0, 0));
        newRing.setScale(0.05, 0.05, 0.05);
        root.addChild(newRing);
        tween(newRing)
            .delay(0.12)
            .to(0.32, { scale: new Vec3(1.20, 1.20, 1.20) }, { easing: 'backOut' })
            .to(0.22, { scale: new Vec3(0.88, 0.88, 0.88) }, { easing: 'quadInOut' })
            .to(0.24, { scale: Vec3.ZERO }, { easing: 'quadIn' })
            .start();

        const controlBeam = this.primitive(
            `ClassicTakeoverControlBeamV91-${tileIndex}`,
            primitives.cylinder(0.12, 0.52, strategicImpact ? 3.20 : 2.35, { radialSegments: 22 }),
            new Color(newColor.r, newColor.g, newColor.b, 150),
            'GLOW',
        );
        controlBeam.setPosition(0, strategicImpact ? 1.58 : 1.16, 0);
        controlBeam.setScale(0.08, 0.08, 0.08);
        root.addChild(controlBeam);
        tween(controlBeam)
            .delay(0.10)
            .to(0.24, { scale: Vec3.ONE }, { easing: 'quadOut' })
            .to(0.34, { scale: Vec3.ZERO }, { easing: 'quadIn' })
            .start();

        for (let index = 0; index < 4; index++) {
            const angle = Math.PI * 2 * index / 4 + Math.PI / 4;
            const fin = this.primitive(
                `ClassicTakeoverControlFinV91-${tileIndex}-${index}`,
                primitives.box({ width: 0.12, height: strategicImpact ? 1.20 : 0.82, length: 0.18 }),
                index % 2 === 0 ? newColor : new Color(255, 224, 124),
                index % 2 === 0 ? 'GLOW' : 'METAL',
            );
            fin.setPosition(Math.cos(angle) * 0.62, 0.54, Math.sin(angle) * 0.62);
            fin.setRotationFromEuler(new Vec3(0, -angle * 180 / Math.PI, 0));
            fin.setScale(0.12, 0.12, 0.12);
            root.addChild(fin);
            tween(fin)
                .delay(0.10 + index * 0.04)
                .to(0.22, { scale: Vec3.ONE }, { easing: 'backOut' })
                .to(0.30, { scale: Vec3.ZERO }, { easing: 'quadIn' })
                .start();
        }

        const controlSeal = this.primitive(
            `ClassicTakeoverControlSealV91-${tileIndex}`,
            primitives.cylinder(0.36, 0.36, 0.12, { radialSegments: 28 }),
            strategicImpact ? new Color(255, 219, 102) : newColor,
            strategicImpact ? 'GLOW' : 'METAL',
        );
        controlSeal.setPosition(0, strategicImpact ? 2.20 : 1.72, 0);
        controlSeal.setRotationFromEuler(new Vec3(90, 0, 0));
        controlSeal.setScale(0.06, 0.06, 0.06);
        root.addChild(controlSeal);
        tween(controlSeal)
            .delay(0.18)
            .to(0.28, { scale: new Vec3(1.28, 1.28, 1.28) }, { easing: 'backOut' })
            .to(0.20, { scale: new Vec3(0.92, 0.92, 0.92) }, { easing: 'quadInOut' })
            .to(0.26, { scale: Vec3.ZERO }, { easing: 'quadIn' })
            .call(() => { if (root.isValid) root.destroy(); })
            .start();
    }

    public clearOlympic(tileIndex: number): void {
        const marker = this.olympicMarkers.get(tileIndex);
        if (marker?.isValid) marker.destroy();
        this.olympicMarkers.delete(tileIndex);
    }

    public playPlayerAnimation(playerId: string, state: PlayerAnimationState): boolean {
        const controller = this.playerAnimations.get(playerId);
        if (!controller) return false;
        controller.play(state);
        return true;
    }

    private showTurnSpotlightV85(playerId: string, colorHex: string): void {
        if (this.activeTurnSpotlight?.isValid) {
            Tween.stopAllByTarget(this.activeTurnSpotlight);
            this.activeTurnSpotlight.destroy();
        }
        const playerNode = this.playerNodes.get(playerId);
        if (!playerNode?.isValid) {
            this.activeTurnSpotlight = null;
            return;
        }
        const accent = this.colorFromHex(colorHex);
        const spotlight = new Node(`ClassicTurnSpotlightV85-${playerId}`);
        spotlight.setPosition(playerNode.position.clone().add3f(0, 0.16, 0));
        this.root.addChild(spotlight);

        const floorRing = this.primitive(
            `ClassicTurnSpotlightRingV85-${playerId}`,
            primitives.torus(0.78, 0.075, { radialSegments: 30, tubularSegments: 10 }),
            accent,
            'GLOW',
        );
        floorRing.setRotationFromEuler(new Vec3(90, 0, 0));
        spotlight.addChild(floorRing);

        const goldRing = this.primitive(
            `ClassicTurnSpotlightGoldRingV85-${playerId}`,
            primitives.torus(1.04, 0.045, { radialSegments: 30, tubularSegments: 10 }),
            new Color(255, 228, 121),
            'GLOW',
        );
        goldRing.setPosition(0, 0.08, 0);
        goldRing.setRotationFromEuler(new Vec3(90, 0, 0));
        spotlight.addChild(goldRing);

        const beam = this.primitive(
            `ClassicTurnSpotlightBeamV85-${playerId}`,
            primitives.cylinder(0.10, 0.58, 2.50, { radialSegments: 22 }),
            new Color(accent.r, accent.g, accent.b, 105),
            'GLOW',
        );
        beam.setPosition(0, 1.24, 0);
        spotlight.addChild(beam);

        const crown = this.primitive(
            `ClassicTurnSpotlightCrownV85-${playerId}`,
            primitives.torus(0.34, 0.055, { radialSegments: 24, tubularSegments: 8 }),
            new Color(255, 229, 119),
            'GLOW',
        );
        crown.setPosition(0, 2.72, 0);
        crown.setRotationFromEuler(new Vec3(90, 0, 0));
        spotlight.addChild(crown);

        const broadcastOrbit = new Node(`ClassicTurnBroadcastOrbitV85-${playerId}`);
        broadcastOrbit.setPosition(0, 1.72, 0);
        spotlight.addChild(broadcastOrbit);
        for (let index = 0; index < 4; index++) {
            const angle = Math.PI * 2 * index / 4;
            const satellite = this.primitive(
                `ClassicTurnBroadcastSatelliteV85-${playerId}-${index}`,
                primitives.sphere(index % 2 === 0 ? 0.10 : 0.075, { segments: 10 }),
                index % 2 === 0 ? new Color(255, 232, 139) : accent,
                'GLOW',
            );
            satellite.setPosition(Math.cos(angle) * 0.72, index % 2 === 0 ? 0.12 : -0.04, Math.sin(angle) * 0.72);
            broadcastOrbit.addChild(satellite);
            this.pulse(satellite, 0.80, 1.24, 0.48 + index * 0.05);
        }

        this.spin(floorRing, 34, 1);
        this.spin(goldRing, 24, -1);
        this.spin(crown, 48, 1);
        this.spin(broadcastOrbit, 62, -1);
        this.pulse(spotlight, 0.90, 1.10, 0.54);
        tween(spotlight).repeatForever(
            tween<Node>()
                .to(0.22, { position: playerNode.position.clone().add3f(0, 0.22, 0) }, { easing: 'sineInOut' })
                .to(0.22, { position: playerNode.position.clone().add3f(0, 0.16, 0) }, { easing: 'sineInOut' }),
        ).start();
        this.activeTurnSpotlight = spotlight;
    }

    public setTurnAnimations(players: readonly PlayerState[], currentPlayerId: string): void {
        for (const player of players) {
            const state = player.bankrupt
                ? PlayerAnimationState.Sad
                : player.islandTurns > 0
                    ? PlayerAnimationState.IslandIdle
                    : player.id === currentPlayerId
                        ? PlayerAnimationState.Ready
                        : PlayerAnimationState.Idle;
            this.playPlayerAnimation(player.id, state);
        }
        const activePlayer = players.find((player) => player.id === currentPlayerId);
        if (activePlayer) this.showTurnSpotlightV85(activePlayer.id, activePlayer.color);
        const activeSeat = players.findIndex((player) => player.id === currentPlayerId);
        this.centerTurnLamps.forEach((lamp, index) => {
            if (!lamp.isValid) return;
            Tween.stopAllByTarget(lamp);
            if (index === activeSeat) {
                lamp.setScale(1.08, 1.08, 1.08);
                tween(lamp).repeatForever(
                    tween<Node>()
                        .to(0.36, { scale: new Vec3(1.46, 1.46, 1.46) }, { easing: 'sineInOut' })
                        .to(0.36, { scale: new Vec3(1.08, 1.08, 1.08) }, { easing: 'sineInOut' }),
                ).start();
            } else {
                lamp.setScale(0.72, 0.72, 0.72);
            }
        });
    }

    public showResultAnimations(
        players: readonly PlayerState[],
        winnerId: string,
        winningTeamId?: string,
    ): void {
        for (const player of players) {
            const won = player.id === winnerId || Boolean(winningTeamId && player.teamId === winningTeamId);
            this.playPlayerAnimation(
                player.id,
                won ? PlayerAnimationState.Celebrate : PlayerAnimationState.Sad,
            );
        }
    }

    public showResultAwards(players: readonly PlayerState[], awards: readonly MatchAward[]): void {
        for (const marker of this.resultAwardMarkers) {
            if (!marker.isValid) continue;
            Tween.stopAllByTarget(marker);
            marker.destroy();
        }
        this.resultAwardMarkers.length = 0;

        const uniqueAwards = awards.filter((award, index, list) =>
            list.findIndex((candidate) => candidate.playerId === award.playerId) === index,
        ).slice(0, 4);
        uniqueAwards.forEach((award, index) => {
            const player = players.find((entry) => entry.id === award.playerId);
            const playerNode = this.playerNodes.get(award.playerId);
            if (!player || !playerNode) return;
            const root = new Node(`ClassicResultLegacyAwardV92-${award.kind}-${index}`);
            root.setPosition(playerNode.position.clone().add3f(0, 0.08, 0));
            root.setScale(0.08, 0.08, 0.08);
            this.root.addChild(root);

            const color = this.colorFromHex(player.color);
            const floorRing = this.primitive(
                `ClassicResultAwardRingV92-${index}`,
                primitives.torus(0.78, 0.08, { radialSegments: 30, tubularSegments: 10 }),
                color,
                'GLOW',
            );
            floorRing.setRotationFromEuler(new Vec3(90, 0, 0));
            floorRing.setPosition(0, 0.08, 0);
            root.addChild(floorRing);

            const crown = this.primitive(
                `ClassicResultAwardCrownV92-${index}`,
                primitives.cylinder(0.18, 0.42, 0.28, { radialSegments: 8 }),
                new Color(245, 195, 35),
                'METAL',
            );
            crown.setPosition(0, 2.08, 0);
            root.addChild(crown);

            const beacon = this.primitive(
                `ClassicResultAwardBeaconV92-${index}`,
                primitives.cylinder(0.04, 0.22, 2.4, { radialSegments: 18 }),
                new Color(color.r, color.g, color.b, 165),
                'GLOW',
            );
            beacon.setPosition(0, 1.15, 0);
            root.addChild(beacon);

            tween(root)
                .delay(index * 0.12)
                .to(0.42, { scale: new Vec3(1.12, 1.12, 1.12) }, { easing: 'backOut' })
                .to(0.15, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
                .start();
            tween(floorRing).repeatForever(
                tween<Node>()
                    .by(1.4, { eulerAngles: new Vec3(0, 180, 0) })
                    .by(1.4, { eulerAngles: new Vec3(0, 180, 0) }),
            ).start();
            tween(crown).repeatForever(
                tween<Node>()
                    .to(0.62, { position: new Vec3(0, 2.28, 0) }, { easing: 'sineInOut' })
                    .to(0.62, { position: new Vec3(0, 2.08, 0) }, { easing: 'sineInOut' }),
            ).start();
            this.resultAwardMarkers.push(root);
        });
    }

    public showCareerLegacyHighlight(
        playerId: string,
        colorHex: string,
        grade: 'S' | 'A' | 'B' | 'C' | 'D',
        score: number,
    ): void {
        const playerNode = this.playerNodes.get(playerId);
        if (!playerNode) return;

        const root = new Node(`ClassicCareerLegacyHighlightV93-${playerId}`);
        root.setPosition(playerNode.position.clone().add3f(0, 0.12, 0));
        root.setScale(0.08, 0.08, 0.08);
        this.root.addChild(root);

        const accent = this.colorFromHex(colorHex);
        const gradeColor = grade === 'S'
            ? new Color(255, 226, 122)
            : grade === 'A'
                ? new Color(181, 119, 255)
                : new Color(121, 217, 255);
        const legacyRing = this.primitive(
            `ClassicCareerLegacyRingV93-${playerId}`,
            primitives.torus(1.02, 0.075, { radialSegments: 32, tubularSegments: 12 }),
            gradeColor,
            'GLOW',
        );
        legacyRing.setRotationFromEuler(new Vec3(90, 0, 0));
        legacyRing.setPosition(0, 0.1, 0);
        root.addChild(legacyRing);

        const scoreCore = this.primitive(
            `ClassicCareerLegacyCoreV93-${playerId}-${score}`,
            primitives.cylinder(0.2, 0.52, 0.18, { radialSegments: 10 }),
            gradeColor,
            'METAL',
        );
        scoreCore.setPosition(0, 2.5, 0);
        root.addChild(scoreCore);

        const orbit = new Node(`ClassicCareerLegacyOrbitV93-${playerId}`);
        orbit.setPosition(0, 1.35, 0);
        root.addChild(orbit);
        const satelliteCount = grade === 'S' ? 8 : grade === 'A' ? 6 : 4;
        for (let index = 0; index < satelliteCount; index++) {
            const angle = Math.PI * 2 * index / satelliteCount;
            const satellite = this.primitive(
                `ClassicCareerLegacySatelliteV93-${playerId}-${index}`,
                primitives.sphere(0.085, { segments: 10 }),
                index % 2 === 0 ? gradeColor : accent,
                'GLOW',
            );
            satellite.setPosition(Math.cos(angle) * 0.9, 0, Math.sin(angle) * 0.9);
            orbit.addChild(satellite);
            this.pulse(satellite, 0.82, 1.28, 0.42 + index * 0.04);
        }

        tween(root)
            .to(0.46, { scale: new Vec3(1.08, 1.08, 1.08) }, { easing: 'backOut' })
            .to(0.15, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
            .start();
        this.spin(legacyRing, 28 + Math.max(0, score - 70), 1);
        this.spin(orbit, 52, -1);
        tween(scoreCore).repeatForever(
            tween<Node>()
                .to(0.58, { position: new Vec3(0, 2.72, 0) }, { easing: 'sineInOut' })
                .to(0.58, { position: new Vec3(0, 2.5, 0) }, { easing: 'sineInOut' }),
        ).start();
        this.resultAwardMarkers.push(root);
    }

    public showWorldJourneyHighlight(
        playerId: string,
        colorHex: string,
        journeyTier: number,
        unlockedRewardCount: number,
        prestigeLevel = 0,
        seasonArchiveCount = 0,
    ): void {
        const playerNode = this.playerNodes.get(playerId);
        if (!playerNode) return;

        const root = new Node(`ClassicWorldJourneyHighlightV94-${playerId}`);
        root.setPosition(playerNode.position.clone().add3f(0, 0.14, 0));
        root.setScale(0.06, 0.06, 0.06);
        this.root.addChild(root);

        const accent = this.colorFromHex(colorHex);
        const journeyColor = new Color(74, 215, 255);
        const outerRing = this.primitive(
            `ClassicWorldJourneyRingV94-${playerId}`,
            primitives.torus(1.28, 0.065, { radialSegments: 36, tubularSegments: 12 }),
            journeyColor,
            'GLOW',
        );
        outerRing.setRotationFromEuler(new Vec3(90, 0, 0));
        outerRing.setPosition(0, 0.12, 0);
        root.addChild(outerRing);

        const tierCore = this.primitive(
            `ClassicWorldJourneyCoreV94-${playerId}-T${journeyTier}`,
            primitives.cylinder(0.18, 0.48, 0.28, { radialSegments: 12 }),
            new Color(245, 195, 35),
            'METAL',
        );
        tierCore.setPosition(0, 2.92, 0);
        root.addChild(tierCore);

        const orbit = new Node(`ClassicWorldJourneyOrbitV94-${playerId}`);
        orbit.setPosition(0, 1.55, 0);
        root.addChild(orbit);
        const satelliteCount = Math.max(4, Math.min(10, journeyTier <= 0 ? 4 : journeyTier));
        for (let index = 0; index < satelliteCount; index++) {
            const angle = Math.PI * 2 * index / satelliteCount;
            const satellite = this.primitive(
                `ClassicWorldJourneySatelliteV94-${playerId}-${index}`,
                primitives.sphere(0.082, { segments: 10 }),
                index % 2 === 0 ? journeyColor : accent,
                'GLOW',
            );
            satellite.setPosition(Math.cos(angle) * 1.06, 0, Math.sin(angle) * 1.06);
            orbit.addChild(satellite);
            this.pulse(satellite, 0.78, 1.3, 0.38 + index * 0.035);
        }

        const rewardBurstCount = Math.max(1, Math.min(6, unlockedRewardCount));
        for (let index = 0; index < rewardBurstCount; index++) {
            const angle = Math.PI * 2 * index / rewardBurstCount;
            const ray = this.primitive(
                `ClassicWorldJourneyRewardRayV94-${playerId}-${index}`,
                primitives.box({ width: 0.055, height: 1.55, length: 0.055 }),
                new Color(255, 225, 112, 190),
                'GLOW',
            );
            ray.setPosition(Math.cos(angle) * 0.62, 1.05, Math.sin(angle) * 0.62);
            ray.setRotationFromEuler(new Vec3(0, -angle * 180 / Math.PI, 0));
            root.addChild(ray);
        }


        if (seasonArchiveCount > 0) {
            const archiveRing = this.primitive(
                `ClassicSeasonArchiveRingV96-${playerId}`,
                primitives.torus(1.92, 0.075, { radialSegments: 44, tubularSegments: 12 }),
                new Color(112, 246, 214),
                'GLOW',
            );
            archiveRing.setRotationFromEuler(new Vec3(90, 0, 0));
            archiveRing.setPosition(0, 0.28, 0);
            root.addChild(archiveRing);

            const archiveCore = this.primitive(
                `ClassicSeasonArchiveCoreV96-${playerId}`,
                primitives.octahedron(0.28, { subdivisions: 1 }),
                new Color(126, 232, 255),
                'GLOW',
            );
            archiveCore.setPosition(0, 3.86, 0);
            root.addChild(archiveCore);

            const archivePillarCount = 8;
            for (let index = 0; index < archivePillarCount; index++) {
                const angle = Math.PI * 2 * index / archivePillarCount;
                const pillar = this.primitive(
                    `ClassicSeasonArchivePillarV96-${playerId}-${index}`,
                    primitives.box({ width: 0.07, height: 0.72, length: 0.07 }),
                    index % 2 === 0 ? new Color(112, 246, 214) : new Color(255, 225, 112),
                    'GLOW',
                );
                pillar.setPosition(Math.cos(angle) * 1.62, 0.72, Math.sin(angle) * 1.62);
                root.addChild(pillar);
                this.pulse(pillar, 0.82, 1.24, 0.46 + index * 0.035);
            }
            this.spin(archiveRing, 44, 1);
            this.spin(archiveCore, 68, -1);
            this.pulse(archiveCore, 0.9, 1.16, 0.54);
        }

        if (prestigeLevel > 0) {
            const prestigeRing = this.primitive(
                `ClassicJourneyPrestigeRingV95-${playerId}-P${prestigeLevel}`,
                primitives.torus(1.62, 0.075, { radialSegments: 40, tubularSegments: 12 }),
                new Color(255, 123, 223),
                'GLOW',
            );
            prestigeRing.setRotationFromEuler(new Vec3(90, 0, 0));
            prestigeRing.setPosition(0, 0.2, 0);
            root.addChild(prestigeRing);

            const prestigeCrown = new Node(`ClassicJourneyPrestigeCrownV95-${playerId}`);
            prestigeCrown.setPosition(0, 3.38, 0);
            root.addChild(prestigeCrown);
            const crownCore = this.primitive(
                `ClassicJourneyPrestigeCoreV95-${playerId}`,
                primitives.cylinder(0.24, 0.42, 0.32, { radialSegments: 10 }),
                new Color(255, 215, 90),
                'METAL',
            );
            prestigeCrown.addChild(crownCore);
            for (let index = 0; index < 5; index++) {
                const angle = Math.PI * 2 * index / 5;
                const spike = this.primitive(
                    `ClassicJourneyPrestigeSpikeV95-${playerId}-${index}`,
                    primitives.cone(0.11, 0.34, { radialSegments: 8 }),
                    index % 2 === 0 ? new Color(255, 123, 223) : new Color(255, 225, 112),
                    'GLOW',
                );
                spike.setPosition(Math.cos(angle) * 0.28, 0.28, Math.sin(angle) * 0.28);
                prestigeCrown.addChild(spike);
            }
            this.spin(prestigeRing, 54 + prestigeLevel * 3, -1);
            this.spin(prestigeCrown, 36, 1);
            this.pulse(prestigeCrown, 0.9, 1.14, 0.6);
        }

        tween(root)
            .to(0.48, { scale: new Vec3(1.1, 1.1, 1.1) }, { easing: 'backOut' })
            .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
            .start();
        this.spin(outerRing, 38 + journeyTier * 2, 1);
        this.spin(orbit, 58, -1);
        tween(tierCore).repeatForever(
            tween<Node>()
                .to(0.5, { position: new Vec3(0, 3.16, 0) }, { easing: 'sineInOut' })
                .to(0.5, { position: new Vec3(0, 2.92, 0) }, { easing: 'sineInOut' }),
        ).start();
        this.resultAwardMarkers.push(root);
    }

    public showRivalContractHighlight(
        playerId: string,
        colorHex: string,
        rivalRank: number,
        completedContractCount: number,
        ratingChange: number,
    ): void {
        const playerNode = this.playerNodes.get(playerId);
        if (!playerNode) return;

        const root = new Node(`ClassicRivalContractHighlightV97-${playerId}`);
        root.setPosition(playerNode.position.clone().add3f(0, 0.16, 0));
        root.setScale(0.06, 0.06, 0.06);
        this.root.addChild(root);

        const accent = this.colorFromHex(colorHex);
        const rivalColor = ratingChange >= 0
            ? new Color(255, 116, 72)
            : new Color(122, 167, 255);
        const outerRing = this.primitive(
            `ClassicRivalContractRingV97-${playerId}`,
            primitives.torus(2.12, 0.09, { radialSegments: 48, tubularSegments: 12 }),
            rivalColor,
            'GLOW',
        );
        outerRing.setRotationFromEuler(new Vec3(90, 0, 0));
        outerRing.setPosition(0, 0.34, 0);
        root.addChild(outerRing);

        const innerRing = this.primitive(
            `ClassicRivalRatingRingV97-${playerId}`,
            primitives.torus(1.38, 0.065, { radialSegments: 40, tubularSegments: 10 }),
            accent,
            'GLOW',
        );
        innerRing.setRotationFromEuler(new Vec3(90, 0, 0));
        innerRing.setPosition(0, 0.22, 0);
        root.addChild(innerRing);

        const rankCore = this.primitive(
            `ClassicRivalRankCoreV97-${playerId}-R${rivalRank}`,
            primitives.octahedron(0.34, { subdivisions: 1 }),
            new Color(255, 226, 112),
            'GLOW',
        );
        rankCore.setPosition(0, 3.56, 0);
        root.addChild(rankCore);

        const pylonCount = Math.max(3, Math.min(8, 9 - Math.max(1, rivalRank) + completedContractCount));
        for (let index = 0; index < pylonCount; index++) {
            const angle = Math.PI * 2 * index / pylonCount;
            const pylon = this.primitive(
                `ClassicRivalContractPylonV97-${playerId}-${index}`,
                primitives.box({ width: 0.08, height: 1.05, length: 0.08 }),
                index % 2 === 0 ? rivalColor : new Color(255, 226, 112),
                'GLOW',
            );
            pylon.setPosition(Math.cos(angle) * 1.72, 0.82, Math.sin(angle) * 1.72);
            root.addChild(pylon);
            this.pulse(pylon, 0.82, 1.24, 0.42 + index * 0.04);
        }

        if (rivalRank === 1) {
            const crown = new Node(`ClassicRivalChampionCrownV97-${playerId}`);
            crown.setPosition(0, 4.02, 0);
            root.addChild(crown);
            const crownBase = this.primitive(
                `ClassicRivalChampionBaseV97-${playerId}`,
                primitives.cylinder(0.22, 0.54, 0.3, { radialSegments: 12 }),
                new Color(255, 199, 48),
                'METAL',
            );
            crown.addChild(crownBase);
            for (let index = 0; index < 6; index++) {
                const angle = Math.PI * 2 * index / 6;
                const spike = this.primitive(
                    `ClassicRivalChampionSpikeV97-${playerId}-${index}`,
                    primitives.cone(0.1, 0.42, { radialSegments: 8 }),
                    index % 2 === 0 ? rivalColor : new Color(255, 236, 148),
                    'GLOW',
                );
                spike.setPosition(Math.cos(angle) * 0.32, 0.34, Math.sin(angle) * 0.32);
                crown.addChild(spike);
            }
            this.spin(crown, 42, 1);
            this.pulse(crown, 0.92, 1.16, 0.58);
        }

        tween(root)
            .to(0.48, { scale: new Vec3(1.08, 1.08, 1.08) }, { easing: 'backOut' })
            .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
            .start();
        this.spin(outerRing, 46 + completedContractCount * 4, 1);
        this.spin(innerRing, 62, -1);
        this.spin(rankCore, 78, 1);
        this.pulse(rankCore, 0.88, 1.18, 0.52);
        this.resultAwardMarkers.push(root);
    }

    public showRivalGauntletHighlight(
        playerId: string,
        colorHex: string,
        gauntletScore: number,
        completedCircuitCount: number,
        podiumStreak: number,
    ): void {
        const playerNode = this.playerNodes.get(playerId);
        if (!playerNode) return;

        const root = new Node(`ClassicRivalGauntletHighlightV98-${playerId}`);
        root.setPosition(playerNode.position.clone().add3f(0, 0.2, 0));
        root.setScale(0.05, 0.05, 0.05);
        this.root.addChild(root);

        const accent = this.colorFromHex(colorHex);
        const circuitColor = completedCircuitCount >= 6
            ? new Color(255, 204, 72)
            : completedCircuitCount >= 4
                ? new Color(255, 123, 223)
                : new Color(80, 218, 255);
        const scoreRing = this.primitive(
            `ClassicRivalGauntletScoreRingV98-${playerId}`,
            primitives.torus(2.42, 0.11, { radialSegments: 56, tubularSegments: 12 }),
            circuitColor,
            'GLOW',
        );
        scoreRing.setRotationFromEuler(new Vec3(90, 0, 0));
        scoreRing.setPosition(0, 0.28, 0);
        root.addChild(scoreRing);

        const streakRing = this.primitive(
            `ClassicRivalGauntletStreakRingV98-${playerId}`,
            primitives.torus(1.66, 0.075, { radialSegments: 48, tubularSegments: 10 }),
            accent,
            'GLOW',
        );
        streakRing.setRotationFromEuler(new Vec3(90, 0, 0));
        streakRing.setPosition(0, 0.46, 0);
        root.addChild(streakRing);

        const core = this.primitive(
            `ClassicRivalGauntletCoreV98-${playerId}-S${gauntletScore}`,
            primitives.dodecahedron(0.38, { subdivisions: 1 }),
            new Color(255, 235, 146),
            'GLOW',
        );
        core.setPosition(0, 3.72, 0);
        root.addChild(core);

        const gateCount = Math.max(4, Math.min(10, 4 + completedCircuitCount + Math.min(3, podiumStreak)));
        for (let index = 0; index < gateCount; index++) {
            const angle = Math.PI * 2 * index / gateCount;
            const gate = this.primitive(
                `ClassicRivalGauntletGateV98-${playerId}-${index}`,
                primitives.box({ width: 0.11, height: 1.34, length: 0.11 }),
                index % 2 === 0 ? circuitColor : accent,
                'GLOW',
            );
            gate.setPosition(Math.cos(angle) * 2.02, 0.94, Math.sin(angle) * 2.02);
            root.addChild(gate);
            this.pulse(gate, 0.78, 1.22, 0.38 + index * 0.035);
        }

        const streakPips = Math.max(0, Math.min(6, podiumStreak));
        for (let index = 0; index < streakPips; index++) {
            const angle = Math.PI * 2 * index / Math.max(1, streakPips);
            const pip = this.primitive(
                `ClassicRivalGauntletPodiumPipV98-${playerId}-${index}`,
                primitives.sphere(0.13, { segments: 12 }),
                new Color(255, 180, 68),
                'GLOW',
            );
            pip.setPosition(Math.cos(angle) * 1.08, 2.72 + (index % 2) * 0.16, Math.sin(angle) * 1.08);
            root.addChild(pip);
            this.pulse(pip, 0.84, 1.18, 0.42 + index * 0.05);
        }

        tween(root)
            .to(0.5, { scale: new Vec3(1.08, 1.08, 1.08) }, { easing: 'backOut' })
            .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
            .start();
        this.spin(scoreRing, 52 + completedCircuitCount * 4, 1);
        this.spin(streakRing, 70 + podiumStreak * 3, -1);
        this.spin(core, 84, 1);
        this.pulse(core, 0.86, 1.2, 0.5);
        this.resultAwardMarkers.push(root);
    }

    public animationSnapshot(): BoardAnimationSnapshot {
        const snapshots = Array.from(this.playerAnimations.values())
            .map((controller) => controller.snapshot());
        return {
            controllerCount: snapshots.length,
            authoredStateCount: snapshots.reduce((total, snapshot) => total + snapshot.authoredStateCount, 0),
            proceduralControllerCount: snapshots.filter((snapshot) => snapshot.source === 'PROCEDURAL').length,
        };
    }

    public markOwner(tileIndex: number, colorHex: string): void {
        const tile = this.board[tileIndex];
        if (!tile) return;
        const previous = this.ownerMarkers.get(tileIndex);
        if (previous?.isValid) {
            Tween.stopAllByTarget(previous);
            previous.destroy();
        }

        const side = Math.floor(tile.index / 8);
        const outward = side === 0
            ? new Vec3(0, 0.48, -1.02)
            : side === 1
                ? new Vec3(1.02, 0.48, 0)
                : side === 2
                    ? new Vec3(0, 0.48, 1.02)
                    : new Vec3(-1.02, 0.48, 0);
        const marker = new Node(`ClassicOwnerMarkerV85-${tileIndex}`);
        marker.setPosition(tile.worldPosition.clone().add(outward));
        marker.setRotationFromEuler(new Vec3(0, side * -90, 0));
        marker.setScale(0.08, 0.08, 0.08);
        this.root.addChild(marker);
        const pole = this.primitive(
            'OwnerPole',
            primitives.cylinder(0.045, 0.045, 1.05, { radialSegments: 10 }),
            new Color(242, 204, 91),
            'METAL',
        );
        pole.setPosition(0, 0.52, 0);
        marker.addChild(pole);
        const flag = this.primitive(
            'OwnerFlag',
            primitives.box({ width: 0.82, height: 0.38, length: 0.08 }),
            this.colorFromHex(colorHex),
            'GLOSS',
        );
        flag.setPosition(side === 1 || side === 2 ? -0.34 : 0.34, 0.82, 0);
        marker.addChild(flag);
        const badge = this.primitive(
            'OwnerBadge',
            primitives.sphere(0.12, { segments: 10 }),
            new Color(255, 233, 136),
            'GLOW',
        );
        badge.setPosition(0, 1.08, 0);
        marker.addChild(badge);
        tween(marker)
            .to(0.34, { scale: new Vec3(1.15, 1.15, 1.15) }, { easing: 'backOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
            .start();
        this.ownerMarkers.set(tileIndex, marker);
    }

    public updateProperty(tileIndex: number, colorHex: string, buildingLevel: number): void {
        this.updateVideoReferencePropertyV105(tileIndex, colorHex, buildingLevel);
        return;
        this.markOwner(tileIndex, colorHex);
        this.buildingMarkers.get(tileIndex)?.destroy();
        this.buildingMarkers.delete(tileIndex);
        if (buildingLevel <= 0) return;

        const tile = this.board[tileIndex];
        if (!tile) return;
        const side = Math.floor(tile.index / 8);
        const color = this.colorFromHex(colorHex);
        const skyline = new Node(`ClassicPropertyV85-${tileIndex}-L${buildingLevel}`);
        const inward = side === 0
            ? new Vec3(0, 1.02, 0.42)
            : side === 1
                ? new Vec3(-0.42, 1.02, 0)
                : side === 2
                    ? new Vec3(0, 1.02, -0.42)
                    : new Vec3(0.42, 1.02, 0);
        skyline.setPosition(tile.worldPosition.clone().add(inward));
        skyline.setScale(0.04, 0.04, 0.04);
        skyline.setRotationFromEuler(new Vec3(0, side * -90, 0));
        this.root.addChild(skyline);

        this.playConstructionBurst(tile.worldPosition, color, buildingLevel);

        const foundation = this.primitive(
            'ClassicPropertyFoundationV85',
            primitives.box({ width: 1.75, height: 0.18, length: 1.38 }),
            new Color(39, 99, 137),
            'GLOSS',
        );
        foundation.setPosition(0, 0.09, 0);
        skyline.addChild(foundation);
        const foundationTrim = this.primitive(
            'ClassicPropertyFoundationTrimV85',
            primitives.box({ width: 1.58, height: 0.07, length: 1.22 }),
            new Color(245, 199, 81),
            'METAL',
        );
        foundationTrim.setPosition(0, 0.21, 0);
        skyline.addChild(foundationTrim);

        if (buildingLevel >= 4) {
            const tower = this.primitive(
                'ClassicLandmarkTowerV85',
                primitives.box({ width: 1.02, height: 3.15, length: 0.92 }),
                new Color(238, 239, 231),
                'GLOSS',
            );
            tower.setPosition(0, 1.82, 0);
            skyline.addChild(tower);
            const glassCore = this.primitive(
                'ClassicLandmarkGlassCoreV85',
                primitives.box({ width: 0.58, height: 2.78, length: 0.96 }),
                color,
                'GLOW',
            );
            glassCore.setPosition(0, 1.84, 0.01);
            skyline.addChild(glassCore);
            const crown = this.primitive(
                'ClassicLandmarkCrownV85',
                primitives.cylinder(0.76, 0.46, 0.38, { radialSegments: 18 }),
                new Color(255, 221, 104),
                'METAL',
            );
            crown.setPosition(0, 3.56, 0);
            skyline.addChild(crown);
            const beacon = this.primitive(
                'ClassicLandmarkBeaconV85',
                primitives.sphere(0.23, { segments: 12 }),
                new Color(108, 239, 255),
                'GLOW',
            );
            beacon.setPosition(0, 3.92, 0);
            skyline.addChild(beacon);
            this.pulse(beacon, 0.84, 1.30, 0.58);
            const landmarkHalo = this.primitive(
                `ClassicLandmarkHaloV85-${tileIndex}`,
                primitives.torus(0.92, 0.065, { radialSegments: 30, tubularSegments: 10 }),
                new Color(255, 224, 112),
                'GLOW',
            );
            landmarkHalo.setPosition(0, 3.58, 0);
            landmarkHalo.setRotationFromEuler(new Vec3(90, 0, 0));
            skyline.addChild(landmarkHalo);
            this.spin(landmarkHalo, 38, tileIndex % 2 === 0 ? 1 : -1);
        } else if (buildingLevel === 3) {
            const hotel = this.primitive(
                'ClassicHotelV85',
                primitives.box({ width: 1.24, height: 2.45, length: 1.00 }),
                new Color(248, 239, 220),
                'GLOSS',
            );
            hotel.setPosition(0, 1.46, 0);
            skyline.addChild(hotel);
            for (let row = 0; row < 4; row++) {
                const window = this.primitive(
                    `ClassicHotelWindowV85-${row}`,
                    primitives.box({ width: 0.72, height: 0.22, length: 0.05 }),
                    row % 2 === 0 ? color : new Color(255, 225, 125),
                    'GLOW',
                );
                window.setPosition(0, 0.70 + row * 0.48, 0.53);
                skyline.addChild(window);
            }
            const roof = this.primitive(
                'ClassicHotelRoofV85',
                primitives.cylinder(0.82, 0.60, 0.30, { radialSegments: 16 }),
                color,
                'METAL',
            );
            roof.setPosition(0, 2.82, 0);
            skyline.addChild(roof);
            const marquee = this.primitive(
                `ClassicHotelMarqueeV85-${tileIndex}`,
                primitives.box({ width: 1.02, height: 0.18, length: 0.08 }),
                new Color(255, 219, 112),
                'GLOW',
            );
            marquee.setPosition(0, 1.82, 0.55);
            skyline.addChild(marquee);
        } else {
            const count = buildingLevel === 1 ? 2 : 3;
            const offsets = [new Vec3(-0.48, 0, -0.18), new Vec3(0.48, 0, 0.18), new Vec3(0, 0, -0.46)];
            for (let index = 0; index < count; index++) {
                const villa = buildingLevel === 1;
                const height = villa ? 0.92 + index * 0.10 : 1.38 + index * 0.20;
                const footprint = villa ? 0.62 : 0.68;
                const building = this.primitive(
                    `${villa ? 'ClassicVilla' : 'ClassicBuilding'}V85-${index}`,
                    primitives.box({ width: footprint, height, length: footprint }),
                    index === count - 1 ? new Color(244, 238, 220) : color,
                    'GLOSS',
                );
                const offset = offsets[index] ?? Vec3.ZERO;
                building.setPosition(offset.x, 0.25 + height * 0.5, offset.z);
                skyline.addChild(building);
                const roof = this.primitive(
                    `ClassicPropertyRoofV85-${index}`,
                    primitives.cylinder(footprint * 0.62, footprint * 0.43, villa ? 0.22 : 0.18, { radialSegments: 12 }),
                    index === count - 1 ? color : new Color(255, 214, 95),
                    'METAL',
                );
                roof.setPosition(offset.x, 0.25 + height + 0.10, offset.z);
                skyline.addChild(roof);
                const window = this.primitive(
                    `ClassicPropertyWindowV85-${index}`,
                    primitives.box({ width: 0.28, height: Math.max(0.26, height * 0.40), length: 0.04 }),
                    new Color(163, 239, 255),
                    'GLOW',
                );
                window.setPosition(offset.x, 0.32 + height * 0.55, offset.z + footprint * 0.51);
                skyline.addChild(window);
            }
        }

        const economyRoot = new Node(`ClassicPropertyEconomyHubV85-${tileIndex}`);
        economyRoot.setPosition(0, 0.28, 0);
        skyline.addChild(economyRoot);
        const meterCount = Math.max(1, Math.min(4, buildingLevel));
        for (let index = 0; index < meterCount; index++) {
            const height = 0.34 + index * 0.18 + buildingLevel * 0.08;
            const meter = this.primitive(
                `ClassicPropertyRentMeterV85-${tileIndex}-${index}`,
                primitives.box({ width: 0.13, height, length: 0.13 }),
                index === meterCount - 1 ? new Color(255, 231, 132) : color,
                'GLOW',
            );
            meter.setPosition(-0.30 + index * 0.20, height * 0.5, -0.66);
            economyRoot.addChild(meter);
            this.pulse(meter, 0.86, 1.16, 0.58 + index * 0.05);
        }

        const economyOrbit = new Node(`ClassicPropertyEconomyOrbitV85-${tileIndex}`);
        economyOrbit.setPosition(0, buildingLevel >= 4 ? 3.08 : buildingLevel === 3 ? 2.44 : 1.70, 0);
        skyline.addChild(economyOrbit);
        for (let index = 0; index < 3; index++) {
            const angle = Math.PI * 2 * index / 3;
            const coin = this.primitive(
                `ClassicPropertyEconomyCoinV85-${tileIndex}-${index}`,
                primitives.cylinder(0.11, 0.11, 0.045, { radialSegments: 16 }),
                index === 0 ? new Color(255, 230, 117) : color,
                'METAL',
            );
            coin.setPosition(Math.cos(angle) * 0.66, index * 0.06, Math.sin(angle) * 0.66);
            coin.setRotationFromEuler(new Vec3(90, 0, 0));
            economyOrbit.addChild(coin);
        }
        this.spin(economyOrbit, 28 + buildingLevel * 6, tileIndex % 2 === 0 ? 1 : -1);

        const developmentHalo = this.primitive(
            `ClassicDevelopmentTierHaloV89-${tileIndex}`,
            primitives.torus(1.18 + buildingLevel * 0.04, 0.055, { radialSegments: 30, tubularSegments: 9 }),
            buildingLevel >= 3 ? new Color(255, 226, 116) : color,
            'GLOW',
        );
        developmentHalo.setPosition(0, 0.34, 0);
        developmentHalo.setRotationFromEuler(new Vec3(90, 0, 0));
        skyline.addChild(developmentHalo);
        this.spin(developmentHalo, 24 + buildingLevel * 6, tileIndex % 2 === 0 ? -1 : 1);

        const yieldBeacon = this.primitive(
            `ClassicPropertyYieldBeaconV89-${tileIndex}`,
            primitives.cylinder(0.07, 0.15, 0.90 + buildingLevel * 0.28, { radialSegments: 12 }),
            buildingLevel >= 3 ? new Color(255, 231, 130) : color,
            'GLOW',
        );
        yieldBeacon.setPosition(0, buildingLevel >= 4 ? 4.92 : buildingLevel === 3 ? 3.86 : 2.62, 0);
        skyline.addChild(yieldBeacon);
        this.pulse(yieldBeacon, 0.82, 1.22, 0.58);

        for (let index = 0; index < Math.max(1, buildingLevel); index++) {
            const angle = Math.PI * 2 * index / Math.max(1, buildingLevel);
            const flag = this.primitive(
                `ClassicDevelopmentFlagV89-${tileIndex}-${index}`,
                primitives.box({ width: 0.18, height: 0.32, length: 0.06 }),
                index % 2 === 0 ? color : new Color(255, 224, 112),
                'GLOW',
            );
            flag.setPosition(Math.cos(angle) * 0.88, 0.72 + index * 0.05, Math.sin(angle) * 0.88);
            flag.setRotationFromEuler(new Vec3(0, -angle * 180 / Math.PI, 8));
            skyline.addChild(flag);
            this.pulse(flag, 0.84, 1.16, 0.52 + index * 0.04);
        }

        const districtPulse = this.primitive(
            `ClassicPropertyDistrictPulseV85-${tileIndex}`,
            primitives.torus(1.04, 0.045, { radialSegments: 28, tubularSegments: 9 }),
            buildingLevel >= 3 ? new Color(255, 224, 117) : color,
            'GLOW',
        );
        districtPulse.setPosition(0, 0.26, 0);
        districtPulse.setRotationFromEuler(new Vec3(90, 0, 0));
        skyline.addChild(districtPulse);
        this.spin(districtPulse, 20 + buildingLevel * 5, tileIndex % 2 === 0 ? 1 : -1);

        const lampPositions = [
            new Vec3(-0.70, 0.30, -0.48),
            new Vec3(0.70, 0.30, -0.48),
            new Vec3(0.70, 0.30, 0.48),
            new Vec3(-0.70, 0.30, 0.48),
        ];
        lampPositions.forEach((position, index) => {
            const pole = this.primitive(
                `ClassicPropertyStreetPoleV85-${tileIndex}-${index}`,
                primitives.cylinder(0.025, 0.035, 0.58, { radialSegments: 10 }),
                new Color(225, 188, 77),
                'METAL',
            );
            pole.setPosition(position);
            skyline.addChild(pole);
            const light = this.primitive(
                `ClassicPropertyStreetLampV85-${tileIndex}-${index}`,
                primitives.sphere(0.09, { segments: 8 }),
                index % 2 === 0 ? new Color(151, 239, 255) : new Color(255, 231, 137),
                'GLOW',
            );
            light.setPosition(position.clone().add3f(0, 0.34, 0));
            skyline.addChild(light);
            this.pulse(light, 0.82, 1.18, 0.60 + index * 0.04);
        });

        if (buildingLevel >= 3) {
            const statusCrown = this.primitive(
                `ClassicPropertyStatusCrownV85-${tileIndex}`,
                primitives.torus(0.42, 0.055, { radialSegments: 24, tubularSegments: 8 }),
                buildingLevel >= 4 ? new Color(255, 235, 135) : color,
                'GLOW',
            );
            statusCrown.setPosition(0, buildingLevel >= 4 ? 4.52 : 3.48, 0);
            statusCrown.setRotationFromEuler(new Vec3(90, 0, 0));
            skyline.addChild(statusCrown);
            this.spin(statusCrown, 42, tileIndex % 2 === 0 ? 1 : -1);
        }

        const levelBadge = this.primitive(
            `ClassicPropertyLevelBadgeV85-${tileIndex}`,
            primitives.cylinder(0.28 + buildingLevel * 0.025, 0.28 + buildingLevel * 0.025, 0.10, { radialSegments: 18 }),
            buildingLevel >= 4 ? new Color(255, 228, 111) : color,
            buildingLevel >= 3 ? 'GLOW' : 'METAL',
        );
        levelBadge.setPosition(0, buildingLevel >= 4 ? 4.20 : buildingLevel === 3 ? 3.18 : 2.18, 0);
        skyline.addChild(levelBadge);
        if (buildingLevel >= 3) this.pulse(levelBadge, 0.88, 1.18, 0.66);

        tween(skyline)
            .to(0.48, { scale: new Vec3(1.16, 1.16, 1.16) }, { easing: 'backOut' })
            .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
            .start();
        this.buildingMarkers.set(tileIndex, skyline);
    }

    public showTravelDestinations(tileIndices: readonly number[]): void {
        this.clearTravelDestinations();
        for (const tileIndex of tileIndices) {
            const tile = this.board[tileIndex];
            if (!tile) continue;
            const marker = new Node(`WorldTravelOption-${tileIndex}`);
            marker.setPosition(tile.worldPosition.clone().add3f(-0.72, 0.62, -0.72));
            this.root.addChild(marker);
            const disc = this.primitive(
                `WorldTravelOption-${tileIndex}`,
                primitives.cylinder(0.24, 0.24, 0.18),
                new Color(24, 255, 210),
                'GLOW',
            );
            marker.addChild(disc);
            const halo = this.primitive(
                `WorldTravelHalo-${tileIndex}`,
                primitives.cylinder(0.38, 0.38, 0.045),
                new Color(90, 240, 255),
                'GLOW',
            );
            halo.setPosition(0, -0.08, 0);
            marker.addChild(halo);
            this.pulse(marker, 0.82, 1.22, 0.48);
            this.travelHighlights.push(marker);
        }
    }

    public clearTravelDestinations(): void {
        for (const marker of this.travelHighlights) {
            if (marker.isValid) {
                Tween.stopAllByTarget(marker);
                marker.destroy();
            }
        }
        this.travelHighlights.length = 0;
    }

    public showOlympicDestinations(tileIndices: readonly number[]): void {
        this.clearOlympicDestinations();
        for (const tileIndex of tileIndices) {
            const tile = this.board[tileIndex];
            if (!tile) continue;
            const marker = new Node(`OlympicOption-${tileIndex}`);
            marker.setPosition(tile.worldPosition.clone().add3f(0.72, 0.62, 0.72));
            this.root.addChild(marker);
            const flame = this.primitive(
                `OlympicOption-${tileIndex}`,
                primitives.sphere(0.28, { segments: 12 }),
                new Color(255, 126, 55),
                'GLOW',
            );
            marker.addChild(flame);
            const base = this.primitive(
                `OlympicOptionBase-${tileIndex}`,
                primitives.cylinder(0.34, 0.42, 0.18),
                new Color(245, 195, 35),
                'METAL',
            );
            base.setPosition(0, -0.22, 0);
            marker.addChild(base);
            this.pulse(marker, 0.86, 1.18, 0.56);
            this.olympicHighlights.push(marker);
        }
    }

    public clearOlympicDestinations(): void {
        for (const marker of this.olympicHighlights) {
            if (marker.isValid) {
                Tween.stopAllByTarget(marker);
                marker.destroy();
            }
        }
        this.olympicHighlights.length = 0;
    }

    public syncColorMonopolies(groups: readonly {
        readonly groupId: string;
        readonly tileIndices: readonly number[];
        readonly color: string;
    }[]): void {
        const activeTileIndices = new Set(groups.flatMap((group) => group.tileIndices));
        for (const [tileIndex, marker] of Array.from(this.colorMonopolyMarkers.entries())) {
            if (activeTileIndices.has(tileIndex)) continue;
            if (marker.isValid) {
                Tween.stopAllByTarget(marker);
                marker.destroy();
            }
            this.colorMonopolyMarkers.delete(tileIndex);
        }

        for (const group of groups) {
            const ownerColor = this.colorFromHex(group.color);
            for (const tileIndex of group.tileIndices) {
                if (this.colorMonopolyMarkers.has(tileIndex)) continue;
                const tile = this.board[tileIndex];
                if (!tile) continue;

                const root = new Node(`ClassicColorMonopolyGateV89-${group.groupId}-${tileIndex}`);
                root.setPosition(tile.worldPosition.clone().add3f(0, 0.46, 0));
                this.root.addChild(root);

                const floorRing = this.primitive(
                    `ClassicColorMonopolyFloorRingV89-${tileIndex}`,
                    primitives.torus(0.82, 0.055, { radialSegments: 28, tubularSegments: 10 }),
                    new Color(255, 218, 91),
                    'GLOW',
                );
                floorRing.setRotationFromEuler(new Vec3(90, 0, 0));
                floorRing.setScale(0.1, 0.1, 0.1);
                root.addChild(floorRing);
                tween(floorRing)
                    .to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                    .repeatForever(
                        tween<Node>()
                            .to(0.72, { scale: new Vec3(1.08, 1.08, 1.08) }, { easing: 'sineInOut' })
                            .to(0.72, { scale: new Vec3(0.96, 0.96, 0.96) }, { easing: 'sineInOut' }),
                    )
                    .start();

                for (let index = 0; index < 4; index++) {
                    const angle = Math.PI * 2 * index / 4 + Math.PI / 4;
                    const pillar = this.primitive(
                        `ClassicColorMonopolyPillarV89-${tileIndex}-${index}`,
                        primitives.box({ width: 0.09, height: 0.82, length: 0.09 }),
                        index % 2 === 0 ? new Color(255, 224, 116) : ownerColor,
                        index % 2 === 0 ? 'METAL' : 'GLOW',
                    );
                    pillar.setPosition(
                        Math.cos(angle) * 0.72,
                        0.42,
                        Math.sin(angle) * 0.72,
                    );
                    pillar.setScale(1, 0.08, 1);
                    root.addChild(pillar);
                    tween(pillar)
                        .delay(index * 0.04)
                        .to(0.26, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                        .start();
                }

                const crown = this.primitive(
                    `ClassicColorMonopolyCrownV89-${tileIndex}`,
                    primitives.cylinder(0.16, 0.38, 0.22, { radialSegments: 6 }),
                    new Color(255, 219, 86),
                    'GLOW',
                );
                crown.setPosition(0, 1.12, 0);
                crown.setRotationFromEuler(new Vec3(0, 30, 0));
                crown.setScale(0.1, 0.1, 0.1);
                root.addChild(crown);
                tween(crown)
                    .delay(0.1)
                    .to(0.25, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                    .repeatForever(
                        tween<Node>()
                            .by(1.2, { eulerAngles: new Vec3(0, 180, 0) }, { easing: 'linear' }),
                    )
                    .start();

                this.colorMonopolyMarkers.set(tileIndex, root);
            }
        }
    }

    public updateOlympic(tileIndex: number, multiplier: number): void {
        const tile = this.board[tileIndex];
        if (!tile) return;
        this.olympicMarkers.get(tileIndex)?.destroy();
        const marker = new Node(`Olympic-${tileIndex}-x${multiplier}`);
        marker.setPosition(tile.worldPosition.clone().add3f(0.75, 0.68, 0.75));
        this.root.addChild(marker);
        const podium = this.primitive(
            'OlympicPodium',
            primitives.cylinder(0.42, 0.52, 0.42),
            new Color(245, 195, 35),
            'METAL',
        );
        marker.addChild(podium);
        const flame = this.primitive(
            'OlympicFlame',
            primitives.sphere(0.24 + Math.min(multiplier, 3) * 0.04, { segments: 12 }),
            new Color(255, 103, 45),
            'GLOW',
        );
        flame.setPosition(0, 0.48, 0);
        marker.addChild(flame);
        this.pulse(flame, 0.78, 1.26, 0.46);
        this.olympicMarkers.set(tileIndex, marker);
    }

    public destroy(): void {
        for (const playerNode of Array.from(this.playerNodes.values())) this.movement.cancel(playerNode);
        for (const marker of Array.from(this.ownerMarkers.values())) Tween.stopAllByTarget(marker);
        for (const marker of Array.from(this.buildingMarkers.values())) Tween.stopAllByTarget(marker);
        for (const marker of Array.from(this.olympicMarkers.values())) Tween.stopAllByTarget(marker);
        for (const marker of Array.from(this.colorMonopolyMarkers.values())) Tween.stopAllByTarget(marker);
        for (const node of this.ambientNodes) {
            if (node.isValid) Tween.stopAllByTarget(node);
        }
        this.clearTravelDestinations();
        this.clearOlympicDestinations();
        this.clearMovementRoute();
        if (this.activeTileMarker?.isValid) {
            Tween.stopAllByTarget(this.activeTileMarker);
            this.activeTileMarker.destroy();
        }
        this.activeTileMarker = null;
        this.playerNodes.clear();
        this.playerAnimations.clear();
        this.ownerMarkers.clear();
        this.buildingMarkers.clear();
        this.olympicMarkers.clear();
        this.colorMonopolyMarkers.clear();
        this.ambientNodes.length = 0;
        this.centerTurnLamps.length = 0;
        for (const material of this.materialCache.values()) material.destroy();
        this.materialCache.clear();
        if (this.root.isValid) this.root.destroy();
    }


    /**
     * V105 board table based on the supplied gameplay video: a dark wooden client
     * table, a bright property ring, a neutral dice arena, and restrained scenery.
     * Large sky objects, billboards, spectators, and orbit decorations are omitted
     * so the board remains readable from the fixed camera.
     */

    private showVideoReferenceRouteV105(path: readonly number[], colorHex: string): void {
        this.clearMovementRoute();
        const color = this.colorFromHex(colorHex);
        path.forEach((tileIndex, index) => {
            const tile = this.board[tileIndex];
            if (!tile) return;
            const destination = index === path.length - 1;
            const marker = this.primitive(
                `VideoReferenceRouteDotV105-${tileIndex}-${index}`,
                destination
                    ? primitives.torus(0.44, 0.055, { radialSegments: 24, tubularSegments: 8 })
                    : primitives.cylinder(0.10, 0.10, 0.035, { radialSegments: 14 }),
                destination ? new Color(255, 218, 97) : color,
                'GLOW',
            );
            marker.setPosition(tile.worldPosition.clone().add3f(0, destination ? 1.03 : 0.96, 0));
            if (destination) marker.setRotationFromEuler(new Vec3(90, 0, 0));
            marker.setScale(0.25, 0.25, 0.25);
            this.root.addChild(marker);
            tween(marker)
                .delay(index * 0.025)
                .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                .start();
            this.movementRouteMarkers.push(marker);
        });
    }

    private highlightVideoReferenceTileV105(tileIndex: number, colorHex: string): void {
        if (this.activeTileMarker?.isValid) {
            Tween.stopAllByTarget(this.activeTileMarker);
            this.activeTileMarker.destroy();
        }
        const tile = this.board[tileIndex];
        if (!tile) {
            this.activeTileMarker = null;
            return;
        }
        const focus = this.primitive(
            `VideoReferenceActiveTileV105-${tileIndex}`,
            primitives.torus(0.82, 0.065, { radialSegments: 28, tubularSegments: 9 }),
            this.mixColor(this.colorFromHex(colorHex), new Color(255, 221, 112), 0.38),
            'GLOW',
        );
        focus.setPosition(tile.worldPosition.clone().add3f(0, 0.96, 0));
        focus.setRotationFromEuler(new Vec3(90, 0, 0));
        this.root.addChild(focus);
        focus.setScale(0.78, 0.78, 0.78);
        tween(focus).repeatForever(
            tween<Node>()
                .to(0.55, { scale: new Vec3(1.04, 1.04, 1.04) }, { easing: 'sineInOut' })
                .to(0.55, { scale: new Vec3(0.82, 0.82, 0.82) }, { easing: 'sineInOut' }),
        ).start();
        this.activeTileMarker = focus;
    }

    private playVideoReferenceLandingV105(tileIndex: number, colorHex: string): void {
        const tile = this.board[tileIndex];
        if (!tile) return;
        const accent = this.colorFromHex(colorHex);
        const origin = tile.worldPosition.clone().add3f(0, 1.0, 0);
        const ring = this.primitive(
            `VideoReferenceLandingRingV105-${tileIndex}`,
            primitives.torus(0.48, 0.06, { radialSegments: 26, tubularSegments: 8 }),
            new Color(255, 218, 96),
            'GLOW',
        );
        ring.setPosition(origin);
        ring.setRotationFromEuler(new Vec3(90, 0, 0));
        ring.setScale(0.35, 0.35, 0.35);
        this.root.addChild(ring);
        tween(ring)
            .to(0.30, { scale: new Vec3(1.75, 1.75, 1.75) }, { easing: 'quadOut' })
            .to(0.16, { scale: Vec3.ZERO }, { easing: 'quadIn' })
            .call(() => { if (ring.isValid) ring.destroy(); })
            .start();
        for (let index = 0; index < 6; index++) {
            const angle = Math.PI * 2 * index / 6;
            const spark = this.primitive(
                `VideoReferenceLandingSparkV105-${tileIndex}-${index}`,
                primitives.sphere(0.065, { segments: 8 }),
                index % 2 === 0 ? new Color(255, 229, 130) : accent,
                'GLOW',
            );
            spark.setPosition(origin);
            this.root.addChild(spark);
            const target = origin.clone().add3f(Math.cos(angle) * 0.72, 0.36, Math.sin(angle) * 0.72);
            tween(spark)
                .to(0.25, { position: target }, { easing: 'quadOut' })
                .to(0.15, { scale: Vec3.ZERO }, { easing: 'quadIn' })
                .call(() => { if (spark.isValid) spark.destroy(); })
                .start();
        }
    }

    private createVideoReferenceFloorV105(): void {
        const table = this.primitive(
            'VideoReferenceWoodTableV105',
            primitives.box({ width: 37.2, height: 1.05, length: 35.2 }),
            new Color(74, 52, 37),
            'MATTE',
        );
        table.setPosition(0, -1.20, 0);
        this.root.addChild(table);

        const tableInset = this.primitive(
            'VideoReferenceWoodInsetV105',
            primitives.box({ width: 34.8, height: 0.12, length: 32.8 }),
            new Color(48, 35, 29),
            'GLOSS',
        );
        tableInset.setPosition(0, -0.62, 0);
        this.root.addChild(tableInset);

        const boardShadow = this.primitive(
            'VideoReferenceBoardShadowV105',
            primitives.box({ width: 28.7, height: 0.42, length: 28.7 }),
            new Color(32, 28, 27),
            'MATTE',
        );
        boardShadow.setPosition(0, -0.30, 0);
        this.root.addChild(boardShadow);

        const goldFrame = this.primitive(
            'VideoReferenceGoldFrameV105',
            primitives.box({ width: 28.15, height: 0.22, length: 28.15 }),
            new Color(175, 132, 52),
            'METAL',
        );
        goldFrame.setPosition(0, -0.03, 0);
        this.root.addChild(goldFrame);

        const ivoryTrackBase = this.primitive(
            'VideoReferenceIvoryTrackBaseV105',
            primitives.box({ width: 27.65, height: 0.22, length: 27.65 }),
            new Color(226, 222, 199),
            'GLOSS',
        );
        ivoryTrackBase.setPosition(0, 0.18, 0);
        this.root.addChild(ivoryTrackBase);

        const centerFrame = this.primitive(
            'VideoReferenceCenterFrameV105',
            primitives.box({ width: 17.35, height: 0.18, length: 17.35 }),
            new Color(91, 68, 43),
            'METAL',
        );
        centerFrame.setPosition(0, 0.48, 0);
        this.root.addChild(centerFrame);

        const centerArena = this.primitive(
            'VideoReferenceDiceArenaV105',
            primitives.box({ width: 16.85, height: 0.18, length: 16.85 }),
            new Color(84, 84, 82),
            'MATTE',
        );
        centerArena.setPosition(0, 0.62, 0);
        this.root.addChild(centerArena);

        const centerInset = this.primitive(
            'VideoReferenceDiceArenaInsetV105',
            primitives.box({ width: 15.6, height: 0.035, length: 15.6 }),
            new Color(92, 92, 89),
            'GLOSS',
        );
        centerInset.setPosition(0, 0.73, 0);
        this.root.addChild(centerInset);

        const emblemRing = this.primitive(
            'ComePlayersArenaEmblemRingV105',
            primitives.torus(2.15, 0.12, { radialSegments: 40, tubularSegments: 10 }),
            new Color(132, 132, 126),
            'METAL',
        );
        emblemRing.setPosition(0, 0.80, 0);
        emblemRing.setRotationFromEuler(new Vec3(90, 0, 0));
        this.root.addChild(emblemRing);

        const emblemCore = this.primitive(
            'ComePlayersArenaEmblemCoreV105',
            primitives.cylinder(1.18, 1.18, 0.06, { radialSegments: 32 }),
            new Color(103, 103, 99),
            'GLOSS',
        );
        emblemCore.setPosition(0, 0.82, 0);
        this.root.addChild(emblemCore);

        const deckPositions = [new Vec3(-4.4, 0.92, 0), new Vec3(4.4, 0.92, 0)];
        deckPositions.forEach((position, deckIndex) => {
            for (let layer = 0; layer < 5; layer++) {
                const card = this.primitive(
                    `VideoReferenceCardDeckV105-${deckIndex}-${layer}`,
                    primitives.box({ width: 1.70, height: 0.07, length: 2.25 }),
                    deckIndex === 0 ? new Color(218, 188, 103) : new Color(208, 211, 208),
                    layer === 4 ? 'METAL' : 'MATTE',
                );
                card.setPosition(position.clone().add3f(0, layer * 0.075, 0));
                card.setRotationFromEuler(new Vec3(0, deckIndex === 0 ? -8 : 8, 0));
                this.root.addChild(card);
            }
        });

        const cashStacks = [
            new Vec3(-12.7, 0.22, -8.2), new Vec3(12.7, 0.22, -8.2),
            new Vec3(12.7, 0.22, 8.2), new Vec3(-12.7, 0.22, 8.2),
        ];
        cashStacks.forEach((position, index) => this.createVideoReferenceCashStackV105(position, index));

        const lampColors = [
            new Color(55, 190, 235), new Color(249, 196, 56),
            new Color(230, 91, 171), new Color(92, 203, 124),
        ];
        const lampPositions = [
            new Vec3(-5.5, 0.91, -5.5), new Vec3(5.5, 0.91, -5.5),
            new Vec3(5.5, 0.91, 5.5), new Vec3(-5.5, 0.91, 5.5),
        ];
        lampPositions.forEach((position, index) => {
            const lamp = this.primitive(
                `VideoReferenceTurnLampV105-${index}`,
                primitives.sphere(0.16, { segments: 10 }),
                lampColors[index] ?? new Color(255, 215, 85),
                'GLOW',
            );
            lamp.setPosition(position);
            this.root.addChild(lamp);
            this.centerTurnLamps.push(lamp);
        });
    }

    private createVideoReferenceCashStackV105(position: Vec3, stackIndex: number): void {
        const root = new Node(`VideoReferenceCashStackV105-${stackIndex}`);
        root.setPosition(position);
        root.setRotationFromEuler(new Vec3(0, stackIndex * 90 + 45, 0));
        this.root.addChild(root);
        for (let row = 0; row < 3; row++) {
            for (let column = 0; column < 4; column++) {
                const bundle = this.primitive(
                    `CashBundle-${row}-${column}`,
                    primitives.box({ width: 0.68, height: 0.22, length: 0.38 }),
                    row === 2 ? new Color(201, 214, 216) : new Color(169, 186, 190),
                    'GLOSS',
                );
                bundle.setPosition((column - 1.5) * 0.62, row * 0.23, 0);
                root.addChild(bundle);
                const strap = this.primitive(
                    `CashStrap-${row}-${column}`,
                    primitives.box({ width: 0.12, height: 0.235, length: 0.40 }),
                    new Color(84, 124, 137),
                    'MATTE',
                );
                strap.setPosition((column - 1.5) * 0.62, row * 0.23, 0);
                root.addChild(strap);
            }
        }
    }

    private createVideoReferenceTileV105(tile: BoardTileData): void {
        const cityGroup = Number.parseInt(tile.colorGroup.replace('group-', ''), 10);
        const districtColor = tile.tileType === TileType.City
            ? (CITY_GROUP_COLORS[Number.isFinite(cityGroup) ? cityGroup % CITY_GROUP_COLORS.length : 0] ?? SPECIAL_COLORS[TileType.City])
            : tile.tileType === TileType.Tourist
                ? new Color(72, 180, 218)
                : SPECIAL_COLORS[tile.tileType];
        const side = Math.floor(tile.index / 8);
        const horizontal = side === 0 || side === 2;
        const cornerSpecial = tile.index % 8 === 0;
        const tangential = cornerSpecial ? 3.40 : 2.30;
        const radial = cornerSpecial ? 3.40 : 3.28;
        const width = horizontal ? tangential : radial;
        const length = horizontal ? radial : tangential;
        const isProperty = tile.tileType === TileType.City || tile.tileType === TileType.Tourist;

        const shadow = this.primitive(
            `VideoReferenceTileShadowV105-${tile.index}`,
            primitives.box({ width: width + 0.18, height: 0.18, length: length + 0.18 }),
            new Color(64, 51, 42),
            'MATTE',
        );
        shadow.setPosition(tile.worldPosition.clone().add3f(0, 0.26, 0));
        this.root.addChild(shadow);

        const frame = this.primitive(
            `VideoReferenceTileFrameV105-${tile.index}`,
            primitives.box({ width, height: 0.30, length }),
            new Color(213, 211, 195),
            'GLOSS',
        );
        frame.setPosition(tile.worldPosition.clone().add3f(0, 0.45, 0));
        this.root.addChild(frame);

        const faceColor = isProperty
            ? new Color(241, 240, 225)
            : this.mixColor(new Color(235, 232, 214), districtColor, 0.28);
        const face = this.primitive(
            `VideoReferenceTileFaceV105-${tile.index}-${tile.displayName}`,
            primitives.box({ width: width - 0.16, height: 0.10, length: length - 0.16 }),
            faceColor,
            'GLOSS',
        );
        face.setPosition(tile.worldPosition.clone().add3f(0, 0.66, 0));
        this.root.addChild(face);

        const outerOffset = side === 0
            ? new Vec3(0, 0.75, -0.93)
            : side === 1
                ? new Vec3(0.93, 0.75, 0)
                : side === 2
                    ? new Vec3(0, 0.75, 0.93)
                    : new Vec3(-0.93, 0.75, 0);
        const bandWidth = horizontal ? width - 0.20 : 0.72;
        const bandLength = horizontal ? 0.72 : length - 0.20;
        const band = this.primitive(
            `VideoReferenceDistrictBandV105-${tile.index}`,
            primitives.box({ width: bandWidth, height: 0.10, length: bandLength }),
            districtColor,
            tile.tileType === TileType.City ? 'GLOSS' : 'GLOW',
        );
        band.setPosition(tile.worldPosition.clone().add(outerOffset));
        this.root.addChild(band);

        const pipCount = cornerSpecial ? 3 : Math.max(1, Math.min(3, Math.ceil(tile.purchasePrice / 120000)));
        for (let index = 0; index < pipCount; index++) {
            const across = (index - (pipCount - 1) * 0.5) * 0.34;
            const pipOffset = horizontal
                ? new Vec3(across, 0.84, outerOffset.z)
                : new Vec3(outerOffset.x, 0.84, across);
            const pip = this.primitive(
                `VideoReferencePricePipV105-${tile.index}-${index}`,
                primitives.sphere(0.075, { segments: 8 }),
                new Color(255, 242, 187),
                'GLOW',
            );
            pip.setPosition(tile.worldPosition.clone().add(pipOffset));
            this.root.addChild(pip);
        }

        const centerIcon = this.primitive(
            `VideoReferenceTileIconV105-${tile.index}`,
            tile.tileType === TileType.City
                ? primitives.box({ width: 0.42, height: 0.10, length: 0.42 })
                : primitives.cylinder(cornerSpecial ? 0.34 : 0.24, cornerSpecial ? 0.34 : 0.24, 0.12, { radialSegments: 16 }),
            tile.tileType === TileType.City ? new Color(193, 195, 188) : districtColor,
            tile.tileType === TileType.City ? 'METAL' : 'GLOW',
        );
        centerIcon.setPosition(tile.worldPosition.clone().add3f(0, 0.82, 0));
        this.root.addChild(centerIcon);

        if (tile.tileType === TileType.Tourist) {
            this.createTouristLandmark(tile);
        }
    }

    private updateVideoReferencePropertyV105(tileIndex: number, colorHex: string, buildingLevel: number): void {
        this.markOwner(tileIndex, colorHex);
        this.buildingMarkers.get(tileIndex)?.destroy();
        this.buildingMarkers.delete(tileIndex);
        if (buildingLevel <= 0) return;
        const tile = this.board[tileIndex];
        if (!tile) return;
        const side = Math.floor(tile.index / 8);
        const color = this.colorFromHex(colorHex);
        const root = new Node(`VideoReferencePropertyV105-${tileIndex}-L${buildingLevel}`);
        const inward = side === 0
            ? new Vec3(0, 0.92, 0.38)
            : side === 1
                ? new Vec3(-0.38, 0.92, 0)
                : side === 2
                    ? new Vec3(0, 0.92, -0.38)
                    : new Vec3(0.38, 0.92, 0);
        root.setPosition(tile.worldPosition.clone().add(inward));
        root.setRotationFromEuler(new Vec3(0, side * -90, 0));
        root.setScale(0.10, 0.10, 0.10);
        this.root.addChild(root);
        this.playConstructionBurst(tile.worldPosition, color, buildingLevel);

        const foundation = this.primitive(
            'VideoReferencePropertyFoundationV105',
            primitives.box({ width: 1.45, height: 0.14, length: 1.15 }),
            new Color(77, 70, 62),
            'MATTE',
        );
        foundation.setPosition(0, 0.07, 0);
        root.addChild(foundation);

        if (buildingLevel === 1) {
            [-0.34, 0.34].forEach((x, index) => {
                const villa = this.primitive(
                    `VideoReferenceVillaV105-${index}`,
                    primitives.box({ width: 0.48, height: 0.72, length: 0.52 }),
                    index === 0 ? color : new Color(235, 229, 208),
                    'GLOSS',
                );
                villa.setPosition(x, 0.48, 0);
                root.addChild(villa);
                const roof = this.primitive(
                    `VideoReferenceVillaRoofV105-${index}`,
                    primitives.cylinder(0.34, 0.24, 0.18, { radialSegments: 4 }),
                    index === 0 ? new Color(255, 210, 84) : color,
                    'METAL',
                );
                roof.setPosition(x, 0.92, 0);
                roof.setRotationFromEuler(new Vec3(0, 45, 0));
                root.addChild(roof);
            });
        } else if (buildingLevel === 2) {
            [-0.40, 0, 0.40].forEach((x, index) => {
                const height = 1.05 + index * 0.18;
                const building = this.primitive(
                    `VideoReferenceBuildingV105-${index}`,
                    primitives.box({ width: 0.38, height, length: 0.46 }),
                    index === 1 ? new Color(232, 229, 214) : color,
                    'GLOSS',
                );
                building.setPosition(x, 0.14 + height * 0.5, 0);
                root.addChild(building);
            });
        } else if (buildingLevel === 3) {
            const hotel = this.primitive(
                'VideoReferenceHotelV105',
                primitives.box({ width: 0.98, height: 1.85, length: 0.78 }),
                new Color(234, 228, 207),
                'GLOSS',
            );
            hotel.setPosition(0, 1.02, 0);
            root.addChild(hotel);
            const facade = this.primitive(
                'VideoReferenceHotelFacadeV105',
                primitives.box({ width: 0.58, height: 1.26, length: 0.05 }),
                color,
                'GLOW',
            );
            facade.setPosition(0, 1.04, 0.42);
            root.addChild(facade);
            const roof = this.primitive(
                'VideoReferenceHotelRoofV105',
                primitives.cylinder(0.65, 0.48, 0.24, { radialSegments: 12 }),
                new Color(228, 179, 62),
                'METAL',
            );
            roof.setPosition(0, 2.06, 0);
            root.addChild(roof);
        } else {
            const landmark = this.primitive(
                'VideoReferenceLandmarkV105',
                primitives.box({ width: 0.82, height: 2.55, length: 0.72 }),
                new Color(225, 226, 216),
                'GLOSS',
            );
            landmark.setPosition(0, 1.38, 0);
            root.addChild(landmark);
            const core = this.primitive(
                'VideoReferenceLandmarkCoreV105',
                primitives.box({ width: 0.42, height: 2.16, length: 0.76 }),
                color,
                'GLOW',
            );
            core.setPosition(0, 1.40, 0.02);
            root.addChild(core);
            const crown = this.primitive(
                'VideoReferenceLandmarkCrownV105',
                primitives.cylinder(0.52, 0.34, 0.26, { radialSegments: 12 }),
                new Color(242, 199, 70),
                'METAL',
            );
            crown.setPosition(0, 2.82, 0);
            root.addChild(crown);
        }

        tween(root)
            .to(0.34, { scale: new Vec3(1.08, 1.08, 1.08) }, { easing: 'backOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
            .start();
        this.buildingMarkers.set(tileIndex, root);
    }

    private createFloor(): void {
        // V85 rebuilds the match board around the bright, playful visual density of a
        // classic PC marble game: a blue arcade cabinet frame, ivory property cards,
        // saturated district bands, a world diorama, and readable corner attractions.
        const cabinetBase = this.primitive(
            'ClassicArcadeCabinetBaseV85',
            primitives.box({ width: 35.4, height: 0.92, length: 33.4 }),
            new Color(18, 56, 91),
            'GLOSS',
        );
        cabinetBase.setPosition(0, -1.18, 0);
        this.root.addChild(cabinetBase);

        const cabinetGlow = this.primitive(
            'ClassicArcadeCabinetGlowV85',
            primitives.box({ width: 34.6, height: 0.16, length: 32.6 }),
            new Color(58, 171, 224),
            'GLOW',
        );
        cabinetGlow.setPosition(0, -0.68, 0);
        this.root.addChild(cabinetGlow);

        const outerFrame = this.primitive(
            'ClassicBlueOuterFrameV85',
            primitives.box({ width: 27.7, height: 0.58, length: 27.7 }),
            new Color(26, 107, 164),
            'GLOSS',
        );
        outerFrame.setPosition(0, -0.34, 0);
        this.root.addChild(outerFrame);

        const outerHighlight = this.primitive(
            'ClassicBlueOuterHighlightV85',
            primitives.box({ width: 27.15, height: 0.13, length: 27.15 }),
            new Color(105, 211, 244),
            'GLOW',
        );
        outerHighlight.setPosition(0, -0.01, 0);
        this.root.addChild(outerHighlight);

        const goldFrame = this.primitive(
            'ClassicGoldFrameV85',
            primitives.box({ width: 26.58, height: 0.20, length: 26.58 }),
            new Color(238, 188, 64),
            'METAL',
        );
        goldFrame.setPosition(0, 0.10, 0);
        this.root.addChild(goldFrame);

        const ivoryBoard = this.primitive(
            'ClassicIvoryBoardV85',
            primitives.box({ width: 25.92, height: 0.22, length: 25.92 }),
            new Color(247, 243, 222),
            'GLOSS',
        );
        ivoryBoard.setPosition(0, 0.27, 0);
        this.root.addChild(ivoryBoard);

        const centerGold = this.primitive(
            'ClassicCenterGoldFrameV85',
            primitives.box({ width: 16.35, height: 0.14, length: 16.35 }),
            new Color(235, 188, 72),
            'METAL',
        );
        centerGold.setPosition(0, 0.56, 0);
        this.root.addChild(centerGold);

        const centerField = this.primitive(
            'ClassicSkyCenterFieldV85',
            primitives.box({ width: 15.85, height: 0.18, length: 15.85 }),
            new Color(53, 153, 205),
            'GLOSS',
        );
        centerField.setPosition(0, 0.70, 0);
        this.root.addChild(centerField);

        // Layered quadrants approximate a lively sky/world backdrop without external assets.
        const centerQuadrants = [
            [new Vec3(-3.88, 0.81, -3.88), new Color(65, 174, 222)],
            [new Vec3(3.88, 0.81, -3.88), new Color(93, 192, 225)],
            [new Vec3(3.88, 0.81, 3.88), new Color(47, 139, 193)],
            [new Vec3(-3.88, 0.81, 3.88), new Color(78, 180, 218)],
        ] as const;
        centerQuadrants.forEach(([position, color], index) => {
            const quadrant = this.primitive(
                `ClassicSkyQuadrantV85-${index}`,
                primitives.box({ width: 7.68, height: 0.04, length: 7.68 }),
                color,
                'GLOSS',
            );
            quadrant.setPosition(position);
            this.root.addChild(quadrant);
        });

        // Soft cloud islands add the busy, cheerful center composition associated with
        // classic marble boards while remaining completely original ComePlayers geometry.
        const cloudPositions = [
            new Vec3(-5.2, 0.91, -4.8), new Vec3(4.9, 0.91, -4.6),
            new Vec3(5.2, 0.91, 4.5), new Vec3(-5.0, 0.91, 4.8),
            new Vec3(-2.8, 0.91, 0.2), new Vec3(3.1, 0.91, -0.1),
        ];
        cloudPositions.forEach((position, index) => {
            const cloud = new Node(`ClassicCloudClusterV85-${index}`);
            cloud.setPosition(position);
            this.root.addChild(cloud);
            [-0.42, 0, 0.42].forEach((x, puffIndex) => {
                const puff = this.primitive(
                    `CloudPuff-${puffIndex}`,
                    primitives.sphere(0.48 - Math.abs(puffIndex - 1) * 0.07, { segments: 12 }),
                    new Color(236, 247, 250, 225),
                    'GLOSS',
                );
                puff.setPosition(x, puffIndex === 1 ? 0.16 : 0, 0);
                puff.setScale(1.35, 0.46, 0.82);
                cloud.addChild(puff);
            });
        });

        const innerRails: readonly [Vec3, number, number][] = [
            [new Vec3(0, 0.91, -8.03), 15.92, 0.12],
            [new Vec3(0, 0.91, 8.03), 15.92, 0.12],
            [new Vec3(-8.03, 0.91, 0), 0.12, 15.92],
            [new Vec3(8.03, 0.91, 0), 0.12, 15.92],
        ];
        innerRails.forEach(([position, width, length], index) => {
            const rail = this.primitive(
                `ClassicInnerGoldRailV85-${index}`,
                primitives.box({ width, height: 0.08, length }),
                new Color(255, 217, 105),
                'METAL',
            );
            rail.setPosition(position);
            this.root.addChild(rail);
        });

        const cornerPositions = [
            new Vec3(-10.5, 0.58, -10.5), new Vec3(10.5, 0.58, -10.5),
            new Vec3(10.5, 0.58, 10.5), new Vec3(-10.5, 0.58, 10.5),
        ];
        cornerPositions.forEach((position, index) => this.createCornerLandmark(index, position));

        this.createClassicWorldCenterV85();

        // Animated player lamps are kept close to the center so turn ownership can be read
        // without relying only on the HUD.
        const lampColors = [
            new Color(55, 190, 235), new Color(249, 196, 56),
            new Color(230, 91, 171), new Color(92, 203, 124),
        ];
        const lampPositions = [
            new Vec3(-5.6, 1.02, -2.65), new Vec3(5.6, 1.02, -2.65),
            new Vec3(5.6, 1.02, 2.65), new Vec3(-5.6, 1.02, 2.65),
        ];
        lampPositions.forEach((position, index) => {
            const base = this.primitive(
                `ClassicTurnLampBaseV85-${index}`,
                primitives.cylinder(0.38, 0.48, 0.14, { radialSegments: 18 }),
                new Color(30, 68, 102),
                'METAL',
            );
            base.setPosition(position);
            this.root.addChild(base);
            const lamp = this.primitive(
                `ClassicTurnLampV85-${index}`,
                primitives.sphere(0.23, { segments: 12 }),
                lampColors[index] ?? new Color(255, 215, 85),
                'GLOW',
            );
            lamp.setPosition(position.clone().add3f(0, 0.20, 0));
            this.root.addChild(lamp);
            lamp.setScale(0.76, 0.76, 0.76);
            this.centerTurnLamps.push(lamp);
        });

        // Four original arcade companions keep the outside of the board from feeling empty.
        const mascotPositions = [
            new Vec3(-14.8, -0.45, -9.2), new Vec3(14.8, -0.45, -9.2),
            new Vec3(14.8, -0.45, 9.2), new Vec3(-14.8, -0.45, 9.2),
        ];
        mascotPositions.forEach((position, index) => {
            const mascot = new Node(`ClassicArcadeCompanionV85-${index}`);
            mascot.setPosition(position);
            mascot.setRotationFromEuler(new Vec3(0, index * 90 + 35, 0));
            this.root.addChild(mascot);
            const body = this.primitive(
                'CompanionBody',
                primitives.sphere(0.62, { segments: 16 }),
                lampColors[index] ?? new Color(91, 176, 211),
                'GLOSS',
            );
            body.setPosition(0, 0.62, 0);
            mascot.addChild(body);
            const face = this.primitive(
                'CompanionFace',
                primitives.box({ width: 0.76, height: 0.34, length: 0.12 }),
                new Color(24, 46, 67),
                'GLOSS',
            );
            face.setPosition(0, 0.68, 0.53);
            mascot.addChild(face);
            [-0.18, 0.18].forEach((x, eyeIndex) => {
                const eye = this.primitive(
                    `CompanionEye-${eyeIndex}`,
                    primitives.sphere(0.075, { segments: 8 }),
                    new Color(225, 251, 255),
                    'GLOW',
                );
                eye.setPosition(x, 0.69, 0.61);
                mascot.addChild(eye);
            });
            const antenna = this.primitive(
                'CompanionAntenna',
                primitives.cylinder(0.05, 0.05, 0.52),
                new Color(243, 196, 71),
                'METAL',
            );
            antenna.setPosition(0, 1.22, 0);
            mascot.addChild(antenna);
            const signal = this.primitive(
                'CompanionSignal',
                primitives.sphere(0.11, { segments: 8 }),
                new Color(255, 232, 125),
                'GLOW',
            );
            signal.setPosition(0, 1.52, 0);
            mascot.addChild(signal);
            this.pulse(signal, 0.82, 1.22, 0.62 + index * 0.08);
        });

        this.createSpectatorTerracesV85();
        this.createBoardEdgeBillboardsV85();
        this.createBoardBroadcastBeaconsV85();
    }

    private createBoardBroadcastBeaconsV85(): void {
        const positions = [
            new Vec3(-14.2, 0.05, -14.2), new Vec3(14.2, 0.05, -14.2),
            new Vec3(14.2, 0.05, 14.2), new Vec3(-14.2, 0.05, 14.2),
        ];
        const colors = [
            new Color(78, 207, 239), new Color(250, 204, 80),
            new Color(232, 108, 181), new Color(105, 216, 143),
        ];
        positions.forEach((position, index) => {
            const root = new Node(`ClassicBoardBroadcastBeaconV85-${index}`);
            root.setPosition(position);
            root.setRotationFromEuler(new Vec3(0, index * 90 + 45, 0));
            this.root.addChild(root);
            const tower = this.primitive(
                `ClassicBoardBroadcastTowerV85-${index}`,
                primitives.cylinder(0.16, 0.38, 2.45, { radialSegments: 16 }),
                new Color(31, 87, 126),
                'METAL',
            );
            tower.setPosition(0, 1.22, 0);
            root.addChild(tower);
            const signal = this.primitive(
                `ClassicBoardBroadcastSignalV85-${index}`,
                primitives.sphere(0.22, { segments: 12 }),
                colors[index] ?? new Color(255, 229, 123),
                'GLOW',
            );
            signal.setPosition(0, 2.58, 0);
            root.addChild(signal);
            this.pulse(signal, 0.76, 1.30, 0.54 + index * 0.05);
            [0.42, 0.66].forEach((radius, ringIndex) => {
                const ring = this.primitive(
                    `ClassicBoardBroadcastRingV85-${index}-${ringIndex}`,
                    primitives.torus(radius, 0.035, { radialSegments: 24, tubularSegments: 8 }),
                    ringIndex === 0 ? new Color(255, 232, 139) : (colors[index] ?? new Color(255, 229, 123)),
                    'GLOW',
                );
                ring.setPosition(0, 2.58 + ringIndex * 0.14, 0);
                ring.setRotationFromEuler(new Vec3(90, 0, 0));
                root.addChild(ring);
                this.spin(ring, 30 + ringIndex * 12, ringIndex % 2 === 0 ? 1 : -1);
            });
        });
    }

    private createBoardEdgeBillboardsV85(): void {
        const specs: readonly [Vec3, number, number][] = [
            [new Vec3(0, 1.10, -17.05), 0, 0],
            [new Vec3(17.05, 1.10, 0), 90, 1],
            [new Vec3(0, 1.10, 17.05), 180, 2],
            [new Vec3(-17.05, 1.10, 0), 270, 3],
        ];
        const colors = [
            new Color(66, 202, 239), new Color(247, 200, 72),
            new Color(234, 104, 177), new Color(103, 213, 140),
        ];
        specs.forEach(([position, rotation, index]) => {
            const root = new Node(`ClassicBoardBillboardV85-${index}`);
            root.setPosition(position);
            root.setRotationFromEuler(new Vec3(0, rotation, 0));
            this.root.addChild(root);

            const support = this.primitive(
                `ClassicBillboardSupportV85-${index}`,
                primitives.box({ width: 4.80, height: 1.78, length: 0.36 }),
                new Color(20, 61, 95),
                'GLOSS',
            );
            support.setPosition(0, 0.55, 0);
            root.addChild(support);

            const screen = this.primitive(
                `ClassicBillboardScreenV85-${index}`,
                primitives.box({ width: 4.38, height: 1.38, length: 0.12 }),
                colors[index] ?? new Color(87, 184, 219),
                'GLOW',
            );
            screen.setPosition(0, 0.60, 0.24);
            root.addChild(screen);

            const crest = this.primitive(
                `ClassicBillboardCrestV85-${index}`,
                primitives.cylinder(0.36, 0.36, 0.10, { radialSegments: 20 }),
                new Color(255, 232, 137),
                'METAL',
            );
            crest.setPosition(0, 0.60, 0.34);
            crest.setRotationFromEuler(new Vec3(90, 0, 0));
            root.addChild(crest);

            [-1.75, 1.75].forEach((x, lightIndex) => {
                const light = this.primitive(
                    `ClassicBillboardSpotlightV85-${index}-${lightIndex}`,
                    primitives.cylinder(0.05, 0.24, 0.62, { radialSegments: 14 }),
                    new Color(255, 240, 166),
                    'GLOW',
                );
                light.setPosition(x, 1.55, 0.18);
                light.setRotationFromEuler(new Vec3(18, 0, 0));
                root.addChild(light);
                this.pulse(light, 0.82, 1.18, 0.62 + index * 0.05 + lightIndex * 0.04);
            });
        });
    }

    private createSpectatorTerracesV85(): void {
        const standSpecs: readonly [Vec3, number, number, number][] = [
            [new Vec3(0, -0.26, -15.45), 30.6, 2.0, 0],
            [new Vec3(15.45, -0.26, 0), 30.6, 2.0, 90],
            [new Vec3(0, -0.26, 15.45), 30.6, 2.0, 180],
            [new Vec3(-15.45, -0.26, 0), 30.6, 2.0, 270],
        ];
        const crowdColors = [
            new Color(85, 210, 239), new Color(247, 199, 70),
            new Color(235, 107, 178), new Color(104, 214, 139),
        ];
        standSpecs.forEach(([position, width, length, rotation], standIndex) => {
            const stand = new Node(`ClassicSpectatorTerraceV85-${standIndex}`);
            stand.setPosition(position);
            stand.setRotationFromEuler(new Vec3(0, rotation, 0));
            this.root.addChild(stand);
            for (let row = 0; row < 3; row++) {
                const tier = this.primitive(
                    `TerraceTier-${row}`,
                    primitives.box({ width: width - row * 1.1, height: 0.28, length: length + row * 0.72 }),
                    row === 2 ? new Color(34, 86, 124) : new Color(24, 68, 104),
                    'GLOSS',
                );
                tier.setPosition(0, row * 0.26, row * 0.34);
                stand.addChild(tier);
            }
            for (let lightIndex = 0; lightIndex < 11; lightIndex++) {
                const x = (lightIndex - 5) * 2.32;
                const light = this.primitive(
                    `ClassicCrowdLightV85-${standIndex}-${lightIndex}`,
                    primitives.sphere(0.11, { segments: 8 }),
                    crowdColors[(lightIndex + standIndex) % crowdColors.length] ?? new Color(255, 230, 130),
                    'GLOW',
                );
                light.setPosition(x, 0.74 + (lightIndex % 2) * 0.12, 0.52);
                stand.addChild(light);
                this.pulse(light, 0.78, 1.24, 0.72 + (lightIndex % 3) * 0.08);
            }
        });
    }

    private createTile(tile: BoardTileData): void {
        const cityGroup = Number.parseInt(tile.colorGroup.replace('group-', ''), 10);
        const districtColor = tile.tileType === TileType.City
            ? (CITY_GROUP_COLORS[Number.isFinite(cityGroup) ? cityGroup % CITY_GROUP_COLORS.length : 0] ?? SPECIAL_COLORS[TileType.City])
            : tile.tileType === TileType.Tourist
                ? new Color(44, 180, 224)
                : SPECIAL_COLORS[tile.tileType];
        const side = Math.floor(tile.index / 8);
        const horizontal = side === 0 || side === 2;
        const cornerSpecial = tile.index % 8 === 0;
        const tangential = cornerSpecial ? 3.48 : 2.34;
        const radial = cornerSpecial ? 3.48 : 3.34;
        const width = horizontal ? tangential : radial;
        const length = horizontal ? radial : tangential;
        const isProperty = tile.tileType === TileType.City || tile.tileType === TileType.Tourist;
        const tileSurface = cornerSpecial
            ? this.mixColor(new Color(245, 242, 220), districtColor, 0.34)
            : isProperty
                ? new Color(251, 248, 230)
                : this.mixColor(new Color(242, 239, 222), districtColor, 0.34);

        const shadow = this.primitive(
            `ClassicTileShadowV85-${tile.index}`,
            primitives.box({ width: width + 0.20, height: 0.22, length: length + 0.20 }),
            new Color(24, 66, 99),
            'MATTE',
        );
        shadow.setPosition(tile.worldPosition.clone().add3f(0, 0.24, 0));
        this.root.addChild(shadow);

        const blueBase = this.primitive(
            `ClassicTileBlueBaseV85-${tile.index}`,
            primitives.box({ width, height: 0.38, length }),
            cornerSpecial ? new Color(31, 113, 166) : new Color(43, 133, 181),
            'GLOSS',
        );
        blueBase.setPosition(tile.worldPosition.clone().add3f(0, 0.43, 0));
        this.root.addChild(blueBase);

        const goldTrim = this.primitive(
            `ClassicTileGoldTrimV85-${tile.index}`,
            primitives.box({ width: width - 0.08, height: 0.09, length: length - 0.08 }),
            new Color(240, 192, 73),
            'METAL',
        );
        goldTrim.setPosition(tile.worldPosition.clone().add3f(0, 0.67, 0));
        this.root.addChild(goldTrim);

        const cap = this.primitive(
            `ClassicTileCapV85-${tile.index}-${tile.displayName}`,
            primitives.box({ width: width - 0.24, height: 0.14, length: length - 0.24 }),
            tileSurface,
            'GLOSS',
        );
        cap.setPosition(tile.worldPosition.clone().add3f(0, 0.78, 0));
        this.root.addChild(cap);

        const faceInset = this.primitive(
            `ClassicTileFaceInsetV85-${tile.index}`,
            primitives.box({ width: width - 0.52, height: 0.055, length: length - 0.52 }),
            cornerSpecial ? this.mixColor(tileSurface, districtColor, 0.22) : new Color(255, 253, 239),
            'GLOSS',
        );
        faceInset.setPosition(tile.worldPosition.clone().add3f(0, 0.88, 0));
        this.root.addChild(faceInset);

        const crest = this.primitive(
            `ClassicDistrictCrestV85-${tile.index}`,
            primitives.cylinder(cornerSpecial ? 0.34 : 0.22, cornerSpecial ? 0.34 : 0.22, 0.065, { radialSegments: 18 }),
            districtColor,
            tile.tileType === TileType.City ? 'METAL' : 'GLOW',
        );
        crest.setPosition(tile.worldPosition.clone().add3f(0, 0.96, 0));
        this.root.addChild(crest);

        this.createTileAccent(tile, districtColor);
        this.createClassicTileIdentityV85(tile, districtColor, horizontal, cornerSpecial);
        this.createPropertyEconomyMarkerV85(tile, districtColor, side, isProperty, cornerSpecial);

        if (tile.tileType === TileType.Tourist) {
            this.createTouristLandmark(tile);
        } else if (tile.tileType !== TileType.City && !cornerSpecial) {
            this.createSpecialMonument(tile, districtColor);
        }
    }

    private createPropertyEconomyMarkerV85(
        tile: BoardTileData,
        color: Color,
        side: number,
        isProperty: boolean,
        cornerSpecial: boolean,
    ): void {
        if (!isProperty || cornerSpecial) return;
        const root = new Node(`ClassicEconomyMarkerV85-${tile.index}`);
        const inward = side === 0
            ? new Vec3(0.70, 1.02, 0.75)
            : side === 1
                ? new Vec3(-0.75, 1.02, 0.70)
                : side === 2
                    ? new Vec3(-0.70, 1.02, -0.75)
                    : new Vec3(0.75, 1.02, -0.70);
        root.setPosition(tile.worldPosition.clone().add(inward));
        this.root.addChild(root);

        const tier = Math.max(1, Math.min(4, Math.ceil(tile.purchasePrice / 100000)));
        for (let index = 0; index < tier; index++) {
            const pylon = this.primitive(
                `ClassicRentPylonV85-${tile.index}-${index}`,
                primitives.cylinder(0.11 + index * 0.014, 0.16 + index * 0.012, 0.22, { radialSegments: 14 }),
                index === tier - 1 ? new Color(255, 226, 119) : color,
                index === tier - 1 ? 'GLOW' : 'METAL',
            );
            pylon.setPosition(0, 0.12 + index * 0.22, 0);
            root.addChild(pylon);
        }
        const cap = this.primitive(
            `ClassicRentPylonCapV85-${tile.index}`,
            primitives.sphere(0.13, { segments: 10 }),
            tile.tileType === TileType.Tourist ? new Color(106, 238, 255) : new Color(255, 237, 160),
            'GLOW',
        );
        cap.setPosition(0, 0.20 + tier * 0.22, 0);
        root.addChild(cap);
        this.pulse(cap, 0.84, 1.18, 0.70 + (tile.index % 4) * 0.04);

        if (tile.tileType === TileType.Tourist) {
            const crown = this.primitive(
                `ClassicTourismCrownV85-${tile.index}`,
                primitives.torus(0.27, 0.05, { radialSegments: 22, tubularSegments: 8 }),
                new Color(255, 221, 102),
                'GLOW',
            );
            crown.setPosition(0, 0.44 + tier * 0.22, 0);
            crown.setRotationFromEuler(new Vec3(90, 0, 0));
            root.addChild(crown);
            this.spin(crown, 34, tile.index % 2 === 0 ? 1 : -1);
        }
    }

    private createClassicWorldCenterV85(): void {
        const showcase = new Node('ClassicWorldCenterShowcaseV85');
        showcase.setPosition(0, 0.98, 2.25);
        this.root.addChild(showcase);

        const stage = this.primitive(
            'ClassicWorldStageV85',
            primitives.cylinder(2.10, 2.38, 0.34, { radialSegments: 32 }),
            new Color(244, 191, 67),
            'METAL',
        );
        showcase.addChild(stage);
        const stageInset = this.primitive(
            'ClassicWorldStageInsetV85',
            primitives.cylinder(1.82, 2.02, 0.24, { radialSegments: 32 }),
            new Color(31, 101, 153),
            'GLOSS',
        );
        stageInset.setPosition(0, 0.25, 0);
        showcase.addChild(stageInset);

        const globe = this.primitive(
            'ClassicComePlayersGlobeV85',
            primitives.sphere(1.38, { segments: 32 }),
            new Color(61, 188, 225),
            'GLOSS',
        );
        globe.setPosition(0, 1.72, 0);
        showcase.addChild(globe);
        this.spin(globe, 14, 1);

        const equator = this.primitive(
            'ClassicGlobeEquatorV85',
            primitives.torus(1.54, 0.075, { radialSegments: 36, tubularSegments: 12 }),
            new Color(255, 218, 100),
            'METAL',
        );
        equator.setPosition(0, 1.72, 0);
        equator.setRotationFromEuler(new Vec3(74, 0, 18));
        showcase.addChild(equator);
        this.spin(equator, 9, -1);

        const upperOrbit = this.primitive(
            'ClassicGlobeOrbitV85',
            primitives.torus(1.76, 0.045, { radialSegments: 36, tubularSegments: 10 }),
            new Color(225, 247, 255),
            'GLOW',
        );
        upperOrbit.setPosition(0, 1.72, 0);
        upperOrbit.setRotationFromEuler(new Vec3(28, 8, 65));
        showcase.addChild(upperOrbit);
        this.spin(upperOrbit, 11, 1);

        // A dense skyline ring makes the center read as a world-city diorama rather than
        // an empty decorative globe.
        const towerColors = [
            new Color(247, 190, 63), new Color(245, 105, 161),
            new Color(75, 205, 225), new Color(98, 206, 134),
            new Color(156, 124, 225), new Color(245, 133, 70),
        ];
        for (let index = 0; index < 12; index++) {
            const angle = Math.PI * 2 * index / 12;
            const radius = 3.08 + (index % 2) * 0.28;
            const height = 0.92 + (index % 4) * 0.34;
            const tower = this.primitive(
                `ClassicWorldCityTowerV85-${index}`,
                primitives.box({ width: 0.58 + (index % 3) * 0.10, height, length: 0.58 }),
                towerColors[index % towerColors.length] ?? new Color(91, 180, 214),
                'GLOSS',
            );
            tower.setPosition(Math.cos(angle) * radius, height * 0.5, Math.sin(angle) * radius);
            tower.setRotationFromEuler(new Vec3(0, -angle * 180 / Math.PI + 90, 0));
            showcase.addChild(tower);
            const roof = this.primitive(
                `ClassicWorldCityRoofV85-${index}`,
                primitives.cylinder(0.38, 0.28, 0.16, { radialSegments: 12 }),
                new Color(255, 221, 112),
                'METAL',
            );
            roof.setPosition(Math.cos(angle) * radius, height + 0.08, Math.sin(angle) * radius);
            showcase.addChild(roof);
        }

        const diceArena = this.primitive(
            'ClassicCenterDiceArenaV85',
            primitives.cylinder(2.18, 2.18, 0.15, { radialSegments: 32 }),
            new Color(143, 67, 164),
            'GLOSS',
        );
        diceArena.setPosition(0, 0.07, -5.08);
        showcase.addChild(diceArena);
        const diceRing = this.primitive(
            'ClassicCenterDiceRingV85',
            primitives.torus(2.13, 0.10, { radialSegments: 36, tubularSegments: 12 }),
            new Color(255, 211, 91),
            'METAL',
        );
        diceRing.setPosition(0, 0.22, -5.08);
        diceRing.setRotationFromEuler(new Vec3(90, 0, 0));
        showcase.addChild(diceRing);

        const deckSpecs = [
            [new Vec3(-4.85, 0.26, -1.15), new Color(249, 185, 61), -14],
            [new Vec3(4.85, 0.26, -1.15), new Color(93, 91, 210), 14],
        ] as const;
        deckSpecs.forEach(([position, color, rotation], index) => {
            const deck = this.primitive(
                `ClassicChanceDeckV85-${index}`,
                primitives.box({ width: 2.05, height: 0.30, length: 1.42 }),
                color,
                'GLOSS',
            );
            deck.setPosition(position);
            deck.setRotationFromEuler(new Vec3(0, rotation, 0));
            showcase.addChild(deck);
            const deckBadge = this.primitive(
                `ClassicChanceDeckBadgeV85-${index}`,
                primitives.cylinder(0.33, 0.33, 0.07, { radialSegments: 18 }),
                new Color(255, 234, 141),
                'GLOW',
            );
            deckBadge.setPosition(position.clone().add3f(0, 0.21, 0));
            showcase.addChild(deckBadge);
        });

        this.createWorldOrbitRacersV85(showcase);
        this.createMatchDirectorHubV85(showcase);
    }

    private createMatchDirectorHubV85(showcase: Node): void {
        const hub = new Node('ClassicMatchDirectorHubV85');
        hub.setPosition(0, 0.30, 0);
        showcase.addChild(hub);

        [1.45, 1.72, 2.00].forEach((radius, index) => {
            const ring = this.primitive(
                `ClassicMatchDirectorRingV85-${index}`,
                primitives.torus(radius, index === 1 ? 0.045 : 0.028, { radialSegments: 40, tubularSegments: 8 }),
                index === 1 ? new Color(255, 226, 116) : new Color(163, 239, 255),
                'GLOW',
            );
            ring.setRotationFromEuler(new Vec3(90, 0, 0));
            ring.setPosition(0, index * 0.08, 0);
            hub.addChild(ring);
            this.spin(ring, 15 + index * 7, index % 2 === 0 ? 1 : -1);
        });

        const beaconColors = [
            new Color(55, 190, 235), new Color(249, 196, 56),
            new Color(230, 91, 171), new Color(92, 203, 124),
        ];
        beaconColors.forEach((color, index) => {
            const angle = Math.PI * 2 * index / beaconColors.length + Math.PI / 4;
            const beacon = this.primitive(
                `ClassicMatchDirectorBeaconV85-${index}`,
                primitives.cylinder(0.07, 0.22, 0.72, { radialSegments: 16 }),
                color,
                'GLOW',
            );
            beacon.setPosition(Math.cos(angle) * 2.26, 0.46, Math.sin(angle) * 2.26);
            hub.addChild(beacon);
            this.pulse(beacon, 0.78, 1.24, 0.56 + index * 0.06);
        });
    }

    private createWorldOrbitRacersV85(showcase: Node): void {
        const racerColors = [
            new Color(255, 201, 67), new Color(239, 98, 172),
            new Color(75, 216, 238), new Color(103, 213, 139),
        ];
        racerColors.forEach((color, index) => {
            const orbit = new Node(`ClassicWorldOrbitLaneV85-${index}`);
            orbit.setPosition(0, 1.78, 0);
            orbit.setRotationFromEuler(new Vec3(18 + index * 12, index * 45, 32 + index * 9));
            showcase.addChild(orbit);
            const lane = this.primitive(
                `ClassicWorldOrbitRailV85-${index}`,
                primitives.torus(2.08 + index * 0.20, 0.025, { radialSegments: 36, tubularSegments: 8 }),
                new Color(228, 247, 255, 170),
                'GLOW',
            );
            orbit.addChild(lane);
            const racer = new Node(`ClassicWorldRacerV85-${index}`);
            racer.setPosition(2.08 + index * 0.20, 0, 0);
            orbit.addChild(racer);
            const body = this.primitive(
                'RacerBody',
                primitives.capsule(0.13, 0.52),
                color,
                'GLOSS',
            );
            body.setRotationFromEuler(new Vec3(0, 0, 90));
            racer.addChild(body);
            const light = this.primitive(
                'RacerLight',
                primitives.sphere(0.10, { segments: 8 }),
                new Color(255, 240, 165),
                'GLOW',
            );
            light.setPosition(0.34, 0, 0);
            racer.addChild(light);
            this.pulse(light, 0.76, 1.22, 0.52 + index * 0.05);
            this.spin(orbit, 7 + index * 1.4, index % 2 === 0 ? 1 : -1);
        });
    }

    private createClassicTileIdentityV85(
        tile: BoardTileData,
        color: Color,
        horizontal: boolean,
        cornerSpecial: boolean,
    ): void {
        const side = Math.floor(tile.index / 8);
        const outerOffset = side === 0
            ? new Vec3(0, 0.88, -1.13)
            : side === 1
                ? new Vec3(1.13, 0.88, 0)
                : side === 2
                    ? new Vec3(0, 0.88, 1.13)
                    : new Vec3(-1.13, 0.88, 0);

        const identityRail = this.primitive(
            `ClassicTileIdentityRailV85-${tile.index}`,
            primitives.box({
                width: cornerSpecial ? 2.82 : horizontal ? 1.92 : 0.24,
                height: 0.15,
                length: cornerSpecial ? 2.82 : horizontal ? 0.24 : 1.92,
            }),
            color,
            tile.tileType === TileType.City ? 'GLOSS' : 'GLOW',
        );
        identityRail.setPosition(tile.worldPosition.clone().add(outerOffset));
        this.root.addChild(identityRail);

        if (cornerSpecial) {
            const cornerBadge = this.primitive(
                `ClassicCornerBadgeV85-${tile.index}`,
                primitives.cylinder(0.64, 0.64, 0.10, { radialSegments: 24 }),
                new Color(255, 231, 132),
                'GLOW',
            );
            cornerBadge.setPosition(tile.worldPosition.clone().add3f(0, 0.99, 0));
            this.root.addChild(cornerBadge);
            return;
        }

        // Three readable district lamps replace the tiny pips from V80.
        for (let index = 0; index < 3; index++) {
            const lamp = this.primitive(
                `ClassicDistrictLampV85-${tile.index}-${index}`,
                primitives.sphere(index === 1 ? 0.12 : 0.09, { segments: 10 }),
                index === 1 ? new Color(255, 239, 164) : color,
                'GLOW',
            );
            const shift = (index - 1) * 0.34;
            const offset = side === 0
                ? new Vec3(shift, 1.01, -1.02)
                : side === 1
                    ? new Vec3(1.02, 1.01, shift)
                    : side === 2
                        ? new Vec3(shift, 1.01, 1.02)
                        : new Vec3(-1.02, 1.01, shift);
            lamp.setPosition(tile.worldPosition.clone().add(offset));
            this.root.addChild(lamp);
        }

        if (tile.tileType !== TileType.City) return;
        const district = new Node(`ClassicDistrictMiniatureV85-${tile.index}`);
        const inward = side === 0
            ? new Vec3(0, 0.89, 0.30)
            : side === 1
                ? new Vec3(-0.30, 0.89, 0)
                : side === 2
                    ? new Vec3(0, 0.89, -0.30)
                    : new Vec3(0.30, 0.89, 0);
        district.setPosition(tile.worldPosition.clone().add(inward));
        this.root.addChild(district);
        [-0.34, 0, 0.34].forEach((shift, index) => {
            const height = 0.38 + index * 0.18;
            const miniature = this.primitive(
                `ClassicDistrictSilhouetteV85-${tile.index}-${index}`,
                primitives.box({ width: 0.25, height, length: 0.25 }),
                index === 1 ? color : new Color(85, 132, 163),
                index === 1 ? 'GLOSS' : 'MATTE',
            );
            miniature.setPosition(horizontal ? shift : 0, height * 0.5, horizontal ? 0 : shift);
            district.addChild(miniature);
            const roof = this.primitive(
                `ClassicDistrictRoofV85-${tile.index}-${index}`,
                primitives.cylinder(0.16, 0.12, 0.10, { radialSegments: 10 }),
                new Color(248, 202, 81),
                'METAL',
            );
            roof.setPosition(horizontal ? shift : 0, height + 0.05, horizontal ? 0 : shift);
            district.addChild(roof);
        });
    }

    private createSpecialMonument(tile: BoardTileData, color: Color): void {
        const anchor = new Node(`Special-${tile.index}-${tile.tileType}`);
        anchor.setPosition(tile.worldPosition.clone().add3f(0, 0.56, 0));
        this.root.addChild(anchor);

        const districtRing = this.primitive(
            `ClassicSpecialDistrictRingV89-${tile.index}`,
            primitives.torus(0.72, 0.07, { radialSegments: 26, tubularSegments: 8 }),
            color,
            'GLOW',
        );
        districtRing.setPosition(0, 0.12, 0);
        districtRing.setRotationFromEuler(new Vec3(90, 0, 0));
        anchor.addChild(districtRing);
        this.spin(districtRing, 26 + tile.index % 8, tile.index % 2 === 0 ? 1 : -1);

        switch (tile.tileType) {
            case TileType.Start: {
                const gate = this.primitive(
                    `ClassicStartGateV89-${tile.index}`,
                    primitives.box({ width: 0.96, height: 0.18, length: 0.24 }),
                    new Color(255, 221, 96),
                    'METAL',
                );
                gate.setPosition(0, 0.88, 0);
                anchor.addChild(gate);
                [-0.42, 0.42].forEach((x, index) => {
                    const pillar = this.primitive(
                        `ClassicStartPillarV89-${index}`,
                        primitives.cylinder(0.12, 0.18, 1.32, { radialSegments: 14 }),
                        index === 0 ? color : new Color(255, 241, 177),
                        'GLOW',
                    );
                    pillar.setPosition(x, 0.58, 0);
                    anchor.addChild(pillar);
                });
                break;
            }
            case TileType.Island: {
                const island = this.primitive(
                    `ClassicIslandStageV89-${tile.index}`,
                    primitives.cylinder(0.52, 0.72, 0.24, { radialSegments: 20 }),
                    new Color(238, 215, 144),
                    'MATTE',
                );
                island.setPosition(0, 0.12, 0);
                anchor.addChild(island);
                for (let index = 0; index < 6; index++) {
                    const angle = Math.PI * 2 * index / 6;
                    const bar = this.primitive(
                        `ClassicIslandLockBarV89-${index}`,
                        primitives.cylinder(0.045, 0.045, 1.04, { radialSegments: 8 }),
                        new Color(59, 122, 165),
                        'METAL',
                    );
                    bar.setPosition(Math.cos(angle) * 0.48, 0.58, Math.sin(angle) * 0.48);
                    anchor.addChild(bar);
                }
                const lockRing = this.primitive(
                    `ClassicIslandLockRingV89-${tile.index}`,
                    primitives.torus(0.48, 0.05, { radialSegments: 22, tubularSegments: 8 }),
                    color,
                    'GLOW',
                );
                lockRing.setPosition(0, 1.06, 0);
                lockRing.setRotationFromEuler(new Vec3(90, 0, 0));
                anchor.addChild(lockRing);
                this.pulse(lockRing, 0.82, 1.16, 0.72);
                break;
            }
            case TileType.WorldTravel: {
                for (let index = 0; index < 3; index++) {
                    const portal = this.primitive(
                        `ClassicWorldTravelPortalV89-${tile.index}-${index}`,
                        primitives.torus(0.40 + index * 0.17, 0.055, { radialSegments: 28, tubularSegments: 8 }),
                        index === 1 ? new Color(255, 224, 105) : color,
                        'GLOW',
                    );
                    portal.setPosition(0, 0.72, 0);
                    portal.setRotationFromEuler(new Vec3(index === 1 ? 20 : 90, index * 38, index === 2 ? 35 : 0));
                    anchor.addChild(portal);
                    this.spin(portal, 34 + index * 8, index % 2 === 0 ? 1 : -1);
                }
                const globe = this.primitive(
                    `ClassicWorldTravelGlobeV89-${tile.index}`,
                    primitives.sphere(0.28, { segments: 18 }),
                    new Color(89, 220, 236),
                    'GLOSS',
                );
                globe.setPosition(0, 0.72, 0);
                anchor.addChild(globe);
                break;
            }
            case TileType.Bonus: {
                const prize = this.primitive(
                    `ClassicBonusPrizeV89-${tile.index}`,
                    primitives.sphere(0.42, { segments: 16 }),
                    new Color(255, 218, 74),
                    'GLOW',
                );
                prize.setPosition(0, 0.62, 0);
                prize.setScale(1.25, 0.46, 1.25);
                anchor.addChild(prize);
                for (let index = 0; index < 8; index++) {
                    const angle = Math.PI * 2 * index / 8;
                    const ray = this.primitive(
                        `ClassicBonusRayV89-${index}`,
                        primitives.box({ width: 0.08, height: 0.08, length: 0.42 }),
                        index % 2 === 0 ? color : new Color(255, 241, 168),
                        'GLOW',
                    );
                    ray.setPosition(Math.cos(angle) * 0.68, 0.62, Math.sin(angle) * 0.68);
                    ray.setRotationFromEuler(new Vec3(0, -angle * 180 / Math.PI, 0));
                    anchor.addChild(ray);
                }
                this.pulse(prize, 0.86, 1.18, 0.62);
                break;
            }
            case TileType.Fortune: {
                const card = this.primitive(
                    'FortuneCard',
                    primitives.box({ width: 0.68, height: 0.9, length: 0.16 }),
                    color,
                    'GLOSS',
                );
                card.setPosition(0, 0.62, 0);
                card.setRotationFromEuler(new Vec3(-8, 28, -8));
                anchor.addChild(card);
                const signal = this.primitive(
                    'FortuneSignal',
                    primitives.sphere(0.15, { segments: 10 }),
                    new Color(226, 126, 255),
                    'GLOW',
                );
                signal.setPosition(0, 1.23, 0);
                anchor.addChild(signal);
                this.pulse(signal, 0.8, 1.28, 0.52);
                break;
            }
            case TileType.GameCenter: {
                const console = this.primitive(
                    'GameConsole',
                    primitives.box({ width: 0.86, height: 0.48, length: 0.7 }),
                    new Color(25, 45, 66),
                    'GLOSS',
                );
                console.setPosition(0, 0.3, 0);
                anchor.addChild(console);
                const stick = this.primitive(
                    'GameStick',
                    primitives.cylinder(0.08, 0.08, 0.42),
                    new Color(245, 195, 35),
                    'METAL',
                );
                stick.setPosition(0, 0.72, 0);
                anchor.addChild(stick);
                const knob = this.primitive(
                    'GameKnob',
                    primitives.sphere(0.19, { segments: 10 }),
                    color,
                    'GLOW',
                );
                knob.setPosition(0, 0.98, 0);
                anchor.addChild(knob);
                this.pulse(knob, 0.9, 1.18, 0.68);
                break;
            }
            case TileType.Olympic: {
                const torch = this.primitive(
                    'OlympicTorch',
                    primitives.cylinder(0.11, 0.23, 0.78),
                    new Color(245, 195, 35),
                    'METAL',
                );
                torch.setPosition(0, 0.42, 0);
                anchor.addChild(torch);
                const flame = this.primitive(
                    'OlympicFlame',
                    primitives.sphere(0.25, { segments: 12 }),
                    color,
                    'GLOW',
                );
                flame.setPosition(0, 0.98, 0);
                anchor.addChild(flame);
                this.pulse(flame, 0.78, 1.3, 0.48);
                break;
            }
            case TileType.Tax: {
                for (let index = 0; index < 3; index++) {
                    const coin = this.primitive(
                        `TaxCoin-${index}`,
                        primitives.cylinder(0.36 - index * 0.04, 0.36 - index * 0.04, 0.14),
                        index === 2 ? color : new Color(245, 195, 35),
                        'METAL',
                    );
                    coin.setPosition(0, 0.12 + index * 0.15, 0);
                    anchor.addChild(coin);
                }
                break;
            }
            default: {
                const monument = this.primitive(
                    'SpecialBeacon',
                    primitives.cylinder(0.38, 0.5, 0.72),
                    color,
                    'GLOSS',
                );
                monument.setPosition(0, 0.42, 0);
                anchor.addChild(monument);
                break;
            }
        }
    }

    private playConstructionBurst(position: Readonly<Vec3>, color: Color, level: number): void {
        const root = new Node(`ClassicConstructionSequenceV79-L${level}`);
        root.setPosition(position.clone().add3f(0, 0.78, 0));
        this.root.addChild(root);
        const ring = this.primitive(
            'ConstructionRing',
            primitives.cylinder(0.92, 0.92, 0.05, { radialSegments: 26 }),
            new Color(255, 220, 112),
            'GLOW',
        );
        ring.setScale(0.25, 0.25, 0.25);
        root.addChild(ring);
        tween(ring)
            .to(0.28, { scale: new Vec3(1.35, 1.35, 1.35) }, { easing: 'quadOut' })
            .to(0.22, { scale: new Vec3(1.7, 0.25, 1.7) }, { easing: 'quadIn' })
            .start();

        for (let index = 0; index < 6; index++) {
            const angle = Math.PI * 2 * index / 6;
            const beam = this.primitive(
                `ConstructionBeam-${index}`,
                primitives.box({ width: 0.08, height: 2.3 + level * 0.18, length: 0.08 }),
                index % 2 === 0 ? color : new Color(255, 220, 112),
                'GLOW',
            );
            beam.setPosition(Math.cos(angle) * 0.62, 1.15, Math.sin(angle) * 0.62);
            beam.setScale(1, 0.05, 1);
            root.addChild(beam);
            tween(beam)
                .delay(index * 0.035)
                .to(0.24, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
                .to(0.22, { scale: new Vec3(0.35, 0.04, 0.35) }, { easing: 'quadIn' })
                .start();
        }
        setTimeout(() => {
            if (root.isValid) root.destroy();
        }, 620);
    }

    private createPlayerPiece(name: string, color: Color, bot: boolean): Node {
        const root = new Node(name);
        const shadow = this.primitive(
            'PieceShadow',
            primitives.cylinder(0.48, 0.58, 0.06),
            new Color(5, 12, 20),
            'MATTE',
        );
        shadow.setPosition(0, 0.04, 0);
        root.addChild(shadow);

        const legColor = bot ? new Color(36, 50, 66) : new Color(12, 18, 28);
        [-0.16, 0.16].forEach((x, index) => {
            const leg = this.primitive(
                `Leg-${index}`,
                primitives.box({ width: 0.2, height: 0.55, length: 0.23 }),
                legColor,
                'GLOSS',
            );
            leg.setPosition(x, 0.36, 0);
            root.addChild(leg);
            const shoe = this.primitive(
                `Shoe-${index}`,
                primitives.box({ width: 0.25, height: 0.14, length: 0.38 }),
                new Color(10, 15, 23),
                'GLOSS',
            );
            shoe.setPosition(x, 0.11, 0.08);
            root.addChild(shoe);
        });

        const body = this.primitive(
            'Body',
            primitives.capsule(0.36, 1.05),
            bot ? color : new Color(18, 22, 29),
            'GLOSS',
        );
        body.setPosition(0, 0.88, 0);
        root.addChild(body);
        const jacket = this.primitive(
            'JacketAccent',
            primitives.box({ width: 0.62, height: 0.32, length: 0.48 }),
            color,
            'GLOW',
        );
        jacket.setPosition(0, 0.95, 0.04);
        root.addChild(jacket);
        [-0.43, 0.43].forEach((x, index) => {
            const arm = this.primitive(
                `Arm-${index}`,
                primitives.capsule(0.11, 0.52),
                bot ? color : new Color(20, 26, 36),
                'GLOSS',
            );
            arm.setPosition(x, 0.91, 0);
            arm.setRotationFromEuler(new Vec3(0, 0, index === 0 ? -10 : 10));
            root.addChild(arm);
        });
        const head = this.primitive(
            'Head',
            primitives.sphere(0.29, { segments: 16 }),
            bot ? new Color(222, 228, 234) : new Color(238, 196, 164),
            'GLOSS',
        );
        head.setPosition(0, 1.72, 0);
        root.addChild(head);
        const cap = this.primitive(
            'Cap',
            primitives.box({ width: 0.64, height: 0.14, length: 0.52 }),
            bot ? color : new Color(16, 18, 24),
            'GLOSS',
        );
        cap.setPosition(0, 2.01, 0);
        root.addChild(cap);

        const visor = this.primitive(
            'Visor',
            primitives.box({ width: 0.36, height: 0.08, length: 0.06 }),
            bot ? new Color(75, 226, 255) : new Color(245, 195, 35),
            'GLOW',
        );
        visor.setPosition(0, 1.76, 0.285);
        root.addChild(visor);

        const backpack = this.primitive(
            'TravelPack',
            primitives.box({ width: 0.42, height: 0.54, length: 0.24 }),
            bot ? new Color(29, 50, 68) : color,
            'GLOSS',
        );
        backpack.setPosition(0, 1.02, -0.31);
        root.addChild(backpack);
        return root;
    }

    private createTileAccent(tile: BoardTileData, color: Color): void {
        const side = Math.floor(tile.index / 8);
        const horizontal = side === 0 || side === 2;
        const cornerSpecial = tile.index % 8 === 0;
        const outward = cornerSpecial ? 0 : 0.93;
        const offset = side === 0
            ? new Vec3(0, 0.91, -outward)
            : side === 1
                ? new Vec3(outward, 0.91, 0)
                : side === 2
                    ? new Vec3(0, 0.91, outward)
                    : new Vec3(-outward, 0.91, 0);

        const band = this.primitive(
            `ClassicDistrictBandV85-${tile.index}`,
            primitives.box({
                width: cornerSpecial ? 2.62 : horizontal ? 2.02 : 0.56,
                height: 0.09,
                length: cornerSpecial ? 2.62 : horizontal ? 0.56 : 2.02,
            }),
            color,
            'GLOSS',
        );
        band.setPosition(tile.worldPosition.clone().add(offset));
        this.root.addChild(band);

        const dividerOffset = offset.clone().multiplyScalar(cornerSpecial ? 0 : 0.64);
        dividerOffset.y = 0.99;
        const divider = this.primitive(
            `ClassicDistrictDividerV85-${tile.index}`,
            primitives.box({
                width: cornerSpecial ? 2.70 : horizontal ? 2.14 : 0.08,
                height: 0.055,
                length: cornerSpecial ? 2.70 : horizontal ? 0.08 : 2.14,
            }),
            new Color(211, 176, 92),
            'METAL',
        );
        divider.setPosition(tile.worldPosition.clone().add(dividerOffset));
        this.root.addChild(divider);

        if (cornerSpecial) return;
        const plaqueOffset = side === 0
            ? new Vec3(0, 1.02, 0.42)
            : side === 1
                ? new Vec3(-0.42, 1.02, 0)
                : side === 2
                    ? new Vec3(0, 1.02, -0.42)
                    : new Vec3(0.42, 1.02, 0);
        const plaque = this.primitive(
            `ClassicTilePlaqueV85-${tile.index}`,
            primitives.box({
                width: horizontal ? 1.34 : 0.42,
                height: 0.05,
                length: horizontal ? 0.42 : 1.34,
            }),
            new Color(250, 246, 226),
            'MATTE',
        );
        plaque.setPosition(tile.worldPosition.clone().add(plaqueOffset));
        this.root.addChild(plaque);

        if (tile.tileType === TileType.City || tile.tileType === TileType.Tourist) {
            const priceRank = tile.purchasePrice >= 420_000 ? 3 : tile.purchasePrice >= 250_000 ? 2 : 1;
            for (let index = 0; index < priceRank; index++) {
                const coin = this.primitive(
                    `ClassicTilePriceBadgeV85-${tile.index}-${index}`,
                    primitives.cylinder(0.10, 0.10, 0.035, { radialSegments: 14 }),
                    index === priceRank - 1 ? color : new Color(211, 176, 92),
                    'METAL',
                );
                const spacing = 0.23;
                const centered = (index - (priceRank - 1) / 2) * spacing;
                const coinOffset = side === 0
                    ? new Vec3(centered, 1.07, 0.40)
                    : side === 1
                        ? new Vec3(-0.40, 1.07, centered)
                        : side === 2
                            ? new Vec3(centered, 1.07, -0.40)
                            : new Vec3(0.40, 1.07, centered);
                coin.setPosition(tile.worldPosition.clone().add(coinOffset));
                this.root.addChild(coin);
            }
        }
    }

    private createTouristLandmark(tile: BoardTileData): void {
        const anchor = new Node(`TouristLandmark-${tile.index}`);
        anchor.setPosition(tile.worldPosition.clone().add3f(0, 0.58, 0));
        this.root.addChild(anchor);
        const base = this.primitive(
            'TouristBase',
            primitives.cylinder(0.46, 0.56, 0.2),
            new Color(238, 191, 82),
            'METAL',
        );
        anchor.addChild(base);
        const tower = this.primitive(
            'TouristTower',
            primitives.cylinder(0.14, 0.28, 0.92),
            new Color(225, 236, 242),
            'GLOSS',
        );
        tower.setPosition(0, 0.54, 0);
        anchor.addChild(tower);
        const beacon = this.primitive(
            'TouristBeacon',
            primitives.sphere(0.2, { segments: 10 }),
            new Color(83, 220, 255),
            'GLOW',
        );
        beacon.setPosition(0, 1.15, 0);
        anchor.addChild(beacon);
        this.pulse(beacon, 0.86, 1.22, 0.64);
    }

    private createCornerLandmark(index: number, position: Vec3): void {
        const root = new Node(`ClassicCornerLandmarkV85-${index}`);
        root.setPosition(position);
        this.root.addChild(root);
        const plinth = this.primitive(
            'ClassicCornerPlinthV85',
            primitives.cylinder(0.98, 1.18, 0.34, { radialSegments: 20 }),
            index % 2 === 0 ? new Color(247, 191, 55) : new Color(51, 183, 226),
            'METAL',
        );
        plinth.setPosition(0, 0.15, 0);
        root.addChild(plinth);

        if (index === 0) {
            [-0.5, 0.5].forEach((x, pillarIndex) => {
                const pillar = this.primitive(
                    `StartGatePillar-${pillarIndex}`,
                    primitives.box({ width: 0.28, height: 1.45, length: 0.3 }),
                    new Color(244, 193, 58),
                    'METAL',
                );
                pillar.setPosition(x, 1.02, 0);
                root.addChild(pillar);
            });
            const gate = this.primitive(
                'StartGateBeam',
                primitives.box({ width: 1.3, height: 0.25, length: 0.34 }),
                new Color(255, 219, 109),
                'GLOW',
            );
            gate.setPosition(0, 1.82, 0);
            root.addChild(gate);
        } else if (index === 1) {
            const island = this.primitive(
                'IslandSand',
                primitives.cylinder(0.86, 1.02, 0.28, { radialSegments: 18 }),
                new Color(240, 192, 92),
                'MATTE',
            );
            island.setPosition(0, 0.34, 0);
            root.addChild(island);
            const trunk = this.primitive(
                'PalmTrunk',
                primitives.cylinder(0.1, 0.16, 1.18),
                new Color(119, 73, 38),
                'MATTE',
            );
            trunk.setPosition(0, 1.02, 0);
            trunk.setRotationFromEuler(new Vec3(0, 0, -12));
            root.addChild(trunk);
            for (let leafIndex = 0; leafIndex < 5; leafIndex++) {
                const leaf = this.primitive(
                    `PalmLeaf-${leafIndex}`,
                    primitives.box({ width: 0.14, height: 0.08, length: 0.82 }),
                    new Color(69, 190, 115),
                    'GLOSS',
                );
                leaf.setPosition(-0.2, 1.66, 0);
                leaf.setRotationFromEuler(new Vec3(16, leafIndex * 72, -12));
                root.addChild(leaf);
            }
        } else if (index === 2) {
            const portalFrame = this.primitive(
                'TravelPortalFrame',
                primitives.torus(0.98, 0.14, { radialSegments: 28, tubularSegments: 10 }),
                new Color(228, 168, 45),
                'METAL',
            );
            portalFrame.setPosition(0, 1.12, 0);
            portalFrame.setRotationFromEuler(new Vec3(0, 0, 0));
            root.addChild(portalFrame);
            const portal = this.primitive(
                'TravelPortal',
                primitives.cylinder(0.61, 0.61, 0.21),
                new Color(54, 213, 255),
                'GLOW',
            );
            portal.setPosition(0, 1.12, 0);
            portal.setRotationFromEuler(new Vec3(0, 0, 0));
            root.addChild(portal);
            this.pulse(portal, 0.82, 1.16, 0.72);
        } else {
            const cup = this.primitive(
                'BonusCup',
                primitives.sphere(0.46, { segments: 14 }),
                new Color(247, 190, 52),
                'METAL',
            );
            cup.setPosition(0, 1.12, 0);
            cup.setScale(1, 1.2, 1);
            root.addChild(cup);
            const stem = this.primitive(
                'BonusCupStem',
                primitives.cylinder(0.16, 0.28, 0.7),
                new Color(255, 220, 114),
                'METAL',
            );
            stem.setPosition(0, 0.58, 0);
            root.addChild(stem);
            const star = this.primitive(
                'BonusStar',
                primitives.sphere(0.2, { segments: 10 }),
                new Color(255, 236, 137),
                'GLOW',
            );
            star.setPosition(0, 1.72, 0);
            root.addChild(star);
            this.pulse(star, 0.8, 1.3, 0.58);
        }
    }

    private mixColor(base: Color, tint: Color, amount: number): Color {
        const t = Math.max(0, Math.min(1, amount));
        return new Color(
            Math.round(base.r + (tint.r - base.r) * t),
            Math.round(base.g + (tint.g - base.g) * t),
            Math.round(base.b + (tint.b - base.b) * t),
            255,
        );
    }

    private playBoardEntrance(): void {
        this.root.setPosition(0, -0.12, 0);
        this.root.setScale(0.965, 0.965, 0.965);
        tween(this.root)
            .to(0.46, { position: Vec3.ZERO, scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .start();
    }

    private spin(node: Node, duration: number, direction = 1): void {
        this.ambientNodes.push(node);
        tween(node).repeatForever(
            tween<Node>().by(duration, { eulerAngles: new Vec3(0, 360 * direction, 0) }),
        ).start();
    }

    private pulse(node: Node, minimum: number, maximum: number, duration: number): void {
        this.ambientNodes.push(node);
        node.setScale(minimum, minimum, minimum);
        tween(node).repeatForever(
            tween<Node>()
                .to(duration, { scale: new Vec3(maximum, maximum, maximum) }, { easing: 'sineInOut' })
                .to(duration, { scale: new Vec3(minimum, minimum, minimum) }, { easing: 'sineInOut' }),
        ).start();
    }

    private primitive(
        name: string,
        geometry: primitives.IGeometry,
        color: Color,
        finish: SurfaceFinish = 'MATTE',
    ): Node {
        const node = new Node(name);
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = utils.createMesh(geometry);
        renderer.material = this.material(color, finish);
        if (finish !== 'GLOW') {
            renderer.shadowCastingMode = 1;
            renderer.receiveShadow = 1;
        }
        return node;
    }

    private material(color: Color, finish: SurfaceFinish): Material {
        const key = `${finish}:${color.toHEX('#rrggbbaa')}`;
        const cached = this.materialCache.get(key);
        if (cached) return cached;

        const material = new Material();
        if (finish === 'GLOW') {
            material.initialize({ effectName: 'builtin-unlit', defines: { USE_COLOR: true } });
            material.setProperty('mainColor', color);
        } else {
            const pbrTemplate = resources.get<Material>('materials/V67Standard', Material);
            if (pbrTemplate?.effectAsset) {
                material.initialize({ effectAsset: pbrTemplate.effectAsset });
                material.setProperty('mainColor', color);
                material.setProperty('roughness', finish === 'MATTE' ? 0.78 : finish === 'GLOSS' ? 0.22 : 0.32);
                material.setProperty('metallic', finish === 'METAL' ? 0.82 : 0.05);
                material.setProperty('specularIntensity', finish === 'MATTE' ? 0.28 : 0.72);
            } else {
                // A fast click can beat the tiny lobby preload on slow devices.
                // Keep the 3D geometry playable with the guaranteed built-in
                // unlit effect instead of constructing a material with no pass.
                material.initialize({ effectName: 'builtin-unlit', defines: { USE_COLOR: true } });
                material.setProperty('mainColor', color);
            }
        }
        this.materialCache.set(key, material);
        return material;
    }

    private colorFromHex(hex: string): Color {
        const color = new Color();
        Color.fromHEX(color, hex);
        return color;
    }

    private safePrefabScale(): number {
        const scale = this.options.humanPrefabScale ?? 1;
        if (!Number.isFinite(scale)) return 1;
        return Math.max(0.05, Math.min(scale, 10));
    }
}


function playerSeatOffset(seat: number): Vec3 {
    const normalized = Math.max(0, Math.min(3, Math.trunc(seat)));
    const x = normalized % 2 === 0 ? -0.34 : 0.34;
    const z = normalized < 2 ? -0.34 : 0.34;
    return new Vec3(x, 1, z);
}
