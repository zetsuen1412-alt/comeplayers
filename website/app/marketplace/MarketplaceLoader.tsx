"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./marketplace-loading.module.css";

const checkpoints = [
  { label: "Establishing connection", threshold: 20 },
  { label: "Opening portal", threshold: 45 },
  { label: "Loading marketplace", threshold: 72 },
  { label: "Almost there", threshold: 96 },
] as const;

export default function MarketplaceLoader() {
  const [progress, setProgress] = useState(12);

  useEffect(() => {
    const startedAt = Date.now();
    const duration = 3200;

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const ratio = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - ratio, 3);
      const next = Math.min(96, Math.round(12 + eased * 84));
      setProgress(next);

      if (ratio >= 1) {
        window.clearInterval(timer);
      }
    }, 90);

    return () => window.clearInterval(timer);
  }, []);

  const activeIndex = useMemo(() => {
    const index = checkpoints.findIndex((item, idx) => {
      const next = checkpoints[idx + 1];
      return progress >= item.threshold && (!next || progress < next.threshold);
    });
    return index === -1 ? checkpoints.length - 1 : index;
  }, [progress]);

  return (
    <main className={styles.loaderPage}>
      <section className={styles.frame} aria-label="Marketplace loading screen">
        <img
          className={styles.artwork}
          src="/marketplace-loader-v25/opening-comeplayers-marketplace-portal.png"
          alt="ComePlayers Marketplace loading portal"
          width={1672}
          height={941}
          draggable={false}
        />

        <div className={styles.overlay}>
          <div className={styles.progressCard}>
            <div className={styles.progressTitle}>Opening Marketplace Portal...</div>
            <div className={styles.progressRow}>
              <div className={styles.progressTrack} aria-hidden="true">
                <div
                  className={styles.progressBar}
                  style={{ width: `${progress}%` }}
                />
                <div className={styles.progressGlow} style={{ left: `${progress}%` }} />
              </div>
              <div className={styles.progressValue}>{progress}%</div>
            </div>
            <div className={styles.waitText}>PLEASE WAIT</div>
          </div>

          <ol className={styles.statusList}>
            {checkpoints.map((item, index) => {
              const done = progress >= item.threshold;
              const active = index === activeIndex;
              return (
                <li key={item.label} className={styles.statusItem}>
                  <span
                    className={`${styles.statusDot} ${done ? styles.statusDone : ""} ${
                      active ? styles.statusActive : ""
                    }`}
                    aria-hidden="true"
                  />
                  <span className={done ? styles.statusTextDone : undefined}>{item.label}</span>
                </li>
              );
            })}
          </ol>

          <div className={styles.bottomSpecs}>
            <span>SECURE CHECKOUT</span>
            <span>ENCRYPTED PAYMENTS</span>
            <span>REAL-TIME OFFERS</span>
          </div>
        </div>
      </section>
    </main>
  );
}
