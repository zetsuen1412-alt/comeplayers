export const PLAYER_SETTINGS_VERSION = 1;

export interface PlayerSettingsData {
    readonly version: number;
    readonly tutorialCompleted: boolean;
    readonly musicVolume: number;
    readonly soundVolume: number;
    readonly reducedCameraMotion: boolean;
}

export function createDefaultPlayerSettings(): PlayerSettingsData {
    return {
        version: PLAYER_SETTINGS_VERSION,
        tutorialCompleted: false,
        musicVolume: 0.8,
        soundVolume: 0.9,
        reducedCameraMotion: false,
    };
}

export function normalizePlayerSettings(value: unknown): PlayerSettingsData {
    const defaults = createDefaultPlayerSettings();
    if (!isRecord(value)) return defaults;
    return {
        version: PLAYER_SETTINGS_VERSION,
        tutorialCompleted: typeof value.tutorialCompleted === 'boolean'
            ? value.tutorialCompleted
            : defaults.tutorialCompleted,
        musicVolume: normalizeVolume(value.musicVolume, defaults.musicVolume),
        soundVolume: normalizeVolume(value.soundVolume, defaults.soundVolume),
        reducedCameraMotion: typeof value.reducedCameraMotion === 'boolean'
            ? value.reducedCameraMotion
            : defaults.reducedCameraMotion,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeVolume(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(value, 1));
}
