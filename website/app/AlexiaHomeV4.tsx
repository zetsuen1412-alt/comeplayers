"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import styles from "./alexia-home-v4.module.css";

type ActiveChoice = "chat" | "marketplace" | null;

type Point = {
  x: number;
  y: number;
};

const SCENES = {
  idle: "/alexia-v4/idle.webp",
  chat: "/alexia-v4/chat-hover.webp",
  marketplace: "/alexia-v4/marketplace-hover.webp",
} as const;

function clamp(value: number, min = -1, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export default function AlexiaHomeV4() {
  const rootRef = useRef<HTMLElement>(null);
  const pointerTargetRef = useRef<Point>({ x: 0, y: 0 });
  const pointerCurrentRef = useRef<Point>({ x: 0, y: 0 });
  const pointerVelocityRef = useRef<Point>({ x: 0, y: 0 });
  const activeChoiceRef = useRef<ActiveChoice>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeChoice, setActiveChoice] = useState<ActiveChoice>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    activeChoiceRef.current = activeChoice;
  }, [activeChoice]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => setReduceMotion(media.matches);
    syncReducedMotion();
    media.addEventListener?.("change", syncReducedMotion);

    Object.values(SCENES).forEach((source) => {
      const image = new Image();
      image.src = source;
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      media.removeEventListener?.("change", syncReducedMotion);
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduceMotion) return;

    let frameId = 0;
    let previousTime = performance.now();

    const animate = (time: number) => {
      const dt = Math.min((time - previousTime) / 1000, 0.034);
      previousTime = time;

      const active = activeChoiceRef.current;
      const pointer = pointerTargetRef.current;
      const desired: Point = active
        ? {
            x: active === "chat" ? -0.9 : 0.9,
            y: -0.08,
          }
        : pointer;

      const current = pointerCurrentRef.current;
      const velocity = pointerVelocityRef.current;

      const stiffness = active ? 74 : 88;
      const damping = active ? 15.5 : 17.5;
      const decay = Math.exp(-damping * dt);

      velocity.x = (velocity.x + (desired.x - current.x) * stiffness * dt) * decay;
      velocity.y = (velocity.y + (desired.y - current.y) * stiffness * dt) * decay;
      current.x += velocity.x * dt;
      current.y += velocity.y * dt;

      const sceneX = current.x * -5.2;
      const sceneY = current.y * -2.4;
      const headX = current.x * 5.4;
      const headY = current.y * 2.4;
      const headRotate = current.x * 1.05;
      const eyeX = current.x * 2.35;
      const eyeY = current.y * 1.2;
      const cursorX = ((current.x + 1) / 2) * 100;
      const cursorY = ((current.y + 1) / 2) * 100;

      root.style.setProperty("--scene-x", `${sceneX.toFixed(2)}px`);
      root.style.setProperty("--scene-y", `${sceneY.toFixed(2)}px`);
      root.style.setProperty("--head-x", `${headX.toFixed(2)}px`);
      root.style.setProperty("--head-y", `${headY.toFixed(2)}px`);
      root.style.setProperty("--head-r", `${headRotate.toFixed(2)}deg`);
      root.style.setProperty("--eye-x", `${eyeX.toFixed(2)}px`);
      root.style.setProperty("--eye-y", `${eyeY.toFixed(2)}px`);
      root.style.setProperty("--cursor-x", `${cursorX.toFixed(2)}%`);
      root.style.setProperty("--cursor-y", `${cursorY.toFixed(2)}%`);

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [reduceMotion]);

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (reduceMotion || event.pointerType === "touch") return;

    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;

    pointerTargetRef.current = {
      x: clamp(((event.clientX - rect.left) / rect.width) * 2 - 1),
      y: clamp(((event.clientY - rect.top) / rect.height) * 2 - 1),
    };
  }

  function activateChoice(choice: Exclude<ActiveChoice, null>) {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setActiveChoice(choice);
  }

  function scheduleIdle() {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setActiveChoice(null);
      hoverTimerRef.current = null;
    }, 90);
  }

  function resetPointer() {
    pointerTargetRef.current = { x: 0, y: 0 };
    scheduleIdle();
  }

  const activeScene = activeChoice ?? "idle";

  return (
    <main
      ref={rootRef}
      className={styles.root}
      data-active={activeScene}
      data-reduced-motion={reduceMotion ? "true" : "false"}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      aria-label="Choose ComePlayers Chat and Messages or Marketplace"
    >
      <div className={styles.ambient} aria-hidden="true" />

      <div className={styles.motionStage} aria-hidden="true">
        <div className={styles.scene}>
          <img
            src={SCENES.idle}
            alt=""
            draggable={false}
            decoding="async"
            fetchPriority="high"
            className={`${styles.frame} ${styles.idleFrame}`}
          />
          <img
            src={SCENES.chat}
            alt=""
            draggable={false}
            decoding="async"
            className={`${styles.frame} ${styles.chatFrame}`}
          />
          <img
            src={SCENES.marketplace}
            alt=""
            draggable={false}
            decoding="async"
            className={`${styles.frame} ${styles.marketplaceFrame}`}
          />

          <img
            src={SCENES.idle}
            alt=""
            draggable={false}
            decoding="async"
            className={styles.hairLayer}
          />
          <img
            src={SCENES.idle}
            alt=""
            draggable={false}
            decoding="async"
            className={styles.headLayer}
          />
          <img
            src={SCENES.idle}
            alt=""
            draggable={false}
            decoding="async"
            className={styles.eyeLayer}
          />
        </div>
      </div>

      <div className={styles.cursorLight} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />

      <Link
        href="/cpcommunity"
        className={`${styles.hotspot} ${styles.chatHotspot}`}
        aria-label="Open Chat and Messages"
        onPointerEnter={() => activateChoice("chat")}
        onPointerLeave={scheduleIdle}
        onFocus={() => activateChoice("chat")}
        onBlur={scheduleIdle}
      >
        <span className={styles.hotspotGlow} aria-hidden="true" />
        <span className={styles.srOnly}>Open Chat and Messages</span>
      </Link>

      <Link
        href="/marketplace"
        className={`${styles.hotspot} ${styles.marketplaceHotspot}`}
        aria-label="Explore Marketplace"
        onPointerEnter={() => activateChoice("marketplace")}
        onPointerLeave={scheduleIdle}
        onFocus={() => activateChoice("marketplace")}
        onBlur={scheduleIdle}
      >
        <span className={styles.hotspotGlow} aria-hidden="true" />
        <span className={styles.srOnly}>Explore Marketplace</span>
      </Link>

      <div className={styles.mobileActions}>
        <Link href="/cpcommunity">Chat &amp; Messages</Link>
        <Link href="/marketplace">Marketplace</Link>
      </div>

      <span className={styles.versionBadge}>ALEXIA HOME V4 · SMOOTH</span>
    </main>
  );
}
