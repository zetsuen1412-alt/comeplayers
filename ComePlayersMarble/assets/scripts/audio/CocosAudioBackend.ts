import { AudioClip, AudioSource, Node } from 'cc';
import { AudioPlaybackBackend, AudioPlaybackRequest } from './AudioManager';
import {
    AUDIO_CATEGORIES,
    AudioCategory,
    AudioCue,
    cueFromClipName,
} from './AudioTypes';

interface ToneDefinition {
    readonly duration: number;
    readonly frequencies: readonly number[];
    readonly gainScale: number;
    readonly wave: OscillatorType;
}

const TONE_DEFINITIONS: Readonly<Record<AudioCue, ToneDefinition>> = Object.freeze({
    [AudioCue.MatchMusic]: { duration: 0.72, frequencies: [220, 277, 330], gainScale: 0.13, wave: 'sine' },
    [AudioCue.BoardAmbience]: { duration: 0.52, frequencies: [110, 123], gainScale: 0.09, wave: 'sine' },
    [AudioCue.UIConfirm]: { duration: 0.07, frequencies: [620, 820], gainScale: 0.24, wave: 'sine' },
    [AudioCue.UICancel]: { duration: 0.10, frequencies: [410, 250], gainScale: 0.20, wave: 'triangle' },
    [AudioCue.TurnStart]: { duration: 0.16, frequencies: [440, 659, 880], gainScale: 0.18, wave: 'sine' },
    [AudioCue.DiceRoll]: { duration: 0.22, frequencies: [190, 145, 105], gainScale: 0.28, wave: 'square' },
    [AudioCue.DiceLand]: { duration: 0.14, frequencies: [150, 95], gainScale: 0.31, wave: 'triangle' },
    [AudioCue.DoubleBonus]: { duration: 0.48, frequencies: [523, 659, 784, 1047], gainScale: 0.24, wave: 'triangle' },
    [AudioCue.MovementStep]: { duration: 0.045, frequencies: [360, 430], gainScale: 0.16, wave: 'square' },
    [AudioCue.PlayerLand]: { duration: 0.12, frequencies: [260, 180], gainScale: 0.19, wave: 'triangle' },
    [AudioCue.PropertyPurchase]: { duration: 0.34, frequencies: [392, 523, 659], gainScale: 0.24, wave: 'triangle' },
    [AudioCue.BuildingUpgrade]: { duration: 0.38, frequencies: [440, 554, 659, 880], gainScale: 0.24, wave: 'triangle' },
    [AudioCue.PropertyBuild]: { duration: 0.30, frequencies: [440, 554, 659], gainScale: 0.22, wave: 'triangle' },
    [AudioCue.PropertyPayment]: { duration: 0.23, frequencies: [620, 465, 350], gainScale: 0.20, wave: 'sine' },
    [AudioCue.CardReveal]: { duration: 0.36, frequencies: [330, 523, 784], gainScale: 0.20, wave: 'triangle' },
    [AudioCue.CardResolve]: { duration: 0.25, frequencies: [523, 659], gainScale: 0.18, wave: 'sine' },
    [AudioCue.Travel]: { duration: 0.38, frequencies: [280, 420, 700], gainScale: 0.20, wave: 'sine' },
    [AudioCue.GameCenterWin]: { duration: 0.56, frequencies: [523, 659, 784, 1047], gainScale: 0.24, wave: 'triangle' },
    [AudioCue.LevelUp]: { duration: 0.72, frequencies: [392, 523, 659, 784, 1047, 1319], gainScale: 0.25, wave: 'triangle' },
    [AudioCue.MatchWin]: { duration: 0.82, frequencies: [392, 523, 659, 784, 1047], gainScale: 0.25, wave: 'triangle' },
});

class CocosClipAudioBackend implements AudioPlaybackBackend {
    private readonly runtimeRoot = new Node('RuntimeAudio');
    private readonly clips = new Map<AudioCue, AudioClip>();
    private readonly categoryGains = new Map<AudioCategory, number>();
    private readonly loopScales = new Map<AudioCategory, number>();
    private readonly sources = new Map<AudioCategory, AudioSource>();

    public constructor(host: Node, clips: readonly AudioClip[]) {
        host.addChild(this.runtimeRoot);
        for (const category of AUDIO_CATEGORIES) {
            const channel = new Node(`Audio-${category}`);
            this.runtimeRoot.addChild(channel);
            const source = channel.addComponent(AudioSource);
            source.playOnAwake = false;
            source.loop = false;
            this.sources.set(category, source);
        }
        for (const clip of clips) {
            const cue = cueFromClipName(clip.name);
            if (cue) this.clips.set(cue, clip);
        }
    }

    public get registeredClipCount(): number {
        return this.clips.size;
    }

    public play(request: AudioPlaybackRequest): boolean {
        const clip = this.clips.get(request.cue);
        const source = this.sources.get(request.category);
        if (!clip || !source) return false;

        source.volume = request.gain;
        if (request.loop) {
            const categoryGain = this.categoryGains.get(request.category) ?? 1;
            this.loopScales.set(
                request.category,
                categoryGain > 0 ? request.gain / categoryGain : 0,
            );
            source.stop();
            source.clip = clip;
            source.loop = true;
            source.play();
        } else {
            source.playOneShot(clip);
        }
        return true;
    }

    public setCategoryGain(category: AudioCategory, gain: number): void {
        this.categoryGains.set(category, gain);
        const source = this.sources.get(category);
        if (source) source.volume = gain * (this.loopScales.get(category) ?? 1);
    }

    public stopCategory(category: AudioCategory): void {
        this.sources.get(category)?.stop();
    }

    public destroy(): void {
        for (const source of Array.from(this.sources.values())) source.stop();
        this.sources.clear();
        this.clips.clear();
        this.categoryGains.clear();
        this.loopScales.clear();
        this.runtimeRoot.destroy();
    }
}

class ProceduralToneAudioBackend implements AudioPlaybackBackend {
    private context: AudioContext | null = null;

    public static get supported(): boolean {
        return Boolean(ProceduralToneAudioBackend.contextConstructor());
    }

    public play(request: AudioPlaybackRequest): boolean {
        const context = this.getContext();
        if (!context) return false;
        if (context.state === 'suspended') void context.resume().catch(() => undefined);

        const tone = TONE_DEFINITIONS[request.cue];
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime;
        const peak = Math.max(0.0001, request.gain * tone.gainScale);
        const segment = tone.duration / tone.frequencies.length;

        oscillator.type = tone.wave;
        for (let index = 0; index < tone.frequencies.length; index++) {
            oscillator.frequency.setValueAtTime(tone.frequencies[index], start + segment * index);
        }
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.018, tone.duration * 0.2));
        gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = (): void => {
            oscillator.disconnect();
            gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + tone.duration + 0.01);
        return true;
    }

    public setCategoryGain(_category: AudioCategory, _gain: number): void {}

    public stopCategory(_category: AudioCategory): void {}

    public destroy(): void {
        const context = this.context;
        this.context = null;
        if (context && context.state !== 'closed') void context.close().catch(() => undefined);
    }

    private getContext(): AudioContext | null {
        if (this.context && this.context.state !== 'closed') return this.context;
        const Constructor = ProceduralToneAudioBackend.contextConstructor();
        if (!Constructor) return null;
        this.context = new Constructor();
        return this.context;
    }

    private static contextConstructor(): typeof AudioContext | undefined {
        const audioGlobal = globalThis as typeof globalThis & {
            webkitAudioContext?: typeof AudioContext;
        };
        return audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
    }
}

export class CocosAudioBackend implements AudioPlaybackBackend {
    private readonly clips: CocosClipAudioBackend;
    private readonly tones = new ProceduralToneAudioBackend();

    public constructor(host: Node, clips: readonly AudioClip[]) {
        this.clips = new CocosClipAudioBackend(host, clips);
    }

    public get registeredClipCount(): number {
        return this.clips.registeredClipCount;
    }

    public get proceduralPlaceholderAvailable(): boolean {
        return ProceduralToneAudioBackend.supported;
    }

    public play(request: AudioPlaybackRequest): boolean {
        return this.clips.play(request) || this.tones.play(request);
    }

    public setCategoryGain(category: AudioCategory, gain: number): void {
        this.clips.setCategoryGain(category, gain);
        this.tones.setCategoryGain(category, gain);
    }

    public stopCategory(category: AudioCategory): void {
        this.clips.stopCategory(category);
        this.tones.stopCategory(category);
    }

    public destroy(): void {
        this.clips.destroy();
        this.tones.destroy();
    }
}
