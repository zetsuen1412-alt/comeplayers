import { BoardTileData, TileType } from '../data/BoardData';
import { OlympicDestination } from '../board/OlympicService';
import { WorldTravelDestination } from '../board/WorldTravelService';
import { PaymentDecision, PlayerState } from '../core/MatchModel';
import { GameCenterDecision } from '../gamecenter/GameCenterService';
import { FortuneCardData, FortuneEffectType } from '../cards/FortuneCardData';
import type { BotDifficulty } from '../save/MatchSettingsData';

interface BotDifficultyProfile {
    readonly reserve: number;
    readonly purchaseBias: number;
    readonly upgradeBias: number;
    readonly takeoverThreshold: number;
    readonly avoidsEnemyRentWeight: number;
}

const BOT_PROFILES: Readonly<Record<BotDifficulty, BotDifficultyProfile>> = {
    CASUAL: {
        reserve: 250_000,
        purchaseBias: -80_000,
        upgradeBias: -50_000,
        takeoverThreshold: 16,
        avoidsEnemyRentWeight: 0.65,
    },
    SMART: {
        reserve: 500_000,
        purchaseBias: 40_000,
        upgradeBias: 25_000,
        takeoverThreshold: 10,
        avoidsEnemyRentWeight: 1,
    },
    EXPERT: {
        reserve: 700_000,
        purchaseBias: 160_000,
        upgradeBias: 100_000,
        takeoverThreshold: 7,
        avoidsEnemyRentWeight: 1.4,
    },
};

export class BotDecisionService {
    private difficulty: BotDifficulty = 'SMART';

    public setDifficulty(difficulty: BotDifficulty): void {
        this.difficulty = difficulty;
    }

    public get currentDifficulty(): BotDifficulty {
        return this.difficulty;
    }

    public shouldBuy(
        player: Readonly<PlayerState>,
        tile: Readonly<BoardTileData>,
        teamPropertyIndices: readonly number[] = [],
    ): boolean {
        const profile = this.profile;
        const strategicProperties = [...player.properties, ...teamPropertyIndices];
        const strategicDiscount = strategicProperties.some((tileIndex) => Math.floor(tileIndex / 4) === Math.floor(tile.index / 4))
            ? 140_000
            : 0;
        const tourismPush = tile.tileType === TileType.Tourist ? 180_000 : 0;
        return player.money + profile.purchaseBias + strategicDiscount + tourismPush >= tile.purchasePrice + profile.reserve;
    }

    public shouldUpgrade(player: Readonly<PlayerState>, buildingLevel: number, cost: number): boolean {
        if (cost === 0) return true;
        const profile = this.profile;
        const levelReserve = buildingLevel >= 2 ? 150_000 : 0;
        const landmarkPush = buildingLevel === 3 ? 180_000 : 0;
        return cost > 0
            && player.money + profile.upgradeBias + landmarkPush >= cost + profile.reserve + levelReserve;
    }

    public chooseWorldTravelDestination(
        player: Readonly<PlayerState>,
        destinations: readonly WorldTravelDestination[],
        travelCost: number,
    ): number | undefined {
        const profile = this.profile;
        const availableMoney = Math.max(0, player.money - travelCost);
        let best: WorldTravelDestination | undefined;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const destination of destinations) {
            let score = destination.strategicScore;
            if (!destination.ownerId && availableMoney + profile.purchaseBias < destination.purchasePrice + profile.reserve) {
                score -= destination.purchasePrice * 1.4;
            }
            if (destination.reserveRisk === 'DANGER') score -= 900_000;
            else if (destination.reserveRisk === 'TIGHT') score -= 260_000;
            if (destination.ownerId && destination.ownerId !== player.id && destination.ownerTeamId !== player.teamId) {
                score -= destination.rent * profile.avoidsEnemyRentWeight;
            }
            if (score > bestScore || (score === bestScore && destination.tileIndex < (best?.tileIndex ?? Number.MAX_SAFE_INTEGER))) {
                best = destination;
                bestScore = score;
            }
        }
        return best?.tileIndex;
    }

    public chooseOlympicDestination(destinations: readonly OlympicDestination[]): number | undefined {
        let best: OlympicDestination | undefined;
        for (const destination of destinations) {
            if (!best
                || destination.projectedRent > best.projectedRent
                || (destination.projectedRent === best.projectedRent && destination.tileIndex < best.tileIndex)) {
                best = destination;
            }
        }
        return best?.tileIndex;
    }

    public chooseGameCenterOption(
        player: Readonly<PlayerState>,
        decision: Readonly<GameCenterDecision>,
    ): number | undefined {
        if (decision.options.length === 0) return undefined;
        const affordable = decision.lanes.filter((lane) => lane.affordable && decision.options.includes(lane.signal));
        if (affordable.length === 0) return decision.options[0];
        if (this.difficulty === 'CASUAL') return affordable[0]?.signal;
        if (this.difficulty === 'EXPERT') return affordable[affordable.length - 1]?.signal;
        const balanced = affordable.find((lane) => lane.risk === 'BALANCED');
        return balanced?.signal ?? affordable[Math.floor((affordable.length - 1) / 2)]?.signal;
    }

    public chooseFortuneCard(
        player: Readonly<PlayerState>,
        cards: readonly FortuneCardData[],
    ): string | undefined {
        let best: FortuneCardData | undefined;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const card of cards) {
            const score = this.fortuneCardScore(player, card);
            if (score > bestScore || (score === bestScore && card.id < (best?.id ?? 'zzzz'))) {
                best = card;
                bestScore = score;
            }
        }
        return best?.id;
    }

    public shouldTakeOver(
        player: Readonly<PlayerState>,
        decision: Readonly<PaymentDecision>,
    ): boolean {
        const profile = this.profile;
        if (!decision.takeoverAvailable || player.money < decision.takeoverCost) return false;
        const strategy = decision.takeoverStrategy;
        if (strategy.reserveRisk === 'DANGER' && !strategy.completesColorMonopoly && strategy.victoryProgressGain < 0.20) {
            return false;
        }
        if (strategy.reserveAfter < profile.reserve && strategy.strategicScore < 78) return false;
        const difficultyBonus = this.difficulty === 'EXPERT' ? 8 : this.difficulty === 'SMART' ? 3 : -5;
        const strategicThreshold = Math.round(54 / Math.max(0.75, profile.takeoverThreshold)) - difficultyBonus;
        return strategy.strategicScore >= strategicThreshold
            || strategy.completesColorMonopoly
            || strategy.breaksRivalColorMonopoly;
    }

    private fortuneCardScore(player: Readonly<PlayerState>, card: Readonly<FortuneCardData>): number {
        const difficultyMultiplier = this.difficulty === 'EXPERT' ? 1.18 : this.difficulty === 'SMART' ? 1.08 : 1;
        switch (card.effectType) {
            case FortuneEffectType.EarnMoney:
                return card.effectValue * difficultyMultiplier;
            case FortuneEffectType.LoseMoney:
                return -card.effectValue;
            case FortuneEffectType.MoveSteps:
                return card.effectValue >= 0 ? card.effectValue * 32_000 : card.effectValue * 18_000;
            case FortuneEffectType.GoToIsland:
                return -500_000;
            case FortuneEffectType.LeaveIsland:
                return player.islandTurns > 0 ? 650_000 : 20_000;
            case FortuneEffectType.RentDiscount:
                return card.effectValue * Math.max(1, card.duration) * 5_000;
            case FortuneEffectType.TakeoverProperty:
                return 720_000 + player.properties.length * 12_000;
            case FortuneEffectType.ProtectProperty:
                return player.properties.length > 0 ? 430_000 : 40_000;
            case FortuneEffectType.BuildingBonus:
                return Math.max(card.duration, card.effectValue) * 310_000;
            case FortuneEffectType.EconomicAttack:
                return card.effectValue * 2.3;
            case FortuneEffectType.SwapPosition:
                return 180_000;
            case FortuneEffectType.FreeWorldTravel:
                return Math.max(card.duration, card.effectValue) * 360_000;
            default:
                return 0;
        }
    }

    private get profile(): BotDifficultyProfile {
        return BOT_PROFILES[this.difficulty];
    }
}
