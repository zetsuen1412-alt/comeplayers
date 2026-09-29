import { ANIME, animeTextColor, animeSurfaceColor, drawAnimePanel, drawAnimeRoll } from '../presentation/AnimeTheme';
import {
    BlockInputEvents,
    Button,
    Camera,
    Canvas,
    Color,
    director,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Layers,
    Node,
    ResolutionPolicy,
    SafeArea,
    tween,
    Tween,
    UITransform,
    Vec3,
    view,
    Widget,
} from 'cc';
import { BUILDING_LEVEL_NAMES } from '../buildings/BuildingUpgradeService';
import type { CareerMatchReward } from '../core/CareerProgressionService';
import type { RankedMatchReward } from '../core/RankedProgressionService';
import { WorldTravelDecision } from '../board/WorldTravelService';
import { OlympicDecision } from '../board/OlympicService';
import { FortuneCardRarity, fortuneCardCategory, fortuneEffectPreview } from '../cards/FortuneCardData';
import { TileType } from '../data/BoardData';
import { MatchModel, PaymentDecision } from '../core/MatchModel';
import type { DiceControlParity, DiceControlRange, DiceControlRequest } from '../network/NetworkService';
import { MatchResultEntry } from '../core/MatchResultService';
import type { MatchAward } from '../core/MatchAwardsService';
import { SettingsSnapshot } from '../core/SettingsService';
import { TutorialSnapshot } from '../core/TutorialService';
import { GameCenterDecision, GameCenterResult } from '../gamecenter/GameCenterService';
import type { LiveAcademyObjectiveState } from '../core/LiveAcademyObjectiveService';

export interface HudActions {
    readonly roll: (control?: DiceControlRequest) => void;
    readonly activateSkill: () => void;
    readonly confirmProperty: (targetLevel?: number) => void;
    readonly selectWorldTravel: (tileIndex: number) => void;
    readonly selectOlympic: (tileIndex: number) => void;
    readonly selectGameCenter: (selectedNumber: number) => void;
    readonly selectFortuneCard: (cardId: string) => void;
    readonly confirmTakeover: () => void;
    readonly continuePayment: () => void;
    readonly skip: () => void;
    readonly nextTutorial: () => void;
    readonly skipTutorial: () => void;
    readonly openTutorial: () => void;
    readonly openSettings: () => void;
    readonly closeSettings: () => void;
    readonly adjustMusicVolume: (delta: number) => void;
    readonly adjustSoundVolume: (delta: number) => void;
    readonly toggleReducedCameraMotion: () => void;
    readonly restart: () => void;
    readonly exitToLobby: () => void;
}

export class MatchHUD {
    private readonly root = new Node('MatchHUD');
    private readonly safeRoot = new Node('SafeAreaRoot');
    private readonly status: Label;
    private readonly dice: Label;
    private readonly timer: Label;
    private readonly roundInfo: Label;
    private readonly panels: Label[] = [];
    private readonly playerCards: Node[] = [];
    private readonly playerTurnIndicators: Label[] = [];
    private readonly playerReserveBars: Node[] = [];
    private readonly phaseRibbon: Label;
    private readonly matchModeRail: Label;
    private readonly threatRail: Label;
    private readonly turnOrderRail: Label;
    private readonly cityIntelRail: Label;
    private readonly colorMonopolyRail: Label;
    private readonly systemTicker: Label;
    private readonly rollButton: Button;
    private readonly diceParityButtons: Button[] = [];
    private readonly diceParityLabels: Label[] = [];
    private readonly diceRangeButtons: Button[] = [];
    private readonly diceRangeLabels: Label[] = [];
    private readonly diceControlStatus: Label;
    private readonly skillButton: Button;
    private readonly skillButtonLabel: Label;
    private readonly skillStatus: Label;
    private readonly settingsButton: Button;
    private readonly guideButton: Button;
    private readonly matchIntro = new Node('MatchIntro');
    private readonly matchIntroKicker: Label;
    private readonly matchIntroValue: Label;
    private readonly matchIntroDetail: Label;
    private readonly turnBanner = new Node('TurnBanner');
    private readonly turnBannerTitle: Label;
    private readonly turnBannerSubtitle: Label;
    private readonly diceReveal = new Node('DiceReveal');
    private readonly diceRevealTitle: Label;
    private readonly diceRevealSubtitle: Label;
    private readonly landingCard = new Node('CleanLandingCardV102');
    private readonly landingCardKicker: Label;
    private readonly landingCardTitle: Label;
    private readonly landingCardType: Label;
    private readonly landingCardMessage: Label;
    private readonly decision = new Node('PropertyDecision');
    private readonly decisionLabel: Label;
    private readonly propertyOptionButtons: Button[] = [];
    private readonly propertyOptionLabels: Label[] = [];
    private readonly propertyOptionTargets: Array<number | null> = [null, null, null, null];
    private readonly payment = new Node('PaymentDecision');
    private readonly paymentTitle: Label;
    private readonly paymentDetails: Label;
    private readonly paymentStatus: Label;
    private readonly paymentTakeoverButton: Button;
    private readonly paymentTakeoverButtonLabel: Label;
    private readonly paymentContinueButton: Button;
    private readonly travel = new Node('WorldTravelDecision');
    private readonly travelTitle: Label;
    private readonly travelPageLabel: Label;
    private readonly travelButtons: Button[] = [];
    private readonly travelButtonLabels: Label[] = [];
    private readonly travelPreviousButton: Button;
    private readonly travelNextButton: Button;
    private readonly olympic = new Node('OlympicDecision');
    private readonly olympicTitle: Label;
    private readonly olympicPageLabel: Label;
    private readonly olympicButtons: Button[] = [];
    private readonly olympicButtonLabels: Label[] = [];
    private readonly olympicPreviousButton: Button;
    private readonly olympicNextButton: Button;
    private readonly gameCenter = new Node('GameCenterDecision');
    private readonly gameCenterTitle: Label;
    private readonly gameCenterPrompt: Label;
    private readonly gameCenterButtons: Button[] = [];
    private readonly gameCenterButtonLabels: Label[] = [];
    private readonly gameCenterResult = new Node('GameCenterResult');
    private readonly gameCenterResultTitle: Label;
    private readonly gameCenterResultNumbers: Label;
    private readonly gameCenterResultReward: Label;
    private readonly fortune = new Node('FortuneCard');
    private readonly fortunePrompt: Label;
    private readonly fortuneRarity: Label;
    private readonly fortuneTitle: Label;
    private readonly fortuneDescription: Label;
    private readonly fortuneChoiceButtons: Button[] = [];
    private readonly fortuneChoiceLabels: Label[] = [];
    private readonly fortuneChoiceIds: Array<string | null> = [null, null, null];
    private readonly fortuneStatusRail: Label;
    private readonly specialDistrictRail: Label;
    private readonly liquidationStatusRail: Label;
    private readonly liveAcademyRail: Label;
    private readonly tutorial = new Node('Tutorial');
    private readonly tutorialProgress: Label;
    private readonly tutorialTitle: Label;
    private readonly tutorialDescription: Label;
    private readonly tutorialFocus: Label;
    private readonly tutorialNextButtonLabel: Label;
    private readonly settings = new Node('PauseSettings');
    private readonly settingsMusic: Label;
    private readonly settingsSound: Label;
    private readonly settingsMotionButtonLabel: Label;
    private readonly result = new Node('MatchResult');
    private readonly resultTitle: Label;
    private readonly resultSubtitle: Label;
    private readonly resultRows: Label[] = [];
    private readonly resultAwardLabels: Label[] = [];
    private readonly resultPerformance: Label;
    private readonly resultLegacy: Label;
    private readonly resultReward: Label;
    private readonly resultFooter: Label;
    private busy = false;
    private lastMessage = '';
    private travelPage = 0;
    private activeTravelDecision: WorldTravelDecision | null = null;
    private olympicPage = 0;
    private activeOlympicDecision: OlympicDecision | null = null;
    private currentModel: MatchModel | null = null;
    private currentTutorial: TutorialSnapshot | null = null;
    private currentSettings: SettingsSnapshot | null = null;
    private careerReward: CareerMatchReward | null = null;
    private rankedReward: RankedMatchReward | null = null;
    private resultPresentationReady = false;
    private turnBannerToken = 0;
    private diceRevealToken = 0;
    private landingCardToken = 0;
    private readonly messageHistory: string[] = [];
    private activeSkillName = 'ACTIVE SKILL';
    private activeSkillReady = false;
    private activeSkillDetail = '';
    private diceControlParity: DiceControlParity = 'AUTO';
    private diceControlRange: DiceControlRange = 'MID';
    private liveAcademyObjective: LiveAcademyObjectiveState | null = null;
    private liveAcademyResultText = 'LIVE ACADEMY  •  OBJECTIVE NOT RECORDED';
    private readonly advancedHudPanel: Node;
    private readonly advancedHudButtonLabel: Label;
    private advancedHudOpen = false;

    public constructor(private readonly actions: HudActions) {
        view.setDesignResolutionSize(1920, 1080, ResolutionPolicy.FIXED_HEIGHT);
        this.root.layer = Layers.Enum.UI_2D;
        const rootTransform = this.root.getComponent(UITransform) ?? this.root.addComponent(UITransform);
        rootTransform.setContentSize(2200, 1080);

        const cameraNode = new Node('HUDCamera');
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

        // V107 Video Reference HUD: the full board is the main screen. Only compact player, turn,
        // player cards, and roll controls remain visible. Detailed systems live in the optional
        // INFO panel so Academy, Journey, Fortune, liquidation, and tactical data never cover play.
        const chrome = this.uiNode('VideoReferenceHudChromeV105', this.safeRoot, Vec3.ZERO, 2200, 1080);
        const chromeGraphics = chrome.addComponent(Graphics);
        chromeGraphics.fillColor = animeSurfaceColor(new Color(55, 39, 30, 238));
        chromeGraphics.fillRect(-1100, 482, 2200, 58);
        chromeGraphics.fillRect(-1100, -540, 2200, 60);
        chromeGraphics.fillColor = animeSurfaceColor(new Color(166, 122, 52, 210));
        chromeGraphics.fillRect(-1100, 476, 2200, 4);
        chromeGraphics.fillRect(-1100, -482, 2200, 4);
        chromeGraphics.fillColor = animeSurfaceColor(new Color(231, 192, 91, 195));
        chromeGraphics.fillRect(-1100, 472, 2200, 2);
        chromeGraphics.fillRect(-1100, -478, 2200, 2);

        const topBar = this.uiNode('VideoReferenceTopBarV105', this.safeRoot, new Vec3(0, 512), 1920, 50);
        this.drawPanel(topBar, 1920, 50, new Color(61, 46, 36, 248), new Color(216, 176, 80));
        this.childLabel(topBar, 'Brand', 'CRAZY RICH: WORLD TOUR', 19, new Vec3(-675, 7), new Color(247, 205, 84), 310, 27, Label.HorizontalAlign.LEFT);
        this.childLabel(topBar, 'MapName', 'WORLD TOUR  •  ANIME ADVENTURE', 10, new Vec3(-675, -15), new Color(224, 215, 188), 330, 18, Label.HorizontalAlign.LEFT);
        this.status = this.childLabel(topBar, 'Status', 'Match ready', 16, new Vec3(-45, 7), Color.WHITE, 690, 26);
        this.roundInfo = this.childLabel(topBar, 'RoundInfo', 'ROUND 1 / 12', 10, new Vec3(-45, -15), new Color(227, 216, 190), 650, 18);

        const timerMedallion = this.uiNode('CleanTimerMedallionV102', topBar, new Vec3(475, 0), 60, 60);
        const timerGraphics = timerMedallion.addComponent(Graphics);
        timerGraphics.fillColor = animeSurfaceColor(new Color(72, 50, 38, 255));
        timerGraphics.strokeColor = new Color(236, 191, 74, 255);
        timerGraphics.lineWidth = 4;
        timerGraphics.circle(0, 0, 25);
        timerGraphics.fill();
        timerGraphics.stroke();
        this.timer = this.childLabel(timerMedallion, 'Timer', '20', 22, Vec3.ZERO, new Color(248, 205, 76), 46, 38);
        this.settingsButton = this.childButton(topBar, 'PAUSE', new Vec3(555, 0), new Color(74, 104, 124), this.actions.openSettings, 96, 36, 12);
        this.guideButton = this.childButton(topBar, 'GUIDE', new Vec3(655, 0), new Color(65, 126, 153), this.actions.openTutorial, 92, 36, 12);
        const advancedHudButton = this.childButton(topBar, 'INFO', new Vec3(753, 0), new Color(47, 92, 135), () => this.toggleAdvancedHud(), 92, 36, 12);
        const advancedHudButtonLabel = advancedHudButton.node.getComponentInChildren(Label);
        if (!advancedHudButtonLabel) throw new Error('Advanced HUD button label was not created.');
        this.advancedHudButtonLabel = advancedHudButtonLabel;
        this.childButton(topBar, 'EXIT', new Vec3(845, 0), new Color(132, 75, 64), this.actions.restart, 76, 36, 11);

        const phaseBar = this.uiNode('VideoReferencePhaseBarV105', this.safeRoot, new Vec3(0, 472), 420, 22);
        this.drawPanel(phaseBar, 420, 22, new Color(60, 45, 35, 232), new Color(191, 150, 69));
        this.phaseRibbon = this.childLabel(
            phaseBar,
            'PhaseRibbon',
            'YOUR TURN  •  ROLL',
            10,
            Vec3.ZERO,
            new Color(244, 224, 166),
            385,
            16,
        );

        const threatBadge = this.uiNode('VideoReferenceThreatAlertV105', this.safeRoot, new Vec3(735, 472), 290, 22);
        this.drawPanel(threatBadge, 290, 22, new Color(60, 45, 35, 232), new Color(191, 150, 69));
        this.threatRail = this.childLabel(threatBadge, 'ThreatBadge', 'MONOPOLY THREAT  •  CLEAR', 10, Vec3.ZERO, new Color(252, 225, 145), 260, 16);
        threatBadge.active = false;

        this.advancedHudPanel = this.uiNode('CleanHudInfoPanelV102', this.safeRoot, new Vec3(725, 220), 480, 370);
        this.drawPanel(this.advancedHudPanel, 480, 370, new Color(14, 53, 84, 248), new Color(91, 181, 222));
        this.childLabel(this.advancedHudPanel, 'InfoTitle', 'MATCH INFO', 15, new Vec3(0, 157), new Color(247, 205, 84), 420, 25);
        this.childLabel(this.advancedHudPanel, 'InfoHint', 'Optional details • press INFO to close', 9, new Vec3(0, 137), new Color(182, 214, 230), 420, 18);
        this.matchModeRail = this.childLabel(this.advancedHudPanel, 'ModeBadge', 'WORLD TOUR  •  4 PLAYERS  •  V107', 10, new Vec3(0, 108), new Color(209, 235, 247), 430, 20, Label.HorizontalAlign.LEFT);
        this.turnOrderRail = this.childLabel(this.advancedHudPanel, 'TurnOrderRail', 'TURN ORDER', 9, new Vec3(0, 78), new Color(216, 239, 248), 430, 22, Label.HorizontalAlign.LEFT);
        this.cityIntelRail = this.childLabel(this.advancedHudPanel, 'CityIntelRail', 'CITY INTEL', 9, new Vec3(0, 42), new Color(244, 225, 170), 430, 34, Label.HorizontalAlign.LEFT);
        this.colorMonopolyRail = this.childLabel(this.advancedHudPanel, 'ColorMonopolyRail', 'COLOR MONOPOLY', 9, new Vec3(0, 4), new Color(255, 226, 133), 430, 30, Label.HorizontalAlign.LEFT);
        this.fortuneStatusRail = this.childLabel(this.advancedHudPanel, 'FortuneStatusRail', 'FORTUNE', 9, new Vec3(0, -28), new Color(224, 205, 255), 430, 24, Label.HorizontalAlign.LEFT);
        this.specialDistrictRail = this.childLabel(this.advancedHudPanel, 'SpecialDistrictRail', 'SPECIAL DISTRICT', 9, new Vec3(0, -58), new Color(219, 239, 248), 430, 24, Label.HorizontalAlign.LEFT);
        this.liquidationStatusRail = this.childLabel(this.advancedHudPanel, 'LiquidationStatusRail', 'RESCUE ECONOMY READY', 9, new Vec3(0, -88), new Color(255, 220, 174), 430, 24, Label.HorizontalAlign.LEFT);
        this.liveAcademyRail = this.childLabel(this.advancedHudPanel, 'LiveAcademyObjectiveRailV102', 'LIVE ACADEMY  •  OBJECTIVE LOADING', 9, new Vec3(0, -120), new Color(211, 242, 255), 430, 28, Label.HorizontalAlign.LEFT);
        this.systemTicker = this.childLabel(this.advancedHudPanel, 'CleanSystemTickerV102', 'SYSTEM  •  MATCH READY', 9, new Vec3(0, -151), new Color(199, 217, 228), 430, 24, Label.HorizontalAlign.LEFT);
        this.advancedHudPanel.active = false;

        const skillDock = this.uiNode('VideoReferenceSkillDockV105', this.safeRoot, new Vec3(-810, -505), 228, 42);
        this.drawPanel(skillDock, 228, 42, new Color(61, 46, 36, 242), new Color(148, 99, 164));
        this.skillButton = this.childButton(skillDock, 'SKILL', new Vec3(-54, 0), new Color(137, 82, 180), this.actions.activateSkill, 126, 34, 12);
        const skillButtonLabel = this.skillButton.node.getComponentInChildren(Label);
        if (!skillButtonLabel) throw new Error('Active skill button label was not created.');
        this.skillButtonLabel = skillButtonLabel;
        this.skillStatus = this.childLabel(skillDock, 'SkillStatus', 'READY', 9, new Vec3(70, 0), new Color(235, 219, 243), 92, 30);
        skillDock.active = false;

        const bottomDock = this.uiNode('VideoReferenceDiceDockV105', this.safeRoot, new Vec3(0, -492), 520, 70);
        this.drawPanel(bottomDock, 520, 70, new Color(60, 45, 35, 246), new Color(219, 174, 76));
        this.rollButton = this.childRoundButton(
            bottomDock,
            'ROLL',
            Vec3.ZERO,
            new Color(181, 73, 145),
            () => this.actions.roll(this.currentDiceControl()),
            40,
            19,
        );
        this.childLabel(bottomDock, 'ParityTitle', 'PARITY', 8, new Vec3(-245, 24), new Color(235, 220, 185), 170, 14).node.active = false;
        const parityValues: readonly DiceControlParity[] = ['AUTO', 'ODD', 'EVEN'];
        parityValues.forEach((value, index) => {
            const button = this.childButton(
                bottomDock,
                value,
                new Vec3(-300 + index * 58, -3),
                new Color(72, 61, 59),
                () => this.selectDiceParity(value),
                52,
                25,
                8,
            );
            const label = button.node.getComponentInChildren(Label);
            if (!label) throw new Error('Dice parity control label was not created.');
            this.diceParityButtons.push(button);
            this.diceParityLabels.push(label);
            button.node.active = false;
        });
        this.childLabel(bottomDock, 'RangeTitle', 'RANGE', 8, new Vec3(-245, -27), new Color(235, 220, 185), 170, 14).node.active = false;
        const rangeValues: readonly DiceControlRange[] = ['LOW', 'MID', 'HIGH'];
        rangeValues.forEach((value, index) => {
            const button = this.childButton(
                bottomDock,
                value,
                new Vec3(-300 + index * 58, -49),
                new Color(72, 61, 59),
                () => this.selectDiceRange(value),
                52,
                23,
                8,
            );
            const label = button.node.getComponentInChildren(Label);
            if (!label) throw new Error('Dice range control label was not created.');
            this.diceRangeButtons.push(button);
            this.diceRangeLabels.push(label);
            button.node.active = false;
        });
        this.dice = this.childLabel(bottomDock, 'DiceResult', 'ROLL TO BEGIN', 17, new Vec3(145, 15), Color.WHITE, 260, 26);
        this.diceControlStatus = this.childLabel(
            bottomDock,
            'DiceControlStatus',
            'MID / AUTO  •  TARGET 6-8',
            9,
            new Vec3(145, -8),
            new Color(244, 213, 131),
            270,
            18,
        );
        this.diceControlStatus.node.active = false;
        this.childLabel(bottomDock, 'DiceHint', 'DOUBLE = BONUS TURN', 8, new Vec3(145, -28), new Color(223, 211, 188), 260, 14);
        this.refreshDiceControlVisuals();

        const panelPositions = [
            new Vec3(-845, 365), new Vec3(845, 365),
            new Vec3(-845, -365), new Vec3(845, -365),
        ];
        const slotColors = [
            new Color(61, 177, 216), new Color(238, 186, 57),
            new Color(211, 94, 170), new Color(88, 181, 116),
        ];
        for (let index = 0; index < 4; index++) {
            const slotColor = slotColors[index] ?? new Color(245, 195, 35);
            const panel = this.uiNode(`VideoReferencePlayerCardV105-${index}`, this.safeRoot, panelPositions[index] as Vec3, 300, 96);
            this.drawPanel(panel, 300, 96, new Color(58, 43, 34, 246), slotColor);
            this.playerCards.push(panel);
            const headerStrip = this.uiNode('PlayerColorStrip', panel, new Vec3(0, 36), 272, 7);
            const stripGraphics = headerStrip.addComponent(Graphics);
            stripGraphics.fillColor = animeSurfaceColor(slotColor);
            stripGraphics.roundRect(-136, -3.5, 272, 7, 3);
            stripGraphics.fill();
            const avatar = this.uiNode('PortraitCard', panel, new Vec3(-111, -3), 52, 66);
            this.drawPanel(avatar, 52, 66, new Color(31, 31, 34, 255), new Color(225, 195, 122));
            this.childLabel(avatar, 'Portrait', index === 0 ? 'A' : `${index + 1}`, 25, new Vec3(0, 6), slotColor, 40, 38);
            this.childLabel(avatar, 'Seat', `P${index + 1}`, 8, new Vec3(0, -24), new Color(244, 232, 205), 40, 14);
            const rankNode = this.uiNode('RankMedallion', panel, new Vec3(-136, 31), 34, 34);
            const rankGraphics = rankNode.addComponent(Graphics);
            rankGraphics.fillColor = animeSurfaceColor(new Color(48, 36, 34, 255));
            rankGraphics.strokeColor = slotColor;
            rankGraphics.lineWidth = 2;
            rankGraphics.circle(0, 0, 14);
            rankGraphics.fill();
            rankGraphics.stroke();
            this.childLabel(rankNode, 'RankNumber', `${index + 1}`, 13, Vec3.ZERO, Color.WHITE, 22, 20);
            this.playerTurnIndicators.push(this.childLabel(
                panel,
                'TurnIndicator',
                'WAIT',
                8,
                new Vec3(111, 31),
                new Color(206, 194, 169),
                48,
                16,
            ));
            this.panels.push(this.childLabel(panel, 'Info', '', 10, new Vec3(31, -2), Color.WHITE, 192, 74, Label.HorizontalAlign.LEFT));
            const statusStrip = this.uiNode(`CleanPlayerStatusStripV102-${index}`, panel, new Vec3(31, -35), 184, 10);
            const statusGraphics = statusStrip.addComponent(Graphics);
            statusGraphics.fillColor = animeSurfaceColor(new Color(slotColor.r, slotColor.g, slotColor.b, 58));
            statusGraphics.roundRect(-92, -5, 184, 10, 4);
            statusGraphics.fill();
            const reserveBar = this.uiNode(`CleanCashReserveBarV102-${index}`, statusStrip, new Vec3(-88, 0), 176, 6);
            const reserveGraphics = reserveBar.addComponent(Graphics);
            reserveGraphics.fillColor = animeSurfaceColor(slotColor);
            reserveGraphics.roundRect(0, -3, 176, 6, 3);
            reserveGraphics.fill();
            reserveBar.setScale(0.22, 1, 1);
            this.playerReserveBars.push(reserveBar);
        }

        this.matchIntro.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.matchIntro);
        this.matchIntro.addComponent(UITransform).setContentSize(1920, 1080);
        this.matchIntro.addComponent(BlockInputEvents);
        const introScrim = this.matchIntro.addComponent(Graphics);
        introScrim.fillColor = animeSurfaceColor(new Color(3, 11, 20, 220));
        introScrim.fillRect(-960, -540, 1920, 1080);
        const introPanel = this.uiNode('MatchIntroPanel', this.matchIntro, Vec3.ZERO, 980, 390);
        this.drawPanel(introPanel, 980, 390, new Color(61, 43, 38, 255), new Color(235, 190, 76));
        this.matchIntroKicker = this.childLabel(
            introPanel, 'Kicker', 'SKYLINE CIRCUIT  •  SOLO MATCH', 21,
            new Vec3(0, 112), new Color(121, 217, 255), 820, 42,
        );
        this.matchIntroValue = this.childLabel(
            introPanel, 'Value', 'READY', 84, new Vec3(0, 20), new Color(245, 195, 35), 820, 116,
        );
        this.matchIntroDetail = this.childLabel(
            introPanel, 'Detail', 'Four challengers enter Marble World.', 22,
            new Vec3(0, -105), Color.WHITE, 820, 72,
        );
        this.matchIntro.active = false;

        this.turnBanner.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.turnBanner);
        this.turnBanner.setPosition(0, 350);
        this.turnBanner.addComponent(UITransform).setContentSize(410, 58);
        this.drawPanel(this.turnBanner, 410, 58, new Color(65, 48, 38, 245), new Color(225, 181, 78));
        this.turnBannerTitle = this.childLabel(
            this.turnBanner, 'Title', '', 18, new Vec3(0, 10), Color.WHITE, 360, 26,
        );
        this.turnBannerSubtitle = this.childLabel(
            this.turnBanner, 'Subtitle', '', 9, new Vec3(0, -14), new Color(232, 209, 153), 360, 18,
        );
        this.turnBanner.active = false;

        this.diceReveal.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.diceReveal);
        this.diceReveal.setPosition(0, 150);
        this.diceReveal.addComponent(UITransform).setContentSize(230, 96);
        this.drawPanel(this.diceReveal, 230, 96, new Color(66, 49, 39, 244), new Color(232, 187, 79));
        this.diceRevealTitle = this.childLabel(
            this.diceReveal, 'DiceValue', '', 44, new Vec3(0, 16), new Color(245, 195, 35), 190, 54,
        );
        this.diceRevealSubtitle = this.childLabel(
            this.diceReveal, 'DiceSubtitle', '', 9, new Vec3(0, -26), new Color(225, 211, 174), 200, 20,
        );
        this.diceReveal.active = false;

        this.landingCard.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.landingCard);
        this.landingCard.setPosition(0, 245);
        this.landingCard.addComponent(UITransform).setContentSize(450, 112);
        this.drawPanel(this.landingCard, 450, 112, new Color(72, 53, 40, 248), new Color(228, 184, 78));
        this.landingCardKicker = this.childLabel(
            this.landingCard,
            'LandingKicker',
            'ARRIVAL',
            10,
            new Vec3(-165, 43),
            new Color(118, 76, 46),
            150,
            20,
            Label.HorizontalAlign.LEFT,
        );
        this.landingCardTitle = this.childLabel(
            this.landingCard,
            'LandingTitle',
            '',
            24,
            new Vec3(-35, 17),
            new Color(83, 50, 34),
            360,
            34,
            Label.HorizontalAlign.LEFT,
        );
        this.landingCardType = this.childLabel(
            this.landingCard,
            'LandingType',
            '',
            10,
            new Vec3(175, 42),
            new Color(245, 195, 35),
            120,
            20,
        );
        this.landingCardMessage = this.childLabel(
            this.landingCard,
            'LandingMessage',
            '',
            12,
            new Vec3(0, -31),
            new Color(81, 56, 42),
            480,
            54,
        );
        this.landingCard.active = false;

        this.decision.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.decision);
        this.decision.setPosition(0, -55);
        this.decision.addComponent(UITransform).setContentSize(980, 360);
        this.drawPanel(this.decision, 980, 360, new Color(235, 226, 199, 252), new Color(131, 87, 53));
        this.childLabel(
            this.decision,
            'DevelopmentPlannerHeaderV90',
            'CLASSIC CITY DEVELOPMENT PLANNER',
            17,
            new Vec3(0, 146),
            new Color(151, 72, 58),
            820,
            30,
        );
        this.decisionLabel = this.childLabel(
            this.decision,
            'DecisionText',
            '',
            22,
            new Vec3(0, 72),
            new Color(91, 55, 37),
            880,
            100,
        );
        const optionPositions = [-315, -105, 105, 315];
        optionPositions.forEach((x, index) => {
            const button = this.childButton(
                this.decision,
                `PLAN ${index + 1}`,
                new Vec3(x, -55),
                index === 0 ? new Color(245, 195, 35) : new Color(49, 142, 188),
                () => {
                    const target = this.propertyOptionTargets[index];
                    if (target !== null) this.actions.confirmProperty(target);
                },
                190,
                92,
            );
            const label = button.node.getComponentInChildren(Label);
            if (!label) throw new Error('Property development option label was not created.');
            label.fontSize = 14;
            label.lineHeight = 18;
            this.propertyOptionButtons.push(button);
            this.propertyOptionLabels.push(label);
        });
        this.childButton(this.decision, 'SAVE CASH / SKIP', new Vec3(0, -142), new Color(58, 72, 94), this.actions.skip, 300, 54);
        this.decision.active = false;

        this.payment.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.payment);
        this.payment.setPosition(0, -45);
        this.payment.addComponent(UITransform).setContentSize(920, 410);
        this.drawPanel(this.payment, 920, 410, new Color(235, 226, 199, 252), new Color(151, 72, 58));
        this.paymentTitle = this.childLabel(
            this.payment, 'PaymentTitle', '', 36, new Vec3(0, 150),
            new Color(255, 109, 109), 800, 60,
        );
        this.paymentDetails = this.childLabel(
            this.payment, 'PaymentDetails', '', 26, new Vec3(0, 62),
            new Color(76, 49, 37), 800, 100,
        );
        this.paymentStatus = this.childLabel(
            this.payment, 'PaymentStatus', '', 22, new Vec3(0, -25),
            new Color(245, 195, 35), 780, 58,
        );
        this.paymentTakeoverButton = this.childButton(
            this.payment, 'TAKEOVER', new Vec3(-205, -132), new Color(245, 195, 35),
            this.actions.confirmTakeover, 330, 82,
        );
        const paymentTakeoverLabel = this.paymentTakeoverButton.node.getComponentInChildren(Label);
        if (!paymentTakeoverLabel) throw new Error('Takeover button label was not created.');
        this.paymentTakeoverButtonLabel = paymentTakeoverLabel;
        this.paymentTakeoverButtonLabel.fontSize = 22;
        this.paymentTakeoverButtonLabel.lineHeight = 29;
        this.paymentContinueButton = this.childButton(
            this.payment, 'CONTINUE', new Vec3(205, -132), new Color(58, 72, 94),
            this.actions.continuePayment, 330, 82,
        );
        this.payment.active = false;

        this.travel.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.travel);
        this.travel.setPosition(0, -25);
        this.travel.addComponent(UITransform).setContentSize(1100, 520);
        this.drawPanel(this.travel, 1100, 520, new Color(12, 34, 39, 252), new Color(24, 255, 210));
        this.travelTitle = this.childLabel(
            this.travel, 'TravelTitle', '', 31, new Vec3(0, 205),
            new Color(24, 255, 210), 940, 70,
        );
        const travelPositions = [
            new Vec3(-350, 85), new Vec3(0, 85), new Vec3(350, 85),
            new Vec3(-350, -45), new Vec3(0, -45), new Vec3(350, -45),
        ];
        for (let slot = 0; slot < travelPositions.length; slot++) {
            const button = this.childButton(
                this.travel,
                `DEST ${slot + 1}`,
                travelPositions[slot] as Vec3,
                new Color(24, 154, 146),
                () => this.selectTravelSlot(slot),
                300,
                96,
            );
            const buttonLabel = button.node.getComponentInChildren(Label);
            if (!buttonLabel) throw new Error('World Travel destination label was not created.');
            buttonLabel.fontSize = 13;
            buttonLabel.lineHeight = 17;
            this.travelButtons.push(button);
            this.travelButtonLabels.push(buttonLabel);
        }
        this.travelPreviousButton = this.childButton(
            this.travel, 'PREV', new Vec3(-210, -195), new Color(58, 72, 94),
            () => this.changeTravelPage(-1), 170, 62,
        );
        this.travelPageLabel = this.childLabel(
            this.travel, 'TravelPage', '', 24, new Vec3(0, -195),
            Color.WHITE, 220, 54,
        );
        this.travelNextButton = this.childButton(
            this.travel, 'NEXT', new Vec3(210, -195), new Color(58, 72, 94),
            () => this.changeTravelPage(1), 170, 62,
        );
        this.travel.active = false;

        this.olympic.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.olympic);
        this.olympic.setPosition(0, -25);
        this.olympic.addComponent(UITransform).setContentSize(1100, 520);
        this.drawPanel(this.olympic, 1100, 520, new Color(48, 24, 15, 252), new Color(255, 126, 55));
        this.olympicTitle = this.childLabel(
            this.olympic, 'OlympicTitle', '', 31, new Vec3(0, 205),
            new Color(255, 126, 55), 940, 70,
        );
        const olympicPositions = [
            new Vec3(-350, 85), new Vec3(0, 85), new Vec3(350, 85),
            new Vec3(-350, -45), new Vec3(0, -45), new Vec3(350, -45),
        ];
        for (let slot = 0; slot < olympicPositions.length; slot++) {
            const button = this.childButton(
                this.olympic,
                `CITY ${slot + 1}`,
                olympicPositions[slot] as Vec3,
                new Color(203, 79, 38),
                () => this.selectOlympicSlot(slot),
                300,
                96,
            );
            const buttonLabel = button.node.getComponentInChildren(Label);
            if (!buttonLabel) throw new Error('Olympic city label was not created.');
            buttonLabel.fontSize = 14;
            buttonLabel.lineHeight = 18;
            this.olympicButtons.push(button);
            this.olympicButtonLabels.push(buttonLabel);
        }
        this.olympicPreviousButton = this.childButton(
            this.olympic, 'PREV', new Vec3(-210, -195), new Color(58, 72, 94),
            () => this.changeOlympicPage(-1), 170, 62,
        );
        this.olympicPageLabel = this.childLabel(
            this.olympic, 'OlympicPage', '', 24, new Vec3(0, -195),
            Color.WHITE, 220, 54,
        );
        this.olympicNextButton = this.childButton(
            this.olympic, 'NEXT', new Vec3(210, -195), new Color(58, 72, 94),
            () => this.changeOlympicPage(1), 170, 62,
        );
        this.olympic.active = false;

        this.gameCenter.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.gameCenter);
        this.gameCenter.setPosition(0, -25);
        this.gameCenter.addComponent(UITransform).setContentSize(1040, 480);
        this.drawPanel(this.gameCenter, 1040, 480, new Color(71, 49, 40, 252), new Color(235, 190, 76));
        this.gameCenterTitle = this.childLabel(
            this.gameCenter, 'GameCenterTitle', '', 36, new Vec3(0, 185),
            new Color(245, 195, 35), 800, 60,
        );
        this.gameCenterPrompt = this.childLabel(
            this.gameCenter, 'GameCenterPrompt', '', 23, new Vec3(0, 112),
            new Color(220, 235, 246), 780, 62,
        );
        const gameCenterPositions = [new Vec3(-320, -55), new Vec3(0, -55), new Vec3(320, -55)];
        for (let slot = 0; slot < gameCenterPositions.length; slot++) {
            const button = this.childButton(
                this.gameCenter,
                `${slot + 1}`,
                gameCenterPositions[slot] as Vec3,
                new Color(30, 202, 255),
                () => this.selectGameCenterSlot(slot),
                270,
                170,
            );
            const buttonLabel = button.node.getComponentInChildren(Label);
            if (!buttonLabel) throw new Error('Game Center option label was not created.');
            buttonLabel.fontSize = 18;
            buttonLabel.lineHeight = 24;
            this.gameCenterButtons.push(button);
            this.gameCenterButtonLabels.push(buttonLabel);
        }
        this.childLabel(
            this.gameCenter, 'GameCenterFooter', 'TARGET IS DRAWN AFTER YOUR CHOICE IS LOCKED', 20,
            new Vec3(0, -205), new Color(112, 204, 235), 840, 42,
        );
        this.gameCenter.active = false;

        this.gameCenterResult.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.gameCenterResult);
        this.gameCenterResult.setPosition(0, -25);
        this.gameCenterResult.addComponent(UITransform).setContentSize(820, 350);
        this.drawPanel(this.gameCenterResult, 820, 350, new Color(71, 49, 40, 252), new Color(235, 190, 76));
        this.gameCenterResultTitle = this.childLabel(
            this.gameCenterResult, 'GameCenterResultTitle', '', 44, new Vec3(0, 110),
            new Color(245, 195, 35), 720, 64,
        );
        this.gameCenterResultNumbers = this.childLabel(
            this.gameCenterResult, 'GameCenterResultNumbers', '', 32, new Vec3(0, 20),
            Color.WHITE, 700, 70,
        );
        this.gameCenterResultReward = this.childLabel(
            this.gameCenterResult, 'GameCenterResultReward', '', 27, new Vec3(0, -90),
            new Color(30, 202, 255), 700, 70,
        );
        this.gameCenterResult.active = false;

        this.fortune.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.fortune);
        this.fortune.setPosition(0, -18);
        this.fortune.addComponent(UITransform).setContentSize(1100, 500);
        this.drawPanel(this.fortune, 1100, 500, new Color(31, 23, 55, 252), new Color(181, 119, 255));
        this.fortunePrompt = this.childLabel(
            this.fortune, 'ClassicFortuneChoicePromptV90', 'FORTUNE SIGNAL  •  CHOOSE ONE CARD', 22,
            new Vec3(0, 210), new Color(245, 195, 35), 900, 42,
        );
        this.fortuneRarity = this.childLabel(
            this.fortune, 'Rarity', '', 23, new Vec3(0, 145),
            new Color(159, 98, 255), 900, 46,
        );
        this.fortuneTitle = this.childLabel(
            this.fortune, 'Title', '', 42, new Vec3(0, 82),
            Color.WHITE, 900, 70,
        );
        this.fortuneDescription = this.childLabel(
            this.fortune, 'Description', '', 26, new Vec3(0, -35),
            new Color(224, 215, 238), 860, 120,
        );
        const fortuneChoicePositions = [new Vec3(-350, -45), new Vec3(0, -45), new Vec3(350, -45)];
        const fortuneChoiceColors = [new Color(43, 116, 171), new Color(117, 69, 165), new Color(180, 129, 35)];
        for (let slot = 0; slot < 3; slot++) {
            const button = this.childButton(
                this.fortune,
                `FORTUNE ${slot + 1}`,
                fortuneChoicePositions[slot] as Vec3,
                fortuneChoiceColors[slot] as Color,
                () => this.selectFortuneChoice(slot),
                300,
                230,
                18,
            );
            const label = button.node.getComponentInChildren(Label);
            if (!label) throw new Error('Fortune choice label was not created.');
            this.fortuneChoiceButtons.push(button);
            this.fortuneChoiceLabels.push(label);
        }
        this.childLabel(
            this.fortune, 'ClassicFortuneChoiceFooterV90', 'ONE CARD RESOLVES  •  THE OTHER TWO RETURN TO THE SIGNAL DECK', 18,
            new Vec3(0, -215), new Color(181, 153, 225), 900, 34,
        );
        this.fortune.active = false;

        this.tutorial.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.tutorial);
        this.tutorial.setPosition(0, -20);
        this.tutorial.addComponent(UITransform).setContentSize(980, 590);
        this.drawPanel(this.tutorial, 980, 590, new Color(10, 18, 29, 255), new Color(30, 202, 255));
        this.tutorialProgress = this.childLabel(
            this.tutorial, 'TutorialProgress', '', 21, new Vec3(0, 242),
            new Color(30, 202, 255), 820, 42,
        );
        this.tutorialTitle = this.childLabel(
            this.tutorial, 'TutorialTitle', '', 42, new Vec3(0, 178),
            new Color(245, 195, 35), 860, 66,
        );
        this.tutorialDescription = this.childLabel(
            this.tutorial, 'TutorialDescription', '', 28, new Vec3(0, 52),
            new Color(232, 239, 247), 820, 160,
        );
        this.tutorialFocus = this.childLabel(
            this.tutorial, 'TutorialFocus', '', 22, new Vec3(0, -73),
            new Color(121, 217, 255), 820, 50,
        );
        this.childButton(
            this.tutorial, 'SKIP', new Vec3(-190, -208), new Color(58, 72, 94),
            this.actions.skipTutorial, 260, 76,
        );
        const tutorialNextButton = this.childButton(
            this.tutorial, 'NEXT', new Vec3(190, -208), new Color(245, 195, 35),
            this.actions.nextTutorial, 260, 76,
        );
        const tutorialNextButtonLabel = tutorialNextButton.node.getComponentInChildren(Label);
        if (!tutorialNextButtonLabel) throw new Error('Tutorial next button label was not created.');
        this.tutorialNextButtonLabel = tutorialNextButtonLabel;
        this.tutorial.active = false;

        this.settings.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.settings);
        this.settings.setPosition(0, -20);
        this.settings.addComponent(UITransform).setContentSize(920, 610);
        this.drawPanel(this.settings, 920, 610, new Color(11, 17, 27, 255), new Color(245, 195, 35));
        this.childLabel(
            this.settings, 'SettingsKicker', 'MATCH PAUSED', 21, new Vec3(0, 255),
            new Color(30, 202, 255), 760, 42,
        );
        this.childLabel(
            this.settings, 'SettingsTitle', 'SETTINGS', 44, new Vec3(0, 198),
            new Color(245, 195, 35), 760, 62,
        );
        this.settingsMusic = this.childLabel(
            this.settings, 'MusicVolume', '', 27, new Vec3(0, 105),
            Color.WHITE, 460, 54,
        );
        this.childButton(
            this.settings, 'MUSIC -', new Vec3(-330, 105), new Color(58, 72, 94),
            () => this.actions.adjustMusicVolume(-0.1), 150, 62,
        );
        this.childButton(
            this.settings, 'MUSIC +', new Vec3(330, 105), new Color(45, 151, 199),
            () => this.actions.adjustMusicVolume(0.1), 150, 62,
        );
        this.settingsSound = this.childLabel(
            this.settings, 'SoundVolume', '', 27, new Vec3(0, 20),
            Color.WHITE, 460, 54,
        );
        this.childButton(
            this.settings, 'SFX -', new Vec3(-330, 20), new Color(58, 72, 94),
            () => this.actions.adjustSoundVolume(-0.1), 150, 62,
        );
        this.childButton(
            this.settings, 'SFX +', new Vec3(330, 20), new Color(45, 151, 199),
            () => this.actions.adjustSoundVolume(0.1), 150, 62,
        );
        this.childLabel(
            this.settings, 'CameraMotionTitle', 'CLASSIC CAMERA', 25, new Vec3(-205, -78),
            new Color(205, 217, 231), 330, 52,
        );
        const motionButton = this.childButton(
            this.settings, 'MOTION: NORMAL', new Vec3(205, -78), new Color(45, 151, 199),
            this.actions.toggleReducedCameraMotion, 330, 68,
        );
        const motionButtonLabel = motionButton.node.getComponentInChildren(Label);
        if (!motionButtonLabel) throw new Error('Camera motion button label was not created.');
        this.settingsMotionButtonLabel = motionButtonLabel;
        this.childLabel(
            this.settings, 'SettingsSaved', 'SETTINGS SAVED AUTOMATICALLY ON THIS DEVICE', 19,
            new Vec3(0, -145), new Color(121, 217, 255), 760, 42,
        );
        this.childButton(
            this.settings, 'LOBBY', new Vec3(-190, -238), new Color(58, 72, 94),
            this.actions.exitToLobby, 300, 78,
        );
        this.childButton(
            this.settings, 'RESUME', new Vec3(190, -238), new Color(245, 195, 35),
            this.actions.closeSettings, 300, 78,
        );
        this.settings.active = false;

        this.result.layer = Layers.Enum.UI_2D;
        this.safeRoot.addChild(this.result);
        this.result.setPosition(0, -10);
        this.result.addComponent(UITransform).setContentSize(1320, 900);
        this.drawPanel(this.result, 1320, 900, new Color(10, 14, 22, 255), new Color(245, 195, 35));
        this.resultTitle = this.childLabel(
            this.result, 'ResultTitle', '', 48, new Vec3(0, 378),
            new Color(245, 195, 35), 1120, 70,
        );
        this.resultSubtitle = this.childLabel(
            this.result, 'ResultSubtitle', '', 25, new Vec3(0, 324),
            new Color(121, 217, 255), 1080, 48,
        );
        const resultRowPositions = [238, 154, 70, -14];
        for (let index = 0; index < resultRowPositions.length; index++) {
            const row = this.uiNode(
                `ResultRow-${index}`,
                this.result,
                new Vec3(0, resultRowPositions[index] as number),
                1120,
                72,
            );
            this.drawPanel(row, 1120, 72, new Color(18, 25, 38, 255), new Color(47, 63, 82));
            this.resultRows.push(this.childLabel(
                row, 'ResultInfo', '', 21, Vec3.ZERO, Color.WHITE, 1060, 58,
            ));
        }
        const awardRail = this.uiNode('ClassicMatchLegacyAwardsRailV92', this.result, new Vec3(0, -104), 1140, 102);
        this.drawPanel(awardRail, 1140, 102, new Color(20, 43, 69, 255), new Color(102, 207, 255));
        const awardX = [-420, -140, 140, 420];
        for (let index = 0; index < awardX.length; index++) {
            const card = this.uiNode(`ClassicLegacyAwardCardV92-${index}`, awardRail, new Vec3(awardX[index] as number, 0), 250, 78);
            this.drawPanel(card, 250, 78, new Color(30, 76, 116, 255), new Color(245, 195, 35));
            this.resultAwardLabels.push(this.childLabel(card, 'AwardText', '', 14, Vec3.ZERO, Color.WHITE, 226, 66));
        }
        this.resultPerformance = this.childLabel(
            this.result, 'ClassicPerformanceGradeV92', '', 19, new Vec3(0, -176),
            new Color(121, 217, 255), 1100, 38,
        );
        const legacyRail = this.uiNode('ClassicSeasonArchiveRailV96', this.result, new Vec3(0, -220), 1120, 54);
        this.drawPanel(legacyRail, 1120, 54, new Color(35, 27, 64, 255), new Color(181, 119, 255));
        this.resultLegacy = this.childLabel(
            legacyRail, 'ClassicSeasonArchiveTextV96', '', 16, Vec3.ZERO,
            new Color(238, 224, 255), 1080, 42,
        );
        this.resultReward = this.childLabel(
            this.result, 'ResultReward', '', 18, new Vec3(0, -272),
            new Color(245, 195, 35), 1120, 70,
        );
        this.resultFooter = this.childLabel(
            this.result, 'ResultFooter', '', 15, new Vec3(0, -326),
            new Color(188, 199, 216), 1080, 32,
        );
        this.childButton(
            this.result, 'LOBBY', new Vec3(-205, -392), new Color(58, 72, 94),
            this.actions.exitToLobby, 330, 82,
        );
        this.childButton(
            this.result, 'PLAY AGAIN', new Vec3(205, -392), new Color(245, 195, 35),
            this.actions.restart, 330, 82,
        );
        this.result.active = false;
    }

    public render(
        model: MatchModel,
        message: string,
        tutorial?: TutorialSnapshot,
        settings?: SettingsSnapshot,
    ): void {
        this.currentModel = model;
        this.lastMessage = message;
        if (message.trim().length > 0 && this.messageHistory[0] !== message) {
            this.messageHistory.unshift(message);
            this.messageHistory.splice(3);
        }
        if (tutorial) this.currentTutorial = tutorial;
        if (settings) this.currentSettings = settings;
        const tutorialOpen = this.currentTutorial?.active ?? false;
        const settingsOpen = this.currentSettings?.active ?? false;
        const player = model.currentPlayer;
        const winningTeam = model.finished ? model.winningTeamId() : undefined;
        const victoryLabel = model.victoryLabel();
        this.status.string = model.finished
            ? winningTeam
                ? `WINNER  •  TEAM ${winningTeam}${victoryLabel ? `  •  ${victoryLabel}` : ''}  •  ${message}`
                : `WINNER  •  ${model.winner().name}${victoryLabel ? `  •  ${victoryLabel}` : ''}  •  ${message}`
            : `TURN  •  ${player.teamId ? `TEAM ${player.teamId}  •  ` : ''}${player.name}  •  ${message}`;
        const activeEvent = model.lastRoundEvent ? `  •  EVENT ${model.lastRoundEvent.title}` : '';
        const activePlayers = model.players.filter((entry) => !entry.bankrupt).length;
        const teamStatus = model.matchMode === 'TEAM'
            ? `  •  BLUE ${model.players.filter((entry) => entry.teamId === 'BLUE' && !entry.bankrupt).length}/2  GOLD ${model.players.filter((entry) => entry.teamId === 'GOLD' && !entry.bankrupt).length}/2`
            : '';
        this.roundInfo.string = `ROUND ${model.round} / 12  •  ${activePlayers} ACTIVE PLAYERS${teamStatus}${activeEvent}`;
        this.matchModeRail.string = `${model.matchMode} MATCH  •  ${activePlayers} ACTIVE  •  ROUND ${model.round}`;
        const threatEntries = model.players
            .filter((entry) => !entry.bankrupt)
            .map((entry) => {
                const progress = model.classicVictoryProgressFor(entry.id);
                const triple = progress.completeColorGroups / Math.max(1, progress.requiredColorGroups);
                const line = progress.bestLineOwned / Math.max(1, progress.bestLineRequired);
                const tourism = progress.tourismOwned / Math.max(1, progress.tourismRequired);
                const score = Math.max(triple, line, tourism);
                const goal = progress.nearestGoal.replace(/_/g, ' ');
                return { name: entry.name, score, goal };
            })
            .sort((a, b) => b.score - a.score);
        const liveThreat = threatEntries[0];
        this.threatRail.string = liveThreat
            ? `${liveThreat.name.toUpperCase()}  •  ${liveThreat.goal}  ${Math.round(liveThreat.score * 100)}%`
            : 'LIVE MONOPOLY SCAN  •  CLEAR';
        this.turnOrderRail.string = `TURN ORDER  •  ${model.players.map((entry, index) => {
            const marker = model.currentPlayerIndex === index && !model.finished ? '◆' : entry.bankrupt ? '×' : '•';
            return `${marker} ${entry.name.toUpperCase()}`;
        }).join('  ›  ')}`;
        const activeTile = model.board[player.tileIndex];
        const activeProperty = model.propertyAt(player.tileIndex);
        const activeOwner = model.ownerOf(player.tileIndex);
        const activeMonopoly = model.colorMonopolyStatusAt(player.tileIndex);
        const activeEconomy = model.propertyEconomyAt(player.tileIndex);
        const cityIntelValue = activeTile
            ? activeProperty && activeEconomy
                ? `OWNER ${activeOwner?.name.toUpperCase() ?? 'UNKNOWN'}  •  LEVEL ${activeProperty.buildingLevel}  •  RENT CP ${activeEconomy.currentRent.toLocaleString('en-US')}  •  THREAT ${activeEconomy.rentThreat}${activeEconomy.nextCost > 0 ? `  •  NEXT CP ${activeEconomy.nextCost.toLocaleString('en-US')} -> RENT CP ${activeEconomy.nextRent.toLocaleString('en-US')}` : '  •  MAX LANDMARK'}`
                : activeTile.purchasePrice > 0
                    ? `OPEN PROPERTY  •  BUY CP ${activeTile.purchasePrice.toLocaleString('en-US')}  •  BASE RENT CP ${activeTile.baseRent.toLocaleString('en-US')}`
                    : `${activeTile.tileType.toUpperCase()}  •  SPECIAL EVENT TILE`
            : 'BOARD DATA UNAVAILABLE';
        this.cityIntelRail.string = `CITY INTEL  •  ${activeTile?.displayName.toUpperCase() ?? 'UNKNOWN TILE'}  •  ${cityIntelValue}`;
        const completedMonopolies = model.completedColorMonopolyGroups();
        this.colorMonopolyRail.string = activeMonopoly?.completed
            ? `COLOR MONOPOLY ACTIVE  •  ${activeMonopoly.groupId.toUpperCase()}  •  x${activeMonopoly.rentMultiplier} RENT  •  ${activeMonopoly.owned}/${activeMonopoly.required} CITIES`
            : activeMonopoly && activeMonopoly.required > 0
                ? `COLOR SET PROGRESS  •  ${activeMonopoly.groupId.toUpperCase()}  •  ${activeMonopoly.owned}/${activeMonopoly.required} CITIES  •  COMPLETE SET = x2 RENT`
                : completedMonopolies.length > 0
                    ? `ACTIVE COLOR MONOPOLIES  •  ${completedMonopolies.map((group) => group.groupId.toUpperCase()).join('  /  ')}  •  x2 RENT`
                    : 'COLOR MONOPOLY  •  COMPLETE A CITY SET TO UNLOCK x2 RENT';
        this.dice.string = model.lastDice.first > 0
            ? `DICE  ${model.lastDice.first} + ${model.lastDice.second}  =  ${model.lastDice.first + model.lastDice.second}`
            : 'ROLL TO BEGIN';
        this.diceControlStatus.string = `CONTROL  ${this.diceControlRange} • ${this.diceControlParity}  |  ${this.diceRangeText(this.diceControlRange)}`;
        this.refreshDiceControlVisuals();
        this.phaseRibbon.string = model.finished
            ? 'RESULT PHASE  •  FINAL ASSET AND MONOPOLY CHECK'
            : model.hasPendingPaymentDecision
                ? 'PAYMENT PHASE  •  RENT, TAKEOVER, OR BANKRUPTCY'
                : model.hasPendingPropertyDecision
                    ? 'PROPERTY PHASE  •  BUY, BUILD, OR SAVE CASH'
                    : model.hasPendingWorldTravelDecision
                        ? 'WORLD TRAVEL PHASE  •  CHOOSE A STRATEGIC DESTINATION'
                        : model.hasPendingOlympicDecision
                            ? 'OLYMPIC PHASE  •  SELECT A HOST CITY'
                            : model.hasPendingGameCenterDecision
                                ? 'GAME CENTER PHASE  •  LOCK YOUR SIGNAL'
                                : model.hasPendingFortuneCard
                                    ? 'FORTUNE PHASE  •  RESOLVING CARD EFFECT'
                                    : this.busy
                                        ? 'ACTION PHASE  •  DICE, MOVEMENT, AND TILE RESOLUTION'
                                        : 'ROLL PHASE  •  CHECK CASH, RANGE, AND MONOPOLY THREATS';
        this.systemTicker.string = `SYSTEM  •  ${this.messageHistory.join('   |   ') || 'Match ready.'}`;
        const hasBlockingDecision = model.hasPendingPropertyDecision
            || model.hasPendingPaymentDecision
            || model.hasPendingWorldTravelDecision
            || model.hasPendingOlympicDecision
            || model.hasPendingGameCenterDecision
            || model.hasPendingFortuneCard
            || tutorialOpen
            || settingsOpen
            || model.finished;
        this.advancedHudPanel.active = this.advancedHudOpen && !hasBlockingDecision;
        this.advancedHudButtonLabel.string = this.advancedHudPanel.active ? 'CLOSE' : 'INFO';

        const liveRanking = model.resultSummary().entries;
        const richestCash = Math.max(1, ...model.players.map((entry) => entry.money));
        model.players.forEach((entry, index) => {
            const label = this.panels[index];
            if (!label) return;
            const card = this.playerCards[index];
            const turnIndicator = this.playerTurnIndicators[index];
            const reserveBar = this.playerReserveBars[index];
            if (reserveBar) {
                const reserveRatio = entry.bankrupt ? 0.02 : Math.max(0.06, Math.min(1, entry.money / richestCash));
                reserveBar.setScale(reserveRatio, 1, 1);
            }
            const isCurrent = model.currentPlayerIndex === index && !model.finished;
            card?.setScale(isCurrent ? 1.035 : 1, isCurrent ? 1.035 : 1, 1);
            if (turnIndicator) {
                turnIndicator.string = entry.bankrupt ? 'OUT' : isCurrent ? 'TURN' : entry.bot ? 'CPU' : 'WAIT';
                turnIndicator.color = animeTextColor(entry.bankrupt
                    ? new Color(178, 103, 94)
                    : isCurrent
                        ? new Color(255, 226, 122)
                        : new Color(206, 194, 169));
            }
            const active = model.currentPlayerIndex === index ? '>> ' : '';
            const status = entry.bankrupt
                ? '  |  BANKRUPT'
                : entry.islandTurns > 0 ? `  |  ISLAND ${entry.islandTurns}` : '';
            const shieldCharges = entry.properties.reduce(
                (total, tileIndex) => total + (model.propertyAt(tileIndex)?.protectionCharges ?? 0),
                0,
            );
            const effects = [
                entry.rentDiscountCharges > 0 ? `RENT -${entry.rentDiscountPercent}% x${entry.rentDiscountCharges}` : '',
                entry.freeUpgradeCredits > 0 ? `BUILD FREE x${entry.freeUpgradeCredits}` : '',
                entry.freeWorldTravelCredits > 0 ? `TRAVEL x${entry.freeWorldTravelCredits}` : '',
                shieldCharges > 0 ? `SHIELD x${shieldCharges}` : '',
            ].filter((value) => value.length > 0);
            label.color = animeTextColor(Color.fromHEX(new Color(), entry.color));
            const team = entry.teamId ? `  |  TEAM ${entry.teamId}` : '';
            const standing = liveRanking.find((result) => result.playerId === entry.id);
            const rank = standing?.rank ?? index + 1;
            const asset = standing?.netWorth ?? entry.money;
            const victoryProgress = model.classicVictoryProgressFor(entry.id);
            label.string = `${active}${entry.name}${team}${status}\n#${rank}  ASSET ${asset.toLocaleString('en-US')}\nCASH ${entry.money.toLocaleString('en-US')}  •  C${entry.properties.length}  •  B${model.buildingCount(entry.id)}\n${victoryProgress.summary}`;
        });

        this.rollButton.interactable = !this.busy
            && !tutorialOpen
            && !settingsOpen
            && !model.finished
            && !player.bot
            && !model.hasPendingPropertyDecision
            && !model.hasPendingFortuneCard
            && !model.hasPendingWorldTravelDecision
            && !model.hasPendingOlympicDecision
            && !model.hasPendingGameCenterDecision
            && !model.hasPendingPaymentDecision;
        this.rollButton.node.active = this.rollButton.interactable;
        for (const button of [...this.diceParityButtons, ...this.diceRangeButtons]) {
            button.interactable = this.rollButton.interactable;
        }
        this.skillButton.interactable = this.activeSkillReady && this.rollButton.interactable;
        this.skillButtonLabel.string = this.activeSkillReady ? this.activeSkillName : 'SKILL USED';
        this.skillStatus.string = this.activeSkillReady ? this.activeSkillDetail : 'ONE USE PER MATCH';
        this.guideButton.interactable = !this.busy
            && !tutorialOpen
            && !settingsOpen
            && !model.finished
            && !player.bot
            && !model.hasPendingPropertyDecision
            && !model.hasPendingFortuneCard
            && !model.hasPendingWorldTravelDecision
            && !model.hasPendingOlympicDecision
            && !model.hasPendingGameCenterDecision
            && !model.hasPendingPaymentDecision;
        this.settingsButton.interactable = !this.busy
            && !tutorialOpen
            && !settingsOpen
            && !model.finished
            && !player.bot
            && !model.hasPendingPropertyDecision
            && !model.hasPendingFortuneCard
            && !model.hasPendingWorldTravelDecision
            && !model.hasPendingOlympicDecision
            && !model.hasPendingGameCenterDecision
            && !model.hasPendingPaymentDecision;
        const propertyDecision = model.pendingPropertyDecision;
        this.decision.active = propertyDecision !== null
            && !player.bot
            && !model.hasPendingFortuneCard
            && !model.hasPendingWorldTravelDecision
            && !model.hasPendingOlympicDecision
            && !model.hasPendingGameCenterDecision
            && !model.hasPendingPaymentDecision;
        if (propertyDecision) {
            const tile = model.board[propertyDecision.tileIndex];
            const action = propertyDecision.kind === 'PURCHASE' ? 'BUY + DEVELOP' : 'MULTI-UPGRADE';
            const victoryProgress = model.classicVictoryProgressFor(player.id);
            const strategicLabel = tile?.tileType === TileType.Tourist
                ? `TOURISM COLLECTION  ${victoryProgress.tourismOwned}/${victoryProgress.tourismRequired}`
                : tile?.colorGroup.startsWith('group-')
                    ? `COLOR SET  ${tile.colorGroup.replace('group-', '').toUpperCase()}`
                    : 'STRATEGIC PROPERTY';
            const options = model.propertyDevelopmentOptions();
            this.decisionLabel.string = tile
                ? `${tile.displayName.toUpperCase()}  |  ${action}\n${strategicLabel}  •  CASH CP ${player.money.toLocaleString('en-US')}\nCHOOSE A PACKAGE: projected rent, payback, and reserve risk are shown below.`
                : this.lastMessage;
            this.propertyOptionButtons.forEach((button, index) => {
                const option = options[index];
                const label = this.propertyOptionLabels[index];
                this.propertyOptionTargets[index] = option?.targetLevel ?? null;
                button.node.active = option !== undefined;
                button.interactable = Boolean(option?.affordable) && !this.busy;
                if (!option || !label) return;
                const monopoly = option.completesColorMonopoly ? '\nSET COMPLETE x2' : '';
                label.string = `${option.label}\nCP ${option.cost.toLocaleString('en-US')}  •  RENT ${option.projectedRent.toLocaleString('en-US')}\n${option.reserveRisk}  •  ${option.paybackLandings} HIT PAYBACK${monopoly}`;
            });
        }

        const paymentDecision = model.pendingPaymentDecision;
        this.payment.active = paymentDecision !== null && !player.bot;
        if (paymentDecision) {
            const tile = model.board[paymentDecision.tileIndex];
            this.paymentTitle.string = `PAYMENT  |  ${tile?.displayName ?? 'UNKNOWN CITY'}`;
            const monopolyRent = paymentDecision.colorMonopolyMultiplier > 1
                ? `  |  COLOR MONOPOLY x${paymentDecision.colorMonopolyMultiplier}`
                : '';
            const paymentEconomy = model.propertyEconomyAt(paymentDecision.tileIndex);
            const liquidation = paymentDecision.liquidation;
            const liquidationLine = liquidation.records.length > 0
                ? `
AUTO-LIQUIDATION CP ${liquidation.recovered.toLocaleString('en-US')}  |  ${liquidation.records.length} ASSET ACTION${liquidation.records.length === 1 ? '' : 'S'}  |  ${liquidation.survived ? 'RESCUED' : 'INSOLVENT'}`
                : '';
            const unpaidLine = paymentDecision.unpaid > 0
                ? `
UNPAID CP ${paymentDecision.unpaid.toLocaleString('en-US')}  |  BANKRUPTCY CONFIRMED`
                : '';
            const takeover = paymentDecision.takeoverStrategy;
            const groupForecast = takeover.groupRequired > 0
                ? `BUYER SET ${takeover.buyerGroupOwnedBefore}/${takeover.groupRequired} -> ${takeover.buyerGroupOwnedAfter}/${takeover.groupRequired}  |  RIVAL ${takeover.sellerGroupOwnedBefore}/${takeover.groupRequired} -> ${takeover.sellerGroupOwnedAfter}/${takeover.groupRequired}`
                : 'SPECIAL PROPERTY CONTROL';
            const takeoverTags = takeover.tags.join('  •  ');
            this.paymentDetails.string = `RENT CP ${paymentDecision.paid.toLocaleString('en-US')} / ${paymentDecision.rent.toLocaleString('en-US')}  ->  ${paymentDecision.ownerName}${monopolyRent}
PROPERTY VALUE CP ${paymentDecision.propertyValue.toLocaleString('en-US')}  |  RENT THREAT ${paymentEconomy?.rentThreat ?? 'LOW'}  |  CASH BEFORE CP ${paymentDecision.cashBefore.toLocaleString('en-US')}  |  BALANCE CP ${player.money.toLocaleString('en-US')}
TAKEOVER SCORE ${takeover.strategicScore}/100  |  PROJECTED RENT CP ${takeover.projectedRent.toLocaleString('en-US')}  |  RESERVE CP ${takeover.reserveAfter.toLocaleString('en-US')} (${takeover.reserveRisk})
${groupForecast}  |  ${takeoverTags}${liquidationLine}${unpaidLine}`;
            this.paymentStatus.string = paymentDecision.unpaid > 0
                ? 'BANKRUPTCY  |  ALL LIQUIDATABLE ASSETS WERE SOLD'
                : paymentDecision.takeoverAvailable
                    ? `STRATEGIC TAKEOVER READY  |  SCORE ${takeover.strategicScore}/100  |  COST CP ${paymentDecision.takeoverCost.toLocaleString('en-US')}`
                    : liquidation.records.length > 0
                        ? 'PAYMENT RESCUED  |  ASSET LIQUIDATION COMPLETED'
                        : this.paymentBlockMessage(paymentDecision);
            this.paymentTakeoverButton.interactable = paymentDecision.takeoverAvailable && !this.busy;
            this.paymentTakeoverButtonLabel.string = paymentDecision.takeoverAvailable
                ? `TAKEOVER  CP ${paymentDecision.takeoverCost.toLocaleString('en-US')}  •  ${takeover.reserveRisk}`
                : 'TAKEOVER LOCKED';
            this.paymentContinueButton.interactable = !this.busy;
        }

        const travelDecision = model.pendingWorldTravelDecision;
        if (travelDecision !== this.activeTravelDecision) {
            this.activeTravelDecision = travelDecision;
            this.travelPage = 0;
        }
        this.travel.active = travelDecision !== null
            && !player.bot
            && !model.hasPendingOlympicDecision
            && !model.hasPendingGameCenterDecision
            && !model.hasPendingPaymentDecision;
        if (travelDecision) {
            const destinations = model.worldTravelDestinations();
            const pageSize = this.travelButtons.length;
            const pageCount = Math.max(1, Math.ceil(destinations.length / pageSize));
            this.travelPage = Math.max(0, Math.min(this.travelPage, pageCount - 1));
            this.travelTitle.string = travelDecision.usesFreeTicket
                ? 'WORLD TRAVEL  |  FREE TICKET  |  CHOOSE A DESTINATION'
                : `WORLD TRAVEL  |  COST CP ${travelDecision.cost.toLocaleString('en-US')}  |  CHOOSE A DESTINATION`;
            this.travelPageLabel.string = `PAGE ${this.travelPage + 1} / ${pageCount}`;
            this.travelPreviousButton.interactable = !this.busy && this.travelPage > 0;
            this.travelNextButton.interactable = !this.busy && this.travelPage < pageCount - 1;
            for (let slot = 0; slot < pageSize; slot++) {
                const destinationOffset = this.travelPage * pageSize + slot;
                const destination = destinations[destinationOffset];
                const tileIndex = destination?.tileIndex;
                const button = this.travelButtons[slot] as Button;
                button.node.active = tileIndex !== undefined;
                if (tileIndex === undefined) continue;
                button.interactable = !this.busy;
                const tile = model.board[tileIndex];
                const owner = model.ownerOf(tileIndex);
                const detail = !owner
                    ? `${destination?.strategicTag ?? 'OPEN_PROPERTY'}  •  BUY CP ${tile?.purchasePrice.toLocaleString('en-US') ?? '0'}`
                    : owner.id === player.id
                        ? `OWN CITY  •  LEVEL ${destination?.buildingLevel ?? 0}`
                        : this.currentModel?.areTeammates(player.id, owner.id)
                            ? `TEAM SAFE  •  ${owner.name}`
                            : `RIVAL TOLL  •  RENT CP ${destination?.rent.toLocaleString('en-US') ?? '0'}`;
                const forecast = destination
                    ? `${destination.reserveRisk} RESERVE CP ${destination.reserveAfter.toLocaleString('en-US')}\n${destination.victoryProgress}`
                    : '';
                (this.travelButtonLabels[slot] as Label).string = `${tile?.displayName ?? 'Unknown'}\n${detail}\n${forecast}`;
            }
        }

        const olympicDecision = model.pendingOlympicDecision;
        if (olympicDecision !== this.activeOlympicDecision) {
            this.activeOlympicDecision = olympicDecision;
            this.olympicPage = 0;
        }
        this.olympic.active = olympicDecision !== null
            && !player.bot
            && !model.hasPendingGameCenterDecision
            && !model.hasPendingPaymentDecision;
        if (olympicDecision) {
            const pageSize = this.olympicButtons.length;
            const pageCount = Math.max(1, Math.ceil(olympicDecision.propertyIndices.length / pageSize));
            this.olympicPage = Math.max(0, Math.min(this.olympicPage, pageCount - 1));
            this.olympicTitle.string = `OLYMPIC HOST  |  RENT +${olympicDecision.multiplierStep}x  |  CHOOSE A CITY`;
            this.olympicPageLabel.string = `PAGE ${this.olympicPage + 1} / ${pageCount}`;
            this.olympicPreviousButton.interactable = !this.busy && this.olympicPage > 0;
            this.olympicNextButton.interactable = !this.busy && this.olympicPage < pageCount - 1;
            const destinations = model.olympicDestinations();
            for (let slot = 0; slot < pageSize; slot++) {
                const destinationOffset = this.olympicPage * pageSize + slot;
                const tileIndex = olympicDecision.propertyIndices[destinationOffset];
                const button = this.olympicButtons[slot] as Button;
                button.node.active = tileIndex !== undefined;
                if (tileIndex === undefined) continue;
                button.interactable = !this.busy;
                const tile = model.board[tileIndex];
                const destination = destinations.find((entry) => entry.tileIndex === tileIndex);
                (this.olympicButtonLabels[slot] as Label).string = destination
                    ? `${tile?.displayName ?? 'Unknown'}\nRENT CP ${destination.currentRent.toLocaleString('en-US')} -> ${destination.projectedRent.toLocaleString('en-US')}\n+${destination.gainPercent}%  •  ${destination.threat} THREAT  •  x${destination.projectedMultiplier}`
                    : 'Unknown';
            }
        }

        const gameCenterDecision = model.pendingGameCenterDecision;
        this.gameCenter.active = gameCenterDecision !== null && !player.bot && !model.hasPendingPaymentDecision;
        if (gameCenterDecision) {
            this.gameCenterTitle.string = `GAME CENTER  |  ${gameCenterDecision.title.toUpperCase()}`;
            this.gameCenterPrompt.string = `${gameCenterDecision.prompt}\nRESERVE FLOOR CP ${gameCenterDecision.reserveFloor.toLocaleString('en-US')}`;
            for (let slot = 0; slot < this.gameCenterButtons.length; slot++) {
                const lane = gameCenterDecision.lanes[slot];
                const button = this.gameCenterButtons[slot] as Button;
                button.node.active = lane !== undefined;
                if (!lane) continue;
                button.interactable = !this.busy && lane.affordable;
                (this.gameCenterButtonLabels[slot] as Label).string = `${lane.signal}  ${lane.title}\nENTRY CP ${lane.entryCost.toLocaleString('en-US')}\nWIN CP ${lane.winReward.toLocaleString('en-US')}\n${lane.affordable ? lane.risk : 'LOCKED'}`;
            }
        }

        const fortune = model.pendingFortuneCard;
        const fortuneChoices = model.fortuneChoiceCards;
        this.fortune.active = fortune !== null || fortuneChoices.length > 0;
        this.fortuneStatusRail.string = `FORTUNE  •  SHIELD ${player.rentDiscountPercent}% x${player.rentDiscountCharges}  •  BUILD ${player.freeUpgradeCredits}  •  TRAVEL ${player.freeWorldTravelCredits}`;
        const liquidationDecision = model.pendingPaymentDecision?.liquidation;
        this.liquidationStatusRail.string = liquidationDecision && liquidationDecision.records.length > 0
            ? `RESCUE ECONOMY  •  RECOVERED CP ${liquidationDecision.recovered.toLocaleString('en-US')}  •  ${liquidationDecision.records.length} ASSET ACTION${liquidationDecision.records.length === 1 ? '' : 'S'}  •  ${liquidationDecision.survived ? 'PAYMENT SAVED' : 'BANKRUPTCY'}`
            : 'RESCUE ECONOMY  •  AUTOMATIC ASSET LIQUIDATION READY  •  BUILDINGS 70%  •  LAND 60%';
        this.specialDistrictRail.string = model.hasPendingWorldTravelDecision
            ? `SPECIAL DISTRICT  •  WORLD TRAVEL OPEN  •  ${model.worldTravelDestinations().length} DESTINATIONS`
            : model.hasPendingOlympicDecision
                ? `SPECIAL DISTRICT  •  OLYMPIC HOST SELECTION  •  ${model.olympicDestinations().length} CITIES`
                : model.hasPendingGameCenterDecision
                    ? 'SPECIAL DISTRICT  •  GAME CENTER RISK LANES OPEN'
                    : player.islandTurns > 0
                        ? `SPECIAL DISTRICT  •  ISLAND LOCK  •  ${player.islandTurns} TURN${player.islandTurns === 1 ? '' : 'S'} REMAINING`
                        : `SPECIAL DISTRICT  •  TRAVEL ${player.freeWorldTravelCredits}  •  OLYMPIC READY  •  GAME CENTER READY`;
        if (fortuneChoices.length > 0) {
            this.fortunePrompt.string = player.bot
                ? 'FORTUNE SIGNAL  •  CPU ANALYSING THREE CARDS'
                : 'FORTUNE SIGNAL  •  CHOOSE ONE OF THREE CARDS';
            this.fortuneRarity.string = 'CARD SELECTION';
            this.fortuneRarity.color = animeTextColor(new Color(181, 119, 255));
            this.fortuneTitle.string = 'READ THE EFFECT BEFORE YOU COMMIT';
            this.fortuneDescription.string = 'Economy, movement, defense, property, attack, and travel cards can change the match immediately.';
            for (let slot = 0; slot < this.fortuneChoiceButtons.length; slot++) {
                const card = fortuneChoices[slot];
                const button = this.fortuneChoiceButtons[slot] as Button;
                button.node.active = card !== undefined;
                this.fortuneChoiceIds[slot] = card?.id ?? null;
                if (!card) continue;
                button.interactable = !this.busy && !player.bot;
                (this.fortuneChoiceLabels[slot] as Label).string = `${card.rarity}
${card.title.toUpperCase()}

${fortuneCardCategory(card)}
${fortuneEffectPreview(card)}`;
            }
        } else if (fortune) {
            this.fortunePrompt.string = 'FORTUNE SIGNAL  •  CARD REVEALED';
            this.fortuneRarity.string = `${fortune.rarity}  •  ${fortuneCardCategory(fortune)}`;
            this.fortuneRarity.color = animeTextColor(this.rarityColor(fortune.rarity));
            this.fortuneTitle.string = fortune.title;
            this.fortuneDescription.string = `${fortune.description}

${fortuneEffectPreview(fortune)}`;
            this.fortuneChoiceButtons.forEach((button) => { button.node.active = false; });
            this.fortuneChoiceIds.fill(null);
        } else {
            this.fortuneChoiceButtons.forEach((button) => { button.node.active = false; });
            this.fortuneChoiceIds.fill(null);
        }

        this.renderTutorial(model);
        this.renderSettings(model);
        this.renderResult(model);
    }

    public setSkillState(name: string, ready: boolean, detail: string): void {
        this.activeSkillName = name.trim() || 'ACTIVE SKILL';
        this.activeSkillReady = ready;
        this.activeSkillDetail = detail.trim();
        this.skillButtonLabel.string = ready ? this.activeSkillName : 'SKILL USED';
        this.skillStatus.string = ready ? this.activeSkillDetail : 'ONE USE PER MATCH';
        if (!ready) this.skillButton.interactable = false;
    }

    public setBusy(busy: boolean, model: MatchModel): void {
        this.busy = busy;
        this.render(model, this.lastMessage);
    }

    public setTimer(seconds: number): void {
        this.timer.string = `${seconds}`;
        this.timer.color = animeTextColor(seconds <= 5 ? new Color(255, 91, 91) : new Color(30, 202, 255));
    }

    public showMatchIntro(kicker: string, value: string, detail: string): void {
        this.matchIntroKicker.string = kicker;
        this.matchIntroValue.string = value;
        this.matchIntroDetail.string = detail;
        this.matchIntro.active = true;
        Tween.stopAllByTarget(this.matchIntroValue.node);
        this.matchIntroValue.node.setScale(0.68, 0.68, 0.68);
        tween(this.matchIntroValue.node)
            .to(0.2, { scale: new Vec3(1.12, 1.12, 1.12) }, { easing: 'backOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
            .start();
    }

    public hideMatchIntro(): void {
        Tween.stopAllByTarget(this.matchIntroValue.node);
        this.matchIntro.active = false;
    }

    public showTurnBanner(playerName: string, colorHex: string, subtitle: string): void {
        this.turnBannerToken++;
        const token = this.turnBannerToken;
        this.turnBannerTitle.string = `${playerName.toUpperCase()}'S TURN`;
        this.turnBannerTitle.color = animeTextColor(Color.fromHEX(new Color(), colorHex));
        this.turnBannerSubtitle.string = subtitle;
        Tween.stopAllByTarget(this.turnBanner);
        this.turnBanner.setPosition(0, 386);
        this.turnBanner.setScale(0.9, 0.9, 0.9);
        this.turnBanner.active = true;
        tween(this.turnBanner)
            .to(0.28, { position: new Vec3(0, 338), scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
        setTimeout(() => {
            if (token !== this.turnBannerToken || !this.turnBanner.isValid) return;
            tween(this.turnBanner)
                .to(0.18, { position: new Vec3(0, 370), scale: new Vec3(0.94, 0.94, 0.94) }, { easing: 'quadIn' })
                .call(() => {
                    if (token === this.turnBannerToken && this.turnBanner.isValid) this.turnBanner.active = false;
                })
                .start();
        }, 920);
    }

    public showDiceReveal(
        playerName: string,
        first: number,
        second: number,
        isDouble: boolean,
    ): void {
        this.diceRevealToken++;
        const token = this.diceRevealToken;
        const total = first + second;
        this.diceRevealTitle.string = `${total}`;
        this.diceRevealTitle.color = animeTextColor(isDouble
            ? new Color(255, 226, 122)
            : total >= 10
                ? new Color(255, 151, 70)
                : new Color(121, 217, 255));
        this.diceRevealSubtitle.string = isDouble
            ? `${first} + ${second}  •  DOUBLE  •  EXTRA TURN`
            : total >= 10
                ? `${first} + ${second}  •  ${playerName.toUpperCase()} POWER ROLL`
                : `${first} + ${second}  •  ${playerName.toUpperCase()} MOVES ${total}`;
        Tween.stopAllByTarget(this.diceReveal);
        this.diceReveal.setPosition(0, 145);
        this.diceReveal.setScale(0.62, 0.62, 0.62);
        this.diceReveal.active = true;
        tween(this.diceReveal)
            .to(0.24, { position: new Vec3(0, 185), scale: new Vec3(1.08, 1.08, 1.08) }, { easing: 'backOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
            .start();
        setTimeout(() => {
            if (token !== this.diceRevealToken || !this.diceReveal.isValid) return;
            tween(this.diceReveal)
                .to(0.18, { position: new Vec3(0, 225), scale: new Vec3(0.88, 0.88, 0.88) }, { easing: 'quadIn' })
                .call(() => {
                    if (token === this.diceRevealToken && this.diceReveal.isValid) this.diceReveal.active = false;
                })
                .start();
        }, 1_050);
    }

    public showLandingCard(
        playerName: string,
        tileName: string,
        tileType: TileType,
        message: string,
        colorHex: string,
    ): void {
        this.landingCardToken++;
        const token = this.landingCardToken;
        const typeLabel = tileType.replace(/_/g, ' ');
        this.landingCardKicker.string = `${playerName.toUpperCase()} ARRIVED`;
        this.landingCardTitle.string = tileName.toUpperCase();
        this.landingCardType.string = typeLabel;
        this.landingCardType.color = animeTextColor(Color.fromHEX(new Color(), colorHex));
        this.landingCardMessage.string = message;
        Tween.stopAllByTarget(this.landingCard);
        this.landingCard.setPosition(0, 195);
        this.landingCard.setScale(0.72, 0.72, 0.72);
        this.landingCard.active = true;
        tween(this.landingCard)
            .to(0.24, { position: new Vec3(0, 255), scale: new Vec3(1.04, 1.04, 1.04) }, { easing: 'backOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
            .start();
        setTimeout(() => {
            if (token !== this.landingCardToken || !this.landingCard.isValid) return;
            tween(this.landingCard)
                .to(0.2, { position: new Vec3(0, 298), scale: new Vec3(0.88, 0.88, 0.88) }, { easing: 'quadIn' })
                .call(() => {
                    if (token === this.landingCardToken && this.landingCard.isValid) this.landingCard.active = false;
                })
                .start();
        }, 1_650);
    }

    public setLiveAcademyObjective(objective: Readonly<LiveAcademyObjectiveState>): void {
        this.liveAcademyObjective = { ...objective };
        this.liveAcademyRail.string = objective.completed
            ? `LIVE ACADEMY  •  ${objective.title}  •  COMPLETE  •  REWARD READY`
            : `LIVE ACADEMY  •  ${objective.title}  •  ${objective.progressLabel}  •  ${objective.description}`;
        this.liveAcademyRail.color = animeTextColor(objective.completed
            ? new Color(255, 226, 122)
            : new Color(211, 242, 255));
    }

    public setLiveAcademyResult(
        objective: Readonly<LiveAcademyObjectiveState>,
        rewardCredits: number,
        streak: number,
        persisted: boolean,
    ): void {
        this.liveAcademyResultText = persisted
            ? objective.completed
                ? `LIVE ACADEMY  •  ${objective.title} COMPLETE  •  STREAK ${streak}  •  +CP ${rewardCredits.toLocaleString('en-US')}`
                : `LIVE ACADEMY  •  ${objective.title} INCOMPLETE  •  STREAK RESET`
            : 'LIVE ACADEMY  •  OBJECTIVE RESULT COULD NOT BE SAVED';
    }

    public prepareResultPresentation(): void {
        this.resultPresentationReady = true;
    }

    public setCareerReward(reward: CareerMatchReward): void {
        this.careerReward = reward;
    }

    public setRankedReward(reward: RankedMatchReward): void {
        this.rankedReward = reward;
    }

    public showGameCenterResult(result: Readonly<GameCenterResult>): void {
        this.gameCenterResult.active = true;
        this.gameCenterResultTitle.string = result.won ? 'SIGNAL MATCH!' : 'SIGNAL MISSED';
        this.gameCenterResultTitle.color = animeTextColor(result.won
            ? new Color(245, 195, 35)
            : new Color(30, 202, 255));
        this.gameCenterResultNumbers.string = `${result.laneTitle}  |  PICK ${result.selectedNumber}  |  TARGET ${result.targetNumber}`;
        this.gameCenterResultReward.string = result.won
            ? `GROSS +CP ${result.grossReward.toLocaleString('en-US')}  •  ENTRY -CP ${result.entryCost.toLocaleString('en-US')}  •  NET +CP ${result.netChange.toLocaleString('en-US')}`
            : `ENTRY -CP ${result.entryCost.toLocaleString('en-US')}  •  NET -CP ${Math.abs(result.netChange).toLocaleString('en-US')}`;
    }

    public clearGameCenterResult(): void {
        this.gameCenterResult.active = false;
    }

    public destroy(): void {
        this.turnBannerToken++;
        this.diceRevealToken++;
        this.landingCardToken++;
        Tween.stopAllByTarget(this.matchIntroValue.node);
        Tween.stopAllByTarget(this.turnBanner);
        Tween.stopAllByTarget(this.diceReveal);
        Tween.stopAllByTarget(this.landingCard);
        if (this.root.isValid) this.root.destroy();
    }

    private panel(name: string, position: Vec3, width: number, height: number): Node {
        const node = this.uiNode(name, this.safeRoot, position, width, height);
        this.drawPanel(node, width, height, new Color(53, 40, 38, 238), new Color(164, 121, 65));
        return node;
    }

    private label(
        name: string,
        text: string,
        size: number,
        position: Vec3,
        color: Color,
        width: number,
        height: number,
        alignment: HorizontalTextAlignment = Label.HorizontalAlign.CENTER,
    ): Label {
        return this.childLabel(this.safeRoot, name, text, size, position, color, width, height, alignment);
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
        label.color = animeTextColor(color);
        label.horizontalAlign = alignment;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = true;
        return label;
    }

    private button(
        text: string,
        position: Vec3,
        color: Color,
        action: () => void,
        width: number,
        height: number,
    ): Button {
        return this.childButton(this.safeRoot, text, position, color, action, width, height);
    }

    private toggleAdvancedHud(): void {
        const model = this.currentModel;
        const blocked = !model
            || model.finished
            || model.hasPendingPropertyDecision
            || model.hasPendingPaymentDecision
            || model.hasPendingWorldTravelDecision
            || model.hasPendingOlympicDecision
            || model.hasPendingGameCenterDecision
            || model.hasPendingFortuneCard
            || (this.currentTutorial?.active ?? false)
            || (this.currentSettings?.active ?? false);
        if (blocked) {
            this.advancedHudOpen = false;
            this.advancedHudPanel.active = false;
            this.advancedHudButtonLabel.string = 'INFO';
            return;
        }
        this.advancedHudOpen = !this.advancedHudOpen;
        this.advancedHudPanel.active = this.advancedHudOpen;
        this.advancedHudButtonLabel.string = this.advancedHudOpen ? 'CLOSE' : 'INFO';
    }

    private childButton(
        parent: Node,
        text: string,
        position: Vec3,
        color: Color,
        action: () => void,
        width: number,
        height: number,
        fontSize = 27,
    ): Button {
        const node = this.uiNode(`${text}Button`, parent, position, width, height);
        this.drawPanel(node, width, height, color, color);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.94;
        node.on(Button.EventType.CLICK, action);
        const darkText = color.r > 200 && color.g > 150;
        const textColor = darkText ? new Color(10, 14, 21) : Color.WHITE;
        this.childLabel(node, `${text}Label`, text, fontSize, Vec3.ZERO, textColor, width - 20, height - 12);
        return button;
    }

    private childRoundButton(
        parent: Node,
        text: string,
        position: Vec3,
        color: Color,
        action: () => void,
        radius: number,
        fontSize = 27,
    ): Button {
        const diameter = radius * 2;
        const node = this.uiNode(`${text}RoundButton`, parent, position, diameter, diameter);
        drawAnimeRoll(node.addComponent(Graphics), radius);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.92;
        node.on(Button.EventType.CLICK, action);
        this.childLabel(node, `${text}Label`, text, fontSize, Vec3.ZERO,
            ANIME.ink, diameter - 16, diameter - 16);
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
        drawAnimePanel(node, width, height, fill, stroke, /Button$/.test(node.name));
    }

    private selectTravelSlot(slot: number): void {
        const model = this.currentModel;
        const decision = model?.pendingWorldTravelDecision;
        if (!model || !decision || this.busy) return;
        const destinationIndex = model.worldTravelDestinations()[this.travelPage * this.travelButtons.length + slot]?.tileIndex;
        if (destinationIndex !== undefined) this.actions.selectWorldTravel(destinationIndex);
    }

    private changeTravelPage(direction: number): void {
        const model = this.currentModel;
        const decision = model?.pendingWorldTravelDecision;
        if (!model || !decision || this.busy) return;
        const pageCount = Math.max(1, Math.ceil(model.worldTravelDestinations().length / this.travelButtons.length));
        this.travelPage = Math.max(0, Math.min(this.travelPage + direction, pageCount - 1));
        this.render(model, this.lastMessage);
    }

    private selectOlympicSlot(slot: number): void {
        const model = this.currentModel;
        const decision = model?.pendingOlympicDecision;
        if (!model || !decision || this.busy) return;
        const tileIndex = decision.propertyIndices[this.olympicPage * this.olympicButtons.length + slot];
        if (tileIndex !== undefined) this.actions.selectOlympic(tileIndex);
    }

    private changeOlympicPage(direction: number): void {
        const model = this.currentModel;
        const decision = model?.pendingOlympicDecision;
        if (!model || !decision || this.busy) return;
        const pageCount = Math.max(1, Math.ceil(decision.propertyIndices.length / this.olympicButtons.length));
        this.olympicPage = Math.max(0, Math.min(this.olympicPage + direction, pageCount - 1));
        this.render(model, this.lastMessage);
    }

    private selectGameCenterSlot(slot: number): void {
        const model = this.currentModel;
        const decision: GameCenterDecision | null | undefined = model?.pendingGameCenterDecision;
        if (!model || !decision || this.busy) return;
        const selectedNumber = decision.lanes[slot]?.signal;
        if (selectedNumber !== undefined) this.actions.selectGameCenter(selectedNumber);
    }

    private selectDiceParity(parity: DiceControlParity): void {
        if (this.busy) return;
        this.diceControlParity = parity;
        this.refreshDiceControlVisuals();
    }

    private selectDiceRange(range: DiceControlRange): void {
        if (this.busy) return;
        this.diceControlRange = range;
        this.refreshDiceControlVisuals();
    }

    private currentDiceControl(): DiceControlRequest {
        return {
            parity: this.diceControlParity,
            range: this.diceControlRange,
            accuracy: 0.68,
        };
    }

    private diceRangeText(range: DiceControlRange): string {
        switch (range) {
            case 'LOW': return 'TARGET 2-5';
            case 'HIGH': return 'TARGET 9-12';
            default: return 'TARGET 6-8';
        }
    }

    private refreshDiceControlVisuals(): void {
        const parityValues: readonly DiceControlParity[] = ['AUTO', 'ODD', 'EVEN'];
        this.diceParityLabels.forEach((label, index) => {
            const value = parityValues[index] ?? 'AUTO';
            const selected = value === this.diceControlParity;
            label.string = selected ? `◆ ${value}` : value;
            label.color = animeTextColor(selected ? new Color(255, 226, 122) : new Color(224, 215, 197));
            label.node.setScale(selected ? 1.06 : 1, selected ? 1.06 : 1, 1);
        });
        const rangeValues: readonly DiceControlRange[] = ['LOW', 'MID', 'HIGH'];
        this.diceRangeLabels.forEach((label, index) => {
            const value = rangeValues[index] ?? 'MID';
            const selected = value === this.diceControlRange;
            label.string = selected ? `◆ ${value}` : value;
            label.color = animeTextColor(selected ? new Color(255, 226, 122) : new Color(224, 215, 197));
            label.node.setScale(selected ? 1.06 : 1, selected ? 1.06 : 1, 1);
        });
    }

    private paymentBlockMessage(decision: Readonly<PaymentDecision>): string {
        switch (decision.takeoverBlockReason) {
            case 'LANDMARK': return 'TAKEOVER BLOCKED  |  Landmarks are permanently protected.';
            case 'PROTECTED': return 'TAKEOVER BLOCKED  |  Property Shield is still active.';
            case 'BUYER_BANKRUPT': return 'TAKEOVER BLOCKED  |  The player is bankrupt.';
            case 'INSUFFICIENT_FUNDS': return `INSUFFICIENT FUNDS  |  COST CP ${decision.takeoverCost.toLocaleString('en-US')}`;
            default: return 'TAKEOVER UNAVAILABLE.';
        }
    }

    private renderResult(model: MatchModel): void {
        this.result.active = model.finished && this.resultPresentationReady;
        this.rollButton.node.active = !model.finished;
        this.settingsButton.node.active = !model.finished;
        this.guideButton.node.active = !model.finished;
        this.dice.node.active = !model.finished;
        this.timer.node.active = !model.finished;
        if (!model.finished || !this.resultPresentationReady) return;

        this.decision.active = false;
        this.payment.active = false;
        this.travel.active = false;
        this.olympic.active = false;
        this.gameCenter.active = false;
        this.gameCenterResult.active = false;
        this.fortune.active = false;
        this.settings.active = false;

        const summary = model.resultSummary();
        const winner = summary.entries.find((entry) => entry.playerId === summary.winnerId)
            ?? summary.entries[0] as MatchResultEntry;
        const structuralVictory = this.resultReasonLabel(summary.reason);
        this.resultTitle.string = structuralVictory
            ? `${structuralVictory}!`
            : summary.winningTeamId
                ? `WINNER  |  TEAM ${summary.winningTeamId}`
                : `WINNER  |  ${winner.name.toUpperCase()}`;
        const teamScore = summary.teamEntries.length > 0
            ? summary.teamEntries.map((team) => `${team.teamId} CP ${team.netWorth.toLocaleString('en-US')}`).join('  •  ')
            : '';
        this.resultSubtitle.string = structuralVictory
            ? `${summary.winningTeamId ? `TEAM ${summary.winningTeamId}` : winner.name.toUpperCase()} COMPLETED ${structuralVictory}  |  ROUND ${summary.completedRound}`
            : summary.reason === 'LAST_TEAM'
                ? `LAST TEAM STANDING  |  ROUND ${summary.completedRound}  •  ${teamScore}`
                : summary.reason === 'LAST_PLAYER'
                    ? `LAST PLAYER STANDING  |  ROUND ${summary.completedRound}`
                    : `ROUND ${summary.completedRound} COMPLETE  |  ${teamScore || 'NET WORTH RANKING'}`;

        for (let index = 0; index < this.resultRows.length; index++) {
            const label = this.resultRows[index] as Label;
            const entry = summary.entries[index];
            label.node.active = entry !== undefined;
            if (!entry) continue;
            label.color = animeTextColor(Color.fromHEX(new Color(), entry.color));
            label.string = `#${entry.rank}  ${entry.name.toUpperCase()}${entry.teamId ? `  |  TEAM ${entry.teamId}` : ''}${entry.bankrupt ? '  |  BANKRUPT' : ''}\nNET CP ${entry.netWorth.toLocaleString('en-US')}  |  CASH CP ${entry.money.toLocaleString('en-US')}  |  CITY ${entry.propertyCount}  |  BLD ${entry.buildingCount}`;
        }
        const awardSummary = model.matchAwards();
        for (let index = 0; index < this.resultAwardLabels.length; index++) {
            const label = this.resultAwardLabels[index] as Label;
            const award = awardSummary.awards[index] as MatchAward | undefined;
            label.node.active = Boolean(award);
            if (!award) continue;
            label.color = animeTextColor(Color.fromHEX(new Color(), award.color));
            label.string = `${award.title}
${award.playerName.toUpperCase()}
${award.valueLabel}`;
        }
        const human = model.players.find((entry) => !entry.bot);
        const performance = human
            ? awardSummary.performances.find((entry) => entry.playerId === human.id)
            : awardSummary.performances[0];
        this.resultPerformance.string = performance
            ? `PERFORMANCE GRADE ${performance.grade}  •  SCORE ${performance.score}/100  •  AWARDS ${performance.awardCount}  •  NET WORTH SHARE ${Math.round(performance.netWorthShare * 100)}%`
            : 'PERFORMANCE GRADE UNAVAILABLE';

        const reward = this.careerReward;
        this.resultLegacy.string = reward?.persisted
            ? `MATCH HIGHLIGHT  •  ${reward.matchHighlightTitle}  •  LEGACY ${reward.snapshot.legacyTier} ${reward.snapshot.legacyScore.toLocaleString('en-US')}  •  JOURNEY ${reward.snapshot.journey.completedTierCount}/${reward.snapshot.journey.maxLevel}  •  RIVAL #${reward.snapshot.journey.localRivalRank} ${reward.snapshot.journey.rivalRating} RR  •  GAUNTLET ${reward.snapshot.journey.rivalGauntletDivision} ${reward.snapshot.journey.rivalGauntletScore}  •  PODIUM STREAK ${reward.snapshot.journey.rivalPodiumStreak}`
            : 'CAREER LEGACY & WORLD JOURNEY  •  MATCH PROGRESSION COULD NOT BE SAVED';
        const careerText = reward?.persisted
            ? (() => {
                const levelText = reward.levelAfter > reward.levelBefore
                    ? `  •  LEVEL UP ${reward.levelBefore} -> ${reward.levelAfter}`
                    : '';
                const missionText = reward.completedMissionTitles.length > 0
                    ? `
MISSION COMPLETE  •  ${reward.completedMissionTitles.join(' / ')}`
                    : '';
                const legacyText = reward.completedLegacyMilestoneTitles.length > 0
                    ? `
LEGACY MILESTONE  •  ${reward.completedLegacyMilestoneTitles.join(' /')}  •  +CP ${reward.legacyMilestoneCredits.toLocaleString('en-US')}`
                    : '';
                const journeyMissionText = reward.completedJourneyMissionTitles.length > 0
                    ? `
JOURNEY MISSION  •  ${reward.completedJourneyMissionTitles.join(' / ')}  •  +CP ${reward.journeyMissionCredits.toLocaleString('en-US')}`
                    : '';
                const journeyTierText = reward.unlockedJourneyTierLabels.length > 0
                    ? `
JOURNEY REWARD  •  ${reward.unlockedJourneyTierLabels.join(' / ')}  •  +CP ${reward.journeyTierCredits.toLocaleString('en-US')}`
                    : '';
                const perfectCycleText = reward.completedJourneyPerfectCycleLabels.length > 0
                    ? `
PERFECT CYCLE  •  ${reward.completedJourneyPerfectCycleLabels.join(' / ')}  •  +CP ${reward.journeyPerfectCycleCredits.toLocaleString('en-US')}`
                    : '';
                const prestigeText = reward.unlockedJourneyPrestigeLabels.length > 0
                    ? `
PRESTIGE REWARD  •  ${reward.unlockedJourneyPrestigeLabels.join(' / ')}  •  +CP ${reward.journeyPrestigeCredits.toLocaleString('en-US')}`
                    : '';
                const rivalContractText = reward.completedJourneyRivalContractTitles.length > 0
                    ? `
RIVAL CONTRACT  •  ${reward.completedJourneyRivalContractTitles.join(' / ')}  •  +CP ${reward.journeyRivalCredits.toLocaleString('en-US')}  •  JXP +${reward.journeyRivalExperience}`
                    : `
RIVAL RATING  •  ${reward.journeyRivalRatingChange >= 0 ? '+' : ''}${reward.journeyRivalRatingChange}  •  NOW ${reward.snapshot.journey.rivalRating} RR  •  RANK #${reward.snapshot.journey.localRivalRank}`;
                const rivalGauntletText = reward.completedJourneyRivalGauntletTitles.length > 0
                    ? `
RIVAL GAUNTLET  •  ${reward.completedJourneyRivalGauntletTitles.join(' / ')}  •  +CP ${reward.journeyRivalGauntletCredits.toLocaleString('en-US')}  •  JXP +${reward.journeyRivalGauntletExperience}`
                    : `
GAUNTLET SCORE  •  +${reward.journeyRivalGauntletScoreGained}  •  NOW ${reward.snapshot.journey.rivalGauntletScore}/${reward.snapshot.journey.rivalGauntletTarget}  •  ${reward.snapshot.journey.rivalGauntletDivision}`;
                const seasonArchiveText = reward.archivedJourneySeasonLabels.length > 0
                    ? `
SEASON ARCHIVE  •  ${reward.archivedJourneySeasonLabels.join(' / ')}  •  HISTORY SAVED`
                    : '';
                const streakText = reward.journeyStreakBonusExperience > 0
                    ? `  •  STREAK JXP +${reward.journeyStreakBonusExperience}`
                    : '';
                return `CAREER REWARD  +CP ${reward.totalCredits.toLocaleString('en-US')}  •  XP +${reward.experienceGained}  •  JOURNEY XP +${reward.journeyExperienceGained}${streakText}${levelText}${missionText}${legacyText}${journeyMissionText}${journeyTierText}${perfectCycleText}${prestigeText}${rivalContractText}${rivalGauntletText}${seasonArchiveText}`;
            })()
            : 'CAREER REWARD COULD NOT BE SAVED  •  NO CURRENCY WAS ADDED';
        const ranked = this.rankedReward;
        const rankedText = ranked
            ? ranked.persisted
                ? `
RANKED  ${ranked.tierAfter} ${ranked.ratingAfter} RP  •  ${ranked.ratingDelta >= 0 ? '+' : ''}${ranked.ratingDelta} RP${ranked.promoted ? '  •  PROMOTION!' : ''}`
                : `\nRANKED RESULT COULD NOT BE SAVED`
            : '';
        this.resultReward.string = `${careerText}${rankedText}
${this.liveAcademyResultText}`;
        this.resultFooter.string = structuralVictory
            ? `${structuralVictory} IS AN INSTANT CLASSIC VICTORY  •  CASH AND ASSET RANKING REMAIN VISIBLE`
            : ranked
                ? 'RANKED MATCH  •  FIXED RULES  •  RATING IS SAVED LOCALLY ON THIS DEVICE'
                : model.matchMode === 'TEAM'
                ? 'TEAM SCORE = COMBINED CASH + PROPERTY + BUILDING VALUE  •  ALLY RENT IS WAIVED'
                : 'NET WORTH = CASH + PROPERTY + BUILDING VALUE  •  REWARDS ARE LOCAL-ONLY';
    }

    private renderSettings(model: MatchModel): void {
        const settings = this.currentSettings;
        this.settings.active = settings?.active === true && !model.finished;
        if (!this.settings.active || !settings) return;
        this.settingsMusic.string = this.volumeDisplay('MUSIC', settings.musicVolume);
        this.settingsSound.string = this.volumeDisplay('SFX', settings.soundVolume);
        this.settingsMotionButtonLabel.string = settings.reducedCameraMotion
            ? 'MOTION: MINIMAL'
            : 'MOTION: CLASSIC';
    }

    private volumeDisplay(name: string, volume: number): string {
        const filled = Math.max(0, Math.min(Math.round(volume * 10), 10));
        const meter = `${'|'.repeat(filled)}${'.'.repeat(10 - filled)}`;
        return `${name}  [${meter}]  ${Math.round(volume * 100)}%`;
    }

    private renderTutorial(model: MatchModel): void {
        const tutorial = this.currentTutorial;
        this.tutorial.active = tutorial?.active === true && !model.finished;
        if (!this.tutorial.active || !tutorial) return;
        this.tutorialProgress.string = `QUICK GUIDE  |  STEP ${tutorial.stepIndex + 1} / ${tutorial.totalSteps}`;
        this.tutorialTitle.string = tutorial.step.title;
        this.tutorialDescription.string = tutorial.step.description;
        this.tutorialFocus.string = tutorial.step.focus;
        this.tutorialNextButtonLabel.string = tutorial.stepIndex === tutorial.totalSteps - 1
            ? 'START MATCH'
            : 'NEXT';
    }

    private resultReasonLabel(reason: string): string {
        switch (reason) {
            case 'TRIPLE_MONOPOLY': return 'TRIPLE MONOPOLY';
            case 'LINE_MONOPOLY': return 'LINE MONOPOLY';
            case 'TOURISM_MONOPOLY': return 'TOURISM MONOPOLY';
            default: return '';
        }
    }

    private selectFortuneChoice(slot: number): void {
        const cardId = this.fortuneChoiceIds[slot];
        if (!cardId || this.busy) return;
        this.actions.selectFortuneCard(cardId);
    }

    private rarityColor(rarity: FortuneCardRarity): Color {
        switch (rarity) {
            case FortuneCardRarity.Common: return new Color(180, 196, 214);
            case FortuneCardRarity.Rare: return new Color(63, 169, 255);
            case FortuneCardRarity.Epic: return new Color(181, 98, 255);
            case FortuneCardRarity.Legendary: return new Color(245, 195, 35);
            default: return Color.WHITE;
        }
    }
}
