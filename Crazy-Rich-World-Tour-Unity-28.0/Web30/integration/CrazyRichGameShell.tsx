"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function CrazyRichGameShell() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const syncStandalone = () =>
      setStandalone(media.matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
    syncStandalone();
    media.addEventListener?.("change", syncStandalone);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      media.removeEventListener?.("change", syncStandalone);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
  };

  return (
    <main
      style={{
        position: "relative",
        margin: 0,
        width: "100%",
        height: "100dvh",
        overflow: "hidden",
        background: "#071525",
      }}
    >
      {!standalone && installPrompt ? (
        <button
          type="button"
          onClick={install}
          aria-label="Pasang Crazy Rich sebagai aplikasi"
          style={{
            position: "absolute",
            zIndex: 20,
            top: 12,
            right: 12,
            minHeight: 44,
            padding: "0 16px",
            border: "2px solid rgba(255,255,255,.9)",
            borderRadius: 999,
            background: "linear-gradient(180deg,#ffe98d,#f5bd37)",
            color: "#533800",
            fontWeight: 900,
            boxShadow: "0 8px 22px rgba(0,0,0,.28)",
            cursor: "pointer",
          }}
        >
          PASANG APP
        </button>
      ) : null}

      <iframe
        title="Crazy Rich: World Tour"
        src="/games/crazy-rich-world-tour/client/PLAY-Crazy-Rich-World-Tour-Launcher.html"
        allow="autoplay; fullscreen; gamepad"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
    </main>
  );
}
