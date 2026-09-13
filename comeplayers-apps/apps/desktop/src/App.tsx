import { useCallback, useEffect, useMemo, useState } from "react";

type LaunchState =
  | "checking"
  | "downloading"
  | "installing"
  | "opening"
  | "error";

type UpdateProgress = {
  state: LaunchState;
  message: string;
  progress: number | null;
};

function optional(value: string | undefined): string {
  return String(value || "").trim().replace(/\/$/, "");
}

function createAppUrl(): string {
  const baseUrl = import.meta.env.DEV
    ? optional(import.meta.env.VITE_COMEPLAYERS_DEV_URL) ||
      "http://localhost:3000"
    : optional(import.meta.env.VITE_COMEPLAYERS_WEB_URL) ||
      optional(import.meta.env.VITE_COMEPLAYERS_API_URL) ||
      "https://www.comeplayers.com";

  if (!import.meta.env.DEV && !baseUrl.startsWith("https://")) {
    throw new Error("The production desktop app requires a secure HTTPS URL.");
  }

  const url = new URL(baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`);
  url.searchParams.set("source", "desktop-app");
  url.searchParams.set("shell", "tauri");
  return url.toString();
}

async function runAutomaticDesktopUpdate(
  onProgress: (progress: UpdateProgress) => void
): Promise<"ready" | "failed" | "restarting"> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return "ready";
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const { relaunch } = await import("@tauri-apps/plugin-process");

    onProgress({
      state: "checking",
      message: "Checking for the latest ComePlayers version...",
      progress: null,
    });

    const update = await check({ timeout: 20_000 });
    if (!update) return "ready";

    let downloaded = 0;
    let contentLength = 0;

    onProgress({
      state: "downloading",
      message: `Downloading ComePlayers ${update.version} update...`,
      progress: 0,
    });

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started": {
          contentLength = Number(event.data.contentLength || 0);
          downloaded = 0;
          onProgress({
            state: "downloading",
            message: `Downloading ComePlayers ${update.version} update...`,
            progress: contentLength > 0 ? 0 : null,
          });
          break;
        }
        case "Progress": {
          downloaded += Number(event.data.chunkLength || 0);
          const progress =
            contentLength > 0
              ? Math.min(100, Math.max(0, (downloaded / contentLength) * 100))
              : null;
          onProgress({
            state: "downloading",
            message:
              progress === null
                ? `Downloading ComePlayers ${update.version} update...`
                : `Downloading update ${Math.round(progress)}%...`,
            progress,
          });
          break;
        }
        case "Finished": {
          onProgress({
            state: "installing",
            message: "Download complete. Installing the update automatically...",
            progress: 100,
          });
          break;
        }
      }
    });

    onProgress({
      state: "installing",
      message: "Update complete. Reopening ComePlayers...",
      progress: 100,
    });
    await relaunch();
    return "restarting";
  } catch (reason) {
    console.warn(
      "[ComePlayers] Automatic desktop update failed:",
      reason instanceof Error ? reason.message : reason
    );
    return "failed";
  }
}

export default function App() {
  const targetUrl = useMemo(createAppUrl, []);
  const usesStoreUpdates = import.meta.env.VITE_COMEPLAYERS_DISTRIBUTION === "store";
  const [state, setState] = useState<LaunchState>("checking");
  const [message, setMessage] = useState(
    usesStoreUpdates
      ? "Opening the ComePlayers desktop application..."
      : "Checking for application updates..."
  );
  const [progress, setProgress] = useState<number | null>(null);
  const [navigationFailed, setNavigationFailed] = useState(false);

  const openComePlayers = useCallback(() => {
    setNavigationFailed(false);
    setState("opening");
    setMessage("Opening the latest ComePlayers experience...");
    setProgress(null);
    window.setTimeout(() => {
      try {
        window.location.replace(targetUrl);
      } catch (reason) {
        console.error("[ComePlayers] Website navigation failed", reason);
        setState("error");
        setMessage("ComePlayers could not open the website experience.");
        setNavigationFailed(true);
      }
    }, 180);
  }, [targetUrl]);

  useEffect(() => {
    let cancelled = false;

    const launch = async () => {
      if (usesStoreUpdates) {
        openComePlayers();
        return;
      }

      const result = await runAutomaticDesktopUpdate((next) => {
        if (cancelled) return;
        setState(next.state);
        setMessage(next.message);
        setProgress(next.progress);
      });

      if (cancelled || result === "restarting") return;
      if (result === "failed") {
        setState("error");
        setMessage(
          "The update check was unsuccessful. ComePlayers will still open and try again at the next startup."
        );
        await new Promise((resolve) => window.setTimeout(resolve, 1_200));
        if (!cancelled) openComePlayers();
        return;
      }
      openComePlayers();
    };

    void launch();
    return () => {
      cancelled = true;
    };
  }, [openComePlayers, usesStoreUpdates]);

  return (
    <main className="launch-screen">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="launch-card" aria-live="polite">
        <div className="brand-mark" aria-hidden="true">
          <span>C</span>
          <span>P</span>
        </div>
        <p className="eyebrow">COMEPLAYERS DESKTOP</p>
        <h1>Play. Trade. Connect.</h1>
        <p className="launch-message">{message}</p>

        {progress !== null ? (
          <div className="progress-shell" aria-label={`Update ${Math.round(progress)}%`}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        ) : state !== "error" ? (
          <div className="loader" aria-label="Loading">
            <i />
            <i />
            <i />
          </div>
        ) : null}

        {navigationFailed ? (
          <button type="button" onClick={openComePlayers}>
            Try Again
          </button>
        ) : null}

        <p className="launch-hint">
          {usesStoreUpdates
            ? "Aplikasi desktop resmi ComePlayers. Pembaruan keamanan dikelola oleh Microsoft Store."
            : "Aplikasi desktop resmi ComePlayers. Pembaruan keamanan diperiksa otomatis setiap kali aplikasi dibuka."}
        </p>
      </section>
    </main>
  );
}
