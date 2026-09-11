"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import styles from "./alexia-home-v3.module.css";

type ActiveChoice = "chat" | "marketplace" | null;

type MotionStyle = CSSProperties & {
  "--look-x": string;
  "--look-y": string;
  "--head-x": string;
  "--head-y": string;
  "--head-r": string;
  "--eye-x": string;
  "--eye-y": string;
  "--cursor-x": string;
  "--cursor-y": string;
};

const SCENES = {
  idle: "/alexia-v3/idle.webp",
  chat: "/alexia-v3/chat-hover.webp",
  marketplace: "/alexia-v3/marketplace-hover.webp",
} as const;

function clamp(value: number, min = -1, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export default function AlexiaHomeV3() {
  const rootRef = useRef<HTMLElement>(null);
  const [activeChoice, setActiveChoice] = useState<ActiveChoice>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener?.("change", sync);

    Object.values(SCENES).forEach((src) => {
      const image = new Image();
      image.src = src;
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      media.removeEventListener?.("change", sync);
    };
  }, []);

  function updateCursor(event: ReactPointerEvent<HTMLElement>) {
    if (reduceMotion || event.pointerType === "touch") return;

    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;

    setCursor({
      x: clamp(((event.clientX - rect.left) / rect.width) * 2 - 1),
      y: clamp(((event.clientY - rect.top) / rect.height) * 2 - 1),
    });
  }

  const scene = activeChoice ?? "idle";

  const motionStyle = useMemo<MotionStyle>(() => {
    const targetX =
      activeChoice === "chat"
        ? -0.92
        : activeChoice === "marketplace"
          ? 0.92
          : cursor.x;
    const targetY = activeChoice ? -0.08 : cursor.y;

    if (reduceMotion) {
      return {
        "--look-x": "0px",
        "--look-y": "0px",
        "--head-x": "0px",
        "--head-y": "0px",
        "--head-r": "0deg",
        "--eye-x": "0px",
        "--eye-y": "0px",
        "--cursor-x": "50%",
        "--cursor-y": "50%",
      };
    }

    return {
      "--look-x": `${cursor.x * -5}px`,
      "--look-y": `${cursor.y * -2.5}px`,
      "--head-x": `${targetX * 4.2}px`,
      "--head-y": `${targetY * 2.2}px`,
      "--head-r": `${targetX * 0.7}deg`,
      "--eye-x": `${targetX * 2.8}px`,
      "--eye-y": `${targetY * 1.7}px`,
      "--cursor-x": `${((cursor.x + 1) / 2) * 100}%`,
      "--cursor-y": `${((cursor.y + 1) / 2) * 100}%`,
    };
  }, [activeChoice, cursor, reduceMotion]);

  return (
    <main
      ref={rootRef}
      className={styles.root}
      data-active={scene}
      style={motionStyle}
      onPointerMove={updateCursor}
      onPointerLeave={() => {
        setCursor({ x: 0, y: 0 });
        setActiveChoice(null);
      }}
      aria-label="Choose ComePlayers Chat and Messages or Marketplace"
    >
      <div className={styles.scene} aria-hidden="true">
        <img
          src={SCENES.idle}
          alt=""
          draggable={false}
          className={`${styles.frame} ${scene === "idle" ? styles.visible : ""}`}
        />
        <img
          src={SCENES.chat}
          alt=""
          draggable={false}
          className={`${styles.frame} ${scene === "chat" ? styles.visible : ""}`}
        />
        <img
          src={SCENES.marketplace}
          alt=""
          draggable={false}
          className={`${styles.frame} ${scene === "marketplace" ? styles.visible : ""}`}
        />

        <img
          src={SCENES.idle}
          alt=""
          draggable={false}
          className={styles.headLayer}
        />
        <img
          src={SCENES.idle}
          alt=""
          draggable={false}
          className={styles.eyeLayer}
        />

        <div className={styles.cursorGlow} />
      </div>

      <Link
        href="/cpcommunity"
        className={`${styles.hotspot} ${styles.chatHotspot}`}
        aria-label="Open Chat and Messages"
        onPointerEnter={() => setActiveChoice("chat")}
        onPointerLeave={() => setActiveChoice(null)}
        onFocus={() => setActiveChoice("chat")}
        onBlur={() => setActiveChoice(null)}
      >
        <span className={styles.srOnly}>Open Chat and Messages</span>
      </Link>

      <Link
        href="/marketplace"
        className={`${styles.hotspot} ${styles.marketplaceHotspot}`}
        aria-label="Explore Marketplace"
        onPointerEnter={() => setActiveChoice("marketplace")}
        onPointerLeave={() => setActiveChoice(null)}
        onFocus={() => setActiveChoice("marketplace")}
        onBlur={() => setActiveChoice(null)}
      >
        <span className={styles.srOnly}>Explore Marketplace</span>
      </Link>

      <div className={styles.mobileActions}>
        <Link href="/cpcommunity" onPointerDown={() => setActiveChoice("chat")}>
          Chat &amp; Messages
        </Link>
        <Link
          href="/marketplace"
          onPointerDown={() => setActiveChoice("marketplace")}
        >
          Marketplace
        </Link>
      </div>

      <span className={styles.versionBadge}>ALEXIA HOME V3</span>
    </main>
  );
}
