"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import type { LobbyChoice } from "./game-lobby-v6.types";
import styles from "./game-lobby-v6.module.css";

const GameLobbyCanvas = dynamic(() => import("./GameLobbyCanvasV6"), {
  ssr: false,
  loading: () => <div className={styles.canvasLoading} aria-hidden="true" />,
});

type NavigableChoice = Exclude<LobbyChoice, null>;
type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

type AudioEngine = {
  context: AudioContext;
  master: GainNode;
  ambience: OscillatorNode[];
};

let audioEngine: AudioEngine | null = null;

function getAudioEngine() {
  try {
    if (audioEngine) return audioEngine;
    const AudioContextClass = window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!AudioContextClass) return null;
    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = 0.16;
    master.connect(context.destination);
    audioEngine = { context, master, ambience: [] };
    return audioEngine;
  } catch {
    return null;
  }
}

function startAmbience() {
  const engine = getAudioEngine();
  if (!engine || engine.ambience.length) return;
  const { context, master } = engine;
  void context.resume();
  const frequencies = [48, 72];
  frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === 0 ? "sine" : "triangle";
    oscillator.frequency.value = frequency;
    gain.gain.value = index === 0 ? 0.018 : 0.007;
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start();
    engine.ambience.push(oscillator);
  });
}

function setAudioMuted(muted: boolean) {
  const engine = getAudioEngine();
  if (!engine) return;
  const now = engine.context.currentTime;
  engine.master.gain.cancelScheduledValues(now);
  engine.master.gain.setTargetAtTime(muted ? 0 : 0.16, now, 0.04);
}

function playUiTone(kind: "hover" | "confirm" | "start") {
  const engine = getAudioEngine();
  if (!engine) return;
  const { context, master } = engine;
  void context.resume();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  const startFrequency = kind === "confirm" ? 390 : kind === "start" ? 180 : 560;
  const endFrequency = kind === "confirm" ? 920 : kind === "start" ? 540 : 720;
  const duration = kind === "confirm" ? 0.22 : kind === "start" ? 0.34 : 0.085;
  oscillator.type = kind === "hover" ? "sine" : "triangle";
  oscillator.frequency.setValueAtTime(startFrequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration * 0.75);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === "hover" ? 0.1 : 0.22, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

const CHOICES: Record<NavigableChoice, { href: string; label: string; loading: string }> = {
  chat: { href: "/cpcommunity", label: "CHAT & MESSAGES", loading: "CONNECTING TO CHAT" },
  marketplace: { href: "/marketplace", label: "MARKETPLACE", loading: "OPENING MARKETPLACE" },
};

export default function GameLobbyV6() {
  const router = useRouter();
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gamepadFrameRef = useRef<number | null>(null);
  const gamepadLockRef = useRef(false);
  const lastHoverRef = useRef<LobbyChoice>(null);
  const selectedRef = useRef<NavigableChoice>("chat");
  const enteredRef = useRef(false);
  const transitionRef = useRef(false);
  const [entered, setEntered] = useState(false);
  const [selected, setSelected] = useState<NavigableChoice>("chat");
  const [activeChoice, setActiveChoice] = useState<LobbyChoice>(null);
  const [transitionTarget, setTransitionTarget] = useState<NavigableChoice | null>(null);
  const [ready] = useState(true);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    enteredRef.current = entered;
  }, [entered]);
  useEffect(() => {
    transitionRef.current = transitionTarget !== null;
  }, [transitionTarget]);

  const enterLobby = useCallback(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    setEntered(true);
    setActiveChoice("chat");
    setSelected("chat");
    startAmbience();
    playUiTone("start");
  }, []);

  const choose = useCallback((choice: NavigableChoice, playSound = true) => {
    if (!enteredRef.current || transitionRef.current) return;
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    selectedRef.current = choice;
    setSelected(choice);
    setActiveChoice(choice);
    if (playSound && lastHoverRef.current !== choice) playUiTone("hover");
    lastHoverRef.current = choice;
  }, []);

  const release = useCallback(() => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      lastHoverRef.current = null;
      setActiveChoice(selectedRef.current);
      leaveTimerRef.current = null;
    }, 90);
  }, []);

  const navigateTo = useCallback(
    (choice: NavigableChoice) => {
      if (!enteredRef.current || transitionRef.current) return;
      transitionRef.current = true;
      setSelected(choice);
      setActiveChoice(choice);
      setTransitionTarget(choice);
      playUiTone("confirm");
      navigationTimerRef.current = setTimeout(() => router.push(CHOICES[choice].href), 650);
    },
    [router]
  );

  const handleAnchorClick = useCallback(
    (choice: NavigableChoice, event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      navigateTo(choice);
    },
    [navigateTo]
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousBackground = document.body.style.background;
    document.body.style.overflow = "hidden";
    document.body.style.background = "#020202";
    const onKeyDown = (event: KeyboardEvent) => {
      if (!enteredRef.current) {
        if (["Enter", " ", "ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(event.key)) {
          event.preventDefault();
          enterLobby();
        }
        return;
      }
      if (transitionRef.current) return;
      if (["ArrowLeft", "a", "A"].includes(event.key)) {
        event.preventDefault();
        choose("chat");
      } else if (["ArrowRight", "d", "D"].includes(event.key)) {
        event.preventDefault();
        choose("marketplace");
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigateTo(selectedRef.current);
      } else if (event.key === "m" || event.key === "M") {
        setMuted((value) => {
          const next = !value;
          setAudioMuted(next);
          return next;
        });
      } else if (event.key === "f" || event.key === "F") {
        if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
        else void document.exitFullscreen?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const pollGamepad = () => {
      const gamepad = navigator.getGamepads?.()[0];
      if (gamepad) {
        const axis = gamepad.axes[0] ?? 0;
        const leftPressed = axis < -0.55 || gamepad.buttons[14]?.pressed;
        const rightPressed = axis > 0.55 || gamepad.buttons[15]?.pressed;
        const confirmPressed = gamepad.buttons[0]?.pressed;
        const startPressed = gamepad.buttons[9]?.pressed;
        const anyPressed = leftPressed || rightPressed || confirmPressed || startPressed;
        if (anyPressed && !gamepadLockRef.current) {
          gamepadLockRef.current = true;
          if (!enteredRef.current) enterLobby();
          else if (leftPressed) choose("chat");
          else if (rightPressed) choose("marketplace");
          else if (confirmPressed) navigateTo(selectedRef.current);
        } else if (!anyPressed) gamepadLockRef.current = false;
      }
      gamepadFrameRef.current = requestAnimationFrame(pollGamepad);
    };
    gamepadFrameRef.current = requestAnimationFrame(pollGamepad);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.background = previousBackground;
      window.removeEventListener("keydown", onKeyDown);
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
      if (gamepadFrameRef.current) cancelAnimationFrame(gamepadFrameRef.current);
    };
  }, [choose, enterLobby, navigateTo]);

  const toggleMute = () => {
    setMuted((value) => {
      const next = !value;
      setAudioMuted(next);
      if (!next) startAmbience();
      return next;
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
    else void document.exitFullscreen?.();
  };

  return (
    <main
      className={styles.root}
      data-ready={ready ? "true" : "false"}
      data-entered={entered ? "true" : "false"}
      data-active={activeChoice ?? "idle"}
      data-transition={transitionTarget ?? "none"}
      aria-label="ComePlayers game lobby"
    >
      <div className={styles.staticFallback} aria-hidden="true" />
      <GameLobbyCanvas activeChoice={activeChoice} transitionActive={transitionTarget !== null} entered={entered} />
      <div className={styles.scanlines} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />

      <section className={styles.startScreen} aria-label="Enter ComePlayers lobby">
        <div className={styles.startLogo} aria-hidden="true"><span>CP</span></div>
        <p className={styles.eyebrow}>COMEPLAYERS INTERACTIVE LOBBY</p>
        <h1>PLAY TOGETHER.<br /><strong>WIN TOGETHER.</strong></h1>
        <button type="button" className={styles.startButton} onClick={enterLobby}>
          <span>PRESS ANY KEY</span><small>OR CLICK TO ENTER</small>
        </button>
      </section>

      <div className={styles.topHud} aria-hidden={!entered}>
        <span className={styles.liveDot} />
        <span>COMEPLAYERS // MAIN LOBBY</span>
        <span className={styles.serverText}>SERVER ONLINE</span>
      </div>

      <div className={styles.utilityBar}>
        <button type="button" onClick={toggleMute} aria-label={muted ? "Enable sound" : "Mute sound"}>{muted ? "SOUND OFF" : "SOUND ON"}</button>
        <button type="button" onClick={toggleFullscreen} aria-label="Toggle fullscreen">FULLSCREEN</button>
      </div>

      {(Object.keys(CHOICES) as NavigableChoice[]).map((choice) => (
        <a
          key={choice}
          href={CHOICES[choice].href}
          className={`${styles.choiceHotspot} ${choice === "chat" ? styles.chatChoice : styles.marketplaceChoice}`}
          data-selected={selected === choice ? "true" : "false"}
          onPointerEnter={() => choose(choice)}
          onPointerLeave={release}
          onFocus={() => choose(choice)}
          onBlur={release}
          onClick={(event) => handleAnchorClick(choice, event)}
          aria-label={CHOICES[choice].label}
        >
          <span className={styles.focusFrame} aria-hidden="true">
            <span className={styles.selector}>▶</span>
            <span className={styles.selectText}>SELECT {choice === "chat" ? "CHAT" : "MARKETPLACE"}</span>
          </span>
        </a>
      ))}

      <div className={styles.bottomHud} aria-hidden={!entered}>
        <span className={styles.key}>A / D</span><span>SELECT</span>
        <span className={styles.divider}>•</span>
        <span className={styles.key}>ENTER</span><span>CONFIRM</span>
        <span className={styles.divider}>•</span>
        <span className={styles.key}>GAMEPAD</span><span>SUPPORTED</span>
      </div>

      <div className={styles.versionBadge} aria-hidden="true">GAME LOBBY V6 · PIXIJS</div>

      <div className={styles.mobileMenu} aria-label="Mobile lobby menu">
        <button type="button" onClick={() => navigateTo("chat")}>CHAT &amp; MESSAGES</button>
        <button type="button" onClick={() => navigateTo("marketplace")}>MARKETPLACE</button>
      </div>

      <div className={styles.transitionCurtain} aria-hidden="true">
        <i /><b />
        <strong>{transitionTarget ? CHOICES[transitionTarget].loading : ""}</strong>
        <span>PLEASE WAIT</span>
      </div>
    </main>
  );
}
