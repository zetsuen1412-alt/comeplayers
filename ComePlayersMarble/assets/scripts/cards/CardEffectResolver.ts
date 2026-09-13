import { LandmarkService } from '../buildings/LandmarkService';
import { PropertyController, PropertyState } from '../buildings/PropertyController';
import { BoardTileData, GAME_RULES, TileType } from '../data/BoardData';
import { FortuneCardData, FortuneEffectType, FortuneTargetType } from './FortuneCardData';

export interface FortunePlayerState {
    readonly id: string;
    readonly name: string;
    money: number;
    tileIndex: number;
    readonly properties: number[];
    islandTurns: number;
    bankrupt: boolean;
    rentDiscountPercent: number;
    rentDiscountCharges: number;
    freeUpgradeCredits: number;
    freeWorldTravelCredits: number;
}

export interface CardMovement {
    readonly playerId: string;
    readonly path: readonly number[];
}

export interface CardEffectResult {
    readonly message: string;
    readonly movements: readonly CardMovement[];
    readonly changedPropertyIndices: readonly number[];
    readonly blocksExtraTurn: boolean;
}

export class CardEffectResolver {
    private readonly landmarks = new LandmarkService();

    public constructor(
        private readonly board: readonly BoardTileData[],
        private readonly properties: PropertyController,
        private readonly randomIndex: (maxExclusive: number) => number,
    ) {}

    public resolve(
        card: Readonly<FortuneCardData>,
        player: FortunePlayerState,
        players: readonly FortunePlayerState[],
    ): CardEffectResult {
        switch (card.effectType) {
            case FortuneEffectType.EarnMoney:
                player.money += card.effectValue;
                return this.result(`${player.name} received ${this.money(card.effectValue)}.`);
            case FortuneEffectType.LoseMoney:
                return this.loseMoney(player, card.effectValue);
            case FortuneEffectType.MoveSteps:
                return this.moveSteps(player, card.effectValue);
            case FortuneEffectType.GoToIsland:
                return this.goToIsland(player, card.duration);
            case FortuneEffectType.LeaveIsland:
                return this.leaveIsland(player);
            case FortuneEffectType.RentDiscount:
                player.rentDiscountPercent = Math.max(player.rentDiscountPercent, this.clampPercent(card.effectValue));
                player.rentDiscountCharges += Math.max(1, card.duration);
                return this.result(`${player.name} gained a ${player.rentDiscountPercent}% rent discount for ${player.rentDiscountCharges} payments.`);
            case FortuneEffectType.TakeoverProperty:
                return this.takeover(player, players);
            case FortuneEffectType.ProtectProperty:
                return this.protectProperty(player, card.duration);
            case FortuneEffectType.BuildingBonus:
                player.freeUpgradeCredits += Math.max(1, card.duration, card.effectValue);
                return this.result(`${player.name} stored ${player.freeUpgradeCredits} free building upgrades.`);
            case FortuneEffectType.EconomicAttack:
                return this.economicAttack(player, players, card.targetType, card.effectValue);
            case FortuneEffectType.SwapPosition:
                return this.swapPosition(player, players);
            case FortuneEffectType.FreeWorldTravel:
                player.freeWorldTravelCredits += Math.max(1, card.duration, card.effectValue);
                return this.result(`${player.name} stored ${player.freeWorldTravelCredits} free World Travel tickets.`);
            default:
                return this.result('The card effect was not recognized and was ignored.');
        }
    }

    private loseMoney(player: FortunePlayerState, amount: number): CardEffectResult {
        const paid = Math.min(player.money, Math.max(0, amount));
        player.money -= paid;
        player.bankrupt = player.money <= 0;
        return this.result(`${player.name} lost ${this.money(paid)}${player.bankrupt ? ' and went bankrupt.' : '.'}`);
    }

    private moveSteps(player: FortunePlayerState, requestedSteps: number): CardEffectResult {
        const steps = Math.trunc(requestedSteps);
        const direction = steps >= 0 ? 1 : -1;
        const path: number[] = [];
        let startsPassed = 0;
        for (let index = 0; index < Math.abs(steps); index++) {
            player.tileIndex = (player.tileIndex + direction + this.board.length) % this.board.length;
            if (direction > 0 && player.tileIndex === 0) {
                player.money += GAME_RULES.startSalary;
                startsPassed++;
            }
            path.push(player.tileIndex);
        }
        const directionLabel = direction > 0 ? 'moved forward' : 'moved back';
        const salary = startsPassed > 0 ? ` Bonus START +${this.money(GAME_RULES.startSalary * startsPassed)}.` : '';
        return {
            message: `${player.name} ${directionLabel} ${Math.abs(steps)} spaces.${salary}`,
            movements: [{ playerId: player.id, path }],
            changedPropertyIndices: [],
            blocksExtraTurn: false,
        };
    }

    private goToIsland(player: FortunePlayerState, duration: number): CardEffectResult {
        const island = this.board.find((tile) => tile.tileType === TileType.Island);
        if (!island) return this.result('The Island could not be found; the effect was cancelled.');
        player.tileIndex = island.index;
        player.islandTurns = Math.max(1, duration || GAME_RULES.islandTurnPenalty);
        return {
            message: `${player.name} was sent to the Island for ${player.islandTurns} turns.`,
            movements: [{ playerId: player.id, path: [island.index] }],
            changedPropertyIndices: [],
            blocksExtraTurn: true,
        };
    }

    private leaveIsland(player: FortunePlayerState): CardEffectResult {
        if (player.islandTurns <= 0) return this.result(`${player.name} is not currently on the Island.`);
        player.islandTurns = 0;
        return this.result(`${player.name} is free from the Island.`);
    }

    private takeover(player: FortunePlayerState, players: readonly FortunePlayerState[]): CardEffectResult {
        const opponentProperties = this.properties.values().filter((state) => {
            if (state.ownerId === player.id) return false;
            const owner = players.find((entry) => entry.id === state.ownerId);
            return owner !== undefined && !owner.bankrupt && !this.landmarks.isLandmark(state);
        });
        if (opponentProperties.length === 0) return this.result('There are no rival properties available for takeover.');

        const state = opponentProperties[this.randomIndex(opponentProperties.length)] as PropertyState;
        const tile = this.board[state.tileIndex];
        const previousOwner = players.find((entry) => entry.id === state.ownerId);
        if (!tile || !previousOwner) return this.result('The takeover target is invalid.');
        if (state.protected) {
            this.properties.consumeProtection(state.tileIndex);
            return {
                message: `A firewall protected ${tile.displayName} from the takeover.`,
                movements: [],
                changedPropertyIndices: [state.tileIndex],
                blocksExtraTurn: false,
            };
        }

        const transferred = this.properties.transfer(state.tileIndex, player.id);
        if (!transferred) return this.result(`${tile.displayName} could not be taken over.`);
        this.removeProperty(previousOwner.properties, state.tileIndex);
        if (player.properties.indexOf(state.tileIndex) < 0) player.properties.push(state.tileIndex);
        return {
            message: `${player.name} took over ${tile.displayName} from ${previousOwner.name}.`,
            movements: [],
            changedPropertyIndices: [state.tileIndex],
            blocksExtraTurn: false,
        };
    }

    private protectProperty(player: FortunePlayerState, duration: number): CardEffectResult {
        const owned = player.properties
            .map((tileIndex) => this.properties.stateAt(tileIndex))
            .filter((state): state is PropertyState => state !== undefined)
            .sort((left, right) => right.buildingLevel - left.buildingLevel);
        const target = owned[0];
        if (!target) return this.result(`${player.name} does not own a property to protect yet.`);
        const protectedState = this.properties.protect(target.tileIndex, Math.max(1, duration));
        const tile = this.board[target.tileIndex];
        return {
            message: `${tile?.displayName ?? 'Property'} is protected from ${protectedState?.protectionCharges ?? 0} takeover attempts.`,
            movements: [],
            changedPropertyIndices: [target.tileIndex],
            blocksExtraTurn: false,
        };
    }

    private economicAttack(
        player: FortunePlayerState,
        players: readonly FortunePlayerState[],
        targetType: FortuneTargetType,
        amount: number,
    ): CardEffectResult {
        const opponents = players.filter((entry) => entry.id !== player.id && !entry.bankrupt);
        let targets: FortunePlayerState[] = [];
        if (targetType === FortuneTargetType.AllOpponents) {
            targets = opponents;
        } else if (targetType === FortuneTargetType.RichestOpponent && opponents.length > 0) {
            targets = [[...opponents].sort((left, right) => right.money - left.money)[0] as FortunePlayerState];
        } else if (opponents.length > 0) {
            targets = [opponents[this.randomIndex(opponents.length)] as FortunePlayerState];
        }
        if (targets.length === 0) return this.result('There are no opponents available to attack.');

        const summaries = targets.map((target) => {
            const paid = Math.min(target.money, Math.max(0, amount));
            target.money -= paid;
            target.bankrupt = target.money <= 0;
            return `${target.name} -${this.money(paid)}${target.bankrupt ? ' (BANKRUPT)' : ''}`;
        });
        return this.result(`Economic attack: ${summaries.join(', ')}.`);
    }

    private swapPosition(player: FortunePlayerState, players: readonly FortunePlayerState[]): CardEffectResult {
        const opponents = players.filter((entry) => entry.id !== player.id && !entry.bankrupt);
        if (opponents.length === 0) return this.result('There are no opponents available for a position swap.');
        const target = opponents[this.randomIndex(opponents.length)] as FortunePlayerState;
        const playerOrigin = player.tileIndex;
        const targetOrigin = target.tileIndex;
        player.tileIndex = targetOrigin;
        target.tileIndex = playerOrigin;
        return {
            message: `${player.name} swapped positions with ${target.name}.`,
            movements: [
                { playerId: player.id, path: [targetOrigin] },
                { playerId: target.id, path: [playerOrigin] },
            ],
            changedPropertyIndices: [],
            blocksExtraTurn: false,
        };
    }

    private result(message: string): CardEffectResult {
        return { message, movements: [], changedPropertyIndices: [], blocksExtraTurn: false };
    }

    private clampPercent(value: number): number {
        return Math.max(0, Math.min(100, Math.round(value)));
    }

    private removeProperty(properties: number[], tileIndex: number): void {
        const index = properties.indexOf(tileIndex);
        if (index >= 0) properties.splice(index, 1);
    }

    private money(value: number): string {
        return `CP ${value.toLocaleString('en-US')}`;
    }
}
