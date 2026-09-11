"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Application } from "pixi.js";
import {
  FaAward,
  FaBolt,
  FaCoins,
  FaCrosshairs,
  FaCubes,
  FaExplosion,
  FaGaugeHigh,
  FaGlobe,
  FaGun,
  FaHelicopter,
  FaLock,
  FaMedal,
  FaMicrochip,
  FaPersonMilitaryRifle,
  FaPlay,
  FaRankingStar,
  FaRobot,
  FaRocket,
  FaRotate,
  FaSatelliteDish,
  FaShieldHalved,
  FaStar,
  FaTruckField,
  FaUserGroup,
  FaWrench,
} from "react-icons/fa6";
import type { ArcadeGameProps } from "@/components/arcade/ArcadeGameTypes";
import {
  FrontlineEngine,
  FRONTLINE_WORLD_HEIGHT,
  FRONTLINE_WORLD_WIDTH,
  type FrontlineAbility,
  type FrontlineBattleSnapshot,
} from "@/components/arcade/cpFrontlineEngine";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import {
  applyFrontlineBattleResult,
  createDefaultFrontlineProgress,
  frontlinePower,
  FRONTLINE_MISSIONS,
  FRONTLINE_STORAGE_KEY,
  FRONTLINE_UNIT_DEFINITIONS,
  sanitizeFrontlineProgress,
  xpForNextLevel,
  type FrontlineBattleHistory,
  type FrontlineBattleResult,
  type FrontlineBootstrap,
  type FrontlineFriendTarget,
  type FrontlineMission,
  type FrontlineProgress,
  type FrontlineTechBranch,
  type FrontlineUnitKind,
} from "@/lib/cpFrontline";
import styles from "@/components/arcade/CPFrontlineGame.module.css";

type CommandTab = "command" | "campaign" | "arsenal" | "social";
type SaveStatus = "offline" | "saved" | "saving";
type CombatEvent = {
  id: number;
  message: string;
  tone: "info" | "good" | "danger";
};

const EMPTY_SNAPSHOT: FrontlineBattleSnapshot = {
  energy: 72,
  maxEnergy: 108,
  score: 0,
  kills: 0,
  unitsDeployed: 0,
  wave: 1,
  timeRemaining: 185,
  playerHqPercent: 100,
  enemyHqPercent: 100,
  alliedUnits: 2,
  enemyUnits: 3,
  overdriveSeconds: 0,
  cooldowns: { airstrike: 0, repair: 0, overdrive: 0 },
  status: "running",
};

const UNIT_ICONS: Record<FrontlineUnitKind, typeof FaTruckField> = {
  rifle: FaPersonMilitaryRifle,
  tank: FaTruckField,
  rocket: FaRocket,
  drone: FaHelicopter,
  medic: FaWrench,
  titan: FaRobot,
};

const TECH: Array<{
  branch: FrontlineTechBranch;
  title: string;
  description: string;
  icon: typeof FaGun;
}> = [
  {
    branch: "weapons",
    title: "Weapons Systems",
    description: "Increases allied damage and improves Overdrive fire rate.",
    icon: FaGun,
  },
  {
    branch: "armor",
    title: "Composite Armor",
    description: "Raises unit and command structure durability in every battle.",
    icon: FaShieldHalved,
  },
  {
    branch: "logistics",
    title: "Frontline Logistics",
    description: "Adds command energy, regeneration, and stronger field repairs.",
    icon: FaCubes,
  },
  {
    branch: "airSupport",
    title: "Air Superiority",
    description: "Improves precision strike damage and reduces its cooldown.",
    icon: FaHelicopter,
  },
];

const ACHIEVEMENT_LABELS: Record<string, string> = {
  "first-victory": "First Victory",
  "flawless-command": "Flawless Command",
  "century-guard": "Century Guard",
  "citadel-bound": "Citadel Bound",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: value >= 100_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const rest = Math.max(0, seconds) % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function localProgress() {
  if (typeof window === "undefined") return createDefaultFrontlineProgress();
  try {
    const stored = window.localStorage.getItem(FRONTLINE_STORAGE_KEY);
    return stored
      ? sanitizeFrontlineProgress(JSON.parse(stored))
      : createDefaultFrontlineProgress();
  } catch {
    return createDefaultFrontlineProgress();
  }
}

function newerProgress(local: FrontlineProgress, online: FrontlineProgress) {
  const localTime = new Date(local.updatedAt).getTime() || 0;
  const onlineTime = new Date(online.updatedAt).getTime() || 0;
  return localTime > onlineTime ? local : online;
}

export default function CPFrontlineGame({ onScore }: ArcadeGameProps) {
  const [progress, setProgress] = useState<FrontlineProgress>(localProgress);
  const [tab, setTab] = useState<CommandTab>("command");
  const [screen, setScreen] = useState<"command" | "battle">("command");
  const [selectedMission, setSelectedMission] = useState<FrontlineMission>(
    FRONTLINE_MISSIONS[0],
  );
  const [activeOpponent, setActiveOpponent] = useState<FrontlineFriendTarget | null>(null);
  const [friends, setFriends] = useState<FrontlineFriendTarget[]>([]);
  const [history, setHistory] = useState<FrontlineBattleHistory[]>([]);
  const [online, setOnline] = useState(false);
  const [onlineNotice, setOnlineNotice] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("offline");
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [result, setResult] = useState<FrontlineBattleResult | null>(null);
  const [snapshot, setSnapshot] = useState<FrontlineBattleSnapshot>(EMPTY_SNAPSHOT);
  const [events, setEvents] = useState<CombatEvent[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<FrontlineEngine | null>(null);
  const appRef = useRef<Application | null>(null);
  const eventCounterRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const bootstrappedRef = useRef(false);
  const progressRef = useRef(progress);
  const opponentRef = useRef(activeOpponent);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    opponentRef.current = activeOpponent;
  }, [activeOpponent]);

  useEffect(
    () => () => {
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== "closed") void context.close();
    },
    [],
  );

  const currentMission =
    FRONTLINE_MISSIONS.find(
      (mission) => mission.id === progress.campaignMission,
    ) || FRONTLINE_MISSIONS[FRONTLINE_MISSIONS.length - 1];

  const commandPower = useMemo(() => frontlinePower(progress), [progress]);
  const nextLevelXp = xpForNextLevel(progress.commanderLevel);
  const currentLevelBase = Math.max(
    0,
    (progress.commanderLevel - 1) * (progress.commanderLevel - 1) * 420,
  );
  const xpPercent = Math.min(
    100,
    ((progress.xp - currentLevelBase) /
      Math.max(1, nextLevelXp - currentLevelBase)) *
      100,
  );

  const playTone = useCallback(
    (tone: "info" | "good" | "danger" | "deploy" | "ability") => {
      if (!soundEnabled || typeof window === "undefined") return;
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }).webkitAudioContext;
        if (!AudioContextClass) return;
        const context = audioContextRef.current || new AudioContextClass();
        audioContextRef.current = context;
        if (context.state === "suspended") void context.resume();
        const now = context.currentTime;
        const settings = {
          info: [230, 390, 0.09, 0.028],
          good: [360, 720, 0.16, 0.04],
          danger: [180, 72, 0.22, 0.045],
          deploy: [190, 470, 0.11, 0.035],
          ability: [280, 920, 0.24, 0.055],
        }[tone];
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = tone === "danger" ? "sawtooth" : "triangle";
        oscillator.frequency.setValueAtTime(settings[0], now);
        oscillator.frequency.exponentialRampToValueAtTime(settings[1], now + settings[2]);
        gain.gain.setValueAtTime(settings[3], now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + settings[2]);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + settings[2] + 0.02);
      } catch {
        // Audio is decorative and can be blocked by embedded browser policies.
      }
    },
    [soundEnabled],
  );

  const pushEvent = useCallback(
    (message: string, tone: CombatEvent["tone"]) => {
      eventCounterRef.current += 1;
      setEvents((current) => [
        { id: eventCounterRef.current, message, tone },
        ...current,
      ].slice(0, 5));
      playTone(tone);
    },
    [playTone],
  );

  const loadOnlineData = useCallback(async () => {
    try {
      const data = await authenticatedFetchJson<FrontlineBootstrap>(
        "/api/games/cp-frontline",
      );
      setOnline(true);
      setSaveStatus("saved");
      setFriends(data.friends || []);
      setHistory(data.history || []);
      setProgress((current) => newerProgress(current, data.profile));
      setOnlineNotice("");
    } catch (error) {
      setOnline(false);
      setSaveStatus("offline");
      const message = error instanceof Error ? error.message : "Online command link unavailable.";
      setOnlineNotice(
        message.includes("arcade_frontline") || message.includes("503")
          ? "Online CP Frontline storage is not installed yet. Campaign training and local autosave remain available."
          : "Playing in offline training mode. Sign in to sync progress and attack ComePlayers friends.",
      );
    } finally {
      bootstrappedRef.current = true;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOnlineData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOnlineData]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        FRONTLINE_STORAGE_KEY,
        JSON.stringify(progress),
      );
    } catch {
      // Continue with in-memory progress in restricted webviews.
    }
    if (!online || !bootstrappedRef.current) return;
    setSaveStatus("saving");
    const timer = window.setTimeout(() => {
      void authenticatedFetchJson<{ saved: boolean }>(
        "/api/games/cp-frontline",
        {
          method: "PUT",
          body: JSON.stringify({ progress }),
        },
      )
        .then(() => setSaveStatus("saved"))
        .catch(() => setSaveStatus("offline"));
    }, 850);
    return () => window.clearTimeout(timer);
  }, [online, progress]);

  const recordBattle = useCallback(
    async (battle: FrontlineBattleResult, defenderId: string | null) => {
      if (!online) return;
      try {
        await authenticatedFetchJson<{ recorded: boolean }>(
          "/api/games/cp-frontline",
          {
            method: "POST",
            body: JSON.stringify({
              action: "record-battle",
              eventId:
                typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `frontline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              defenderId,
              result: battle,
            }),
          },
        );
      } catch (error) {
        setOnlineNotice(
          error instanceof Error
            ? error.message
            : "Battle completed, but the online battle log could not be updated.",
        );
      }
    },
    [online],
  );

  useEffect(() => {
    if (screen !== "battle" || briefingOpen || !canvasHostRef.current || result) {
      return;
    }
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let pointerTarget: HTMLCanvasElement | null = null;
    let pointerHandler: ((event: PointerEvent) => void) | null = null;
    const host = canvasHostRef.current;

    void (async () => {
      const { Application: PixiApplication, Container, Graphics } = await import(
        "pixi.js"
      );
      if (cancelled) return;
      const app = new PixiApplication();
      await app.init({
        background: "#02070c",
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 1.75),
        resizeTo: host,
      });
      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }

      host.replaceChildren(app.canvas);
      appRef.current = app;
      const world = new Container();
      const staticGraphics = new Graphics();
      const dynamicGraphics = new Graphics();
      world.addChild(staticGraphics, dynamicGraphics);
      app.stage.addChild(world);

      const engine = new FrontlineEngine({
        mission: selectedMission,
        progress: progressRef.current,
        opponentPower: opponentRef.current?.power || 0,
        onEvent: pushEvent,
        onComplete: (battle) => {
          setResult(battle);
          setSnapshot(engine.getSnapshot());
          setProgress((current) =>
            applyFrontlineBattleResult(
              current,
              battle,
              selectedMission.reward,
            ),
          );
          onScore(battle.score);
          playTone(battle.result === "victory" ? "good" : "danger");
          void recordBattle(battle, opponentRef.current?.id || null);
        },
      });
      engineRef.current = engine;
      engine.drawStatic(staticGraphics);
      engine.drawDynamic(dynamicGraphics);
      setSnapshot(engine.getSnapshot());
      let scale = 1;
      let offsetX = 0;
      let offsetY = 0;
      const fitWorld = () => {
        scale = Math.min(
          app.screen.width / FRONTLINE_WORLD_WIDTH,
          app.screen.height / FRONTLINE_WORLD_HEIGHT,
        );
        offsetX = (app.screen.width - FRONTLINE_WORLD_WIDTH * scale) / 2;
        offsetY = (app.screen.height - FRONTLINE_WORLD_HEIGHT * scale) / 2;
        world.scale.set(scale);
        world.position.set(offsetX, offsetY);
      };
      fitWorld();
      resizeObserver = new ResizeObserver(fitWorld);
      resizeObserver.observe(host);

      const onPointerDown = (event: PointerEvent) => {
        const bounds = app.canvas.getBoundingClientRect();
        const renderedX =
          ((event.clientX - bounds.left) / Math.max(1, bounds.width)) *
          app.screen.width;
        const renderedY =
          ((event.clientY - bounds.top) / Math.max(1, bounds.height)) *
          app.screen.height;
        const x = (renderedX - offsetX) / scale;
        const y = (renderedY - offsetY) / scale;
        if (
          x >= 0 &&
          x <= FRONTLINE_WORLD_WIDTH &&
          y >= 0 &&
          y <= FRONTLINE_WORLD_HEIGHT
        ) {
          engine.issueMove(x, y);
        }
      };
      app.canvas.addEventListener("pointerdown", onPointerDown);
      pointerTarget = app.canvas;
      pointerHandler = onPointerDown;

      let lastSnapshot = 0;
      const tick = (ticker: { deltaMS: number }) => {
        engine.update(ticker.deltaMS / 1000);
        engine.drawDynamic(dynamicGraphics);
        const now = performance.now();
        if (now - lastSnapshot > 180) {
          lastSnapshot = now;
          setSnapshot(engine.getSnapshot());
        }
      };
      app.ticker.add(tick);
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (pointerTarget && pointerHandler) {
        pointerTarget.removeEventListener("pointerdown", pointerHandler);
      }
      engineRef.current = null;
      const app = appRef.current;
      appRef.current = null;
      if (app) app.destroy(true, { children: true });
    };
  }, [briefingOpen, onScore, playTone, pushEvent, recordBattle, result, screen, selectedMission]);

  function startMission(
    mission: FrontlineMission,
    opponent: FrontlineFriendTarget | null = null,
  ) {
    if (!opponent && mission.id > progress.campaignMission) return;
    setSelectedMission(mission);
    setActiveOpponent(opponent);
    setSnapshot({
      ...EMPTY_SNAPSHOT,
      timeRemaining: mission.durationSeconds,
      maxEnergy: 100 + progress.tech.logistics * 8,
      energy: Math.round((100 + progress.tech.logistics * 8) * 0.72),
    });
    setEvents([]);
    setResult(null);
    setBriefingOpen(true);
    setScreen("battle");
  }

  function deploy(kind: FrontlineUnitKind) {
    if (engineRef.current?.deploy(kind)) {
      playTone("deploy");
      setSnapshot(engineRef.current.getSnapshot());
    } else {
      playTone("danger");
    }
  }

  function activateAbility(ability: FrontlineAbility) {
    if (engineRef.current?.useAbility(ability)) {
      playTone("ability");
      setSnapshot(engineRef.current.getSnapshot());
    }
  }

  function returnToCommand() {
    setScreen("command");
    setBriefingOpen(false);
    setResult(null);
    setActiveOpponent(null);
    setTab("command");
    if (online) void loadOnlineData();
  }

  function claimDailyReward() {
    if (progress.dailyClaimDate === todayKey()) return;
    setProgress((current) =>
      sanitizeFrontlineProgress({
        ...current,
        resources: {
          credits: current.resources.credits + 700,
          alloy: current.resources.alloy + 90,
          intel: current.resources.intel + 25,
        },
        dailyClaimDate: todayKey(),
        updatedAt: new Date().toISOString(),
      }),
    );
    playTone("good");
  }

  function upgradeTech(branch: FrontlineTechBranch) {
    const level = progress.tech[branch];
    const credits = Math.round(650 * Math.pow(level, 1.42));
    const alloy = 65 * level;
    if (
      level >= 20 ||
      progress.resources.credits < credits ||
      progress.resources.alloy < alloy
    ) {
      playTone("danger");
      return;
    }
    setProgress((current) =>
      sanitizeFrontlineProgress({
        ...current,
        resources: {
          ...current.resources,
          credits: current.resources.credits - credits,
          alloy: current.resources.alloy - alloy,
        },
        tech: { ...current.tech, [branch]: level + 1 },
        updatedAt: new Date().toISOString(),
      }),
    );
    playTone("good");
  }

  const saveLabel =
    saveStatus === "saving"
      ? "Autosaving"
      : saveStatus === "saved"
        ? "Online save"
        : "Local save";

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brandMark} aria-hidden="true">
          <FaCrosshairs />
        </div>
        <div className={styles.titleBlock}>
          <p className={styles.eyebrow}>ComePlayers original war strategy</p>
          <h2 className={styles.title}>CP Frontline: World Dominion</h2>
        </div>
        <div className={styles.hudResources}>
          <span className={styles.resourceChip} title="Credits">
            <FaCoins /> {formatNumber(progress.resources.credits)}
          </span>
          <span className={styles.resourceChip} title="Alloy">
            <FaCubes /> {formatNumber(progress.resources.alloy)}
          </span>
          <span className={styles.resourceChip} title="Intel">
            <FaMicrochip /> {formatNumber(progress.resources.intel)}
          </span>
          <button
            type="button"
            className={styles.statusChip}
            data-status={saveStatus}
            onClick={() => void loadOnlineData()}
            title="Refresh online command link"
          >
            {saveStatus === "saving" ? <FaRotate /> : online ? <FaSatelliteDish /> : <FaBolt />}
            {saveLabel}
          </button>
          <button
            type="button"
            className={styles.statusChip}
            data-status={soundEnabled ? "saved" : "offline"}
            onClick={() => setSoundEnabled((current) => !current)}
            title="Toggle command audio"
          >
            {soundEnabled ? "Sound on" : "Sound off"}
          </button>
        </div>
      </header>

      {screen === "command" ? (
        <div className={styles.commandBody}>
          <nav className={styles.sideNav} aria-label="Frontline command sections">
            {(
              [
                ["command", "Command", FaGaugeHigh],
                ["campaign", "Campaign", FaGlobe],
                ["arsenal", "Arsenal", FaWrench],
                ["social", "Allied PvP", FaUserGroup],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                className={styles.sideNavButton}
                data-active={tab === id}
                onClick={() => setTab(id)}
              >
                <Icon /> {label}
              </button>
            ))}
            <div className={styles.commanderCard}>
              <p className={styles.panelLabel}>Commander level</p>
              <div className={styles.commanderLevel}>
                LV {progress.commanderLevel}
              </div>
              <div className={styles.xpTrack}>
                <div
                  className={styles.xpFill}
                  style={{ width: `${xpPercent}%` }}
                />
              </div>
              <p className={styles.muted}>
                Power {formatNumber(commandPower)}
              </p>
            </div>
          </nav>

          <main className={styles.commandScroll}>
            {onlineNotice ? <div className={styles.notice}>{onlineNotice}</div> : null}

            {tab === "command" ? (
              <>
                <div className={styles.dashboardGrid}>
                  <section className={styles.hero}>
                    <div className={styles.heroContent}>
                      <span className={styles.difficulty}>
                        {currentMission.difficulty} operation
                      </span>
                      <h3 className={styles.heroTitle}>{currentMission.title}</h3>
                      <p className={styles.heroText}>{currentMission.briefing}</p>
                      <div className={styles.heroActions}>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => startMission(currentMission)}
                        >
                          <FaPlay /> Launch operation
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => setTab("campaign")}
                        >
                          View all missions
                        </button>
                      </div>
                    </div>
                  </section>

                  <section className={styles.panel}>
                    <div className={styles.panelHeader}>
                      <div>
                        <p className={styles.panelLabel}>Daily operations</p>
                        <h3 className={styles.panelTitle}>Alexia&apos;s directives</h3>
                      </div>
                      <FaMedal color="#ffd65c" />
                    </div>
                    <div className={styles.objectiveList}>
                      <div className={styles.objective}>
                        <FaCrosshairs /> Win one campaign operation
                      </div>
                      <div className={styles.objective}>
                        <FaTruckField /> Deploy twelve armored units
                      </div>
                      <div className={styles.objective}>
                        <FaUserGroup /> Review an allied target
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      style={{ width: "100%", marginTop: 12 }}
                      disabled={progress.dailyClaimDate === todayKey()}
                      onClick={claimDailyReward}
                    >
                      <FaAward />
                      {progress.dailyClaimDate === todayKey()
                        ? "Reward claimed"
                        : "Claim 700 credits"}
                    </button>
                  </section>
                </div>

                <div className={styles.statsGrid}>
                  {[
                    ["Command power", formatNumber(commandPower)],
                    ["Victories", formatNumber(progress.wins)],
                    ["Enemy units destroyed", formatNumber(progress.totalKills)],
                    ["Highest battle score", formatNumber(progress.highestScore)],
                  ].map(([label, value]) => (
                    <div key={label} className={styles.statCard}>
                      <p className={styles.panelLabel}>{label}</p>
                      <div className={styles.statValue}>{value}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {tab === "campaign" ? (
              <>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.panelLabel}>Global campaign</p>
                    <h3 className={styles.sectionTitle}>World Dominion operations</h3>
                    <p className={styles.sectionText}>
                      Six handcrafted sectors with escalating waves, rewards, and unit unlocks.
                    </p>
                  </div>
                </div>
                <div className={styles.missionGrid}>
                  {FRONTLINE_MISSIONS.map((mission) => {
                    const locked = mission.id > progress.campaignMission;
                    return (
                      <article
                        key={mission.code}
                        className={styles.missionCard}
                        data-locked={locked}
                      >
                        <div className={styles.missionNumber}>
                          {String(mission.id).padStart(2, "0")}
                        </div>
                        <h4 className={styles.missionTitle}>{mission.title}</h4>
                        <p className={styles.missionMeta}>
                          {mission.location} • {mission.difficulty}
                        </p>
                        <p className={styles.muted}>{mission.objective}</p>
                        <div className={styles.rewardRow}>
                          <span className={styles.rewardChip}>+{mission.reward.credits} credits</span>
                          <span className={styles.rewardChip}>+{mission.reward.xp} XP</span>
                          {mission.unlocks ? (
                            <span className={styles.rewardChip}>
                              Unlock {FRONTLINE_UNIT_DEFINITIONS[mission.unlocks].name}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className={locked ? styles.secondaryButton : styles.primaryButton}
                          style={{ width: "100%" }}
                          disabled={locked}
                          onClick={() => startMission(mission)}
                        >
                          {locked ? <FaLock /> : <FaPlay />}
                          {locked ? "Sector locked" : "Deploy"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : null}

            {tab === "arsenal" ? (
              <>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.panelLabel}>Research division</p>
                    <h3 className={styles.sectionTitle}>Frontline arsenal</h3>
                    <p className={styles.sectionText}>
                      Permanent upgrades affect campaign and friend attacks.
                    </p>
                  </div>
                </div>
                <div className={styles.techGrid}>
                  {TECH.map(({ branch, title, description, icon: Icon }) => {
                    const level = progress.tech[branch];
                    const creditCost = Math.round(650 * Math.pow(level, 1.42));
                    const alloyCost = 65 * level;
                    const affordable =
                      progress.resources.credits >= creditCost &&
                      progress.resources.alloy >= alloyCost;
                    return (
                      <article key={branch} className={styles.techCard}>
                        <div className={styles.techIcon}>
                          <Icon />
                        </div>
                        <h4 className={styles.techTitle}>{title}</h4>
                        <p className={styles.missionMeta}>Research level {level}/20</p>
                        <p className={styles.muted}>{description}</p>
                        <button
                          type="button"
                          className={styles.upgradeButton}
                          disabled={!affordable || level >= 20}
                          onClick={() => upgradeTech(branch)}
                        >
                          {level >= 20
                            ? "Maximum level"
                            : `Upgrade • ${formatNumber(creditCost)} credits • ${alloyCost} alloy`}
                        </button>
                      </article>
                    );
                  })}
                </div>

                <div className={styles.sectionHeader} style={{ marginTop: 22 }}>
                  <div>
                    <p className={styles.panelLabel}>Unit roster</p>
                    <h3 className={styles.sectionTitle}>Combined arms</h3>
                  </div>
                </div>
                <div className={styles.missionGrid}>
                  {(Object.keys(FRONTLINE_UNIT_DEFINITIONS) as FrontlineUnitKind[]).map((kind) => {
                    const definition = FRONTLINE_UNIT_DEFINITIONS[kind];
                    const Icon = UNIT_ICONS[kind];
                    const unlocked = progress.unlockedUnits.includes(kind);
                    return (
                      <article key={kind} className={styles.techCard}>
                        <div className={styles.techIcon} style={{ color: definition.accent }}>
                          {unlocked ? <Icon /> : <FaLock />}
                        </div>
                        <h4 className={styles.techTitle}>{definition.name}</h4>
                        <p className={styles.missionMeta}>{definition.role}</p>
                        <p className={styles.muted}>
                          HP {definition.hp} • Damage {definition.damage} • Energy {definition.cost}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : null}

            {tab === "social" ? (
              <>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.panelLabel}>ComePlayers alliance network</p>
                    <h3 className={styles.sectionTitle}>Friend attack targets</h3>
                    <p className={styles.sectionText}>
                      Accepted ComePlayers friends appear automatically. Attacks are asynchronous and create a bell notification.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void loadOnlineData()}
                  >
                    <FaRotate /> Refresh
                  </button>
                </div>
                {friends.length ? (
                  <div className={styles.friendList}>
                    {friends.map((friend) => (
                      <article key={friend.id} className={styles.friendCard}>
                        <div className={styles.avatar}>
                          {friend.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={friend.avatarUrl} alt="" />
                          ) : (
                            friend.name.slice(0, 1).toUpperCase()
                          )}
                        </div>
                        <div className={styles.friendInfo}>
                          <h4 className={styles.friendName}>{friend.name}</h4>
                          <p className={styles.missionMeta}>
                            Level {friend.level} • Power {formatNumber(friend.power)} • {friend.wins} wins
                          </p>
                        </div>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => startMission(currentMission, friend)}
                        >
                          <FaCrosshairs /> Attack
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div>
                      <FaUserGroup size={34} />
                      <h4>No allied commanders available</h4>
                      <p>
                        Add friends in ComePlayers Messages. They will appear here automatically after online storage is active.
                      </p>
                    </div>
                  </div>
                )}

                <div className={styles.sectionHeader} style={{ marginTop: 22 }}>
                  <div>
                    <p className={styles.panelLabel}>War room intelligence</p>
                    <h3 className={styles.sectionTitle}>Recent battles</h3>
                  </div>
                </div>
                <div className={styles.historyList}>
                  {history.length ? (
                    history.map((battle) => (
                      <article key={battle.id} className={styles.historyCard}>
                        <div className={styles.avatar}>
                          {battle.result === "victory" ? <FaRankingStar /> : <FaShieldHalved />}
                        </div>
                        <div className={styles.historyInfo}>
                          <h4 className={styles.friendName}>{battle.opponentName}</h4>
                          <p className={styles.historyMeta}>
                            {battle.direction} • {battle.result} • {formatNumber(battle.score)} score
                          </p>
                        </div>
                        <div className={styles.starRow} style={{ marginTop: 0, fontSize: 13 }}>
                          {[1, 2, 3].map((star) => (
                            <FaStar key={star} data-earned={battle.stars >= star} />
                          ))}
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className={styles.muted}>No synchronized battle history yet.</p>
                  )}
                </div>

                <div className={styles.sectionHeader} style={{ marginTop: 22 }}>
                  <div>
                    <p className={styles.panelLabel}>Commander honors</p>
                    <h3 className={styles.sectionTitle}>Achievements</h3>
                  </div>
                </div>
                <div className={styles.statsGrid}>
                  {Object.entries(ACHIEVEMENT_LABELS).map(([id, label]) => (
                    <div key={id} className={styles.statCard}>
                      <p className={styles.panelLabel}>
                        {progress.achievements.includes(id) ? "Unlocked" : "Locked"}
                      </p>
                      <div className={styles.statValue} style={{ fontSize: 14 }}>
                        {progress.achievements.includes(id) ? <FaAward color="#ffd65c" /> : <FaLock color="#526678" />} {label}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </main>
        </div>
      ) : (
        <div className={styles.battleShell}>
          <div ref={canvasHostRef} className={styles.canvasHost} />
          <div className={styles.battleShade} />

          <div className={styles.missionPanel}>
            <p className={styles.panelLabel}>
              {activeOpponent ? "Allied PvP assault" : "Campaign operation"}
            </p>
            <h3 className={styles.missionPanelTitle}>
              {activeOpponent ? `Attack ${activeOpponent.name}` : selectedMission.title}
            </h3>
            <p className={styles.missionPanelObjective}>
              {selectedMission.objective}. Click the battlefield to redirect all deployed units.
            </p>
            <div className={styles.combatLog}>
              {events.map((event) => (
                <div
                  key={event.id}
                  className={styles.combatEvent}
                  data-tone={event.tone}
                >
                  {event.message}
                </div>
              ))}
            </div>
          </div>

          <div className={styles.battleHudTop}>
            <div className={styles.hqBlock}>
              <div className={styles.hqLabel}>
                <span>Alliance HQ</span>
                <span>{snapshot.playerHqPercent}%</span>
              </div>
              <div className={styles.healthTrack}>
                <div className={styles.healthFill} style={{ width: `${snapshot.playerHqPercent}%` }} />
              </div>
            </div>
            <div className={styles.timer}>{formatTimer(snapshot.timeRemaining)}</div>
            <div className={styles.hqBlock} data-enemy="true">
              <div className={styles.hqLabel}>
                <span>Dominion HQ</span>
                <span>{snapshot.enemyHqPercent}%</span>
              </div>
              <div className={styles.healthTrack}>
                <div className={styles.healthFill} style={{ width: `${snapshot.enemyHqPercent}%` }} />
              </div>
            </div>
          </div>

          <div className={styles.abilityRail}>
            {(
              [
                ["airstrike", "Airstrike", FaExplosion],
                ["repair", "Field Repair", FaWrench],
                ["overdrive", "Overdrive", FaBolt],
              ] as const
            ).map(([ability, label, Icon]) => {
              const cooldown = snapshot.cooldowns[ability];
              return (
                <button
                  key={ability}
                  type="button"
                  className={styles.abilityButton}
                  disabled={cooldown > 0 || snapshot.status !== "running"}
                  onClick={() => activateAbility(ability)}
                >
                  <Icon /> {label}
                  {cooldown > 0 ? (
                    <span className={styles.cooldown}>{Math.ceil(cooldown)}s</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className={styles.battleBottom}>
            <div className={styles.energyPanel}>
              <span className={styles.panelLabel}>Command energy</span>
              <span className={styles.energyValue}>
                {snapshot.energy}/{snapshot.maxEnergy}
              </span>
              <div className={styles.energyTrack}>
                <div
                  className={styles.energyFill}
                  style={{ width: `${(snapshot.energy / snapshot.maxEnergy) * 100}%` }}
                />
              </div>
            </div>
            <div className={styles.unitDeck}>
              {(Object.keys(FRONTLINE_UNIT_DEFINITIONS) as FrontlineUnitKind[]).map((kind) => {
                const definition = FRONTLINE_UNIT_DEFINITIONS[kind];
                const Icon = UNIT_ICONS[kind];
                const unlocked = progress.unlockedUnits.includes(kind);
                const style = {
                  "--unit-accent": definition.accent,
                } as CSSProperties;
                return (
                  <button
                    key={kind}
                    type="button"
                    className={styles.unitCard}
                    style={style}
                    disabled={
                      !unlocked ||
                      snapshot.energy < definition.cost ||
                      snapshot.status !== "running"
                    }
                    onClick={() => deploy(kind)}
                    title={`${definition.name}: ${definition.role}`}
                  >
                    <span className={styles.unitIcon}>
                      {unlocked ? <Icon /> : <FaLock />}
                    </span>
                    {definition.name}
                    <span className={styles.unitCost}>
                      <FaBolt /> {definition.cost}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className={styles.scorePanel}>
              <span className={styles.panelLabel}>Battle telemetry</span>
              <div className={styles.scoreValue}>{formatNumber(snapshot.score)}</div>
              <p className={styles.muted}>
                Wave {snapshot.wave} • {snapshot.kills} kills • {snapshot.enemyUnits} hostiles
              </p>
            </div>
          </div>

          {briefingOpen ? (
            <div className={styles.briefingOverlay}>
              <article className={styles.briefingCard}>
                <div className={styles.briefingImage} />
                <div className={styles.briefingContent}>
                  <p className={styles.panelLabel}>Commander Alexia briefing</p>
                  <h3 className={styles.resultTitle}>
                    {activeOpponent ? `Assault: ${activeOpponent.name}` : selectedMission.title}
                  </h3>
                  <p className={styles.heroText}>
                    {activeOpponent
                      ? `${activeOpponent.name}'s defense has been reconstructed from their synchronized ComePlayers profile. Win the assault to send a battle notification.`
                      : selectedMission.briefing}
                  </p>
                  <div className={styles.rewardRow}>
                    <span className={styles.rewardChip}>{selectedMission.objective}</span>
                    <span className={styles.rewardChip}>{selectedMission.difficulty}</span>
                    <span className={styles.rewardChip}>{formatTimer(selectedMission.durationSeconds)}</span>
                  </div>
                  <div className={styles.heroActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => {
                        setBriefingOpen(false);
                        playTone("ability");
                      }}
                    >
                      <FaPlay /> Begin battle
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={returnToCommand}
                    >
                      Return to command
                    </button>
                  </div>
                </div>
              </article>
            </div>
          ) : null}

          {result ? (
            <div className={styles.resultOverlay}>
              <article className={styles.resultCard}>
                <div className={styles.resultContent}>
                  <p className={styles.panelLabel}>Operation complete</p>
                  <h3 className={styles.resultTitle}>
                    {result.result === "victory" ? "Sector secured" : "Regroup and retaliate"}
                  </h3>
                  <div className={styles.starRow}>
                    {[1, 2, 3].map((star) => (
                      <FaStar key={star} data-earned={result.stars >= star} />
                    ))}
                  </div>
                  <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                      <p className={styles.panelLabel}>Score</p>
                      <div className={styles.statValue}>{formatNumber(result.score)}</div>
                    </div>
                    <div className={styles.statCard}>
                      <p className={styles.panelLabel}>Kills</p>
                      <div className={styles.statValue}>{result.kills}</div>
                    </div>
                    <div className={styles.statCard}>
                      <p className={styles.panelLabel}>Units deployed</p>
                      <div className={styles.statValue}>{result.unitsDeployed}</div>
                    </div>
                    <div className={styles.statCard}>
                      <p className={styles.panelLabel}>Time</p>
                      <div className={styles.statValue}>{formatTimer(result.durationSeconds)}</div>
                    </div>
                  </div>
                  <p className={styles.heroText}>
                    Progress has been autosaved {online ? "to your ComePlayers account" : "on this device"}.
                    {activeOpponent ? " Your friend will receive the result in their notification bell." : ""}
                  </p>
                  <div className={styles.heroActions}>
                    <button type="button" className={styles.primaryButton} onClick={returnToCommand}>
                      <FaGaugeHigh /> Command center
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => startMission(selectedMission, activeOpponent)}
                    >
                      <FaRotate /> Replay operation
                    </button>
                  </div>
                </div>
              </article>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
