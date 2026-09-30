"use client";

import dynamic from "next/dynamic";

import {
  type ComponentType,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FaArrowLeft,
  FaBuilding,
  FaChessKing,
  FaChessRook,
  FaCompress,
  FaCrosshairs,
  FaExpand,
  FaGamepad,
  FaGun,
  FaMinus,
  FaStaffSnake,
  FaXmark,
} from "react-icons/fa6";
import type { ArcadeGameProps } from "@/components/arcade/ArcadeGameTypes";
const ComePlayersChessGame = dynamic<ArcadeGameProps>(() => import("@/components/arcade/ComePlayersChessGame"), { ssr: false });
const ComePlayersMonopolyV21ArcadeGame = dynamic<ArcadeGameProps>(() => import("@/components/arcade/ComePlayersMonopolyV21ArcadeGame"), { ssr: false });
const ComePlayersSnakeGame = dynamic<ArcadeGameProps>(() => import("@/components/arcade/ComePlayersSnakeGame"), { ssr: false });
const ComePlayersStrikeArcadeGame = dynamic<ArcadeGameProps>(() => import("@/components/arcade/ComePlayersStrikeArcadeGame"), { ssr: false });
const CPFrontlineGame = dynamic<ArcadeGameProps>(() => import("@/components/arcade/CPFrontlineGame"), { ssr: false });
const EmpiresAlliesGame = dynamic<ArcadeGameProps>(() => import("@/components/arcade/EmpiresAlliesGame"), { ssr: false });

export type ArcadeGameId =
  | "empires-allies"
  | "cp-frontline"
  | "comeplayers-strike"
  | "comeplayers-snake"
  | "comeplayers-chess"
  | "comeplayers-monopoly";

export type ArcadeWindowGame = {
  id: ArcadeGameId;
  title: string;
  category: string;
  description: string;
  controls: string;
  icon: ComponentType<{ className?: string }>;
  component: ComponentType<ArcadeGameProps>;
};

export const ARCADE_WINDOW_GAMES: ArcadeWindowGame[] = [
  {
    id: "comeplayers-strike",
    title: "ComePlayers Strike",
    category: "Browser FPS • Black Core 0.4 / Bots",
    description:
      "Fight across the Black Core district in five modes, including eight-wave Zombie Survival and a seven-chapter Adventure with checkpoints, generators, extraction, special infected, and a three-phase Colossus.",
    controls:
      "Keyboard + mouse • pointer lock • fullscreen • WebGL",
    icon: FaGun,
    component: ComePlayersStrikeArcadeGame,
  },
  {
    id: "cp-frontline",
    title: "CP Frontline: World Dominion",
    category: "Online War Strategy • Campaign / Allied PvP",
    description:
      "Lead Alexia's combined-arms command, conquer six cinematic sectors, upgrade your arsenal, and launch asynchronous attacks against ComePlayers friends.",
    controls:
      "Mouse/touch • click battlefield to rally • online autosave • friend attacks",
    icon: FaCrosshairs,
    component: CPFrontlineGame,
  },
  {
    id: "empires-allies",
    title: "CP Empires & Allies",
    category: "Online Empire Strategy • ComePlayers Campaign",
    description:
      "Build a persistent online island empire, manage resources, train land, naval, and air forces, visit allies, and battle from any device through ComePlayers.",
    controls: "Mouse/touch • online saves • allies and PvP • Ruffle",
    icon: FaChessRook,
    component: EmpiresAlliesGame,
  },
  {
    id: "comeplayers-snake",
    title: "CP Snake: Neon Rush",
    category: "Realtime Survival • Online / Solo",
    description:
      "Grow, boost, cut off rivals, and dominate a glowing ComePlayers arena inspired by classic online snake battles.",
    controls: "Pointer/touch steering • hold click or Space to boost • public rooms",
    icon: FaStaffSnake,
    component: ComePlayersSnakeGame,
  },
  {
    id: "comeplayers-monopoly",
    title: "CP Monopoly",
    category: "Marble World V22 • 4 Players / Bots",
    description:
      "Play on a redesigned isometric board with animated movement, turn order, build tiers, group rent bonuses, World Tour destinations, and four complete player teams.",
    controls: "Mouse/touch • Alexia + 3 bots • turn timer • fullscreen",
    icon: FaBuilding,
    component: ComePlayersMonopolyV21ArcadeGame,
  },
  {
    id: "comeplayers-chess",
    title: "CP Chess",
    category: "Tactical Strategy • Online / NPC",
    description:
      "Play ComePlayers-themed chess against Alexia NPC or challenge another ComePlayers user online.",
    controls: "Mouse/touch • Alexia NPC • public rooms • matchmaking",
    icon: FaChessKing,
    component: ComePlayersChessGame,
  },
];

const SCORE_STORAGE_KEY = "comeplayers_arcade_scores_v1";

type ArcadeWindowProps = {
  open: boolean;
  initialGameId: ArcadeGameId | null;
  onClose: () => void;
};

export default function ArcadeWindow({
  open,
  initialGameId,
  onClose,
}: ArcadeWindowProps) {
  const [activeGameId, setActiveGameId] = useState<ArcadeGameId | null>(
    initialGameId,
  );
  const [scores, setScores] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = window.localStorage.getItem(SCORE_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || minimized) return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [minimized, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const activeGame = useMemo(
    () => ARCADE_WINDOW_GAMES.find((game) => game.id === activeGameId) || null,
    [activeGameId],
  );

  const immersiveGame =
    activeGameId === "comeplayers-strike" ||
    activeGameId === "cp-frontline" ||
    activeGameId === "empires-allies" ||
    activeGameId === "comeplayers-monopoly" ||
    activeGameId === "comeplayers-chess" ||
    activeGameId === "comeplayers-snake";
  const fullFrameGame =
    activeGameId === "comeplayers-strike" ||
    activeGameId === "comeplayers-monopoly" ||
    activeGameId === "empires-allies" ||
    activeGameId === "cp-frontline";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (contentScrollRef.current) {
        contentScrollRef.current.scrollTop = 0;
        contentScrollRef.current.scrollLeft = 0;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeGameId, maximized]);

  function saveScore(gameId: ArcadeGameId, score: number) {
    const safeScore = Math.max(0, Math.round(score));
    setScores((current) => {
      if (safeScore <= Number(current[gameId] || 0)) return current;
      const next = { ...current, [gameId]: safeScore };
      try {
        window.localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Local storage can be unavailable inside private or restricted webviews.
      }
      return next;
    });
  }

  if (!open) return null;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-5 right-5 z-[260] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-cyan-300/40 bg-[#061421]/95 px-4 py-3 text-left shadow-[0_20px_55px_rgba(0,0,0,0.65),0_0_24px_rgba(34,211,238,0.14)] backdrop-blur-xl transition hover:border-yellow-300/60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-300/15 text-cyan-200">
          <FaGamepad />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-black uppercase tracking-[0.16em] text-cyan-300">
            Arcade game minimized
          </span>
          <span className="block truncate text-sm font-bold text-white">
            {activeGame?.title || "Choose a ComePlayers game"}
          </span>
        </span>
      </button>
    );
  }

  const ActiveGameComponent = activeGame?.component;

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 p-2 backdrop-blur-[3px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ComePlayers Arcade"
    >
      <section
        className={`flex overflow-hidden border border-cyan-400/30 bg-[#030b14] shadow-[0_30px_100px_rgba(0,0,0,0.8),0_0_45px_rgba(34,211,238,0.1)] transition-all ${
          maximized
            ? "h-full w-full rounded-none"
            : immersiveGame
              ? "h-[min(900px,calc(100dvh-1rem))] w-[min(1480px,calc(100vw-1rem))] rounded-2xl sm:h-[min(900px,calc(100dvh-2rem))] sm:w-[min(1480px,calc(100vw-2rem))]"
              : "h-[min(820px,calc(100dvh-1rem))] w-[min(1180px,calc(100vw-1rem))] rounded-2xl sm:h-[min(820px,calc(100dvh-2rem))] sm:w-[min(1180px,calc(100vw-2rem))]"
        }`}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-cyan-400/20 bg-[#061421]/95 px-3 sm:px-5">
            <button
              type="button"
              onClick={() => setActiveGameId(null)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-200"
              title="Game library"
              aria-label="Open game library"
            >
              {activeGame ? <FaArrowLeft /> : <FaGamepad />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">
                ComePlayers Arcade
              </p>
              <p className="truncate text-sm font-black text-white sm:text-base">
                {activeGame?.title || "Choose a ComePlayers game"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMinimized(true)}
                className="hidden h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-200 sm:flex"
                title="Minimize"
                aria-label="Minimize arcade"
              >
                <FaMinus />
              </button>
              <button
                type="button"
                onClick={() => setMaximized((current) => !current)}
                className="hidden h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-200 sm:flex"
                title={maximized ? "Restore window" : "Maximize"}
                aria-label={maximized ? "Restore arcade window" : "Maximize arcade"}
              >
                {maximized ? <FaCompress /> : <FaExpand />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-400/20 bg-red-400/10 text-red-200 transition hover:border-red-300/60 hover:bg-red-400/20"
                title="Close"
                aria-label="Close arcade"
              >
                <FaXmark />
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            {!fullFrameGame ? (
            <aside className="hidden w-60 shrink-0 flex-col overflow-hidden border-r border-cyan-400/15 bg-[#05111d] xl:flex">
              <div className="shrink-0 border-b border-cyan-400/15 bg-[#071725] p-4">
                <p className="px-1 text-[10px] font-black uppercase tracking-[0.22em] text-yellow-300">
                  ComePlayers games
                </p>
                <p className="mt-1 px-1 text-xs leading-relaxed text-slate-500">
                  Play Strike, CP Frontline, Empires & Allies, Snake, Chess, and Monopoly without leaving Messages & Chat or the desktop app.
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="space-y-2">
                  {ARCADE_WINDOW_GAMES.map((game) => {
                    const Icon = game.icon;
                    const selected = game.id === activeGameId;
                    return (
                      <button
                        key={game.id}
                        type="button"
                        onClick={() => setActiveGameId(game.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-4 text-left transition ${
                          selected
                            ? "border-yellow-300/55 bg-yellow-300/12 text-yellow-50 shadow-[0_0_22px_rgba(250,204,21,0.08)]"
                            : "border-white/10 bg-white/[0.03] text-slate-200 hover:border-cyan-300/40 hover:bg-cyan-300/[0.08] hover:text-white"
                        }`}
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            selected
                              ? "bg-yellow-300/20 text-yellow-200"
                              : "bg-cyan-300/10 text-cyan-300/80"
                          }`}
                        >
                          <Icon />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black">
                            {game.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[9px] font-bold uppercase tracking-wider text-slate-500">
                            {game.category}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>
            ) : null}

            <div
              ref={contentScrollRef}
              className={`min-h-0 min-w-0 flex-1 overflow-x-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.09),transparent_35%),#020811] ${
                fullFrameGame ? "overflow-y-hidden" : "overflow-y-auto"
              }`}
            >
              {activeGame && ActiveGameComponent ? (
                <div
                  className={`mx-auto w-full ${
                    fullFrameGame
                      ? "h-full min-h-0 max-w-none p-0"
                      : immersiveGame
                        ? "max-w-[1400px] p-2 sm:p-3 lg:p-4"
                        : "max-w-4xl p-3 sm:p-5 lg:p-7"
                  }`}
                >
                  {!immersiveGame ? (
                    <div className="mb-4 rounded-2xl border border-white/10 bg-[#07131f]/80 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <p className="text-xl font-black text-white">
                          {activeGame.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          {activeGame.description}
                        </p>
                      </div>
                      <div className="mt-3 shrink-0 rounded-xl border border-yellow-400/20 bg-yellow-400/10 px-3 py-2 text-xs font-bold text-yellow-200 sm:mt-0">
                        {activeGame.controls}
                      </div>
                    </div>
                  ) : null}
                  <ActiveGameComponent
                    key={activeGame.id}
                    best={Number(scores[activeGame.id] || 0)}
                    onScore={(score) => saveScore(activeGame.id, score)}
                  />
                </div>
              ) : (
                <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
                  <div className="mb-6">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">
                      All games inside Messages
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
                      Choose your ComePlayers game
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm text-slate-400">
                      Every ComePlayers game opens above Messages & Chat, so the same library remains playable on the website and in the desktop app.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {ARCADE_WINDOW_GAMES.map((game) => {
                      const Icon = game.icon;
                      return (
                        <button
                          key={game.id}
                          type="button"
                          onClick={() => setActiveGameId(game.id)}
                          className="group rounded-2xl border border-white/10 bg-[#07131f]/78 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/45 hover:bg-cyan-300/8"
                        >
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-lg text-cyan-200 transition group-hover:border-yellow-300/40 group-hover:bg-yellow-300/10 group-hover:text-yellow-200">
                            <Icon />
                          </span>
                          <span className="mt-4 block text-base font-black text-white">
                            {game.title}
                          </span>
                          <span className="mt-1 block text-[10px] font-black uppercase tracking-wider text-cyan-400/75">
                            {game.category}
                          </span>
                          <span className="mt-2 block text-xs leading-relaxed text-slate-500">
                            {game.description}
                          </span>
                          <span className="mt-4 block text-xs font-black text-yellow-200">
                            Play now →
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
