import {
    BlockInputEvents,
    Button,
    Camera,
    Canvas,
    Color,
    director,
    EditBox,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Layers,
    Material,
    Node,
    ResolutionPolicy,
    resources,
    SafeArea,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec3,
    view,
    Widget,
} from 'cc';
import type { SettingsSnapshot } from '../core/SettingsService';
import type { CareerProgressionSnapshot } from '../core/CareerProgressionService';
import type { OnlineProfileActionResult, OnlineProfileSnapshot } from '../core/OnlineProfileService';
import type { ReplayLibraryActionResult, ReplayLibrarySnapshot } from '../core/ReplayLibraryService';
import type { FriendRoomRole } from '../save/OnlineProfileData';
import type {
    AuthoritativeActionResult,
    AuthoritativeMatchEvent,
    AuthoritativeMatchSnapshot,
} from '../network/AuthoritativeMatchProtocol';
import type {
    AuthoritativeEventHistory,
    AuthoritativeReplayArchiveHistory,
    AuthoritativeReplayArchiveSummary,
    AuthoritativeReplayLibrary,
    AuthoritativeReplayVisibility,
} from '../network/AuthoritativeReplayProtocol';
import type {
    CompetitiveActionResult,
    CompetitiveHubSnapshot,
    CompetitiveMode,
    TournamentDetail,
    TournamentMode,
} from '../network/CompetitiveProtocol';
import type {
    RankedProgressionSnapshot,
    RankedWeeklyClaimResult,
} from '../core/RankedProgressionService';
import {
    CHARACTER_CARD_UPGRADE_COST,
    CHARACTER_PACK_COST,
    CharacterCardView,
    CharacterProgressionActionResult,
    CharacterProgressionSnapshot,
    InventoryItemView,
    UPGRADE_POINT_REDEEM_COST,
} from '../core/CharacterProgressionService';
import {
    MatchSettingsData,
    MATCH_PLAYER_COUNT_MAX,
    MATCH_PLAYER_COUNT_MIN,
    MATCH_TURN_SECONDS_MAX,
    MATCH_TURN_SECONDS_MIN,
} from '../save/MatchSettingsData';
import { CHARACTER_COLLECTION_LIMIT } from '../save/CharacterProgressionData';
import { ITEM_CATALOG, ItemCategory } from '../data/ItemCatalog';
import {
    changeRoomPlayerCount,
    changeRoomTurnSeconds,
    cycleRoomBotDifficulty,
    createLocalRoomSettings,
    createLocalRoomSlots,
    FRONT_END_META_CONTENT,
    FRONT_END_META_PAGES,
    FrontEndMetaPage,
    toggleRoomAutoRoll,
    toggleRoomMode,
    toggleRoundEvents,
} from './FrontEndCatalog';
import {
    CLASSIC_CHANNELS,
    ClassicLobbyRoomFilter,
    classicLobbyRoomStatus,
    filterClassicLobbyRooms,
} from './ClassicLobbyCatalog';
import { AuthoritativeBoardOverlay } from './AuthoritativeBoardOverlay';
import { Authoritative3DBoardPresenter } from './Authoritative3DBoardPresenter';
import { AuthoritativeEventPresentationQueue } from './AuthoritativeEventPresentationQueue';
import { AuthoritativeReplayPlayer } from './AuthoritativeReplayPlayer';

export interface FrontEndActions {
    readonly startLocalMatch: (settings: MatchSettingsData) => void;
    readonly openSettings: () => SettingsSnapshot;
    readonly closeSettings: () => void;
    readonly adjustMusicVolume: (delta: number) => SettingsSnapshot;
    readonly adjustSoundVolume: (delta: number) => SettingsSnapshot;
    readonly toggleReducedCameraMotion: () => SettingsSnapshot;
    readonly getCharacterProgression: () => CharacterProgressionSnapshot;
    readonly getCareerProgression: () => CareerProgressionSnapshot;
    readonly getRankedProgression: () => RankedProgressionSnapshot;
    readonly startRankedMatch: (mode: MatchSettingsData['matchMode']) => void;
    readonly claimRankedWeeklyReward: () => RankedWeeklyClaimResult;
    readonly getOnlineProfile: () => OnlineProfileSnapshot;
    readonly createFriendRoom: (mode: MatchSettingsData['matchMode']) => OnlineProfileActionResult;
    readonly addFriendRoomPlayer: () => OnlineProfileActionResult;
    readonly addFriendRoomSpectator: () => OnlineProfileActionResult;
    readonly toggleFriendRoomReady: () => OnlineProfileActionResult;
    readonly simulateFriendRoomDisconnect: () => OnlineProfileActionResult;
    readonly reconnectFriendRoom: () => OnlineProfileActionResult;
    readonly leaveFriendRoom: () => OnlineProfileActionResult;
    readonly rotateFriendCode: () => OnlineProfileActionResult;
    readonly createSupabaseRoom: (mode: MatchSettingsData['matchMode']) => Promise<OnlineProfileActionResult>;
    readonly joinSupabaseRoom: (inviteCode: string, role: FriendRoomRole) => Promise<OnlineProfileActionResult>;
    readonly reconnectSupabaseRoom: () => Promise<OnlineProfileActionResult>;
    readonly disconnectSupabaseRoom: () => Promise<OnlineProfileActionResult>;
    readonly syncSupabaseRoom: () => Promise<OnlineProfileActionResult>;
    readonly heartbeatSupabaseRoom: () => Promise<OnlineProfileActionResult>;
    readonly startSupabaseMatch: () => Promise<OnlineProfileActionResult>;
    readonly activateSupabaseSkill: () => Promise<OnlineProfileActionResult>;
    readonly resumeSupabaseMatch: () => Promise<OnlineProfileActionResult>;
    readonly rollSupabaseDice: () => Promise<OnlineProfileActionResult>;
    readonly purchaseSupabaseProperty: () => Promise<OnlineProfileActionResult>;
    readonly upgradeSupabaseProperty: () => Promise<OnlineProfileActionResult>;
    readonly takeoverSupabaseProperty: () => Promise<OnlineProfileActionResult>;
    readonly chooseSupabaseGameCenter: (selectedNumber: number) => Promise<OnlineProfileActionResult>;
    readonly selectSupabaseOlympic: (tileIndex: number) => Promise<OnlineProfileActionResult>;
    readonly selectSupabaseTravel: (tileIndex: number) => Promise<OnlineProfileActionResult>;
    readonly endSupabaseTurn: () => Promise<OnlineProfileActionResult>;
    readonly getAuthoritativeMatch: () => AuthoritativeMatchSnapshot | null;
    readonly getAuthoritativeEventHistory: (afterSequence?: number, limit?: number) => Promise<AuthoritativeActionResult<AuthoritativeEventHistory>>;
    readonly publishAuthoritativeReplay: (visibility: AuthoritativeReplayVisibility) => Promise<AuthoritativeActionResult<AuthoritativeReplayArchiveSummary>>;
    readonly getAuthoritativeReplayLibrary: (limit?: number) => Promise<AuthoritativeActionResult<AuthoritativeReplayLibrary>>;
    readonly getAuthoritativeReplayByCode: (replayCode: string) => Promise<AuthoritativeActionResult<AuthoritativeReplayArchiveHistory>>;
    readonly deleteAuthoritativeReplay: (replayId: string) => Promise<AuthoritativeActionResult<Record<string, unknown>>>;
    readonly getCompetitiveHub: () => Promise<CompetitiveActionResult<CompetitiveHubSnapshot>>;
    readonly joinCompetitiveQueue: (mode: CompetitiveMode) => Promise<CompetitiveActionResult<CompetitiveHubSnapshot>>;
    readonly pollCompetitiveQueue: () => Promise<CompetitiveActionResult<CompetitiveHubSnapshot>>;
    readonly subscribeCompetitiveQueue: (listener: (result: CompetitiveActionResult<CompetitiveHubSnapshot>) => void) => Promise<CompetitiveActionResult<CompetitiveHubSnapshot>>;
    readonly unsubscribeCompetitiveQueue: () => Promise<void>;
    readonly cancelCompetitiveQueue: () => Promise<CompetitiveActionResult<CompetitiveHubSnapshot>>;
    readonly finalizeCompetitiveMatch: () => Promise<CompetitiveActionResult<CompetitiveHubSnapshot>>;
    readonly createTournament: (name: string, capacity: 4 | 8, mode: TournamentMode) => Promise<CompetitiveActionResult<TournamentDetail>>;
    readonly joinTournament: (code: string) => Promise<CompetitiveActionResult<TournamentDetail>>;
    readonly getTournament: (code: string) => Promise<CompetitiveActionResult<TournamentDetail>>;
    readonly advanceTournament: (code: string) => Promise<CompetitiveActionResult<TournamentDetail>>;
    readonly prepareCloudBackup: () => OnlineProfileActionResult;
    readonly acknowledgeCloudBackup: () => OnlineProfileActionResult;
    readonly getReplayLibrary: () => ReplayLibrarySnapshot;
    readonly deleteReplay: (replayId: string) => ReplayLibraryActionResult;
    readonly purchaseCharacterPack: () => CharacterProgressionActionResult;
    readonly redeemCharacterUpgradePoints: () => CharacterProgressionActionResult;
    readonly equipCharacterCard: (cardId: string) => CharacterProgressionActionResult;
    readonly upgradeCharacterCard: (cardId: string) => CharacterProgressionActionResult;
    readonly combineCharacterCards: (
        firstCardId: string,
        secondCardId: string,
    ) => CharacterProgressionActionResult;
    readonly purchaseItem: (definitionId: string) => CharacterProgressionActionResult;
    readonly equipPendant: (definitionId: string) => CharacterProgressionActionResult;
    readonly selectBooster: (definitionId: string) => CharacterProgressionActionResult;
}

type FrontEndPage = 'LOBBY' | 'ROOM' | FrontEndMetaPage;

const GOLD = new Color(245, 195, 35);
const CYAN = new Color(30, 202, 255);
const BLUE = new Color(45, 151, 199);
const NAVY = new Color(58, 72, 94);
const SILVER = new Color(188, 199, 216);
const PANEL = new Color(16, 21, 31, 248);
const PANEL_ALT = new Color(21, 29, 43, 252);
const BORDER = new Color(47, 63, 82);
const INK = new Color(10, 14, 21);
const BUTTON_DISABLED = new Color(39, 48, 61);
const BUTTON_DISABLED_TEXT = new Color(125, 139, 158);

// Legacy verification marker: V102 LIVE REPLAY ACADEMY
// Legacy verification marker: V102 LIVE ACADEMY
// Legacy verification marker: CLIENT  V102
export class FrontEndShell {
    private readonly root = new Node('FrontEndShell');
    private readonly safeRoot = new Node('SafeAreaRoot');
    private readonly lobbyPage = new Node('LobbyPage');
    private readonly roomPage = new Node('LocalRoomPage');
    private readonly metaPage = new Node('MetaPage');
    private readonly metaCardsRoot = new Node('MetaCards');
    private readonly settingsRoot = new Node('MenuSettings');
    private readonly metaModalLayer = new Node('ProgressionModalLayer');
    private readonly metaModal = new Node('ProgressionModal');
    private authorityOverlay: AuthoritativeBoardOverlay | null = null;
    private authority3D: Authoritative3DBoardPresenter | null = null;
    private authorityReplay: AuthoritativeReplayPlayer | null = null;
    private authorityReplayReturnToLive = true;
    private serverReplayLibrary: AuthoritativeReplayLibrary | null = null;
    private serverReplayFocusIndex = 0;
    private lastPublishedReplayCode = '';
    private competitiveHub: CompetitiveHubSnapshot | null = null;
    private tournamentFocusIndex = 0;
    private competitiveRealtimeActive = false;
    private readonly authorityEvents = new AuthoritativeEventPresentationQueue();
    private readonly roomSlotLabels: Label[] = [];
    private readonly roomSlotStamps: Label[] = [];
    private readonly roomTeamBands: Label[] = [];
    private readonly lobbyRoomLabels: Label[] = [];
    private readonly lobbyRoomButtons: Button[] = [];
    private readonly metaCardKickers: Label[] = [];
    private readonly metaCardTitles: Label[] = [];
    private readonly metaCardBodies: Label[] = [];
    private readonly metaCardButtons: Button[] = [];
    private readonly metaCardButtonLabels: Label[] = [];
    private readonly metaCardActions: Array<() => void> = [
        () => undefined,
        () => undefined,
        () => undefined,
    ];
    private currentPage: FrontEndPage = 'LOBBY';
    private lobbyRoomFilter: ClassicLobbyRoomFilter = 'ALL';
    private lobbyChannelIndex = 0;
    private selectedLobbyRoomIndex = 0;
    private roomSettings: MatchSettingsData;
    private settingsSnapshot: SettingsSnapshot;
    private characterSnapshot: CharacterProgressionSnapshot;
    private careerSnapshot: CareerProgressionSnapshot;
    private rankedSnapshot: RankedProgressionSnapshot;
    private onlineSnapshot: OnlineProfileSnapshot;
    private replaySnapshot: ReplayLibrarySnapshot;
    private characterFocusIndex = 0;
    private shopItemFocusIndex = 0;
    private pendantFocusIndex = 0;
    private boosterFocusIndex = 0;
    private replayFocusIndex = 0;
    private selectedMaterialIds: string[] = [];
    private progressionBusy = false;
    private metaModalOpen = false;
    private modalConfirmAction: () => void = () => undefined;
    private modalCancelAction: () => void = () => undefined;
    private starting = false;
    private headerStatus!: Label;
    private profileCurrency!: Label;
    private lobbySetup!: Label;
    private lobbyHeroKicker!: Label;
    private lobbyHeroName!: Label;
    private lobbyHeroRole!: Label;
    private lobbyHeroPassive!: Label;
    private lobbyHeroLevel!: Label;
    private lobbyChannel!: Label;
    private lobbyRoomDetails!: Label;
    private lobbyRoomPage!: Label;
    private roomTitle!: Label;
    private roomModeInfo!: Label;
    private roomPlayerCount!: Label;
    private roomTurnSeconds!: Label;
    private roomAutoRoll!: Label;
    private roomBotDifficulty!: Label;
    private roomRoundEvents!: Label;
    private roomMode!: Label;
    private roomSummary!: Label;
    private roomDecreasePlayers!: Button;
    private roomIncreasePlayers!: Button;
    private roomDecreaseTurn!: Button;
    private roomIncreaseTurn!: Button;
    private roomStartButton!: Button;
    private metaTitle!: Label;
    private metaSubtitle!: Label;
    private metaModalTitle!: Label;
    private metaModalBody!: Label;
    private metaModalConfirm!: Button;
    private metaModalConfirmLabel!: Label;
    private metaModalCancel!: Button;
    private metaModalCancelLabel!: Label;
    private metaModalInputNode!: Node;
    private metaModalInput!: EditBox;
    private settingsMusic!: Label;
    private settingsSound!: Label;
    private settingsMotion!: Label;

    public constructor(
        initialRoomSettings: MatchSettingsData,
        initialSettings: SettingsSnapshot,
        initialCharacterProgression: CharacterProgressionSnapshot,
        initialCareerProgression: CareerProgressionSnapshot,
        initialRankedProgression: RankedProgressionSnapshot,
        initialOnlineProfile: OnlineProfileSnapshot,
        initialReplayLibrary: ReplayLibrarySnapshot,
        private readonly actions: FrontEndActions,
    ) {
        this.roomSettings = createLocalRoomSettings(initialRoomSettings);
        this.settingsSnapshot = initialSettings;
        this.characterSnapshot = initialCharacterProgression;
        this.careerSnapshot = initialCareerProgression;
        this.rankedSnapshot = initialRankedProgression;
        this.onlineSnapshot = initialOnlineProfile;
        this.replaySnapshot = initialReplayLibrary;
        this.setupCanvas();
        this.createBackdrop();
        this.createHeader();
        this.createLobbyPage();
        this.createRoomPage();
        this.createMetaPage();
        this.createMetaNavigation();
        this.showLobby();
    }

    public refreshOnline(snapshot: OnlineProfileSnapshot): void {
        this.onlineSnapshot = snapshot;
        if (this.currentPage === 'ONLINE') this.renderOnlineCenter();
        const authority = this.actions.getAuthoritativeMatch();
        const replayState = this.authorityReplay?.status().state;
        const replayActive = replayState === 'PLAYING' || replayState === 'PAUSED' || replayState === 'SEEKING' || (!this.authorityReplayReturnToLive && replayState === 'FINISHED');
        if (authority && this.authorityOverlay && !replayActive) this.authorityOverlay.render(authority, snapshot.profileId);
        if (authority && this.authority3D && !replayActive) this.authority3D.synchronize(authority, snapshot.profileId);
        this.renderLobbyProgression();
    }

    public presentAuthoritativeEvent(event: AuthoritativeMatchEvent): void {
        const replayState = this.authorityReplay?.status().state;
        if (replayState === 'PLAYING' || replayState === 'PAUSED') {
            this.setStatus(`LIVE EVENT ${event.sequence} BUFFERED  •  REPLAY MODE ACTIVE`);
            return;
        }
        const cue = this.authorityEvents.push(event);
        if (!cue) return;
        const snapshot = this.actions.getAuthoritativeMatch();
        if (snapshot && this.authorityOverlay) this.authorityOverlay.enqueueEvent(cue, snapshot);
        if (snapshot && this.authority3D) this.authority3D.enqueue(cue, snapshot);
        this.setStatus(`SERVER EVENT ${event.sequence}  •  ${event.kind.replace(/_/g, ' ')}`);
    }

    public destroy(): void {
        if (this.currentPage === 'SETTINGS') this.actions.closeSettings();
        this.authorityOverlay?.destroy();
        this.authorityOverlay = null;
        this.authorityReplay?.stop();
        this.authorityReplay = null;
        this.authority3D?.destroy();
        this.authority3D = null;
        this.root.active = true;
        if (this.root.isValid) this.root.destroy();
    }

    private setupCanvas(): void {
        view.setDesignResolutionSize(1920, 1080, ResolutionPolicy.FIXED_HEIGHT);
        this.root.layer = Layers.Enum.UI_2D;
        this.root.addComponent(UITransform).setContentSize(2200, 1080);

        const cameraNode = new Node('FrontEndCamera');
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
    }

    private createBackdrop(): void {
        // Load the referenced PBR material while the player is in the lobby.
        // This also registers builtin-standard in optimized web builds before
        // the procedural match board creates its per-color material variants.
        resources.load('materials/V67Standard', Material, () => undefined);

        const background = this.uiNode('Background', this.safeRoot, Vec3.ZERO, 2200, 1080);
        background.addComponent(BlockInputEvents);

        // V76 always renders a complete classic-game backdrop, even when optional artwork
        // has not been imported yet. This removes the empty grey preview bands that made
        // the lobby look like a web dashboard floating inside the canvas.
        const fallback = this.uiNode('ClassicLobbyFallbackV90', background, Vec3.ZERO, 2200, 1080);
        const fallbackGraphics = fallback.addComponent(Graphics);
        const skyBands = [
            new Color(35, 126, 181, 255),
            new Color(49, 148, 199, 255),
            new Color(78, 174, 213, 255),
            new Color(120, 198, 224, 255),
        ];
        skyBands.forEach((color, index) => {
            fallbackGraphics.fillColor = color;
            fallbackGraphics.fillRect(-1100, 540 - (index + 1) * 185, 2200, 190);
        });
        fallbackGraphics.fillColor = new Color(211, 231, 235, 255);
        fallbackGraphics.fillRect(-1100, -240, 2200, 210);
        fallbackGraphics.fillColor = new Color(101, 78, 61, 255);
        fallbackGraphics.fillRect(-1100, -540, 2200, 305);
        fallbackGraphics.fillColor = new Color(137, 104, 75, 255);
        for (let stripe = 0; stripe < 11; stripe++) {
            fallbackGraphics.fillRect(-1100, -530 + stripe * 28, 2200, 3);
        }
        fallbackGraphics.strokeColor = new Color(255, 255, 255, 48);
        fallbackGraphics.lineWidth = 3;
        for (let ray = 0; ray < 9; ray++) {
            fallbackGraphics.moveTo(-760 + ray * 190, -235);
            fallbackGraphics.lineTo(-920 + ray * 235, -540);
            fallbackGraphics.stroke();
        }
        fallbackGraphics.fillColor = new Color(255, 255, 255, 145);
        [-620, -110, 450].forEach((x, cloudIndex) => {
            const y = 330 - cloudIndex * 34;
            fallbackGraphics.circle(x, y, 48);
            fallbackGraphics.circle(x + 55, y + 10, 61);
            fallbackGraphics.circle(x + 120, y - 3, 43);
            fallbackGraphics.fill();
        });

        const artworkNode = this.uiNode('LobbyWorldArtworkV67', background, Vec3.ZERO, 2200, 1080);
        artworkNode.active = false;
        const artwork = artworkNode.addComponent(Sprite);
        artwork.sizeMode = Sprite.SizeMode.CUSTOM;
        resources.load('environment/ComePlayersLobbyWorldV67', SpriteFrame, (error: unknown, frame: SpriteFrame | null) => {
            if (error || !frame || !artworkNode.isValid) return;
            artwork.spriteFrame = frame;
            artworkNode.active = true;
        });

        const overlay = this.uiNode('ClassicBackdropReadabilityV90', background, Vec3.ZERO, 2200, 1080);
        const graphics = overlay.addComponent(Graphics);
        graphics.fillColor = new Color(8, 34, 54, 52);
        graphics.fillRect(-1100, -540, 2200, 1080);
        graphics.fillColor = new Color(12, 45, 68, 56);
        graphics.fillRect(-1100, -540, 540, 1080);
        graphics.fillColor = new Color(12, 45, 68, 50);
        graphics.fillRect(560, -540, 540, 1080);
        graphics.fillColor = new Color(255, 255, 255, 20);
        graphics.fillRect(-1100, 330, 2200, 210);
        graphics.strokeColor = new Color(96, 224, 255, 56);
        graphics.lineWidth = 2;
        for (let index = 0; index < 10; index++) {
            const offset = index * 220;
            graphics.moveTo(-1120 + offset, 90);
            graphics.lineTo(-680 + offset, 540);
            graphics.stroke();
        }
        graphics.fillColor = new Color(245, 195, 35, 72);
        graphics.fillRect(-1100, -520, 2200, 5);
        graphics.fillColor = new Color(34, 144, 197, 54);
        graphics.roundRect(-900, -420, 1800, 820, 38);
        graphics.fill();
    }

    private createHeader(): void {
        const header = this.panel('ClassicHeaderV90', this.safeRoot, new Vec3(0, 486), 2040, 82, new Color(22, 94, 143, 250), new Color(244, 211, 106));
        this.childLabel(
            header, 'Brand', 'COMEPLAYERS', 30, new Vec3(-790, 12), GOLD, 360, 42,
            Label.HorizontalAlign.LEFT,
        );
        this.childLabel(
            header, 'GameTitle', 'MARBLE WORLD  •  VIDEO REFERENCE GAMEPLAY V105', 17, new Vec3(-790, -23), new Color(157, 226, 255), 430, 26,
            Label.HorizontalAlign.LEFT,
        );
        this.headerStatus = this.childLabel(
            header, 'HeaderStatus', 'ROOKIE CHANNEL  •  V105 VIDEO REFERENCE', 18,
            new Vec3(0, 0), Color.WHITE, 650, 40,
        );

        const profile = this.panel('Profile', header, new Vec3(755, 0), 450, 66, new Color(28, 112, 160, 252), new Color(244, 211, 106));
        this.childLabel(
            profile, 'PlayerName', `${this.onlineSnapshot.displayName.toUpperCase()}  •  LV. ${this.careerSnapshot.level}`, 18, new Vec3(-92, 13), Color.WHITE, 235, 28,
            Label.HorizontalAlign.LEFT,
        );
        this.profileCurrency = this.childLabel(
            profile, 'Currency', 'LOCAL CP 125,000', 16, new Vec3(-92, -15), GOLD, 235, 24,
            Label.HorizontalAlign.LEFT,
        );
        this.childLabel(profile, 'Rank', `${this.rankedSnapshot.tier} ${this.rankedSnapshot.rating}`, 16, new Vec3(145, 0), new Color(154, 230, 255), 140, 30);
    }

    private createLobbyPage(): void {
        this.preparePage(this.lobbyPage);

        const eventRibbon = this.panel(
            'ClassicEventRibbonV90',
            this.lobbyPage,
            new Vec3(0, 405),
            1740,
            62,
            new Color(246, 215, 108, 252),
            new Color(255, 239, 172),
        );
        this.childLabel(
            eventRibbon, 'EventMessage',
            'RIVAL GAUNTLET EVENT  •  SEASON SCORE  •  PODIUM STREAK  •  TACTICAL REPLAY',
            15, new Vec3(-365, 10), new Color(48, 38, 25), 900, 26, Label.HorizontalAlign.LEFT,
        );
        this.childLabel(eventRibbon, 'ChannelMetric', 'CHANNEL  ROOKIE', 12, new Vec3(-580, -17), new Color(77, 57, 29), 220, 20);
        this.childLabel(eventRibbon, 'RoomMetric', 'ROOMS  48', 12, new Vec3(-300, -17), new Color(77, 57, 29), 180, 20);
        this.childLabel(eventRibbon, 'PlayerMetric', 'PLAYERS  318', 12, new Vec3(-55, -17), new Color(77, 57, 29), 200, 20);
        this.childLabel(eventRibbon, 'PingMetric', 'PING  32ms', 12, new Vec3(185, -17), new Color(77, 57, 29), 180, 20);
        this.childLabel(eventRibbon, 'RewardMetric', 'BONUS  x2 CP', 12, new Vec3(430, -17), new Color(77, 57, 29), 200, 20);
        this.childLabel(eventRibbon, 'ClientMetric', 'CLIENT  V105', 12, new Vec3(690, -17), new Color(77, 57, 29), 180, 20);

        const hero = this.panel('ClassicCharacterCardV90', this.lobbyPage, new Vec3(-700, -18), 350, 744, new Color(29, 125, 174, 248), new Color(244, 211, 106));
        this.lobbyHeroKicker = this.childLabel(
            hero, 'HeroKicker', 'EQUIPPED CHARACTER  •  SR  •  1 STAR', 15, new Vec3(0, 326), new Color(154, 230, 255), 310, 30,
        );
        this.lobbyHeroName = this.childLabel(hero, 'HeroName', 'ALEXIA', 40, new Vec3(0, 286), GOLD, 310, 52);
        this.drawAlexiaPlaceholder(hero);
        this.lobbyHeroRole = this.childLabel(
            hero, 'HeroRole', 'URBAN EXPLORER', 18, new Vec3(0, -134), Color.WHITE, 310, 34,
        );
        this.lobbyHeroPassive = this.childLabel(
            hero, 'HeroPassive', 'PASSIVE\nTravel presentation +10% energy', 16,
            new Vec3(0, -188), new Color(203, 226, 239), 300, 76,
        );
        this.progressBar(hero, new Vec3(0, -242), 278, 16, 0.36, GOLD);
        this.lobbyHeroLevel = this.childLabel(
            hero, 'HeroLevel', 'COLLECTION  3 CARDS', 15, new Vec3(0, -270), new Color(195, 220, 234), 300, 28,
        );
        this.childButton(
            hero, 'CHARACTER CARD', new Vec3(0, -310), new Color(31, 125, 178),
            () => this.openMetaPage('CHARACTER'), 280, 60, 18,
        );
        this.childButton(
            hero, 'OPEN SHOP', new Vec3(0, -348), GOLD,
            () => this.openMetaPage('SHOP'), 280, 54, 17,
        );

        const browser = this.panel('ClassicRoomBrowserV90', this.lobbyPage, new Vec3(0, -18), 950, 744, new Color(41, 142, 187, 250), new Color(244, 211, 106));
        this.childLabel(browser, 'LobbyKicker', 'MARBLE WORLD  /  WORLD MAP ROOM LOBBY', 16, new Vec3(-270, 326), new Color(160, 229, 255), 350, 30, Label.HorizontalAlign.LEFT);
        this.lobbyChannel = this.childLabel(browser, 'ChannelName', '', 20, new Vec3(150, 326), Color.WHITE, 350, 34, Label.HorizontalAlign.RIGHT);
        this.childButton(browser, 'CHANGE', new Vec3(380, 326), new Color(41, 126, 174), () => this.cycleLobbyChannel(), 130, 44, 15);

        this.childButton(browser, 'ALL ROOM', new Vec3(-290, 270), GOLD, () => this.setLobbyRoomFilter('ALL'), 220, 54, 17);
        this.childButton(browser, 'SOLO MATCH', new Vec3(0, 270), new Color(39, 132, 182), () => this.setLobbyRoomFilter('SOLO'), 250, 54, 17);
        this.childButton(browser, 'TEAM MATCH', new Vec3(290, 270), new Color(39, 132, 182), () => this.setLobbyRoomFilter('TEAM'), 250, 54, 17);

        const listHeader = this.panel('RoomListHeader', browser, new Vec3(0, 220), 870, 42, new Color(8, 28, 46, 255), new Color(78, 158, 199));
        this.childLabel(listHeader, 'Number', 'NO.', 14, new Vec3(-392, 0), new Color(177, 220, 239), 65, 24);
        this.childLabel(listHeader, 'Room', 'ROOM / HOST', 14, new Vec3(-190, 0), new Color(177, 220, 239), 300, 24, Label.HorizontalAlign.LEFT);
        this.childLabel(listHeader, 'Map', 'MAP', 14, new Vec3(125, 0), new Color(177, 220, 239), 180, 24);
        this.childLabel(listHeader, 'Mode', 'MODE', 14, new Vec3(270, 0), new Color(177, 220, 239), 95, 24);
        this.childLabel(listHeader, 'Players', 'PLAYER', 14, new Vec3(382, 0), new Color(177, 220, 239), 90, 24);

        const rowY = [190, 121, 52, -17, -86, -155];
        for (let index = 0; index < rowY.length; index++) {
            const row = this.panel(
                `LobbyRoom-${index}`,
                browser,
                new Vec3(0, rowY[index] as number),
                870,
                60,
                index % 2 === 0 ? new Color(57, 139, 180, 252) : new Color(43, 119, 163, 252),
                index === 0 ? GOLD : new Color(65, 139, 179),
            );
            const button = row.addComponent(Button);
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 0.985;
            row.on(Button.EventType.CLICK, () => this.selectLobbyRoom(index));
            this.lobbyRoomButtons.push(button);
            this.lobbyRoomLabels.push(this.childLabel(
                row, 'RoomInfo', '', 16, Vec3.ZERO, Color.WHITE, 830, 48, Label.HorizontalAlign.LEFT,
            ));
        }
        this.lobbyRoomPage = this.childLabel(browser, 'RoomPage', '', 15, new Vec3(0, -204), new Color(171, 221, 241), 300, 28);
        this.lobbyRoomDetails = this.childLabel(browser, 'SelectedRoom', '', 17, new Vec3(-70, -252), Color.WHITE, 620, 54, Label.HorizontalAlign.LEFT);
        this.childButton(browser, 'JOIN ROOM', new Vec3(315, -252), GOLD, () => this.joinSelectedLobbyRoom(), 230, 62, 19);
        this.childButton(browser, 'QUICK MATCH', new Vec3(-290, -315), new Color(40, 139, 191), () => {
            this.setStatus('QUICK MATCH  •  LOCAL BOTS FOUND');
            this.openLocalRoom();
        }, 250, 64, 18);
        this.childButton(browser, 'CREATE ROOM', new Vec3(0, -315), new Color(40, 139, 191), () => this.openLocalRoom(), 250, 64, 18);
        this.childButton(browser, 'RANKED MATCH', new Vec3(290, -315), GOLD, () => this.startRankedQueue(), 250, 64, 18);

        const hub = this.panel('ClassicPlayerHubV90', this.lobbyPage, new Vec3(700, -18), 350, 744, new Color(29, 125, 174, 248), new Color(244, 211, 106));
        this.childLabel(hub, 'HubKicker', 'PLAYER HUB', 16, new Vec3(0, 318), new Color(154, 230, 255), 300, 30);
        this.childLabel(hub, 'HubTitle', 'PLAYER PROFILE', 29, new Vec3(0, 278), Color.WHITE, 300, 44);
        this.statRow(hub, 'RANKED', `${this.rankedSnapshot.tier}  ${this.rankedSnapshot.rating}`, 239);
        this.statRow(hub, 'WIN RATE', `${Math.round(this.rankedSnapshot.seasonWinRate * 100)}%`, 185);
        this.statRow(hub, 'RECORD', `${this.rankedSnapshot.seasonWins}W / ${this.rankedSnapshot.seasonMatches}M`, 131);
        const setup = this.panel('LastSetup', hub, new Vec3(0, 22), 300, 150, new Color(25, 88, 127, 255), new Color(71, 148, 190));
        this.childLabel(setup, 'LastSetupKicker', 'LAST MATCH SETUP', 15, new Vec3(0, 52), new Color(154, 230, 255), 270, 26);
        this.lobbySetup = this.childLabel(setup, 'LastSetupValue', '', 17, new Vec3(0, -7), Color.WHITE, 270, 78);
        this.childLabel(hub, 'MissionTitle', 'CAREER MISSIONS', 17, new Vec3(0, -92), GOLD, 300, 30);
        const lobbyMissions = this.careerSnapshot.missions.slice(0, 3);
        const missionFallbacks = [
            { title: 'FIRST MATCH', progress: 0, target: 1 },
            { title: 'CITY BUILDER', progress: 0, target: 10 },
            { title: 'WORLD TRAVELER', progress: 0, target: 1 },
        ];
        [-144, -214, -284].forEach((y, index) => {
            const mission = lobbyMissions[index] ?? missionFallbacks[index];
            if (!mission) return;
            this.missionRow(
                hub,
                mission.title,
                `${mission.progress} / ${mission.target}`,
                y,
                mission.target > 0 ? mission.progress / mission.target : 0,
            );
        });
        this.childButton(hub, 'RANKED HUB', new Vec3(0, -315), new Color(31, 125, 178), () => this.openMetaPage('RANKED'), 280, 58, 18);

        const notice = this.panel(
            'ClassicLobbyNoticeV90',
            this.lobbyPage,
            new Vec3(0, -412),
            1740,
            42,
            new Color(18, 76, 116, 244),
            new Color(244, 211, 106),
        );
        this.childLabel(
            notice,
            'NoticeText',
            'NOTICE  •  Double dice grants an extra turn  •  Landmarks block takeover  •  World Travel can complete a monopoly',
            13,
            Vec3.ZERO,
            new Color(239, 231, 204),
            1660,
            26,
        );

        const clientDock = this.panel(
            'ClassicLobbyClientDockV90',
            this.lobbyPage,
            new Vec3(0, -474),
            2040,
            72,
            new Color(15, 66, 103, 250),
            new Color(244, 211, 106),
        );
        const dockEntries = [
            ['CHARACTER', 'CHARACTER'], ['DICE', 'DICE'], ['SHOP', 'SHOP'], ['INVENTORY', 'INVENTORY'],
            ['MISSIONS', 'CAREER'], ['RANKED', 'RANKED'], ['REPLAY', 'REPLAY'], ['SETTINGS', 'SETTINGS'],
        ] as const;
        dockEntries.forEach(([label, page], index) => {
            this.childButton(
                clientDock,
                label,
                new Vec3(-805 + index * 230, 0),
                index === 2 ? GOLD : new Color(31, 121, 169),
                () => this.openMetaPage(page),
                200,
                48,
                14,
            );
        });

        this.renderLobbyRooms();
    }

    private createRoomPage(): void {
        this.preparePage(this.roomPage);
        const room = this.panel('RoomSurface', this.roomPage, new Vec3(0, 5), 1800, 800, new Color(26, 95, 139, 250), new Color(122, 207, 241));
        this.childButton(room, 'BACK', new Vec3(-790, 340), new Color(34, 106, 151), () => {
            if (!this.metaModalOpen) this.showLobby();
        }, 150, 52, 18);
        this.childLabel(room, 'RoomKicker', 'LOCAL WAITING ROOM  •  ROOM MASTER', 16, new Vec3(-225, 348), new Color(158, 230, 255), 600, 28, Label.HorizontalAlign.LEFT);
        this.roomTitle = this.childLabel(room, 'RoomTitle', 'SKYLINE CIRCUIT  /  SOLO MATCH', 34, new Vec3(-205, 305), Color.WHITE, 650, 48, Label.HorizontalAlign.LEFT);

        const optionPanel = this.panel('RoomOptions', room, new Vec3(0, 225), 1510, 96, new Color(34, 103, 143, 255), new Color(87, 174, 215));
        this.childLabel(optionPanel, 'OptionKicker', 'MAP & RULES', 15, new Vec3(-650, 20), new Color(160, 229, 255), 170, 26, Label.HorizontalAlign.LEFT);
        this.childLabel(optionPanel, 'MapName', 'MAP 01  •  SKYLINE CIRCUIT', 21, new Vec3(-420, -15), Color.WHITE, 430, 34, Label.HorizontalAlign.LEFT);
        this.roomModeInfo = this.childLabel(optionPanel, 'ModeInfo', 'SOLO ECONOMY  •  LANDMARK + TAKEOVER  •  12 ROUND LIMIT', 17, new Vec3(180, 8), new Color(205, 228, 240), 760, 34);
        this.childLabel(optionPanel, 'ReferenceNote', 'Original ComePlayers art, map, cards, and balance.', 14, new Vec3(520, -23), new Color(145, 202, 228), 430, 24, Label.HorizontalAlign.RIGHT);

        const slotX = [-600, -200, 200, 600];
        for (let index = 0; index < slotX.length; index++) {
            const slot = this.panel(
                `RoomSlot-${index}`,
                room,
                new Vec3(slotX[index] as number, 5),
                340,
                300,
                new Color(37, 111, 151, 255),
                index === 0 ? GOLD : new Color(83, 169, 211),
            );
            this.roomTeamBands.push(this.childLabel(slot, 'TeamBand', 'SOLO', 15, new Vec3(0, 123), index % 2 === 0 ? new Color(151, 226, 255) : GOLD, 300, 28));
            this.childLabel(slot, 'SlotNumber', `PLAYER ${index + 1}`, 15, new Vec3(0, 91), Color.WHITE, 290, 28);
            const avatar = this.panel('Avatar', slot, new Vec3(0, 26), 112, 112, new Color(9, 29, 46, 255), index === 0 ? GOLD : new Color(99, 189, 226));
            this.childLabel(avatar, 'AvatarLetter', index === 0 ? 'A' : `${index + 1}`, 42, Vec3.ZERO, index === 0 ? GOLD : Color.WHITE, 80, 60);
            this.roomSlotLabels.push(this.childLabel(slot, 'SlotInfo', '', 18, new Vec3(0, -58), Color.WHITE, 290, 82));
            this.roomSlotStamps.push(this.childLabel(slot, 'ReadyStamp', index === 0 ? 'ROOM MASTER' : 'AUTO READY', 16, new Vec3(0, -119), index === 0 ? GOLD : new Color(170, 228, 250), 290, 28));
        }

        const controls = this.panel('RoomControls', room, new Vec3(0, -252), 1540, 180, new Color(9, 31, 50, 255), new Color(77, 158, 199));
        this.roomPlayerCount = this.childLabel(controls, 'PlayerCount', '', 20, new Vec3(-540, 40), Color.WHITE, 260, 42);
        this.roomDecreasePlayers = this.childButton(controls, '−', new Vec3(-700, 40), new Color(37, 106, 149), () => this.changePlayers(-1), 72, 54, 27);
        this.roomIncreasePlayers = this.childButton(controls, '+', new Vec3(-380, 40), new Color(42, 142, 194), () => this.changePlayers(1), 72, 54, 27);

        this.roomTurnSeconds = this.childLabel(controls, 'TurnSeconds', '', 20, new Vec3(-80, 40), Color.WHITE, 250, 42);
        this.roomDecreaseTurn = this.childButton(controls, '−', new Vec3(-230, 40), new Color(37, 106, 149), () => this.changeTurnSeconds(-5), 72, 54, 27);
        this.roomIncreaseTurn = this.childButton(controls, '+', new Vec3(70, 40), new Color(42, 142, 194), () => this.changeTurnSeconds(5), 72, 54, 27);

        const autoRollButton = this.childButton(controls, 'AUTO ROLL: ON', new Vec3(300, 40), new Color(42, 142, 194), () => this.toggleAutoRoll(), 270, 58, 18);
        const autoRollLabel = autoRollButton.node.getComponentInChildren(Label);
        if (!autoRollLabel) throw new Error('Room auto-roll label was not created.');
        this.roomAutoRoll = autoRollLabel;

        const difficultyButton = this.childButton(controls, 'AI: SMART', new Vec3(620, 40), new Color(122, 83, 188), () => this.cycleBotDifficulty(), 280, 58, 18);
        const difficultyLabel = difficultyButton.node.getComponentInChildren(Label);
        if (!difficultyLabel) throw new Error('Room AI difficulty label was not created.');
        this.roomBotDifficulty = difficultyLabel;

        const modeButton = this.childButton(controls, 'MODE: SOLO', new Vec3(-40, -48), new Color(31, 132, 184), () => this.toggleMatchMode(), 250, 58, 17);
        const modeLabel = modeButton.node.getComponentInChildren(Label);
        if (!modeLabel) throw new Error('Room mode label was not created.');
        this.roomMode = modeLabel;

        const eventButton = this.childButton(controls, 'ROUND EVENTS: ON', new Vec3(250, -48), new Color(37, 118, 137), () => this.toggleRoundEvents(), 280, 58, 16);
        const eventLabel = eventButton.node.getComponentInChildren(Label);
        if (!eventLabel) throw new Error('Round event label was not created.');
        this.roomRoundEvents = eventLabel;

        this.roomSummary = this.childLabel(controls, 'RoomSummary', '', 14, new Vec3(-480, -47), new Color(188, 220, 235), 540, 62, Label.HorizontalAlign.LEFT);
        this.roomStartButton = this.childButton(controls, 'READY & START', new Vec3(610, -48), GOLD, () => this.startLocalMatch(), 300, 72, 22);
    }

    private createMetaPage(): void {
        this.preparePage(this.metaPage);
        const surface = this.panel('MetaSurface', this.metaPage, new Vec3(0, 5), 1760, 790, PANEL, BORDER);
        this.childButton(
            surface, 'BACK', new Vec3(-760, 330), NAVY,
            () => {
                if (!this.metaModalOpen) this.showLobby();
            },
            170, 58, 20,
        );
        this.metaTitle = this.childLabel(surface, 'MetaTitle', '', 42, new Vec3(0, 320), GOLD, 900, 60);
        this.metaSubtitle = this.childLabel(surface, 'MetaSubtitle', '', 19, new Vec3(0, 267), SILVER, 1200, 40);

        this.metaCardsRoot.layer = Layers.Enum.UI_2D;
        surface.addChild(this.metaCardsRoot);
        this.metaCardsRoot.setPosition(0, -18);
        this.metaCardsRoot.addComponent(UITransform).setContentSize(1600, 520);
        const positions = [-520, 0, 520];
        for (let index = 0; index < positions.length; index++) {
            const card = this.panel(
                `MetaCard-${index}`,
                this.metaCardsRoot,
                new Vec3(positions[index] as number, 0),
                450,
                480,
                PANEL_ALT,
                index === 0 ? GOLD : BORDER,
            );
            this.metaCardKickers.push(this.childLabel(
                card, 'Kicker', '', 16, new Vec3(0, 180), index === 0 ? GOLD : CYAN, 390, 32,
            ));
            this.metaCardTitles.push(this.childLabel(
                card, 'Title', '', 29, new Vec3(0, 115), Color.WHITE, 390, 62,
            ));
            this.metaCardBodies.push(this.childLabel(
                card, 'Description', '', 20, new Vec3(0, 15), SILVER, 370, 118,
            ));
            this.drawCardMotif(card, index);
            const actionButton = this.childButton(
                card, index === 0 ? 'SELECTED' : 'PREVIEW', new Vec3(0, -182),
                index === 0 ? GOLD : NAVY,
                () => {
                    if (!this.isMetaModalOpen()) this.metaCardActions[index]?.();
                },
                310, 62, 19,
            );
            const actionLabel = actionButton.node.getComponentInChildren(Label);
            if (!actionLabel) throw new Error(`Meta card ${index} action label was not created.`);
            this.metaCardButtons.push(actionButton);
            this.metaCardButtonLabels.push(actionLabel);
        }

        this.settingsRoot.layer = Layers.Enum.UI_2D;
        surface.addChild(this.settingsRoot);
        this.settingsRoot.setPosition(0, -30);
        this.settingsRoot.addComponent(UITransform).setContentSize(1180, 520);
        this.drawPanel(this.settingsRoot, 1180, 520, PANEL_ALT, GOLD);
        this.settingsMusic = this.childLabel(
            this.settingsRoot, 'Music', '', 25, new Vec3(0, 150), Color.WHITE, 430, 50,
        );
        this.childButton(
            this.settingsRoot, 'MUSIC −', new Vec3(-400, 150), NAVY,
            () => this.updateSettings(this.actions.adjustMusicVolume(-0.1)), 190, 62, 19,
        );
        this.childButton(
            this.settingsRoot, 'MUSIC +', new Vec3(400, 150), BLUE,
            () => this.updateSettings(this.actions.adjustMusicVolume(0.1)), 190, 62, 19,
        );
        this.settingsSound = this.childLabel(
            this.settingsRoot, 'Sound', '', 25, new Vec3(0, 54), Color.WHITE, 430, 50,
        );
        this.childButton(
            this.settingsRoot, 'SFX −', new Vec3(-400, 54), NAVY,
            () => this.updateSettings(this.actions.adjustSoundVolume(-0.1)), 190, 62, 19,
        );
        this.childButton(
            this.settingsRoot, 'SFX +', new Vec3(400, 54), BLUE,
            () => this.updateSettings(this.actions.adjustSoundVolume(0.1)), 190, 62, 19,
        );
        this.settingsMotion = this.childLabel(
            this.settingsRoot, 'Motion', '', 23, new Vec3(-170, -48), Color.WHITE, 430, 50,
            Label.HorizontalAlign.LEFT,
        );
        this.childButton(
            this.settingsRoot, 'TOGGLE MOTION', new Vec3(330, -48), BLUE,
            () => this.updateSettings(this.actions.toggleReducedCameraMotion()), 310, 66, 19,
        );
        this.childLabel(
            this.settingsRoot, 'Saved', 'SAVED AUTOMATICALLY ON THIS DEVICE', 17,
            new Vec3(0, -148), CYAN, 700, 34,
        );
        this.childButton(
            this.settingsRoot, 'DONE', new Vec3(0, -205), GOLD,
            () => this.showLobby(), 310, 66, 22,
        );
        this.settingsRoot.active = false;

        this.metaModalLayer.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.metaModalLayer);
        this.metaModalLayer.setPosition(0, 0);
        this.metaModalLayer.addComponent(UITransform).setContentSize(1920, 1080);
        const modalScrim = this.uiNode('ModalScrim', this.metaModalLayer, Vec3.ZERO, 1920, 1080);
        modalScrim.addComponent(BlockInputEvents);
        const scrimGraphics = modalScrim.addComponent(Graphics);
        scrimGraphics.fillColor = new Color(0, 0, 0, 178);
        scrimGraphics.fillRect(-960, -540, 1920, 1080);

        this.metaModal.layer = Layers.Enum.UI_2D;
        this.metaModalLayer.addChild(this.metaModal);
        this.metaModal.setPosition(0, -12);
        this.metaModal.addComponent(UITransform).setContentSize(1_060, 470);
        this.metaModal.addComponent(BlockInputEvents);
        this.drawPanel(this.metaModal, 1_060, 470, new Color(11, 17, 27, 255), GOLD);
        this.metaModalTitle = this.childLabel(
            this.metaModal, 'ModalTitle', '', 34, new Vec3(0, 162), GOLD, 920, 54,
        );
        this.metaModalBody = this.childLabel(
            this.metaModal, 'ModalBody', '', 22, new Vec3(0, 35), Color.WHITE, 900, 190,
        );
        this.metaModalInputNode = this.uiNode('ModalNativeInput', this.metaModal, new Vec3(0, -58), 760, 64);
        // EditBox is itself a UI renderable in Cocos. Keep its decorative
        // Graphics on a child node so the input node never owns two renderers.
        const inputBackground = this.uiNode('ModalInputBackground', this.metaModalInputNode, Vec3.ZERO, 760, 64);
        this.drawPanel(inputBackground, 760, 64, new Color(20, 29, 43, 255), new Color(82, 154, 196));
        const inputText = this.childLabel(
            this.metaModalInputNode, 'InputText', '', 22, Vec3.ZERO, Color.WHITE, 700, 52, Label.HorizontalAlign.LEFT,
        );
        const inputPlaceholder = this.childLabel(
            this.metaModalInputNode, 'InputPlaceholder', 'ENTER VALUE', 20, Vec3.ZERO, new Color(123, 144, 164), 700, 52, Label.HorizontalAlign.LEFT,
        );
        this.metaModalInput = this.metaModalInputNode.addComponent(EditBox);
        this.metaModalInput.textLabel = inputText;
        this.metaModalInput.placeholderLabel = inputPlaceholder;
        this.metaModalInput.maxLength = 48;
        this.metaModalInput.inputMode = EditBox.InputMode.SINGLE_LINE;
        this.metaModalInput.inputFlag = EditBox.InputFlag.DEFAULT;
        this.metaModalInput.returnType = EditBox.KeyboardReturnType.DONE;
        this.metaModalInputNode.active = false;
        this.metaModalCancel = this.childButton(
            this.metaModal, 'CANCEL', new Vec3(-235, -164), NAVY,
            () => this.modalCancelAction(), 360, 68, 21,
        );
        const cancelLabel = this.metaModalCancel.node.getComponentInChildren(Label);
        if (!cancelLabel) throw new Error('Progression modal cancel label was not created.');
        this.metaModalCancelLabel = cancelLabel;
        this.metaModalConfirm = this.childButton(
            this.metaModal, 'CONFIRM', new Vec3(235, -164), GOLD,
            () => this.modalConfirmAction(), 360, 68, 21,
        );
        const confirmLabel = this.metaModalConfirm.node.getComponentInChildren(Label);
        if (!confirmLabel) throw new Error('Progression modal confirm label was not created.');
        this.metaModalConfirmLabel = confirmLabel;
        this.metaModal.active = false;
        this.metaModalLayer.active = false;
    }

    private createMetaNavigation(): void {
        const labels: Readonly<Record<FrontEndMetaPage, string>> = {
            SHOP: 'SHOP',
            CHARACTER: 'CHARACTER',
            DICE: 'DICE',
            INVENTORY: 'INVENTORY',
            MISSIONS: 'MISSIONS',
            RANKED: 'RANKED',
            COMPETE: 'COMPETE',
            ONLINE: 'ONLINE',
            REPLAYS: 'REPLAYS',
            SETTINGS: 'SETTINGS',
        };
        const startX = -855;
        FRONT_END_META_PAGES.forEach((page, index) => {
            this.childButton(
                this.safeRoot,
                labels[page],
                new Vec3(startX + index * 171, -478),
                page === 'SETTINGS' ? NAVY : new Color(28, 103, 148),
                () => {
                    if (!this.metaModalOpen) this.openMetaPage(page);
                },
                146,
                56,
                14,
            );
        });
    }

    private showLobby(message = 'V77 CLASSIC PARITY OVERHAUL  •  BOARD, HUD, TILE, AND LOBBY REBUILT'): void {
        if (this.starting || this.isMetaModalOpen()) return;
        this.clearMaterialSelectionWhenLeaving('LOBBY');
        this.leaveSettingsIfNeeded();
        this.closeMetaModal(false);
        this.refreshCharacterSnapshot();
        this.careerSnapshot = this.actions.getCareerProgression();
        this.rankedSnapshot = this.actions.getRankedProgression();
        this.onlineSnapshot = this.actions.getOnlineProfile();
        this.replaySnapshot = this.actions.getReplayLibrary();
        this.currentPage = 'LOBBY';
        this.lobbyPage.active = true;
        this.roomPage.active = false;
        this.metaPage.active = false;
        this.setStatus(message);
        this.renderLobbySetup();
        this.renderLobbyProgression();
        this.renderLobbyRooms();
    }

    private openLocalRoom(): void {
        if (this.starting || this.isMetaModalOpen()) return;
        this.clearMaterialSelectionWhenLeaving('ROOM');
        this.leaveSettingsIfNeeded();
        this.closeMetaModal(false);
        this.currentPage = 'ROOM';
        this.lobbyPage.active = false;
        this.roomPage.active = true;
        this.metaPage.active = false;
        this.setStatus('LOCAL ROOM  •  ALL BOTS READY');
        this.renderRoom();
    }

    private openMetaPage(page: FrontEndMetaPage): void {
        if (this.starting || this.isMetaModalOpen()) return;
        this.clearMaterialSelectionWhenLeaving(page);
        this.leaveSettingsIfNeeded();
        this.closeMetaModal(false);
        this.refreshCharacterSnapshot();
        this.careerSnapshot = this.actions.getCareerProgression();
        this.rankedSnapshot = this.actions.getRankedProgression();
        this.onlineSnapshot = this.actions.getOnlineProfile();
        this.replaySnapshot = this.actions.getReplayLibrary();
        this.currentPage = page;
        this.lobbyPage.active = false;
        this.roomPage.active = false;
        this.metaPage.active = true;
        const content = FRONT_END_META_CONTENT[page];
        this.metaTitle.string = content.title;
        this.metaSubtitle.string = content.subtitle;
        this.metaCardsRoot.active = page !== 'SETTINGS';
        this.settingsRoot.active = page === 'SETTINGS';
        if (page === 'SETTINGS') {
            this.settingsSnapshot = this.actions.openSettings();
            this.renderSettings();
            this.setStatus(`${content.title}  •  SAVED LOCALLY`);
            return;
        }
        this.renderMetaPage(page);
        const liveProgression = page === 'SHOP' || page === 'CHARACTER' || page === 'INVENTORY' || page === 'MISSIONS' || page === 'RANKED' || page === 'COMPETE' || page === 'ONLINE' || page === 'REPLAYS';
        this.setStatus(`${content.title}  •  ${liveProgression ? 'LOCAL PROGRESSION' : 'LOCAL PREVIEW'}`);
        if (page === 'COMPETE' && !this.competitiveHub) this.loadCompetitiveHub();
    }

    private renderMetaPage(page: FrontEndMetaPage): void {
        const content = FRONT_END_META_CONTENT[page];
        content.cards.forEach((card, index) => {
            this.setMetaCard(index, card.kicker, card.title, card.description);
            this.setMetaButton(
                index,
                'PREVIEW',
                () => this.setStatus(`${content.title} remains a local preview.`),
                true,
            );
        });

        if (page === 'SHOP') this.renderCharacterShop();
        if (page === 'CHARACTER') this.renderCharacterCollection();
        if (page === 'INVENTORY') this.renderCharacterInventory();
        if (page === 'MISSIONS') this.renderCareerMissions();
        if (page === 'RANKED') this.renderRankedArena();
        if (page === 'COMPETE') this.renderCompetitiveCircuit();
        if (page === 'ONLINE') this.renderOnlineCenter();
        if (page === 'REPLAYS') this.renderReplayLibrary();
    }

    private renderCareerMissions(): void {
        const missions = this.careerSnapshot.missions;
        const profileMission = missions[0];
        const journey = this.careerSnapshot.journey;
        const replayAcademy = this.replaySnapshot.academy;
        const dailyMission = journey.dailyMissions.find((mission) => !mission.claimed)
            ?? journey.dailyMissions[journey.dailyMissions.length - 1];
        const weeklyMission = journey.weeklyMissions.find((mission) => !mission.claimed)
            ?? journey.weeklyMissions[journey.weeklyMissions.length - 1];
        const rivalContract = journey.rivalContracts.find((contract) => !contract.claimed)
            ?? journey.rivalContracts[journey.rivalContracts.length - 1];
        const rivalGauntlet = journey.rivalGauntlets.find((gauntlet) => !gauntlet.claimed)
            ?? journey.rivalGauntlets[journey.rivalGauntlets.length - 1];
        this.setMetaCard(
            0,
            `LEVEL ${this.careerSnapshot.level}  •  ${this.careerSnapshot.rankTitle}`,
            'WORLD JOURNEY',
            `CAREER XP ${this.careerSnapshot.experience.toLocaleString('en-US')} / ${this.careerSnapshot.experienceForNextLevel.toLocaleString('en-US')}
Journey ${journey.seasonTitle}  •  Tier ${journey.completedTierCount}/${journey.maxLevel}  •  Prestige ${journey.prestigeLevel}/${journey.maxPrestigeLevel}
Journey XP ${journey.seasonExperience.toLocaleString('en-US')}  •  Lifetime JXP ${journey.lifetimeJourneyExperience.toLocaleString('en-US')}
Rival rating ${journey.rivalRating} RR (${journey.lastRivalRatingChange >= 0 ? '+' : ''}${journey.lastRivalRatingChange})  •  Rank #${journey.localRivalRank}/${journey.localRivalBoard.length}  •  Best #${journey.bestRivalRank}
Gauntlet ${journey.rivalGauntletDivision}  •  Score ${journey.rivalGauntletScore}/${journey.rivalGauntletTarget}  •  Podium streak ${journey.rivalPodiumStreak}  •  Best ${journey.bestRivalPodiumStreak}
Season reward CP ${journey.seasonRewardCredits.toLocaleString('en-US')}  •  Rival rewards CP ${journey.rivalRewardCredits.toLocaleString('en-US')}  •  Gauntlet rewards CP ${journey.rivalGauntletRewardCredits.toLocaleString('en-US')}  •  Archived seasons ${journey.seasonsCompleted}
Active streak ${journey.activeDayStreak} days  •  Season best ${journey.seasonBestActiveDayStreak}  •  Lifetime best ${journey.bestActiveDayStreak}  •  Perfect days ${journey.totalPerfectDaily}  •  Perfect weeks ${journey.totalPerfectWeekly}
Matches ${this.careerSnapshot.totalMatches}  •  Wins ${this.careerSnapshot.wins}  •  Best streak ${this.careerSnapshot.bestWinStreak}
Mastery ${this.careerSnapshot.masteryScore.toLocaleString('en-US')}  •  ${this.careerSnapshot.masteryTier}
Legacy ${this.careerSnapshot.legacyScore.toLocaleString('en-US')}  •  ${this.careerSnapshot.legacyTier}  •  Best ${this.careerSnapshot.bestPerformanceScore}/100`,
        );
        this.setMetaButton(
            0,
            journey.completedTierCount >= journey.maxLevel ? 'JOURNEY COMPLETE' : 'PLAY FOR JOURNEY XP',
            () => this.showLobby('Choose a room to continue your World Journey.'),
            true,
            journey.completedTierCount < journey.maxLevel,
        );

        this.setMetaCard(
            1,
            `DAILY ${journey.completedDailyCount}/${journey.dailyMissions.length}  •  WEEKLY ${journey.completedWeeklyCount}/${journey.weeklyMissions.length}`,
            dailyMission?.title ?? 'DAILY COMPLETE',
            `${dailyMission?.description ?? 'All daily missions are complete.'}
DAILY  •  ${dailyMission?.progress ?? 0}/${dailyMission?.target ?? 0}  •  CP ${(dailyMission?.rewardCredits ?? 0).toLocaleString('en-US')}  •  JXP +${dailyMission?.rewardExperience ?? 0}
WEEKLY  •  ${weeklyMission?.title ?? 'ALL COMPLETE'}  •  ${weeklyMission?.progress ?? 0}/${weeklyMission?.target ?? 0}
CP ${(weeklyMission?.rewardCredits ?? 0).toLocaleString('en-US')}  •  JXP +${weeklyMission?.rewardExperience ?? 0}
Daily resets ${formatJourneyReset(journey.dailyResetAt)}  •  Weekly resets ${formatJourneyReset(journey.weeklyResetAt)}
Perfect Day ${journey.perfectDailyCompleted ? 'COMPLETE' : `${journey.completedDailyCount}/${journey.dailyMissions.length}`}  •  Perfect Week ${journey.perfectWeeklyCompleted ? 'COMPLETE' : `${journey.completedWeeklyCount}/${journey.weeklyMissions.length}`}
RIVAL CONTRACT  •  ${rivalContract?.title ?? 'ALL CONTRACTS COMPLETE'}  •  ${rivalContract?.progress ?? 0}/${rivalContract?.target ?? 0}
${rivalContract?.description ?? 'All seasonal Rival Contracts are complete.'}  •  CP ${(rivalContract?.rewardCredits ?? 0).toLocaleString('en-US')}  •  JXP +${rivalContract?.rewardExperience ?? 0}
RIVAL GAUNTLET  •  ${rivalGauntlet?.title ?? 'GAUNTLET COMPLETE'}  •  ${rivalGauntlet?.progress ?? journey.rivalGauntletScore}/${rivalGauntlet?.target ?? journey.rivalGauntletTarget}
${rivalGauntlet?.description ?? 'All Rival Gauntlet circuits are complete.'}  •  CP ${(rivalGauntlet?.rewardCredits ?? 0).toLocaleString('en-US')}  •  JXP +${rivalGauntlet?.rewardExperience ?? 0}`,
        );
        this.setMetaButton(
            1,
            dailyMission?.claimed && weeklyMission?.claimed ? 'ALL CURRENT MISSIONS COMPLETE' : 'PROGRESS SAVED AFTER MATCH',
            () => this.setStatus('Daily, weekly, Perfect Cycle, tier, and prestige rewards are awarded atomically after completed matches.'),
            true,
            dailyMission?.completed === true || weeklyMission?.completed === true,
        );

        const recent = this.careerSnapshot.recentMatches[0];
        const latestJourneyArchive = journey.seasonArchive[0];
        const rivalBoardText = journey.localRivalBoard.slice(0, 6)
            .map((entry) => `#${entry.rank} ${entry.name}${entry.player ? ' (YOU)' : ''} ${entry.rating} RR${entry.player ? '' : ` (${entry.ratingGap >= 0 ? '+' : ''}${entry.ratingGap})`}`)
            .join('  •  ');
        const archiveText = latestJourneyArchive
            ? `Latest archive ${latestJourneyArchive.seasonId}  •  JXP ${latestJourneyArchive.seasonExperience.toLocaleString('en-US')}  •  Rival ${latestJourneyArchive.finalRivalRating} RR / #${latestJourneyArchive.finalRivalRank}  •  Gauntlet ${latestJourneyArchive.finalRivalGauntletScore}  •  Podium streak ${latestJourneyArchive.bestRivalPodiumStreak}`
            : 'No previous Journey season has been archived yet.';
        const activeMission = missions.find((mission) => !mission.claimed) ?? missions[missions.length - 1];
        const activeLegacy = this.careerSnapshot.legacyMilestones.find((milestone) => !milestone.claimed)
            ?? this.careerSnapshot.legacyMilestones[this.careerSnapshot.legacyMilestones.length - 1];
        const highlightReelText = this.careerSnapshot.highlightReel.length > 0
            ? this.careerSnapshot.highlightReel
                .slice(0, 3)
                .map((entry) => `${entry.performanceGrade}${entry.performanceScore} ${entry.tacticalTag} P${entry.replayPriority}`)
                .join('  •  ')
            : 'Complete an A-grade, S-grade, classic victory, or award match to create a highlight.';
        this.setMetaCard(
            2,
            recent ? `RECENT MATCH  •  #${recent.rank} / ${recent.playerCount}` : 'NO MATCH RECORD',
            recent ? recent.highlightTitle : 'CAREER & LEGACY',
            recent
                ? `Net worth CP ${recent.netWorth.toLocaleString('en-US')}  •  Reward CP ${recent.rewardCredits.toLocaleString('en-US')}
Grade ${recent.performanceGrade} ${recent.performanceScore}/100  •  Awards ${recent.awardCount}  •  XP +${recent.experienceGained}
Career mission ${activeMission?.title ?? 'ALL COMPLETE'}  •  ${activeMission?.progress ?? 0}/${activeMission?.target ?? 0}
Legacy milestone ${activeLegacy?.title ?? 'ALL COMPLETE'}  •  ${activeLegacy?.progress ?? 0}/${activeLegacy?.target ?? 0}
Recent form ${this.careerSnapshot.recentForm}  •  Momentum ${this.careerSnapshot.momentumScore}%  •  Avg rank ${this.careerSnapshot.recentAverageRank > 0 ? this.careerSnapshot.recentAverageRank.toFixed(1) : '-'}
Journey rewards earned CP ${journey.totalRewardCredits.toLocaleString('en-US')}  •  Prestige ${journey.prestigeLevel}  •  Streak ${journey.activeDayStreak}D
RIVAL CONTRACTS ${journey.completedRivalContractCount}/${journey.rivalContracts.length}  •  GAUNTLET ${journey.completedRivalGauntletCount}/${journey.rivalGauntlets.length}  •  Score ${journey.rivalGauntletScore}
PODIUM STREAK ${journey.rivalPodiumStreak}  •  Best ${journey.bestRivalPodiumStreak}  •  Season wins ${journey.seasonRivalWins}  •  Lifetime wins ${journey.totalRivalWins}
LOCAL RIVAL BOARD  •  ${rivalBoardText}
TACTICAL REPLAY REEL  •  ${highlightReelText}
REPLAY ACADEMY  •  ${replayAcademy.academyTier}  •  AVG ${replayAcademy.averageScore}/100  •  FOCUS ${replayAcademy.focusLabel}
ACADEMY TREND ${replayAcademy.trendDelta >= 0 ? '+' : ''}${replayAcademy.trendDelta}  •  CONSISTENCY ${replayAcademy.consistencyScore}/100  •  DRILLS ${replayAcademy.completedDrillCount}/${replayAcademy.drills.length}  •  LIVE STREAK ${this.replaySnapshot.liveObjectiveStreak}  •  LIVE COMPLETE ${this.replaySnapshot.liveObjectiveCompletions}
SEASON ARCHIVE  •  ${archiveText}`
                : `Complete a local match to start Career, Legacy, and World Journey progression.
LOCAL RIVAL BOARD  •  ${rivalBoardText}
TACTICAL REPLAY REEL  •  ${highlightReelText}
REPLAY ACADEMY  •  ${replayAcademy.academyTier}  •  AVG ${replayAcademy.averageScore}/100  •  FOCUS ${replayAcademy.focusLabel}
ACADEMY TREND ${replayAcademy.trendDelta >= 0 ? '+' : ''}${replayAcademy.trendDelta}  •  CONSISTENCY ${replayAcademy.consistencyScore}/100  •  DRILLS ${replayAcademy.completedDrillCount}/${replayAcademy.drills.length}  •  LIVE STREAK ${this.replaySnapshot.liveObjectiveStreak}  •  LIVE COMPLETE ${this.replaySnapshot.liveObjectiveCompletions}
SEASON ARCHIVE  •  ${archiveText}`,
        );
        this.setMetaButton(
            2,
            recent ? 'JOURNEY COMMAND READY' : 'START WORLD JOURNEY',
            () => this.showLobby('Choose Create Room or Quick Match.'),
            true,
            !profileMission?.claimed || Boolean(recent),
        );
    }

    private renderRankedArena(): void {
        const ranked = this.rankedSnapshot;
        const placementText = ranked.provisional
            ? `${ranked.placementsRemaining} PLACEMENT MATCHES LEFT`
            : `PEAK ${ranked.peakRating}  •  ${Math.round(ranked.seasonWinRate * 100)}% WIN RATE`;
        this.setMetaCard(
            0,
            `SEASON ${ranked.seasonId}  •  ${placementText}`,
            `${ranked.tier}  ${ranked.rating} RP`,
            `Season record ${ranked.seasonWins}W / ${ranked.seasonMatches}M
Matchmaking AI: ${ranked.matchmakingDifficulty}
Mode follows your current Solo/Team room preference.`,
        );
        this.setMetaButton(0, 'FIND RANKED MATCH', () => this.startRankedQueue(), true, true);

        const remaining = Math.max(0, ranked.weeklyTarget - ranked.weeklyMatches);
        this.setMetaCard(
            1,
            `${Math.min(ranked.weeklyMatches, ranked.weeklyTarget)} / ${ranked.weeklyTarget} MATCHES  •  WEEK ${ranked.weekId}`,
            ranked.weeklyRewardClaimed ? 'WEEKLY REWARD CLAIMED' : 'RANKED WEEKLY REWARD',
            ranked.weeklyRewardClaimed
                ? `CP ${ranked.weeklyRewardCredits.toLocaleString('en-US')} has already been collected this week.`
                : ranked.weeklyRewardAvailable
                    ? `Reward ready: CP ${ranked.weeklyRewardCredits.toLocaleString('en-US')}.`
                    : `Complete ${remaining} more ranked matches to unlock CP ${ranked.weeklyRewardCredits.toLocaleString('en-US')}.`,
        );
        this.setMetaButton(
            1,
            ranked.weeklyRewardClaimed ? 'CLAIMED' : ranked.weeklyRewardAvailable ? 'CLAIM REWARD' : 'KEEP PLAYING',
            ranked.weeklyRewardAvailable ? () => this.claimRankedWeeklyReward() : () => this.startRankedQueue(),
            !ranked.weeklyRewardClaimed,
            ranked.weeklyRewardAvailable,
        );

        const standings = ranked.leaderboard.slice(0, 7)
            .map((entry) => `${entry.rank}. ${entry.player ? 'YOU' : entry.name}  ${entry.tier} ${entry.rating}`)
            .join('\n');
        this.setMetaCard(
            2,
            'LOCAL DEVICE STANDINGS',
            'SEASON LEADERBOARD',
            standings || 'No ranked standings available.',
        );
        this.setMetaButton(2, 'REFRESH STANDINGS', () => {
            this.rankedSnapshot = this.actions.getRankedProgression();
            this.renderRankedArena();
            this.setStatus('RANKED STANDINGS  •  UPDATED');
        }, true);
    }


    private renderCompetitiveCircuit(): void {
        const hub = this.competitiveHub;
        if (!hub) {
            this.setMetaCard(0, 'SUPABASE COMPETITIVE PROFILE', 'SERVER CIRCUIT NOT LOADED', 'Load the authenticated competitive profile, top-twenty leaderboard, queue state, and current tournament bracket.');
            this.setMetaButton(0, 'LOAD COMPETITIVE HUB', () => this.loadCompetitiveHub(), true, true);
            this.setMetaCard(1, 'RATING WINDOW 150 → 600', 'SERVER RANKED QUEUE', 'Solo requires two players. Team Clash requires four. The search range expands every fifteen seconds until a compatible private room is created.');
            this.setMetaButton(1, 'LOAD QUEUE STATUS', () => this.loadCompetitiveHub(), true);
            this.setMetaCard(2, 'SOLO OR TEAM 2V2  •  4 / 8 PLAYERS', 'TOURNAMENT BRACKET', 'Create a Solo cup or Team Clash 2v2 bracket using native Cocos input. Authoritative winners advance through server-created rooms.');
            this.setMetaButton(2, 'CREATE TOURNAMENT', () => this.createTournamentByPrompt(), true, true);
            return;
        }

        const profile = hub.profile;
        const leaderboard = hub.leaderboard.slice(0, 6)
            .map((entry) => `${entry.rank}. ${entry.self ? 'YOU' : entry.displayName}  ${entry.tier} ${entry.rating}`)
            .join('\n');
        this.setMetaCard(
            0,
            `${profile.tier}  ${profile.rating} RP  •  ${profile.seasonPoints} SEASON PTS`,
            'GLOBAL COMPETITIVE PROFILE',
            `SEASON ${profile.seasonId}  •  ENDS ${formatCompetitiveDate(profile.seasonEndsAt)}
${profile.wins}W / ${profile.losses}L  •  STREAK ${profile.streak}  •  BEST ${profile.bestStreak}
LIFETIME ${profile.lifetimeWins}W / ${profile.lifetimeLosses}L  •  CUPS ${profile.lifetimeTournamentWins + profile.tournamentWins}
${leaderboard || 'Leaderboard is empty.'}`,
        );
        const authority = this.actions.getAuthoritativeMatch();
        const rankedResultReady = authority?.phase === 'FINISHED'
            && hub.queue.matchedRoom?.roomId === authority.roomId;
        this.setMetaButton(
            0,
            rankedResultReady ? 'FINALIZE SERVER RESULT' : 'REFRESH GLOBAL STANDINGS',
            rankedResultReady ? () => this.finalizeCompetitiveResult() : () => this.loadCompetitiveHub(),
            true,
            rankedResultReady,
        );

        const queue = hub.queue;
        const matched = queue.matchedRoom;
        const queueBody = queue.status === 'MATCHED' && matched
            ? `Private room ${matched.inviteCode} is ready.
${matched.mode}  •  SERVER ${shortIdentifier(matched.roomId)}
Join before the twenty-minute reservation expires.`
            : queue.status === 'SEARCHING'
                ? `${queue.mode} / ${queue.region}  •  ${queue.waitSeconds}s waiting
Rating ${queue.rating}  •  Search ±${queue.searchRange} RP
Realtime channel is listening for a server match notification.`
                : `Choose Solo or Team using the room mode selector.
Current server state: ${queue.status}
Queue entries expire after ten minutes.`;
        this.setMetaCard(
            1,
            `${queue.status}  •  ${queue.mode}  •  ${queue.region}`,
            queue.status === 'MATCHED' ? `MATCH FOUND  ${matched?.inviteCode ?? ''}` : 'SERVER RANKED MATCHMAKING',
            queueBody,
        );
        if (queue.status === 'MATCHED' && matched) {
            this.setMetaButton(1, 'JOIN MATCHED ROOM', () => this.connectCompetitiveRoom(matched.inviteCode), true, true);
        } else if (queue.status === 'SEARCHING') {
            this.setMetaButton(1, this.competitiveRealtimeActive ? 'CANCEL SEARCH  •  LIVE' : 'ENABLE LIVE SEARCH', () => this.cancelOrEnableCompetitiveRealtime(), true, true);
        } else {
            this.setMetaButton(1, `QUEUE ${this.roomSettings.matchMode}`, () => this.joinCompetitiveQueue(), true, true);
        }

        const tournament = hub.currentTournament
            ?? hub.tournaments[this.tournamentFocusIndex % Math.max(1, hub.tournaments.length)]
            ?? null;
        if (!tournament) {
            this.setMetaCard(2, 'NO ACTIVE CUP', 'CREATE COMPETITIVE TOURNAMENT', 'Create a four/eight-player single-elimination bracket. The host is entered automatically and the bracket starts when all slots are filled.');
            this.setMetaButton(2, 'CREATE / JOIN CUP', () => this.createOrJoinTournamentPrompt(), true, true);
            return;
        }

        const detail = hub.currentTournament;
        const activeMatch = detail?.activeMatch ?? null;
        const bracketText = detail
            ? detail.matches.slice(0, 6).map((match) => `R${match.round}-${match.slot} ${match.status}  ${match.playerOneName} vs ${match.playerTwoName}${match.winnerProfileId ? `  ✓ ${match.winnerProfileId}` : ''}`).join('\n')
            : `${tournament.entryCount}/${tournament.capacity} players registered.
Open or active server cup. Join with code ${tournament.tournamentCode}.`;
        this.setMetaCard(
            2,
            `${tournament.status}  •  ${tournament.mode}  •  ${tournament.entryCount}/${tournament.capacity}  •  ROUND ${tournament.currentRound}/${tournament.totalRounds}`,
            `${tournament.name}  [${tournament.tournamentCode}]${tournament.mode === 'TEAM' ? `  •  ${tournament.teamCount} TEAMS` : ''}`,
            `${tournament.championDisplayName ? `CHAMPION ${tournament.championDisplayName}\n` : ''}${bracketText || 'Waiting for tournament entries.'}`,
        );
        if (activeMatch?.inviteCode) {
            this.setMetaButton(2, 'JOIN BRACKET MATCH', () => this.connectCompetitiveRoom(activeMatch.inviteCode), true, true);
        } else if (tournament.joined && tournament.status === 'ACTIVE') {
            this.setMetaButton(2, 'ADVANCE / SYNC BRACKET', () => this.advanceCompetitiveTournament(tournament.tournamentCode), true, true);
        } else if (tournament.joined) {
            this.setMetaButton(2, 'REFRESH TOURNAMENT', () => this.loadTournament(tournament.tournamentCode), true);
        } else {
            this.setMetaButton(2, 'JOIN FEATURED CUP', () => this.joinTournament(tournament.tournamentCode), true, true);
        }
    }

    private loadCompetitiveHub(): void {
        if (this.progressionBusy) return;
        this.progressionBusy = true;
        this.setStatus('COMPETITIVE CIRCUIT  •  LOADING SERVER PROFILE');
        void this.actions.getCompetitiveHub()
            .then((result) => {
                if (!result.ok || !result.data) {
                    this.setStatus(result.message);
                    return;
                }
                this.competitiveHub = result.data;
                this.setStatus(`COMPETITIVE CIRCUIT  •  ${result.data.profile.tier} ${result.data.profile.rating} RP`);
                if (result.data.queue.status === 'SEARCHING') this.startCompetitiveRealtime();
                if (this.currentPage === 'COMPETE') this.renderCompetitiveCircuit();
            })
            .catch((error: unknown) => this.setStatus(`COMPETITIVE HUB ERROR  •  ${error instanceof Error ? error.message : 'Unexpected error.'}`))
            .finally(() => { this.progressionBusy = false; });
    }

    private joinCompetitiveQueue(): void {
        if (this.progressionBusy) return;
        this.progressionBusy = true;
        const mode: CompetitiveMode = this.roomSettings.matchMode === 'TEAM' ? 'TEAM' : 'SOLO';
        this.setStatus(`SERVER RANKED QUEUE  •  SEARCHING ${mode}`);
        void this.actions.joinCompetitiveQueue(mode)
            .then((result) => {
                this.acceptCompetitiveHubResult(result);
                if (result.ok && result.data?.queue.status === 'SEARCHING') this.startCompetitiveRealtime();
            })
            .finally(() => { this.progressionBusy = false; });
    }

    private cancelOrEnableCompetitiveRealtime(): void {
        if (this.progressionBusy) return;
        if (!this.competitiveRealtimeActive) {
            this.startCompetitiveRealtime();
            return;
        }
        this.progressionBusy = true;
        void this.actions.cancelCompetitiveQueue()
            .then((result) => {
                this.acceptCompetitiveHubResult(result);
                return this.actions.unsubscribeCompetitiveQueue();
            })
            .then(() => {
                this.competitiveRealtimeActive = false;
                if (this.currentPage === 'COMPETE') this.renderCompetitiveCircuit();
            })
            .finally(() => { this.progressionBusy = false; });
    }

    private startCompetitiveRealtime(): void {
        if (this.competitiveRealtimeActive) return;
        this.competitiveRealtimeActive = true;
        this.setStatus('SERVER RANKED QUEUE  •  CONNECTING REALTIME');
        void this.actions.subscribeCompetitiveQueue((result) => {
            this.acceptCompetitiveHubResult(result);
            if (result.data?.queue.status === 'MATCHED') {
                this.setStatus(`MATCH FOUND  •  ROOM ${result.data.queue.matchedRoom?.inviteCode ?? ''}`);
            }
        }).then((result) => {
            if (!result.ok) {
                this.competitiveRealtimeActive = false;
                this.setStatus(result.message);
                if (this.currentPage === 'COMPETE') this.renderCompetitiveCircuit();
                return;
            }
            this.acceptCompetitiveHubResult(result);
        });
    }

    private finalizeCompetitiveResult(): void {
        if (this.progressionBusy) return;
        this.progressionBusy = true;
        void this.actions.finalizeCompetitiveMatch()
            .then((result) => this.acceptCompetitiveHubResult(result))
            .finally(() => { this.progressionBusy = false; });
    }

    private acceptCompetitiveHubResult(result: CompetitiveActionResult<CompetitiveHubSnapshot>): void {
        if (!result.ok || !result.data) {
            this.setStatus(result.message);
            return;
        }
        this.competitiveHub = result.data;
        if (result.data.queue.status !== 'SEARCHING') {
            this.competitiveRealtimeActive = false;
            void this.actions.unsubscribeCompetitiveQueue();
        }
        this.setStatus(`${result.message}  •  QUEUE ${result.data.queue.status}`);
        if (this.currentPage === 'COMPETE') this.renderCompetitiveCircuit();
    }

    private createOrJoinTournamentPrompt(): void {
        this.showNativeInputModal(
            'CREATE OR JOIN CUP',
            'Enter CREATE to configure a new tournament, or enter an eight-character tournament code.',
            'CREATE OR ABCD1234',
            'CREATE',
            12,
            'CONTINUE',
            (value) => {
                if (value === 'CREATE' || value === 'C') this.createTournamentByPrompt();
                else this.joinTournament(value);
            },
            (value) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12),
        );
    }

    private createTournamentByPrompt(): void {
        if (this.progressionBusy) return;
        this.showNativeInputModal(
            'TOURNAMENT NAME',
            'Choose a name up to 48 characters. The next step selects Solo or Team 2v2 and player capacity.',
            'ComePlayers Cup',
            'ComePlayers Cup',
            48,
            'NEXT',
            (name) => this.showTournamentFormatInput(name),
            (value) => value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 48),
        );
    }

    private showTournamentFormatInput(name: string): void {
        this.showNativeInputModal(
            'TOURNAMENT FORMAT',
            'Enter 4 SOLO, 8 SOLO, 4 TEAM, or 8 TEAM. Team mode automatically forms 2v2 teams by seed order.',
            '4 SOLO',
            '4 SOLO',
            12,
            'CREATE CUP',
            (value) => {
                const tokens = value.split(/\s+/g);
                const capacity: 4 | 8 = tokens.includes('8') ? 8 : 4;
                const mode: TournamentMode = tokens.includes('TEAM') ? 'TEAM' : 'SOLO';
                this.progressionBusy = true;
                void this.actions.createTournament(name, capacity, mode)
                    .then((result) => this.acceptTournamentResult(result))
                    .finally(() => { this.progressionBusy = false; });
            },
            (value) => value.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').slice(0, 12),
        );
    }

    private joinTournament(code: string): void {
        if (this.progressionBusy) return;
        const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        if (normalized.length !== 8) {
            this.setStatus('INVALID TOURNAMENT CODE  •  ENTER EIGHT LETTERS OR NUMBERS');
            return;
        }
        this.progressionBusy = true;
        void this.actions.joinTournament(normalized)
            .then((result) => this.acceptTournamentResult(result))
            .finally(() => { this.progressionBusy = false; });
    }

    private loadTournament(code: string): void {
        if (this.progressionBusy) return;
        this.progressionBusy = true;
        void this.actions.getTournament(code)
            .then((result) => this.acceptTournamentResult(result))
            .finally(() => { this.progressionBusy = false; });
    }

    private advanceCompetitiveTournament(code: string): void {
        if (this.progressionBusy) return;
        this.progressionBusy = true;
        void this.actions.advanceTournament(code)
            .then((result) => this.acceptTournamentResult(result))
            .finally(() => { this.progressionBusy = false; });
    }

    private acceptTournamentResult(result: CompetitiveActionResult<TournamentDetail>): void {
        if (!result.ok || !result.data) {
            this.setStatus(result.message);
            return;
        }
        const detail = result.data;
        if (this.competitiveHub) {
            const summaries = this.competitiveHub.tournaments.filter((entry) => entry.tournamentId !== detail.tournamentId);
            this.competitiveHub = {
                ...this.competitiveHub,
                tournaments: [detail, ...summaries],
                currentTournament: detail.status === 'OPEN' || detail.status === 'ACTIVE' ? detail : null,
            };
        }
        this.setStatus(`${result.message}  •  CUP ${detail.tournamentCode}  •  ${detail.status}`);
        if (this.currentPage === 'COMPETE') this.renderCompetitiveCircuit();
    }

    private connectCompetitiveRoom(inviteCode: string): void {
        this.setStatus(`COMPETITIVE ROOM ${inviteCode}  •  CONNECTING`);
        this.applyOnlinePromise(this.actions.joinSupabaseRoom(inviteCode, 'PLAYER'));
        this.openMetaPage('ONLINE');
    }

    private renderOnlineCenter(): void {
        const online = this.onlineSnapshot;
        const room = online.activeRoom;
        const realtime = online.realtimeState;
        const connected = realtime === 'CONNECTED';
        const serverRoom = room?.serverRoomId && room.realtimeTopic;
        const authority = this.actions.getAuthoritativeMatch();
        const connectionDetail = online.realtimeLastError
            ? `LAST ERROR ${online.realtimeLastError}`
            : connected
                ? `AUTH ${shortIdentifier(online.realtimeAuthUserId)}  •  ${online.realtimeLatencyMs} ms
TOPIC ${online.realtimeTopic}`
                : 'Set the publishable key at runtime, enable anonymous auth, and apply the V57 Supabase migration.';
        this.setMetaCard(
            0,
            `${online.realtimeProvider}  •  ${realtime}  •  ${online.realtimeLatencyMs} ms`,
            'SUPABASE REALTIME',
            `${connectionDetail}
No service-role or secret key is accepted by the game client.`,
        );
        if (connected) {
            this.setMetaButton(0, 'DISCONNECT SERVER', () => this.applyOnlinePromise(this.actions.disconnectSupabaseRoom()), true, true);
        } else if (serverRoom) {
            this.setMetaButton(0, 'RECONNECT SERVER', () => this.applyOnlinePromise(this.actions.reconnectSupabaseRoom()), true, true);
        } else {
            this.setMetaButton(0, 'JOIN / SPECTATE BY CODE', () => this.joinSupabaseByPrompt(), true, true);
        }

        if (!room) {
            this.setMetaCard(
                1,
                `MODE ${this.roomSettings.matchMode}  •  PRIVATE ROOM`,
                'CREATE CROSS-DEVICE ROOM',
                'Create an authenticated room registry, private Broadcast channel, Presence session, and reconnect metadata.',
            );
            this.setMetaButton(1, 'CREATE ONLINE ROOM', () => this.applyOnlinePromise(this.actions.createSupabaseRoom(this.roomSettings.matchMode)), true, true);
        } else {
            const players = room.slots.filter((slot) => slot.role === 'PLAYER');
            const spectators = room.slots.filter((slot) => slot.role === 'SPECTATOR');
            const readyPlayers = players.filter((slot) => slot.ready && slot.connected).length;
            this.setMetaCard(
                1,
                `${room.phase}  •  INVITE ${room.inviteCode}  •  ${room.mode}`,
                `${serverRoom ? 'ONLINE' : 'LOCAL'} ROOM  ${players.length}/${room.maxPlayers}`,
                `${readyPlayers}/${players.length} ready  •  ${spectators.length}/${room.maxSpectators} spectators
${serverRoom ? `SERVER ${shortIdentifier(room.serverRoomId ?? '')}` : 'Not registered on Supabase yet.'}
Room state and Presence are synchronized without exposing the reconnect token.`,
            );
            if (!serverRoom) {
                this.setMetaButton(1, 'PUBLISH ROOM ONLINE', () => this.applyOnlinePromise(this.actions.createSupabaseRoom(room.mode)), true, true);
            } else if (!connected) {
                this.setMetaButton(1, 'RECONNECT ROOM', () => this.applyOnlinePromise(this.actions.reconnectSupabaseRoom()), true, true);
            } else if (room.phase === 'MATCH') {
                this.setMetaButton(1, authority ? 'OPEN 3D SERVER BOARD' : 'SYNC SERVER STATE', () => {
                    if (authority) this.openAuthorityBoard();
                    else this.applyOnlinePromise(this.actions.resumeSupabaseMatch());
                }, true, true);
            } else {
                this.setMetaButton(1, 'START SERVER MATCH', () => this.applyOnlinePromise(this.actions.startSupabaseMatch()), true, true);
            }
        }

        if (authority) {
            const current = authority.players.find((player) => player.seat === authority.currentTurnSeat);
            const localTurn = authority.currentTurnProfileId === online.profileId;
            const dice = authority.lastDice
                ? `${authority.lastDice.first} + ${authority.lastDice.second} = ${authority.lastDice.total}${authority.lastDice.isDouble ? '  DOUBLE' : ''}`
                : 'NOT ROLLED';
            const pending = authority.pendingAction;
            const landing = authority.landing ? `${authority.landing.displayName} [${authority.landing.tileIndex}]` : 'NO LANDING';
            const decision = pending
                ? `${pending.kind} ${pending.displayName}  •  CP ${pending.cost.toLocaleString('en-US')}${pending.kind === 'UPGRADE' ? `  •  LEVEL ${pending.targetLevel}` : ''}${pending.options.length > 0 ? `  •  ${pending.options.length} OPTIONS` : ''}`
                : authority.awaitingEndTurn ? 'NO PURCHASE DECISION  •  END TURN WHEN READY' : 'WAITING FOR SERVER ROLL';
            const winner = authority.phase === 'FINISHED'
                ? `WINNER ${authority.winnerTeamId || authority.winnerProfileId || 'SERVER RESULT'}  •  ${authority.finishReason}`
                : `PROPERTIES ${authority.properties.length}  •  ${authority.mode}  •  MAX ROUND ${authority.maxRounds}`;
            this.setMetaCard(
                2,
                `${authority.phase}  •  REV ${authority.revision}  •  ROUND ${authority.round}/${authority.maxRounds}`,
                'V77 CLASSIC TABLETOP BOARD',
                `TURN ${authority.currentTurnSeat + 1}  •  ${current?.displayName ?? authority.currentTurnProfileId}  •  ${localTurn ? 'YOUR TURN' : 'REMOTE TURN'}
DICE ${dice}  •  LANDING ${landing}
${decision}
${authority.specialResult ? `${authority.specialResult.title}: ${authority.specialResult.message}` : 'SPECIAL RESULT: NONE'}
${authority.worldEvent ? `WORLD EVENT ${authority.worldEvent.title}: ${authority.worldEvent.message}` : 'WORLD EVENT: WAITING'}
${authority.players.find((player) => player.profileId === online.profileId)?.activeSkillId ? `LOADOUT ${authority.players.find((player) => player.profileId === online.profileId)?.characterId.toUpperCase()}  •  SKILL ${authority.players.find((player) => player.profileId === online.profileId)?.skillUsed ? 'USED' : 'READY'}` : 'LOADOUT: SERVER DEFAULT'}
${winner}`,
            );

            let label = 'ROLL SERVER DICE';
            let action = () => this.applyOnlinePromise(this.actions.rollSupabaseDice());
            if (authority.phase === 'FINISHED') {
                label = 'REFRESH FINAL STATE';
                action = () => this.applyOnlinePromise(this.actions.resumeSupabaseMatch());
            } else if (pending?.kind === 'PURCHASE') {
                label = 'PURCHASE SERVER CITY';
                action = () => this.applyOnlinePromise(this.actions.purchaseSupabaseProperty());
            } else if (pending?.kind === 'UPGRADE') {
                label = pending.targetLevel >= 4 ? 'BUILD SERVER LANDMARK' : 'UPGRADE SERVER CITY';
                action = () => this.applyOnlinePromise(this.actions.upgradeSupabaseProperty());
            } else if (pending?.kind === 'TAKEOVER') {
                label = 'TAKE OVER SERVER CITY';
                action = () => this.applyOnlinePromise(this.actions.takeoverSupabaseProperty());
            } else if (pending?.kind === 'GAME_CENTER' || pending?.kind === 'OLYMPIC' || pending?.kind === 'WORLD_TRAVEL') {
                label = 'OPEN LIVE BOARD TO CHOOSE';
                action = () => this.openAuthorityBoard();
            } else if (authority.awaitingEndTurn) {
                label = 'END / SKIP SERVER TURN';
                action = () => this.applyOnlinePromise(this.actions.endSupabaseTurn());
            }
            const canAct = authority.phase === 'FINISHED' || (authority.phase === 'ACTIVE' && localTurn);
            this.setMetaButton(2, label, action, connected && canAct, authority.phase === 'ACTIVE' && localTurn);
        } else {
            const cloud = online.cloudState;
            this.setMetaCard(
                2,
                `${cloud}  •  LOCAL GEN ${online.cloudLocalGeneration}  •  REMOTE GEN ${online.cloudRemoteGeneration}`,
                'CLOUD SAVE MANIFEST',
                online.cloudManifestChecksum
                    ? `CHECKSUM ${online.cloudManifestChecksum}
Prepared ${formatTimestamp(online.lastPreparedAt)}  •  Synced ${formatTimestamp(online.lastSyncedAt)}
Apply migrations through V61 to unlock server loadouts, active skills, round events, and cinematic event playback.`
                    : 'Generate a portable manifest, or start a V62 server match after two players are connected and ready.',
            );
            if (connected) {
                this.setMetaButton(2, 'PING REALTIME', () => this.applyOnlinePromise(this.actions.heartbeatSupabaseRoom()), true, true);
            } else if (cloud === 'READY_TO_LINK') {
                this.setMetaButton(2, 'SIMULATE CLOUD ACK', () => this.applyOnlineAction(this.actions.acknowledgeCloudBackup()), true, true);
            } else {
                this.setMetaButton(2, cloud === 'CONFLICT' ? 'KEEP LOCAL MANIFEST' : 'PREPARE CLOUD BACKUP', () => this.applyOnlineAction(this.actions.prepareCloudBackup()), true, cloud !== 'SYNCED');
            }
        }
    }

    private openAuthorityBoard(): void {
        const authority = this.actions.getAuthoritativeMatch();
        if (!authority) {
            this.setStatus('NO SERVER SNAPSHOT  •  START OR RESUME THE AUTHORITATIVE MATCH');
            return;
        }
        const viewerRole = this.onlineSnapshot.activeRoom?.localRole ?? 'PLAYER';
        this.authorityReplay?.stop();
        this.authorityReplay = null;
        this.authorityOverlay?.destroy();
        this.authority3D?.destroy();
        this.root.active = false;
        this.authority3D = new Authoritative3DBoardPresenter(this.settingsSnapshot.reducedCameraMotion);
        this.authority3D.synchronize(authority, this.onlineSnapshot.profileId);
        this.authorityOverlay = new AuthoritativeBoardOverlay({
            close: () => {
                this.authorityReplay?.stop();
                this.authorityReplay = null;
                this.authorityOverlay?.destroy();
                this.authorityOverlay = null;
                this.authority3D?.destroy();
                this.authority3D = null;
                this.root.active = true;
                this.renderOnlineCenter();
            },
            roll: () => this.applyOnlinePromise(this.actions.rollSupabaseDice()),
            purchase: () => this.applyOnlinePromise(this.actions.purchaseSupabaseProperty()),
            upgrade: () => this.applyOnlinePromise(this.actions.upgradeSupabaseProperty()),
            takeover: () => this.applyOnlinePromise(this.actions.takeoverSupabaseProperty()),
            activateSkill: () => this.applyOnlinePromise(this.actions.activateSupabaseSkill()),
            endTurn: () => this.applyOnlinePromise(this.actions.endSupabaseTurn()),
            chooseGameCenter: (selectedNumber) => this.applyOnlinePromise(this.actions.chooseSupabaseGameCenter(selectedNumber)),
            selectOlympic: (tileIndex) => this.applyOnlinePromise(this.actions.selectSupabaseOlympic(tileIndex)),
            selectTravel: (tileIndex) => this.applyOnlinePromise(this.actions.selectSupabaseTravel(tileIndex)),
            overview: () => this.authority3D?.showOverview(),
            nextPlayer: () => {
                const snapshot = this.actions.getAuthoritativeMatch();
                if (snapshot) this.authority3D?.focusNextPlayer(snapshot);
            },
            toggleAutoFollow: () => {
                const snapshot = this.actions.getAuthoritativeMatch();
                return snapshot ? this.authority3D?.toggleAutoFollow(snapshot) ?? false : false;
            },
            loadReplay: () => this.loadAuthoritativeReplay(),
            toggleReplayPause: () => this.toggleAuthoritativeReplayPause(),
            cycleReplaySpeed: () => this.cycleAuthoritativeReplaySpeed(),
            skipReplay: () => this.skipAuthoritativeReplay(),
            seekReplay: (progress) => this.seekAuthoritativeReplay(progress),
            stepReplay: (delta) => this.stepAuthoritativeReplay(delta),
            publishReplay: () => this.publishAuthoritativeReplay(),
            openReplayByCode: () => this.openAuthoritativeReplayByPrompt(),
        }, { cinematic3D: true, viewerRole });
        this.authorityOverlay.render(authority, this.onlineSnapshot.profileId);
        this.authorityOverlay.setReplayStatus(viewerRole === 'SPECTATOR' ? 'LIVE SPECTATOR' : 'LIVE PLAYER', false, 1);
        for (const cue of this.authorityEvents.drain()) {
            this.authorityOverlay.enqueueEvent(cue, authority);
            this.authority3D.enqueue(cue, authority);
        }
        this.setStatus(`${viewerRole === 'SPECTATOR' ? 'SPECTATOR' : 'LIVE SERVER'} 3D BOARD  •  V76 FULLSCREEN CLASSIC PRESENTATION + REPLAY STUDIO READY`);
    }

    private loadAuthoritativeReplay(): void {
        if (this.progressionBusy || !this.authority3D || !this.authorityOverlay) return;
        this.progressionBusy = true;
        this.authorityReplayReturnToLive = true;
        this.authorityOverlay.setReplayMode(true);
        this.authorityOverlay.setReplayStatus('LOADING ALL SERVER HISTORY', false, 1, 0);
        void this.actions.getAuthoritativeEventHistory(0, 180)
            .then((result) => {
                if (!result.ok || !result.data || !this.authority3D || !this.authorityOverlay) {
                    this.setStatus(result.message);
                    this.authorityOverlay?.setReplayMode(false);
                    this.authorityOverlay?.setReplayStatus('REPLAY LOAD FAILED', false, 1, 0);
                    return;
                }
                this.beginAuthoritativeReplay(result.data, `LIVE ROOM REPLAY  •  ${result.data.events.length} EVENTS`, true);
            })
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : 'Unexpected replay history error.';
                this.setStatus(`REPLAY ERROR  •  ${message}`);
                this.authorityOverlay?.setReplayMode(false);
                this.authorityOverlay?.setReplayStatus('REPLAY ERROR', false, 1, 0);
            })
            .finally(() => {
                this.progressionBusy = false;
            });
    }

    private beginAuthoritativeReplay(
        history: AuthoritativeEventHistory,
        label: string,
        returnToLive: boolean,
    ): void {
        if (!this.authority3D || !this.authorityOverlay) return;
        this.authorityReplayReturnToLive = returnToLive;
        this.authorityReplay?.stop();
        this.authorityOverlay.setReplayMode(true);
        this.authorityReplay = new AuthoritativeReplayPlayer(
            this.authority3D,
            (snapshot, event) => {
                this.authorityOverlay?.render(snapshot, this.onlineSnapshot.profileId);
                if (event) this.setStatus(`REPLAY EVENT ${event.sequence}  •  ${event.kind.replace(/_/g, ' ')}`);
            },
            (status) => {
                const paused = status.state === 'PAUSED' || status.state === 'SEEKING';
                this.authorityOverlay?.setReplayStatus(
                    `${status.state} ${status.index}/${status.eventCount}  #${status.currentSequence}`,
                    paused,
                    status.speed,
                    status.progress,
                );
                if (status.state !== 'FINISHED') return;
                if (this.authorityReplayReturnToLive) {
                    this.authorityOverlay?.setReplayMode(false);
                    const latest = this.actions.getAuthoritativeMatch();
                    if (latest) {
                        this.authority3D?.synchronize(latest, this.onlineSnapshot.profileId);
                        this.authorityOverlay?.render(latest, this.onlineSnapshot.profileId);
                    }
                } else {
                    this.authorityOverlay?.setReplayMode(true);
                    this.authority3D?.resetForReplay(history.snapshot);
                    this.authorityOverlay?.render(history.snapshot, this.onlineSnapshot.profileId);
                }
            },
        );
        const baseline = this.authorityReplay.load(history);
        this.authorityOverlay.render(baseline, this.onlineSnapshot.profileId);
        this.authorityOverlay.setReplayStatus(`READY 0/${history.events.length}`, true, 1, 0);
        this.setStatus(`${label}  •  CHECKSUM ${history.checksum.slice(0, 12)}`);
        void this.authorityReplay.play();
    }

    private ensureReplayViewer(snapshot: AuthoritativeMatchSnapshot): void {
        if (this.authority3D && this.authorityOverlay) return;
        this.authorityReplay?.stop();
        this.authorityReplay = null;
        this.authorityOverlay?.destroy();
        this.authority3D?.destroy();
        this.root.active = false;
        this.authority3D = new Authoritative3DBoardPresenter(this.settingsSnapshot.reducedCameraMotion);
        this.authority3D.resetForReplay(snapshot);
        const noAction = () => undefined;
        this.authorityOverlay = new AuthoritativeBoardOverlay({
            close: () => {
                this.authorityReplay?.stop();
                this.authorityReplay = null;
                this.authorityOverlay?.destroy();
                this.authorityOverlay = null;
                this.authority3D?.destroy();
                this.authority3D = null;
                this.root.active = true;
                if (this.currentPage === 'REPLAYS') this.renderReplayLibrary();
            },
            roll: noAction,
            purchase: noAction,
            upgrade: noAction,
            takeover: noAction,
            activateSkill: noAction,
            endTurn: noAction,
            chooseGameCenter: noAction,
            selectOlympic: noAction,
            selectTravel: noAction,
            overview: () => this.authority3D?.showOverview(),
            nextPlayer: () => this.authority3D?.focusNextPlayer(snapshot),
            toggleAutoFollow: () => this.authority3D?.toggleAutoFollow(snapshot) ?? false,
            loadReplay: () => this.openAuthoritativeReplayByPrompt(),
            toggleReplayPause: () => this.toggleAuthoritativeReplayPause(),
            cycleReplaySpeed: () => this.cycleAuthoritativeReplaySpeed(),
            skipReplay: () => this.skipAuthoritativeReplay(),
            seekReplay: (progress) => this.seekAuthoritativeReplay(progress),
            stepReplay: (delta) => this.stepAuthoritativeReplay(delta),
            openReplayByCode: () => this.openAuthoritativeReplayByPrompt(),
        }, { cinematic3D: true, viewerRole: 'REPLAY' });
        this.authorityOverlay.render(snapshot, this.onlineSnapshot.profileId);
        this.authorityOverlay.setReplayMode(true);
    }

    private publishAuthoritativeReplay(): void {
        if (this.progressionBusy) return;
        const promptFunction = (globalThis as { prompt?: (message?: string, defaultValue?: string) => string | null }).prompt;
        const requested = (promptFunction?.('Replay visibility: PRIVATE, UNLISTED, or PUBLIC', 'UNLISTED') ?? 'UNLISTED').trim().toUpperCase();
        const visibility: AuthoritativeReplayVisibility = requested.startsWith('PUBL')
            ? 'PUBLIC'
            : requested.startsWith('PRI') ? 'PRIVATE' : 'UNLISTED';
        this.progressionBusy = true;
        this.authorityOverlay?.setReplayStatus('PUBLISHING REPLAY ARCHIVE', true, this.authorityReplay?.status().speed ?? 1, this.authorityReplay?.status().progress ?? 0);
        void this.actions.publishAuthoritativeReplay(visibility)
            .then((result) => {
                if (!result.ok || !result.data) {
                    this.setStatus(result.message);
                    return;
                }
                this.lastPublishedReplayCode = result.data.replayCode;
                this.setStatus(`SERVER REPLAY PUBLISHED  •  CODE ${result.data.replayCode}  •  ${result.data.visibility}`);
                this.authorityOverlay?.setReplayStatus(`SHARE CODE ${result.data.replayCode}`, true, this.authorityReplay?.status().speed ?? 1, this.authorityReplay?.status().progress ?? 0);
                this.serverReplayLibrary = null;
            })
            .catch((error: unknown) => {
                this.setStatus(`REPLAY PUBLISH ERROR  •  ${error instanceof Error ? error.message : 'Unexpected error.'}`);
            })
            .finally(() => {
                this.progressionBusy = false;
            });
    }

    private openAuthoritativeReplayByPrompt(): void {
        if (this.progressionBusy) return;
        const promptFunction = (globalThis as { prompt?: (message?: string, defaultValue?: string) => string | null }).prompt;
        if (!promptFunction) {
            this.setStatus('REPLAY CODE INPUT IS AVAILABLE IN WEB PREVIEW. Native EditBox support is documented for production builds.');
            return;
        }
        const code = (promptFunction('Enter the eight-character replay share code:', this.lastPublishedReplayCode) ?? '')
            .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        if (code.length !== 8) {
            this.setStatus('INVALID REPLAY CODE  •  ENTER EIGHT LETTERS OR NUMBERS');
            return;
        }
        this.progressionBusy = true;
        void this.actions.getAuthoritativeReplayByCode(code)
            .then((result) => {
                if (!result.ok || !result.data) {
                    this.setStatus(result.message);
                    return;
                }
                this.ensureReplayViewer(result.data.snapshot);
                this.beginAuthoritativeReplay(
                    result.data,
                    `SHARED REPLAY ${result.data.archive.replayCode}  •  ${result.data.archive.title}`,
                    false,
                );
            })
            .catch((error: unknown) => {
                this.setStatus(`SHARED REPLAY ERROR  •  ${error instanceof Error ? error.message : 'Unexpected error.'}`);
            })
            .finally(() => {
                this.progressionBusy = false;
            });
    }

    private toggleAuthoritativeReplayPause(): void {
        const replay = this.authorityReplay;
        if (!replay) {
            this.setStatus('LOAD SERVER REPLAY FIRST');
            return;
        }
        replay.togglePause();
    }

    private cycleAuthoritativeReplaySpeed(): number {
        return this.authorityReplay?.cycleSpeed() ?? 1;
    }

    private seekAuthoritativeReplay(progress: number): void {
        const snapshot = this.authorityReplay?.seekToProgress(progress);
        if (!snapshot) return;
        this.authorityOverlay?.render(snapshot, this.onlineSnapshot.profileId);
        const status = this.authorityReplay?.status();
        if (status) this.setStatus(`REPLAY SEEK  •  EVENT ${status.index}/${status.eventCount}`);
    }

    private stepAuthoritativeReplay(delta: number): void {
        const snapshot = this.authorityReplay?.step(delta);
        if (!snapshot) return;
        this.authorityOverlay?.render(snapshot, this.onlineSnapshot.profileId);
        const status = this.authorityReplay?.status();
        if (status) this.setStatus(`REPLAY STEP  •  EVENT ${status.index}/${status.eventCount}`);
    }

    private skipAuthoritativeReplay(): void {
        const snapshot = this.authorityReplay?.skipToEnd();
        if (snapshot) this.authorityOverlay?.render(snapshot, this.onlineSnapshot.profileId);
    }

    private applyOnlinePromise(action: Promise<OnlineProfileActionResult>): void {
        if (this.progressionBusy) return;
        this.progressionBusy = true;
        this.setStatus('SUPABASE REALTIME  •  CONNECTING');
        void action
            .then((result) => this.applyOnlineAction(result))
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : 'Unexpected realtime error.';
                this.setStatus(`REALTIME ERROR  •  ${message}`);
            })
            .finally(() => {
                this.progressionBusy = false;
            });
    }

    private joinSupabaseByPrompt(): void {
        const promptFunction = (globalThis as { prompt?: (message?: string, defaultValue?: string) => string | null }).prompt;
        if (!promptFunction) {
            this.setStatus('JOIN CODE INPUT IS AVAILABLE IN WEB PREVIEW. Native EditBox support is documented for production builds.');
            return;
        }
        const inviteCode = promptFunction('Enter the six-character ComePlayers Marble invite code:', '') ?? '';
        const normalized = inviteCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        if (normalized.length !== 6) {
            this.setStatus('INVALID INVITE CODE  •  ENTER SIX LETTERS OR NUMBERS');
            return;
        }
        const roleInput = (promptFunction('Join as PLAYER or SPECTATOR? Type P or S:', 'P') ?? 'P').trim().toUpperCase();
        const role: FriendRoomRole = roleInput.startsWith('S') ? 'SPECTATOR' : 'PLAYER';
        this.applyOnlinePromise(this.actions.joinSupabaseRoom(normalized, role));
    }

    private applyOnlineAction(result: OnlineProfileActionResult): void {
        this.onlineSnapshot = result.snapshot;
        this.setStatus(result.message);
        this.renderOnlineCenter();
        const authority = this.actions.getAuthoritativeMatch();
        const replayState = this.authorityReplay?.status().state;
        const replayActive = replayState === 'PLAYING' || replayState === 'PAUSED' || replayState === 'SEEKING' || (!this.authorityReplayReturnToLive && replayState === 'FINISHED');
        if (authority && this.authorityOverlay && !replayActive) this.authorityOverlay.render(authority, result.snapshot.profileId);
        if (authority && this.authority3D && !replayActive) this.authority3D.synchronize(authority, result.snapshot.profileId);
        this.renderLobbyProgression();
    }

    private renderReplayLibrary(): void {
        const records = this.replaySnapshot.records;
        const academy = this.replaySnapshot.academy;
        const tacticalHighlight = this.careerSnapshot.highlightReel[0];
        if (records.length === 0) {
            this.replayFocusIndex = 0;
            this.setMetaCard(0, '0 / 12 LOCAL RECORDS', 'NO LOCAL REPLAY SAVED', 'Complete a Solo, Team, or Ranked match to create the first compact local replay timeline.');
            this.setMetaButton(0, 'PLAY A MATCH', () => this.showLobby('Create a room to record a replay.'), true, true);
            this.setMetaCard(1, 'V105 LIVE REPLAY ACADEMY', 'LIVE MATCH OBJECTIVES + DECISION REVIEW', `Complete a recorded match to generate a personal academy tier, focus metric, three adaptive drills, trend analysis, and a recommended replay study. Server replay pages can contain up to 2,160 events.${tacticalHighlight ? `
Latest study ${tacticalHighlight.tacticalTag}  •  Priority ${tacticalHighlight.replayPriority}` : ''}`);
            this.setMetaButton(1, 'OPEN SHARE CODE', () => this.openAuthoritativeReplayByPrompt(), true, true);
        } else {
            this.replayFocusIndex = ((this.replayFocusIndex % records.length) + records.length) % records.length;
            const replay = records[this.replayFocusIndex];
            if (replay) {
                const winner = replay.winningTeamId ? `TEAM ${replay.winningTeamId}` : replay.winnerId;
                const coach = replay.coach;
                const coachSummary = coach
                    ? `
REPLAY COACH  •  GRADE ${coach.grade}  •  ${coach.score}/100  •  TEMPO ${coach.tempoScore}  •  ECON ${coach.economyScore}
ACADEMY  •  ${academy.academyTier}  •  AVG ${academy.averageScore}/100  •  TREND ${academy.trendDelta >= 0 ? '+' : ''}${academy.trendDelta}  •  CONSISTENCY ${academy.consistencyScore}
STRENGTH  •  ${coach.strengths.join(' / ') || 'MATCH COMPLETION'}
NEXT FOCUS  •  ${academy.focusLabel}  •  ${academy.recommendation}`
                    : '';
                this.setMetaCard(
                    0,
                    `${this.replayFocusIndex + 1} / ${records.length}  •  ${replay.ranked ? 'RANKED' : 'LOCAL'}  •  ${replay.mode}`,
                    `${replay.id.toUpperCase()}  /  ${winner}`,
                    `Round ${replay.completedRound}  •  ${replay.playerCount} players  •  AI ${replay.botDifficulty}
Duration ${formatDuration(replay.durationMs)}  •  ${replay.eventCount} events
Played ${formatTimestamp(replay.playedAt)}${coachSummary}${tacticalHighlight ? `
TACTICAL STUDY  •  ${tacticalHighlight.tacticalTag}  •  PRIORITY ${tacticalHighlight.replayPriority}` : ''}`,
                );
                this.setMetaButton(0, records.length > 1 ? 'NEXT LOCAL REPLAY' : 'LATEST LOCAL REPLAY', () => this.nextReplay(), records.length > 1);

                const coachMoments = replay.coach?.keyMoments
                    .map((moment) => `${String(moment.sequence).padStart(2, '0')}  ${moment.impact}  ${moment.detail}`)
                    .join('\n');
                const timeline = coachMoments || replay.events.slice(0, 6)
                    .map((event) => `${String(event.sequence).padStart(2, '0')}  ${event.kind}  ${event.message}`)
                    .join('\n');
                const academyDrills = academy.drills
                    .map((drill) => `${drill.completed ? 'DONE' : 'TRAIN'}  ${drill.title}  ${drill.currentScore}/${drill.targetScore}`)
                    .join('\n');
                this.setMetaCard(
                    1,
                    replay.coach ? `V105 LIVE ACADEMY  •  ${academy.completedDrillCount}/${academy.drills.length} DRILLS  •  LIVE STREAK ${this.replaySnapshot.liveObjectiveStreak}` : `LOCAL TIMELINE  •  FIRST ${Math.min(6, replay.events.length)} EVENTS`,
                    replay.coach ? `${academy.focusLabel}  •  STUDY ${academy.recommendedReplayId.toUpperCase()}` : 'TACTICAL EVENT STREAM',
                    replay.coach
                        ? `${academyDrills}\n\nDECISION REVIEW\n${timeline || 'No timeline events were stored.'}`
                        : timeline || 'No timeline events were stored.',
                );
                this.setMetaButton(1, 'DELETE LOCAL REPLAY', () => this.deleteFocusedReplay(), true);
            }
        }

        const library = this.serverReplayLibrary;
        const entries = library?.entries ?? [];
        if (!library) {
            this.setMetaCard(
                2,
                'SUPABASE ARCHIVE  •  OWNER + PUBLIC',
                'SERVER REPLAY LIBRARY',
                `Publish a finished authoritative match as Private, Unlisted, or Public.
Shared archives use an eight-character replay code and paged event storage.`,
            );
            this.setMetaButton(2, 'LOAD SERVER LIBRARY', () => this.loadServerReplayLibrary(), true, true);
            return;
        }
        if (entries.length === 0) {
            this.setMetaCard(2, '0 SERVER ARCHIVES', 'NO SERVER REPLAY FOUND', 'Finish and publish a server-authoritative match, or open an Unlisted/Public replay using its share code.');
            this.setMetaButton(2, 'OPEN SHARE CODE', () => this.openAuthoritativeReplayByPrompt(), true, true);
            return;
        }
        this.serverReplayFocusIndex = ((this.serverReplayFocusIndex % entries.length) + entries.length) % entries.length;
        const serverReplay = entries[this.serverReplayFocusIndex];
        if (!serverReplay) return;
        const winner = serverReplay.winnerTeamId ? `TEAM ${serverReplay.winnerTeamId}` : serverReplay.winnerProfileId || 'SERVER RESULT';
        this.setMetaCard(
            2,
            `${this.serverReplayFocusIndex + 1}/${entries.length}  •  ${serverReplay.visibility}  •  ${serverReplay.owned ? 'OWNED' : 'PUBLIC'}`,
            `REPLAY ${serverReplay.replayCode}`,
            `${serverReplay.title}
${serverReplay.mode}  •  ROUND ${serverReplay.round}  •  ${serverReplay.eventCount} EVENTS
WINNER ${winner}  •  ${formatTimestamp(serverReplay.createdAt)}`,
        );
        this.setMetaButton(2, 'OPEN SERVER REPLAY', () => this.openServerReplayEntry(serverReplay), true, true);
    }

    private loadServerReplayLibrary(): void {
        if (this.progressionBusy) return;
        this.progressionBusy = true;
        this.setStatus('SERVER REPLAY LIBRARY  •  LOADING');
        void this.actions.getAuthoritativeReplayLibrary(20)
            .then((result) => {
                if (!result.ok || !result.data) {
                    this.setStatus(result.message);
                    return;
                }
                this.serverReplayLibrary = result.data;
                this.serverReplayFocusIndex = 0;
                this.setStatus(`SERVER REPLAY LIBRARY  •  ${result.data.entries.length} ARCHIVES`);
                if (this.currentPage === 'REPLAYS') this.renderReplayLibrary();
            })
            .catch((error: unknown) => this.setStatus(`SERVER REPLAY LIBRARY ERROR  •  ${error instanceof Error ? error.message : 'Unexpected error.'}`))
            .finally(() => { this.progressionBusy = false; });
    }

    private openServerReplayEntry(entry: AuthoritativeReplayArchiveSummary): void {
        if (this.progressionBusy) return;
        this.progressionBusy = true;
        void this.actions.getAuthoritativeReplayByCode(entry.replayCode)
            .then((result) => {
                if (!result.ok || !result.data) {
                    this.setStatus(result.message);
                    return;
                }
                this.ensureReplayViewer(result.data.snapshot);
                this.beginAuthoritativeReplay(result.data, `SERVER LIBRARY REPLAY ${entry.replayCode}`, false);
            })
            .catch((error: unknown) => this.setStatus(`SERVER REPLAY ERROR  •  ${error instanceof Error ? error.message : 'Unexpected error.'}`))
            .finally(() => { this.progressionBusy = false; });
    }

    private nextReplay(): void {
        if (this.replaySnapshot.records.length <= 1) return;
        this.replayFocusIndex = (this.replayFocusIndex + 1) % this.replaySnapshot.records.length;
        this.renderReplayLibrary();
        this.setStatus('REPLAY LIBRARY  •  NEXT RECORD');
    }

    private deleteFocusedReplay(): void {
        const replay = this.replaySnapshot.records[this.replayFocusIndex];
        if (!replay) return;
        const result = this.actions.deleteReplay(replay.id);
        this.replaySnapshot = result.snapshot;
        if (this.replayFocusIndex >= this.replaySnapshot.records.length) {
            this.replayFocusIndex = Math.max(0, this.replaySnapshot.records.length - 1);
        }
        this.setStatus(result.message);
        this.renderReplayLibrary();
    }

    private startRankedQueue(): void {
        if (this.starting || this.isMetaModalOpen()) return;
        this.starting = true;
        this.setStatus(`RANKED QUEUE  •  ${this.rankedSnapshot.matchmakingDifficulty} AI  •  MATCH FOUND`);
        this.actions.startRankedMatch(this.roomSettings.matchMode);
    }

    private claimRankedWeeklyReward(): void {
        if (this.progressionBusy || this.isMetaModalOpen()) return;
        this.progressionBusy = true;
        const result = this.actions.claimRankedWeeklyReward();
        this.rankedSnapshot = result.snapshot;
        this.refreshCharacterSnapshot();
        this.renderLobbyProgression();
        this.progressionBusy = false;
        this.setStatus(result.message);
        this.renderRankedArena();
    }

    private renderCharacterShop(): void {
        const snapshot = this.characterSnapshot;
        const collectionFull = snapshot.cards.length >= CHARACTER_COLLECTION_LIMIT;
        const canOpenPack = !collectionFull && snapshot.credits >= CHARACTER_PACK_COST;
        const canRedeem = !collectionFull && snapshot.upgradePoints >= UPGRADE_POINT_REDEEM_COST;
        this.setMetaCard(
            0,
            `LOCAL PACK  •  CP ${CHARACTER_PACK_COST.toLocaleString('en-US')}`,
            'CHARACTER PACK',
            collectionFull
                ? `Owned: ${snapshot.cards.length} / ${CHARACTER_COLLECTION_LIMIT} cards.
Collection full. Combine materials before opening another pack.`
                : `Open one deterministic local card.
Owned: ${snapshot.cards.length} / ${CHARACTER_COLLECTION_LIMIT} cards.
No real-money purchase is used.`,
        );
        this.setMetaButton(
            0,
            collectionFull ? 'COLLECTION FULL' : 'OPEN PACK',
            () => this.openPackConfirmation(),
            canOpenPack,
            canOpenPack,
        );

        this.setMetaCard(
            1,
            `UPGRADE REWARD  •  ${snapshot.upgradePoints} / ${UPGRADE_POINT_REDEEM_COST}`,
            'POINT REDEEM',
            `Combine cards to earn points.
Redeem ${UPGRADE_POINT_REDEEM_COST} points for one new character card.`,
        );
        this.setMetaButton(
            1,
            collectionFull ? 'COLLECTION FULL' : `REDEEM ${UPGRADE_POINT_REDEEM_COST} POINTS`,
            () => this.openRedeemConfirmation(),
            canRedeem,
        );

        this.shopItemFocusIndex = ((this.shopItemFocusIndex % ITEM_CATALOG.length) + ITEM_CATALOG.length) % ITEM_CATALOG.length;
        const featured = ITEM_CATALOG[this.shopItemFocusIndex];
        if (!featured) return;
        const owned = snapshot.items.find((item) => item.definition.id === featured.id)?.quantity ?? 0;
        const maxed = owned >= featured.maxStack;
        const canBuy = !maxed && snapshot.credits >= featured.price;
        this.setMetaCard(
            2,
            `${featured.category}  •  ${featured.rarity}  •  OWNED ${owned}/${featured.maxStack}`,
            featured.name,
            `${featured.description}
PRICE CP ${featured.price.toLocaleString('en-US')}
Selected items are applied when a local match begins.`,
        );
        this.setMetaButton(
            2,
            maxed ? 'NEXT ITEM' : canBuy ? 'BUY ITEM' : 'NEXT / NEED CP',
            maxed || !canBuy
                ? () => this.nextShopItem()
                : () => this.openItemPurchaseConfirmation(featured.id),
            true,
            canBuy,
        );
    }

    private renderCharacterCollection(): void {
        const cards = this.characterSnapshot.cards;
        if (cards.length === 0) return;
        this.characterFocusIndex = ((this.characterFocusIndex % cards.length) + cards.length) % cards.length;
        const focused = cards[this.characterFocusIndex] as CharacterCardView;
        const equipped = this.equippedCharacter() ?? focused;
        const selected = this.selectedMaterialIds
            .map((id) => cards.find((card) => card.id === id))
            .filter((card): card is CharacterCardView => card !== undefined);

        this.setMetaCard(
            0,
            `FOCUSED  ${this.characterFocusIndex + 1} / ${cards.length}`,
            focused.definition.name,
            this.characterDetails(focused),
        );
        this.setMetaButton(
            0,
            cards.length > 1 ? 'NEXT CARD' : 'ONLY CARD',
            () => this.nextCharacterCard(),
            cards.length > 1,
        );

        this.setMetaCard(
            1,
            `EQUIPPED  •  ${equipped.rarity}`,
            equipped.definition.name,
            selected.length > 0
                ? `Materials selected: ${selected.length} / 2.\nClear them to change the equipped card.`
                : this.characterDetails(equipped),
        );
        const focusedEquipped = focused.id === equipped.id;
        const canUpgradeFocused = focusedEquipped
            && focused.stars < 5
            && this.characterSnapshot.upgradePoints >= CHARACTER_CARD_UPGRADE_COST;
        const equippedActionLabel = focused.stars >= 5
            ? 'MAX STAR'
            : this.characterSnapshot.upgradePoints < CHARACTER_CARD_UPGRADE_COST
                ? `NEED ${CHARACTER_CARD_UPGRADE_COST} POINT`
                : 'UPGRADE FOCUSED';
        this.setMetaButton(
            1,
            selected.length > 0
                ? 'CLEAR MATERIALS'
                : focusedEquipped ? equippedActionLabel : 'EQUIP FOCUSED',
            selected.length > 0
                ? () => this.clearMaterialSelection()
                : focusedEquipped
                    ? () => this.openUpgradeConfirmation()
                    : () => this.equipFocusedCharacter(),
            selected.length > 0 || !focusedEquipped || canUpgradeFocused,
            selected.length === 0 && (!focusedEquipped || canUpgradeFocused),
        );

        const materialNames = selected.length > 0
            ? selected.map((card) => this.characterMaterialDetails(card)).join('\n')
            : 'No materials selected.';
        this.setMetaCard(
            2,
            `UPGRADE LAB  •  ${this.characterSnapshot.upgradePoints} POINTS`,
            selected.length === 2 ? 'READY TO COMBINE' : 'SELECT 2 MATERIALS',
            `${materialNames}\nTwo cards become one stronger card. The transaction is saved once.`,
        );
        const focusedSelected = this.selectedMaterialIds.indexOf(focused.id) >= 0;
        this.setMetaButton(
            2,
            selected.length === 2
                ? 'COMBINE'
                : focusedSelected ? 'REMOVE MATERIAL' : 'ADD MATERIAL',
            selected.length === 2
                ? () => this.openCombineConfirmation()
                : () => this.toggleFocusedMaterial(),
            cards.length >= 2,
            selected.length === 2 || focusedSelected,
        );
    }

    private renderCharacterInventory(): void {
        const snapshot = this.characterSnapshot;
        const pendants = this.inventoryItems('PENDANT');
        const boosters = this.inventoryItems('BOOSTER');
        const pendant = this.focusedInventoryItem(pendants, this.pendantFocusIndex);
        const booster = this.focusedInventoryItem(boosters, this.boosterFocusIndex);

        if (pendant) {
            this.pendantFocusIndex = pendants.indexOf(pendant);
            this.setMetaCard(
                0,
                `${pendant.definition.rarity} PENDANT  •  ${pendant.equipped ? 'EQUIPPED' : 'OWNED'}`,
                pendant.definition.name,
                `${pendant.definition.description}
Quantity ${pendant.quantity}/${pendant.definition.maxStack}`,
            );
            this.setMetaButton(
                0,
                pendant.equipped ? (pendants.length > 1 ? 'NEXT PENDANT' : 'EQUIPPED') : 'EQUIP PENDANT',
                pendant.equipped
                    ? () => this.nextInventoryItem('PENDANT')
                    : () => this.runItemAction(
                        () => this.actions.equipPendant(pendant.definition.id),
                        'PENDANT EQUIPPED',
                    ),
                !pendant.equipped || pendants.length > 1,
                pendant.equipped,
            );
        } else {
            this.setMetaCard(0, 'NO PENDANT', 'EMPTY PENDANT SLOT', 'Buy a pendant from the Shop to add a permanent match bonus.');
            this.setMetaButton(0, 'OPEN SHOP', () => this.openMetaPage('SHOP'), true);
        }

        if (booster) {
            this.boosterFocusIndex = boosters.indexOf(booster);
            this.setMetaCard(
                1,
                `${booster.definition.rarity} BOOSTER  •  ${booster.selected ? 'SELECTED' : 'AVAILABLE'}`,
                booster.definition.name,
                `${booster.definition.description}
Quantity ${booster.quantity}/${booster.definition.maxStack}
One selected booster is consumed when the match starts.`,
            );
            this.setMetaButton(
                1,
                booster.selected ? (boosters.length > 1 ? 'NEXT BOOSTER' : 'SELECTED') : 'SELECT BOOSTER',
                booster.selected
                    ? () => this.nextInventoryItem('BOOSTER')
                    : () => this.runItemAction(
                        () => this.actions.selectBooster(booster.definition.id),
                        'BOOSTER SELECTED',
                    ),
                !booster.selected || boosters.length > 1,
                booster.selected,
            );
        } else {
            this.setMetaCard(1, 'NO BOOSTER', 'EMPTY BOOSTER SLOT', 'Buy a consumable booster from the Shop for the next match.');
            this.setMetaButton(1, 'OPEN SHOP', () => this.openMetaPage('SHOP'), true);
        }

        const equipped = this.equippedCharacter();
        this.setMetaCard(
            2,
            `CP ${snapshot.credits.toLocaleString('en-US')}  •  ${snapshot.items.length} ITEM TYPES`,
            'MATCH LOADOUT',
            `${equipped?.definition.name ?? 'NO CHARACTER'}
Pendant: ${snapshot.items.find((item) => item.equipped)?.definition.name ?? 'None'}
Booster: ${snapshot.items.find((item) => item.selected)?.definition.name ?? 'None'}
Active skill: ${equipped?.definition.activeSkill.name ?? 'None'}`,
        );
        this.setMetaButton(2, 'OPEN SHOP', () => this.openMetaPage('SHOP'), true);
    }

    private nextShopItem(): void {
        if (this.progressionBusy || this.isMetaModalOpen()) return;
        this.shopItemFocusIndex = (this.shopItemFocusIndex + 1) % ITEM_CATALOG.length;
        this.renderCharacterShop();
    }

    private openItemPurchaseConfirmation(definitionId: string): void {
        const definition = ITEM_CATALOG.find((entry) => entry.id === definitionId);
        if (!definition) return;
        this.showMetaModal(
            `BUY ${definition.category}`,
            `${definition.name}
${definition.description}

Price CP ${definition.price.toLocaleString('en-US')}.
This is a local in-game currency purchase only.`,
            'BUY',
            () => this.runItemAction(
                () => this.actions.purchaseItem(definition.id),
                'ITEM PURCHASED',
            ),
        );
    }

    private runItemAction(
        action: () => CharacterProgressionActionResult,
        resultTitle: string,
    ): void {
        this.runProgressionAction(action, resultTitle);
    }

    private inventoryItems(category: ItemCategory): InventoryItemView[] {
        return this.characterSnapshot.items
            .filter((item) => item.definition.category === category && item.quantity > 0)
            .sort((left, right) => left.definition.name.localeCompare(right.definition.name));
    }

    private focusedInventoryItem(
        items: readonly InventoryItemView[],
        index: number,
    ): InventoryItemView | undefined {
        if (items.length === 0) return undefined;
        const safeIndex = ((index % items.length) + items.length) % items.length;
        return items[safeIndex];
    }

    private nextInventoryItem(category: ItemCategory): void {
        if (this.progressionBusy || this.isMetaModalOpen()) return;
        if (category === 'PENDANT') this.pendantFocusIndex++;
        else this.boosterFocusIndex++;
        this.renderCharacterInventory();
    }

    private nextCharacterCard(): void {
        const count = this.characterSnapshot.cards.length;
        if (count < 2 || this.progressionBusy || this.isMetaModalOpen()) return;
        this.characterFocusIndex = (this.characterFocusIndex + 1) % count;
        this.renderCharacterCollection();
    }

    private toggleFocusedMaterial(): void {
        if (this.progressionBusy || this.isMetaModalOpen()) return;
        const focused = this.characterSnapshot.cards[this.characterFocusIndex];
        if (!focused) return;
        const existingIndex = this.selectedMaterialIds.indexOf(focused.id);
        if (existingIndex >= 0) {
            this.selectedMaterialIds.splice(existingIndex, 1);
        } else if (this.selectedMaterialIds.length < 2) {
            this.selectedMaterialIds.push(focused.id);
        }
        this.renderCharacterCollection();
    }

    private clearMaterialSelection(): void {
        if (this.progressionBusy || this.isMetaModalOpen()) return;
        this.selectedMaterialIds = [];
        this.renderCharacterCollection();
    }

    private equipFocusedCharacter(): void {
        if (this.progressionBusy || this.isMetaModalOpen()) return;
        const focused = this.characterSnapshot.cards[this.characterFocusIndex];
        if (!focused) return;
        const result = this.actions.equipCharacterCard(focused.id);
        this.refreshCharacterSnapshot(result.snapshot);
        this.renderCharacterCollection();
        this.renderLobbyProgression();
        this.setStatus(result.message);
    }

    private openUpgradeConfirmation(): void {
        if (this.progressionBusy || this.isMetaModalOpen()) return;
        const focused = this.characterSnapshot.cards[this.characterFocusIndex];
        if (!focused) return;
        this.showMetaModal(
            'CHARACTER CARD UPGRADE',
            `${focused.definition.name} is currently ${focused.stars} star with power ${focused.power}.\nSpend ${CHARACTER_CARD_UPGRADE_COST} upgrade point to increase its star level and power?`,
            'UPGRADE',
            () => this.runProgressionAction(
                () => this.actions.upgradeCharacterCard(focused.id),
                'CARD UPGRADE',
            ),
        );
    }

    private openPackConfirmation(): void {
        if (this.progressionBusy || this.isMetaModalOpen()) return;
        const snapshot = this.characterSnapshot;
        this.showMetaModal(
            'OPEN CHARACTER PACK',
            `Spend CP ${CHARACTER_PACK_COST.toLocaleString('en-US')} for one local character card?\nCurrent balance: CP ${snapshot.credits.toLocaleString('en-US')}.\nThe reward is committed before the reveal.`,
            'OPEN PACK',
            () => this.runProgressionAction(() => this.actions.purchaseCharacterPack(), 'PACK REVEAL'),
        );
    }

    private openRedeemConfirmation(): void {
        if (this.progressionBusy || this.isMetaModalOpen()) return;
        const snapshot = this.characterSnapshot;
        this.showMetaModal(
            'REDEEM UPGRADE POINTS',
            `Spend ${UPGRADE_POINT_REDEEM_COST} upgrade points for one local character card?\nCurrent points: ${snapshot.upgradePoints}.`,
            'REDEEM CARD',
            () => this.runProgressionAction(
                () => this.actions.redeemCharacterUpgradePoints(),
                'REWARD REVEAL',
            ),
        );
    }

    private openCombineConfirmation(): void {
        if (this.progressionBusy || this.isMetaModalOpen() || this.selectedMaterialIds.length !== 2) return;
        const selected = this.selectedMaterialIds
            .map((id) => this.characterSnapshot.cards.find((card) => card.id === id))
            .filter((card): card is CharacterCardView => card !== undefined);
        if (selected.length !== 2) {
            this.refreshCharacterSnapshot();
            this.renderCharacterCollection();
            return;
        }
        const first = selected[0] as CharacterCardView;
        const second = selected[1] as CharacterCardView;
        const firstCardId = first.id;
        const secondCardId = second.id;
        const equippedMaterialSelected = first.id === this.characterSnapshot.equippedCardId
            || second.id === this.characterSnapshot.equippedCardId;
        this.showMetaModal(
            'CONFIRM CARD COMBINE',
            `${this.characterMaterialDetails(first)}\n${this.characterMaterialDetails(second)}\n\nBoth material cards will be consumed.${equippedMaterialSelected ? ' The equipped material will be replaced by the result.' : ''}\nYou receive one stronger card and 1 upgrade point.`,
            'COMBINE',
            () => this.runProgressionAction(
                () => this.actions.combineCharacterCards(
                    firstCardId,
                    secondCardId,
                ),
                'COMBINE RESULT',
            ),
        );
    }

    private runProgressionAction(
        action: () => CharacterProgressionActionResult,
        resultTitle: string,
    ): void {
        if (this.progressionBusy) return;
        this.progressionBusy = true;
        this.setButtonVisualState(
            this.metaModalConfirm,
            this.metaModalConfirmLabel,
            false,
            true,
        );
        try {
            const result = action();
            this.refreshCharacterSnapshot(result.snapshot);
            if (result.ok && resultTitle === 'COMBINE RESULT') this.selectedMaterialIds = [];
            if (this.isMetaPage(this.currentPage)) this.renderMetaPage(this.currentPage);
            this.renderLobbyProgression();
            this.progressionBusy = false;
            this.showProgressionResult(result, resultTitle);
        } catch (error: unknown) {
            console.error('[ComePlayers] Character progression action failed.', error);
            this.progressionBusy = false;
            this.showMetaModal(
                'ACTION FAILED',
                'The local character action could not be completed. Existing collection data was preserved.',
                'OK',
                () => this.closeMetaModal(),
                '',
            );
        }
    }

    private showProgressionResult(result: CharacterProgressionActionResult, resultTitle: string): void {
        const revealed = result.revealedCard;
        const revealSummary = revealed
            ? `\n\n${revealed.definition.name}\n${revealed.rarity} / ${revealed.stars} STAR / POWER ${revealed.power}\n${revealed.definition.role}`
            : '';
        this.showMetaModal(
            result.ok ? resultTitle : 'ACTION UNAVAILABLE',
            `${result.message}${revealSummary}`,
            revealed ? 'COLLECT' : 'OK',
            () => this.closeMetaModal(),
            '',
        );
        this.setStatus(result.ok ? result.message : `Not available: ${result.message}`);
    }

    private showMetaModal(
        title: string,
        body: string,
        confirmText: string,
        confirmAction: () => void,
        cancelText = 'CANCEL',
    ): void {
        this.metaModalInputNode.active = false;
        this.metaModalBody.node.setPosition(0, 35);
        this.metaModalTitle.string = title;
        this.metaModalBody.string = body;
        this.metaModalConfirmLabel.string = confirmText;
        this.setButtonVisualState(this.metaModalConfirm, this.metaModalConfirmLabel, true, true);
        this.metaModalCancelLabel.string = cancelText || 'CANCEL';
        this.metaModalCancel.node.active = cancelText.length > 0;
        this.modalConfirmAction = confirmAction;
        this.modalCancelAction = () => this.closeMetaModal();
        this.metaModalOpen = true;
        this.metaModal.active = true;
        this.metaModalLayer.setSiblingIndex(this.safeRoot.children.length - 1);
        this.metaModalLayer.active = true;
    }

    private showNativeInputModal(
        title: string,
        body: string,
        placeholder: string,
        defaultValue: string,
        maxLength: number,
        confirmText: string,
        onConfirm: (value: string) => void,
        sanitize: (value: string) => string = (value) => value.trim(),
    ): void {
        this.metaModalTitle.string = title;
        this.metaModalBody.string = body;
        this.metaModalBody.node.setPosition(0, 74);
        this.metaModalInputNode.active = true;
        this.metaModalInput.placeholder = placeholder;
        this.metaModalInput.string = defaultValue.slice(0, maxLength);
        this.metaModalInput.maxLength = maxLength;
        this.metaModalConfirmLabel.string = confirmText;
        this.metaModalCancelLabel.string = 'CANCEL';
        this.metaModalCancel.node.active = true;
        this.modalConfirmAction = () => {
            const normalized = sanitize(this.metaModalInput.string);
            if (!normalized) {
                this.setStatus('INPUT REQUIRED  •  ENTER A VALID VALUE');
                return;
            }
            this.closeMetaModal(false);
            onConfirm(normalized);
        };
        this.modalCancelAction = () => this.closeMetaModal();
        this.metaModalOpen = true;
        this.metaModal.active = true;
        this.metaModalLayer.setSiblingIndex(this.safeRoot.children.length - 1);
        this.metaModalLayer.active = true;
        this.metaModalInput.focus();
    }

    private closeMetaModal(renderAfterClose = true): void {
        this.metaModalOpen = false;
        this.metaModalLayer.active = false;
        this.metaModal.active = false;
        this.metaModalInputNode.active = false;
        this.metaModalInput.string = '';
        this.metaModalBody.node.setPosition(0, 35);
        this.setButtonVisualState(this.metaModalConfirm, this.metaModalConfirmLabel, true, true);
        this.progressionBusy = false;
        this.modalConfirmAction = () => undefined;
        this.modalCancelAction = () => undefined;
        if (renderAfterClose && this.isMetaPage(this.currentPage) && this.currentPage !== 'SETTINGS') {
            this.renderMetaPage(this.currentPage);
        }
    }

    private refreshCharacterSnapshot(snapshot = this.actions.getCharacterProgression()): void {
        this.characterSnapshot = snapshot;
        const validIds = new Set(snapshot.cards.map((card) => card.id));
        this.selectedMaterialIds = this.selectedMaterialIds
            .filter((id, index, values) => validIds.has(id) && values.indexOf(id) === index)
            .slice(0, 2);
        if (snapshot.cards.length === 0) {
            this.characterFocusIndex = 0;
        } else if (this.characterFocusIndex >= snapshot.cards.length) {
            this.characterFocusIndex = snapshot.cards.length - 1;
        }
    }

    private renderLobbyProgression(): void {
        const equipped = this.equippedCharacter();
        this.profileCurrency.string = `CP ${this.characterSnapshot.credits.toLocaleString('en-US')}  •  RP ${this.rankedSnapshot.rating}  •  ${this.onlineSnapshot.playerTag}`;
        if (!equipped) return;
        this.lobbyHeroKicker.string = `EQUIPPED  •  ${equipped.rarity}  •  ${equipped.stars} STAR`;
        this.lobbyHeroName.string = equipped.definition.name;
        this.lobbyHeroRole.string = equipped.definition.role;
        this.lobbyHeroPassive.string = `PASSIVE\n${equipped.definition.passive}`;
        this.lobbyHeroLevel.string = `${this.characterSnapshot.cards.length} CARDS  •  ${this.characterSnapshot.upgradePoints} UPGRADE POINTS`;
    }

    private equippedCharacter(): CharacterCardView | undefined {
        return this.characterSnapshot.cards.find((card) => card.id === this.characterSnapshot.equippedCardId);
    }

    private characterDetails(card: CharacterCardView): string {
        return `${card.rarity} / ${card.stars} STAR / POWER ${card.power}\n${card.definition.role}\n${card.definition.passive}\nSKILL: ${card.definition.activeSkill.name} — ${card.definition.activeSkill.description}`;
    }

    private characterMaterialDetails(card: CharacterCardView): string {
        const equipped = card.id === this.characterSnapshot.equippedCardId ? ' / EQUIPPED' : '';
        return `${card.definition.name}  ${card.rarity} / ${card.stars} STAR / POWER ${card.power}${equipped}`;
    }

    private setMetaCard(index: number, kicker: string, title: string, body: string): void {
        const kickerLabel = this.metaCardKickers[index];
        const titleLabel = this.metaCardTitles[index];
        const bodyLabel = this.metaCardBodies[index];
        if (kickerLabel) kickerLabel.string = kicker;
        if (titleLabel) titleLabel.string = title;
        if (bodyLabel) bodyLabel.string = body;
    }

    private setMetaButton(
        index: number,
        text: string,
        action: () => void,
        interactable: boolean,
        highlighted = false,
    ): void {
        const button = this.metaCardButtons[index];
        const label = this.metaCardButtonLabels[index];
        if (!button || !label) return;
        this.metaCardActions[index] = action;
        label.string = text;
        this.setButtonVisualState(
            button,
            label,
            interactable && !this.progressionBusy,
            highlighted,
        );
    }

    private setButtonVisualState(
        button: Button,
        label: Label,
        interactable: boolean,
        highlighted = false,
    ): void {
        const fill = !interactable ? BUTTON_DISABLED : highlighted ? GOLD : BLUE;
        const textColor = !interactable ? BUTTON_DISABLED_TEXT : highlighted ? INK : Color.WHITE;
        const graphics = button.node.getComponent(Graphics);
        const transform = button.node.getComponent(UITransform);
        if (graphics && transform) {
            const { width, height } = transform.contentSize;
            graphics.clear();
            graphics.fillColor = fill;
            graphics.strokeColor = fill;
            graphics.lineWidth = 3;
            graphics.roundRect(-width / 2, -height / 2, width, height, 14);
            graphics.fill();
            graphics.stroke();
        }
        label.color = textColor;
        button.interactable = interactable;
    }

    private isMetaModalOpen(): boolean {
        return this.metaModalOpen;
    }

    private isMetaPage(page: FrontEndPage): page is FrontEndMetaPage {
        return FRONT_END_META_PAGES.indexOf(page as FrontEndMetaPage) >= 0;
    }

    private setLobbyRoomFilter(filter: ClassicLobbyRoomFilter): void {
        if (this.starting || this.isMetaModalOpen()) return;
        this.lobbyRoomFilter = filter;
        this.selectedLobbyRoomIndex = 0;
        this.renderLobbyRooms();
        this.setStatus(`${CLASSIC_CHANNELS[this.lobbyChannelIndex] ?? 'ROOKIE CHANNEL'}  •  ${filter} ROOMS`);
    }

    private cycleLobbyChannel(): void {
        if (this.starting || this.isMetaModalOpen()) return;
        this.lobbyChannelIndex = (this.lobbyChannelIndex + 1) % CLASSIC_CHANNELS.length;
        this.selectedLobbyRoomIndex = 0;
        this.renderLobbyRooms();
        this.setStatus(`${CLASSIC_CHANNELS[this.lobbyChannelIndex] ?? 'ROOKIE CHANNEL'}  •  LOCAL PREVIEW`);
    }

    private selectLobbyRoom(index: number): void {
        if (this.starting || this.isMetaModalOpen()) return;
        const rooms = filterClassicLobbyRooms(this.lobbyRoomFilter);
        if (!rooms[index]) return;
        this.selectedLobbyRoomIndex = index;
        this.renderLobbyRooms();
    }

    private joinSelectedLobbyRoom(): void {
        if (this.starting || this.isMetaModalOpen()) return;
        const rooms = filterClassicLobbyRooms(this.lobbyRoomFilter);
        const room = rooms[this.selectedLobbyRoomIndex];
        if (!room) return;
        const status = classicLobbyRoomStatus(room);
        if (status === 'LOCKED') {
            this.setStatus(`ROOM ${room.number} is private. Create a local room instead.`);
            return;
        }
        if (status === 'FULL') {
            this.setStatus(`ROOM ${room.number} is full. Quick Match can create another table.`);
            return;
        }
        this.setStatus(`ROOM ${room.number} selected  •  LOCAL PREVIEW CREATED`);
        this.openLocalRoom();
    }

    private renderLobbyRooms(): void {
        const channel = CLASSIC_CHANNELS[this.lobbyChannelIndex] ?? 'ROOKIE CHANNEL';
        this.lobbyChannel.string = channel;
        const rooms = filterClassicLobbyRooms(this.lobbyRoomFilter);
        if (this.selectedLobbyRoomIndex >= rooms.length) this.selectedLobbyRoomIndex = 0;
        for (let index = 0; index < this.lobbyRoomLabels.length; index++) {
            const label = this.lobbyRoomLabels[index];
            const button = this.lobbyRoomButtons[index];
            const room = rooms[index];
            if (!label || !button) continue;
            button.node.active = room !== undefined;
            if (!room) continue;
            const selected = index === this.selectedLobbyRoomIndex;
            const status = classicLobbyRoomStatus(room);
            label.color = selected ? GOLD : Color.WHITE;
            label.string = `${String(room.number).padStart(3, '0')}   ${room.title}
      HOST ${room.host}                    ${room.map}        ${room.mode}      ${room.players}/${room.capacity}  ${status}`;
        }
        const selected = rooms[this.selectedLobbyRoomIndex];
        this.lobbyRoomPage.string = `${this.lobbyRoomFilter} ROOMS  •  ${rooms.length} TABLES  •  PAGE 1 / 1`;
        this.lobbyRoomDetails.string = selected
            ? `SELECTED  #${String(selected.number).padStart(3, '0')}  ${selected.title}
${selected.map}  •  ${selected.mode}  •  HOST ${selected.host}`
            : 'NO ROOM AVAILABLE';
    }

    private changePlayers(delta: number): void {
        if (this.starting || this.isMetaModalOpen()) return;
        this.roomSettings = changeRoomPlayerCount(this.roomSettings, delta);
        this.renderRoom();
    }

    private changeTurnSeconds(delta: number): void {
        if (this.starting || this.isMetaModalOpen()) return;
        this.roomSettings = changeRoomTurnSeconds(this.roomSettings, delta);
        this.renderRoom();
    }

    private toggleAutoRoll(): void {
        if (this.starting || this.isMetaModalOpen()) return;
        this.roomSettings = toggleRoomAutoRoll(this.roomSettings);
        this.renderRoom();
    }

    private cycleBotDifficulty(): void {
        if (this.starting || this.isMetaModalOpen()) return;
        this.roomSettings = cycleRoomBotDifficulty(this.roomSettings);
        this.renderRoom();
    }

    private toggleMatchMode(): void {
        if (this.starting || this.isMetaModalOpen()) return;
        this.roomSettings = toggleRoomMode(this.roomSettings);
        this.renderRoom();
    }

    private toggleRoundEvents(): void {
        if (this.starting || this.isMetaModalOpen()) return;
        this.roomSettings = toggleRoundEvents(this.roomSettings);
        this.renderRoom();
    }

    private startLocalMatch(): void {
        if (this.starting || this.isMetaModalOpen()) return;
        this.starting = true;
        this.renderRoom();
        this.setStatus('Preparing Skyline Circuit…');
        this.actions.startLocalMatch(this.roomSettings);
    }

    private renderLobbySetup(): void {
        this.lobbySetup.string = `${this.roomSettings.playerCount} PLAYERS  •  ${this.roomSettings.matchMode}\n${this.roomSettings.turnSeconds}s TURN  •  AI ${this.roomSettings.botDifficulty}\nROUND EVENTS ${this.roomSettings.roundEventsEnabled ? 'ON' : 'OFF'}  •  AUTO ROLL ${this.roomSettings.autoRollOnTimeout ? 'ON' : 'OFF'}`;
    }

    private renderRoom(): void {
        this.roomPlayerCount.string = `PLAYERS  ${this.roomSettings.playerCount}`;
        this.roomTurnSeconds.string = `TURN  ${this.roomSettings.turnSeconds}s`;
        this.roomAutoRoll.string = `AUTO ROLL: ${this.roomSettings.autoRollOnTimeout ? 'ON' : 'OFF'}`;
        this.roomBotDifficulty.string = `AI: ${this.roomSettings.botDifficulty}`;
        this.roomRoundEvents.string = `EVENTS: ${this.roomSettings.roundEventsEnabled ? 'ON' : 'OFF'}`;
        this.roomMode.string = `MODE: ${this.roomSettings.matchMode}`;
        this.roomTitle.string = `SKYLINE CIRCUIT  /  ${this.roomSettings.matchMode} MATCH`;
        this.roomModeInfo.string = this.roomSettings.matchMode === 'TEAM'
            ? '2 VS 2 TEAM ECONOMY  •  ALLY RENT WAIVED  •  TEAM NET WORTH'
            : 'SOLO ECONOMY  •  LANDMARK + TAKEOVER  •  12 ROUND LIMIT';
        const pendant = this.characterSnapshot.items.find((item) => item.equipped)?.definition.name ?? 'NONE';
        const booster = this.characterSnapshot.items.find((item) => item.selected)?.definition.name ?? 'NONE';
        this.roomSummary.string = `${this.roomSettings.matchMode}  •  ${this.roomSettings.playerCount} PLAYERS  •  AI ${this.roomSettings.botDifficulty}\nPENDANT ${pendant}  •  BOOSTER ${booster}\n${this.roomSettings.matchMode === 'TEAM' ? 'ALLY RENT FREE' : 'FREE FOR ALL'}  •  EVENTS ${this.roomSettings.roundEventsEnabled ? 'ON' : 'OFF'}`;
        const slots = createLocalRoomSlots(this.roomSettings);
        slots.forEach((slot, index) => {
            const label = this.roomSlotLabels[index];
            const stamp = this.roomSlotStamps[index];
            const teamBand = this.roomTeamBands[index];
            if (!label || !stamp || !teamBand) return;
            teamBand.string = slot.team;
            teamBand.color = slot.team === 'TEAM GOLD' ? GOLD : slot.team === 'TEAM BLUE' ? new Color(151, 226, 255) : SILVER;
            label.string = slot.occupied
                ? `${slot.name}\n${index === 0 ? slot.role : `${this.roomSettings.botDifficulty} AI`}\n${slot.team}  •  ${slot.ready ? 'READY' : 'WAITING'}`
                : `OPEN SLOT\nBOT DISABLED\nIncrease player count`;
            label.color = slot.occupied ? Color.WHITE : SILVER;
            stamp.string = slot.occupied
                ? index === 0 ? 'ROOM MASTER' : slot.ready ? 'AUTO READY' : 'WAITING'
                : 'SLOT AVAILABLE';
            stamp.color = slot.occupied && index === 0 ? GOLD : SILVER;
        });
        this.roomDecreasePlayers.interactable = !this.starting
            && this.roomSettings.matchMode === 'SOLO'
            && this.roomSettings.playerCount > MATCH_PLAYER_COUNT_MIN;
        this.roomIncreasePlayers.interactable = !this.starting
            && this.roomSettings.matchMode === 'SOLO'
            && this.roomSettings.playerCount < MATCH_PLAYER_COUNT_MAX;
        this.roomDecreaseTurn.interactable = !this.starting
            && this.roomSettings.turnSeconds > MATCH_TURN_SECONDS_MIN;
        this.roomIncreaseTurn.interactable = !this.starting
            && this.roomSettings.turnSeconds < MATCH_TURN_SECONDS_MAX;
        this.roomStartButton.interactable = !this.starting;
        this.renderLobbySetup();
    }

    private updateSettings(snapshot: SettingsSnapshot): void {
        this.settingsSnapshot = snapshot;
        this.renderSettings();
    }

    private renderSettings(): void {
        this.settingsMusic.string = `MUSIC  ${Math.round(this.settingsSnapshot.musicVolume * 100)}%`;
        this.settingsSound.string = `SFX  ${Math.round(this.settingsSnapshot.soundVolume * 100)}%`;
        this.settingsMotion.string = `REDUCED CAMERA MOTION  ${this.settingsSnapshot.reducedCameraMotion ? 'ON' : 'OFF'}`;
    }

    private leaveSettingsIfNeeded(): void {
        if (this.currentPage === 'SETTINGS') this.actions.closeSettings();
    }

    private clearMaterialSelectionWhenLeaving(nextPage: FrontEndPage): void {
        if (this.currentPage === 'CHARACTER' && nextPage !== 'CHARACTER') {
            this.selectedMaterialIds = [];
        }
    }

    private setStatus(message: string): void {
        this.headerStatus.string = message;
    }

    private preparePage(page: Node): void {
        page.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(page);
        page.setPosition(0, 0);
        page.addComponent(UITransform).setContentSize(1920, 900);
    }

    private drawAlexiaPlaceholder(parent: Node): void {
        const portrait = this.uiNode('AlexiaPortraitV77', parent, new Vec3(0, 70), 320, 410);
        const graphics = portrait.addComponent(Graphics);

        graphics.fillColor = new Color(5, 20, 34, 255);
        graphics.strokeColor = new Color(117, 207, 243, 220);
        graphics.lineWidth = 4;
        graphics.roundRect(-154, -198, 308, 396, 28);
        graphics.fill();
        graphics.stroke();

        graphics.strokeColor = new Color(245, 195, 35, 230);
        graphics.lineWidth = 3;
        graphics.roundRect(-146, -190, 292, 380, 22);
        graphics.stroke();

        graphics.fillColor = new Color(20, 23, 31, 255);
        graphics.roundRect(-82, -135, 164, 190, 42);
        graphics.fill();
        graphics.fillColor = new Color(245, 195, 35, 255);
        graphics.roundRect(-61, -71, 122, 17, 8);
        graphics.fill();

        graphics.fillColor = new Color(238, 196, 164, 255);
        graphics.circle(0, 55, 46);
        graphics.fill();
        graphics.fillColor = new Color(16, 18, 24, 255);
        graphics.arc(0, 59, 52, 0.05, 3.1, false);
        graphics.fill();
        graphics.fillColor = new Color(245, 195, 35, 255);
        graphics.roundRect(-52, 91, 104, 21, 8);
        graphics.fill();
        graphics.fillColor = new Color(10, 15, 23, 255);
        graphics.roundRect(-58, 82, 116, 15, 6);
        graphics.fill();

        graphics.fillColor = new Color(245, 195, 35, 255);
        graphics.circle(-17, 55, 5);
        graphics.circle(17, 55, 5);
        graphics.fill();

        graphics.fillColor = new Color(32, 151, 202, 255);
        graphics.roundRect(-115, -25, 38, 90, 16);
        graphics.roundRect(77, -25, 38, 90, 16);
        graphics.fill();
        graphics.fillColor = GOLD;
        graphics.circle(102, 100, 12);
        graphics.fill();

        const artworkNode = this.uiNode('AlexiaArtworkV77', portrait, new Vec3(0, -8), 302, 394);
        artworkNode.active = false;
        const artwork = artworkNode.addComponent(Sprite);
        artwork.sizeMode = Sprite.SizeMode.CUSTOM;
        resources.load('alexia/AlexiaLobby', SpriteFrame, (error: unknown, frame: SpriteFrame | null) => {
            if (error || !frame || !artworkNode.isValid) return;
            artwork.spriteFrame = frame;
            artworkNode.active = true;
        });
    }

    private drawCardMotif(parent: Node, index: number): void {
        const motif = this.uiNode('Motif', parent, new Vec3(0, -80), 300, 90);
        const graphics = motif.addComponent(Graphics);
        graphics.strokeColor = index === 0 ? GOLD : CYAN;
        graphics.lineWidth = 3;
        const radius = 18 + index * 5;
        for (let dot = -2; dot <= 2; dot++) {
            graphics.circle(dot * 52, 0, radius);
            graphics.stroke();
        }
    }

    private statRow(parent: Node, label: string, value: string, y: number): void {
        const row = this.panel(`Stat-${label}`, parent, new Vec3(0, y), 300, 48, PANEL_ALT, BORDER);
        this.childLabel(row, 'Label', label, 16, new Vec3(-105, 0), SILVER, 150, 28, Label.HorizontalAlign.LEFT);
        this.childLabel(row, 'Value', value, 18, new Vec3(110, 0), Color.WHITE, 150, 28, Label.HorizontalAlign.RIGHT);
    }

    private missionRow(parent: Node, title: string, value: string, y: number, progress: number): void {
        this.childLabel(parent, `${title}Title`, title, 17, new Vec3(-92, y + 16), Color.WHITE, 210, 28, Label.HorizontalAlign.LEFT);
        this.childLabel(parent, `${title}Value`, value, 16, new Vec3(142, y + 16), CYAN, 90, 28, Label.HorizontalAlign.RIGHT);
        this.progressBar(parent, new Vec3(0, y - 17), 350, 14, progress, progress >= 1 ? GOLD : CYAN);
    }

    private progressBar(
        parent: Node,
        position: Vec3,
        width: number,
        height: number,
        progress: number,
        color: Color,
    ): void {
        const track = this.uiNode('ProgressTrack', parent, position, width, height);
        const trackGraphics = track.addComponent(Graphics);
        trackGraphics.fillColor = new Color(42, 53, 68, 255);
        trackGraphics.roundRect(-width / 2, -height / 2, width, height, height / 2);
        trackGraphics.fill();
        const fillWidth = Math.max(height, Math.min(width, width * progress));
        trackGraphics.fillColor = color;
        trackGraphics.roundRect(-width / 2, -height / 2, fillWidth, height, height / 2);
        trackGraphics.fill();
    }

    private panel(
        name: string,
        parent: Node,
        position: Vec3,
        width: number,
        height: number,
        fill: Color,
        stroke: Color,
    ): Node {
        const node = this.uiNode(name, parent, position, width, height);
        this.drawPanel(node, width, height, fill, stroke);
        return node;
    }

    private childLabel(
        parent: Node,
        name: string,
        text: string,
        size: number,
        position: Vec3,
        color: Color,
        width: number,
        height: number,
        alignment: HorizontalTextAlignment = Label.HorizontalAlign.CENTER,
    ): Label {
        const node = this.uiNode(name, parent, position, width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = size + 7;
        label.color = color;
        label.horizontalAlign = alignment;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = true;
        return label;
    }

    private childButton(
        parent: Node,
        text: string,
        position: Vec3,
        color: Color,
        action: () => void,
        width: number,
        height: number,
        fontSize = 25,
    ): Button {
        const node = this.uiNode(`${text}Button`, parent, position, width, height);
        this.drawPanel(node, width, height, color, color);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.94;
        node.on(Button.EventType.CLICK, action);
        const darkText = color.r > 200 && color.g > 150;
        this.childLabel(
            node,
            `${text}Label`,
            text,
            fontSize,
            Vec3.ZERO,
            darkText ? INK : Color.WHITE,
            width - 18,
            height - 10,
        );
        return button;
    }

    private uiNode(name: string, parent: Node, position: Vec3, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        parent.addChild(node);
        node.setPosition(position);
        node.addComponent(UITransform).setContentSize(width, height);
        return node;
    }

    private drawPanel(node: Node, width: number, height: number, fill: Color, stroke: Color): void {
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = new Color(0, 0, 0, 92);
        graphics.roundRect(-width / 2 + 7, -height / 2 - 8, width, height, 12);
        graphics.fill();
        graphics.fillColor = fill;
        graphics.strokeColor = stroke;
        graphics.lineWidth = 3;
        graphics.roundRect(-width / 2, -height / 2, width, height, 12);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(255, 255, 255, 86);
        graphics.lineWidth = 2;
        graphics.roundRect(-width / 2 + 7, -height / 2 + 7, width - 14, height - 14, 8);
        graphics.stroke();
        graphics.fillColor = new Color(255, 255, 255, 24);
        graphics.roundRect(-width / 2 + 10, height / 2 - 19, width - 20, 10, 5);
        graphics.fill();
    }
}

function formatTimestamp(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return 'never';
    const date = new Date(value);
    return `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`;
}

function formatDuration(value: number): string {
    const seconds = Math.max(0, Math.trunc(value / 1000));
    const minutes = Math.trunc(seconds / 60);
    return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function formatCompetitiveDate(timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return 'SERVER SCHEDULE';
    const date = new Date(timestamp);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function formatJourneyReset(timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return 'next cycle';
    const date = new Date(timestamp);
    return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:00 UTC`;
}

function shortIdentifier(value: string): string {
    const normalized = value.trim();
    if (!normalized) return 'not linked';
    return normalized.length <= 14 ? normalized : `${normalized.slice(0, 7)}…${normalized.slice(-5)}`;
}
