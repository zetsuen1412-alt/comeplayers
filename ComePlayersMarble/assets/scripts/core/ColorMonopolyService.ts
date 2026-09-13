import { BoardTileData, TileType } from '../data/BoardData';
import type { MatchMode, TeamId } from '../save/MatchSettingsData';

export const COLOR_MONOPOLY_RENT_MULTIPLIER = 2;

export interface ColorMonopolyParticipant {
    readonly id: string;
    readonly teamId?: TeamId;
    readonly properties: readonly number[];
    readonly bankrupt: boolean;
}

export interface ColorMonopolyStatus {
    readonly groupId: string;
    readonly tileIndices: readonly number[];
    readonly owned: number;
    readonly required: number;
    readonly completed: boolean;
    readonly rentMultiplier: number;
}

export interface ColorMonopolyVisualGroup {
    readonly groupId: string;
    readonly tileIndices: readonly number[];
    readonly representativePlayerId: string;
    readonly teamId?: TeamId;
}

interface OwnershipScope {
    readonly playerIds: readonly string[];
    readonly teamId?: TeamId;
    readonly owned: ReadonlySet<number>;
}

/**
 * Implements the classic completed-colour-set economy used by marble board games.
 * A completed city colour group doubles rent while remaining compatible with solo
 * and team ownership scopes. Tourism and special tiles are intentionally excluded.
 */
export class ColorMonopolyService {
    private readonly cityGroups: ReadonlyMap<string, readonly number[]>;

    public constructor(private readonly board: readonly BoardTileData[]) {
        const groups = new Map<string, number[]>();
        for (const tile of board) {
            if (tile.tileType !== TileType.City || !tile.colorGroup.startsWith('group-')) continue;
            const indices = groups.get(tile.colorGroup) ?? [];
            indices.push(tile.index);
            groups.set(tile.colorGroup, indices);
        }
        this.cityGroups = new Map(
            Array.from(groups.entries())
                .filter(([, indices]) => indices.length >= 2)
                .map(([groupId, indices]) => [groupId, [...indices]] as const),
        );
    }

    public statusFor(
        ownerId: string,
        tileIndex: number,
        players: readonly ColorMonopolyParticipant[],
        matchMode: MatchMode,
    ): ColorMonopolyStatus {
        return this.previewStatusFor(ownerId, tileIndex, players, matchMode);
    }

    public previewStatusFor(
        ownerId: string,
        tileIndex: number,
        players: readonly ColorMonopolyParticipant[],
        matchMode: MatchMode,
        additionalTileIndices: readonly number[] = [],
    ): ColorMonopolyStatus {
        const tile = this.board[tileIndex];
        const groupId = tile?.colorGroup ?? 'special';
        const tileIndices = this.cityGroups.get(groupId) ?? [];
        const scope = this.scopeForPlayer(ownerId, players, matchMode);
        const prospectiveOwned = new Set(scope?.owned ?? []);
        additionalTileIndices.forEach((index) => prospectiveOwned.add(index));
        const owned = tileIndices.filter((index) => prospectiveOwned.has(index)).length;
        const completed = tileIndices.length >= 2 && owned === tileIndices.length;
        return {
            groupId,
            tileIndices,
            owned,
            required: tileIndices.length,
            completed,
            rentMultiplier: completed ? COLOR_MONOPOLY_RENT_MULTIPLIER : 1,
        };
    }

    public completedVisualGroups(
        players: readonly ColorMonopolyParticipant[],
        matchMode: MatchMode,
    ): readonly ColorMonopolyVisualGroup[] {
        return this.scopes(players, matchMode).flatMap((scope): readonly ColorMonopolyVisualGroup[] => {
            const representativePlayerId = scope.playerIds.find((playerId) => (
                !players.find((player) => player.id === playerId)?.bankrupt
            )) ?? scope.playerIds[0];
            if (!representativePlayerId) return [];
            return Array.from(this.cityGroups.entries())
                .filter(([, indices]) => indices.every((tileIndex) => scope.owned.has(tileIndex)))
                .map(([groupId, tileIndices]) => ({
                    groupId,
                    tileIndices,
                    representativePlayerId,
                    teamId: scope.teamId,
                }));
        });
    }

    private scopeForPlayer(
        playerId: string,
        players: readonly ColorMonopolyParticipant[],
        matchMode: MatchMode,
    ): OwnershipScope | undefined {
        return this.scopes(players, matchMode).find((scope) => scope.playerIds.includes(playerId));
    }

    private scopes(
        players: readonly ColorMonopolyParticipant[],
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
}
