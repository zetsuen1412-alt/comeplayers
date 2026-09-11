"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FaArrowLeft,
  FaBomb,
  FaBolt,
  FaCar,
  FaChessRook,
  FaCrosshairs,
  FaExpand,
  FaGamepad,
  FaPause,
  FaPlay,
  FaRedo,
  FaRunning,
  FaShieldAlt,
  FaSkullCrossbones,
  FaTimes,
  FaVolumeMute,
  FaVolumeUp,
} from "react-icons/fa";
import styles from "./ComePlayersArcade.module.css";

type Props = {
  onClose: () => void;
};

type GameStatus = "ready" | "live" | "paused" | "gameover";

type Arrow = {
  id: number;
  x: number;
  y: number;
  vx: number;
  trail: Array<{ x: number; y: number }>;
};

type Enemy = {
  id: number;
  x: number;
  y: number;
  speed: number;
  radius: number;
  hp: number;
  maxHp: number;
  wobble: number;
  phase: number;
  variant: number;
  hitFlash: number;
};

type Particle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  kind: "spark" | "smoke" | "ember";
};

type FloatingText = {
  id: number;
  x: number;
  y: number;
  text: string;
  life: number;
  tone: "score" | "combo" | "damage";
};

type GameSnapshot = {
  score: number;
  combo: number;
  shield: number;
  status: GameStatus;
};

const WIDTH = 1200;
const HEIGHT = 650;
const PLAYER_X = 305;
const BEST_KEY = "comeplayers-alexia-arrow-best";

const arcadeGames = [
  { id: "chess", label: "CP Chess", subtitle: "ONLINE / NPC STRATEGY", icon: FaChessRook },
  { id: "dash", label: "Alexia Dash", subtitle: "ENDLESS RUNNER", icon: FaRunning },
  { id: "aim", label: "Aim Challenge", subtitle: "DAILY CHALLENGE", icon: FaCrosshairs },
  { id: "snake", label: "Squad Snake", subtitle: "ARCADE CLASSIC", icon: FaBolt },
  { id: "kart", label: "CP Kart Mini", subtitle: "RACING", icon: FaCar },
  { id: "arrow", label: "Alexia Arrow", subtitle: "SURVIVAL ARCHERY", icon: FaSkullCrossbones },
  { id: "bomb", label: "Bomb Arena", subtitle: "PUZZLE ACTION", icon: FaBomb },
  { id: "tower", label: "Tower Rush", subtitle: "QUICK STRATEGY", icon: FaChessRook },
  { id: "penalty", label: "Pixel Penalty", subtitle: "SPORTS", icon: FaGamepad },
] as const;

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: Enemy,
  now: number,
) {
  const bob = Math.sin(now * 0.0045 + enemy.phase) * 5;
  const lean = Math.sin(now * 0.003 + enemy.phase) * 0.045;
  const r = enemy.radius;
  const x = enemy.x;
  const y = enemy.y + bob;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);

  const glow = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r * 1.55);
  glow.addColorStop(0, enemy.hitFlash > 0 ? "rgba(255,235,80,.55)" : "rgba(239,68,68,.18)");
  glow.addColorStop(1, "rgba(239,68,68,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
  ctx.fill();

  // Back arm.
  ctx.strokeStyle = enemy.variant % 2 ? "#5b4a3a" : "#66503c";
  ctx.lineWidth = r * 0.25;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, r * 0.15);
  ctx.lineTo(-r * 0.96, r * 0.58);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r * 0.55, r * 0.15);
  ctx.lineTo(r * 0.98, r * 0.52);
  ctx.stroke();

  // Torso.
  const body = ctx.createLinearGradient(-r, -r, r, r);
  body.addColorStop(0, enemy.variant % 2 ? "#414b48" : "#4c4038");
  body.addColorStop(1, "#171c22");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.32, r * 0.83, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Ragged shirt cuts.
  ctx.strokeStyle = "rgba(0,0,0,.5)";
  ctx.lineWidth = 4;
  for (let i = -2; i <= 2; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * r * 0.22, r * 0.55);
    ctx.lineTo(i * r * 0.22 + (i % 2 ? 8 : -7), r * 0.98);
    ctx.stroke();
  }

  // Head.
  const skin = ctx.createRadialGradient(-r * 0.18, -r * 0.55, 3, 0, -r * 0.38, r * 0.7);
  skin.addColorStop(0, enemy.hitFlash > 0 ? "#ffe45b" : enemy.variant % 3 === 0 ? "#9a7252" : "#7c624b");
  skin.addColorStop(1, "#3a3028");
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.42, r * 0.58, r * 0.54, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#16120f";
  ctx.lineWidth = 4;
  ctx.stroke();

  // Ears.
  ctx.fillStyle = "#5a4738";
  ctx.beginPath();
  ctx.ellipse(-r * 0.57, -r * 0.4, r * 0.13, r * 0.18, -0.2, 0, Math.PI * 2);
  ctx.ellipse(r * 0.57, -r * 0.4, r * 0.13, r * 0.18, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Tiny horns.
  ctx.fillStyle = "#b9a173";
  ctx.beginPath();
  ctx.moveTo(-r * 0.35, -r * 0.83);
  ctx.lineTo(-r * 0.22, -r * 1.05);
  ctx.lineTo(-r * 0.08, -r * 0.76);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 0.32, -r * 0.82);
  ctx.lineTo(r * 0.46, -r * 1.02);
  ctx.lineTo(r * 0.49, -r * 0.69);
  ctx.closePath();
  ctx.fill();

  // Angry brows and eyes.
  ctx.strokeStyle = "#100d0b";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-r * 0.38, -r * 0.55);
  ctx.lineTo(-r * 0.08, -r * 0.45);
  ctx.moveTo(r * 0.38, -r * 0.55);
  ctx.lineTo(r * 0.08, -r * 0.45);
  ctx.stroke();
  ctx.fillStyle = enemy.hitFlash > 0 ? "#ffffff" : "#ff4d35";
  ctx.beginPath();
  ctx.arc(-r * 0.2, -r * 0.42, r * 0.055, 0, Math.PI * 2);
  ctx.arc(r * 0.2, -r * 0.42, r * 0.055, 0, Math.PI * 2);
  ctx.fill();

  // Nose.
  ctx.fillStyle = "rgba(20,12,8,.55)";
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.27, r * 0.12, r * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mouth + uneven teeth.
  ctx.fillStyle = "#160c0a";
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.08, r * 0.34, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d9cba5";
  for (let i = -2; i <= 2; i += 1) {
    const toothW = r * 0.11;
    ctx.beginPath();
    ctx.moveTo(i * toothW - toothW * 0.35, -r * 0.22);
    ctx.lineTo(i * toothW + toothW * 0.35, -r * 0.22);
    ctx.lineTo(i * toothW, -r * (0.06 + (i % 2 ? 0.03 : 0)));
    ctx.closePath();
    ctx.fill();
  }

  // HP bar.
  const hpRatio = Math.max(0, enemy.hp / enemy.maxHp);
  roundedRect(ctx, -r * 0.65, -r * 1.25, r * 1.3, 9, 5);
  ctx.fillStyle = "rgba(0,0,0,.58)";
  ctx.fill();
  if (hpRatio > 0) {
    roundedRect(ctx, -r * 0.65, -r * 1.25, r * 1.3 * hpRatio, 9, 5);
    ctx.fillStyle = hpRatio > 0.5 ? "#22d3ee" : hpRatio > 0.25 ? "#facc15" : "#ef4444";
    ctx.fill();
  }

  ctx.restore();
}

export default function ComePlayersArcade({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const keysRef = useRef(new Set<string>());
  const fireHeldRef = useRef(false);
  const fullscreenRef = useRef(false);
  const engineRef = useRef({
    playerY: HEIGHT * 0.5,
    targetY: HEIGHT * 0.5,
    recoil: 0,
    bowPulse: 0,
    arrows: [] as Arrow[],
    enemies: [] as Enemy[],
    particles: [] as Particle[],
    texts: [] as FloatingText[],
    stars: Array.from({ length: 55 }, (_, index) => ({
      x: (index * 173) % WIDTH,
      y: (index * 91) % HEIGHT,
      size: 0.5 + ((index * 37) % 20) / 10,
      speed: 8 + ((index * 29) % 24),
    })),
    score: 0,
    combo: 0,
    shield: 3,
    status: "ready" as GameStatus,
    spawnTimer: 0,
    nextSpawn: 0.9,
    lastFire: -10,
    elapsed: 0,
    id: 1,
    shake: 0,
    flash: 0,
  });

  const [activeGame, setActiveGame] = useState<(typeof arcadeGames)[number]["id"]>("arrow");
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [snapshot, setSnapshot] = useState<GameSnapshot>({
    score: 0,
    combo: 0,
    shield: 3,
    status: "ready",
  });
  const [best, setBest] = useState(0);

  useEffect(() => {
    const image = new Image();
    image.src = "/games/alexia-archer.png";
    imageRef.current = image;
    try {
      const stored = Number(window.localStorage.getItem(BEST_KEY) || 0);
      if (Number.isFinite(stored)) setBest(stored);
    } catch {
      // Private browsing can disable storage; the game still runs normally.
    }
  }, []);

  const playTone = useCallback(
    (frequency: number, duration: number, type: OscillatorType, gain = 0.04) => {
      if (muted) return;
      try {
        const AudioCtor = window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;
        const audio = audioRef.current || new AudioCtor();
        audioRef.current = audio;
        const oscillator = audio.createOscillator();
        const volume = audio.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(
          Math.max(55, frequency * 0.72),
          audio.currentTime + duration,
        );
        volume.gain.setValueAtTime(gain, audio.currentTime);
        volume.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
        oscillator.connect(volume);
        volume.connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + duration);
      } catch {
        // Audio is enhancement only.
      }
    },
    [muted],
  );

  const syncSnapshot = useCallback(() => {
    const engine = engineRef.current;
    setSnapshot({
      score: engine.score,
      combo: engine.combo,
      shield: engine.shield,
      status: engine.status,
    });
  }, []);

  const resetGame = useCallback(() => {
    const engine = engineRef.current;
    engine.playerY = HEIGHT * 0.5;
    engine.targetY = HEIGHT * 0.5;
    engine.recoil = 0;
    engine.bowPulse = 0;
    engine.arrows = [];
    engine.enemies = [];
    engine.particles = [];
    engine.texts = [];
    engine.score = 0;
    engine.combo = 0;
    engine.shield = 3;
    engine.status = "live";
    engine.spawnTimer = 0;
    engine.nextSpawn = 0.8;
    engine.lastFire = -10;
    engine.elapsed = 0;
    engine.shake = 0;
    engine.flash = 0;
    syncSnapshot();
    playTone(440, 0.12, "sine", 0.05);
  }, [playTone, syncSnapshot]);

  const togglePause = useCallback(() => {
    const engine = engineRef.current;
    if (engine.status === "ready" || engine.status === "gameover") {
      resetGame();
      return;
    }
    engine.status = engine.status === "paused" ? "live" : "paused";
    syncSnapshot();
  }, [resetGame, syncSnapshot]);

  const fireArrow = useCallback(() => {
    const engine = engineRef.current;
    if (engine.status === "ready") {
      resetGame();
      return;
    }
    if (engine.status !== "live") return;
    if (engine.elapsed - engine.lastFire < 0.16) return;
    engine.lastFire = engine.elapsed;
    engine.recoil = 1;
    engine.bowPulse = 1;
    engine.arrows.push({
      id: engine.id++,
      x: PLAYER_X + 125,
      y: engine.playerY - 12,
      vx: 820,
      trail: [],
    });
    for (let index = 0; index < 5; index += 1) {
      engine.particles.push({
        id: engine.id++,
        x: PLAYER_X + 112,
        y: engine.playerY - 12,
        vx: 50 + Math.random() * 80,
        vy: (Math.random() - 0.5) * 60,
        life: 0.18 + Math.random() * 0.18,
        maxLife: 0.36,
        size: 2 + Math.random() * 2,
        kind: "spark",
      });
    }
    playTone(610, 0.09, "triangle", 0.035);
  }, [playTone, resetGame]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "KeyW", "KeyS", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      keysRef.current.add(event.code);
      if (event.code === "Space") {
        fireHeldRef.current = true;
        fireArrow();
      }
      if (event.code === "KeyP" || event.code === "Escape") togglePause();
    };
    const up = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
      if (event.code === "Space") fireHeldRef.current = false;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [fireArrow, togglePause]);

  useEffect(() => {
    const onFullscreenChange = () => {
      fullscreenRef.current = Boolean(document.fullscreenElement);
      setIsFullscreen(fullscreenRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await shellRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // Browser or embedded webview can deny fullscreen.
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const normalizedY = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * HEIGHT;
    engineRef.current.targetY = Math.max(165, Math.min(HEIGHT - 105, normalizedY));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    fireHeldRef.current = true;
    handlePointerMove(event);
    fireArrow();
  };

  const handlePointerUp = () => {
    fireHeldRef.current = false;
  };

  useEffect(() => {
    if (activeGame !== "arrow") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let previous = performance.now();
    let snapshotClock = 0;
    let cancelled = false;

    const spawnEnemy = () => {
      const engine = engineRef.current;
      const elapsedScale = Math.min(1.7, 1 + engine.elapsed / 95);
      const variant = Math.floor(Math.random() * 6);
      const radius = 44 + Math.random() * 24;
      const maxHp = engine.elapsed > 35 && Math.random() < 0.25 ? 2 : 1;
      engine.enemies.push({
        id: engine.id++,
        x: WIDTH + radius + Math.random() * 80,
        y: 175 + Math.random() * (HEIGHT - 300),
        speed: (98 + Math.random() * 42) * elapsedScale,
        radius,
        hp: maxHp,
        maxHp,
        wobble: 0,
        phase: Math.random() * Math.PI * 2,
        variant,
        hitFlash: 0,
      });
    };

    const burst = (x: number, y: number, amount: number) => {
      const engine = engineRef.current;
      for (let index = 0; index < amount; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 80 + Math.random() * 300;
        engine.particles.push({
          id: engine.id++,
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.25 + Math.random() * 0.55,
          maxLife: 0.8,
          size: 2 + Math.random() * 6,
          kind: index % 5 === 0 ? "smoke" : index % 3 === 0 ? "ember" : "spark",
        });
      }
    };

    const update = (dt: number) => {
      const engine = engineRef.current;
      if (engine.status !== "live") return;
      engine.elapsed += dt;
      engine.spawnTimer += dt;
      engine.recoil = Math.max(0, engine.recoil - dt * 7.5);
      engine.bowPulse = Math.max(0, engine.bowPulse - dt * 4.5);
      engine.shake = Math.max(0, engine.shake - dt * 3.8);
      engine.flash = Math.max(0, engine.flash - dt * 4.2);

      const up = keysRef.current.has("ArrowUp") || keysRef.current.has("KeyW");
      const down = keysRef.current.has("ArrowDown") || keysRef.current.has("KeyS");
      if (up) engine.targetY -= 380 * dt;
      if (down) engine.targetY += 380 * dt;
      engine.targetY = Math.max(165, Math.min(HEIGHT - 105, engine.targetY));
      engine.playerY += (engine.targetY - engine.playerY) * Math.min(1, dt * 12);

      if (fireHeldRef.current) fireArrow();

      if (engine.spawnTimer >= engine.nextSpawn) {
        engine.spawnTimer = 0;
        spawnEnemy();
        engine.nextSpawn = Math.max(0.36, 1.03 - engine.elapsed * 0.006) * (0.83 + Math.random() * 0.34);
      }

      for (const star of engine.stars) {
        star.x -= star.speed * dt;
        if (star.x < -10) {
          star.x = WIDTH + Math.random() * 90;
          star.y = Math.random() * HEIGHT;
        }
      }

      for (const arrow of engine.arrows) {
        arrow.trail.unshift({ x: arrow.x, y: arrow.y });
        if (arrow.trail.length > 8) arrow.trail.pop();
        arrow.x += arrow.vx * dt;
      }

      for (const enemy of engine.enemies) {
        enemy.x -= enemy.speed * dt;
        enemy.wobble += dt;
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 6);
      }

      const hitArrows = new Set<number>();
      const deadEnemies = new Set<number>();
      for (const arrow of engine.arrows) {
        for (const enemy of engine.enemies) {
          if (hitArrows.has(arrow.id) || deadEnemies.has(enemy.id)) continue;
          const dx = arrow.x - enemy.x;
          const dy = arrow.y - enemy.y;
          if (dx * dx + dy * dy < (enemy.radius * 0.68) ** 2) {
            hitArrows.add(arrow.id);
            enemy.hp -= 1;
            enemy.hitFlash = 1;
            engine.shake = Math.max(engine.shake, 0.28);
            burst(arrow.x, arrow.y, enemy.hp <= 0 ? 23 : 11);
            if (enemy.hp <= 0) {
              deadEnemies.add(enemy.id);
              engine.combo += 1;
              const points = 100 + Math.min(900, engine.combo * 18);
              engine.score += points;
              engine.texts.push({
                id: engine.id++,
                x: enemy.x,
                y: enemy.y - enemy.radius,
                text: engine.combo > 1 ? `+${points}  x${engine.combo}` : `+${points}`,
                life: 0.85,
                tone: engine.combo > 2 ? "combo" : "score",
              });
              playTone(engine.combo % 5 === 0 ? 880 : 240 + Math.min(360, engine.combo * 16), 0.11, "square", 0.03);
            } else {
              engine.texts.push({
                id: engine.id++,
                x: enemy.x,
                y: enemy.y - enemy.radius,
                text: "ARMOR BREAK",
                life: 0.55,
                tone: "damage",
              });
              playTone(130, 0.1, "sawtooth", 0.04);
            }
          }
        }
      }

      for (const enemy of engine.enemies) {
        if (!deadEnemies.has(enemy.id) && enemy.x < PLAYER_X + 76) {
          deadEnemies.add(enemy.id);
          engine.shield -= 1;
          engine.combo = 0;
          engine.shake = 1;
          engine.flash = 1;
          burst(PLAYER_X + 70, enemy.y, 30);
          engine.texts.push({
            id: engine.id++,
            x: PLAYER_X + 120,
            y: enemy.y,
            text: "SHIELD HIT!",
            life: 0.85,
            tone: "damage",
          });
          playTone(95, 0.24, "sawtooth", 0.07);
          if (engine.shield <= 0) {
            engine.status = "gameover";
            if (engine.score > best) {
              setBest(engine.score);
              try {
                window.localStorage.setItem(BEST_KEY, String(engine.score));
              } catch {
                // Ignore storage failures.
              }
            }
          }
        }
      }

      engine.arrows = engine.arrows.filter((arrow) => arrow.x < WIDTH + 90 && !hitArrows.has(arrow.id));
      engine.enemies = engine.enemies.filter((enemy) => enemy.x > -100 && !deadEnemies.has(enemy.id));

      for (const particle of engine.particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= Math.pow(0.12, dt);
        particle.vy += (particle.kind === "smoke" ? -20 : 180) * dt;
        particle.life -= dt;
      }
      engine.particles = engine.particles.filter((particle) => particle.life > 0);

      for (const text of engine.texts) {
        text.life -= dt;
        text.y -= 38 * dt;
      }
      engine.texts = engine.texts.filter((text) => text.life > 0);
    };

    const draw = (now: number) => {
      const engine = engineRef.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
      const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform((pixelWidth / WIDTH), 0, 0, (pixelHeight / HEIGHT), 0, 0);
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      ctx.save();
      if (engine.shake > 0) {
        const amount = engine.shake * 8;
        ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
      }

      const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
      background.addColorStop(0, "#030a13");
      background.addColorStop(0.52, "#04121d");
      background.addColorStop(1, "#02070d");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const ambient = ctx.createRadialGradient(PLAYER_X + 50, engine.playerY, 20, PLAYER_X + 50, engine.playerY, 460);
      ambient.addColorStop(0, "rgba(250,204,21,.12)");
      ambient.addColorStop(0.52, "rgba(34,211,238,.055)");
      ambient.addColorStop(1, "rgba(2,6,12,0)");
      ctx.fillStyle = ambient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Perspective arena grid.
      ctx.strokeStyle = "rgba(34,211,238,.095)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= WIDTH; x += 120) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }
      for (let y = 105; y <= HEIGHT; y += 92) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(250,204,21,.11)";
      ctx.beginPath();
      ctx.moveTo(0, HEIGHT - 62);
      ctx.lineTo(WIDTH, HEIGHT - 62);
      ctx.stroke();

      for (const star of engine.stars) {
        ctx.fillStyle = `rgba(125,211,252,${0.12 + star.size * 0.05})`;
        ctx.fillRect(star.x, star.y, star.size * 2.4, star.size);
      }

      // Player lane halo.
      const laneGlow = ctx.createLinearGradient(0, 0, 470, 0);
      laneGlow.addColorStop(0, "rgba(250,204,21,.12)");
      laneGlow.addColorStop(1, "rgba(250,204,21,0)");
      ctx.fillStyle = laneGlow;
      ctx.fillRect(0, 88, 500, HEIGHT - 150);

      // Alexia archer image with eased movement and recoil.
      const image = imageRef.current;
      const breathing = Math.sin(now * 0.0048) * 2.2;
      const recoilX = engine.recoil * -12;
      const recoilRotation = engine.recoil * -0.022;
      ctx.save();
      ctx.translate(recoilX, breathing);
      ctx.translate(218, engine.playerY);
      ctx.rotate(recoilRotation);
      const drawHeight = 448;
      const drawWidth = drawHeight * (560 / 760);
      if (image?.complete && image.naturalWidth > 0) {
        ctx.globalAlpha = 0.98;
        ctx.drawImage(image, -drawWidth * 0.55, -drawHeight * 0.54, drawWidth, drawHeight);
      } else {
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.arc(0, 0, 55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Bow charge/shot light at arrow rest.
      const pulse = 0.35 + engine.bowPulse * 0.65 + Math.sin(now * 0.012) * 0.08;
      const bowGlow = ctx.createRadialGradient(PLAYER_X + 115, engine.playerY - 12, 2, PLAYER_X + 115, engine.playerY - 12, 48 + pulse * 22);
      bowGlow.addColorStop(0, `rgba(255,255,210,${0.65 + pulse * 0.25})`);
      bowGlow.addColorStop(0.22, `rgba(250,204,21,${0.42 + pulse * 0.2})`);
      bowGlow.addColorStop(1, "rgba(34,211,238,0)");
      ctx.fillStyle = bowGlow;
      ctx.fillRect(PLAYER_X + 55, engine.playerY - 74, 130, 125);

      // Arrows and trails.
      for (const arrow of engine.arrows) {
        for (let index = arrow.trail.length - 1; index >= 0; index -= 1) {
          const point = arrow.trail[index];
          const alpha = (arrow.trail.length - index) / arrow.trail.length;
          ctx.strokeStyle = `rgba(34,211,238,${alpha * 0.22})`;
          ctx.lineWidth = 2 + alpha * 4;
          ctx.beginPath();
          ctx.moveTo(point.x - 40, point.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }
        ctx.shadowColor = "#67e8f9";
        ctx.shadowBlur = 18;
        ctx.strokeStyle = "#e0faff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(arrow.x - 42, arrow.y);
        ctx.lineTo(arrow.x + 22, arrow.y);
        ctx.stroke();
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.moveTo(arrow.x + 30, arrow.y);
        ctx.lineTo(arrow.x + 12, arrow.y - 8);
        ctx.lineTo(arrow.x + 15, arrow.y);
        ctx.lineTo(arrow.x + 12, arrow.y + 8);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      for (const enemy of engine.enemies) drawEnemy(ctx, enemy, now);

      for (const particle of engine.particles) {
        const alpha = Math.max(0, particle.life / particle.maxLife);
        if (particle.kind === "smoke") {
          ctx.fillStyle = `rgba(60,72,82,${alpha * 0.42})`;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size * (1.5 + (1 - alpha) * 1.4), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = particle.kind === "ember" ? `rgba(249,115,22,${alpha})` : `rgba(250,204,21,${alpha})`;
          ctx.shadowColor = particle.kind === "ember" ? "#f97316" : "#facc15";
          ctx.shadowBlur = 9;
          ctx.fillRect(particle.x, particle.y, particle.size, particle.size * 0.55);
          ctx.shadowBlur = 0;
        }
      }

      ctx.textAlign = "center";
      ctx.font = "900 19px system-ui, sans-serif";
      for (const text of engine.texts) {
        const alpha = Math.min(1, text.life * 2.2);
        ctx.fillStyle = text.tone === "combo" ? `rgba(250,204,21,${alpha})` : text.tone === "damage" ? `rgba(248,113,113,${alpha})` : `rgba(165,243,252,${alpha})`;
        ctx.shadowColor = "rgba(0,0,0,.9)";
        ctx.shadowBlur = 8;
        ctx.fillText(text.text, text.x, text.y);
        ctx.shadowBlur = 0;
      }

      // Edge warning line.
      ctx.strokeStyle = "rgba(239,68,68,.42)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 12]);
      ctx.beginPath();
      ctx.moveTo(PLAYER_X + 76, 92);
      ctx.lineTo(PLAYER_X + 76, HEIGHT - 60);
      ctx.stroke();
      ctx.setLineDash([]);

      if (engine.flash > 0) {
        ctx.fillStyle = `rgba(239,68,68,${engine.flash * 0.18})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }

      if (engine.status !== "live") {
        ctx.fillStyle = "rgba(0,5,11,.72)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        const panelW = 460;
        const panelH = engine.status === "gameover" ? 245 : 220;
        roundedRect(ctx, WIDTH / 2 - panelW / 2, HEIGHT / 2 - panelH / 2, panelW, panelH, 26);
        ctx.fillStyle = "rgba(4,18,31,.96)";
        ctx.fill();
        ctx.strokeStyle = engine.status === "gameover" ? "rgba(239,68,68,.65)" : "rgba(34,211,238,.55)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 34px system-ui, sans-serif";
        ctx.fillText(engine.status === "gameover" ? "ARENA OVERRUN" : engine.status === "paused" ? "PAUSED" : "ALEXIA ARROW", WIDTH / 2, HEIGHT / 2 - 55);
        ctx.fillStyle = "#a5f3fc";
        ctx.font = "700 16px system-ui, sans-serif";
        ctx.fillText(engine.status === "gameover" ? `Final score ${engine.score.toLocaleString()}` : "Move with W/S or pointer. Hold Space/click to fire.", WIDTH / 2, HEIGHT / 2 - 15);
        ctx.fillStyle = "#facc15";
        ctx.font = "900 19px system-ui, sans-serif";
        ctx.fillText(engine.status === "paused" ? "PRESS P TO CONTINUE" : engine.status === "gameover" ? "PRESS SPACE TO RETRY" : "PRESS SPACE TO START", WIDTH / 2, HEIGHT / 2 + 42);
        if (engine.status === "gameover") {
          ctx.fillStyle = "rgba(255,255,255,.58)";
          ctx.font = "700 14px system-ui, sans-serif";
          ctx.fillText("Protect Alexia's shield and keep the combo alive.", WIDTH / 2, HEIGHT / 2 + 83);
        }
      }

      ctx.restore();
    };

    const frame = (now: number) => {
      if (cancelled) return;
      const rawDt = Math.min(0.035, Math.max(0, (now - previous) / 1000));
      previous = now;
      // Two small simulation steps reduce tunnelling and keep movement smooth on slower devices.
      const steps = rawDt > 0.02 ? 2 : 1;
      for (let step = 0; step < steps; step += 1) update(rawDt / steps);
      snapshotClock += rawDt;
      if (snapshotClock > 0.1) {
        snapshotClock = 0;
        syncSnapshot();
      }
      draw(now);
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [activeGame, best, fireArrow, playTone, syncSnapshot]);

  useEffect(() => {
    return () => {
      if (audioRef.current) void audioRef.current.close().catch(() => undefined);
    };
  }, []);

  const statusLabel = useMemo(() => {
    if (snapshot.status === "live") return "LIVE";
    if (snapshot.status === "paused") return "PAUSED";
    if (snapshot.status === "gameover") return "DEFEATED";
    return "READY";
  }, [snapshot.status]);

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="ComePlayers Arcade">
      <div ref={shellRef} className={styles.window}>
        <header className={styles.windowHeader}>
          <button type="button" className={styles.backButton} onClick={onClose} aria-label="Close arcade">
            <FaArrowLeft />
          </button>
          <div className={styles.titleBlock}>
            <span>COMEPLAYERS ARCADE</span>
            <strong>ComePlayers Arena</strong>
          </div>
          <div className={styles.windowActions}>
            <button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Enable game sound" : "Mute game sound"}>
              {muted ? <FaVolumeMute /> : <FaVolumeUp />}
            </button>
            <button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
              <FaExpand />
            </button>
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close arcade">
              <FaTimes />
            </button>
          </div>
        </header>

        <div className={styles.body}>
          <aside className={styles.gameList}>
            <p className={styles.sectionLabel}>INSTANT GAMES</p>
            <div className={styles.gameScroll}>
              {arcadeGames.map((game) => {
                const Icon = game.icon;
                const selected = game.id === activeGame;
                return (
                  <button
                    type="button"
                    key={game.id}
                    className={`${styles.gameItem} ${selected ? styles.gameItemActive : ""}`}
                    onClick={() => setActiveGame(game.id)}
                  >
                    <span className={styles.gameIcon}><Icon /></span>
                    <span className={styles.gameCopy}>
                      <strong>{game.label}</strong>
                      <small>{game.subtitle}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className={styles.stageColumn}>
            {activeGame === "arrow" ? (
              <>
                <div className={styles.gameHero}>
                  <div>
                    <h2>Alexia Arrow Assault</h2>
                    <p>Alexia holds back the Ugly Bastard assault with ComePlayers energy arrows.</p>
                  </div>
                  <div className={styles.controlsBadge}>W/S or pointer to move · Space/click to shoot</div>
                </div>

                <div className={styles.statsRow}>
                  <div className={styles.statCard}>
                    <span>SCORE</span>
                    <strong>{snapshot.score.toLocaleString()}</strong>
                  </div>
                  <div className={`${styles.statCard} ${styles.bestCard}`}>
                    <span>BEST</span>
                    <strong>{Math.max(best, snapshot.score).toLocaleString()}</strong>
                  </div>
                  <div className={styles.statCard}>
                    <span>STATUS</span>
                    <strong className={snapshot.status === "gameover" ? styles.dangerText : styles.liveText}>{statusLabel}</strong>
                  </div>
                  <div className={styles.shieldCard}>
                    <FaShieldAlt />
                    <span>Shield {snapshot.shield}</span>
                  </div>
                </div>

                <div className={styles.canvasShell}>
                  <canvas
                    ref={canvasRef}
                    className={styles.canvas}
                    onPointerMove={handlePointerMove}
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    aria-label="Alexia Arrow Assault game canvas"
                  />
                  <div className={styles.comboBadge} style={{ "--combo-scale": Math.min(1.18, 1 + snapshot.combo * 0.008) } as CSSProperties}>
                    COMBO <strong>x{snapshot.combo}</strong>
                  </div>
                  <div className={styles.canvasActions}>
                    <button type="button" onClick={togglePause}>
                      {snapshot.status === "live" ? <FaPause /> : <FaPlay />}
                      {snapshot.status === "live" ? "Pause" : snapshot.status === "paused" ? "Continue" : "Start"}
                    </button>
                    <button type="button" onClick={resetGame}>
                      <FaRedo /> Restart
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.comingSoon}>
                <span><FaGamepad /></span>
                <h2>{arcadeGames.find((game) => game.id === activeGame)?.label}</h2>
                <p>This game remains available in the arcade list. Choose <strong>Alexia Arrow</strong> to play the newly implemented design.</p>
                <button type="button" onClick={() => setActiveGame("arrow")}>Play Alexia Arrow</button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
