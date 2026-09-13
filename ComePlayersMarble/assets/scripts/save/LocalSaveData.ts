import {
    createDefaultMatchSettings,
    MatchSettingsData,
    normalizeMatchSettings,
} from './MatchSettingsData';
import {
    createDefaultPlayerSettings,
    normalizePlayerSettings,
    PlayerSettingsData,
} from './PlayerSettingsData';
import {
    CharacterProgressionData,
    createDefaultCharacterProgression,
    normalizeCharacterProgression,
} from './CharacterProgressionData';
import {
    CareerProgressionData,
    createDefaultCareerProgression,
    normalizeCareerProgression,
} from './CareerProgressionData';
import {
    createDefaultRankedProgression,
    normalizeRankedProgression,
    RankedProgressionData,
} from './RankedProgressionData';
import {
    createDefaultOnlineProfile,
    normalizeOnlineProfile,
    OnlineProfileData,
} from './OnlineProfileData';
import {
    createDefaultReplayLibrary,
    normalizeReplayLibrary,
    ReplayLibraryData,
} from './ReplayLibraryData';

export const LOCAL_SAVE_VERSION = 13;

export interface LocalSaveData {
    readonly version: number;
    readonly revision: number;
    readonly updatedAt: number;
    readonly playerSettings: PlayerSettingsData;
    readonly matchSettings: MatchSettingsData | null;
    readonly characterProgression: CharacterProgressionData;
    readonly careerProgression: CareerProgressionData;
    readonly rankedProgression: RankedProgressionData;
    readonly onlineProfile: OnlineProfileData;
    readonly replayLibrary: ReplayLibraryData;
}

export function createDefaultLocalSaveData(): LocalSaveData {
    return {
        version: LOCAL_SAVE_VERSION,
        revision: 0,
        updatedAt: 0,
        playerSettings: createDefaultPlayerSettings(),
        matchSettings: null,
        characterProgression: createDefaultCharacterProgression(),
        careerProgression: createDefaultCareerProgression(),
        rankedProgression: createDefaultRankedProgression(),
        onlineProfile: createDefaultOnlineProfile(),
        replayLibrary: createDefaultReplayLibrary(),
    };
}

export function normalizeLocalSaveData(value: unknown): LocalSaveData {
    const defaults = createDefaultLocalSaveData();
    if (!isRecord(value)) return defaults;
    return {
        version: LOCAL_SAVE_VERSION,
        revision: nonNegativeInteger(value.revision),
        updatedAt: nonNegativeInteger(value.updatedAt),
        playerSettings: normalizePlayerSettings(value.playerSettings),
        matchSettings: isRecord(value.matchSettings)
            ? normalizeMatchSettings(value.matchSettings, createDefaultMatchSettings())
            : null,
        characterProgression: normalizeCharacterProgression(value.characterProgression),
        careerProgression: normalizeCareerProgression(value.careerProgression),
        rankedProgression: normalizeRankedProgression(value.rankedProgression),
        onlineProfile: normalizeOnlineProfile(value.onlineProfile),
        replayLibrary: normalizeReplayLibrary(value.replayLibrary),
    };
}

export function isLocalSaveImportCandidate(value: unknown): boolean {
    return isRecord(value)
        && (value.version === LOCAL_SAVE_VERSION || value.version === 12 || value.version === 11 || value.version === 10 || value.version === 9 || value.version === 8 || value.version === 7 || value.version === 6 || value.version === 5 || value.version === 4 || value.version === 3 || value.version === 2)
        && isRecord(value.playerSettings)
        && isRecord(value.characterProgression);
}

export function isLegacyLocalSaveCandidate(value: unknown): boolean {
    return isRecord(value)
        && value.version === 1
        && isRecord(value.playerSettings);
}

function nonNegativeInteger(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.trunc(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
