"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaBiohazard,
  FaBolt,
  FaBomb,
  FaCheck,
  FaChevronRight,
  FaClock,
  FaCog,
  FaCompress,
  FaCrosshairs,
  FaCrown,
  FaEnvelope,
  FaGamepad,
  FaGlobeAsia,
  FaLock,
  FaMapMarkedAlt,
  FaMedkit,
  FaMicrophone,
  FaPause,
  FaPlay,
  FaPlus,
  FaRedo,
  FaShieldAlt,
  FaShoppingCart,
  FaSlidersH,
  FaTrophy,
  FaUserFriends,
  FaUsers,
  FaVolumeUp,
  FaWifi,
} from "react-icons/fa";
import {
  StrikeGame,
  type StrikeHudState,
  type StrikeMode,
  type StrikePhase,
  type StrikeQuality,
} from "./StrikeGame";
import styles from "./strike.module.css";

type MenuScreen = "home" | "modes" | "loadout" | "lobby";

type ModeDefinition = {
  id: StrikeMode;
  title: string;
  shortTitle: string;
  description: string;
  objective: string;
  players: string;
  duration: string;
  difficulty: string;
  queue: string;
  image: string;
  Icon: typeof FaCrosshairs;
  rules: string[];
};

const MODES: ModeDefinition[] = [
  {
    id: "team-deathmatch",
    title: "TEAM DEATHMATCH",
    shortTitle: "Deathmatch",
    description: "Fast 5v5-style respawn combat against an aggressive enemy squad.",
    objective: "Reach the score limit before the opposing team.",
    players: "1 + 6 bots",
    duration: "3 min",
    difficulty: "Normal",
    queue: "PVP / BOTS",
    image: "/strike/mode-tdm.png",
    Icon: FaUsers,
    rules: ["Respawn enabled", "First side to 20 points wins", "Headshots deal extra damage", "Custom loadout enabled"],
  },
  {
    id: "bomb-defusal",
    title: "BOMB DEFUSAL",
    shortTitle: "Bomb",
    description: "Infiltrate the objective, plant the charge, and defend it from the enemy squad.",
    objective: "Reach Point A, hold E to plant, then stop the defuse.",
    players: "1 vs 5 bots",
    duration: "2.5 min",
    difficulty: "Hard",
    queue: "TACTICAL",
    image: "/strike/mode-bomb.png",
    Icon: FaBomb,
    rules: ["One-life tactical round", "Hold E at Point A to plant", "35-second detonation timer", "Enemies can defuse the device"],
  },
  {
    id: "free-for-all",
    title: "FREE FOR ALL",
    shortTitle: "Free For All",
    description: "Every fighter is a rival. Move constantly and race to the target score.",
    objective: "Be the first combatant to reach 15 eliminations.",
    players: "1 + 7 rivals",
    duration: "3 min",
    difficulty: "Medium",
    queue: "CASUAL",
    image: "/strike/mode-ffa.png",
    Icon: FaCrosshairs,
    rules: ["No teams", "Respawn enabled", "First to 15 eliminations wins", "Rival score advances during combat"],
  },
  {
    id: "zombie",
    title: "ZOMBIE SURVIVAL",
    shortTitle: "Zombie Survival",
    description: "Survive eight escalating infected waves with crawlers, runners, spitters, screamers, brutes, and a multi-phase final boss.",
    objective: "Defeat eight waves and eliminate the Outbreak Colossus.",
    players: "Solo survival",
    duration: "8 waves",
    difficulty: "Hard",
    queue: "PVE",
    image: "/strike/mode-zombie.png",
    Icon: FaBiohazard,
    rules: ["No respawn", "Six infected archetypes", "Explosive barrels and field pickups", "Multi-phase final boss", "Resupply between completed waves"],
  },
  {
    id: "zombie-adventure",
    title: "ZOMBIE ADVENTURE",
    shortTitle: "Outbreak Adventure",
    description: "Advance through a seven-chapter outbreak campaign with supply caches, gates, generators, reactor objectives, checkpoints, and a boss arena.",
    objective: "Reclaim the reactor district and defeat the Outbreak Colossus.",
    players: "1–4 co-op prototype",
    duration: "7 chapters",
    difficulty: "Extreme",
    queue: "ADVENTURE PVE",
    image: "/strike/mode-adventure.png",
    Icon: FaMapMarkedAlt,
    rules: ["Seven objective-based chapters", "Checkpoint revive system", "Interactive caches, generators, and extraction", "Six infected archetypes", "Three-phase boss battle"],
  },
];

const OPERATORS = [
  { id: "alexia", name: "Alexia", role: "Strike Operative", image: "/strike/operator-alexia.png", locked: false },
  { id: "raven", name: "Raven", role: "Recon Specialist", image: "/strike/operator-raven.png", locked: true },
  { id: "blaze", name: "Blaze", role: "Demolition Expert", image: "/strike/operator-blaze.png", locked: false },
  { id: "shadow", name: "Shadow", role: "Stealth Infiltrator", image: "/strike/operator-shadow.png", locked: false },
  { id: "cybernova", name: "CyberNova", role: "Tech Operative", image: "/strike/operator-cybernova.png", locked: false },
];

const WEAPONS = [
  { id: "cp47", category: "ASSAULT RIFLE", name: "CP-47 STRIKE", level: 23, stat: "Balanced" },
  { id: "velox", category: "SMG", name: "CP-9 VELOX", level: 18, stat: "Fast" },
  { id: "fury", category: "SHOTGUN", name: "CP-12 FURY", level: 16, stat: "Close range" },
  { id: "longbow", category: "SNIPER", name: "CP-45 LONGBOW", level: 20, stat: "Precision" },
];

const MAPS = [
  { name: "Skyline", image: "/strike/map-skyline.png", votes: 3 },
  { name: "Outpost", image: "/strike/map-outpost.png", votes: 1 },
  { name: "Metro", image: "/strike/map-metro.png", votes: 0 },
  { name: "Dockyard", image: "/strike/map-dockyard.png", votes: 0 },
  { name: "Blacksite", image: "/strike/map-blacksite.png", votes: 0 },
];

const PARTY = [
  { name: "Alexia", status: "Online", accent: "green", avatar: "/strike/operator-alexia.png" },
  { name: "NovaQueen", status: "Online", accent: "green", avatar: "/strike/operator-cybernova.png" },
  { name: "BlazeX", status: "In Match", accent: "gold", avatar: "/strike/operator-blaze.png" },
  { name: "ShadowKing", status: "Online", accent: "green", avatar: "/strike/operator-shadow.png" },
];

const INITIAL_HUD: StrikeHudState = {
  health: 100,
  armor: 50,
  ammo: 30,
  reserveAmmo: 120,
  kills: 0,
  deaths: 0,
  alliesScore: 0,
  enemiesScore: 0,
  timerSeconds: 180,
  message: "Capture Point A",
  objectiveDistance: 48,
  objectiveProgress: 0,
  wave: 1,
  round: 1,
  outcome: null,
  reloading: false,
  hitMarker: false,
  damageFlash: false,
  bossName: "",
  bossHealth: 0,
  bossMaxHealth: 0,
  adventureStage: 1,
  adventureStageMax: 7,
  adventureObjective: "Secure the arrival yard",
  reviveTokens: 1,
  combo: 0,
  overdriveSeconds: 0,
  bossPhase: 0,
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.max(0, seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function modeName(mode: StrikeMode) {
  return MODES.find((item) => item.id === mode)?.title ?? "TEAM DEATHMATCH";
}

export default function ComePlayersStrike() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<StrikeGame | null>(null);
  const [phase, setPhase] = useState<StrikePhase>("menu");
  const [hud, setHud] = useState<StrikeHudState>(INITIAL_HUD);
  const [quality, setQuality] = useState<StrikeQuality>("high");
  const [sensitivity, setSensitivity] = useState(1.8);
  const [error, setError] = useState("");
  const [engineReady, setEngineReady] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [screen, setScreen] = useState<MenuScreen>("home");
  const [selectedMode, setSelectedMode] = useState<StrikeMode>("team-deathmatch");
  const [selectedOperator, setSelectedOperator] = useState("alexia");
  const [selectedWeapon, setSelectedWeapon] = useState("cp47");
  const [selectedMap, setSelectedMap] = useState("Skyline");
  const [ready, setReady] = useState(false);

  const activeMode = useMemo(
    () => MODES.find((mode) => mode.id === selectedMode) ?? MODES[0],
    [selectedMode]
  );
  const activeWeapon = WEAPONS.find((weapon) => weapon.id === selectedWeapon) ?? WEAPONS[0];

  useEffect(() => {
    const mount = mountRef.current;
    const minimap = minimapRef.current;
    if (!mount || !minimap) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let game: StrikeGame | null = null;
    let active = true;

    try {
      game = new StrikeGame(mount, minimap, {
        onHud: setHud,
        onPhase: setPhase,
        onError: (message) => {
          setError(message);
          window.setTimeout(() => setError(""), 4200);
        },
      });
      game.setQuality(quality);
      game.setSensitivity(sensitivity / 1000);
      game.setMode(selectedMode);
      gameRef.current = game;
      queueMicrotask(() => {
        if (active) setEngineReady(true);
      });
    } catch (engineError) {
      console.error("ComePlayers Strike engine initialization failed:", engineError);
      queueMicrotask(() => {
        if (active) setError("WebGL is unavailable or failed to start in this browser.");
      });
    }

    return () => {
      active = false;
      game?.dispose();
      gameRef.current = null;
      document.body.style.overflow = previousOverflow;
    };
    // Engine is intentionally created once for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    gameRef.current?.setQuality(quality);
  }, [quality]);

  useEffect(() => {
    gameRef.current?.setSensitivity(sensitivity / 1000);
  }, [sensitivity]);

  useEffect(() => {
    gameRef.current?.setMode(selectedMode);
  }, [selectedMode]);

  const selectMode = (mode: StrikeMode) => {
    setSelectedMode(mode);
    setReady(false);
  };

  const startGame = () => {
    if (!gameRef.current) {
      setError("The game engine is not ready. Make sure WebGL is enabled, then reload the page.");
      return;
    }
    setShowControls(false);
    gameRef.current.startMatch(selectedMode);
  };

  const openMode = (mode: StrikeMode, next: MenuScreen = "modes") => {
    selectMode(mode);
    setScreen(next);
  };

  const isRunning = phase === "playing";
  const won = hud.outcome ? hud.outcome === "victory" : hud.alliesScore >= hud.enemiesScore;
  const zombieMode = selectedMode === "zombie" || selectedMode === "zombie-adventure";
  const adventureMode = selectedMode === "zombie-adventure";

  return (
    <main className={styles.shell}>
      <div ref={mountRef} className={styles.canvasMount} />
      <aside className={`${styles.minimapWrap} ${isRunning ? "" : styles.hudHidden}`}>
        <div className={styles.minimapLabel}>TACTICAL MAP</div>
        <canvas ref={minimapRef} width={180} height={180} className={styles.minimap} />
      </aside>

      <div className={`${styles.damageFlash} ${hud.damageFlash ? styles.damageFlashActive : ""}`} />

      {isRunning ? (
        <div className={styles.hud} aria-live="polite">
          <header className={styles.topHud}>
            <div className={styles.brandMini}>
              <span className={styles.cpMark}>CP</span>
              <span>ComePlayers <b>STRIKE</b></span>
            </div>

            <div className={styles.scoreboard}>
              <div className={styles.teamBlue}>
                <span>{selectedMode === "free-for-all" ? "YOU" : zombieMode ? "KILLS" : "ALLIES"}</span>
                <strong>{hud.alliesScore}</strong>
              </div>
              <div className={styles.roundClock}>
                <strong>{formatTime(hud.timerSeconds)}</strong>
                <span>{adventureMode ? `CHAPTER ${hud.adventureStage} / ${hud.adventureStageMax}` : selectedMode === "zombie" ? `WAVE ${hud.wave} / 8` : modeName(selectedMode)}</span>
              </div>
              <div className={styles.teamGold}>
                <strong>{hud.enemiesScore}</strong>
                <span>{selectedMode === "free-for-all" ? "RIVAL" : adventureMode ? "STAGE" : selectedMode === "zombie" ? "WAVE" : "ENEMIES"}</span>
              </div>
            </div>

            <button type="button" className={styles.iconButton} onClick={() => gameRef.current?.pause()} aria-label="Pause game">
              <FaPause />
            </button>
          </header>

          <section className={styles.objectivePanel}>
            <span>CURRENT OBJECTIVE</span>
            <strong>{hud.message}</strong>
            <small>{selectedMode === "bomb-defusal" ? `Point A · ${hud.objectiveDistance}m · Hold E` : adventureMode ? `${hud.adventureObjective} · ${hud.objectiveDistance}m` : activeMode.objective}</small>
            {hud.objectiveProgress > 0 ? (
              <div className={styles.objectiveProgress}><i style={{ width: `${hud.objectiveProgress}%` }} /></div>
            ) : null}
            {hud.bossMaxHealth > 0 ? (
              <div className={styles.bossBar}><span>{hud.bossName} · PHASE {Math.max(1, hud.bossPhase)}</span><div><i style={{ width: `${Math.max(0, (hud.bossHealth / hud.bossMaxHealth) * 100)}%` }} /></div><b>{hud.bossHealth} / {hud.bossMaxHealth}</b></div>
            ) : null}
          </section>

          <div className={styles.crosshair}>
            <i />
            <i />
            <i />
            <i />
            <span className={hud.hitMarker ? styles.hitMarkerActive : ""}>×</span>
          </div>

          <section className={styles.playerHud}>
            <div className={styles.operatorPortrait}><img src="/strike/operator-alexia.png" alt="" /></div>
            <div>
              <span className={styles.operatorName}>ALEXIA</span>
              <div className={styles.statLine}>
                <FaMedkit />
                <div className={styles.healthTrack}><div style={{ width: `${hud.health}%` }} /></div>
                <strong>{hud.health}</strong>
              </div>
              <div className={styles.statLine}>
                <FaShieldAlt />
                <div className={styles.armorTrack}><div style={{ width: `${Math.min(100, hud.armor * 2)}%` }} /></div>
                <strong>{hud.armor}</strong>
              </div>
            </div>
          </section>

          <section className={styles.matchStats}>
            <span>KILLS <strong>{hud.kills}</strong></span>
            <span>DEATHS <strong>{hud.deaths}</strong></span>
            <span>K/D <strong>{hud.deaths === 0 ? hud.kills.toFixed(1) : (hud.kills / hud.deaths).toFixed(2)}</strong></span>
          </section>

          {zombieMode ? (
            <section className={styles.mutationStatus}>
              <div><FaBolt /><span>COMBO</span><strong>{hud.combo}x</strong></div>
              <div className={hud.overdriveSeconds > 0 ? styles.statusActive : ""}><FaCrosshairs /><span>OVERDRIVE</span><strong>{hud.overdriveSeconds > 0 ? `${hud.overdriveSeconds}s` : "OFF"}</strong></div>
              {adventureMode ? <div><FaMedkit /><span>REVIVES</span><strong>{hud.reviveTokens}</strong></div> : null}
            </section>
          ) : null}

          <section className={styles.equipmentHud}>
            <div><kbd>4</kbd><span>GRENADE</span></div>
            <div><kbd>3</kbd><span>SMOKE</span></div>
            <div><kbd>2</kbd><span>MEDKIT</span></div>
            <div><kbd>Q</kbd><span>DRONE</span></div>
          </section>

          <section className={styles.ammoHud}>
            <span>{activeWeapon.name}</span>
            <div><strong>{String(hud.ammo).padStart(2, "0")}</strong><em>/ {hud.reserveAmmo}</em></div>
            <small>{hud.reloading ? "RELOADING" : "AUTO · R TO RELOAD"}</small>
          </section>

          <div className={styles.liveHint}>ESC pause · F fullscreen · Right click aim {selectedMode === "bomb-defusal" ? "· E plant bomb" : adventureMode ? "· E interact with terminals" : ""}</div>
        </div>
      ) : null}

      {phase === "menu" ? (
        <section className={styles.commandMenu}>
          <img className={styles.commandBackdrop} src="/strike/strike-ui-home.png" alt="" />
          <div className={styles.commandScrim} />

          <header className={styles.commandHeader}>
            <button type="button" className={styles.commandBrand} onClick={() => setScreen("home")}>
              <span className={styles.cpLogo}>CP</span>
              <strong>ComePlayers <em>STRIKE</em></strong>
            </button>

            <nav className={styles.commandNav} aria-label="ComePlayers Strike menu">
              <button className={screen === "home" ? styles.navActive : ""} onClick={() => setScreen("home")}>PLAY</button>
              <button className={screen === "modes" ? styles.navActive : ""} onClick={() => setScreen("modes")}>MODES</button>
              <button className={screen === "loadout" ? styles.navActive : ""} onClick={() => setScreen("loadout")}>LOADOUT</button>
              <button onClick={() => setScreen("loadout")}>OPERATORS</button>
              <button onClick={() => setError("Battle Pass will connect to your ComePlayers account progress in a future update.")}>BATTLE PASS</button>
              <button onClick={() => setError("Career stats are being prepared for ComePlayers accounts.")}>CAREER</button>
              <button onClick={() => setError("Strike Store is not available in this prototype yet.")}>STORE</button>
              <button onClick={() => setShowControls(true)}>SETTINGS</button>
            </nav>

            <div className={styles.commandAccount}>
              <span className={styles.currency}>CP <b>12,450</b></span>
              <span className={styles.currency}>G <b>850</b></span>
              <FaEnvelope />
              <FaUserFriends />
              <div className={styles.profileChip}>
                <img src="/strike/operator-alexia.png" alt="Alexia" />
                <span><b>Alexia</b><small>Online</small></span>
                <strong>32</strong>
              </div>
            </div>
          </header>

          <div className={styles.commandContent}>
            {screen === "home" ? (
              <HomeMenu
                engineReady={engineReady}
                activeMode={activeMode}
                onQuickPlay={startGame}
                onModes={() => setScreen("modes")}
                onMode={(mode) => openMode(mode, "lobby")}
              />
            ) : null}

            {screen === "modes" ? (
              <ModesMenu
                activeMode={activeMode}
                selectedMode={selectedMode}
                onSelect={selectMode}
                onContinue={() => setScreen("lobby")}
              />
            ) : null}

            {screen === "loadout" ? (
              <LoadoutMenu
                selectedOperator={selectedOperator}
                selectedWeapon={selectedWeapon}
                onOperator={setSelectedOperator}
                onWeapon={setSelectedWeapon}
                onEquip={() => {
                  setError(`${activeWeapon.name} and operator ${OPERATORS.find((item) => item.id === selectedOperator)?.name ?? "Alexia"} were equipped successfully.`);
                  window.setTimeout(() => setError(""), 2600);
                }}
              />
            ) : null}

            {screen === "lobby" ? (
              <LobbyMenu
                activeMode={activeMode}
                selectedMode={selectedMode}
                selectedMap={selectedMap}
                ready={ready}
                engineReady={engineReady}
                onMode={selectMode}
                onMap={setSelectedMap}
                onBack={() => setScreen("modes")}
                onReady={() => setReady((value) => !value)}
                onStart={startGame}
              />
            ) : null}
          </div>

          <footer className={styles.commandFooter}>
            <span><i /> SERVERS ONLINE · SEA</span>
            <span>COMEPLAYERS STRIKE · BLACK CORE UPDATE 0.4</span>
            <Link href="/games">EXIT TO GAMES</Link>
          </footer>

          {showControls ? (
            <ControlsModal
              quality={quality}
              sensitivity={sensitivity}
              onQuality={setQuality}
              onSensitivity={setSensitivity}
              onClose={() => setShowControls(false)}
            />
          ) : null}
        </section>
      ) : null}

      {phase === "paused" ? (
        <section className={styles.pauseOverlay}>
          <div className={styles.overlayPanel}>
            <span className={styles.panelKicker}>MATCH PAUSED</span>
            <h2>{modeName(selectedMode)}</h2>
            <p>Click Resume to lock the mouse back into the game area.</p>
            <button type="button" className={styles.playButton} onClick={() => gameRef.current?.resume()}><FaPlay /> RESUME</button>
            <button type="button" className={styles.secondaryButton} onClick={() => setShowControls((value) => !value)}><FaGamepad /> CONTROLS</button>
            {showControls ? <p className={styles.pauseControls}>WASD to move · Mouse to aim · Left-click to fire · R to reload · Shift to sprint · Space to jump · E for objectives · Shoot red barrels for area explosions</p> : null}
            <button type="button" className={styles.textLink} onClick={() => { gameRef.current?.returnToMenu(); setScreen("lobby"); }}>Return to lobby</button>
          </div>
        </section>
      ) : null}

      {phase === "gameover" ? (
        <section className={styles.resultsOverlay}>
          <div className={styles.resultsBackdrop} />
          <div className={styles.resultsPanel}>
            <span className={styles.panelKicker}>MATCH RESULTS · {modeName(selectedMode)}</span>
            <h2 className={won ? styles.victory : styles.defeat}>{won ? "VICTORY" : "DEFEAT"}</h2>
            <p>{hud.message}</p>

            <div className={styles.finalScore}>
              <div><span>{selectedMode === "free-for-all" ? "YOU" : "COMEPLAYERS"}</span><strong>{hud.alliesScore}</strong></div>
              <b>VS</b>
              <div><span>{adventureMode ? `CHAPTER ${hud.adventureStage}` : selectedMode === "zombie" ? `WAVE ${hud.wave}` : "OPPOSITION"}</span><strong>{hud.enemiesScore}</strong></div>
            </div>

            <div className={styles.resultStats}>
              <div><span>KILLS</span><strong>{hud.kills}</strong></div>
              <div><span>DEATHS</span><strong>{hud.deaths}</strong></div>
              <div><span>K/D</span><strong>{hud.deaths === 0 ? hud.kills.toFixed(1) : (hud.kills / hud.deaths).toFixed(2)}</strong></div>
              <div><span>RANK XP</span><strong>+{Math.max(80, hud.kills * 35)}</strong></div>
            </div>

            <div className={styles.resultActions}>
              <button type="button" className={styles.playButton} onClick={() => gameRef.current?.restart()}><FaRedo /> PLAY AGAIN</button>
              <button type="button" className={styles.secondaryLink} onClick={() => { gameRef.current?.returnToMenu(); setScreen("lobby"); }}>RETURN TO LOBBY</button>
            </div>
          </div>
        </section>
      ) : null}

      <div className={styles.mobileNotice}>
        <FaGamepad />
        <h2>Desktop required</h2>
        <p>ComePlayers Strike currently requires a keyboard and mouse.</p>
        <Link href="/games/comeplayers-strike">Back to game page</Link>
      </div>

      {error ? <div className={styles.errorToast}>{error}</div> : null}
    </main>
  );
}

function HomeMenu({
  engineReady,
  activeMode,
  onQuickPlay,
  onModes,
  onMode,
}: {
  engineReady: boolean;
  activeMode: ModeDefinition;
  onQuickPlay: () => void;
  onModes: () => void;
  onMode: (mode: StrikeMode) => void;
}) {
  return (
    <section className={styles.homeScreen}>
      <div className={styles.homeHero}>
        <div className={styles.homeCopy}>
          <span className={styles.menuEyebrow}>TACTICAL · FAST · RELENTLESS</span>
          <h1>COMEPLAYERS <em>STRIKE</em></h1>
          <p>Four combat experiences in one browser FPS. Choose a mode, prepare your loadout, and enter the arena with Alexia.</p>
          <button type="button" className={styles.heroPlay} onClick={onModes}><FaPlay /> PLAY NOW <small>CHOOSE YOUR MODE</small></button>
          <button type="button" className={styles.quickPlay} onClick={onQuickPlay} disabled={!engineReady}>
            <FaBolt /><span><b>{engineReady ? "QUICK PLAY" : "LOADING ENGINE"}</b><small>{activeMode.title} · Start instantly</small></span><FaChevronRight />
          </button>
        </div>

        <div className={styles.alexiaStage}>
          <div className={styles.alexiaGlow} />
          <img src="/strike/alexia-operator-cutout.png" alt="Alexia, ComePlayers Strike operator" />
          <div className={styles.operatorTag}><span>FEATURED OPERATOR</span><strong>ALEXIA</strong><small>Strike Operative · Adrenaline Rush</small></div>
        </div>

        <aside className={styles.homeSidebar}>
          <article className={styles.rankCard}>
            <span>MY RANK</span><FaTrophy /><div><strong>DIAMOND II</strong><small>68 / 100 RP</small><i><b /></i></div>
          </article>
          <article className={styles.missionCard}>
            <header><span>DAILY MISSIONS</span><small>11:24:50</small></header>
            {["Win 2 Matches", "Get 20 Kills", "Play 3 Matches"].map((mission, index) => (
              <div key={mission}><span>{mission}</span><small>{["1/2", "12/20", "2/3"][index]}</small><i><b style={{ width: `${[50, 60, 66][index]}%` }} /></i><em>CP 250</em></div>
            ))}
          </article>
          <article className={styles.passCard}>
            <div className={styles.levelBadge}>15</div><div><span>BATTLE PASS · SKYLINE</span><strong>LEVEL 28</strong><i><b /></i><small>2,450 / 5,000 XP</small></div>
          </article>
        </aside>
      </div>

      <div className={styles.homeLower}>
        <aside className={styles.partyCard}>
          <header><span>PARTY</span><b>4 / 5</b><button><FaPlus /></button></header>
          {PARTY.map((player) => (
            <div key={player.name}><img src={player.avatar} alt="" /><span><b>{player.name}</b><small className={player.accent === "gold" ? styles.statusGold : styles.statusGreen}>{player.status}</small></span><FaWifi /></div>
          ))}
          <button className={styles.inviteButton}><FaUserFriends /> INVITE TO PARTY</button>
        </aside>

        <section className={styles.featuredModes}>
          <header><span>FEATURED MODES</span><button onClick={onModes}>VIEW ALL MODES <FaChevronRight /></button></header>
          <div className={styles.featuredModeGrid}>
            {MODES.map(({ id, title, description, image, Icon }) => (
              <button key={id} className={styles.featuredMode} onClick={() => onMode(id)}>
                <img src={image} alt="" /><div><Icon /><span><b>{title}</b><small>{description}</small></span></div>
              </button>
            ))}
          </div>
        </section>

        <aside className={styles.friendsCard}>
          <header><span>FRIENDS</span><b>ONLINE (7)</b></header>
          {["CyberNova", "PlayMaker", "SniperOne", "KillerBee"].map((friend, index) => (
            <div key={friend}><span className={styles.friendAvatar}>{friend.slice(0, 1)}</span><span><b>{friend}</b><small>{index === 2 ? "In Match" : index === 3 ? "Away" : "Online"}</small></span><FaEnvelope /></div>
          ))}
        </aside>
      </div>

      <div className={styles.homeUtility}>
        <span><FaClock /><b>EVENTS</b><small>Double XP Weekend</small></span>
        <span><FaTrophy /><b>LEADERBOARDS</b><small>Top Players</small></span>
        <span><FaShieldAlt /><b>CLANS</b><small>Join a Clan</small></span>
        <span><FaGamepad /><b>ACHIEVEMENTS</b><small>37 / 120 Unlocked</small></span>
      </div>
    </section>
  );
}

function ModesMenu({ activeMode, selectedMode, onSelect, onContinue }: {
  activeMode: ModeDefinition;
  selectedMode: StrikeMode;
  onSelect: (mode: StrikeMode) => void;
  onContinue: () => void;
}) {
  return (
    <section className={styles.modesScreen}>
      <aside className={styles.modeGuide}>
        <img src="/strike/alexia-operator-cutout.png" alt="Alexia" />
        <div><span>OPERATOR GUIDE</span><h2>ALEXIA <em>HOST</em></h2><p>Each mode requires a different strategy. Choose your battlefield and master the arena.</p></div>
      </aside>

      <div className={styles.modeCenter}>
        <header className={styles.screenTitle}><span><FaArrowLeft /></span><div><h1>SELECT MODE</h1><p>CHOOSE YOUR BATTLEFIELD</p></div></header>
        <div className={styles.modeCards}>
          {MODES.map((mode) => {
            const Icon = mode.Icon;
            const selected = selectedMode === mode.id;
            return (
              <button key={mode.id} className={`${styles.modeCard} ${selected ? styles.modeCardSelected : ""}`} onClick={() => onSelect(mode.id)}>
                <div className={styles.modeCardImage}><img src={mode.image} alt="" /><Icon />{selected ? <b><FaCheck /></b> : null}</div>
                <div className={styles.modeCardCopy}><h2>{mode.title}</h2><p>{mode.description}</p><div><span><FaUsers /><b>{mode.players}</b></span><span><FaClock /><b>{mode.duration}</b></span><span><FaBolt /><b>{mode.difficulty}</b></span></div><em>{mode.queue}</em></div>
              </button>
            );
          })}
        </div>

        <div className={styles.queueBar}>
          <div><span>QUEUE TYPE</span><button className={styles.queueActive}>CASUAL<small>Relaxed matchmaking</small></button><button><FaLock /> RANKED<small>Competitive</small></button><button>CO-OP<small>Team vs AI</small></button></div>
          <div><span>REGION / PING</span><button><FaGlobeAsia /> Auto (SEA) <FaWifi /> 32ms</button></div>
          <button className={styles.startMatchButton} onClick={onContinue}>CONTINUE <FaChevronRight /></button>
        </div>
      </div>

      <aside className={styles.modeDetails}>
        <header><span>MODE DETAILS</span><activeMode.Icon /></header>
        <h2>{activeMode.title}</h2><em>{activeMode.queue}</em><p>{activeMode.objective}</p>
        <h3>RULES</h3><ul>{activeMode.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        <h3>REWARDS</h3><div className={styles.rewards}><span><b>XP</b><small>2,500</small></span><span><b>CP</b><small>150</small></span><span><FaShoppingCart /><small>Supply Box</small></span></div>
        <h3>MAP ROTATION</h3><div className={styles.miniMaps}>{MAPS.slice(0, 3).map((map) => <span key={map.name}><img src={map.image} alt="" /><b>{map.name}</b></span>)}</div>
      </aside>
    </section>
  );
}

function LoadoutMenu({ selectedOperator, selectedWeapon, onOperator, onWeapon, onEquip }: {
  selectedOperator: string;
  selectedWeapon: string;
  onOperator: (id: string) => void;
  onWeapon: (id: string) => void;
  onEquip: () => void;
}) {
  const operator = OPERATORS.find((item) => item.id === selectedOperator) ?? OPERATORS[0];
  const weapon = WEAPONS.find((item) => item.id === selectedWeapon) ?? WEAPONS[0];
  return (
    <section className={styles.loadoutScreen}>
      <aside className={styles.operatorRoster}>
        <header><h1>LOADOUT & OPERATORS</h1><p>CUSTOMIZE YOUR OPERATOR. <b>DOMINATE THE BATTLEFIELD.</b></p></header>
        {OPERATORS.map((item) => (
          <button key={item.id} className={selectedOperator === item.id ? styles.operatorSelected : ""} onClick={() => !item.locked && onOperator(item.id)}>
            <img src={item.image} alt="" /><span><b>{item.name}</b><small>{item.role}</small></span>{item.locked ? <FaLock /> : selectedOperator === item.id ? <FaCheck /> : null}
          </button>
        ))}
      </aside>

      <div className={styles.weaponWorkbench}>
        <header><span>PRIMARY WEAPON</span><h2>{weapon.name}</h2><b>{weapon.category}</b><div className={styles.weaponLevel}><strong>{weapon.level}</strong><span><i><b /></i>2,450 / 5,000 XP</span></div></header>
        <div className={styles.weaponPreview}><img src="/strike/cp47-weapon.png" alt="CP-47 Strike rifle" /><button><FaSlidersH /> GUNSMITH</button></div>
        <div className={styles.attachments}>
          {["Red Dot Sight", "Compensator", "16.5 Tactical", "Vertical Grip", "Extended Mag", "Light Stock"].map((item, index) => <div key={item}><span>{["OPTIC", "MUZZLE", "BARREL", "UNDERBARREL", "MAGAZINE", "STOCK"][index]}</span><b>{item}</b></div>)}
        </div>
        <nav className={styles.weaponTabs}><button className={styles.weaponTabActive}>ASSAULT RIFLES</button><button>SMGS</button><button>SHOTGUNS</button><button>SNIPER RIFLES</button><button>PISTOLS</button><button>MELEE</button></nav>
        <div className={styles.weaponGrid}>{WEAPONS.map((item) => <button key={item.id} className={selectedWeapon === item.id ? styles.weaponSelected : ""} onClick={() => onWeapon(item.id)}><img src="/strike/cp47-weapon.png" alt="" /><span><b>{item.name}</b><small>LEVEL {item.level} · {item.stat}</small></span></button>)}</div>
        <div className={styles.gearGrid}>
          <section><h3>EQUIPMENT</h3><div>{[[FaBomb,"FRAG"],[FaVolumeUp,"SMOKE"],[FaBolt,"FLASH"],[FaMedkit,"MEDKIT"],[FaGlobeAsia,"DRONE"]].map(([Icon,label]) => { const GearIcon = Icon as typeof FaBomb; return <span key={String(label)}><GearIcon /><b>{String(label)}</b></span>; })}</div></section>
          <section><h3>PERKS</h3><div><span><FaCrosshairs /><b>DOMINATOR</b></span><span><FaMapMarkedAlt /><b>OVERWATCH</b></span><span><FaShieldAlt /><b>RESOLUTE</b></span></div></section>
        </div>
      </div>

      <aside className={styles.operatorShowcase}>
        <img src={operator.id === "alexia" ? "/strike/alexia-operator-cutout.png" : operator.image} alt={operator.name} />
        <div className={styles.operatorBio}><span>SELECTED OPERATOR</span><h2>{operator.name}</h2><em>{operator.role}</em><p>An elite ComePlayers operative with high mobility, stable weapon control, and tactical abilities that can turn the battle.</p></div>
        <div className={styles.operatorStats}>{[["DURABILITY",90],["ACCURACY",93],["MOBILITY",95],["FIRE RATE",88],["CONTROL",92]].map(([label,value]) => <div key={String(label)}><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><strong>{value}</strong></div>)}</div>
        <div className={styles.abilityCard}><FaBolt /><span><b>ADRENALINE RUSH</b><small>Temporarily boosts movement and reload speed.</small></span></div>
        <button className={styles.equipButton} onClick={onEquip}>EQUIP <FaCheck /></button>
      </aside>
    </section>
  );
}

function LobbyMenu({ activeMode, selectedMode, selectedMap, ready, engineReady, onMode, onMap, onBack, onReady, onStart }: {
  activeMode: ModeDefinition;
  selectedMode: StrikeMode;
  selectedMap: string;
  ready: boolean;
  engineReady: boolean;
  onMode: (mode: StrikeMode) => void;
  onMap: (map: string) => void;
  onBack: () => void;
  onReady: () => void;
  onStart: () => void;
}) {
  const attackers = ["Alexia", "NovaQueen", "BlazeX", "ShadowKing", "CyberNova"];
  const defenders = ["PlayMaker", "SniperOne", "KillerBee", "GhostMode", "NightHawk"];
  return (
    <section className={styles.lobbyScreen}>
      <aside className={styles.lobbyLeft}>
        <article className={styles.leaderCard}><img src="/strike/operator-alexia.png" alt="Alexia" /><div><span>SQUAD LEADER</span><h2>Alexia <FaCrown /></h2><b>DIAMOND II</b><i><strong /></i><small>68 / 100 RP</small></div></article>
        <article className={styles.chatCard}><h3>SQUAD CHAT</h3>{[["NovaQueen","Let’s lock in and win this!"],["BlazeX","I’ll take mid control."],["ShadowKing","Sniper on Skyline?"],["CyberNova","I have the flank."]].map(([name,message]) => <p key={name}><b>{name}</b><span>{message}</span></p>)}<label><input placeholder="Type a message..." /><button><FaChevronRight /></button></label><footer><FaMicrophone /> VOICE CHAT: PARTY <FaWifi /></footer></article>
        <button className={styles.leaveButton} onClick={onBack}><FaArrowLeft /> CHANGE MODE</button>
      </aside>

      <div className={styles.lobbyCenter}>
        <nav className={styles.lobbyModeTabs}>{MODES.map((mode) => { const Icon = mode.Icon; return <button key={mode.id} className={selectedMode === mode.id ? styles.lobbyModeActive : ""} onClick={() => onMode(mode.id)}><Icon /> {mode.title}</button>; })}</nav>
        <div className={styles.teamColumns}>
          <TeamPanel title={selectedMode === "free-for-all" ? "COMBATANTS" : selectedMode === "zombie-adventure" ? "STRIKE TEAM" : selectedMode === "zombie" ? "SURVIVORS" : "ATTACKERS"} players={attackers} red />
          <TeamPanel title={selectedMode === "free-for-all" ? "RIVALS" : selectedMode === "zombie-adventure" ? "OUTBREAK FORCES" : selectedMode === "zombie" ? "INFECTED" : "DEFENDERS"} players={defenders} />
        </div>
        <section className={styles.spectatorBar}><span>SPECTATORS (2/6)</span><b>ObserverX</b><b>SilentShot</b><button><FaPlus /></button><button><FaPlus /></button><button className={styles.inviteFriend}><FaUserFriends /> INVITE FRIEND</button></section>
        <section className={styles.mapVote}><header><span>MAP VOTE</span><b>00:12</b><small>Choose the next battlefield.</small></header><div>{MAPS.map((map) => <button key={map.name} className={selectedMap === map.name ? styles.mapSelected : ""} onClick={() => onMap(map.name)}><img src={map.image} alt="" /><span><b>{map.name}</b><small>Votes: {map.votes + (selectedMap === map.name ? 1 : 0)}</small></span>{selectedMap === map.name ? <FaCheck /> : null}</button>)}</div></section>
      </div>

      <aside className={styles.lobbyRight}>
        <article><h3>MODE RULES</h3><ul>{activeMode.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul></article>
        <article><h3>MATCH SETTINGS</h3><dl><div><dt>MODE</dt><dd>{activeMode.shortTitle}</dd></div><div><dt>TIME LIMIT</dt><dd>{activeMode.duration}</dd></div><div><dt>FRIENDLY FIRE</dt><dd>OFF</dd></div><div><dt>REGION</dt><dd>SEA · 32ms</dd></div><div><dt>AUTO FILL</dt><dd>ON</dd></div></dl></article>
        <button className={`${styles.readyPanel} ${ready ? styles.readyActive : ""}`} onClick={onReady}><span>{ready ? "READY" : "NOT READY"}</span><small>{ready ? "Squad locked and prepared" : "Click to ready up"}</small><FaCheck /></button>
        <button className={styles.launchButton} onClick={onStart} disabled={!engineReady || !ready}><FaPlay /> {engineReady ? ready ? "START MATCH" : "READY UP FIRST" : "LOADING ENGINE"}</button>
      </aside>
    </section>
  );
}

function TeamPanel({ title, players, red = false }: { title: string; players: string[]; red?: boolean }) {
  return (
    <section className={`${styles.teamPanel} ${red ? styles.teamPanelRed : styles.teamPanelBlue}`}>
      <header><span>{title}</span><b>5 / 5</b></header>
      {players.map((player, index) => (
        <div key={player}><strong>{[32,27,29,24,26][index]}</strong><span className={styles.teamAvatar}>{player.slice(0, 1)}</span><span><b>{player}{index === 0 && red ? <FaCrown /> : null}</b><small>{index < 2 ? "DIAMOND II" : index < 4 ? "PLATINUM I" : "GOLD II"}</small></span><em>{index === 0 && red ? "LEADER" : "READY"}</em><FaWifi /></div>
      ))}
    </section>
  );
}

function ControlsModal({ quality, sensitivity, onQuality, onSensitivity, onClose }: {
  quality: StrikeQuality;
  sensitivity: number;
  onQuality: (quality: StrikeQuality) => void;
  onSensitivity: (value: number) => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.settingsModal} role="dialog" aria-modal="true" aria-label="Strike settings">
      <div>
        <header><span><FaCog /> GAME SETTINGS</span><button onClick={onClose}>×</button></header>
        <label>Graphics quality<select value={quality} onChange={(event) => onQuality(event.target.value as StrikeQuality)}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
        <label>Mouse sensitivity <strong>{sensitivity.toFixed(1)}</strong><input type="range" min="0.8" max="3.6" step="0.1" value={sensitivity} onChange={(event) => onSensitivity(Number(event.target.value))} /></label>
        <section className={styles.controlGrid}>{[["W A S D","Move"],["MOUSE","Aim"],["LEFT CLICK","Fire"],["RIGHT CLICK","ADS"],["SHIFT","Sprint"],["SPACE","Jump"],["R","Reload"],["E","Objective"],["F","Fullscreen"],["ESC","Pause"]].map(([key,action]) => <span key={key}><kbd>{key}</kbd><b>{action}</b></span>)}</section>
        <footer><FaCrosshairs /> Raycast gunplay <FaVolumeUp /> Procedural audio <FaCompress /> Fullscreen ready</footer>
      </div>
    </div>
  );
}
