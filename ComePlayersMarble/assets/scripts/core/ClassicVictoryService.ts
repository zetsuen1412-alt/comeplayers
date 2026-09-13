import { BoardTileData, TileType } from '../data/BoardData';
import type { MatchMode, TeamId } from '../save/MatchSettingsData';

export type ClassicVictoryKind = 'TRIPLE_MONOPOLY' | 'LINE_MONOPOLY' | 'TOURISM_MONOPOLY';

export interface ClassicVictoryParticipant {
    readonly id: string;
    readonly teamId?: TeamId;
    readonly properties: readonly number[];
    readonly bankrupt: boolean;
}

export interface ClassicVictory {
    readonly kind: ClassicVictoryKind;
    readonly label: string;
    readonly winnerPlayerId: string;
    readonly winningTeamId?: TeamId;
    readonly completedColorGroups: readonly string[];
    readonly completedSideIndex?: number;
    readonly tourismTileIndices: readonly number[];
}

export interface ClassicVictoryProgress {
    readonly completeColorGroups: number;
    readonly requiredColorGroups: number;
    readonly bestColorGroupOwned: number;
    readonly bestColorGroupRequired: number;
    readonly bestLineOwned: number;
    readonly bestLineRequired: number;
    readonly tourismOwned: number;
    readonly tourismRequired: number;
    readonly nearestGoal: ClassicVictoryKind;
    readonly summary: string;
}

interface OwnershipScope {
    readonly playerIds: readonly string[];
    readonly teamId?: TeamId;
    readonly owned: ReadonlySet<number>;
}

export class ClassicVictoryService {
    private readonly cityGroups: ReadonlyMap<string, readonly number[]>;
    private readonly lineGroups: readonly (readonly number[])[];
    private readonly tourismTiles: readonly number[];

    public constructor(private readonly board: readonly BoardTileData[]) {
        this.cityGroups = this.createCityGroups();
        this.lineGroups = this.createLineGroups();
        this.tourismTiles = board
            .filter((tile) => tile.tileType === TileType.Tourist)
            .map((tile) => tile.index);
    }

    public evaluate(
        players: readonly ClassicVictoryParticipant[],
        matchMode: MatchMode,
        preferredPlayerId?: string,
    ): ClassicVictory | null {
        for (const scope of this.scopes(players, matchMode)) {
            const winnerPlayerId = this.resolveWinnerPlayerId(scope, players, preferredPlayerId);
            if (!winnerPlayerId) continue;

            const completedColorGroups = this.completedGroups(scope.owned);
            if (completedColorGroups.length >= 3) {
                return {
                    kind: 'TRIPLE_MONOPOLY',
                    label: 'TRIPLE MONOPOLY',
                    winnerPlayerId,
                    winningTeamId: scope.teamId,
                    completedColorGroups: completedColorGroups.slice(0, 3),
                    tourismTileIndices: [],
                };
            }

            const completedSideIndex = this.lineGroups.findIndex((indices) => this.ownsAll(scope.owned, indices));
            if (completedSideIndex >= 0) {
                return {
                    kind: 'LINE_MONOPOLY',
                    label: 'LINE MONOPOLY',
                    winnerPlayerId,
                    winningTeamId: scope.teamId,
                    completedColorGroups,
                    completedSideIndex,
                    tourismTileIndices: [],
                };
            }

            if (this.tourismTiles.length >= 2 && this.ownsAll(scope.owned, this.tourismTiles)) {
                return {
                    kind: 'TOURISM_MONOPOLY',
                    label: 'TOURISM MONOPOLY',
                    winnerPlayerId,
                    winningTeamId: scope.teamId,
                    completedColorGroups,
                    tourismTileIndices: this.tourismTiles,
                };
            }
        }
        return null;
    }

    public progressFor(
        playerId: string,
        players: readonly ClassicVictoryParticipant[],
        matchMode: MatchMode,
    ): ClassicVictoryProgress {
        const scope = this.scopeForPlayer(playerId, players, matchMode);
        const owned = scope?.owned ?? new Set<number>();
        const completeColorGroups = this.completedGroups(owned).length;
        const colorProgress = this.bestProgress(owned, Array.from(this.cityGroups.values()));
        const lineProgress = this.bestProgress(owned, this.lineGroups);
        const tourismOwned = this.tourismTiles.filter((tileIndex) => owned.has(tileIndex)).length;
        const tourismRequired = this.tourismTiles.length;

        const tripleRatio = Math.min(1, completeColorGroups / 3);
        const lineRatio = lineProgress.required > 0 ? lineProgress.owned / lineProgress.required : 0;
        const tourismRatio = tourismRequired > 0 ? tourismOwned / tourismRequired : 0;
        const nearestGoal: ClassicVictoryKind = tripleRatio >= lineRatio && tripleRatio >= tourismRatio
            ? 'TRIPLE_MONOPOLY'
            : lineRatio >= tourismRatio ? 'LINE_MONOPOLY' : 'TOURISM_MONOPOLY';

        return {
            completeColorGroups,
            requiredColorGroups: 3,
            bestColorGroupOwned: colorProgress.owned,
            bestColorGroupRequired: colorProgress.required,
            bestLineOwned: lineProgress.owned,
            bestLineRequired: lineProgress.required,
            tourismOwned,
            tourismRequired,
            nearestGoal,
            summary: `TRIPLE ${completeColorGroups}/3  •  LINE ${lineProgress.owned}/${lineProgress.required || 0}  •  TOUR ${tourismOwned}/${tourismRequired}`,
        };
    }

    private scopes(
        players: readonly ClassicVictoryParticipant[],
        matchMode: MatchMode,
    ): readonly OwnershipScope[] {
        if (matchMode === 'TEAM') {
            const teamIds: readonly TeamId[] = ['BLUE', 'GOLD'];
            return teamIds.flatMap((teamId): readonly OwnershipScope[] => {
                const members = players.filter((player) => player.teamId === teamId);
                if (members.length === 0 || members.every((player) => player.bankrupt)) return [];
                return [{
                    teamId,
                    playerIds: members.map((player) => player.id),
                    owned: new Set(members.flatMap((player) => player.properties)),
                }];
            });
        }

        return players
            .filter((player) => !player.bankrupt)
            .map((player): OwnershipScope => ({
                playerIds: [player.id],
                owned: new Set(player.properties),
            }));
    }

    private scopeForPlayer(
        playerId: string,
        players: readonly ClassicVictoryParticipant[],
        matchMode: MatchMode,
    ): OwnershipScope | undefined {
        return this.scopes(players, matchMode).find((scope) => scope.playerIds.includes(playerId));
    }

    private resolveWinnerPlayerId(
        scope: OwnershipScope,
        players: readonly ClassicVictoryParticipant[],
        preferredPlayerId?: string,
    ): string | undefined {
        if (preferredPlayerId && scope.playerIds.includes(preferredPlayerId)) return preferredPlayerId;
        return scope.playerIds.find((id) => !players.find((player) => player.id === id)?.bankrupt)
            ?? scope.playerIds[0];
    }

    private createCityGroups(): ReadonlyMap<string, readonly number[]> {
        const groups = new Map<string, number[]>();
        for (const tile of this.board) {
            if (tile.tileType !== TileType.City || !tile.colorGroup.startsWith('group-')) continue;
            const indices = groups.get(tile.colorGroup) ?? [];
            indices.push(tile.index);
            groups.set(tile.colorGroup, indices);
        }
        return new Map(
            Array.from(groups.entries())
                .filter(([, indices]) => indices.length >= 2)
                .map(([group, indices]) => [group, indices] as const),
        );
    }

    private createLineGroups(): readonly (readonly number[])[] {
        const sides: number[][] = [[], [], [], []];
        for (const tile of this.board) {
            if (tile.tileType !== TileType.City) continue;
            const side = Math.max(0, Math.min(3, Math.floor(tile.index / 8)));
            sides[side]?.push(tile.index);
        }
        return sides.filter((indices) => indices.length >= 2);
    }

    private completedGroups(owned: ReadonlySet<number>): readonly string[] {
        return Array.from(this.cityGroups.entries())
            .filter(([, indices]) => this.ownsAll(owned, indices))
            .map(([group]) => group);
    }

    private bestProgress(
        owned: ReadonlySet<number>,
        groups: readonly (readonly number[])[],
    ): { readonly owned: number; readonly required: number } {
        let bestOwned = 0;
        let bestRequired = groups[0]?.length ?? 0;
        let bestRatio = -1;
        for (const indices of groups) {
            const count = indices.filter((tileIndex) => owned.has(tileIndex)).length;
            const ratio = indices.length > 0 ? count / indices.length : 0;
            if (ratio > bestRatio || (ratio === bestRatio && count > bestOwned)) {
                bestRatio = ratio;
                bestOwned = count;
                bestRequired = indices.length;
            }
        }
        return { owned: bestOwned, required: bestRequired };
    }

    private ownsAll(owned: ReadonlySet<number>, indices: readonly number[]): boolean {
        return indices.length > 0 && indices.every((tileIndex) => owned.has(tileIndex));
    }
}
