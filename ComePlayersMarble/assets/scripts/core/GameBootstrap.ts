import { _decorator, AnimationClip, AudioClip, Component, Enum, Prefab, Vec3 } from 'cc';
import { BUILDING_LEVEL_NAMES } from '../buildings/BuildingUpgradeService';
import { AudioManager } from '../audio/AudioManager';
import { CocosAudioBackend } from '../audio/CocosAudioBackend';
import { AUDIO_CATEGORIES, AudioCue } from '../audio/AudioTypes';
import { BoardView } from '../board/BoardView';
import { BotDecisionService } from '../bot/BotDecisionService';
import { BoardCameraController, CameraImpactCue } from '../camera/BoardCameraController';
import { createBoardData, GAME_RULES, TileType } from '../data/BoardData';
import type { CharacterCardDefinition } from '../data/CharacterCardData';
import { DiceController } from '../dice/DiceController';
import { DiceSkinPreset } from '../dice/DicePresentationTypes';
import { DiceAuthorityResult, DiceControlRequest, LocalMatchNetworkService, NetworkService } from '../network/NetworkService';
import { RealtimeMultiplayerService } from '../network/RealtimeMultiplayerService';
import { PlayerAnimationState } from '../player/PlayerAnimationTypes';
import { LocalSaveService } from '../save/LocalSaveService';
import {
    CareerMatchActivity,
    createEmptyCareerMatchActivity,
} from '../save/CareerProgressionData';
import { BotDifficulty, MatchMode, MatchSettingsData, MATCH_SETTINGS_VERSION } from '../save/MatchSettingsData';
import type { ReplayAcademySnapshot } from '../save/ReplayLibraryData';
import { LiveAcademyObjectiveService, type LiveAcademyObjectiveState } from './LiveAcademyObjectiveService';
import { FrontEndShell } from '../ui/FrontEndShell';
import { MatchHUD } from '../ui/MatchHUD';
import { VfxManager } from '../vfx/VfxManager';
import { VfxCue } from '../vfx/VfxTypes';
import { CharacterProgressionService } from './CharacterProgressionService';
import { CLASSIC_PRESENTATION_TIMING } from './ClassicPresentationTiming';
import { CharacterSkillService } from './CharacterSkillService';
import { CareerProgressionService, type CareerMatchReward } from './CareerProgressionService';
import { RankedProgressionService } from './RankedProgressionService';
import { OnlineProfileService } from './OnlineProfileService';
import { ReplayLibraryService } from './ReplayLibraryService';
import { MatchReplayRecorder } from './MatchReplayRecorder';
import { GameEventBus, GameEvents } from './GameEventBus';
import { MatchModel } from './MatchModel';
import { SettingsService } from './SettingsService';
import { TutorialService } from './TutorialService';
import { TurnTimer } from './TurnTimer';

const { ccclass, property } = _decorator;
const DICE_SKIN_PRESET_ENUM = Enum(DiceSkinPreset);

@ccclass('GameBootstrap')
// Legacy verification marker: LIVE REPLAY ACADEMY  •  V102
export class GameBootstrap extends Component {
    @property({ range: [2, 4, 1], slide: true, tooltip: 'Number of local/debug players.' })
    public playerCount = 4;

    @property({ range: [0.1, 3, 0.1], slide: true, tooltip: 'Bot decision delay in seconds.' })
    public botThinkDelay = 0.65;

    @property({ range: [0.08, 0.5, 0.01], slide: true, tooltip: 'Movement duration per space.' })
    public playerStepDuration = 0.18;

    @property({ tooltip: 'Reduce all camera transitions.' })
    public reducedCameraMotion = false;

    @property({ tooltip: 'Roll automatically when the player timer expires.' })
    public autoRollOnTimeout = true;

    @property({ range: [10, 90, 5], slide: true, tooltip: 'Player turn duration in seconds.' })
    public turnDurationSeconds = GAME_RULES.turnSeconds;

    @property({ tooltip: 'Use 0 for a time seed; any other value creates a repeatable dice sequence.' })
    public randomSeed = 0;

    @property({
        type: DICE_SKIN_PRESET_ENUM,
        tooltip: 'Original procedural dice palette. It can change without affecting authority results.',
    })
    public diceSkinPreset = DiceSkinPreset.ComePlayersGold;

    @property({
        type: [AudioClip],
        tooltip: 'Optional clips named after their cues, such as dice-roll. Web uses procedural placeholders when empty.',
    })
    public audioClips: AudioClip[] = [];

    @property({ type: Prefab, tooltip: 'Optional final Alexia Prefab. The original capsule is used when empty.' })
    public alexiaPrefab: Prefab | null = null;

    @property({
        type: [AnimationClip],
        tooltip: 'Optional Alexia clips named after states such as Alexia_Idle and Alexia_RollDice.',
    })
    public alexiaAnimationClips: AnimationClip[] = [];

    @property({ range: [0.05, 10, 0.05], slide: true, tooltip: 'Alexia Prefab scale multiplier that does not change the movement rig.' })
    public alexiaPrefabScale = 1;

    private model: MatchModel | null = null;
    private boardView: BoardView | null = null;
    private cameraController: BoardCameraController | null = null;
    private diceController: DiceController | null = null;
    private audioManager: AudioManager | null = null;
    private vfxManager: VfxManager | null = null;
    private hud: MatchHUD | null = null;
    private frontEnd: FrontEndShell | null = null;
    private network: NetworkService | null = null;
    private readonly botDecision = new BotDecisionService();
    private readonly eventBus = new GameEventBus();
    private readonly timer = new TurnTimer();
    private readonly localSave = new LocalSaveService();
    private readonly characterProgression = new CharacterProgressionService(this.localSave);
    private readonly characterSkill = new CharacterSkillService();
    private readonly careerProgression = new CareerProgressionService(this.localSave);
    private readonly rankedProgression = new RankedProgressionService(this.localSave);
    private readonly onlineProfile = new OnlineProfileService(this.localSave);
    private readonly realtimeMultiplayer = new RealtimeMultiplayerService(this.onlineProfile);
    private readonly replayLibrary = new ReplayLibraryService(this.localSave);
    private readonly liveAcademy = new LiveAcademyObjectiveService();
    private readonly tutorial = new TutorialService(this.localSave);
    private readonly settings = new SettingsService(this.localSave);
    private busy = false;
    private generation = 0;
    private lastTimerDisplay = -1;
    private matchActivity: CareerMatchActivity = createEmptyCareerMatchActivity();
    private activeCharacter: CharacterCardDefinition | null = null;
    private activeSkillUsed = false;
    private matchLoadoutMessage = 'No match loadout active.';
    private botDifficulty: BotDifficulty = 'SMART';
    private roundEventsEnabled = true;
    private matchMode: MatchMode = 'SOLO';
    private rankedMode = false;
    private replayRecorder: MatchReplayRecorder | null = null;
    private liveAcademyObjective: LiveAcademyObjectiveState | null = null;
    private liveAcademyFastRolls = 0;
    private liveAcademyRecorded = false;
    private liveAcademyCompletionPresented = false;
    private liveAcademyRewardCredits = 0;

    protected override start(): void {
        this.eventBus.on(GameEvents.AudioCue, this.onAudioCue, this);
        this.eventBus.on(GameEvents.Message, this.onMessage, this);
        this.eventBus.on(GameEvents.PlayerMovement, this.onPlayerMovement, this);
        this.eventBus.on(GameEvents.VfxCue, this.onVfxCue, this);
        this.realtimeMultiplayer.setAuthoritativeSnapshotListener(() => {
            this.frontEnd?.refreshOnline(this.onlineProfile.snapshot());
        });
        this.realtimeMultiplayer.setAuthoritativeEventListener((event) => {
            this.frontEnd?.presentAuthoritativeEvent(event);
        });
        this.showFrontEnd();
    }

    protected override update(deltaTime: number): void {
        const model = this.model;
        if (!model || this.busy || this.tutorial.isActive || this.settings.isActive || model.finished || model.hasPendingPropertyDecision || model.hasPendingPaymentDecision || model.hasPendingFortuneCard || model.hasPendingWorldTravelDecision || model.hasPendingOlympicDecision || model.hasPendingGameCenterDecision || model.currentPlayer.bot) return;

        const expired = this.timer.tick(deltaTime);
        const display = this.timer.displaySeconds;
        if (display !== this.lastTimerDisplay) {
            this.lastTimerDisplay = display;
            this.hud?.setTimer(display);
        }
        if (expired && this.autoRollOnTimeout) {
            this.render('Timer habis. Roll otomatis.');
            void this.roll();
        }
    }

    protected override onDestroy(): void {
        this.eventBus.off(GameEvents.AudioCue, this.onAudioCue, this);
        this.eventBus.off(GameEvents.Message, this.onMessage, this);
        this.eventBus.off(GameEvents.PlayerMovement, this.onPlayerMovement, this);
        this.eventBus.off(GameEvents.VfxCue, this.onVfxCue, this);
        this.frontEnd?.destroy();
        this.frontEnd = null;
        this.realtimeMultiplayer.setAuthoritativeSnapshotListener(null);
        this.realtimeMultiplayer.setAuthoritativeEventListener(null);
        void this.realtimeMultiplayer.disconnect();
        this.disposeRuntime();
    }

    public restart(): void {
        this.frontEnd?.destroy();
        this.frontEnd = null;
        this.settings.close();
        this.disposeRuntime();
        const run = this.generation;
        this.matchActivity = createEmptyCareerMatchActivity();
        this.liveAcademyFastRolls = 0;
        this.liveAcademyRecorded = false;
        this.liveAcademyCompletionPresented = false;
        this.liveAcademyRewardCredits = 0;
        const hasSavedMatchSettings = this.localSave.hasMatchSettings();
        const matchSettings = this.localSave.loadMatchSettings({
            version: MATCH_SETTINGS_VERSION,
            playerCount: this.playerCount,
            turnSeconds: this.turnDurationSeconds,
            autoRollOnTimeout: this.autoRollOnTimeout,
            botDifficulty: this.botDifficulty,
            roundEventsEnabled: this.roundEventsEnabled,
            matchMode: this.matchMode,
            rankedMode: this.rankedMode,
        });
        this.playerCount = matchSettings.playerCount;
        this.turnDurationSeconds = matchSettings.turnSeconds;
        this.autoRollOnTimeout = matchSettings.autoRollOnTimeout;
        this.botDifficulty = matchSettings.botDifficulty;
        this.roundEventsEnabled = matchSettings.roundEventsEnabled;
        this.matchMode = matchSettings.matchMode;
        this.rankedMode = matchSettings.rankedMode;
        this.botDecision.setDifficulty(this.botDifficulty);
        const equippedCharacter = this.characterProgression.equippedCharacter();
        const matchLoadout = this.characterProgression.prepareMatchLoadout();
        this.activeCharacter = equippedCharacter.definition;
        this.activeSkillUsed = false;
        this.matchLoadoutMessage = matchLoadout.message;
        const board = createBoardData();
        const seed = this.randomSeed === 0 ? Date.now() : this.randomSeed;
        this.model = new MatchModel(
            board,
            this.playerCount,
            seed ^ 0x43f27a1d,
            this.roundEventsEnabled,
            this.matchMode,
        );
        this.replayRecorder = new MatchReplayRecorder({
            mode: this.matchMode,
            ranked: this.rankedMode,
            botDifficulty: this.botDifficulty,
            playerCount: this.playerCount,
            startedAt: Date.now(),
        });
        this.liveAcademyObjective = this.liveAcademy.create(this.replayLibrary.snapshot().academy);
        const humanPlayer = this.model.players.find((player) => !player.bot);
        if (humanPlayer) {
            humanPlayer.money = Math.min(9_999_999, humanPlayer.money + matchLoadout.bonus.startingMoneyBonus);
            humanPlayer.freeUpgradeCredits += matchLoadout.bonus.freeUpgradeCredits;
            humanPlayer.freeWorldTravelCredits += matchLoadout.bonus.freeWorldTravelCredits;
            humanPlayer.rentDiscountPercent = Math.max(
                humanPlayer.rentDiscountPercent,
                matchLoadout.bonus.rentDiscountPercent,
            );
            humanPlayer.rentDiscountCharges += matchLoadout.bonus.rentDiscountCharges;
        }
        this.network = new LocalMatchNetworkService(seed);
        this.boardView = new BoardView(board, {
            humanPrefab: this.alexiaPrefab,
            humanAnimationClips: this.alexiaAnimationClips,
            humanPrefabScale: this.alexiaPrefabScale,
        });
        this.boardView.spawnPlayers(this.model.players);
        const savedSettings = this.settings.snapshot();
        const audioBackend = new CocosAudioBackend(this.node.parent ?? this.node, this.audioClips);
        this.audioManager = new AudioManager(
            audioBackend,
            savedSettings.musicVolume,
            savedSettings.soundVolume,
        );
        this.vfxManager = new VfxManager(this.node.parent ?? this.node);
        this.cameraController = new BoardCameraController(
            this.reducedCameraMotion || savedSettings.reducedCameraMotion,
        );
        this.diceController = new DiceController({ skinPreset: this.diceSkinPreset });
        this.hud = new MatchHUD({
            roll: (control) => void this.roll(control),
            activateSkill: () => this.activateCharacterSkill(),
            confirmProperty: (targetLevel) => this.confirmProperty(targetLevel),
            selectWorldTravel: (tileIndex) => this.selectWorldTravel(tileIndex),
            selectOlympic: (tileIndex) => this.selectOlympic(tileIndex),
            selectGameCenter: (selectedNumber) => this.selectGameCenter(selectedNumber),
            selectFortuneCard: (cardId) => this.selectFortuneCard(cardId),
            confirmTakeover: () => this.resolvePlayerPayment(true),
            continuePayment: () => this.resolvePlayerPayment(false),
            skip: () => this.skip(),
            nextTutorial: () => this.nextTutorial(),
            skipTutorial: () => this.skipTutorial(),
            openTutorial: () => this.openTutorial(),
            openSettings: () => this.openSettings(),
            closeSettings: () => this.closeSettings(),
            adjustMusicVolume: (delta) => this.adjustMusicVolume(delta),
            adjustSoundVolume: (delta) => this.adjustSoundVolume(delta),
            toggleReducedCameraMotion: () => this.toggleReducedCameraMotion(),
            restart: () => this.restart(),
            exitToLobby: () => this.showFrontEnd(),
        });
        if (this.liveAcademyObjective) this.hud.setLiveAcademyObjective(this.liveAcademyObjective);
        if (this.activeCharacter) {
            this.hud.setSkillState(
                this.activeCharacter.activeSkill.name,
                true,
                this.activeCharacter.activeSkill.description,
            );
        }
        this.playAudio(AudioCue.MatchMusic);
        this.playAudio(AudioCue.BoardAmbience);
        this.cameraController.overview(true);
        this.cameraController.openingSequence();
        void this.playMatchOpening(run);
        const animationSnapshot = this.boardView.animationSnapshot();
        const cameraSnapshot = this.cameraController.snapshot();
        const diceSnapshot = this.diceController.snapshot();
        const vfxSnapshot = this.vfxManager.snapshot();
        const saveSnapshot = this.localSave.snapshot();
        console.info(`[ComePlayers] Character animation initialized: ${animationSnapshot.controllerCount} controllers, ${animationSnapshot.authoredStateCount} authored states, ${animationSnapshot.proceduralControllerCount} procedural fallbacks.`);
        console.info(`[ComePlayers] Camera presentation initialized: ${cameraSnapshot.state}, reduced motion ${cameraSnapshot.reducedMotion ? 'on' : 'off'}.`);
        console.info(`[ComePlayers] Dice presentation initialized: ${diceSnapshot.createdDice} dice, ${diceSnapshot.totalPips} pips, ${diceSnapshot.skinName} skin.`);
        console.info(`[ComePlayers] VFX initialized: ${vfxSnapshot.cueCount} cues, ${vfxSnapshot.created} prewarmed nodes, capacity ${vfxSnapshot.capacity}.`);
        console.info(`[ComePlayers] Audio initialized: ${AUDIO_CATEGORIES.length} categories, ${audioBackend.registeredClipCount} assigned clips, procedural placeholder ${audioBackend.proceduralPlaceholderAvailable ? 'ready' : 'unavailable'}.`);
        console.info(`[ComePlayers] Save initialized: v${saveSnapshot.version}, revision ${saveSnapshot.revision}, match settings ${hasSavedMatchSettings ? 'loaded' : 'using Inspector defaults'}.`);
        console.info(`[ComePlayers] Match initialized: ${board.length} tiles, ${this.model.players.length} players, ${this.matchMode} mode, ${this.botDifficulty} AI, ranked ${this.rankedMode ? 'on' : 'off'}, round events ${this.roundEventsEnabled ? 'enabled' : 'disabled'}.`);
    }

    private showFrontEnd(): void {
        this.frontEnd?.destroy();
        this.frontEnd = null;
        this.settings.close();
        this.disposeRuntime();
        const roomSettings = this.localSave.loadMatchSettings({
            version: MATCH_SETTINGS_VERSION,
            playerCount: this.playerCount,
            turnSeconds: this.turnDurationSeconds,
            autoRollOnTimeout: this.autoRollOnTimeout,
            botDifficulty: this.botDifficulty,
            roundEventsEnabled: this.roundEventsEnabled,
            matchMode: this.matchMode,
            rankedMode: false,
        });
        this.frontEnd = new FrontEndShell(
            roomSettings,
            this.settings.snapshot(),
            this.characterProgression.snapshot(),
            this.careerProgression.snapshot(),
            this.rankedProgression.snapshot(),
            this.onlineProfile.snapshot(),
            this.replayLibrary.snapshot(),
            {
                startLocalMatch: (settings) => this.startLocalMatch(settings),
                openSettings: () => this.settings.open(),
                closeSettings: () => {
                    this.settings.close();
                },
                adjustMusicVolume: (delta) => this.settings.adjustMusicVolume(delta),
                adjustSoundVolume: (delta) => this.settings.adjustSoundVolume(delta),
                toggleReducedCameraMotion: () => this.settings.toggleReducedCameraMotion(),
                getCharacterProgression: () => this.characterProgression.snapshot(),
                getCareerProgression: () => this.careerProgression.snapshot(),
                getRankedProgression: () => this.rankedProgression.snapshot(),
                startRankedMatch: (mode) => this.startRankedMatch(mode),
                claimRankedWeeklyReward: () => this.claimRankedWeeklyReward(),
                getOnlineProfile: () => this.onlineProfile.snapshot(),
                createFriendRoom: (mode) => this.onlineProfile.createFriendRoom(mode),
                addFriendRoomPlayer: () => this.onlineProfile.addSimulatedRoomGuest('PLAYER'),
                addFriendRoomSpectator: () => this.onlineProfile.addSimulatedRoomGuest('SPECTATOR'),
                toggleFriendRoomReady: () => this.toggleFriendRoomReady(),
                simulateFriendRoomDisconnect: () => this.onlineProfile.simulateDisconnect(),
                reconnectFriendRoom: () => this.onlineProfile.reconnectActiveRoom(),
                leaveFriendRoom: () => this.onlineProfile.leaveFriendRoom(),
                rotateFriendCode: () => this.onlineProfile.rotateFriendCode(),
                createSupabaseRoom: (mode) => this.realtimeMultiplayer.createAndConnect(mode, {
                    turnSeconds: this.roomSettingsTurnSeconds(roomSettings),
                    autoRoll: roomSettings.autoRollOnTimeout,
                    botDifficulty: roomSettings.botDifficulty,
                    roundEvents: roomSettings.roundEventsEnabled,
                    startingMoney: GAME_RULES.startingMoney,
                    maxRounds: GAME_RULES.maxRounds,
                }),
                joinSupabaseRoom: (inviteCode, role) => this.realtimeMultiplayer.joinAndConnect(inviteCode, role),
                reconnectSupabaseRoom: () => this.realtimeMultiplayer.reconnect(),
                disconnectSupabaseRoom: () => this.realtimeMultiplayer.disconnect(),
                syncSupabaseRoom: () => this.realtimeMultiplayer.synchronizeActiveRoom(),
                heartbeatSupabaseRoom: () => this.realtimeMultiplayer.heartbeat(),
                startSupabaseMatch: () => this.startConfiguredAuthoritativeMatch(),
                activateSupabaseSkill: () => this.realtimeMultiplayer.activateAuthoritativeSkill(),
                resumeSupabaseMatch: () => this.realtimeMultiplayer.resumeAuthoritativeMatch(),
                rollSupabaseDice: () => this.realtimeMultiplayer.rollAuthoritativeDice(),
                purchaseSupabaseProperty: () => this.realtimeMultiplayer.purchaseAuthoritativeProperty(),
                upgradeSupabaseProperty: () => this.realtimeMultiplayer.upgradeAuthoritativeProperty(),
                takeoverSupabaseProperty: () => this.realtimeMultiplayer.takeoverAuthoritativeProperty(),
                chooseSupabaseGameCenter: (selectedNumber) => this.realtimeMultiplayer.chooseAuthoritativeGameCenter(selectedNumber),
                selectSupabaseOlympic: (tileIndex) => this.realtimeMultiplayer.selectAuthoritativeOlympic(tileIndex),
                selectSupabaseTravel: (tileIndex) => this.realtimeMultiplayer.selectAuthoritativeTravel(tileIndex),
                endSupabaseTurn: () => this.realtimeMultiplayer.endAuthoritativeTurn(),
                getAuthoritativeMatch: () => this.realtimeMultiplayer.authoritativeSnapshot(),
                getAuthoritativeEventHistory: (afterSequence, limit) => this.realtimeMultiplayer.authoritativeEventHistory(afterSequence, limit),
                publishAuthoritativeReplay: (visibility) => this.realtimeMultiplayer.publishAuthoritativeReplay(visibility),
                getAuthoritativeReplayLibrary: (limit) => this.realtimeMultiplayer.authoritativeReplayLibrary(limit),
                getAuthoritativeReplayByCode: (replayCode) => this.realtimeMultiplayer.authoritativeReplayByCode(replayCode),
                deleteAuthoritativeReplay: (replayId) => this.realtimeMultiplayer.deleteAuthoritativeReplay(replayId),
                getCompetitiveHub: () => this.realtimeMultiplayer.competitiveHub(),
                joinCompetitiveQueue: (mode) => this.realtimeMultiplayer.joinCompetitiveQueue(mode),
                pollCompetitiveQueue: () => this.realtimeMultiplayer.pollCompetitiveQueue(),
                subscribeCompetitiveQueue: (listener) => this.realtimeMultiplayer.subscribeCompetitiveQueue(listener),
                unsubscribeCompetitiveQueue: () => this.realtimeMultiplayer.unsubscribeCompetitiveQueue(),
                cancelCompetitiveQueue: () => this.realtimeMultiplayer.cancelCompetitiveQueue(),
                finalizeCompetitiveMatch: () => this.realtimeMultiplayer.finalizeCompetitiveMatch(),
                createTournament: (name, capacity, mode) => this.realtimeMultiplayer.createTournament(name, capacity, mode),
                joinTournament: (code) => this.realtimeMultiplayer.joinTournament(code),
                getTournament: (code) => this.realtimeMultiplayer.tournamentByCode(code),
                advanceTournament: (code) => this.realtimeMultiplayer.advanceTournament(code),
                prepareCloudBackup: () => this.prepareCloudBackup(),
                acknowledgeCloudBackup: () => this.acknowledgeCloudBackup(),
                getReplayLibrary: () => this.replayLibrary.snapshot(),
                deleteReplay: (replayId) => this.replayLibrary.deleteRecord(replayId),
                purchaseCharacterPack: () => this.characterProgression.purchasePack(),
                redeemCharacterUpgradePoints: () => this.characterProgression.redeemUpgradePoints(),
                equipCharacterCard: (cardId) => this.characterProgression.equip(cardId),
                upgradeCharacterCard: (cardId) => this.characterProgression.upgrade(cardId),
                combineCharacterCards: (firstCardId, secondCardId) => (
                    this.characterProgression.combine(firstCardId, secondCardId)
                ),
                purchaseItem: (definitionId) => this.characterProgression.purchaseItem(definitionId),
                equipPendant: (definitionId) => this.characterProgression.equipPendant(definitionId),
                selectBooster: (definitionId) => this.characterProgression.selectBooster(definitionId),
            },
        );
        console.info('[ComePlayers] Front end initialized: Lobby, Local Room, Ranked Arena, Online Center, Replay Studio, Shop, Character, Dice, Inventory, Missions, and Settings.');
    }

    private async startConfiguredAuthoritativeMatch() {
        const progression = this.characterProgression.snapshot();
        const equipped = progression.cards.find((card) => card.id === progression.equippedCardId)
            ?? progression.cards[0];
        if (!equipped) {
            return this.onlineProfile.updateRealtimeBackend({}, 'Equip a character before starting an online match.', false);
        }
        const configured = await this.realtimeMultiplayer.configureAuthoritativeLoadout(
            equipped.definition.id,
            equipped.definition.activeSkill.id,
            progression.equippedPendantId,
            progression.selectedBoosterId,
        );
        if (!configured.ok) return configured;
        const started = await this.realtimeMultiplayer.startAuthoritativeMatch();
        if (started.ok && progression.selectedBoosterId) {
            const consumed = this.characterProgression.prepareMatchLoadout();
            if (!consumed.persisted) {
                console.warn('[ComePlayers] Online match started, but the selected local booster could not be consumed.');
            }
            this.frontEnd?.refreshOnline(this.onlineProfile.snapshot());
        }
        return started;
    }

    private startLocalMatch(settings: MatchSettingsData): void {
        this.localSave.saveMatchSettings(settings);
        this.frontEnd?.destroy();
        this.frontEnd = null;
        this.restart();
    }

    private startRankedMatch(mode: MatchMode): void {
        const settings = this.rankedProgression.createMatchSettings(mode);
        this.localSave.saveMatchSettings(settings);
        this.frontEnd?.destroy();
        this.frontEnd = null;
        this.restart();
    }

    private claimRankedWeeklyReward() {
        const claim = this.rankedProgression.claimWeeklyReward();
        if (!claim.ok || claim.credits <= 0) return claim;
        const credit = this.characterProgression.grantCredits(claim.credits, 'Ranked weekly reward');
        if (credit.ok) return claim;
        this.rankedProgression.revokeWeeklyRewardClaim();
        return {
            ...claim,
            ok: false,
            persisted: false,
            credits: 0,
            message: 'Ranked reward could not be added; the claim was restored.',
            snapshot: this.rankedProgression.snapshot(),
        };
    }

    private toggleFriendRoomReady() {
        const result = this.onlineProfile.toggleHostReady();
        if (result.ok && result.snapshot.realtimeState === 'CONNECTED') {
            void this.realtimeMultiplayer.synchronizeReadyState();
        }
        return result;
    }

    private roomSettingsTurnSeconds(settings: MatchSettingsData): number {
        return settings.turnSeconds;
    }

    private prepareCloudBackup() {
        const save = this.localSave.snapshot();
        return this.onlineProfile.prepareCloudBackup(save.revision, save.updatedAt).result;
    }

    private acknowledgeCloudBackup() {
        const snapshot = this.onlineProfile.snapshot();
        return this.onlineProfile.applyRemoteGeneration(
            snapshot.cloudLocalGeneration,
            snapshot.cloudManifestChecksum,
        );
    }

    private async roll(control?: DiceControlRequest): Promise<void> {
        const model = this.model;
        const network = this.network;
        if (!model || !network || this.busy || this.tutorial.isActive || this.settings.isActive || model.finished || model.hasPendingPropertyDecision || model.hasPendingPaymentDecision || model.hasPendingFortuneCard || model.hasPendingWorldTravelDecision || model.hasPendingOlympicDecision || model.hasPendingGameCenterDecision) return;

        const player = model.currentPlayer;
        if (!player.bot && this.timer.displaySeconds >= Math.ceil(this.turnDurationSeconds * 0.6)) {
            this.liveAcademyFastRolls++;
        }
        this.busy = true;
        this.timer.stop();
        this.hud?.setBusy(true, model);
        this.playAudio(AudioCue.DiceRoll);
        this.playVfx(VfxCue.DiceRoll, new Vec3(0, 0.55, 0), undefined, 3, 0.85);
        const run = this.generation;
        if (!player.bot && control && network.setDiceControl) {
            network.setDiceControl(player.id, control);
            this.render(`Dice control locked: ${control.range} range • ${control.parity}.`);
        }
        this.boardView?.playPlayerAnimation(player.id, PlayerAnimationState.RollDice);

        try {
            this.cameraController?.diceFocus();
            this.render(`${player.name} melempar dadu...`);
            const dice = await this.requestDiceWithTimeout(network, player.id);
            if (run !== this.generation) return;
            this.validateDice(dice);
            model.lastDice = dice;
            this.replayRecorder?.recordDice(player.id, dice.first, dice.second);
            await this.diceController?.roll(dice, GAME_RULES.diceTimeoutSeconds);
            if (run !== this.generation) return;

            const total = dice.first + dice.second;
            const isDouble = dice.first === dice.second;
            this.cameraController?.diceReveal(total, isDouble);
            this.cameraController?.impact(CameraImpactCue.DiceLand);
            this.playAudio(AudioCue.DiceLand);
            this.hud?.showDiceReveal(player.name, dice.first, dice.second, isDouble);
            await this.delay(CLASSIC_PRESENTATION_TIMING.diceRevealHoldMs);
            if (run !== this.generation) return;

            if (isDouble) {
                this.playAudio(AudioCue.DoubleBonus);
                this.playVfx(VfxCue.DoubleBonus, new Vec3(0, 0.5, 0), '#ffe27a', 8, 1.2);
            } else if (total >= 10) {
                this.playVfx(VfxCue.DicePower, new Vec3(0, 0.5, 0), '#ff7e37', 5, 0.8);
            }
            const islandRoll = model.resolveIslandRoll(dice.first === dice.second);
            if (islandRoll.message) this.render(islandRoll.message);
            if (!islandRoll.canMove) {
                this.boardView?.playPlayerAnimation(player.id, PlayerAnimationState.IslandIdle);
                await this.finishTurn(run);
                return;
            }
            const move = model.moveCurrent(total);
            this.replayRecorder?.recordMovement(player.id, move.path);
            this.render(`Rolled ${total}. ${player.name} moves ${total} spaces.`);
            this.boardView?.showMovementRoute(move.path, player.color);
            const movementDestination = model.board[move.path[move.path.length - 1] ?? player.tileIndex];
            if (movementDestination) this.cameraController?.movementFocus(movementDestination.worldPosition);
            await this.boardView?.move(player, move.path, this.playerStepDuration, (tileIndex) => {
                const tile = model.board[tileIndex];
                if (!tile) return;
                this.boardView?.highlightTile(tileIndex, player.color);
                this.eventBus.emit(GameEvents.PlayerMovement, tileIndex);
                this.playVfx(VfxCue.MovementStep, tile.worldPosition, player.color);
            });
            this.boardView?.clearMovementRoute();
            if (run !== this.generation) return;

            const tile = model.board[player.tileIndex];
            if (tile) {
                this.boardView?.highlightTile(tile.index, player.color);
                this.boardView?.playLandingCelebration(tile.index, player.color);
                this.cameraController?.landingSequence(tile.worldPosition, tile.tileType !== TileType.City);
                this.cameraController?.impact(
                    tile.tileType === TileType.Tax
                        ? CameraImpactCue.Hit
                        : CameraImpactCue.PlayerLand,
                );
                this.playVfx(VfxCue.LandingPulse, tile.worldPosition, player.color, 3, 0.55);
                this.playAudio(AudioCue.PlayerLand);
                await this.delay(CLASSIC_PRESENTATION_TIMING.tileFocusHoldMs);
                if (run !== this.generation) return;
            }
            const landing = model.resolveLanding();
            if (tile) this.playLandingAnimation(player.id, player.islandTurns, tile.tileType);
            if (model.pendingWorldTravelDecision) {
                this.boardView?.showTravelDestinations(model.pendingWorldTravelDecision.destinationIndices);
            }
            if (model.pendingOlympicDecision) {
                this.boardView?.showOlympicDestinations(model.pendingOlympicDecision.propertyIndices);
            }
            const salary = move.startsPassed > 0 ? ` START bonus +CP ${GAME_RULES.startSalary.toLocaleString('en-US')}.` : '';
            if (move.startsPassed > 0) {
                const startTile = model.board[0];
                if (startTile) this.playVfx(VfxCue.CoinBurst, startTile.worldPosition, '#f5c323', 9, 1.15);
            }
            const landingMessage = `${landing.message}${salary}`;
            if (tile) {
                this.hud?.showLandingCard(
                    player.name,
                    tile.displayName,
                    tile.tileType,
                    landingMessage,
                    player.color,
                );
            }
            this.render(landingMessage);

            if (model.hasPendingFortuneCard) await this.resolveFortuneCard(run);
            if (run !== this.generation) return;

            if (model.hasPendingPaymentDecision && player.bot) {
                await this.delay(this.botThinkDelay * 1000);
                if (run !== this.generation) return;
                const decision = model.pendingPaymentDecision;
                const takeOver = decision ? this.botDecision.shouldTakeOver(player, decision) : false;
                await this.resolvePaymentDecision(takeOver, run);
                return;
            }

            if (model.hasPendingGameCenterDecision && player.bot) {
                await this.delay(this.botThinkDelay * 1000);
                if (run !== this.generation) return;
                const decision = model.pendingGameCenterDecision;
                const selectedNumber = decision
                    ? this.botDecision.chooseGameCenterOption(player, decision)
                    : undefined;
                if (selectedNumber !== undefined) await this.resolveGameCenterChoice(selectedNumber, run);
                return;
            }

            if (model.hasPendingWorldTravelDecision && player.bot) {
                await this.delay(this.botThinkDelay * 1000);
                if (run !== this.generation) return;
                const decision = model.pendingWorldTravelDecision;
                const destination = decision
                    ? this.botDecision.chooseWorldTravelDestination(
                        player,
                        model.worldTravelDestinations(),
                        decision.cost,
                    )
                    : undefined;
                if (destination !== undefined) await this.resolveWorldTravelDestination(destination, run);
                return;
            }

            if (model.hasPendingOlympicDecision && player.bot) {
                await this.delay(this.botThinkDelay * 1000);
                if (run !== this.generation) return;
                const destination = this.botDecision.chooseOlympicDestination(model.olympicDestinations());
                if (destination !== undefined) await this.resolveOlympicDestination(destination, run);
                return;
            }

            if (player.bot && model.hasPendingPropertyDecision) this.resolveBotPropertyDecision();
            if (!model.hasPendingPropertyDecision
                && !model.hasPendingPaymentDecision
                && !model.hasPendingFortuneCard
                && !model.hasPendingWorldTravelDecision
                && !model.hasPendingOlympicDecision
                && !model.hasPendingGameCenterDecision) {
                await this.finishTurn(run);
            }
        } catch (error: unknown) {
            if (run === this.generation) {
                console.error('[ComePlayers] Roll sequence failed.', error);
                this.render('The roll failed. Press RESTART to recover the match.');
            }
        } finally {
            if (run === this.generation) {
                this.busy = false;
                this.hud?.setBusy(false, model);
            }
        }
    }

    private activateCharacterSkill(): void {
        const model = this.model;
        const character = this.activeCharacter;
        if (!model || !character || this.activeSkillUsed || this.busy || this.tutorial.isActive || this.settings.isActive || model.finished) return;
        if (model.currentPlayer.bot || model.hasPendingPropertyDecision || model.hasPendingPaymentDecision || model.hasPendingFortuneCard || model.hasPendingWorldTravelDecision || model.hasPendingOlympicDecision || model.hasPendingGameCenterDecision) return;

        const result = this.characterSkill.activate(character, model.currentPlayer);
        if (!result.ok) {
            this.render(result.message);
            return;
        }
        this.activeSkillUsed = true;
        this.hud?.setSkillState(character.activeSkill.name, false, 'USED THIS MATCH');
        this.playAudio(AudioCue.UIConfirm);
        this.playVfx(VfxCue.CardReveal, new Vec3(0, 0.72, 0), model.currentPlayer.color, 6, 1.15);
        this.render(result.message);
    }

    private confirmProperty(targetLevel?: number): void {
        const model = this.model;
        const decision = model?.pendingPropertyDecision;
        if (!model || this.busy || !decision) return;
        const tile = model.board[decision.tileIndex];
        if (!tile) return;

        const selectedOption = model.propertyDevelopmentOptions().find((option) => option.targetLevel === targetLevel);
        const state = model.confirmPropertyDecision(targetLevel);
        if (state) {
            this.cameraController?.propertyFocus(tile.worldPosition);
            this.cameraController?.impact(CameraImpactCue.Property);
            this.playAudio(
                decision.kind === 'PURCHASE'
                    ? AudioCue.PropertyPurchase
                    : AudioCue.BuildingUpgrade,
            );
            this.playVfx(
                decision.kind === 'PURCHASE' ? VfxCue.PropertyPurchase : VfxCue.BuildingUpgrade,
                tile.worldPosition,
                model.currentPlayer.color,
                decision.kind === 'PURCHASE' ? 6 : 5,
                0.78,
            );
            if (decision.kind === 'PURCHASE') {
                this.playVfx(VfxCue.CoinBurst, tile.worldPosition, '#f5c323', 6, 0.7);
            }
            this.boardView?.updateProperty(tile.index, model.currentPlayer.color, state.buildingLevel);
            this.boardView?.playPlayerAnimation(model.currentPlayer.id, PlayerAnimationState.Celebrate);
            if (!model.currentPlayer.bot) this.incrementMatchActivity('propertyActions');
            const plan = selectedOption ? ` ${selectedOption.label} plan` : '';
            this.render(decision.kind === 'PURCHASE'
                ? `${tile.displayName} was purchased with the${plan}. Rent is now CP ${model.rentAt(tile.index).toLocaleString('en-US')}.`
                : `${tile.displayName} reached ${BUILDING_LEVEL_NAMES[state.buildingLevel] ?? `level ${state.buildingLevel}`}. Rent is now CP ${model.rentAt(tile.index).toLocaleString('en-US')}.`);
            this.busy = true;
            this.hud?.setBusy(true, model);
            void this.finishTurn(this.generation);
        } else {
            this.render('Insufficient balance for this property action. Choose SKIP.');
        }
    }

    private nextTutorial(): void {
        if (!this.model || !this.tutorial.isActive) return;
        this.playAudio(AudioCue.UIConfirm);
        const snapshot = this.tutorial.next();
        this.render(snapshot.active
            ? `Tutorial ${snapshot.stepIndex + 1}/${snapshot.totalSteps}: ${snapshot.step.title}.`
            : 'Tutorial complete. Press ROLL when you are ready.');
    }

    private skipTutorial(): void {
        if (!this.model || !this.tutorial.isActive) return;
        this.playAudio(AudioCue.UICancel);
        this.tutorial.skip();
        this.render('Tutorial skipped. GUIDE can reopen it at any time.');
    }

    private openTutorial(): void {
        const model = this.model;
        if (!model || !this.canOpenTutorial(model)) return;
        this.playAudio(AudioCue.UIConfirm);
        this.tutorial.open();
        this.render('Tutorial opened. The turn timer is paused.');
    }

    private canOpenTutorial(model: MatchModel): boolean {
        return !this.settings.isActive && this.canOpenIdleModal(model);
    }

    private openSettings(): void {
        const model = this.model;
        if (!model || this.tutorial.isActive || !this.canOpenIdleModal(model)) return;
        this.playAudio(AudioCue.UIConfirm);
        this.settings.open();
        this.render('Match paused. Settings are saved automatically.');
    }

    private closeSettings(): void {
        if (!this.model || !this.settings.isActive) return;
        this.playAudio(AudioCue.UIConfirm);
        this.settings.close();
        this.render('Match resumed.');
    }

    private adjustMusicVolume(delta: number): void {
        if (!this.model || !this.settings.isActive) return;
        const snapshot = this.settings.adjustMusicVolume(delta);
        this.audioManager?.setVolumes(snapshot.musicVolume, snapshot.soundVolume);
        if (snapshot.musicVolume > 0) {
            this.playAudio(AudioCue.MatchMusic);
            this.playAudio(AudioCue.BoardAmbience);
        }
        this.render(`Music volume ${Math.round(snapshot.musicVolume * 100)}%.`);
    }

    private adjustSoundVolume(delta: number): void {
        if (!this.model || !this.settings.isActive) return;
        const snapshot = this.settings.adjustSoundVolume(delta);
        this.audioManager?.setVolumes(snapshot.musicVolume, snapshot.soundVolume);
        this.playAudio(AudioCue.UIConfirm);
        this.render(`SFX volume ${Math.round(snapshot.soundVolume * 100)}%.`);
    }

    private toggleReducedCameraMotion(): void {
        if (!this.model || !this.settings.isActive) return;
        const snapshot = this.settings.toggleReducedCameraMotion();
        this.playAudio(AudioCue.UIConfirm);
        this.cameraController?.setReducedMotion(snapshot.reducedCameraMotion);
        this.render(snapshot.reducedCameraMotion
            ? 'Reduce Camera Motion is on.'
            : 'Reduce Camera Motion is off.');
    }

    private canOpenIdleModal(model: MatchModel): boolean {
        return !this.busy
            && !model.finished
            && !model.currentPlayer.bot
            && !model.hasPendingPropertyDecision
            && !model.hasPendingPaymentDecision
            && !model.hasPendingFortuneCard
            && !model.hasPendingWorldTravelDecision
            && !model.hasPendingOlympicDecision
            && !model.hasPendingGameCenterDecision;
    }

    private skip(): void {
        const model = this.model;
        if (!model || this.busy || !model.hasPendingPropertyDecision) return;
        this.playAudio(AudioCue.UICancel);
        model.skipPropertyDecision();
        this.render('Property action skipped.');
        this.busy = true;
        this.hud?.setBusy(true, model);
        void this.finishTurn(this.generation);
    }

    private resolvePlayerPayment(takeOver: boolean): void {
        const model = this.model;
        if (!model || this.busy || !model.hasPendingPaymentDecision || model.currentPlayer.bot) return;
        this.busy = true;
        this.hud?.setBusy(true, model);
        const run = this.generation;
        void this.resolvePaymentDecision(takeOver, run).catch((error: unknown) => {
            if (run !== this.generation) return;
            console.error('[ComePlayers] Payment sequence failed.', error);
            this.busy = false;
            this.render('The payment could not be processed. Choose CONTINUE or press RESTART.');
            this.hud?.setBusy(false, model);
        });
    }

    private selectWorldTravel(tileIndex: number): void {
        const model = this.model;
        if (!model || this.busy || !model.hasPendingWorldTravelDecision || model.currentPlayer.bot) return;
        this.playAudio(AudioCue.UIConfirm);
        this.busy = true;
        this.hud?.setBusy(true, model);
        const run = this.generation;
        void this.resolveWorldTravelDestination(tileIndex, run).catch((error: unknown) => {
            if (run !== this.generation) return;
            console.error('[ComePlayers] World Travel sequence failed.', error);
            this.busy = false;
            this.render('World Travel could not be completed. Choose another destination or press RESTART.');
            this.hud?.setBusy(false, model);
        });
    }

    private selectOlympic(tileIndex: number): void {
        const model = this.model;
        if (!model || this.busy || !model.hasPendingOlympicDecision || model.currentPlayer.bot) return;
        this.playAudio(AudioCue.UIConfirm);
        this.busy = true;
        this.hud?.setBusy(true, model);
        const run = this.generation;
        void this.resolveOlympicDestination(tileIndex, run).catch((error: unknown) => {
            if (run !== this.generation) return;
            console.error('[ComePlayers] Olympic sequence failed.', error);
            this.busy = false;
            this.render('The Olympic boost could not be applied. Choose another city or press RESTART.');
            this.hud?.setBusy(false, model);
        });
    }

    private selectFortuneCard(cardId: string): void {
        const model = this.model;
        if (!model || this.busy || model.currentPlayer.bot || model.fortuneChoiceCards.length === 0) return;
        const card = model.selectFortuneCard(cardId);
        if (!card) {
            this.render('That Fortune card is no longer available. Choose another card.');
            return;
        }
        this.playAudio(AudioCue.UIConfirm);
        this.busy = true;
        this.hud?.setBusy(true, model);
        const run = this.generation;
        void this.resolveFortuneCard(run)
            .then(async () => {
                if (run !== this.generation || model.hasPendingFortuneCard) return;
                if (!model.hasPendingPropertyDecision
                    && !model.hasPendingPaymentDecision
                    && !model.hasPendingWorldTravelDecision
                    && !model.hasPendingOlympicDecision
                    && !model.hasPendingGameCenterDecision) {
                    await this.finishTurn(run);
                }
            })
            .catch((error: unknown) => {
                if (run !== this.generation) return;
                console.error('[ComePlayers] Fortune selection failed.', error);
                this.render('Fortune Signal could not resolve the selected card. Press RESTART to recover.');
            })
            .finally(() => {
                if (run !== this.generation) return;
                this.busy = false;
                this.hud?.setBusy(false, model);
            });
    }

    private selectGameCenter(selectedNumber: number): void {
        const model = this.model;
        if (!model || this.busy || !model.hasPendingGameCenterDecision || model.currentPlayer.bot) return;
        this.playAudio(AudioCue.UIConfirm);
        this.busy = true;
        this.hud?.setBusy(true, model);
        const run = this.generation;
        void this.resolveGameCenterChoice(selectedNumber, run).catch((error: unknown) => {
            if (run !== this.generation) return;
            console.error('[ComePlayers] Game Center sequence failed.', error);
            this.busy = false;
            this.render('Game Center could not process the selection. Choose again or press RESTART.');
            this.hud?.setBusy(false, model);
        });
    }

    private resolveBotPropertyDecision(): void {
        const model = this.model;
        const decision = model?.pendingPropertyDecision;
        if (!model || !decision) return;
        const tile = model.board[decision.tileIndex];
        if (!tile) return;

        const currentLevel = model.propertyAt(tile.index)?.buildingLevel ?? 0;
        const shouldConfirm = decision.kind === 'PURCHASE'
            ? this.botDecision.shouldBuy(model.currentPlayer, tile, model.teamPropertyIndices(model.currentPlayer.id))
            : this.botDecision.shouldUpgrade(model.currentPlayer, currentLevel, decision.cost);
        const developmentOptions = model.propertyDevelopmentOptions().filter((option) => option.affordable);
        const safeOptions = developmentOptions.filter((option) => option.reserveRisk !== 'DANGER');
        const candidateOptions = safeOptions.length > 0 ? safeOptions : developmentOptions;
        const selectedOption = candidateOptions[candidateOptions.length - 1];
        const state = shouldConfirm ? model.confirmPropertyDecision(selectedOption?.targetLevel) : undefined;
        if (state) {
            this.cameraController?.propertyFocus(tile.worldPosition);
            this.cameraController?.impact(CameraImpactCue.Property);
            this.playAudio(AudioCue.PropertyBuild);
            this.playVfx(
                decision.kind === 'PURCHASE' ? VfxCue.PropertyPurchase : VfxCue.BuildingUpgrade,
                tile.worldPosition,
                model.currentPlayer.color,
            );
            this.boardView?.updateProperty(tile.index, model.currentPlayer.color, state.buildingLevel);
            this.boardView?.playPlayerAnimation(model.currentPlayer.id, PlayerAnimationState.Celebrate);
            this.render(decision.kind === 'PURCHASE'
                ? `${model.currentPlayer.name} developed ${tile.displayName} to ${BUILDING_LEVEL_NAMES[state.buildingLevel] ?? `level ${state.buildingLevel}`}.`
                : `${model.currentPlayer.name} upgraded ${tile.displayName} to ${BUILDING_LEVEL_NAMES[state.buildingLevel] ?? `level ${state.buildingLevel}`}.`);
        } else {
            model.skipPropertyDecision();
            this.render(`${model.currentPlayer.name} skipped the action at ${tile.displayName}.`);
        }
    }

    private async resolveFortuneCard(run: number): Promise<void> {
        const model = this.model;
        if (!model || run !== this.generation) return;
        let card = model.pendingFortuneCard;
        if (!card && model.fortuneChoiceCards.length > 0) {
            if (!model.currentPlayer.bot) {
                this.render('Fortune Signal is open. Choose one of the three cards.');
                return;
            }
            const cardId = this.botDecision.chooseFortuneCard(model.currentPlayer, model.fortuneChoiceCards);
            if (cardId) card = model.selectFortuneCard(cardId) ?? null;
        }
        if (!card) return;

        this.cameraController?.cardFocus();
        this.cameraController?.impact(CameraImpactCue.CardReveal);
        this.playAudio(AudioCue.CardReveal);
        this.playVfx(VfxCue.CardReveal, new Vec3(0, 0.25, 0));
        this.render(`${card.title} revealed. Applying its effect...`);
        await this.delay(CLASSIC_PRESENTATION_TIMING.fortuneRevealHoldMs);
        if (run !== this.generation) return;

        const result = model.resolvePendingFortuneCard();
        if (!result) return;
        for (const movement of result.movements) {
            const movedPlayer = model.players.find((entry) => entry.id === movement.playerId);
            if (!movedPlayer) continue;
            this.boardView?.showMovementRoute(movement.path, movedPlayer.color);
            const fortuneDestination = model.board[movement.path[movement.path.length - 1] ?? movedPlayer.tileIndex];
            if (fortuneDestination) this.cameraController?.movementFocus(fortuneDestination.worldPosition);
            await this.boardView?.move(movedPlayer, movement.path, this.playerStepDuration, (tileIndex) => {
                const tile = model.board[tileIndex];
                if (tile) {
                    this.boardView?.highlightTile(tileIndex, movedPlayer.color);
                    this.eventBus.emit(GameEvents.PlayerMovement, tileIndex);
                    this.playVfx(VfxCue.MovementStep, tile.worldPosition, movedPlayer.color);
                }
            });
            this.boardView?.clearMovementRoute();
            this.boardView?.highlightTile(movedPlayer.tileIndex, movedPlayer.color);
            this.boardView?.playLandingCelebration(movedPlayer.tileIndex, movedPlayer.color);
            this.boardView?.playPlayerAnimation(movedPlayer.id, PlayerAnimationState.Land);
            if (run !== this.generation) return;
        }
        for (const tileIndex of result.changedPropertyIndices) {
            const state = model.propertyAt(tileIndex);
            const owner = model.ownerOf(tileIndex);
            if (state && owner) {
                this.boardView?.updateProperty(tileIndex, owner.color, state.buildingLevel);
                const tile = model.board[tileIndex];
                if (tile) this.playVfx(VfxCue.BuildingUpgrade, tile.worldPosition, owner.color, 4, 0.65);
            }
        }
        this.playAudio(AudioCue.CardResolve);
        this.render(`${card.title}: ${result.message}`);
        await this.delay(500);
    }

    private async resolveWorldTravelDestination(tileIndex: number, run: number): Promise<void> {
        const model = this.model;
        if (!model || run !== this.generation) return;
        const player = model.currentPlayer;
        const result = model.confirmWorldTravelDestination(tileIndex);
        const tile = model.board[tileIndex];
        if (!result || !tile) {
            this.busy = false;
            this.render('Invalid World Travel destination. Choose a highlighted space.');
            this.hud?.setBusy(false, model);
            return;
        }

        this.boardView?.clearTravelDestinations();
        if (!player.bot) this.incrementMatchActivity('worldTravels');
        this.playAudio(AudioCue.Travel);
        this.playVfx(VfxCue.Travel, tile.worldPosition, undefined, 4, 0.65);
        this.cameraController?.focus(tile.worldPosition);
        this.cameraController?.impact(CameraImpactCue.Travel);
        this.render(result.usedFreeTicket
            ? `${player.name} used a free ticket to travel to ${tile.displayName}.`
            : `${player.name} paid CP ${result.paid.toLocaleString('en-US')} to travel to ${tile.displayName}.`);
        this.boardView?.showMovementRoute(result.path, player.color);
        this.cameraController?.movementFocus(tile.worldPosition);
        await this.boardView?.move(player, result.path, this.playerStepDuration * 2, (destinationIndex) => {
            const destination = model.board[destinationIndex];
            if (destination) {
                this.boardView?.highlightTile(destinationIndex, player.color);
                this.eventBus.emit(GameEvents.PlayerMovement, destinationIndex);
                this.playVfx(VfxCue.MovementStep, destination.worldPosition, player.color);
            }
        }, PlayerAnimationState.Teleport);
        this.boardView?.clearMovementRoute();
        if (run !== this.generation) return;

        this.boardView?.highlightTile(tile.index, player.color);
        this.boardView?.playLandingCelebration(tile.index, player.color);
        this.cameraController?.landingSequence(tile.worldPosition, true);
        this.playVfx(VfxCue.LandingPulse, tile.worldPosition, player.color, 3, 0.55);
        this.playAudio(AudioCue.PlayerLand);
        const landing = model.resolveLanding();
        this.playLandingAnimation(player.id, player.islandTurns, tile.tileType);
        const landingMessage = `Arrived at ${tile.displayName}. ${landing.message}`;
        this.hud?.showLandingCard(player.name, tile.displayName, tile.tileType, landingMessage, player.color);
        this.render(landingMessage);
        if (player.bot && model.hasPendingPaymentDecision) {
            const decision = model.pendingPaymentDecision;
            const takeOver = decision ? this.botDecision.shouldTakeOver(player, decision) : false;
            await this.resolvePaymentDecision(takeOver, run);
            return;
        }
        if (player.bot && model.hasPendingPropertyDecision) this.resolveBotPropertyDecision();
        if (!model.hasPendingPropertyDecision && !model.hasPendingPaymentDecision) {
            await this.finishTurn(run);
        } else {
            this.busy = false;
            this.hud?.setBusy(false, model);
        }
    }

    private async resolveOlympicDestination(tileIndex: number, run: number): Promise<void> {
        const model = this.model;
        if (!model || run !== this.generation) return;
        const destination = model.olympicDestinations().find((entry) => entry.tileIndex === tileIndex);
        const result = model.confirmOlympicDestination(tileIndex);
        const tile = model.board[tileIndex];
        if (!destination || !result || !tile) {
            this.busy = false;
            this.render('Invalid Olympic city. Choose a highlighted city.');
            this.hud?.setBusy(false, model);
            return;
        }

        this.boardView?.clearOlympicDestinations();
        this.playAudio(AudioCue.BuildingUpgrade);
        this.playVfx(VfxCue.Olympic, tile.worldPosition, undefined, 5, 0.72);
        this.boardView?.updateOlympic(tileIndex, result.multiplier);
        this.boardView?.playPlayerAnimation(model.currentPlayer.id, PlayerAnimationState.Celebrate);
        this.cameraController?.propertyFocus(tile.worldPosition);
        this.cameraController?.impact(CameraImpactCue.Property);
        this.render(`${tile.displayName} is now an Olympic city at x${result.multiplier}. Rent CP ${destination.currentRent.toLocaleString('en-US')} -> CP ${destination.projectedRent.toLocaleString('en-US')}.`);
        await this.delay(CLASSIC_PRESENTATION_TIMING.specialResultHoldMs);
        if (run !== this.generation) return;
        await this.finishTurn(run);
    }

    private async resolveGameCenterChoice(selectedNumber: number, run: number): Promise<void> {
        const model = this.model;
        if (!model || run !== this.generation) return;
        const player = model.currentPlayer;
        const result = model.confirmGameCenterOption(selectedNumber);
        if (!result) {
            this.busy = false;
            this.render('Invalid Game Center choice. Select one of the available signals.');
            this.hud?.setBusy(false, model);
            return;
        }

        this.hud?.showGameCenterResult(result);
        this.playAudio(result.won ? AudioCue.GameCenterWin : AudioCue.UICancel);
        if (result.won && !player.bot) this.incrementMatchActivity('gameCenterWins');
        if (result.won) {
            const tile = model.board[player.tileIndex];
            if (tile) {
                this.playVfx(VfxCue.Celebration, tile.worldPosition, player.color, 5, 0.9);
                this.playVfx(VfxCue.CoinBurst, tile.worldPosition, '#f5c323', 9, 1.15);
            }
            this.cameraController?.impact(CameraImpactCue.Celebration);
        }
        this.boardView?.playPlayerAnimation(
            player.id,
            result.won ? PlayerAnimationState.Celebrate : PlayerAnimationState.Sad,
        );
        this.render(result.won
            ? `${player.name} won ${result.laneTitle}: gross CP ${result.grossReward.toLocaleString('en-US')}, net +CP ${result.netChange.toLocaleString('en-US')}.`
            : `${player.name} missed ${result.laneTitle}; target ${result.targetNumber}, entry -CP ${result.entryCost.toLocaleString('en-US')}.`);
        await this.delay(CLASSIC_PRESENTATION_TIMING.gameCenterResultHoldMs);
        if (run !== this.generation) return;
        this.hud?.clearGameCenterResult();
        await this.finishTurn(run);
    }

    private async resolvePaymentDecision(takeOver: boolean, run: number): Promise<void> {
        const model = this.model;
        if (!model || run !== this.generation) return;
        const player = model.currentPlayer;
        const paymentDecision = model.pendingPaymentDecision;
        let resolution = model.completePaymentDecision(takeOver);
        if (!resolution && takeOver) resolution = model.completePaymentDecision(false);
        if (!resolution) {
            this.busy = false;
            this.render('Invalid payment decision. Press CONTINUE or RESTART.');
            this.hud?.setBusy(false, model);
            return;
        }

        const liquidationRecords = paymentDecision?.liquidation.records ?? [];
        const liquidatedTiles = Array.from(new Set(liquidationRecords.map((record) => record.tileIndex)));
        for (const tileIndex of liquidatedTiles) {
            const state = model.propertyAt(tileIndex);
            const owner = model.ownerOf(tileIndex);
            const releasedToBank = !state || !owner;
            if (state && owner) this.boardView?.updateProperty(tileIndex, owner.color, state.buildingLevel);
            else this.boardView?.clearProperty(tileIndex);
            this.boardView?.playLiquidationSequence(tileIndex, releasedToBank, player.color);
            const liquidatedTile = model.board[tileIndex];
            if (liquidatedTile) {
                this.playVfx(
                    releasedToBank ? VfxCue.LandingPulse : VfxCue.CoinBurst,
                    liquidatedTile.worldPosition,
                    releasedToBank ? '#ff735c' : '#ffcc67',
                    releasedToBank ? 5 : 4,
                    releasedToBank ? 0.78 : 0.62,
                );
            }
        }
        if (liquidationRecords.length > 0) {
            this.cameraController?.impact(player.bankrupt ? CameraImpactCue.Hit : CameraImpactCue.Property);
            this.render(player.bankrupt
                ? `${player.name} liquidated all available assets but still could not cover the rent.`
                : `${player.name} recovered CP ${(paymentDecision?.liquidation.recovered ?? 0).toLocaleString('en-US')} through automatic asset liquidation.`);
            await this.delay(420);
            if (run !== this.generation) return;
        }

        const tile = model.board[resolution.tileIndex];
        if (tile) this.cameraController?.propertyFocus(tile.worldPosition);
        this.cameraController?.impact(
            resolution.tookOver ? CameraImpactCue.Property : CameraImpactCue.Hit,
        );
        if (resolution.tookOver && resolution.state) {
            if (!player.bot) this.incrementMatchActivity('takeovers');
            const previousOwner = paymentDecision
                ? model.players.find((entry) => entry.id === paymentDecision.ownerId)
                : undefined;
            const strategy = paymentDecision?.takeoverStrategy;
            const highImpact = Boolean(
                strategy?.completesColorMonopoly
                || strategy?.breaksRivalColorMonopoly
                || (strategy?.victoryProgressGain ?? 0) >= 0.20,
            );
            this.boardView?.updateProperty(resolution.tileIndex, player.color, resolution.state.buildingLevel);
            this.boardView?.playTakeoverSequence(
                resolution.tileIndex,
                previousOwner?.color ?? '#ff735c',
                player.color,
                highImpact,
            );
            if (tile) {
                this.playVfx(VfxCue.PropertyPurchase, tile.worldPosition, player.color, highImpact ? 9 : 6, highImpact ? 1.05 : 0.78);
                this.playVfx(VfxCue.CoinBurst, tile.worldPosition, '#f5c323', highImpact ? 10 : 6, highImpact ? 0.96 : 0.72);
            }
            if (highImpact) this.cameraController?.impact(CameraImpactCue.Celebration);
        }
        this.boardView?.playPlayerAnimation(
            player.id,
            player.bankrupt
                ? PlayerAnimationState.Sad
                : resolution.tookOver
                    ? PlayerAnimationState.Celebrate
                    : PlayerAnimationState.Hit,
        );
        this.playAudio(resolution.tookOver ? AudioCue.PropertyPurchase : AudioCue.PropertyPayment);
        this.render(resolution.message);
        await this.delay(CLASSIC_PRESENTATION_TIMING.specialResultHoldMs);
        if (run !== this.generation) return;
        await this.finishTurn(run);
    }

    private async finishTurn(run: number): Promise<void> {
        const model = this.model;
        if (!model) return;
        this.boardView?.clearTravelDestinations();
        this.boardView?.clearOlympicDestinations();
        this.hud?.clearGameCenterResult();
        await this.delay(CLASSIC_PRESENTATION_TIMING.resolutionHoldMs);
        if (run !== this.generation) return;

        const isDouble = model.lastDice.first === model.lastDice.second;
        const advance = model.completeTurn(isDouble);
        if (advance.matchFinished) {
            this.timer.stop();
            this.playAudio(AudioCue.MatchWin);
            this.playVfx(VfxCue.Celebration, new Vec3(0, 0.2, 0), model.winner().color, 10, 2.1);
            this.cameraController?.resultFocus();
            this.cameraController?.impact(CameraImpactCue.Celebration);
            const summary = model.resultSummary();
            this.refreshLiveAcademyObjective();
            const liveAcademyHeadline = this.finalizeLiveAcademyObjective();
            let replayAcademy: ReplayAcademySnapshot | null = null;
            const replayRecord = this.replayRecorder?.finish(summary, this.replayLibrary.nextReplayId()) ?? null;
            if (replayRecord) {
                const replaySave = this.replayLibrary.saveRecord(replayRecord);
                replayAcademy = replaySave.snapshot.academy;
                console.info(`[ComePlayers] ${replaySave.message}`);
            }
            const winner = model.winner();
            const winningTeam = model.winningTeamId();
            const victoryLabel = model.victoryLabel();
            const victor = winningTeam ? `TEAM ${winningTeam}` : winner.name.toUpperCase();
            this.hud?.showMatchIntro(
                victoryLabel ? 'CLASSIC VICTORY CONDITION' : 'MATCH RESULT',
                victoryLabel || 'WIN!',
                victoryLabel
                    ? `${victor} completed the board objective and wins instantly.`
                    : `${victor} finished the match in first place.`,
            );
            await this.delay(CLASSIC_PRESENTATION_TIMING.victoryBannerHoldMs);
            if (run !== this.generation) return;
            this.hud?.hideMatchIntro();
            const human = model.players.find((entry) => !entry.bot);
            let careerReward: CareerMatchReward | null = null;
            if (human) {
                let reward = this.careerProgression.recordMatch(summary, human.id, this.matchActivity);
                if (reward.persisted) {
                    const creditResult = this.characterProgression.grantCredits(reward.totalCredits, 'Career reward');
                    if (!creditResult.ok) {
                        reward = {
                            ...reward,
                            persisted: false,
                            totalCredits: 0,
                            legacyMilestoneCredits: 0,
                            journeyMissionCredits: 0,
                            journeyTierCredits: 0,
                            journeyPerfectCycleCredits: 0,
                            journeyPrestigeCredits: 0,
                            journeyRivalCredits: 0,
                            journeyRivalExperience: 0,
                            journeyRivalRatingChange: 0,
                            journeyExperienceGained: 0,
                            journeyStreakBonusExperience: 0,
                            completedMissionTitles: [],
                            completedLegacyMilestoneTitles: [],
                            completedJourneyMissionTitles: [],
                            completedJourneyRivalContractTitles: [],
                            completedJourneyPerfectCycleLabels: [],
                            unlockedJourneyTierLabels: [],
                            unlockedJourneyPrestigeLabels: [],
                            archivedJourneySeasonLabels: [],
                        };
                    }
                }
                careerReward = reward;
                this.hud?.setCareerReward(reward);
                if (this.rankedMode) {
                    const rankedReward = this.rankedProgression.recordMatch(summary, human.id, this.botDifficulty);
                    this.hud?.setRankedReward(rankedReward);
                    if (rankedReward.promoted) {
                        this.playAudio(AudioCue.LevelUp);
                        this.playVfx(VfxCue.LevelUp, new Vec3(0, 0.35, 0), '#f5c323', 10, 1.75);
                    }
                }
                if (reward.levelAfter > reward.levelBefore) {
                    this.playAudio(AudioCue.LevelUp);
                    this.playVfx(VfxCue.LevelUp, new Vec3(0, 0.25, 0), '#8be9ff', 8, 1.55);
                }
            }
            const legacyAwards = model.matchAwards();
            this.boardView?.showResultAnimations(model.players, winner.id, winningTeam);
            this.boardView?.showResultAwards(model.players, legacyAwards.awards);
            if (human && careerReward) {
                this.boardView?.showCareerLegacyHighlight(
                    human.id,
                    human.color,
                    careerReward.performanceGrade,
                    careerReward.performanceScore,
                );
                if (
                    careerReward.completedJourneyMissionTitles.length > 0
                    || careerReward.completedJourneyRivalContractTitles.length > 0
                    || careerReward.completedJourneyRivalGauntletTitles.length > 0
                    || careerReward.completedJourneyPerfectCycleLabels.length > 0
                    || careerReward.unlockedJourneyTierLabels.length > 0
                    || careerReward.unlockedJourneyPrestigeLabels.length > 0
                    || careerReward.archivedJourneySeasonLabels.length > 0
                ) {
                    this.boardView?.showWorldJourneyHighlight(
                        human.id,
                        human.color,
                        careerReward.snapshot.journey.completedTierCount,
                        careerReward.completedJourneyMissionTitles.length
                            + careerReward.completedJourneyRivalContractTitles.length
                            + careerReward.completedJourneyRivalGauntletTitles.length
                            + careerReward.completedJourneyPerfectCycleLabels.length
                            + careerReward.unlockedJourneyTierLabels.length
                            + careerReward.unlockedJourneyPrestigeLabels.length
                            + careerReward.archivedJourneySeasonLabels.length,
                        careerReward.snapshot.journey.prestigeLevel,
                        careerReward.archivedJourneySeasonLabels.length,
                    );
                }
                if (
                    careerReward.completedJourneyRivalContractTitles.length > 0
                    || careerReward.journeyRivalRatingChange !== 0
                ) {
                    this.boardView?.showRivalContractHighlight(
                        human.id,
                        human.color,
                        careerReward.snapshot.journey.localRivalRank,
                        careerReward.completedJourneyRivalContractTitles.length,
                        careerReward.journeyRivalRatingChange,
                    );
                }
                if (
                    careerReward.completedJourneyRivalGauntletTitles.length > 0
                    || careerReward.journeyRivalGauntletScoreGained > 0
                ) {
                    this.boardView?.showRivalGauntletHighlight(
                        human.id,
                        human.color,
                        careerReward.snapshot.journey.rivalGauntletScore,
                        careerReward.snapshot.journey.completedRivalGauntletCount,
                        careerReward.snapshot.journey.rivalPodiumStreak,
                    );
                }
            }
            const awardHeadline = legacyAwards.awards.slice(0, 3)
                .map((award) => `${award.title}: ${award.playerName.toUpperCase()}`)
                .join('  •  ');
            const legacyHeadline = careerReward
                ? `HIGHLIGHT: ${careerReward.matchHighlightTitle}  •  GRADE ${careerReward.performanceGrade} ${careerReward.performanceScore}/100`
                : 'CAREER LEGACY HIGHLIGHT UNAVAILABLE';
            const milestoneHeadline = careerReward?.completedLegacyMilestoneTitles.length
                ? `MILESTONE: ${careerReward.completedLegacyMilestoneTitles.join(' / ')}`
                : `LEGACY: ${careerReward?.snapshot.legacyTier ?? 'NEW LEGACY'}`;
            const journeyHeadline = careerReward?.archivedJourneySeasonLabels.length
                ? `SEASON ARCHIVE: ${careerReward.archivedJourneySeasonLabels.join(' / ')}`
                : careerReward?.unlockedJourneyPrestigeLabels.length
                    ? `PRESTIGE REWARD: ${careerReward.unlockedJourneyPrestigeLabels.join(' / ')}`
                : careerReward?.completedJourneyPerfectCycleLabels.length
                    ? `PERFECT CYCLE: ${careerReward.completedJourneyPerfectCycleLabels.join(' / ')}`
                    : careerReward?.unlockedJourneyTierLabels.length
                        ? `JOURNEY REWARD: ${careerReward.unlockedJourneyTierLabels.join(' / ')}`
                        : careerReward?.completedJourneyMissionTitles.length
                            ? `JOURNEY MISSION: ${careerReward.completedJourneyMissionTitles.join(' / ')}`
                            : `WORLD JOURNEY: TIER ${careerReward?.snapshot.journey.completedTierCount ?? 0}/${careerReward?.snapshot.journey.maxLevel ?? 20}  •  PRESTIGE ${careerReward?.snapshot.journey.prestigeLevel ?? 0}`;
            const rivalHeadline = careerReward?.completedJourneyRivalGauntletTitles.length
                ? `RIVAL GAUNTLET: ${careerReward.completedJourneyRivalGauntletTitles.join(' / ')}`
                : careerReward?.completedJourneyRivalContractTitles.length
                    ? `RIVAL CONTRACT: ${careerReward.completedJourneyRivalContractTitles.join(' / ')}`
                    : `GAUNTLET ${careerReward?.snapshot.journey.rivalGauntletDivision ?? 'OPEN QUALIFIER'}  •  SCORE ${careerReward?.snapshot.journey.rivalGauntletScore ?? 0}  •  PODIUM STREAK ${careerReward?.snapshot.journey.rivalPodiumStreak ?? 0}`;
            const academyHeadline = replayAcademy
                ? `REPLAY ACADEMY: ${replayAcademy.academyTier}  •  AVG ${replayAcademy.averageScore}/100  •  FOCUS ${replayAcademy.focusLabel}  •  TREND ${replayAcademy.trendDelta >= 0 ? '+' : ''}${replayAcademy.trendDelta}`
                : 'REPLAY ACADEMY: COMPLETE A RECORDED MATCH TO GENERATE TRAINING';
            this.hud?.showMatchIntro(
                'LIVE REPLAY ACADEMY  •  V105',
                'FINAL HONORS',
                `${awardHeadline || 'Match awards are being calculated.'}
${legacyHeadline}
${milestoneHeadline}
${journeyHeadline}
${rivalHeadline}
${academyHeadline}
${liveAcademyHeadline}`,
            );
            await this.delay(CLASSIC_PRESENTATION_TIMING.specialResultHoldMs);
            if (run !== this.generation) return;
            this.hud?.hideMatchIntro();
            this.hud?.prepareResultPresentation();
            this.render(victoryLabel
                ? `${winningTeam ? `Team ${winningTeam}` : winner.name} wins by ${victoryLabel}!`
                : winningTeam
                    ? `Match complete. Team ${winningTeam} wins!`
                    : `Match complete. ${winner.name} wins!`);
            const ranking = summary.entries
                .map((entry) => `${entry.rank}:${entry.name}=CP${entry.netWorth}`)
                .join(', ');
            console.info(`[ComePlayers] Match finished. Winner: ${winningTeam ? `Team ${winningTeam}` : winner.name}. Ranking: ${ranking}.`);
            return;
        }

        if (advance.roundEvent) {
            const event = advance.roundEvent;
            this.timer.stop();
            this.playAudio(AudioCue.UIConfirm);
            this.playVfx(VfxCue.Celebration, new Vec3(0, 0.3, 0), event.accentHex, 7, 1.15);
            this.hud?.showMatchIntro('COMEPLAYERS WORLD EVENT', event.title, event.description);
            this.render(`${event.title}: ${event.description}`);
            await this.delay(1_350);
            if (run !== this.generation) return;
            this.hud?.hideMatchIntro();
        }

        this.cameraController?.overview();
        await this.delay(CLASSIC_PRESENTATION_TIMING.overviewSettleMs);
        if (run !== this.generation) return;
        this.beginTurn(
            advance.extraTurn
                ? `${model.currentPlayer.name} earned an extra turn by rolling a double.`
                : `${model.currentPlayer.name}'s turn.`,
            run,
        );
    }

    private async playMatchOpening(run: number): Promise<void> {
        const model = this.model;
        if (!model || run !== this.generation) return;
        this.busy = true;
        this.timer.stop();
        this.hud?.setBusy(true, model);
        const detail = `${model.players.length} PLAYERS  •  ${this.matchMode}  •  ${this.botDifficulty} AI  •  EVENTS ${this.roundEventsEnabled ? 'ON' : 'OFF'}  •  ${this.matchLoadoutMessage.toUpperCase()}`;
        const sequence = ['READY', '3', '2', '1', 'START!'] as const;
        for (const value of sequence) {
            if (run !== this.generation) return;
            this.hud?.showMatchIntro(`SKYLINE CIRCUIT  •  ${this.matchMode} MATCH`, value, detail);
            if (value !== 'READY') this.playAudio(AudioCue.UIConfirm);
            await this.delay(value === 'READY' ? 650 : value === 'START!' ? 700 : 520);
        }
        if (run !== this.generation) return;
        this.hud?.hideMatchIntro();
        this.busy = false;
        this.hud?.setBusy(false, model);
        this.beginTurn('Match ready. Press ROLL.', run);
    }

    private refreshLiveAcademyObjective(): void {
        const model = this.model;
        const objective = this.liveAcademyObjective;
        if (!model || !objective) return;
        const human = model.players.find((entry) => !entry.bot);
        if (!human) return;
        const next = this.liveAcademy.evaluate(objective, {
            fastRolls: this.liveAcademyFastRolls,
            propertyActions: this.matchActivity.propertyActions,
            controlActions: this.matchActivity.worldTravels + this.matchActivity.takeovers,
            cash: human.money,
            bankrupt: human.bankrupt,
            finished: model.finished,
        });
        const newlyCompleted = next.completed && !objective.completed;
        this.liveAcademyObjective = next;
        this.hud?.setLiveAcademyObjective(next);
        if (newlyCompleted && !this.liveAcademyCompletionPresented) {
            this.liveAcademyCompletionPresented = true;
            this.playAudio(AudioCue.LevelUp);
            const tile = model.board[human.tileIndex];
            if (tile) this.playVfx(VfxCue.LevelUp, tile.worldPosition, human.color, 8, 1.25);
        }
    }

    private finalizeLiveAcademyObjective(): string {
        const objective = this.liveAcademyObjective;
        if (!objective) return 'LIVE ACADEMY: NO OBJECTIVE WAS AVAILABLE';
        if (this.liveAcademyRecorded) {
            return objective.completed
                ? `LIVE ACADEMY: ${objective.title} COMPLETE  •  +CP ${this.liveAcademyRewardCredits.toLocaleString('en-US')}`
                : `LIVE ACADEMY: ${objective.title} INCOMPLETE  •  ${objective.progressLabel}`;
        }
        this.liveAcademyRecorded = true;
        const before = this.replayLibrary.snapshot();
        const expectedStreak = objective.completed ? before.liveObjectiveStreak + 1 : 0;
        let rewardCredits = objective.completed ? this.liveAcademy.rewardForStreak(expectedStreak) : 0;
        if (rewardCredits > 0) {
            const creditResult = this.characterProgression.grantCredits(rewardCredits, 'Live Academy reward');
            if (!creditResult.ok) rewardCredits = 0;
        }
        const saved = this.replayLibrary.recordLiveObjectiveResult(objective.metric, objective.completed, rewardCredits);
        this.liveAcademyRewardCredits = saved.persisted ? rewardCredits : 0;
        const streak = saved.snapshot.liveObjectiveStreak;
        this.hud?.setLiveAcademyResult(objective, this.liveAcademyRewardCredits, streak, saved.persisted);
        return objective.completed
            ? `LIVE ACADEMY: ${objective.title} COMPLETE  •  STREAK ${streak}  •  +CP ${this.liveAcademyRewardCredits.toLocaleString('en-US')}`
            : `LIVE ACADEMY: ${objective.title} INCOMPLETE  •  STREAK RESET`;
    }

    private incrementMatchActivity(key: keyof CareerMatchActivity): void {
        this.matchActivity = {
            ...this.matchActivity,
            [key]: this.matchActivity[key] + 1,
        };
    }

    private beginTurn(message: string, run: number): void {
        const model = this.model;
        if (!model || run !== this.generation) return;
        this.busy = false;
        this.timer.reset(this.turnDurationSeconds);
        this.lastTimerDisplay = this.timer.displaySeconds;
        this.hud?.setTimer(this.lastTimerDisplay);
        this.boardView?.setTurnAnimations(model.players, model.currentPlayer.id);
        this.boardView?.highlightTile(model.currentPlayer.tileIndex, model.currentPlayer.color);
        const activeTile = model.board[model.currentPlayer.tileIndex];
        if (activeTile) this.cameraController?.turnFocus(activeTile.worldPosition);
        this.hud?.showTurnBanner(
            model.currentPlayer.name,
            model.currentPlayer.color,
            message.toUpperCase().includes('EXTRA TURN')
                ? 'DOUBLE BONUS  •  ROLL AGAIN'
                : `ROUND ${model.round}  •  ${model.currentPlayer.teamId ? `TEAM ${model.currentPlayer.teamId}  •  ` : ''}${this.turnDurationSeconds}s`,
        );
        this.playAudio(AudioCue.TurnStart);
        this.render(message);

        if (model.currentPlayer.bot) {
            void this.delay(this.botThinkDelay * 1000).then(() => {
                if (run === this.generation && this.model?.currentPlayer.bot) void this.roll();
            });
        }
    }

    private render(message: string): void {
        this.replayRecorder?.recordMessage(message, this.model?.currentPlayer.id);
        this.eventBus.emit(GameEvents.Message, message);
        this.eventBus.emit(GameEvents.MatchChanged, this.model);
    }

    private readonly onMessage = (payload?: unknown): void => {
        if (typeof payload === 'string' && this.model) {
            this.boardView?.syncColorMonopolies(this.model.completedColorMonopolyGroups());
            this.refreshLiveAcademyObjective();
            this.hud?.render(
                this.model,
                payload,
                this.tutorial.snapshot(),
                this.settings.snapshot(),
            );
        }
    };

    private readonly onAudioCue = (payload?: unknown): void => {
        this.audioManager?.handle(payload);
    };

    private readonly onPlayerMovement = (payload?: unknown): void => {
        if (typeof payload === 'number') this.playAudio(AudioCue.MovementStep);
    };

    private readonly onVfxCue = (payload?: unknown): void => {
        this.vfxManager?.handle(payload);
    };

    private playAudio(cue: AudioCue, volumeScale?: number): void {
        this.eventBus.emit(GameEvents.AudioCue, { cue, volumeScale });
    }

    private playVfx(
        cue: VfxCue,
        position: Readonly<Vec3>,
        colorHex?: string,
        count?: number,
        radius?: number,
    ): void {
        this.eventBus.emit(GameEvents.VfxCue, {
            cue,
            x: position.x,
            y: position.y,
            z: position.z,
            colorHex,
            count,
            radius,
        });
    }

    private playLandingAnimation(playerId: string, islandTurns: number, tileType: TileType): void {
        const state = islandTurns > 0
            ? PlayerAnimationState.IslandIdle
            : tileType === TileType.Bonus
                ? PlayerAnimationState.Jump
                : tileType === TileType.Tax
                    ? PlayerAnimationState.Hit
                    : PlayerAnimationState.Land;
        this.boardView?.playPlayerAnimation(playerId, state);
    }

    private disposeRuntime(): void {
        this.generation++;
        this.replayRecorder = null;
        this.busy = false;
        this.timer.stop();
        this.vfxManager?.destroy();
        this.audioManager?.destroy();
        this.hud?.destroy();
        this.diceController?.destroy();
        this.boardView?.destroy();
        this.cameraController?.destroy();
        this.hud = null;
        this.diceController = null;
        this.boardView = null;
        this.cameraController = null;
        this.vfxManager = null;
        this.audioManager = null;
        this.model = null;
        this.network = null;
    }

    private requestDiceWithTimeout(network: NetworkService, playerId: string): Promise<DiceAuthorityResult> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Dice authority timeout.')), GAME_RULES.diceTimeoutSeconds * 1000);
            network.requestDiceRoll(playerId).then(
                (result) => {
                    clearTimeout(timeout);
                    resolve(result);
                },
                (error: unknown) => {
                    clearTimeout(timeout);
                    reject(error);
                },
            );
        });
    }

    private validateDice(result: DiceAuthorityResult): void {
        const valid = Number.isInteger(result.first)
            && Number.isInteger(result.second)
            && result.first >= 1
            && result.first <= 6
            && result.second >= 1
            && result.second <= 6;
        if (!valid) throw new Error(`Invalid authoritative dice: ${result.first}, ${result.second}.`);
    }

    private delay(milliseconds: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }
}
