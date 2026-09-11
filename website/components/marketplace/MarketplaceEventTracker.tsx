"use client";

import { useEffect, useRef } from "react";
import {
  MarketplaceEventPayload,
  trackMarketplaceEvent,
} from "@/lib/marketplace-events-client";

export default function MarketplaceEventTracker(payload: MarketplaceEventPayload) {
  const trackedKeyRef = useRef("");

  useEffect(() => {
    const key = JSON.stringify(payload);
    if (trackedKeyRef.current === key) return;

    trackedKeyRef.current = key;
    trackMarketplaceEvent(payload);
  }, [payload]);

  return null;
}
