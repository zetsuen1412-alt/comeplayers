"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./messages-chat-loader-v16.module.css";

const statusSteps = [
  "Connecting to your conversations",
  "Syncing secure messages",
  "Preparing your chat workspace",
];

export default function MessagesChatLoaderV16() {
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStatusIndex((current) => (current + 1) % statusSteps.length);
    }, 1100);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className={styles.screen} aria-label="Loading ComePlayers Chat">
      <Image
        src="/messages-loading-v16/chat-loader-v16.webp"
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
        <span className={styles.progressGlow} />
        <span className={styles.progressHead} />
      </div>

      <div className={styles.connectedPulse} aria-hidden="true" />

      <p className={styles.screenReaderStatus} aria-live="polite">
        {statusSteps[statusIndex]}
      </p>
    </main>
  );
}
