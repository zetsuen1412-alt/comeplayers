import {
    MatchReplayRecord,
    normalizeReplayLibrary,
    normalizeReplayRecord,
    ReplayAcademyMetric,
    ReplayAcademySnapshot,
    ReplayLibraryData,
    REPLAY_LIBRARY_LIMIT,
} from '../save/ReplayLibraryData';
import { ReplayAcademyService } from './ReplayAcademyService';
import { ReplayCoachService } from './ReplayCoachService';

export interface ReplayLibraryStoreSaveResult {
    readonly data: ReplayLibraryData;
    readonly persisted: boolean;
}

export interface ReplayLibraryStore {
    loadReplayLibrary(): ReplayLibraryData;
    saveReplayLibrary(data: ReplayLibraryData): ReplayLibraryStoreSaveResult;
}

export interface ReplayLibrarySnapshot {
    readonly recordCount: number;
    readonly nextSequence: number;
    readonly records: readonly MatchReplayRecord[];
    readonly latest: MatchReplayRecord | null;
    readonly academy: ReplayAcademySnapshot;
    readonly academyBestAverageScore: number;
    readonly academyBestConsistencyScore: number;
    readonly academyTotalCompletedDrills: number;
    readonly liveObjectiveCompletions: number;
    readonly liveObjectiveStreak: number;
    readonly bestLiveObjectiveStreak: number;
    readonly totalLiveObjectiveCredits: number;
}

export interface ReplayLibraryActionResult {
    readonly ok: boolean;
    readonly persisted: boolean;
    readonly message: string;
    readonly snapshot: ReplayLibrarySnapshot;
}

export class ReplayLibraryService {
    private data: ReplayLibraryData;
    private readonly replayCoach = new ReplayCoachService();
    private readonly replayAcademy = new ReplayAcademyService();

    public constructor(private readonly store: ReplayLibraryStore) {
        const loaded = normalizeReplayLibrary(store.loadReplayLibrary());
        this.data = normalizeReplayLibrary({
            ...loaded,
            records: loaded.records.map((record) => record.coach
                ? record
                : { ...record, coach: this.replayCoach.analyze(record) }),
        });
    }

    public snapshot(): ReplayLibrarySnapshot {
        return {
            recordCount: this.data.records.length,
            nextSequence: this.data.nextSequence,
            records: this.data.records,
            latest: this.data.records[0] ?? null,
            academy: this.replayAcademy.analyze(this.data.records, this.data.academyProgress.completedDrillIds),
            academyBestAverageScore: this.data.academyProgress.bestAverageScore,
            academyBestConsistencyScore: this.data.academyProgress.bestConsistencyScore,
            academyTotalCompletedDrills: this.data.academyProgress.totalCompletedDrills,
            liveObjectiveCompletions: this.data.academyProgress.liveObjectiveCompletions,
            liveObjectiveStreak: this.data.academyProgress.liveObjectiveStreak,
            bestLiveObjectiveStreak: this.data.academyProgress.bestLiveObjectiveStreak,
            totalLiveObjectiveCredits: this.data.academyProgress.totalLiveObjectiveCredits,
        };
    }

    public nextReplayId(): string {
        return `replay-${String(this.data.nextSequence).padStart(6, '0')}`;
    }

    public saveRecord(record: MatchReplayRecord): ReplayLibraryActionResult {
        const normalizedRecord = normalizeReplayRecord(record);
        const normalized = normalizedRecord
            ? normalizeReplayRecord({ ...normalizedRecord, coach: normalizedRecord.coach ?? this.replayCoach.analyze(normalizedRecord) })
            : null;
        if (!normalized) return this.result(false, true, 'Replay record was rejected.');
        const previous = this.data;
        const previousAcademy = this.replayAcademy.analyze(previous.records, previous.academyProgress.completedDrillIds);
        const records = [normalized, ...previous.records.filter((entry) => entry.id !== normalized.id)].slice(0, REPLAY_LIBRARY_LIMIT);
        const newlyCompleted = this.replayAcademy.completedDrills(previousAcademy, normalized);
        const completedDrillIds = [
            ...previous.academyProgress.completedDrillIds,
            ...newlyCompleted,
        ].filter((entry, index, items) => items.indexOf(entry) === index);
        const academy = this.replayAcademy.analyze(records, completedDrillIds);
        const next = normalizeReplayLibrary({
            version: previous.version,
            nextSequence: previous.nextSequence + 1,
            academyProgress: {
                ...previous.academyProgress,
                bestAverageScore: Math.max(previous.academyProgress.bestAverageScore, academy.averageScore),
                bestConsistencyScore: Math.max(previous.academyProgress.bestConsistencyScore, academy.consistencyScore),
                completedDrillIds,
                totalCompletedDrills: Math.max(previous.academyProgress.totalCompletedDrills, completedDrillIds.length),
                lastFocusMetric: academy.focusMetric,
            },
            records,
        });
        const saved = this.store.saveReplayLibrary(next);
        this.data = normalizeReplayLibrary(saved.data);
        if (!saved.persisted) {
            this.store.saveReplayLibrary(previous);
            this.data = previous;
            return this.result(false, false, 'Replay could not be saved; the previous library was restored.');
        }
        return this.result(true, true, `Replay ${normalized.id} saved with ${normalized.eventCount} events.`);
    }

    public recordLiveObjectiveResult(
        metric: ReplayAcademyMetric,
        completed: boolean,
        rewardCredits = 0,
    ): ReplayLibraryActionResult {
        const previous = this.data;
        const streak = completed ? previous.academyProgress.liveObjectiveStreak + 1 : 0;
        const awardedCredits = completed ? Math.max(0, Math.trunc(rewardCredits)) : 0;
        const next = normalizeReplayLibrary({
            ...previous,
            academyProgress: {
                ...previous.academyProgress,
                liveObjectiveCompletions: previous.academyProgress.liveObjectiveCompletions + (completed ? 1 : 0),
                liveObjectiveStreak: streak,
                bestLiveObjectiveStreak: Math.max(previous.academyProgress.bestLiveObjectiveStreak, streak),
                totalLiveObjectiveCredits: previous.academyProgress.totalLiveObjectiveCredits + awardedCredits,
                lastLiveObjectiveMetric: metric,
            },
        });
        const saved = this.store.saveReplayLibrary(next);
        this.data = normalizeReplayLibrary(saved.data);
        if (!saved.persisted) {
            this.store.saveReplayLibrary(previous);
            this.data = previous;
            return this.result(false, false, 'Live Academy objective progress could not be saved.');
        }
        return this.result(
            true,
            true,
            completed
                ? `Live Academy ${metric} objective complete. Streak ${streak}.`
                : `Live Academy ${metric} objective ended without completion.`,
        );
    }

    public deleteRecord(replayId: string): ReplayLibraryActionResult {
        if (!this.data.records.some((record) => record.id === replayId)) {
            return this.result(false, true, 'Replay record was not found.');
        }
        const previous = this.data;
        const next = normalizeReplayLibrary({
            ...previous,
            records: previous.records.filter((record) => record.id !== replayId),
        });
        const saved = this.store.saveReplayLibrary(next);
        this.data = normalizeReplayLibrary(saved.data);
        if (!saved.persisted) {
            this.store.saveReplayLibrary(previous);
            this.data = previous;
            return this.result(false, false, 'Replay deletion could not be persisted.');
        }
        return this.result(true, true, `Replay ${replayId} deleted.`);
    }

    public exportRecord(replayId: string): string | null {
        const record = this.data.records.find((entry) => entry.id === replayId);
        return record ? JSON.stringify(record) : null;
    }

    private result(ok: boolean, persisted: boolean, message: string): ReplayLibraryActionResult {
        return { ok, persisted, message, snapshot: this.snapshot() };
    }
}
