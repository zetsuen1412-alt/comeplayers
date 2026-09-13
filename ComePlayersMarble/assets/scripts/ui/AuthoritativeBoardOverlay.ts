import {
    BlockInputEvents,
    Button,
    Camera,
    Canvas,
    Color,
    director,
    Graphics,
    Label,
    Layers,
    Node,
    ResolutionPolicy,
    SafeArea,
    Slider,
    Sprite,
    UIOpacity,
    UITransform,
    Vec3,
    tween,
    Tween,
    view,
    Widget,
} from 'cc';
import type {
    AuthoritativeMatchSnapshot,
    AuthoritativePendingAction,
} from '../network/AuthoritativeMatchProtocol';
import type { AuthoritativePresentationCue } from './AuthoritativeEventPresentationQueue';

export interface AuthoritativeBoardOverlayOptions {
    readonly cinematic3D?: boolean;
    readonly viewerRole?: 'PLAYER' | 'SPECTATOR' | 'REPLAY';
}

export interface AuthoritativeBoardOverlayActions {
    readonly close: () => void;
    readonly roll: () => void;
    readonly purchase: () => void;
    readonly upgrade: () => void;
    readonly takeover: () => void;
    readonly activateSkill: () => void;
    readonly endTurn: () => void;
    readonly chooseGameCenter: (selectedNumber: number) => void;
    readonly selectOlympic: (tileIndex: number) => void;
    readonly selectTravel: (tileIndex: number) => void;
    readonly overview?: () => void;
    readonly nextPlayer?: () => void;
    readonly toggleAutoFollow?: () => boolean;
    readonly loadReplay?: () => void;
    readonly toggleReplayPause?: () => void;
    readonly cycleReplaySpeed?: () => number;
    readonly skipReplay?: () => void;
    readonly seekReplay?: (progress: number) => void;
    readonly stepReplay?: (delta: number) => void;
    readonly publishReplay?: () => void;
    readonly openReplayByCode?: () => void;
}

const PLAYER_COLORS: readonly Color[] = [
    new Color(30, 202, 255),
    new Color(255, 101, 151),
    new Color(245, 195, 35),
    new Color(77, 220, 151),
];

const SPECIAL_COLORS: Readonly<Record<string, Color>> = {
    START: new Color(30, 202, 255),
    FORTUNE: new Color(145, 88, 230),
    GAME_CENTER: new Color(245, 195, 35),
    ISLAND: new Color(45, 151, 199),
    OLYMPIC: new Color(248, 98, 64),
    WORLD_TRAVEL: new Color(24, 209, 171),
    TAX: new Color(206, 67, 82),
    BONUS_GAME: new Color(245, 195, 35),
};

export class AuthoritativeBoardOverlay {
    private readonly root = new Node('AuthoritativeBoardOverlay');
    private readonly safeRoot = new Node('SafeAreaRoot');
    private readonly tileNodes: Node[] = [];
    private readonly tileLabels: Label[] = [];
    private readonly playerMarkers: Node[] = [];
    private readonly playerLabels: Label[] = [];
    private readonly optionButtons: Button[] = [];
    private readonly optionLabels: Label[] = [];
    private readonly title: Label;
    private readonly status: Label;
    private readonly detail: Label;
    private readonly primaryButton: Button;
    private readonly primaryLabel: Label;
    private readonly skillButton: Button;
    private readonly skillLabel: Label;
    private readonly eventBanner: Label;
    private readonly diceBanner: Label;
    private readonly replayStatus: Label | null;
    private readonly followLabel: Label | null;
    private readonly replayPauseLabel: Label | null;
    private readonly replaySpeedLabel: Label | null;
    private readonly replaySlider: Slider | null;
    private readonly queuedEvents: AuthoritativePresentationCue[] = [];
    private presentingEvent = false;
    private snapshotValue: AuthoritativeMatchSnapshot | null = null;
    private localProfileId = '';
    private replayActive = false;

    public constructor(
        private readonly actions: AuthoritativeBoardOverlayActions,
        private readonly options: AuthoritativeBoardOverlayOptions = {},
    ) {
        view.setDesignResolutionSize(1920, 1080, ResolutionPolicy.FIXED_HEIGHT);
        this.root.layer = Layers.Enum.UI_2D;
        this.root.addComponent(UITransform).setContentSize(2200, 1080);

        const cameraNode = new Node('AuthorityOverlayCamera');
        cameraNode.layer = Layers.Enum.UI_2D;
        this.root.addChild(cameraNode);
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        camera.visibility = Layers.Enum.UI_2D;
        camera.near = 0;
        camera.far = 2000;
        const canvas = this.root.addComponent(Canvas);
        canvas.cameraComponent = camera;
        director.getScene()?.addChild(this.root);

        this.safeRoot.layer = Layers.Enum.UI_2D;
        this.root.addChild(this.safeRoot);
        this.safeRoot.addComponent(UITransform).setContentSize(2200, 1080);
        const widget = this.safeRoot.addComponent(Widget);
        widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
        widget.top = widget.bottom = widget.left = widget.right = 0;
        this.safeRoot.addComponent(SafeArea);
        this.safeRoot.addComponent(BlockInputEvents);

        const scrim = this.safeRoot.addComponent(Graphics);
        scrim.fillColor = new Color(20, 73, 112, this.options.cinematic3D ? 46 : 238);
        scrim.fillRect(-1100, -540, 2200, 1080);

        const header = this.panel('ClassicAuthorityChromeV90', new Vec3(0, 475), 2040, 92, new Color(25, 92, 142, 252), new Color(247, 203, 82));
        this.title = this.label(header, 'Title', this.options.cinematic3D ? 'SERVER 3D BOARD' : 'SERVER BOARD MIRROR', 28, new Vec3(-650, 10), new Color(245, 195, 35), 500, 38, Label.HorizontalAlign.LEFT);
        this.status = this.label(header, 'Status', 'WAITING FOR SNAPSHOT', 18, new Vec3(80, 7), Color.WHITE, 760, 34);
        this.label(header, 'Security', 'POSTGRES AUTHORITY  •  PRIVATE REALTIME', 14, new Vec3(80, -23), new Color(154, 225, 250), 760, 24);
        this.button(header, 'CLOSE', new Vec3(770, 0), new Color(58, 72, 94), this.actions.close, 190, 58, 18);
        this.eventBanner = this.label(this.safeRoot, 'EventBanner', '', 28, new Vec3(0, 404), new Color(245, 195, 35), 1200, 56);
        const eventOpacity = this.eventBanner.node.addComponent(UIOpacity);
        eventOpacity.opacity = 0;
        this.diceBanner = this.label(this.safeRoot, 'DiceBanner', '', 42, new Vec3(0, 335), Color.WHITE, 680, 72);
        const diceOpacity = this.diceBanner.node.addComponent(UIOpacity);
        diceOpacity.opacity = 0;

        const boardPanel = this.panel('BoardPanel', new Vec3(-280, -10), 1230, 820, new Color(13, 36, 54, 255), new Color(83, 169, 207));
        const boardGraphics = boardPanel.addComponent(Graphics);
        boardGraphics.fillColor = new Color(8, 63, 89, 255);
        boardGraphics.roundRect(-390, -265, 780, 530, 42);
        boardGraphics.fill();
        boardGraphics.strokeColor = new Color(245, 195, 35, 220);
        boardGraphics.lineWidth = 8;
        boardGraphics.roundRect(-400, -275, 800, 550, 48);
        boardGraphics.stroke();
        this.label(boardPanel, 'CenterBrand', 'COMEPLAYERS\nMARBLE WORLD', 42, new Vec3(0, 12), new Color(245, 195, 35), 600, 130);
        this.label(boardPanel, 'CenterCaption', 'LIVE AUTHORITATIVE SNAPSHOT', 15, new Vec3(0, -92), new Color(164, 226, 250), 520, 26);
        this.createTiles(boardPanel);
        this.createPlayerMarkers(boardPanel);
        boardPanel.active = !this.options.cinematic3D;

        const side = this.panel('AuthorityPanel', new Vec3(600, -10), 520, 820, new Color(14, 24, 38, 255), new Color(83, 169, 207));
        this.detail = this.label(side, 'Detail', 'No server match is active.', 18, new Vec3(0, 225), Color.WHITE, 450, 360, Label.HorizontalAlign.LEFT);
        this.primaryButton = this.button(side, 'ROLL SERVER DICE', new Vec3(0, -22), new Color(245, 195, 35), () => this.invokePrimary(), 420, 72, 20);
        const primaryLabel = this.primaryButton.node.getComponentInChildren(Label);
        if (!primaryLabel) throw new Error('Authority primary button label was not created.');
        this.primaryLabel = primaryLabel;
        this.skillButton = this.button(side, 'ACTIVATE SERVER SKILL', new Vec3(0, -102), new Color(126, 77, 220), () => this.invokeSkill(), 420, 62, 17);
        const skillLabel = this.skillButton.node.getComponentInChildren(Label);
        if (!skillLabel) throw new Error('Authority skill button label was not created.');
        this.skillLabel = skillLabel;
        this.label(side, 'OptionsTitle', 'SERVER DECISION OPTIONS', 15, new Vec3(0, -155), new Color(154, 225, 250), 430, 28);
        for (let index = 0; index < 8; index++) {
            const x = index % 2 === 0 ? -112 : 112;
            const y = -205 - Math.floor(index / 2) * 64;
            const option = this.button(side, `OPTION ${index + 1}`, new Vec3(x, y), new Color(39, 118, 163), () => this.invokeOption(index), 205, 54, 14);
            const label = option.node.getComponentInChildren(Label);
            if (!label) throw new Error('Authority option button label was not created.');
            option.node.active = false;
            this.optionButtons.push(option);
            this.optionLabels.push(label);
        }

        if (this.options.cinematic3D) {
            const controls = this.panel('ClassicSpectatorControlsV90', new Vec3(0, -468), 2040, 126, new Color(25, 92, 142, 245), new Color(247, 203, 82));
            this.button(controls, 'OVERVIEW', new Vec3(-745, 29), new Color(39, 118, 163), () => this.actions.overview?.(), 160, 44, 13);
            this.button(controls, 'NEXT PLAYER', new Vec3(-565, 29), new Color(39, 118, 163), () => this.actions.nextPlayer?.(), 170, 44, 13);
            const follow = this.button(controls, 'AUTO FOLLOW', new Vec3(-375, 29), new Color(39, 118, 163), () => {
                const enabled = this.actions.toggleAutoFollow?.() ?? false;
                if (this.followLabel) this.followLabel.string = enabled ? 'AUTO FOLLOW ON' : 'AUTO FOLLOW OFF';
            }, 180, 44, 13);
            this.followLabel = follow.node.getComponentInChildren(Label);
            const replay = this.button(controls, 'LOAD LIVE REPLAY', new Vec3(-170, 29), new Color(126, 77, 220), () => this.actions.loadReplay?.(), 210, 44, 13);
            const publish = this.button(controls, 'PUBLISH REPLAY', new Vec3(55, 29), new Color(126, 77, 220), () => this.actions.publishReplay?.(), 205, 44, 13);
            publish.node.active = this.actions.publishReplay !== undefined;
            const openCode = this.button(controls, 'OPEN SHARE CODE', new Vec3(275, 29), new Color(39, 118, 163), () => this.actions.openReplayByCode?.(), 210, 44, 13);
            openCode.node.active = this.actions.openReplayByCode !== undefined;
            this.replayStatus = this.label(controls, 'ReplayStatus', 'LIVE SPECTATOR', 13, new Vec3(650, 29), new Color(154, 225, 250), 500, 44);

            this.button(controls, '-10 EVENTS', new Vec3(-745, -30), new Color(58, 72, 94), () => this.actions.stepReplay?.(-10), 160, 42, 12);
            const pause = this.button(controls, 'PAUSE', new Vec3(-570, -30), new Color(58, 72, 94), () => this.actions.toggleReplayPause?.(), 150, 42, 12);
            this.replayPauseLabel = pause.node.getComponentInChildren(Label);
            const speed = this.button(controls, 'SPEED 1X', new Vec3(-405, -30), new Color(58, 72, 94), () => {
                const value = this.actions.cycleReplaySpeed?.() ?? 1;
                if (this.replaySpeedLabel) this.replaySpeedLabel.string = `SPEED ${value}X`;
            }, 150, 42, 12);
            this.replaySpeedLabel = speed.node.getComponentInChildren(Label);
            this.button(controls, '+10 EVENTS', new Vec3(-240, -30), new Color(58, 72, 94), () => this.actions.stepReplay?.(10), 150, 42, 12);
            this.button(controls, 'SKIP END', new Vec3(-80, -30), new Color(58, 72, 94), () => this.actions.skipReplay?.(), 140, 42, 12);
            this.replaySlider = this.createReplaySlider(controls, new Vec3(430, -30), 820);
            replay.node.active = this.actions.loadReplay !== undefined;
        } else {
            this.replayStatus = null;
            this.followLabel = null;
            this.replayPauseLabel = null;
            this.replaySpeedLabel = null;
            this.replaySlider = null;
        }
    }

    public render(snapshot: AuthoritativeMatchSnapshot, localProfileId: string): void {
        this.snapshotValue = snapshot;
        this.localProfileId = localProfileId;
        const role = this.options.viewerRole ?? 'PLAYER';
        const viewTitle = role === 'REPLAY' ? 'SERVER REPLAY' : role === 'SPECTATOR' ? 'SPECTATOR 3D BOARD' : this.options.cinematic3D ? 'SERVER 3D BOARD' : 'SERVER BOARD MIRROR';
        this.title.string = `${viewTitle}  •  REV ${snapshot.revision}`;
        const current = snapshot.players.find((player) => player.seat === snapshot.currentTurnSeat);
        const localTurn = role === 'PLAYER' && !this.replayActive && snapshot.currentTurnProfileId === localProfileId;
        this.status.string = `${snapshot.phase}  •  ROUND ${snapshot.round}/${snapshot.maxRounds}  •  ${current?.displayName ?? 'SERVER'}${localTurn ? '  •  YOUR TURN' : ''}`;
        this.renderTiles(snapshot);
        this.renderPlayers(snapshot);
        this.renderAuthorityPanel(snapshot, localTurn);
    }

    public enqueueEvent(cue: AuthoritativePresentationCue, snapshot: AuthoritativeMatchSnapshot): void {
        if (this.queuedEvents.some((entry) => entry.sequence === cue.sequence)) return;
        this.queuedEvents.push(cue);
        if (this.queuedEvents.length > 32) this.queuedEvents.shift();
        if (!this.presentingEvent) void this.drainEvents(snapshot);
    }

    public setReplayStatus(label: string, paused = false, speed = 1, progress = 0): void {
        if (this.replayStatus) this.replayStatus.string = label.slice(0, 64).toUpperCase();
        if (this.replayPauseLabel) this.replayPauseLabel.string = paused ? 'RESUME' : 'PAUSE';
        if (this.replaySpeedLabel) this.replaySpeedLabel.string = `SPEED ${speed}X`;
        if (this.replaySlider) this.replaySlider.progress = Math.max(0, Math.min(1, progress));
    }

    public setReplayMode(active: boolean): void {
        if (this.replayActive === active) return;
        this.replayActive = active;
        if (this.snapshotValue) this.render(this.snapshotValue, this.localProfileId);
    }

    public destroy(): void {
        if (this.root.isValid) this.root.destroy();
    }

    private createTiles(parent: Node): void {
        for (let index = 0; index < 32; index++) {
            const position = tilePosition(index);
            const tile = new Node(`AuthorityTile-${index}`);
            tile.layer = Layers.Enum.UI_2D;
            tile.setPosition(position);
            tile.addComponent(UITransform).setContentSize(102, 76);
            parent.addChild(tile);
            this.paintTile(tile, new Color(48, 64, 82), new Color(110, 151, 179));
            const label = this.label(tile, 'TileLabel', `${index}`, 12, Vec3.ZERO, Color.WHITE, 94, 68);
            this.tileNodes.push(tile);
            this.tileLabels.push(label);
        }
    }

    private createPlayerMarkers(parent: Node): void {
        for (let seat = 0; seat < 4; seat++) {
            const marker = new Node(`AuthorityPlayer-${seat}`);
            marker.layer = Layers.Enum.UI_2D;
            marker.addComponent(UITransform).setContentSize(40, 40);
            const graphics = marker.addComponent(Graphics);
            graphics.fillColor = PLAYER_COLORS[seat] ?? Color.WHITE;
            graphics.circle(0, 0, 17);
            graphics.fill();
            graphics.strokeColor = Color.WHITE;
            graphics.lineWidth = 3;
            graphics.circle(0, 0, 17);
            graphics.stroke();
            parent.addChild(marker);
            const label = this.label(marker, 'Seat', `${seat + 1}`, 14, Vec3.ZERO, new Color(8, 16, 24), 32, 25);
            marker.active = false;
            this.playerMarkers.push(marker);
            this.playerLabels.push(label);
        }
    }

    private renderTiles(snapshot: AuthoritativeMatchSnapshot): void {
        const propertyMap = new Map(snapshot.properties.map((property) => [property.tileIndex, property]));
        for (let index = 0; index < 32; index++) {
            const tileNode = this.tileNodes[index];
            const tileLabel = this.tileLabels[index];
            if (!tileNode || !tileLabel) continue;
            const property = propertyMap.get(index);
            const landing = snapshot.landing?.tileIndex === index;
            const tileType = tileTypeAt(index);
            const fill = property
                ? PLAYER_COLORS[property.ownerSeat] ?? new Color(70, 90, 110)
                : SPECIAL_COLORS[tileType] ?? new Color(48, 64, 82);
            const stroke = landing ? Color.WHITE : property?.olympicUntilRound && property.olympicUntilRound >= snapshot.round
                ? new Color(248, 98, 64)
                : new Color(110, 151, 179);
            this.paintTile(tileNode, fill, stroke, landing ? 5 : 2);
            const level = property ? (property.buildingLevel >= 4 ? 'LM' : `L${property.buildingLevel}`) : '';
            tileLabel.string = `${index}\n${shortTileName(index)}${level ? `\n${level}` : ''}`;
        }
    }

    private renderPlayers(snapshot: AuthoritativeMatchSnapshot): void {
        for (let seat = 0; seat < this.playerMarkers.length; seat++) {
            const marker = this.playerMarkers[seat];
            const label = this.playerLabels[seat];
            const player = snapshot.players.find((entry) => entry.seat === seat);
            if (!marker || !label) continue;
            marker.active = Boolean(player);
            if (!player) continue;
            const base = tilePosition(player.position);
            marker.setPosition(base.x + (seat % 2 === 0 ? -24 : 24), base.y + (seat < 2 ? 18 : -18));
            marker.setScale(player.bankrupt ? new Vec3(0.72, 0.72, 0.72) : new Vec3(1, 1, 1));
            label.string = `${seat + 1}`;
        }
    }

    private renderAuthorityPanel(snapshot: AuthoritativeMatchSnapshot, localTurn: boolean): void {
        const current = snapshot.players.find((player) => player.seat === snapshot.currentTurnSeat);
        const dice = snapshot.lastDice
            ? `${snapshot.lastDice.first} + ${snapshot.lastDice.second} = ${snapshot.lastDice.total}${snapshot.lastDice.isDouble ? ' DOUBLE' : ''}`
            : 'NOT ROLLED';
        const landing = snapshot.landing ? `${snapshot.landing.displayName} [${snapshot.landing.tileIndex}]` : 'NONE';
        const special = snapshot.specialResult
            ? `${snapshot.specialResult.title}\n${snapshot.specialResult.message}`
            : 'No special result this turn.';
        const playerLines = snapshot.players.map((player) => (
            `P${player.seat + 1} ${player.displayName}  CP ${compactNumber(player.money)}  CITY ${player.propertyCount}${player.islandTurns > 0 ? `  ISLAND ${player.islandTurns}` : ''}`
        )).join('\n');
        this.detail.string = `TURN ${current?.displayName ?? 'SERVER'}  •  ${localTurn ? 'YOUR CONTROL' : 'REMOTE'}\nDICE ${dice}\nLANDING ${landing}\n\n${special}\n\n${playerLines}`;

        const pending = snapshot.pendingAction;
        let label = 'ROLL SERVER DICE';
        if (snapshot.phase === 'FINISHED') label = 'MATCH FINISHED';
        else if (pending?.kind === 'PURCHASE') label = 'PURCHASE SERVER CITY';
        else if (pending?.kind === 'UPGRADE') label = pending.targetLevel >= 4 ? 'BUILD SERVER LANDMARK' : 'UPGRADE SERVER CITY';
        else if (pending?.kind === 'TAKEOVER') label = 'TAKE OVER SERVER CITY';
        else if (pending?.kind === 'GAME_CENTER') label = 'CHOOSE NUMBER BELOW';
        else if (pending?.kind === 'OLYMPIC') label = 'SELECT CITY BELOW';
        else if (pending?.kind === 'WORLD_TRAVEL') label = 'SELECT DESTINATION BELOW';
        else if (snapshot.awaitingEndTurn) label = 'END / SKIP SERVER TURN';
        this.primaryLabel.string = label;
        this.primaryButton.interactable = snapshot.phase === 'ACTIVE' && localTurn && !isSelectionPending(pending);
        const opacity = this.primaryButton.node.getComponent(UIOpacity) ?? this.primaryButton.node.addComponent(UIOpacity);
        opacity.opacity = this.primaryButton.interactable ? 255 : 120;

        const localPlayer = snapshot.players.find((player) => player.profileId === this.localProfileId);
        const canUseSkill = snapshot.phase === 'ACTIVE'
            && localTurn
            && !snapshot.awaitingEndTurn
            && !snapshot.pendingAction
            && Boolean(localPlayer?.activeSkillId)
            && localPlayer?.skillUsed !== true;
        this.skillLabel.string = localPlayer?.skillUsed
            ? 'SKILL USED THIS MATCH'
            : localPlayer?.activeSkillId
                ? `ACTIVATE ${localPlayer.activeSkillId.replace(/-/g, ' ').toUpperCase()}`
                : 'NO SERVER SKILL';
        this.skillButton.interactable = canUseSkill;
        const skillOpacity = this.skillButton.node.getComponent(UIOpacity) ?? this.skillButton.node.addComponent(UIOpacity);
        skillOpacity.opacity = canUseSkill ? 255 : 105;

        for (let index = 0; index < this.optionButtons.length; index++) {
            const button = this.optionButtons[index];
            const optionLabel = this.optionLabels[index];
            const value = pending?.options[index];
            const visible = localTurn && isSelectionPending(pending) && value !== undefined;
            button.node.active = visible;
            button.interactable = visible;
            if (!visible || value === undefined) continue;
            optionLabel.string = pending?.kind === 'GAME_CENTER' ? `NUMBER ${value}` : `${value}  ${shortTileName(value)}`;
        }
    }

    private invokePrimary(): void {
        const snapshot = this.snapshotValue;
        if (!snapshot || snapshot.phase !== 'ACTIVE' || snapshot.currentTurnProfileId !== this.localProfileId) return;
        const pending = snapshot.pendingAction;
        if (pending?.kind === 'PURCHASE') this.actions.purchase();
        else if (pending?.kind === 'UPGRADE') this.actions.upgrade();
        else if (pending?.kind === 'TAKEOVER') this.actions.takeover();
        else if (!pending && snapshot.awaitingEndTurn) this.actions.endTurn();
        else if (!pending) this.actions.roll();
    }

    private invokeSkill(): void {
        const snapshot = this.snapshotValue;
        const player = snapshot?.players.find((entry) => entry.profileId === this.localProfileId);
        if (!snapshot || snapshot.phase !== 'ACTIVE' || snapshot.currentTurnProfileId !== this.localProfileId) return;
        if (!player?.activeSkillId || player.skillUsed || snapshot.pendingAction || snapshot.awaitingEndTurn) return;
        this.actions.activateSkill();
    }

    private async drainEvents(snapshot: AuthoritativeMatchSnapshot): Promise<void> {
        this.presentingEvent = true;
        try {
            while (this.queuedEvents.length > 0 && this.root.isValid) {
                const cue = this.queuedEvents.shift();
                if (!cue) continue;
                await this.playCue(cue, snapshot);
            }
        } finally {
            this.presentingEvent = false;
        }
    }

    private async playCue(cue: AuthoritativePresentationCue, snapshot: AuthoritativeMatchSnapshot): Promise<void> {
        const bannerOpacity = this.eventBanner.node.getComponent(UIOpacity);
        if (bannerOpacity) {
            Tween.stopAllByTarget(bannerOpacity);
            this.eventBanner.string = `#${cue.sequence}  ${cue.title}  •  ${cue.message}`;
            bannerOpacity.opacity = 0;
            tween(bannerOpacity).to(0.12, { opacity: 255 }).delay(0.75).to(0.18, { opacity: 0 }).start();
        }
        if (cue.kind === 'DICE_ROLLED' && cue.diceFirst > 0 && cue.diceSecond > 0) {
            const diceOpacity = this.diceBanner.node.getComponent(UIOpacity);
            if (diceOpacity) {
                Tween.stopAllByTarget(diceOpacity);
                this.diceBanner.string = `${cue.diceFirst}  +  ${cue.diceSecond}  =  ${cue.diceFirst + cue.diceSecond}`;
                diceOpacity.opacity = 0;
                this.diceBanner.node.setScale(0.72, 0.72, 0.72);
                tween(this.diceBanner.node).to(0.2, { scale: new Vec3(1.12, 1.12, 1.12) }, { easing: 'backOut' }).to(0.12, { scale: Vec3.ONE }).start();
                tween(diceOpacity).to(0.12, { opacity: 255 }).delay(0.62).to(0.2, { opacity: 0 }).start();
            }
        }
        const actor = snapshot.players.find((player) => player.profileId === cue.actorProfileId);
        const marker = actor ? this.playerMarkers[actor.seat] : undefined;
        if (marker && cue.toTileIndex >= 0) {
            const target = tilePosition(cue.toTileIndex);
            const offset = new Vec3(actor!.seat % 2 === 0 ? -24 : 24, actor!.seat < 2 ? 18 : -18);
            Tween.stopAllByTarget(marker);
            tween(marker).to(0.42, { position: target.clone().add(offset) }, { easing: 'quadInOut' }).start();
        }
        const targetTile = cue.tileIndex >= 0 ? this.tileNodes[cue.tileIndex] : cue.toTileIndex >= 0 ? this.tileNodes[cue.toTileIndex] : undefined;
        if (targetTile) {
            Tween.stopAllByTarget(targetTile);
            tween(targetTile).to(0.12, { scale: new Vec3(1.12, 1.12, 1.12) }).to(0.2, { scale: Vec3.ONE }).start();
        }
        await delayMs(cue.kind === 'WORLD_EVENT_RESOLVED' || cue.kind === 'MATCH_FINISHED' ? 1100 : 720);
    }

    private invokeOption(index: number): void {
        const pending = this.snapshotValue?.pendingAction;
        const value = pending?.options[index];
        if (!pending || value === undefined) return;
        if (pending.kind === 'GAME_CENTER') this.actions.chooseGameCenter(value);
        else if (pending.kind === 'OLYMPIC') this.actions.selectOlympic(value);
        else if (pending.kind === 'WORLD_TRAVEL') this.actions.selectTravel(value);
    }


    private createReplaySlider(parent: Node, position: Vec3, width: number): Slider {
        const root = new Node('ReplayTimelineSlider');
        root.layer = Layers.Enum.UI_2D;
        root.setPosition(position);
        root.addComponent(UITransform).setContentSize(width, 30);
        parent.addChild(root);
        const track = root.addComponent(Graphics);
        track.fillColor = new Color(40, 56, 74, 255);
        track.roundRect(-width / 2, -5, width, 10, 5);
        track.fill();
        track.strokeColor = new Color(83, 169, 207, 255);
        track.lineWidth = 2;
        track.roundRect(-width / 2, -5, width, 10, 5);
        track.stroke();
        const handleNode = new Node('ReplayTimelineHandle');
        handleNode.layer = Layers.Enum.UI_2D;
        handleNode.addComponent(UITransform).setContentSize(32, 32);
        root.addChild(handleNode);
        const handleGraphics = handleNode.addComponent(Graphics);
        handleGraphics.fillColor = new Color(245, 195, 35, 255);
        handleGraphics.circle(0, 0, 13);
        handleGraphics.fill();
        handleGraphics.strokeColor = Color.WHITE;
        handleGraphics.lineWidth = 2;
        handleGraphics.circle(0, 0, 13);
        handleGraphics.stroke();
        const handleSprite = handleNode.addComponent(Sprite);
        const slider = root.addComponent(Slider);
        slider.handle = handleSprite;
        slider.direction = Slider.Direction.Horizontal;
        slider.progress = 0;
        root.on('slide', () => this.actions.seekReplay?.(slider.progress));
        return slider;
    }

    private panel(name: string, position: Vec3, width: number, height: number, fill: Color, stroke: Color): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(position);
        node.addComponent(UITransform).setContentSize(width, height);
        this.safeRoot.addChild(node);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = fill;
        graphics.roundRect(-width / 2, -height / 2, width, height, 20);
        graphics.fill();
        graphics.strokeColor = stroke;
        graphics.lineWidth = 3;
        graphics.roundRect(-width / 2, -height / 2, width, height, 20);
        graphics.stroke();
        return node;
    }

    private label(parent: Node, name: string, value: string, fontSize: number, position: Vec3, color: Color, width: number, height: number, align = Label.HorizontalAlign.CENTER): Label {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(position);
        node.addComponent(UITransform).setContentSize(width, height);
        parent.addChild(node);
        const label = node.addComponent(Label);
        label.string = value;
        label.fontSize = fontSize;
        label.lineHeight = Math.max(fontSize + 4, Math.round(fontSize * 1.2));
        label.color = color;
        label.horizontalAlign = align;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private button(parent: Node, value: string, position: Vec3, fill: Color, action: () => void, width: number, height: number, fontSize: number): Button {
        const node = new Node(`Button-${value}`);
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(position);
        node.addComponent(UITransform).setContentSize(width, height);
        parent.addChild(node);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = fill;
        graphics.roundRect(-width / 2, -height / 2, width, height, 13);
        graphics.fill();
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.97;
        node.on(Button.EventType.CLICK, action);
        this.label(node, 'Label', value, fontSize, Vec3.ZERO, Color.WHITE, width - 16, height - 8);
        return button;
    }

    private paintTile(node: Node, fill: Color, stroke: Color, lineWidth = 2): void {
        let graphics = node.getComponent(Graphics);
        if (!graphics) graphics = node.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = fill;
        graphics.roundRect(-51, -38, 102, 76, 9);
        graphics.fill();
        graphics.strokeColor = stroke;
        graphics.lineWidth = lineWidth;
        graphics.roundRect(-51, -38, 102, 76, 9);
        graphics.stroke();
    }
}

function isSelectionPending(pending: AuthoritativePendingAction | null): boolean {
    return pending?.kind === 'GAME_CENTER' || pending?.kind === 'OLYMPIC' || pending?.kind === 'WORLD_TRAVEL';
}

function tilePosition(index: number): Vec3 {
    const left = -505;
    const right = 505;
    const bottom = -330;
    const top = 330;
    const stepX = (right - left) / 8;
    const stepY = (top - bottom) / 8;
    const side = Math.floor(index / 8);
    const step = index % 8;
    if (side === 0) return new Vec3(left + step * stepX, bottom);
    if (side === 1) return new Vec3(right, bottom + step * stepY);
    if (side === 2) return new Vec3(right - step * stepX, top);
    return new Vec3(left, top - step * stepY);
}

function tileTypeAt(index: number): string {
    if (index === 0) return 'START';
    if ([2, 10, 18, 26].includes(index)) return 'FORTUNE';
    if (index === 5) return 'GAME_CENTER';
    if (index === 8) return 'ISLAND';
    if (index === 13) return 'OLYMPIC';
    if (index === 16) return 'WORLD_TRAVEL';
    if (index === 21) return 'TAX';
    if (index === 24) return 'BONUS_GAME';
    return 'CITY';
}

function shortTileName(index: number): string {
    const names: Readonly<Record<number, string>> = {
        0: 'START', 2: 'FORTUNE', 5: 'GAME', 8: 'ISLAND', 10: 'FORTUNE', 13: 'OLYMPIC',
        16: 'TRAVEL', 18: 'FORTUNE', 21: 'TAX', 24: 'BONUS', 26: 'FORTUNE', 29: 'TOURIST',
    };
    return names[index] ?? `CITY ${index}`;
}

function compactNumber(value: number): string {
    if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
    if (value >= 1_000) return `${Math.round(value / 1000)}K`;
    return `${value}`;
}

function delayMs(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
}
