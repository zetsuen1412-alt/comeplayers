"use client";

import styles from "./marketplace-loading.module.css";

const checkpoints = [
  { label: "Establishing connection", threshold: 0 },
  { label: "Opening portal", threshold: 28 },
  { label: "Loading marketplace", threshold: 54 },
  { label: "Almost there", threshold: 80 },
  { label: "Finalizing setup", threshold: 96 },
] as const;

type MarketplaceLoadingViewProps = {
  progress: number;
};

export default function MarketplaceLoadingView({
  progress,
}: MarketplaceLoadingViewProps) {
  const normalizedProgress = Math.max(0, Math.min(100, Math.round(progress)));

  const activeIndex =
    normalizedProgress >= 100
      ? checkpoints.length
      : checkpoints.reduce(
          (latestIndex, checkpoint, index) =>
            normalizedProgress >= checkpoint.threshold ? index : latestIndex,
          0,
        );

  return (
    <main className={styles.loaderPage} aria-live="polite">
      <section className={styles.frame} aria-label="Opening ComePlayers Marketplace">
        <img
          className={styles.artwork}
          src="/marketplace-loader-v27/opening-the-marketplace-portal.png"
          alt="Alexia opening the ComePlayers Marketplace portal"
          width={1672}
          height={941}
          draggable={false}
        />

        <div className={styles.portalEnergy} aria-hidden="true" />
        <div className={styles.portalCore} aria-hidden="true" />
        <div className={styles.scanline} aria-hidden="true" />

        <div className={styles.overlay}>
          <div className={styles.statusPanel}>
            <ol className={styles.statusList} aria-label="Marketplace loading status">
              {checkpoints.map((checkpoint, index) => {
                const completed =
                  normalizedProgress >= 100 || index < activeIndex;
                const active = index === activeIndex && normalizedProgress < 100;

                return (
                  <li
                    key={checkpoint.label}
                    className={`${styles.statusItem} ${
                      completed ? styles.statusItemDone : ""
                    } ${active ? styles.statusItemActive : ""}`}
                  >
                    <span
                      className={`${styles.statusIcon} ${
                        completed ? styles.statusIconDone : ""
                      } ${active ? styles.statusIconActive : ""}`}
                      aria-hidden="true"
                    >
                      {completed ? "✓" : ""}
                    </span>
                    <span>{checkpoint.label}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className={styles.progressCard}>
            <div className={styles.progressTitle}>
              {normalizedProgress >= 100
                ? "Marketplace Ready"
                : "Opening Marketplace Portal..."}
            </div>

            <div className={styles.progressRow}>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-label="Marketplace loading progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={normalizedProgress}
              >
                <div
                  className={styles.progressBar}
                  style={{ width: `${normalizedProgress}%` }}
                />
                {normalizedProgress > 0 && (
                  <div
                    className={styles.progressGlow}
                    style={{ left: `${normalizedProgress}%` }}
                  />
                )}
              </div>

              <div className={styles.progressValue}>{normalizedProgress}%</div>
            </div>

            <div className={styles.bottomSpecs} aria-hidden="true">
              <span className={styles.specItem}>
                <span className={styles.specIcon}>✓</span>
                SECURE CHECKOUT
              </span>
              <span className={styles.specDivider} />
              <span className={styles.specItem}>
                <span className={styles.specIcon}>▣</span>
                ENCRYPTED PAYMENTS
              </span>
              <span className={styles.specDivider} />
              <span className={styles.specItem}>
                <span className={styles.specIcon}>ϟ</span>
                REAL-TIME OFFERS
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
