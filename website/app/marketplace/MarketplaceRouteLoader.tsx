"use client";

import { useEffect, useState } from "react";
import MarketplaceLoadingView from "./MarketplaceLoadingView";

const STORAGE_KEY = "comeplayers-marketplace-loader-progress";

export default function MarketplaceRouteLoader() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    const duration = 2800;
    let animationFrame = 0;

    const update = (now: number) => {
      const ratio = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - ratio, 3);
      const nextProgress = Math.min(92, Math.round(eased * 92));

      setProgress(nextProgress);
      window.sessionStorage.setItem(STORAGE_KEY, String(nextProgress));

      if (ratio < 1) {
        animationFrame = window.requestAnimationFrame(update);
      }
    };

    animationFrame = window.requestAnimationFrame(update);

    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  return <MarketplaceLoadingView progress={progress} />;
}
