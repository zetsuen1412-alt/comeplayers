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

  const url = new URL(baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`);
  if (
    !import.meta.env.DEV &&
    (url.protocol !== "https:" ||
      url.hostname !== "www.comeplayers.com" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "")
  ) {
    throw new Error("Alamat aplikasi produksi ComePlayers tidak valid.");
  }
  url.searchParams.set("source", "desktop-app");
  url.searchParams.set("shell", "tauri");
  return url.toString();
}

async function waitForWebsite(url: string): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    // A no-CORS request only checks connectivity. The website remains responsible
    // for authentication and its own content; no response body is read here.
    await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function resolveLaunchUrl(defaultUrl: string): Promise<string> {
  if (!("__TAURI_INTERNALS__" in window)) return defaultUrl;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const pendingUrl = await invoke<string | null>("take_pending_navigation_url");
    if (!pendingUrl) return defaultUrl;
    const parsed = new URL(pendingUrl);
    if (
      parsed.protocol === "https:" &&
      parsed.hostname === "www.comeplayers.com" &&
      parsed.port === "" &&
      parsed.username === "" &&
      parsed.password === ""
    ) {
      return parsed.toString();
    }
  } catch (reason) {
    console.warn("[ComePlayers] Could not read the opening link", reason);
  }
  return defaultUrl;
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
  const target = useMemo(() => {
    try {
      return { url: createAppUrl(), error: null };
    } catch (reason) {
      return {
        url: null,
        error: reason instanceof Error ? reason.message : "Konfigurasi aplikasi tidak valid.",
      };
    }
  }, []);
  const usesStoreUpdates = import.meta.env.VITE_COMEPLAYERS_DISTRIBUTION === "store";
  const [state, setState] = useState<LaunchState>("checking");
  const [message, setMessage] = useState(
    usesStoreUpdates
      ? "Opening the ComePlayers desktop application..."
      : "Checking for application updates..."
  );
  const [progress, setProgress] = useState<number | null>(null);
  const [navigationFailed, setNavigationFailed] = useState(false);

  const openComePlayers = useCallback(async () => {
    if (!target.url) {
      setState("error");
      setMessage(target.error || "Konfigurasi aplikasi tidak valid.");
      setNavigationFailed(false);
      return;
    }
    setNavigationFailed(false);
    setState("opening");
    setMessage("Menghubungkan ke ComePlayers...");
    setProgress(null);
    try {
      await waitForWebsite(target.url);
      const launchUrl = await resolveLaunchUrl(target.url);
      window.location.replace(launchUrl);
    } catch (reason) {
      console.warn("[ComePlayers] Website is unavailable", reason);
      setState("error");
      setMessage("Belum dapat terhubung. Periksa internet Anda lalu coba lagi.");
      setNavigationFailed(true);
    }
  }, [target]);

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
            Coba lagi
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
