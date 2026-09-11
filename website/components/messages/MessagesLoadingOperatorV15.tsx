"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./messages-loading-operator-v15.module.css";

const STEPS = [
  { label: "Profile connected", detail: "Online", target: 24 },
  { label: "Squad network ready", detail: "Secure", target: 49 },
  { label: "Syncing messages", detail: "In progress", target: 76 },
  {
    label: "Preparing your communication channel",
    detail: "Almost ready",
    target: 92,
  },
  { label: "Communication channel ready", detail: "Connected", target: 100 },
] as const;

type MessagesLoadingOperatorV15Props = {
  ready?: boolean;
};

export default function MessagesLoadingOperatorV15({
  ready = false,
}: MessagesLoadingOperatorV15Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(8);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioRef = useRef<{
    context: AudioContext;
    gain: GainNode;
    oscillators: OscillatorNode[];
  } | null>(null);

  useEffect(() => {
    if (ready) {
      setStepIndex(STEPS.length - 1);
      return;
    }

    const timer = window.setInterval(() => {
      setStepIndex((current) => Math.min(current + 1, STEPS.length - 2));
    }, 820);

    return () => window.clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    const target = ready ? 100 : STEPS[stepIndex]?.target ?? 92;
    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= target) return current;
        const distance = target - current;
        return Math.min(target, current + Math.max(1, Math.ceil(distance / 8)));
      });
    }, ready ? 38 : 68);

    return () => window.clearInterval(timer);
  }, [ready, stepIndex]);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.oscillators.forEach((oscillator) => {
        try {
          oscillator.stop();
        } catch {
          // Audio may already be stopped.
        }
      });
      void audio.context.close();
      audioRef.current = null;
    };
  }, []);

  const currentStep = STEPS[stepIndex] ?? STEPS[STEPS.length - 1];
  const completedSteps = useMemo(
    () => STEPS.slice(0, 3).map((_, index) => index < stepIndex),
    [stepIndex],
  );

  async function toggleSound() {
    if (soundEnabled) {
      const audio = audioRef.current;
      if (audio) {
        audio.gain.gain.setTargetAtTime(
          0.0001,
          audio.context.currentTime,
          0.08,
        );
      }
      setSoundEnabled(false);
      return;
    }

    if (!audioRef.current) {
      const AudioContextClass = window.AudioContext;
      const context = new AudioContextClass();
      const master = context.createGain();
      const filter = context.createBiquadFilter();
      master.gain.value = 0.0001;
      filter.type = "lowpass";
      filter.frequency.value = 520;
      filter.Q.value = 0.7;
      filter.connect(master);
      master.connect(context.destination);

      const frequencies = [46, 92, 184];
      const oscillators = frequencies.map((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = index === 0 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        gain.gain.value = index === 0 ? 0.14 : 0.025;
        oscillator.connect(gain);
        gain.connect(filter);
        oscillator.start();
        return oscillator;
      });

      audioRef.current = { context, gain: master, oscillators };
    }

    const audio = audioRef.current;
    await audio.context.resume();
    audio.gain.gain.setTargetAtTime(0.055, audio.context.currentTime, 0.12);
    setSoundEnabled(true);
  }

  return (
    <main
      className={styles.screen}
      aria-label="Connecting to ComePlayers Messages"
    >
      <div className={styles.stage}>
        <Image
          src="/messages-loading-v15/alexia-operator.webp"
          alt="Alexia preparing your ComePlayers communication channel"
          fill
          priority
          sizes="100vw"
          className={styles.artwork}
          draggable={false}
        />

        <div className={styles.vignette} aria-hidden="true" />
        <div className={styles.scanlines} aria-hidden="true" />
        <div className={styles.sweep} aria-hidden="true" />

        <div className={styles.statusLights} aria-hidden="true">
          {STEPS.slice(0, 3).map((step, index) => (
            <span
              key={step.label}
              data-state={
                completedSteps[index]
                  ? "done"
                  : index === stepIndex
                    ? "active"
                    : "idle"
              }
            />
          ))}
        </div>

        <div className={styles.waveform} aria-hidden="true">
          {Array.from({ length: 24 }, (_, index) => (
            <i key={index} style={{ animationDelay: `${index * -42}ms` }} />
          ))}
        </div>

        <div className={styles.radarPulse} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <section className={styles.progressPanel} aria-live="polite">
          <p className={styles.progressTitle}>{currentStep.label}...</p>
          <div className={styles.progressRow}>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${progress}%` }}
              >
                <span className={styles.progressSpark} />
              </div>
            </div>
            <strong className={styles.percentage}>{progress}%</strong>
          </div>
          <p className={styles.progressDetail}>{currentStep.detail}</p>
        </section>

        <button
          type="button"
          className={styles.soundButton}
          onClick={() => void toggleSound()}
          aria-pressed={soundEnabled}
        >
          {soundEnabled ? "SOUND ON" : "SOUND OFF"}
        </button>
      </div>
    </main>
  );
}
