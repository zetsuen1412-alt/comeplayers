"use client";

import { useEffect } from "react";

const CHECK_INTERVAL_MS = 2 * 60 * 1000;
const DEFERRED_PATH_PREFIXES = [
  "/cpcommunity",
  "/messages",
  "/chat",
  "/comeplayers",
  "/checkout",
  "/payment",
  "/order/",
  "/support/",
  "/resolution-center/",
];

type VersionResponse = {
  release?: string;
};

function canRefreshNow() {
  if (document.visibilityState !== "visible") return false;

  const path = window.location.pathname;
  if (DEFERRED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return false;
  }

  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  ) {
    return false;
  }

  return !document.querySelector('[aria-modal="true"]');
}

export default function DeploymentAutoRefresh() {
  useEffect(() => {
    let disposed = false;
    let checking = false;
    let currentRelease = "";
    let pendingRelease = "";
    let controller: AbortController | undefined;

    async function checkForDeployment() {
      if (disposed || checking || !navigator.onLine || document.visibilityState !== "visible") return;
      checking = true;
      const request = new AbortController();
      controller = request;
      const timeout = setTimeout(() => request.abort(), 10_000);

      try {
        const response = await fetch("/api/app-version", {
          cache: "no-store",
          headers: { "x-comeplayers-update-check": "1" },
          signal: request.signal,
        });
        if (!response.ok) return;

        const data = (await response.json()) as VersionResponse;
        if (disposed || request.signal.aborted) return;
        const nextRelease = String(data.release || "").trim();
        if (!nextRelease) return;

        if (!currentRelease) {
          currentRelease = nextRelease;
          return;
        }

        if (nextRelease !== currentRelease) {
          pendingRelease = nextRelease;
        }

        if (pendingRelease && canRefreshNow()) {
          currentRelease = pendingRelease;
          pendingRelease = "";
          window.location.reload();
        }
      } catch {
        // A failed update check must never interrupt browsing or payments.
      } finally {
        clearTimeout(timeout);
        if (controller === request) controller = undefined;
        checking = false;
      }
    }

    function checkWhenActive() {
      if (document.visibilityState === "visible") {
        void checkForDeployment();
      }
    }

    void checkForDeployment();
    const interval = window.setInterval(
      () => void checkForDeployment(),
      CHECK_INTERVAL_MS
    );
    window.addEventListener("focus", checkWhenActive);
    window.addEventListener("online", checkWhenActive);
    window.addEventListener("popstate", checkWhenActive);
    document.addEventListener("visibilitychange", checkWhenActive);

    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", checkWhenActive);
      window.removeEventListener("online", checkWhenActive);
      window.removeEventListener("popstate", checkWhenActive);
      document.removeEventListener("visibilitychange", checkWhenActive);
    };
  }, []);

  return null;
}
