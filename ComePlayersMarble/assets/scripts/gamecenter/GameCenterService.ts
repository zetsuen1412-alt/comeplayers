import { GAME_RULES } from '../data/BoardData';

export type GameCenterRisk = 'SAFE' | 'BALANCED' | 'JACKPOT';

export interface GameCenterLane {
    readonly signal: number;
    readonly title: string;
    readonly risk: GameCenterRisk;
    readonly entryCost: number;
    readonly winReward: number;
    readonly netWin: number;
    readonly affordable: boolean;
}

export interface GameCenterDecision {
    readonly gameId: string;
    readonly title: string;
    readonly prompt: string;
    readonly options: readonly number[];
    readonly lanes: readonly GameCenterLane[];
    readonly winReward: number;
    readonly reserveFloor: number;
}

export interface GameCenterResult {
    readonly gameId: string;
    readonly selectedNumber: number;
    readonly targetNumber: number;
    readonly won: boolean;
    readonly entryCost: number;
    readonly grossReward: number;
    readonly reward: number;
    readonly netChange: number;
    readonly laneTitle: string;
    readonly risk: GameCenterRisk;
}

export interface GameCenterPlayer {
    money: number;
}

export interface GameCenterMiniGame {
    readonly id: string;
    createDecision(player: Readonly<GameCenterPlayer>): GameCenterDecision;
    resolve(
        player: GameCenterPlayer,
        decision: Readonly<GameCenterDecision>,
        selectedNumber: number,
        randomIndex: (maxExclusive: number) => number,
    ): GameCenterResult | undefined;
}

export class SignalMatchGame implements GameCenterMiniGame {
    public readonly id = 'signal-match';

    public createDecision(player: Readonly<GameCenterPlayer>): GameCenterDecision {
        const laneBlueprints = [
            { signal: 1, title: 'SAFE SIGNAL', risk: 'SAFE' as const, entryCost: GAME_RULES.gameCenterSafeEntry, winReward: GAME_RULES.gameCenterSafeReward },
            { signal: 2, title: 'PRO SIGNAL', risk: 'BALANCED' as const, entryCost: GAME_RULES.gameCenterBalancedEntry, winReward: GAME_RULES.gameCenterBalancedReward },
            { signal: 3, title: 'JACKPOT SIGNAL', risk: 'JACKPOT' as const, entryCost: GAME_RULES.gameCenterJackpotEntry, winReward: GAME_RULES.gameCenterJackpotReward },
        ];
        const lanes: GameCenterLane[] = laneBlueprints.map((lane) => ({
            ...lane,
            netWin: lane.winReward - lane.entryCost,
            affordable: player.money >= lane.entryCost + GAME_RULES.gameCenterReserveFloor,
        }));
        const affordableOptions = lanes.filter((lane) => lane.affordable).map((lane) => lane.signal);
        // A player with a very low balance may still use the recovery signal without a fee.
        if (affordableOptions.length === 0) {
            const recovery = lanes[0];
            if (recovery) lanes[0] = { ...recovery, title: 'RECOVERY SIGNAL', entryCost: 0, netWin: recovery.winReward, affordable: true };
        }
        const options = lanes.filter((lane) => lane.affordable).map((lane) => lane.signal);
        return {
            gameId: this.id,
            title: 'Signal Match Arena',
            prompt: 'Choose a risk lane. The entry fee is charged when your signal is locked.',
            options,
            lanes,
            winReward: Math.max(...lanes.map((lane) => lane.winReward)),
            reserveFloor: GAME_RULES.gameCenterReserveFloor,
        };
    }

    public resolve(
        player: GameCenterPlayer,
        decision: Readonly<GameCenterDecision>,
        selectedNumber: number,
        randomIndex: (maxExclusive: number) => number,
    ): GameCenterResult | undefined {
        if (decision.gameId !== this.id || decision.options.indexOf(selectedNumber) < 0) return undefined;
        const lane = decision.lanes.find((entry) => entry.signal === selectedNumber);
        if (!lane?.affordable || player.money < lane.entryCost) return undefined;
        const targetOffset = randomIndex(decision.lanes.length);
        if (!Number.isInteger(targetOffset) || targetOffset < 0 || targetOffset >= decision.lanes.length) return undefined;
        const targetNumber = decision.lanes[targetOffset]?.signal;
        if (targetNumber === undefined) return undefined;

        player.money -= lane.entryCost;
        const won = selectedNumber === targetNumber;
        const grossReward = won ? lane.winReward : 0;
        player.money += grossReward;
        const netChange = grossReward - lane.entryCost;
        return {
            gameId: this.id,
            selectedNumber,
            targetNumber,
            won,
            entryCost: lane.entryCost,
            grossReward,
            reward: grossReward,
            netChange,
            laneTitle: lane.title,
            risk: lane.risk,
        };
    }
}

export class GameCenterService {
    public constructor(
        private readonly randomIndex: (maxExclusive: number) => number,
        private readonly activeGame: GameCenterMiniGame = new SignalMatchGame(),
    ) {}

    public createDecision(player: Readonly<GameCenterPlayer>): GameCenterDecision {
        return this.activeGame.createDecision(player);
    }

    public confirm(
        player: GameCenterPlayer,
        decision: Readonly<GameCenterDecision>,
        selectedNumber: number,
    ): GameCenterResult | undefined {
        return this.activeGame.resolve(player, decision, selectedNumber, this.randomIndex);
    }
}
