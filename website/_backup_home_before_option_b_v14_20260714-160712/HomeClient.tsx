"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import styles from "./home.module.css";

type ModalName = "how" | "about" | "help" | null;
type DownloadChoice = "pc" | "android" | null;
type AudioNodes = {
  oscillators: OscillatorNode[];
  gains: GainNode[];
  lfo?: OscillatorNode;
};

const PC_DOWNLOAD_URL = process.env.NEXT_PUBLIC_COMEPLAYERS_PC_URL ?? "";
const ANDROID_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_COMEPLAYERS_ANDROID_URL ?? "";
const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@comeplayers.com";

export default function HomeClient() {
  const stageRef = useRef<HTMLElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ambientRef = useRef<AudioNodes | null>(null);
  const frameRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  const [soundEnabled, setSoundEnabled] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [downloadNotice, setDownloadNotice] =
    useState<DownloadChoice>(null);

  useLayoutEffect(() => {
    document.body.classList.add("cp-home-no-chrome");
    document.documentElement.classList.add("cp-home-active");

    return () => {
      document.body.classList.remove("cp-home-no-chrome");
      document.documentElement.classList.remove("cp-home-active");
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const update = () => {
      stage.style.setProperty("--look-x", `${pointerRef.current.x * 4}px`);
      stage.style.setProperty("--look-y", `${pointerRef.current.y * 2}px`);
      stage.style.setProperty("--glow-x", `${pointerRef.current.x * 10}px`);
      stage.style.setProperty("--glow-y", `${pointerRef.current.y * 6}px`);
      frameRef.current = null;
    };

    const onMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      pointerRef.current = {
        x: Math.max(
          -1,
          Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)
        ),
        y: Math.max(
          -1,
          Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1)
        ),
      };

      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(update);
      }
    };

    const onLeave = () => {
      pointerRef.current = { x: 0, y: 0 };
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(update);
      }
    };

    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);

    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const playTone = useCallback(
    (from: number, to: number, duration = 0.09, volume = 0.035) => {
      if (!soundEnabled) return;
      const context = ensureAudioContext();
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(from, now);
      oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.03);
    },
    [ensureAudioContext, soundEnabled]
  );

  const playHover = useCallback(
    () => playTone(440, 670, 0.075, 0.022),
    [playTone]
  );

  const playConfirm = useCallback(() => {
    playTone(470, 820, 0.12, 0.05);
    window.setTimeout(() => playTone(680, 1040, 0.1, 0.035), 70);
  }, [playTone]);

  const stopAmbient = useCallback(() => {
    const nodes = ambientRef.current;
    if (!nodes) return;

    nodes.oscillators.forEach((node) => {
      try {
        node.stop();
      } catch {}
      node.disconnect();
    });
    nodes.gains.forEach((node) => node.disconnect());
    if (nodes.lfo) {
      try {
        nodes.lfo.stop();
      } catch {}
      nodes.lfo.disconnect();
    }
    ambientRef.current = null;
  }, []);

  const startAmbient = useCallback(async () => {
    const context = ensureAudioContext();
    if (context.state === "suspended") await context.resume();
    stopAmbient();

    const master = context.createGain();
    const low = context.createOscillator();
    const high = context.createOscillator();
    const lowGain = context.createGain();
    const highGain = context.createGain();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();

    master.gain.value = 0.011;
    low.type = "sine";
    low.frequency.value = 54;
    high.type = "triangle";
    high.frequency.value = 108;
    lowGain.gain.value = 0.58;
    highGain.gain.value = 0.16;
    lfo.frequency.value = 0.1;
    lfoGain.gain.value = 0.004;

    lfo.connect(lfoGain).connect(master.gain);
    low.connect(lowGain).connect(master);
    high.connect(highGain).connect(master);
    master.connect(context.destination);
    low.start();
    high.start();
    lfo.start();

    ambientRef.current = {
      oscillators: [low, high],
      gains: [master, lowGain, highGain, lfoGain],
      lfo,
    };
  }, [ensureAudioContext, stopAmbient]);

  const toggleSound = useCallback(async () => {
    if (soundEnabled) {
      stopAmbient();
      setSoundEnabled(false);
      return;
    }

    setSoundEnabled(true);
    await startAmbient();
  }, [soundEnabled, startAmbient, stopAmbient]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "m") void toggleSound();
      if (event.key === "Escape") setModal(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSound]);

  useEffect(
    () => () => {
      stopAmbient();
      void audioContextRef.current?.close();
    },
    [stopAmbient]
  );

  useEffect(() => {
    if (!downloadNotice) return;
    const timer = window.setTimeout(() => setDownloadNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [downloadNotice]);

  const showDownloadNotice = (choice: DownloadChoice) => {
    playConfirm();
    setDownloadNotice(choice);
  };

  return (
    <main className={styles.home}>
      <section
        ref={stageRef}
        className={styles.stage}
        aria-label="ComePlayers Dual World Portal"
      >
        <Image
          src="/home-v14/dual-world-option-b.webp"
          alt="ComePlayers Dual World Portal with Alexia"
          fill
          priority
          sizes="100vw"
          className={styles.backgroundImage}
          draggable={false}
        />

        <div className={styles.portalBlue} aria-hidden="true" />
        <div className={styles.portalGold} aria-hidden="true" />
        <div className={styles.characterMotion} aria-hidden="true" />
        <div className={styles.scanline} aria-hidden="true" />

        <Link
          href="/messages"
          className={`${styles.actionButton} ${styles.chatButton}`}
          onPointerEnter={playHover}
          onClick={playConfirm}
        >
          <span>ENTER CHAT</span>
          <b aria-hidden="true">›</b>
        </Link>

        <Link
          href="/marketplace"
          className={`${styles.actionButton} ${styles.marketButton}`}
          onPointerEnter={playHover}
          onClick={playConfirm}
        >
          <span>EXPLORE MARKETPLACE</span>
          <b aria-hidden="true">›</b>
        </Link>

        <button
          type="button"
          className={`${styles.supportButton} ${styles.howButton}`}
          onPointerEnter={playHover}
          onClick={() => {
            playConfirm();
            setModal("how");
          }}
        >
          <span aria-hidden="true">?</span>
          HOW IT WORKS
        </button>

        <button
          type="button"
          className={`${styles.supportButton} ${styles.aboutButton}`}
          onPointerEnter={playHover}
          onClick={() => {
            playConfirm();
            setModal("about");
          }}
        >
          <span aria-hidden="true">◎</span>
          ABOUT US
        </button>

        <button
          type="button"
          className={`${styles.supportButton} ${styles.helpButton}`}
          onPointerEnter={playHover}
          onClick={() => {
            playConfirm();
            setModal("help");
          }}
        >
          <span aria-hidden="true">◉</span>
          HELP CENTER
        </button>

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className={`${styles.supportButton} ${styles.contactButton}`}
          onPointerEnter={playHover}
          onClick={playConfirm}
        >
          <span aria-hidden="true">✉</span>
          CONTACT
        </a>

        {PC_DOWNLOAD_URL ? (
          <a
            href={PC_DOWNLOAD_URL}
            className={`${styles.downloadButton} ${styles.windowsButton}`}
            onPointerEnter={playHover}
            onClick={playConfirm}
          >
            <span aria-hidden="true">⊞</span>
            WINDOWS
          </a>
        ) : (
          <button
            type="button"
            className={`${styles.downloadButton} ${styles.windowsButton}`}
            onPointerEnter={playHover}
            onClick={() => showDownloadNotice("pc")}
          >
            <span aria-hidden="true">⊞</span>
            WINDOWS
          </button>
        )}

        {ANDROID_DOWNLOAD_URL ? (
          <a
            href={ANDROID_DOWNLOAD_URL}
            className={`${styles.downloadButton} ${styles.androidButton}`}
            onPointerEnter={playHover}
            onClick={playConfirm}
          >
            <span aria-hidden="true">♟</span>
            ANDROID
          </a>
        ) : (
          <button
            type="button"
            className={`${styles.downloadButton} ${styles.androidButton}`}
            onPointerEnter={playHover}
            onClick={() => showDownloadNotice("android")}
          >
            <span aria-hidden="true">♟</span>
            ANDROID
          </button>
        )}

        <button
          type="button"
          className={styles.soundToggle}
          data-enabled={soundEnabled}
          onClick={() => void toggleSound()}
          aria-pressed={soundEnabled}
          aria-label={soundEnabled ? "Disable sound" : "Enable sound"}
        >
          <span aria-hidden="true">{soundEnabled ? "🔊" : "🔇"}</span>
          <span>{soundEnabled ? "Sound On" : "Sound Off"}</span>
          <kbd>M</kbd>
        </button>

        <p className={styles.notice} aria-live="polite">
          {downloadNotice === "pc" && "Link download Windows belum diatur."}
          {downloadNotice === "android" &&
            "Link download Android belum diatur."}
        </p>
      </section>

      {modal && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={() => setModal(null)}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cp-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className={styles.modalClose}
              type="button"
              onClick={() => setModal(null)}
              aria-label="Close"
            >
              ×
            </button>

            {modal === "how" && (
              <>
                <p className={styles.modalEyebrow}>HOW IT WORKS</p>
                <h2 id="cp-modal-title">Choose your world</h2>
                <p>
                  Masuk ke Chat & Community untuk mencari teman, party, dan
                  squad. Buka Marketplace untuk menemukan produk dan layanan
                  gaming dari penjual terpercaya.
                </p>
              </>
            )}

            {modal === "about" && (
              <>
                <p className={styles.modalEyebrow}>ABOUT COMEPLAYERS</p>
                <h2 id="cp-modal-title">Play together. Win together.</h2>
                <p>
                  ComePlayers menghubungkan komunitas gamer, komunikasi real
                  time, dan marketplace gaming dalam satu ekosistem.
                </p>
              </>
            )}

            {modal === "help" && (
              <>
                <p className={styles.modalEyebrow}>HELP CENTER</p>
                <h2 id="cp-modal-title">Butuh bantuan?</h2>
                <p>
                  Hubungi tim ComePlayers melalui tombol Contact atau email
                  {` ${SUPPORT_EMAIL}`}.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
