import type { MatchResultEntry, MatchResultSummary } from './MatchResultService';

export type MatchAwardKind =
    | 'MVP'
    | 'CITY_TYCOON'
    | 'MASTER_BUILDER'
    | 'CASH_RESERVE'
    | 'IRON_SURVIVOR';

export type MatchPerformanceGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface MatchAward {
    readonly kind: MatchAwardKind;
    readonly title: string;
    readonly playerId: string;
    readonly playerName: string;
    readonly color: string;
    readonly valueLabel: string;
    readonly priority: number;
}

export interface MatchPerformanceSnapshot {
    readonly playerId: string;
    readonly playerName: string;
    readonly rank: number;
    readonly score: number;
    readonly grade: MatchPerformanceGrade;
    readonly netWorthShare: number;
    readonly awardCount: number;
}

export interface MatchAwardsSummary {
    readonly awards: readonly MatchAward[];
    readonly performances: readonly MatchPerformanceSnapshot[];
}

export class MatchAwardsService {
    public create(summary: Readonly<MatchResultSummary>): MatchAwardsSummary {
        const entries = [...summary.entries];
        if (entries.length === 0) return { awards: [], performances: [] };

        const winner = entries.find((entry) => entry.playerId === summary.winnerId) ?? entries[0] as MatchResultEntry;
        const awards: MatchAward[] = [
            this.award('MVP', 'MATCH MVP', winner, `#${winner.rank}  •  NET CP ${winner.netWorth.toLocaleString('en-US')}`, 100),
            this.award('CITY_TYCOON', 'CITY TYCOON', this.maximum(entries, 'propertyCount'), `${this.maximum(entries, 'propertyCount').propertyCount} CITIES`, 80),
            this.award('MASTER_BUILDER', 'MASTER BUILDER', this.maximum(entries, 'buildingCount'), `${this.maximum(entries, 'buildingCount').buildingCount} BUILDINGS`, 70),
            this.award('CASH_RESERVE', 'CASH RESERVE', this.maximum(entries, 'money'), `CP ${this.maximum(entries, 'money').money.toLocaleString('en-US')}`, 60),
            this.award(
                'IRON_SURVIVOR',
                'IRON SURVIVOR',
                this.maximum(entries.filter((entry) => !entry.bankrupt).length > 0 ? entries.filter((entry) => !entry.bankrupt) : entries, 'netWorth'),
                'FINISHED SOLVENT',
                50,
            ),
        ];

        const totalNetWorth = Math.max(1, entries.reduce((total, entry) => total + Math.max(0, entry.netWorth), 0));
        const maximumProperties = Math.max(1, ...entries.map((entry) => entry.propertyCount));
        const maximumBuildings = Math.max(1, ...entries.map((entry) => entry.buildingCount));
        const performances = entries.map((entry): MatchPerformanceSnapshot => {
            const rankScore = Math.max(0, 46 - (entry.rank - 1) * 12);
            const wealthScore = Math.round(entry.netWorth / totalNetWorth * 26);
            const cityScore = Math.round(entry.propertyCount / maximumProperties * 10);
            const buildingScore = Math.round(entry.buildingCount / maximumBuildings * 10);
            const survivalScore = entry.bankrupt ? 0 : 8;
            const victoryScore = entry.playerId === summary.winnerId ? 10 : 0;
            const score = Math.max(0, Math.min(100, rankScore + wealthScore + cityScore + buildingScore + survivalScore + victoryScore));
            return {
                playerId: entry.playerId,
                playerName: entry.name,
                rank: entry.rank,
                score,
                grade: this.grade(score),
                netWorthShare: entry.netWorth / totalNetWorth,
                awardCount: awards.filter((award) => award.playerId === entry.playerId).length,
            };
        });

        return {
            awards: awards.sort((left, right) => right.priority - left.priority),
            performances: performances.sort((left, right) => left.rank - right.rank),
        };
    }

    private award(
        kind: MatchAwardKind,
        title: string,
        entry: Readonly<MatchResultEntry>,
        valueLabel: string,
        priority: number,
    ): MatchAward {
        return {
            kind,
            title,
            playerId: entry.playerId,
            playerName: entry.name,
            color: entry.color,
            valueLabel,
            priority,
        };
    }

    private maximum(
        entries: readonly MatchResultEntry[],
        metric: 'money' | 'netWorth' | 'propertyCount' | 'buildingCount',
    ): MatchResultEntry {
        return [...entries].sort((left, right) => {
            if (left[metric] !== right[metric]) return right[metric] - left[metric];
            if (left.bankrupt !== right.bankrupt) return left.bankrupt ? 1 : -1;
            if (left.rank !== right.rank) return left.rank - right.rank;
            return left.playerId < right.playerId ? -1 : 1;
        })[0] as MatchResultEntry;
    }

    private grade(score: number): MatchPerformanceGrade {
        if (score >= 88) return 'S';
        if (score >= 74) return 'A';
        if (score >= 60) return 'B';
        if (score >= 45) return 'C';
        return 'D';
    }
}
