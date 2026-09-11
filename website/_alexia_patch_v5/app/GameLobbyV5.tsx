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
import type { LobbyChoice } from "./game-lobby-v5.types";
import styles from "./game-lobby-v5.module.css";

const GameLobbyCanvas = dynamic(() => import("./GameLobbyCanvas"), {
  ssr: false,
  loading: () => <div className={styles.canvasLoading} aria-hidden="true" />,
});

type NavigableChoice = Exclude<LobbyChoice, null>;

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function playUiTone(kind: "hover" | "confirm") {
  try {
    const AudioContextClass =
      window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = kind === "confirm" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(kind === "confirm" ? 430 : 590, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      kind === "confirm" ? 860 : 710,
      now + (kind === "confirm" ? 0.15 : 0.055)
    );

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      kind === "confirm" ? 0.08 : 0.035,
      now + 0.008
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + (kind === "confirm" ? 0.2 : 0.085)
    );

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + (kind === "confirm" ? 0.21 : 0.09));
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Audio is enhancement-only. Ignore browsers that block it.
  }
}

export default function GameLobbyV5() {
  const router = useRouter();
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoverRef = useRef<LobbyChoice>(null);
  const [activeChoice, setActiveChoice] = useState<LobbyChoice>(null);
  const [transitionTarget, setTransitionTarget] =
    useState<NavigableChoice | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousBackground = document.body.style.background;
    document.body.style.overflow = "hidden";
    document.body.style.background = "#020202";
    setReady(true);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.background = previousBackground;
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
    };
  }, []);

  const activate = useCallback((choice: NavigableChoice) => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }

    setActiveChoice(choice);
    if (lastHoverRef.current !== choice) {
      lastHoverRef.current = choice;
      playUiTone("hover");
    }
  }, []);

  const release = useCallback(() => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      lastHoverRef.current = null;
      setActiveChoice(null);
      leaveTimerRef.current = null;
    }, 110);
  }, []);

  const navigate = useCallback(
    (choice: NavigableChoice, href: string, event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (transitionTarget) return;

      setActiveChoice(choice);
      setTransitionTarget(choice);
      playUiTone("confirm");

      navigationTimerRef.current = setTimeout(() => {
        router.push(href);
      }, 520);
    },
    [router, transitionTarget]
  );

  return (
    <main
      className={styles.root}
      data-ready={ready ? "true" : "false"}
      data-active={activeChoice ?? "idle"}
      data-transition={transitionTarget ?? "none"}
      aria-label="ComePlayers game lobby"
    >
      <div className={styles.staticFallback} aria-hidden="true" />
      <GameLobbyCanvas
        activeChoice={activeChoice}
        transitionActive={transitionTarget !== null}
      />

      <div className={styles.scanlines} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.topHud} aria-hidden="true">
        <span className={styles.liveDot} />
        <span>COMEPLAYERS // MAIN LOBBY</span>
        <span className={styles.serverText}>SERVER ONLINE</span>
      </div>

      <a
        href="/messages"
        className={`${styles.choiceHotspot} ${styles.chatChoice}`}
        onPointerEnter={() => activate("chat")}
        onPointerLeave={release}
        onFocus={() => activate("chat")}
        onBlur={release}
        onClick={(event) => navigate("chat", "/messages", event)}
        aria-label="Open Chat and Messages"
      >
        <span className={styles.focusFrame} aria-hidden="true">
          <span className={styles.selector}>▶</span>
          <span className={styles.selectText}>SELECT CHAT</span>
        </span>
      </a>

      <a
        href="/marketplace"
        className={`${styles.choiceHotspot} ${styles.marketplaceChoice}`}
        onPointerEnter={() => activate("marketplace")}
        onPointerLeave={release}
        onFocus={() => activate("marketplace")}
        onBlur={release}
        onClick={(event) => navigate("marketplace", "/marketplace", event)}
        aria-label="Explore Marketplace"
      >
        <span className={styles.focusFrame} aria-hidden="true">
          <span className={styles.selector}>▶</span>
          <span className={styles.selectText}>SELECT MARKETPLACE</span>
        </span>
      </a>

      <div className={styles.bottomHud} aria-hidden="true">
        <span className={styles.key}>MOUSE</span>
        <span>ARAHKAN CURSOR UNTUK MEMILIH</span>
        <span className={styles.divider}>•</span>
        <span className={styles.key}>CLICK</span>
        <span>KONFIRMASI</span>
      </div>

      <div className={styles.versionBadge} aria-hidden="true">
        GAME LOBBY V5 · PIXIJS
      </div>

      <div className={styles.mobileMenu}>
        <a
          href="/messages"
          onClick={(event) => navigate("chat", "/messages", event)}
        >
          CHAT &amp; MESSAGES
        </a>
        <a
          href="/marketplace"
          onClick={(event) => navigate("marketplace", "/marketplace", event)}
        >
          MARKETPLACE
        </a>
      </div>

      <div className={styles.transitionCurtain} aria-hidden="true">
        <span />
        <strong>
          {transitionTarget === "chat"
            ? "CONNECTING TO CHAT"
            : transitionTarget === "marketplace"
              ? "OPENING MARKETPLACE"
              : ""}
        </strong>
      </div>
    </main>
  );
}
