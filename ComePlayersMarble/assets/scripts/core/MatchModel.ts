import { SpecialTileResolver } from '../board/SpecialTileResolver';
import { OlympicDecision, OlympicDestination, OlympicResult, OlympicService } from '../board/OlympicService';
import {
    WorldTravelDecision,
    WorldTravelDestination,
    WorldTravelResult,
    WorldTravelService,
} from '../board/WorldTravelService';
import { BUILDING_LEVEL_NAMES, BuildingUpgradeService } from '../buildings/BuildingUpgradeService';
import { PropertyController, PropertyState } from '../buildings/PropertyController';
import { PropertyPurchaseService } from '../buildings/PropertyPurchaseService';
import { RentCalculator } from '../buildings/RentCalculator';
import { LiquidationService, LiquidationSummary } from '../buildings/LiquidationService';
import { TakeoverBlockReason, TakeoverService } from '../buildings/TakeoverService';
import { TakeoverStrategyService, TakeoverStrategySnapshot } from '../buildings/TakeoverStrategyService';
import { CardEffectResolver, CardEffectResult } from '../cards/CardEffectResolver';
import { FortuneCardData } from '../cards/FortuneCardData';
import { FortuneDeck } from '../cards/FortuneDeck';
import { BoardTileData, GAME_RULES, TileType } from '../data/BoardData';
import { LOCAL_PLAYER_TEMPLATES } from '../data/PlayerCatalog';
import { GameCenterDecision, GameCenterResult, GameCenterService } from '../gamecenter/GameCenterService';
import { DiceAuthorityResult } from '../network/NetworkService';
import type { AuthoritativeMatchSnapshot } from '../network/AuthoritativeMatchProtocol';
import { ClassicVictory, ClassicVictoryProgress, ClassicVictoryService } from './ClassicVictoryService';
import { MatchResultOverride, MatchResultService, MatchResultSummary } from './MatchResultService';
import { MatchAwardsService, MatchAwardsSummary } from './MatchAwardsService';
import type { MatchMode, TeamId } from '../save/MatchSettingsData';
import { RoundEventResult, RoundEventService } from './RoundEventService';
import { ColorMonopolyService, ColorMonopolyStatus } from './ColorMonopolyService';

export interface PlayerState {
    readonly id: string;
    name: string;
    readonly color: string;
    money: number;
    tileIndex: number;
    readonly properties: number[];
    islandTurns: number;
    bankrupt: boolean;
    bot: boolean;
    teamId?: TeamId;
    rentDiscountPercent: number;
    rentDiscountCharges: number;
    freeUpgradeCredits: number;
    freeWorldTravelCredits: number;
}

export interface MoveResult {
    readonly path: readonly number[];
    readonly startsPassed: number;
}

export type LandingKind = 'BUY' | 'UPGRADE' | 'RENT' | 'FORTUNE' | 'WORLD_TRAVEL' | 'OLYMPIC' | 'GAME_CENTER' | 'SPECIAL' | 'NONE' | 'BANKRUPT';
export type PropertyDecisionKind = 'PURCHASE' | 'UPGRADE';

export interface PropertyDecision {
    readonly kind: PropertyDecisionKind;
    readonly tileIndex: number;
    readonly cost: number;
    readonly targetLevel: number;
}

export type PropertyReserveRisk = 'SAFE' | 'TIGHT' | 'DANGER';
export type PropertyRentThreat = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export interface PropertyDevelopmentOption {
    readonly targetLevel: number;
    readonly label: string;
    readonly cost: number;
    readonly projectedRent: number;
    readonly reserveAfter: number;
    readonly paybackLandings: number;
    readonly affordable: boolean;
    readonly reserveRisk: PropertyReserveRisk;
    readonly completesColorMonopoly: boolean;
}

export interface PropertyEconomySnapshot {
    readonly currentRent: number;
    readonly nextRent: number;
    readonly nextCost: number;
    readonly paybackLandings: number;
    readonly rentThreat: PropertyRentThreat;
}

export interface PaymentDecision {
    readonly tileIndex: number;
    readonly ownerId: string;
    readonly ownerName: string;
    readonly rent: number;
    readonly paid: number;
    readonly discountPercent: number;
    readonly buildingLevel: number;
    readonly propertyValue: number;
    readonly takeoverCost: number;
    readonly takeoverAvailable: boolean;
    readonly takeoverBlockReason?: TakeoverBlockReason;
    readonly colorGroup: string;
    readonly colorMonopolyMultiplier: number;
    readonly cashBefore: number;
    readonly unpaid: number;
    readonly liquidation: LiquidationSummary;
    readonly takeoverStrategy: TakeoverStrategySnapshot;
}

export interface PaymentResolution {
    readonly tileIndex: number;
    readonly tookOver: boolean;
    readonly cost: number;
    readonly message: string;
    readonly state?: PropertyState;
}

export interface LandingResult {
    readonly kind: LandingKind;
    readonly message: string;
    readonly tile?: BoardTileData;
}

export interface TurnAdvanceResult {
    readonly extraTurn: boolean;
    readonly matchFinished: boolean;
    readonly roundEvent?: RoundEventResult;
}

export interface IslandRollResult {
    readonly canMove: boolean;
    readonly message: string;
}

export class MatchModel {
    public readonly players: PlayerState[];
    public currentPlayerIndex = 0;
    public round = 1;
    public pendingPropertyDecision: PropertyDecision | null = null;
    public pendingPaymentDecision: PaymentDecision | null = null;
    public pendingFortuneCard: FortuneCardData | null = null;
    public pendingFortuneChoices: FortuneCardData[] = [];
    public pendingWorldTravelDecision: WorldTravelDecision | null = null;
    public pendingOlympicDecision: OlympicDecision | null = null;
    public pendingGameCenterDecision: GameCenterDecision | null = null;
    public lastDice: DiceAuthorityResult = { first: 0, second: 0 };
    public lastRoundEvent: RoundEventResult | null = null;
    public finished = false;
    public victory: ClassicVictory | null = null;

    private readonly properties = new PropertyController();
    private readonly purchaseService = new PropertyPurchaseService(this.properties);
    private readonly upgradeService = new BuildingUpgradeService(this.properties);
    private readonly rentCalculator = new RentCalculator();
    private readonly liquidation = new LiquidationService(this.properties);
    private readonly takeover = new TakeoverService(this.properties);
    private readonly takeoverStrategy: TakeoverStrategyService;
    private readonly specialTiles = new SpecialTileResolver();
    private readonly worldTravel = new WorldTravelService();
    private readonly olympic = new OlympicService();
    private readonly fortuneDeck: FortuneDeck;
    private readonly gameCenter: GameCenterService;
    private readonly matchResults = new MatchResultService();
    private readonly matchAwardsService = new MatchAwardsService();
    private readonly classicVictory: ClassicVictoryService;
    private readonly colorMonopoly: ColorMonopolyService;
    private readonly cardEffects: CardEffectResolver;
    private readonly roundEvents: RoundEventService;
    private extraTurnBlockedForCurrentRoll = false;
    private authoritativeSnapshotApplied = false;

    public constructor(
        public readonly board: readonly BoardTileData[],
        playerCount = GAME_RULES.maximumPlayers,
        fortuneSeed = Date.now(),
        private readonly roundEventsEnabled = true,
        public readonly matchMode: MatchMode = 'SOLO',
    ) {
        const count = Math.max(GAME_RULES.minimumPlayers, Math.min(playerCount, GAME_RULES.maximumPlayers));
        this.players = LOCAL_PLAYER_TEMPLATES.slice(0, count).map((template, index): PlayerState => ({
            ...template,
            teamId: this.matchMode === 'TEAM' ? (index % 2 === 0 ? 'BLUE' : 'GOLD') : undefined,
            money: GAME_RULES.startingMoney,
            tileIndex: 0,
            properties: [],
            islandTurns: 0,
            bankrupt: false,
            rentDiscountPercent: 0,
            rentDiscountCharges: 0,
            freeUpgradeCredits: 0,
            freeWorldTravelCredits: 0,
        }));
        this.classicVictory = new ClassicVictoryService(this.board);
        this.takeoverStrategy = new TakeoverStrategyService(this.board);
        this.colorMonopoly = new ColorMonopolyService(this.board);
        this.fortuneDeck = new FortuneDeck(fortuneSeed);
        this.gameCenter = new GameCenterService(
            (maxExclusive) => this.fortuneDeck.randomIndex(maxExclusive),
        );
        this.cardEffects = new CardEffectResolver(
            this.board,
            this.properties,
            (maxExclusive) => this.fortuneDeck.randomIndex(maxExclusive),
        );
        this.roundEvents = new RoundEventService(fortuneSeed ^ 0x7f4a7c15);
    }

    public get currentPlayer(): PlayerState {
        return this.players[this.currentPlayerIndex] as PlayerState;
    }

    public applyAuthoritativeSnapshot(snapshot: AuthoritativeMatchSnapshot): void {
        this.authoritativeSnapshotApplied = true;
        // The authoritative server remains the source of truth for online match endings.
        this.victory = null;
        this.currentPlayerIndex = Math.max(0, Math.min(this.players.length - 1, snapshot.currentTurnSeat));
        this.round = Math.max(1, snapshot.round);
        this.players.forEach((player) => player.properties.splice(0, player.properties.length));
        snapshot.players.forEach((serverPlayer) => {
            const player = this.players[serverPlayer.seat];
            if (!player) return;
            player.name = serverPlayer.displayName;
            player.bot = false;
            player.teamId = serverPlayer.teamId;
            player.tileIndex = Math.max(0, Math.min(this.board.length - 1, serverPlayer.position));
            player.money = Math.max(0, serverPlayer.money);
            player.bankrupt = serverPlayer.bankrupt;
            player.islandTurns = serverPlayer.islandTurns;
            player.freeWorldTravelCredits = serverPlayer.travelCredits;
            player.rentDiscountPercent = serverPlayer.rentShieldPercent;
            player.rentDiscountCharges = serverPlayer.rentShieldCharges;
            player.freeUpgradeCredits = serverPlayer.freeUpgradeCredits;
        });
        this.properties.synchronize(snapshot.properties.map((property) => {
            const owner = this.players[property.ownerSeat];
            if (owner && !owner.properties.includes(property.tileIndex)) owner.properties.push(property.tileIndex);
            return {
                tileIndex: property.tileIndex,
                ownerId: owner?.id ?? property.ownerProfileId,
                buildingLevel: property.buildingLevel,
                rentMultiplier: property.rentMultiplier,
                protected: property.protected,
                protectionCharges: property.protected ? 1 : 0,
            };
        }));
        if (snapshot.lastDice) {
            this.lastDice = { first: snapshot.lastDice.first, second: snapshot.lastDice.second };
        }
        this.finished = snapshot.phase === 'FINISHED';
    }

    public get hasPendingPropertyDecision(): boolean {
        return this.pendingPropertyDecision !== null;
    }

    public get hasPendingPaymentDecision(): boolean {
        return this.pendingPaymentDecision !== null;
    }

    public get hasPendingFortuneCard(): boolean {
        return this.pendingFortuneCard !== null || this.pendingFortuneChoices.length > 0;
    }

    public get fortuneChoiceCards(): readonly FortuneCardData[] {
        return this.pendingFortuneChoices;
    }

    public selectFortuneCard(cardId: string): FortuneCardData | undefined {
        if (this.pendingFortuneCard) return this.pendingFortuneCard;
        const card = this.pendingFortuneChoices.find((entry) => entry.id === cardId);
        if (!card) return undefined;
        this.pendingFortuneCard = card;
        this.pendingFortuneChoices = [];
        return card;
    }

    public get hasPendingWorldTravelDecision(): boolean {
        return this.pendingWorldTravelDecision !== null;
    }

    public get hasPendingOlympicDecision(): boolean {
        return this.pendingOlympicDecision !== null;
    }

    public get hasPendingGameCenterDecision(): boolean {
        return this.pendingGameCenterDecision !== null;
    }

    public olympicDestinations(): readonly OlympicDestination[] {
        const decision = this.pendingOlympicDecision;
        if (!decision) return [];
        return decision.propertyIndices.map((tileIndex): OlympicDestination => {
            const tile = this.board[tileIndex];
            const property = this.properties.stateAt(tileIndex);
            if (!tile || !property) throw new Error(`Olympic property ${tileIndex} does not exist.`);
            const projectedMultiplier = Math.min(
                decision.maximumMultiplier,
                Math.round((property.rentMultiplier + decision.multiplierStep) * 100) / 100,
            );
            const currentRent = this.rentForProperty(tile, property);
            const projectedRent = this.rentForProperty(tile, { ...property, rentMultiplier: projectedMultiplier });
            const rentGain = Math.max(0, projectedRent - currentRent);
            const gainPercent = currentRent > 0 ? Math.round(rentGain / currentRent * 100) : 0;
            return {
                tileIndex,
                currentRent,
                projectedRent,
                rentGain,
                gainPercent,
                threat: projectedRent >= GAME_RULES.startingMoney * 0.22
                    ? 'EXTREME'
                    : projectedRent >= GAME_RULES.startingMoney * 0.10 ? 'HIGH' : 'MEDIUM',
                currentMultiplier: property.rentMultiplier,
                projectedMultiplier,
            };
        });
    }

    public worldTravelDestinations(): readonly WorldTravelDestination[] {
        const decision = this.pendingWorldTravelDecision;
        if (!decision) return [];
        return decision.destinationIndices.map((tileIndex): WorldTravelDestination => {
            const tile = this.board[tileIndex];
            if (!tile) throw new Error(`World Travel destination ${tileIndex} does not exist.`);
            const property = this.properties.stateAt(tileIndex);
            const owner = this.players.find((player) => player.id === property?.ownerId);
            const teamSafe = Boolean(owner && this.areTeammates(this.currentPlayer.id, owner.id));
            const colorPreview = !property && tile.tileType === TileType.City
                ? this.colorMonopoly.previewStatusFor(
                    this.currentPlayer.id,
                    tileIndex,
                    this.players,
                    this.matchMode,
                    [tileIndex],
                )
                : null;
            const projectedPlayers = this.players.map((entry): PlayerState => ({
                ...entry,
                properties: entry.id === this.currentPlayer.id && !property
                    ? [...entry.properties, tileIndex]
                    : [...entry.properties],
            }));
            const projectedVictory = this.classicVictory.progressFor(
                this.currentPlayer.id,
                projectedPlayers,
                this.matchMode,
            );
            const rent = property ? this.rentForProperty(tile, property) : tile.baseRent;
            const projectedExpense = property && owner?.id !== this.currentPlayer.id && !teamSafe
                ? rent
                : !property ? tile.purchasePrice : 0;
            const reserveAfter = this.currentPlayer.money - decision.cost - projectedExpense;
            const reserveRatio = reserveAfter / Math.max(1, GAME_RULES.startingMoney);
            const reserveRisk = reserveRatio < 0.15 ? 'DANGER' : reserveRatio < 0.35 ? 'TIGHT' : 'SAFE';
            const strategicTag = property
                ? owner?.id === this.currentPlayer.id
                    ? 'OWN_CITY'
                    : teamSafe ? 'TEAM_SAFE' : 'RIVAL_TOLL'
                : colorPreview?.completed
                    ? 'SET_COMPLETE'
                    : tile.tileType === TileType.Tourist ? 'TOURISM_TARGET' : 'OPEN_PROPERTY';
            const strategicScore = strategicTag === 'SET_COMPLETE'
                ? 1_500_000
                : strategicTag === 'TOURISM_TARGET'
                    ? 1_150_000 + projectedVictory.tourismOwned * 80_000
                    : strategicTag === 'OPEN_PROPERTY'
                        ? 900_000 + tile.purchasePrice + rent
                        : strategicTag === 'OWN_CITY'
                            ? 650_000 + Math.max(0, 4 - (property?.buildingLevel ?? 0)) * 40_000
                            : strategicTag === 'TEAM_SAFE'
                                ? 400_000
                                : -rent;
            return {
                tileIndex,
                displayName: tile.displayName,
                tileType: tile.tileType,
                purchasePrice: tile.purchasePrice,
                rent,
                ownerId: property?.ownerId,
                ownerTeamId: owner?.teamId,
                buildingLevel: property?.buildingLevel ?? 0,
                strategicTag,
                reserveAfter,
                reserveRisk,
                completesColorMonopoly: Boolean(colorPreview?.completed),
                victoryProgress: projectedVictory.summary,
                strategicScore,
            };
        });
    }

    public propertyAt(tileIndex: number): PropertyState | undefined {
        return this.properties.stateAt(tileIndex);
    }

    public rentAt(tileIndex: number): number {
        const tile = this.board[tileIndex];
        if (!tile) return 0;
        const property = this.properties.stateAt(tileIndex);
        return property ? this.rentForProperty(tile, property) : tile.baseRent;
    }

    public propertyEconomyAt(tileIndex: number): PropertyEconomySnapshot | null {
        const tile = this.board[tileIndex];
        const property = this.properties.stateAt(tileIndex);
        if (!tile || !property) return null;
        const currentRent = this.rentForProperty(tile, property);
        const nextLevel = Math.min(4, property.buildingLevel + 1);
        const nextCost = property.buildingLevel >= 4 ? 0 : this.developmentStepCost(tile, property.buildingLevel);
        const nextRent = property.buildingLevel >= 4
            ? currentRent
            : this.rentForProperty(tile, { ...property, buildingLevel: nextLevel });
        return {
            currentRent,
            nextRent,
            nextCost,
            paybackLandings: nextCost > 0 && nextRent > currentRent
                ? Math.max(1, Math.ceil(nextCost / Math.max(1, nextRent - currentRent)))
                : 0,
            rentThreat: this.rentThreat(currentRent),
        };
    }

    public propertyDevelopmentOptions(): readonly PropertyDevelopmentOption[] {
        const decision = this.pendingPropertyDecision;
        if (!decision) return [];
        const tile = this.board[decision.tileIndex];
        if (!tile) return [];
        const property = this.properties.stateAt(tile.index);
        const currentLevel = decision.kind === 'PURCHASE' ? -1 : (property?.buildingLevel ?? -1);
        const maximumTarget = decision.kind === 'PURCHASE' ? 3 : 4;
        const currentMonopoly = property
            ? this.colorMonopoly.statusFor(property.ownerId, tile.index, this.players, this.matchMode)
            : null;
        const projectedMonopoly = this.colorMonopoly.previewStatusFor(
            this.currentPlayer.id,
            tile.index,
            this.players,
            this.matchMode,
            decision.kind === 'PURCHASE' ? [tile.index] : [],
        );
        const options: PropertyDevelopmentOption[] = [];
        for (let targetLevel = currentLevel + 1; targetLevel <= maximumTarget; targetLevel++) {
            const cost = this.developmentPackageCost(tile, currentLevel, targetLevel, decision.kind === 'PURCHASE');
            const rentMultiplier = property?.rentMultiplier ?? 1;
            const projectedBaseRent = this.rentCalculator.calculate(tile, {
                tileIndex: tile.index,
                ownerId: this.currentPlayer.id,
                buildingLevel: targetLevel,
                rentMultiplier,
                protected: property?.protected ?? false,
                protectionCharges: property?.protectionCharges ?? 0,
            });
            const projectedRent = Math.max(0, Math.round(projectedBaseRent * projectedMonopoly.rentMultiplier));
            const reserveAfter = this.currentPlayer.money - cost;
            options.push({
                targetLevel,
                label: (BUILDING_LEVEL_NAMES[targetLevel] ?? 'Property').toUpperCase(),
                cost,
                projectedRent,
                reserveAfter,
                paybackLandings: projectedRent > 0 ? Math.max(1, Math.ceil(cost / projectedRent)) : 0,
                affordable: reserveAfter >= 0,
                reserveRisk: this.reserveRisk(reserveAfter),
                completesColorMonopoly: !currentMonopoly?.completed && projectedMonopoly.completed,
            });
        }
        return options;
    }

    public colorMonopolyStatusAt(tileIndex: number): ColorMonopolyStatus | null {
        const property = this.properties.stateAt(tileIndex);
        if (!property) return null;
        return this.colorMonopoly.statusFor(property.ownerId, tileIndex, this.players, this.matchMode);
    }

    public completedColorMonopolyGroups(): readonly {
        readonly groupId: string;
        readonly tileIndices: readonly number[];
        readonly color: string;
        readonly representativePlayerId: string;
    }[] {
        return this.colorMonopoly.completedVisualGroups(this.players, this.matchMode).map((group) => {
            const representative = this.players.find((player) => player.id === group.representativePlayerId);
            const color = group.teamId === 'BLUE'
                ? '#39bce8'
                : group.teamId === 'GOLD'
                    ? '#f2c94c'
                    : representative?.color ?? '#f2c94c';
            return { ...group, color };
        });
    }

    public buildingCount(ownerId: string): number {
        return this.properties.values()
            .filter((property) => property.ownerId === ownerId)
            .reduce((total, property) => total + property.buildingLevel, 0);
    }

    public moveCurrent(steps: number): MoveResult {
        const player = this.currentPlayer;
        const path: number[] = [];
        let startsPassed = 0;

        for (let index = 0; index < steps; index++) {
            player.tileIndex = (player.tileIndex + 1) % this.board.length;
            if (player.tileIndex === 0) {
                player.money += GAME_RULES.startSalary;
                startsPassed++;
            }
            path.push(player.tileIndex);
        }
        return { path, startsPassed };
    }

    public resolveIslandRoll(isDouble: boolean): IslandRollResult {
        const player = this.currentPlayer;
        if (player.islandTurns <= 0) return { canMove: true, message: '' };
        if (isDouble) {
            player.islandTurns = 0;
            this.extraTurnBlockedForCurrentRoll = true;
            return { canMove: true, message: `${player.name} escaped the Island by rolling a double.` };
        }

        player.islandTurns--;
        return {
            canMove: false,
            message: `${player.name} remains on the Island for ${player.islandTurns} more turns.`,
        };
    }

    public resolveLanding(): LandingResult {
        const player = this.currentPlayer;
        const tile = this.board[player.tileIndex];
        if (!tile) return { kind: 'NONE', message: 'The board space could not be found.' };

        if (tile.tileType === TileType.Fortune) {
            this.pendingFortuneCard = null;
            this.pendingFortuneChoices = [...this.fortuneDeck.drawMany(3)];
            return {
                kind: 'FORTUNE',
                tile,
                message: `${player.name} activated Fortune Signal. Choose one of three cards.`,
            };
        }

        if (tile.tileType === TileType.GameCenter) {
            const decision = this.gameCenter.createDecision(player);
            this.pendingGameCenterDecision = decision;
            return {
                kind: 'GAME_CENTER',
                tile,
                message: `${player.name} entered Game Center. Choose a signal for a chance to win ${this.money(decision.winReward)}.`,
            };
        }

        if (tile.tileType === TileType.Olympic) {
            const decision = this.olympic.createDecision(player.id, this.properties);
            if (!decision) {
                return {
                    kind: 'NONE',
                    tile,
                    message: `${player.name} does not own a city eligible for an Olympic boost yet.`,
                };
            }
            this.pendingOlympicDecision = decision;
            return {
                kind: 'OLYMPIC',
                tile,
                message: `${player.name} can choose a city for a +${decision.multiplierStep}x rent bonus.`,
            };
        }

        if (tile.tileType === TileType.WorldTravel) {
            const decision = this.worldTravel.createDecision(player, this.board);
            if (!decision) {
                return {
                    kind: 'NONE',
                    tile,
                    message: `${player.name} cannot afford World Travel.`,
                };
            }
            this.pendingWorldTravelDecision = decision;
            return {
                kind: 'WORLD_TRAVEL',
                tile,
                message: decision.usesFreeTicket
                    ? `${player.name} can choose a destination with a free World Travel ticket.`
                    : `${player.name} can choose a destination for ${this.money(decision.cost)}.`,
            };
        }

        if (this.purchaseService.isPurchasable(tile)) {
            const property = this.properties.stateAt(tile.index);
            if (!property) {
                this.pendingPropertyDecision = {
                    kind: 'PURCHASE',
                    tileIndex: tile.index,
                    cost: tile.purchasePrice,
                    targetLevel: 0,
                };
                return {
                    kind: 'BUY',
                    tile,
                    message: `Purchase ${tile.displayName} for ${this.money(tile.purchasePrice)}?`,
                };
            }

            const owner = this.players.find((entry) => entry.id === property.ownerId);
            if (owner && owner.id !== player.id) {
                if (this.areTeammates(player.id, owner.id)) {
                    return {
                        kind: 'NONE',
                        tile,
                        message: `${player.name} landed on teammate ${owner.name}'s city. Team rent is waived.`,
                    };
                }
                const monopolyStatus = this.colorMonopoly.statusFor(owner.id, tile.index, this.players, this.matchMode);
                const baseRent = this.rentForProperty(tile, property);
                const discount = player.rentDiscountCharges > 0 ? player.rentDiscountPercent : 0;
                const rent = Math.max(0, Math.round(baseRent * (1 - discount / 100)));
                const cashBefore = player.money;
                const liquidation = this.liquidation.coverShortfall(
                    player,
                    rent,
                    this.board,
                    (candidateTile, candidateState) => this.liquidationPreserveScore(
                        player.id,
                        candidateTile,
                        candidateState,
                    ),
                );
                const paid = Math.min(player.money, rent);
                const unpaid = Math.max(0, rent - paid);
                player.money -= paid;
                owner.money += paid;
                if (player.rentDiscountCharges > 0) {
                    player.rentDiscountCharges--;
                    if (player.rentDiscountCharges === 0) player.rentDiscountPercent = 0;
                }
                player.bankrupt = unpaid > 0;
                const quote = this.takeover.quote(player, tile, property);
                const takeoverStrategy = this.takeoverStrategy.analyze(
                    player.id,
                    owner.id,
                    tile,
                    property,
                    quote.cost,
                    this.players,
                    this.matchMode,
                );
                this.pendingPaymentDecision = {
                    tileIndex: tile.index,
                    ownerId: owner.id,
                    ownerName: owner.name,
                    rent,
                    paid,
                    discountPercent: discount,
                    buildingLevel: property.buildingLevel,
                    propertyValue: quote.propertyValue,
                    takeoverCost: quote.cost,
                    takeoverAvailable: quote.available,
                    takeoverBlockReason: quote.blockReason,
                    colorGroup: monopolyStatus.groupId,
                    colorMonopolyMultiplier: monopolyStatus.rentMultiplier,
                    cashBefore,
                    unpaid,
                    liquidation,
                    takeoverStrategy,
                };
                this.refreshFinished();
                const liquidationMessage = liquidation.records.length > 0
                    ? ` Auto-liquidation recovered ${this.money(liquidation.recovered)} from ${liquidation.records.length} asset action${liquidation.records.length === 1 ? '' : 's'}.`
                    : '';
                return {
                    kind: player.bankrupt ? 'BANKRUPT' : 'RENT',
                    tile,
                    message: `${player.name} paid ${this.money(paid)} to ${owner.name}${monopolyStatus.completed ? ` with a Color Monopoly x${monopolyStatus.rentMultiplier} rent bonus` : ''}${discount > 0 ? ` after a ${discount}% discount` : ''}.${liquidationMessage}${player.bankrupt ? ` ${this.money(unpaid)} remained unpaid, so the player went bankrupt.` : ''}`,
                };
            }

            const upgradeCost = this.upgradeService.costFor(tile, property);
            if (upgradeCost > 0) {
                const payableCost = player.freeUpgradeCredits > 0 ? 0 : upgradeCost;
                this.pendingPropertyDecision = {
                    kind: 'UPGRADE',
                    tileIndex: tile.index,
                    cost: payableCost,
                    targetLevel: property.buildingLevel + 1,
                };
                const levelName = BUILDING_LEVEL_NAMES[property.buildingLevel + 1] ?? 'Upgrade';
                return {
                    kind: 'UPGRADE',
                    tile,
                    message: player.freeUpgradeCredits > 0
                        ? `Use a blueprint to build a free ${levelName} at ${tile.displayName}?`
                        : `Build a ${levelName} at ${tile.displayName} for ${this.money(upgradeCost)}?`,
                };
            }
            return { kind: 'NONE', tile, message: `${tile.displayName} is already a Landmark.` };
        }

        const special = this.specialTiles.resolve(player, tile);
        this.refreshFinished();
        return {
            kind: player.bankrupt ? 'BANKRUPT' : special.applied ? 'SPECIAL' : 'NONE',
            tile,
            message: special.message,
        };
    }

    public confirmPropertyDecision(targetLevel = this.pendingPropertyDecision?.targetLevel): PropertyState | undefined {
        const decision = this.pendingPropertyDecision;
        if (!decision || targetLevel === undefined) return undefined;
        const tile = this.board[decision.tileIndex];
        const option = this.propertyDevelopmentOptions().find((entry) => entry.targetLevel === targetLevel);
        if (!tile || !option?.affordable) return undefined;

        let state = this.properties.stateAt(tile.index);
        if (decision.kind === 'PURCHASE') {
            state = this.purchaseService.purchase(this.currentPlayer, tile);
            if (!state) return undefined;
        }

        while (state && state.buildingLevel < option.targetLevel) {
            const baseCost = this.upgradeService.costFor(tile, state);
            const usesFreeUpgrade = this.currentPlayer.freeUpgradeCredits > 0 && baseCost > 0;
            const upgraded = this.upgradeService.upgrade(
                this.currentPlayer,
                tile,
                usesFreeUpgrade ? baseCost : 0,
            );
            if (!upgraded) return state;
            state = upgraded;
            if (usesFreeUpgrade) this.currentPlayer.freeUpgradeCredits--;
        }

        this.pendingPropertyDecision = null;
        this.refreshFinished();
        return state;
    }

    public completePaymentDecision(takeOver: boolean): PaymentResolution | undefined {
        const decision = this.pendingPaymentDecision;
        if (!decision) return undefined;
        const tile = this.board[decision.tileIndex];
        const seller = this.players.find((player) => player.id === decision.ownerId);
        if (!tile || !seller) return undefined;

        if (!takeOver) {
            this.pendingPaymentDecision = null;
            const liquidationText = decision.liquidation.records.length > 0
                ? ` Automatic liquidation recovered ${this.money(decision.liquidation.recovered)} through ${decision.liquidation.records.length} asset action${decision.liquidation.records.length === 1 ? '' : 's'}.`
                : '';
            return {
                tileIndex: tile.index,
                tookOver: false,
                cost: 0,
                message: decision.unpaid > 0
                    ? `${this.currentPlayer.name} paid ${this.money(decision.paid)} to ${seller.name}, but ${this.money(decision.unpaid)} remained unpaid and bankruptcy was declared.${liquidationText}`
                    : `${this.currentPlayer.name} completed a rent payment of ${this.money(decision.paid)} to ${seller.name}.${liquidationText}`,
            };
        }

        if (!decision.takeoverAvailable) return undefined;
        const result = this.takeover.takeOver(this.currentPlayer, seller, tile);
        if (!result) return undefined;
        this.pendingPaymentDecision = null;
        this.refreshFinished();
        return {
            tileIndex: tile.index,
            tookOver: true,
            cost: result.cost,
            state: result.state,
            message: `${this.currentPlayer.name} took over ${tile.displayName} from ${seller.name} for ${this.money(result.cost)}. ${decision.takeoverStrategy.tags.join(' • ')}. Reserve ${this.money(decision.takeoverStrategy.reserveAfter)} (${decision.takeoverStrategy.reserveRisk}).`,
        };
    }

    public resolvePendingFortuneCard(): CardEffectResult | undefined {
        const card = this.pendingFortuneCard;
        if (!card) return undefined;
        const result = this.cardEffects.resolve(card, this.currentPlayer, this.players);
        this.pendingFortuneCard = null;
        this.pendingFortuneChoices = [];
        if (result.blocksExtraTurn) this.extraTurnBlockedForCurrentRoll = true;
        this.refreshFinished();
        return result;
    }

    public confirmWorldTravelDestination(destinationIndex: number): WorldTravelResult | undefined {
        const decision = this.pendingWorldTravelDecision;
        if (!decision) return undefined;
        const result = this.worldTravel.confirm(this.currentPlayer, decision, destinationIndex);
        if (result) this.pendingWorldTravelDecision = null;
        return result;
    }

    public confirmOlympicDestination(tileIndex: number): OlympicResult | undefined {
        const decision = this.pendingOlympicDecision;
        if (!decision) return undefined;
        const result = this.olympic.confirm(this.currentPlayer.id, this.properties, decision, tileIndex);
        if (result) this.pendingOlympicDecision = null;
        return result;
    }

    public confirmGameCenterOption(selectedNumber: number): GameCenterResult | undefined {
        const decision = this.pendingGameCenterDecision;
        if (!decision) return undefined;
        const result = this.gameCenter.confirm(this.currentPlayer, decision, selectedNumber);
        if (result) {
            this.pendingGameCenterDecision = null;
            this.currentPlayer.bankrupt = this.currentPlayer.money <= 0;
            this.refreshFinished();
        }
        return result;
    }

    public skipPropertyDecision(): void {
        this.pendingPropertyDecision = null;
    }

    public completeTurn(isDouble: boolean): TurnAdvanceResult {
        if (this.finished) return { extraTurn: false, matchFinished: true };
        const extraTurn = GAME_RULES.extraTurnOnDouble
            && isDouble
            && !this.extraTurnBlockedForCurrentRoll
            && !this.currentPlayer.bankrupt;
        this.extraTurnBlockedForCurrentRoll = false;
        const previousRound = this.round;
        if (!extraTurn) this.advanceToNextSolventPlayer();
        let roundEvent: RoundEventResult | undefined;
        if (!extraTurn && this.round > previousRound) {
            this.lastRoundEvent = null;
            if (this.roundEventsEnabled) {
                roundEvent = this.roundEvents.trigger(this.round, this.players);
                if (roundEvent) this.lastRoundEvent = roundEvent;
            }
        }
        this.refreshFinished();
        return { extraTurn, matchFinished: this.finished, roundEvent };
    }

    public roundEventHistory(): readonly RoundEventResult[] {
        return this.roundEvents.snapshot();
    }

    public ownerOf(tileIndex: number): PlayerState | undefined {
        const ownerId = this.properties.stateAt(tileIndex)?.ownerId;
        return ownerId ? this.players.find((player) => player.id === ownerId) : undefined;
    }

    public resultSummary(): MatchResultSummary {
        const override: MatchResultOverride | undefined = this.victory
            ? {
                winnerId: this.victory.winnerPlayerId,
                winningTeamId: this.victory.winningTeamId,
                reason: this.victory.kind,
            }
            : undefined;
        return this.matchResults.create(
            this.round,
            GAME_RULES.maxRounds,
            this.players.map((player) => ({
                playerId: player.id,
                name: player.name,
                color: player.color,
                money: player.money,
                propertyValue: this.propertyValue(player),
                propertyCount: player.properties.length,
                buildingCount: this.buildingCount(player.id),
                bankrupt: player.bankrupt,
                teamId: player.teamId,
            })),
            this.matchMode,
            override,
        );
    }

    public matchAwards(): MatchAwardsSummary {
        return this.matchAwardsService.create(this.resultSummary());
    }

    public classicVictoryProgressFor(playerId: string): ClassicVictoryProgress {
        return this.classicVictory.progressFor(playerId, this.players, this.matchMode);
    }

    public victoryLabel(): string {
        return this.victory?.label ?? '';
    }

    public winner(): PlayerState {
        const winnerId = this.resultSummary().winnerId;
        return this.players.find((player) => player.id === winnerId) ?? (this.players[0] as PlayerState);
    }

    private advanceToNextSolventPlayer(): void {
        let attempts = 0;
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            if (this.currentPlayerIndex === 0) this.round++;
            attempts++;
        } while (this.currentPlayer.bankrupt && attempts < this.players.length);
    }

    public areTeammates(firstPlayerId: string, secondPlayerId: string): boolean {
        if (this.matchMode !== 'TEAM') return false;
        const first = this.players.find((player) => player.id === firstPlayerId);
        const second = this.players.find((player) => player.id === secondPlayerId);
        return Boolean(first?.teamId && second?.teamId && first.teamId === second.teamId);
    }

    public teamPropertyIndices(playerId: string): readonly number[] {
        if (this.matchMode !== 'TEAM') return [];
        const player = this.players.find((entry) => entry.id === playerId);
        if (!player?.teamId) return [];
        return this.players
            .filter((entry) => entry.teamId === player.teamId)
            .flatMap((entry) => entry.properties);
    }

    public winningTeamId(): TeamId | undefined {
        return this.resultSummary().winningTeamId;
    }

    private refreshFinished(): void {
        if (!this.authoritativeSnapshotApplied) {
            this.victory = this.classicVictory.evaluate(
                this.players,
                this.matchMode,
                this.currentPlayer.id,
            );
            if (this.victory) {
                this.finished = true;
                return;
            }
        }

        const solvent = this.players.filter((player) => !player.bankrupt);
        if (this.matchMode === 'TEAM') {
            const solventTeams = new Set(solvent.map((player) => player.teamId).filter(Boolean));
            this.finished = solventTeams.size <= 1 || this.round > GAME_RULES.maxRounds;
            return;
        }
        this.finished = solvent.length <= 1 || this.round > GAME_RULES.maxRounds;
    }

    private developmentStepCost(tile: Readonly<BoardTileData>, currentLevel: number): number {
        if (currentLevel >= 4) return 0;
        return currentLevel === 3 ? tile.landmarkCost : (tile.buildingCosts[currentLevel] ?? 0);
    }

    private developmentPackageCost(
        tile: Readonly<BoardTileData>,
        currentLevel: number,
        targetLevel: number,
        includesPurchase: boolean,
    ): number {
        let cost = includesPurchase ? tile.purchasePrice : 0;
        let freeCredits = this.currentPlayer.freeUpgradeCredits;
        for (let level = Math.max(0, currentLevel); level < targetLevel; level++) {
            const stepCost = this.developmentStepCost(tile, level);
            if (freeCredits > 0 && stepCost > 0) {
                freeCredits--;
            } else {
                cost += stepCost;
            }
        }
        return cost;
    }

    private reserveRisk(reserveAfter: number): PropertyReserveRisk {
        const ratio = reserveAfter / Math.max(1, GAME_RULES.startingMoney);
        if (ratio < 0.15) return 'DANGER';
        if (ratio < 0.35) return 'TIGHT';
        return 'SAFE';
    }

    private rentThreat(rent: number): PropertyRentThreat {
        const ratio = rent / Math.max(1, GAME_RULES.startingMoney);
        if (ratio >= 0.25) return 'EXTREME';
        if (ratio >= 0.12) return 'HIGH';
        if (ratio >= 0.05) return 'MEDIUM';
        return 'LOW';
    }

    private liquidationPreserveScore(
        playerId: string,
        tile: Readonly<BoardTileData>,
        property: Readonly<PropertyState>,
    ): number {
        const monopoly = this.colorMonopoly.statusFor(playerId, tile.index, this.players, this.matchMode);
        const victory = this.classicVictory.progressFor(playerId, this.players, this.matchMode);
        let score = property.buildingLevel * 120;
        if (monopoly.completed) score += 1_000;
        else score += Math.round(monopoly.owned / Math.max(1, monopoly.required) * 420);
        if (tile.tileType === TileType.Tourist) {
            score += 700 + Math.round(victory.tourismOwned / Math.max(1, victory.tourismRequired) * 300);
        }
        if (property.buildingLevel >= 4) score += 900;
        if (property.protected) score += 250;
        score += Math.round(this.rentForProperty(tile, property) / 1_000);
        return score;
    }

    private propertyValue(player: PlayerState): number {
        return player.properties.reduce((sum, tileIndex) => {
            const tile = this.board[tileIndex];
            const state = this.properties.stateAt(tileIndex);
            if (!tile || !state) return sum;
            const regularBuildings = tile.buildingCosts.slice(0, Math.min(state.buildingLevel, 3));
            const buildingValue = regularBuildings.reduce((total, cost) => total + cost, 0);
            const landmarkValue = state.buildingLevel === 4 ? tile.landmarkCost : 0;
            return sum + tile.purchasePrice + buildingValue + landmarkValue;
        }, 0);
    }

    private rentForProperty(tile: Readonly<BoardTileData>, property: Readonly<PropertyState>): number {
        const baseRent = this.rentCalculator.calculate(tile, property);
        const monopolyStatus = this.colorMonopoly.statusFor(
            property.ownerId,
            tile.index,
            this.players,
            this.matchMode,
        );
        return Math.max(0, Math.round(baseRent * monopolyStatus.rentMultiplier));
    }

    private money(value: number): string {
        return `CP ${value.toLocaleString('en-US')}`;
    }
}
