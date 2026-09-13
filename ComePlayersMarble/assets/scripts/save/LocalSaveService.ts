import { sys } from 'cc';
import type { TutorialCompletionStore } from '../core/TutorialService';
import {
    createDefaultLocalSaveData,
    isLegacyLocalSaveCandidate,
    isLocalSaveImportCandidate,
    LocalSaveData,
    LOCAL_SAVE_VERSION,
    normalizeLocalSaveData,
} from './LocalSaveData';
import {
    createDefaultMatchSettings,
    MatchSettingsData,
    normalizeMatchSettings,
} from './MatchSettingsData';
import {
    normalizePlayerSettings,
    PlayerSettingsData,
} from './PlayerSettingsData';
import {
    CharacterProgressionData,
    normalizeCharacterProgression,
} from './CharacterProgressionData';
import {
    CareerProgressionData,
    normalizeCareerProgression,
} from './CareerProgressionData';
import {
    RankedProgressionData,
    normalizeRankedProgression,
} from './RankedProgressionData';
import {
    OnlineProfileData,
    normalizeOnlineProfile,
} from './OnlineProfileData';
import {
    ReplayLibraryData,
    normalizeReplayLibrary,
} from './ReplayLibraryData';

const LOCAL_SAVE_KEY = `comeplayers.local-save.v${LOCAL_SAVE_VERSION}`;
const LEGACY_LOCAL_SAVE_KEYS = ['comeplayers.local-save.v8', 'comeplayers.local-save.v7', 'comeplayers.local-save.v6', 'comeplayers.local-save.v5', 'comeplayers.local-save.v4', 'comeplayers.local-save.v3', 'comeplayers.local-save.v2', 'comeplayers.local-save.v1'] as const;
const LEGACY_PLAYER_SETTINGS_KEY = 'comeplayers.player-settings.v1';

export interface LocalSaveStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface CharacterProgressionSaveResult {
    readonly data: CharacterProgressionData;
    readonly persisted: boolean;
}

export interface CareerProgressionSaveResult {
    readonly data: CareerProgressionData;
    readonly persisted: boolean;
}

export interface RankedProgressionSaveResult {
    readonly data: RankedProgressionData;
    readonly persisted: boolean;
}

export interface OnlineProfileSaveResult {
    readonly data: OnlineProfileData;
    readonly persisted: boolean;
}

export interface ReplayLibrarySaveResult {
    readonly data: ReplayLibraryData;
    readonly persisted: boolean;
}

export class LocalSaveService implements TutorialCompletionStore {
    private cachedData: LocalSaveData | null = null;

    public constructor(
        private readonly storage: LocalSaveStorage = sys.localStorage,
        private readonly now: () => number = Date.now,
    ) {}

    public readTutorialCompleted(): boolean {
        return this.loadPlayerSettings().tutorialCompleted;
    }

    public writeTutorialCompleted(completed: boolean): void {
        const current = this.loadPlayerSettings();
        this.savePlayerSettings({ ...current, tutorialCompleted: completed });
    }

    public loadPlayerSettings(): PlayerSettingsData {
        return this.loadData().playerSettings;
    }

    public savePlayerSettings(settings: PlayerSettingsData): void {
        const current = this.loadData();
        this.commit({ ...current, playerSettings: normalizePlayerSettings(settings) });
    }

    public loadCharacterProgression(): CharacterProgressionData {
        return this.loadData().characterProgression;
    }

    public saveCharacterProgression(progression: CharacterProgressionData): CharacterProgressionSaveResult {
        const normalized = normalizeCharacterProgression(progression);
        const current = this.loadData();
        const persisted = this.commit({ ...current, characterProgression: normalized });
        return {
            data: this.loadData().characterProgression,
            persisted,
        };
    }

    public loadCareerProgression(): CareerProgressionData {
        return this.loadData().careerProgression;
    }

    public saveCareerProgression(progression: CareerProgressionData): CareerProgressionSaveResult {
        const normalized = normalizeCareerProgression(progression);
        const current = this.loadData();
        const persisted = this.commit({ ...current, careerProgression: normalized });
        return {
            data: this.loadData().careerProgression,
            persisted,
        };
    }

    public loadRankedProgression(): RankedProgressionData {
        return this.loadData().rankedProgression;
    }

    public saveRankedProgression(progression: RankedProgressionData): RankedProgressionSaveResult {
        const normalized = normalizeRankedProgression(progression);
        const current = this.loadData();
        const persisted = this.commit({ ...current, rankedProgression: normalized });
        return {
            data: this.loadData().rankedProgression,
            persisted,
        };
    }

    public loadOnlineProfile(): OnlineProfileData {
        return this.loadData().onlineProfile;
    }

    public saveOnlineProfile(profile: OnlineProfileData): OnlineProfileSaveResult {
        const normalized = normalizeOnlineProfile(profile, this.safeTimestamp());
        const current = this.loadData();
        const persisted = this.commit({ ...current, onlineProfile: normalized });
        return {
            data: this.loadData().onlineProfile,
            persisted,
        };
    }

    public loadReplayLibrary(): ReplayLibraryData {
        return this.loadData().replayLibrary;
    }

    public saveReplayLibrary(library: ReplayLibraryData): ReplayLibrarySaveResult {
        const normalized = normalizeReplayLibrary(library);
        const current = this.loadData();
        const persisted = this.commit({ ...current, replayLibrary: normalized });
        return {
            data: this.loadData().replayLibrary,
            persisted,
        };
    }

    public hasMatchSettings(): boolean {
        return this.loadData().matchSettings !== null;
    }

    public loadMatchSettings(
        fallback: MatchSettingsData = createDefaultMatchSettings(),
    ): MatchSettingsData {
        const settings = this.loadData().matchSettings;
        return settings ?? normalizeMatchSettings(fallback);
    }

    public saveMatchSettings(settings: MatchSettingsData): MatchSettingsData {
        const normalized = normalizeMatchSettings(settings);
        const current = this.loadData();
        this.commit({ ...current, matchSettings: normalized });
        return normalized;
    }

    public snapshot(): LocalSaveData {
        return this.loadData();
    }

    public exportData(): string {
        return JSON.stringify(this.loadData());
    }

    public importData(value: unknown): boolean {
        try {
            const decoded: unknown = typeof value === 'string' ? JSON.parse(value) : value;
            const currentCandidate = isLocalSaveImportCandidate(decoded);
            const legacyCandidate = isLegacyLocalSaveCandidate(decoded);
            if (!currentCandidate && !legacyCandidate) {
                throw new Error('Save import is missing player settings data.');
            }
            const current = this.loadData();
            const imported = normalizeLocalSaveData(decoded);
            const importsOnlineSections = currentCandidate
                && typeof decoded === 'object'
                && decoded !== null
                && !Array.isArray(decoded)
                && typeof (decoded as Record<string, unknown>).version === 'number'
                && ((decoded as Record<string, unknown>).version as number) >= 5;
            this.commit({
                ...imported,
                characterProgression: currentCandidate
                    ? imported.characterProgression
                    : current.characterProgression,
                onlineProfile: importsOnlineSections ? imported.onlineProfile : current.onlineProfile,
                replayLibrary: importsOnlineSections ? imported.replayLibrary : current.replayLibrary,
                revision: current.revision,
                updatedAt: current.updatedAt,
            });
            return true;
        } catch (error: unknown) {
            console.warn('[ComePlayers] Save import was rejected; current data was preserved.', error);
            return false;
        }
    }

    public reset(): void {
        this.cachedData = createDefaultLocalSaveData();
        try {
            this.storage.removeItem(LOCAL_SAVE_KEY);
            LEGACY_LOCAL_SAVE_KEYS.forEach((key) => this.storage.removeItem(key));
            this.storage.removeItem(LEGACY_PLAYER_SETTINGS_KEY);
        } catch (error: unknown) {
            console.warn('[ComePlayers] Local save keys could not be removed.', error);
        }
    }

    private loadData(): LocalSaveData {
        if (this.cachedData) return this.cachedData;
        const serialized = this.read(LOCAL_SAVE_KEY);
        if (serialized !== null) {
            try {
                const decoded: unknown = JSON.parse(serialized);
                if (!isLocalSaveImportCandidate(decoded)) {
                    throw new Error('Current local save is missing required progression data.');
                }
                this.cachedData = normalizeLocalSaveData(decoded);
                return this.cachedData;
            } catch (error: unknown) {
                console.warn('[ComePlayers] Local save bundle is invalid; recovery data will be used.', error);
            }
        }

        const legacyBundle = this.readLegacyLocalSave();
        if (legacyBundle) {
            this.cachedData = legacyBundle.data;
            this.persistMigration(legacyBundle.data, [legacyBundle.key]);
            return this.cachedData;
        }

        const migrated = this.readLegacySettings();
        this.cachedData = migrated ?? createDefaultLocalSaveData();
        if (migrated) this.persistMigration(migrated);
        return this.cachedData;
    }

    private readLegacySettings(): LocalSaveData | null {
        const serialized = this.read(LEGACY_PLAYER_SETTINGS_KEY);
        if (serialized === null) return null;
        try {
            const decoded: unknown = JSON.parse(serialized);
            return {
                ...createDefaultLocalSaveData(),
                playerSettings: normalizePlayerSettings(decoded),
            };
        } catch (error: unknown) {
            console.warn('[ComePlayers] Legacy player settings are invalid and could not be migrated.', error);
            return null;
        }
    }

    private readLegacyLocalSave(): { readonly data: LocalSaveData; readonly key: string } | null {
        for (const key of LEGACY_LOCAL_SAVE_KEYS) {
            const serialized = this.read(key);
            if (serialized === null) continue;
            try {
                const decoded: unknown = JSON.parse(serialized);
                if (!isLocalSaveImportCandidate(decoded) && !isLegacyLocalSaveCandidate(decoded)) {
                    throw new Error('Legacy local save is missing required progression data.');
                }
                return { data: normalizeLocalSaveData(decoded), key };
            } catch (error: unknown) {
                console.warn(`[ComePlayers] Legacy local save ${key} is invalid and could not be migrated.`, error);
            }
        }
        return null;
    }

    private read(key: string): string | null {
        try {
            return this.storage.getItem(key);
        } catch (error: unknown) {
            console.warn(`[ComePlayers] Local save key ${key} could not be read.`, error);
            return null;
        }
    }

    private commit(data: LocalSaveData): boolean {
        const timestamp = this.safeTimestamp();
        const next = normalizeLocalSaveData({
            ...data,
            revision: this.loadData().revision + 1,
            updatedAt: timestamp,
        });
        this.cachedData = next;
        try {
            this.storage.setItem(LOCAL_SAVE_KEY, JSON.stringify(next));
            return true;
        } catch (error: unknown) {
            console.warn('[ComePlayers] Local save could not be persisted; normalized data remains active for this session.', error);
            return false;
        }
    }

    private persistMigration(data: LocalSaveData, removeKeys: readonly string[] = [LEGACY_PLAYER_SETTINGS_KEY]): void {
        const migrated = normalizeLocalSaveData({
            ...data,
            revision: Math.max(1, data.revision + 1),
            updatedAt: this.safeTimestamp(),
        });
        this.cachedData = migrated;
        try {
            this.storage.setItem(LOCAL_SAVE_KEY, JSON.stringify(migrated));
            removeKeys.forEach((key) => this.storage.removeItem(key));
            console.info('[ComePlayers] Local data migrated to the current versioned save bundle.');
        } catch (error: unknown) {
            console.warn('[ComePlayers] Legacy local-data migration could not be persisted.', error);
        }
    }

    private safeTimestamp(): number {
        const timestamp = this.now();
        return Number.isFinite(timestamp) ? Math.max(0, Math.trunc(timestamp)) : 0;
    }
}
