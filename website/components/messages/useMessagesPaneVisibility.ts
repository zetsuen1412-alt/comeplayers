"use client";

import { useSyncExternalStore } from "react";

const compactQuery = "(max-width: 1023px)";
function snapshot() {
  if (document.visibilityState !== "visible") return "hidden";
  return window.matchMedia(compactQuery).matches ? "compact" : "wide";
}
function subscribe(changed: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", changed);
  document.addEventListener("visibilitychange", changed);
  return () => {
    media.removeEventListener("change", changed);
    document.removeEventListener("visibilitychange", changed);
  };
}

/** Match the CSS pane breakpoint, including resize and browser tab visibility. */
export function useMessagesPaneVisibility(mobileInboxOpen: boolean, homeOpen: boolean) {
  const viewport = useSyncExternalStore(subscribe, snapshot, () => "hidden");
  return viewport !== "hidden" && !homeOpen && (viewport !== "compact" || !mobileInboxOpen);
}
