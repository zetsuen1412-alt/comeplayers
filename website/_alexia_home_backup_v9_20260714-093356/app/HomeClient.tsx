"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./HomeClient.module.css";

type ActiveMenu = "chat" | "marketplace" | null;

const IMAGE_PATHS = [
  "/alexia-game-v9/idle.webp",
  "/alexia-game-v9/chat.webp",
  "/alexia-game-v9/marketplace.webp",
  "/alexia-game-v9/blink.webp",
  "/alexia-game-v9/smile.webp",
] as const;

export default function HomeClient() {
  const router = useRouter();
  const rootRef = useRef<HTMLElement | null>(null);
  const pointerTargetRef = useRef({ x: 0, y: 0 });
  const pointerCurrentRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attentionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeMenu, setActiveMenu] = useState<ActiveMenu>(null);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isSmiling, setIsSmiling] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    IMAGE_PATHS.forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const animate = () => {
      const current = pointerCurrentRef.current;
      const target = pointerTargetRef.current;

      current.x += (target.x - current.x) * 0.075;
      current.y += (target.y - current.y) * 0.075;

      root.style.setProperty("--pointer-x", current.x.toFixed(4));
      root.style.setProperty("--pointer-y", current.y.toFixed(4));
      root.style.setProperty("--cursor-x", `${50 + current.x * 50}%`);
      root.style.setProperty("--cursor-y", `${50 + current.y * 50}%`);

      frameRef.current = window.requestAnimationFrame(animate);
    };

    frameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const scheduleBlink = () => {
      const wait = 2600 + Math.random() * 3600;
      blinkTimerRef.current = setTimeout(() => {
        if (!activeMenu) {
          setIsBlinking(true);
          window.setTimeout(() => setIsBlinking(false), 145);
        }
        scheduleBlink();
      }, wait);
    };

    scheduleBlink();

    return () => {
      if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current);
    };
  }, [activeMenu]);

  useEffect(() => {
    const scheduleAttention = () => {
      const wait = 7200 + Math.random() * 5200;
      attentionTimerRef.current = setTimeout(() => {
        if (!activeMenu) {
          setIsSmiling(true);
          window.setTimeout(() => setIsSmiling(false), 1150);
        }
        scheduleAttention();
      }, wait);
    };

    scheduleAttention();

    return () => {
      if (attentionTimerRef.current) clearTimeout(attentionTimerRef.current);
    };
  }, [activeMenu]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === "touch") return;

      const rect = event.currentTarget.getBoundingClientRect();
      const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const normalizedY = ((event.clientY - rect.top) / rect.height) * 2 - 1;

      pointerTargetRef.current.x = Math.max(-1, Math.min(1, normalizedX));
      pointerTargetRef.current.y = Math.max(-1, Math.min(1, normalizedY));
    },
    []
  );

  const resetPointer = useCallback(() => {
    pointerTargetRef.current = { x: 0, y: 0 };
    setActiveMenu(null);
  }, []);

  const navigateWithTransition = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      event.preventDefault();
      if (isLeaving) return;

      setIsLeaving(true);
      window.setTimeout(() => router.push(href), 360);
    },
    [isLeaving, router]
  );

  return (
    <main
      ref={rootRef}
      className={`${styles.root} ${isLeaving ? styles.leaving : ""}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      aria-label="ComePlayers main menu"
    >
      <div className={styles.stage}>
        <div className={styles.camera}>
          <img
            src="/alexia-game-v9/idle.webp"
            className={styles.baseImage}
            alt="Alexia presenting Chat and Marketplace"
            draggable={false}
          />

          <div className={styles.characterRig} aria-hidden="true">
            <img
              src="/alexia-game-v9/idle.webp"
              className={`${styles.stateImage} ${styles.visible}`}
              alt=""
              draggable={false}
            />
            <img
              src="/alexia-game-v9/chat.webp"
              className={`${styles.stateImage} ${
                activeMenu === "chat" ? styles.visible : ""
              }`}
              alt=""
              draggable={false}
            />
            <img
              src="/alexia-game-v9/marketplace.webp"
              className={`${styles.stateImage} ${
                activeMenu === "marketplace" ? styles.visible : ""
              }`}
              alt=""
              draggable={false}
            />
            <img
              src="/alexia-game-v9/smile.webp"
              className={`${styles.stateImage} ${
                isSmiling && !activeMenu ? styles.visible : ""
              }`}
              alt=""
              draggable={false}
            />
          </div>

          <img
            src="/alexia-game-v9/blink.webp"
            className={`${styles.blinkLayer} ${
              isBlinking ? styles.visible : ""
            }`}
            alt=""
            aria-hidden="true"
            draggable={false}
          />

          <div className={styles.ambientGlow} aria-hidden="true" />
          <div className={styles.particles} aria-hidden="true" />
          <div className={styles.scanline} aria-hidden="true" />
          <div className={styles.cursorAura} aria-hidden="true" />

          <div
            className={`${styles.panelGlow} ${styles.panelGlowLeft} ${
              activeMenu === "chat" ? styles.panelGlowActive : ""
            }`}
            aria-hidden="true"
          />
          <div
            className={`${styles.panelGlow} ${styles.panelGlowRight} ${
              activeMenu === "marketplace" ? styles.panelGlowActive : ""
            }`}
            aria-hidden="true"
          />

          <Link
            href="/messages"
            className={`${styles.menuHitbox} ${styles.menuLeft}`}
            onMouseEnter={() => setActiveMenu("chat")}
            onMouseLeave={() => setActiveMenu(null)}
            onFocus={() => setActiveMenu("chat")}
            onBlur={() => setActiveMenu(null)}
            onClick={(event) => navigateWithTransition(event, "/messages")}
            aria-label="Open Chat and Messages"
          >
            <span className={styles.srOnly}>Open Chat and Messages</span>
          </Link>

          <Link
            href="/marketplace"
            className={`${styles.menuHitbox} ${styles.menuRight}`}
            onMouseEnter={() => setActiveMenu("marketplace")}
            onMouseLeave={() => setActiveMenu(null)}
            onFocus={() => setActiveMenu("marketplace")}
            onBlur={() => setActiveMenu(null)}
            onClick={(event) =>
              navigateWithTransition(event, "/marketplace")
            }
            aria-label="Explore Marketplace"
          >
            <span className={styles.srOnly}>Explore Marketplace</span>
          </Link>
        </div>
      </div>

      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.transitionCurtain} aria-hidden="true" />
    </main>
  );
}
