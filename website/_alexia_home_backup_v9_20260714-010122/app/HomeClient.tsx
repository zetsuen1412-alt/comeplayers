"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./gameLobby.module.css";

type MenuKey = "chat" | "marketplace" | "pc" | "android" | null;

const menuItems = [
  { key: "chat" as const, label: "Chat & Messages", href: "/messages" },
  { key: "marketplace" as const, label: "Marketplace", href: "/marketplace" },
  { key: "pc" as const, label: "Download PC", href: "#download-pc" },
  { key: "android" as const, label: "Download Android", href: "#download-android" },
];

export default function HomeClient() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const [active, setActive] = useState<MenuKey>(null);

  useEffect(() => {
    document.body.classList.add("cp-game-home");
    return () => document.body.classList.remove("cp-game-home");
  }, []);

  useEffect(() => {
    const tick = () => {
      const current = currentRef.current;
      const target = targetRef.current;
      current.x += (target.x - current.x) * 0.055;
      current.y += (target.y - current.y) * 0.055;

      const scene = sceneRef.current;
      if (scene) {
        scene.style.setProperty("--mx", current.x.toFixed(3));
        scene.style.setProperty("--my", current.y.toFixed(3));
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    targetRef.current = {
      x: Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)),
      y: Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1)),
    };
  }

  function resetPointer() {
    targetRef.current = { x: 0, y: 0 };
    setActive(null);
  }

  function pendingDownload(platform: "PC" | "Android") {
    window.alert(`Tautan download ${platform} belum dikonfigurasi. Masukkan URL download di app/HomeClient.tsx.`);
  }

  return (
    <main
      ref={sceneRef}
      className={styles.scene}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      data-active={active ?? "idle"}
    >
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.rain} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />

      <nav className={styles.hotspots} aria-label="ComePlayers game lobby menu">
        {menuItems.map((item) => {
          const commonProps = {
            className: `${styles.hotspot} ${styles[item.key]}`,
            onPointerEnter: () => setActive(item.key),
            onPointerLeave: () => setActive(null),
            "aria-label": item.label,
          };

          if (item.key === "pc") {
            return (
              <button key={item.key} {...commonProps} type="button" onClick={() => pendingDownload("PC")}>
                <span>{item.label}</span>
              </button>
            );
          }

          if (item.key === "android") {
            return (
              <button key={item.key} {...commonProps} type="button" onClick={() => pendingDownload("Android")}>
                <span>{item.label}</span>
              </button>
            );
          }

          return (
            <Link key={item.key} {...commonProps} href={item.href}>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={styles.status} aria-hidden="true">
        <span className={styles.statusDot} />
        <span>60 FPS LOBBY</span>
      </div>
    </main>
  );
}
