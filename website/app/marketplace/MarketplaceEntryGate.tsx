"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import MarketplaceLoadingView from "./MarketplaceLoadingView";
import styles from "./marketplace-loading.module.css";

const STORAGE_KEY = "comeplayers-marketplace-loader-progress";
const MINIMUM_FULL_LOAD_MS = 3400;
const FINAL_HOLD_MS = 450;

export default function MarketplaceEntryGate({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedValue = Number(window.sessionStorage.getItem(STORAGE_KEY));
    const initialProgress = Number.isFinite(storedValue)
      ? Math.max(0, Math.min(92, storedValue))
      : 0;

    setProgress(initialProgress);

    const remainingRatio = (100 - initialProgress) / 100;
    const duration = Math.max(900, MINIMUM_FULL_LOAD_MS * remainingRatio);
    const startedAt = performance.now();
    let animationFrame = 0;
    let completionTimer = 0;

    const update = (now: number) => {
      const ratio = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - ratio, 3);
      const nextProgress = Math.min(
        100,
        Math.round(initialProgress + (100 - initialProgress) * eased),
      );

      setProgress(nextProgress);
      window.sessionStorage.setItem(STORAGE_KEY, String(nextProgress));

      if (ratio < 1) {
        animationFrame = window.requestAnimationFrame(update);
        return;
      }

      setProgress(100);
      window.sessionStorage.setItem(STORAGE_KEY, "100");
      completionTimer = window.setTimeout(() => {
        window.sessionStorage.removeItem(STORAGE_KEY);
        setReady(true);
      }, FINAL_HOLD_MS);
    };

    animationFrame = window.requestAnimationFrame(update);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(completionTimer);
    };
  }, []);

  if (!ready) {
    return <MarketplaceLoadingView progress={progress} />;
  }

  return <div className={styles.marketplaceReveal}>{children}</div>;
}
