"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import styles from "./messages-chat-loader-v17.module.css";

type MessagesChatLoaderV17Props = {
  ready?: boolean;
};

const loadingStatuses = [
  "Connecting to ComePlayers",
  "Loading your profile",
  "Syncing conversations",
  "Preparing your squad",
];

export default function MessagesChatLoaderV17({
  ready = false,
}: MessagesChatLoaderV17Props) {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    if (ready) {
      setProgress(100);
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) return 92;
        const increment = current < 45 ? 3 : current < 75 ? 1.8 : 0.7;
        return Math.min(92, current + increment);
      });
    }, 120);

    return () => window.clearInterval(timer);
  }, [ready]);

  const status = useMemo(() => {
    if (ready || progress >= 98) return "Opening Chat & Messages";
    if (progress >= 78) return loadingStatuses[3];
    if (progress >= 55) return loadingStatuses[2];
    if (progress >= 30) return loadingStatuses[1];
    return loadingStatuses[0];
  }, [progress, ready]);

  return (
    <main
      className={styles.screen}
      data-ready={ready ? "true" : "false"}
      aria-label="Loading ComePlayers Chat"
      aria-busy={!ready}
    >
      <Image
        src="/messages-loading-v17/chat-loader-v17.webp"
        alt="ComePlayers Chat loading screen"
        fill
        priority
        sizes="100vw"
        className={styles.background}
        draggable={false}
      />

      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.scanlines} aria-hidden="true" />
      <div className={styles.dataSweep} aria-hidden="true" />
      <div className={styles.iconGlow} aria-hidden="true" />

      <div className={styles.progressTrack} aria-hidden="true">
        <span
          className={styles.progressFill}
          style={{ width: `${progress}%` }}
        />
        <span
          className={styles.progressHead}
          style={{ left: `calc(${progress}% - 9px)` }}
        />
      </div>

      <div className={styles.connectedPulse} aria-hidden="true" />

      <p className={styles.screenReaderStatus} aria-live="polite">
        {status}. {Math.round(progress)} percent.
      </p>
    </main>
  );
}
