import type { MatchMode, TeamId } from '../save/MatchSettingsData';

export type MatchEndReason =
    | 'LAST_PLAYER'
    | 'LAST_TEAM'
    | 'ROUND_LIMIT'
    | 'TRIPLE_MONOPOLY'
    | 'LINE_MONOPOLY'
    | 'TOURISM_MONOPOLY';

export interface MatchResultPlayerSnapshot {
    readonly playerId: string;
    readonly name: string;
    readonly color: string;
    readonly teamId?: TeamId;
    readonly money: number;
    readonly propertyValue: number;
    readonly propertyCount: number;
    readonly buildingCount: number;
    readonly bankrupt: boolean;
}

export interface MatchResultEntry extends MatchResultPlayerSnapshot {
    readonly rank: number;
    readonly netWorth: number;
}

export interface MatchResultTeamEntry {
    readonly teamId: TeamId;
    readonly rank: number;
    readonly netWorth: number;
    readonly money: number;
    readonly propertyValue: number;
    readonly propertyCount: number;
    readonly buildingCount: number;
    readonly solventPlayers: number;
    readonly playerIds: readonly string[];
}

export interface MatchResultSummary {
    readonly winnerId: string;
    readonly winningTeamId?: TeamId;
    readonly matchMode: MatchMode;
    readonly completedRound: number;
    readonly reason: MatchEndReason;
    readonly entries: readonly MatchResultEntry[];
    readonly teamEntries: readonly MatchResultTeamEntry[];
}

export interface MatchResultOverride {
    readonly winnerId: string;
    readonly winningTeamId?: TeamId;
    readonly reason: Extract<MatchEndReason, 'TRIPLE_MONOPOLY' | 'LINE_MONOPOLY' | 'TOURISM_MONOPOLY'>;
}

export class MatchResultService {
    public create(
        round: number,
        maximumRounds: number,
        players: readonly MatchResultPlayerSnapshot[],
        matchMode: MatchMode = 'SOLO',
        override?: MatchResultOverride,
    ): MatchResultSummary {
        if (players.length === 0) throw new Error('Match result requires at least one player.');
        const ordered = players
            .map((player) => ({ ...player, netWorth: player.money + player.propertyValue }))
            .sort((left, right) => this.comparePlayers(left, right, override));
        const ranked = ordered.map((player, index): MatchResultEntry => ({ ...player, rank: index + 1 }));

        const teamEntries = matchMode === 'TEAM'
            ? this.createTeamEntries(ranked, override?.winningTeamId)
            : [];
        const winningTeamId = override?.winningTeamId ?? teamEntries[0]?.teamId;
        const winner = override
            ? ranked.find((entry) => entry.playerId === override.winnerId)
                ?? ranked.find((entry) => Boolean(winningTeamId && entry.teamId === winningTeamId && !entry.bankrupt))
                ?? ranked[0]
            : matchMode === 'TEAM' && winningTeamId
                ? ranked.find((entry) => entry.teamId === winningTeamId && !entry.bankrupt)
                    ?? ranked.find((entry) => entry.teamId === winningTeamId)
                    ?? ranked[0]
                : ranked[0];
        if (!winner) throw new Error('Match result could not resolve a winner.');

        const solventCount = players.filter((player) => !player.bankrupt).length;
        const solventTeams = new Set(
            players.filter((player) => !player.bankrupt && player.teamId).map((player) => player.teamId),
        ).size;
        const reason: MatchEndReason = override?.reason ?? (matchMode === 'TEAM'
            ? solventTeams <= 1 ? 'LAST_TEAM' : 'ROUND_LIMIT'
            : solventCount <= 1 ? 'LAST_PLAYER' : 'ROUND_LIMIT');

        return {
            winnerId: winner.playerId,
            winningTeamId,
            matchMode,
            completedRound: Math.max(1, Math.min(Math.trunc(round), maximumRounds)),
            reason,
            entries: ranked,
            teamEntries,
        };
    }

    private comparePlayers(
        left: MatchResultPlayerSnapshot & { readonly netWorth: number },
        right: MatchResultPlayerSnapshot & { readonly netWorth: number },
        override?: MatchResultOverride,
    ): number {
        if (override?.winningTeamId) {
            const leftWins = left.teamId === override.winningTeamId;
            const rightWins = right.teamId === override.winningTeamId;
            if (leftWins !== rightWins) return leftWins ? -1 : 1;
        } else if (override) {
            const leftWins = left.playerId === override.winnerId;
            const rightWins = right.playerId === override.winnerId;
            if (leftWins !== rightWins) return leftWins ? -1 : 1;
        }
        if (left.bankrupt !== right.bankrupt) return left.bankrupt ? 1 : -1;
        if (left.netWorth !== right.netWorth) return right.netWorth - left.netWorth;
        if (left.propertyValue !== right.propertyValue) return right.propertyValue - left.propertyValue;
        if (left.money !== right.money) return right.money - left.money;
        return left.playerId < right.playerId ? -1 : left.playerId > right.playerId ? 1 : 0;
    }

    private createTeamEntries(
        players: readonly MatchResultEntry[],
        preferredTeamId?: TeamId,
    ): readonly MatchResultTeamEntry[] {
        const teamIds: readonly TeamId[] = ['BLUE', 'GOLD'];
        return teamIds
            .map((teamId): MatchResultTeamEntry => {
                const members = players.filter((player) => player.teamId === teamId);
                return {
                    teamId,
                    rank: 0,
                    netWorth: members.reduce((total, player) => total + player.netWorth, 0),
                    money: members.reduce((total, player) => total + player.money, 0),
                    propertyValue: members.reduce((total, player) => total + player.propertyValue, 0),
                    propertyCount: members.reduce((total, player) => total + player.propertyCount, 0),
                    buildingCount: members.reduce((total, player) => total + player.buildingCount, 0),
                    solventPlayers: members.filter((player) => !player.bankrupt).length,
                    playerIds: members.map((player) => player.playerId),
                };
            })
            .sort((left, right) => {
                if (preferredTeamId) {
                    const leftWins = left.teamId === preferredTeamId;
                    const rightWins = right.teamId === preferredTeamId;
                    if (leftWins !== rightWins) return leftWins ? -1 : 1;
                }
                if (left.solventPlayers !== right.solventPlayers) return right.solventPlayers - left.solventPlayers;
                if (left.netWorth !== right.netWorth) return right.netWorth - left.netWorth;
                if (left.propertyValue !== right.propertyValue) return right.propertyValue - left.propertyValue;
                return left.teamId < right.teamId ? -1 : 1;
            })
            .map((team, index) => ({ ...team, rank: index + 1 }));
    }
}
