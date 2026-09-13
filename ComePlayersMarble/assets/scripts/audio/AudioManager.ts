import {
    AUDIO_CATEGORIES,
    AUDIO_CUE_DEFINITIONS,
    AudioCategory,
    AudioCue,
    isAudioCueRequest,
} from './AudioTypes';

export interface AudioPlaybackRequest {
    readonly cue: AudioCue;
    readonly category: AudioCategory;
    readonly gain: number;
    readonly loop: boolean;
}

export interface AudioPlaybackBackend {
    play(request: AudioPlaybackRequest): boolean;
    setCategoryGain(category: AudioCategory, gain: number): void;
    stopCategory(category: AudioCategory): void;
    destroy(): void;
}

export interface AudioVolumeSnapshot {
    readonly music: number;
    readonly sound: number;
}

type Clock = () => number;

export class AudioManager {
    private musicVolume = 1;
    private soundVolume = 1;
    private readonly lastPlayedAt = new Map<AudioCue, number>();

    public constructor(
        private readonly backend: AudioPlaybackBackend,
        musicVolume: number,
        soundVolume: number,
        private readonly now: Clock = () => Date.now(),
    ) {
        this.setVolumes(musicVolume, soundVolume);
    }

    public snapshot(): AudioVolumeSnapshot {
        return { music: this.musicVolume, sound: this.soundVolume };
    }

    public setVolumes(musicVolume: number, soundVolume: number): AudioVolumeSnapshot {
        this.musicVolume = this.clampVolume(musicVolume);
        this.soundVolume = this.clampVolume(soundVolume);
        for (const category of AUDIO_CATEGORIES) {
            this.backend.setCategoryGain(category, this.volumeFor(category));
        }
        return this.snapshot();
    }

    public handle(payload: unknown): boolean {
        if (!isAudioCueRequest(payload)) return false;
        return this.play(payload.cue, payload.volumeScale);
    }

    public play(cue: AudioCue, volumeScale = 1): boolean {
        const definition = AUDIO_CUE_DEFINITIONS[cue];
        const scale = this.clampVolume(volumeScale);
        const gain = definition.baseGain * this.volumeFor(definition.category) * scale;
        if (gain <= 0) return false;

        const now = this.now();
        const lastPlayedAt = this.lastPlayedAt.get(cue);
        if (lastPlayedAt !== undefined && now - lastPlayedAt < definition.cooldownMs) return false;

        const played = this.backend.play({
            cue,
            category: definition.category,
            gain,
            loop: definition.loop,
        });
        if (played) this.lastPlayedAt.set(cue, now);
        return played;
    }

    public stopBackground(): void {
        this.backend.stopCategory(AudioCategory.Music);
        this.backend.stopCategory(AudioCategory.Ambience);
    }

    public destroy(): void {
        this.stopBackground();
        this.lastPlayedAt.clear();
        this.backend.destroy();
    }

    private volumeFor(category: AudioCategory): number {
        return category === AudioCategory.Music || category === AudioCategory.Ambience
            ? this.musicVolume
            : this.soundVolume;
    }

    private clampVolume(value: number): number {
        if (!Number.isFinite(value)) return 0;
        return Math.max(0, Math.min(value, 1));
    }
}
