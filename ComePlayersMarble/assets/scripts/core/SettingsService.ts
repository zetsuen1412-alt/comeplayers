import type { PlayerSettingsData } from '../save/PlayerSettingsData';

export interface PlayerSettingsStore {
    loadPlayerSettings(): PlayerSettingsData;
    savePlayerSettings(settings: PlayerSettingsData): void;
}

export interface SettingsSnapshot {
    readonly active: boolean;
    readonly musicVolume: number;
    readonly soundVolume: number;
    readonly reducedCameraMotion: boolean;
}

export class SettingsService {
    private active = false;
    private data: PlayerSettingsData;

    public constructor(private readonly store: PlayerSettingsStore) {
        this.data = this.store.loadPlayerSettings();
    }

    public get isActive(): boolean {
        return this.active;
    }

    public snapshot(): SettingsSnapshot {
        return {
            active: this.active,
            musicVolume: this.data.musicVolume,
            soundVolume: this.data.soundVolume,
            reducedCameraMotion: this.data.reducedCameraMotion,
        };
    }

    public open(): SettingsSnapshot {
        this.data = this.store.loadPlayerSettings();
        this.active = true;
        return this.snapshot();
    }

    public close(): SettingsSnapshot {
        this.active = false;
        return this.snapshot();
    }

    public adjustMusicVolume(delta: number): SettingsSnapshot {
        if (!this.active) return this.snapshot();
        const volume = this.adjustedVolume(this.data.musicVolume, delta);
        if (volume !== this.data.musicVolume) this.persist({ ...this.data, musicVolume: volume });
        return this.snapshot();
    }

    public adjustSoundVolume(delta: number): SettingsSnapshot {
        if (!this.active) return this.snapshot();
        const volume = this.adjustedVolume(this.data.soundVolume, delta);
        if (volume !== this.data.soundVolume) this.persist({ ...this.data, soundVolume: volume });
        return this.snapshot();
    }

    public toggleReducedCameraMotion(): SettingsSnapshot {
        if (!this.active) return this.snapshot();
        this.persist({ ...this.data, reducedCameraMotion: !this.data.reducedCameraMotion });
        return this.snapshot();
    }

    private persist(settings: PlayerSettingsData): void {
        this.data = settings;
        this.store.savePlayerSettings(settings);
    }

    private adjustedVolume(current: number, delta: number): number {
        if (!Number.isFinite(delta)) return current;
        return Math.max(0, Math.min(Math.round((current + delta) * 10) / 10, 1));
    }
}
