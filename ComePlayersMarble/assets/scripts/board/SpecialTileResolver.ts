import { BoardTileData, GAME_RULES, TileType } from '../data/BoardData';

export interface SpecialTilePlayer {
    readonly name: string;
    money: number;
    islandTurns: number;
    bankrupt: boolean;
}

export interface SpecialTileResult {
    readonly applied: boolean;
    readonly message: string;
}

export class SpecialTileResolver {
    public resolve(player: SpecialTilePlayer, tile: Readonly<BoardTileData>): SpecialTileResult {
        switch (tile.tileType) {
            case TileType.Island:
                player.islandTurns = GAME_RULES.islandTurnPenalty;
                return { applied: true, message: `${player.name} is stranded on the Island for ${player.islandTurns} turns.` };
            case TileType.Tax: {
                const paid = Math.min(player.money, GAME_RULES.taxAmount);
                player.money -= paid;
                player.bankrupt = player.money <= 0;
                return { applied: true, message: `System Tax collected ${this.money(paid)}.` };
            }
            case TileType.Bonus:
                player.money += GAME_RULES.bonusReward;
                return { applied: true, message: `Bonus Game awarded ${this.money(GAME_RULES.bonusReward)}.` };
            case TileType.Start:
                return { applied: true, message: 'Stopped on START. Get ready for the next lap.' };
            default:
                return { applied: false, message: `${tile.description} The full rule module is coming later.` };
        }
    }

    private money(value: number): string {
        return `CP ${value.toLocaleString('en-US')}`;
    }
}
