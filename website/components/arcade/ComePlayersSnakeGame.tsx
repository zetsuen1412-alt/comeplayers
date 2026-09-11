"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  FaBolt,
  FaCirclePlay,
  FaCrown,
  FaGamepad,
  FaHeadphones,
  FaMagnifyingGlass,
  FaMedal,
  FaMusic,
  FaPause,
  FaPlus,
  FaRankingStar,
  FaRotateRight,
  FaSkullCrossbones,
  FaStaffSnake,
  FaWandMagicSparkles,
  FaVolumeHigh,
  FaVolumeXmark,
  FaWifi,
  FaXmark,
} from "react-icons/fa6";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { ArcadeGameProps } from "@/components/arcade/ArcadeGameTypes";

type Vec2 = { x: number; y: number };
type SnakeSkinId =
  | "alexia-gold"
  | "cyber-cyan"
  | "neon-pulse"
  | "void-violet"
  | "inferno"
  | "frost";
type SnakeMode = "solo" | "online" | null;
type RoomKind = "public" | "matchmaking";
type RoomStatus = "waiting" | "active" | "closed";

type SnakeSkin = {
  id: SnakeSkinId;
  name: string;
  primary: string;
  secondary: string;
  glow: string;
  eye: string;
};

type SnakeState = {
  id: string;
  name: string;
  skin: SnakeSkinId;
  points: Vec2[];
  angle: number;
  targetAngle: number;
  score: number;
  alive: boolean;
  boosting: boolean;
  respawnAt: number;
  lastDropAt: number;
};

type RemoteSnake = {
  id: string;
  name: string;
  skin: SnakeSkinId;
  points: Vec2[];
  targetPoints: Vec2[];
  angle: number;
  score: number;
  alive: boolean;
  boosting: boolean;
  lastSeenAt: number;
};

type Orb = {
  id: string;
  x: number;
  y: number;
  value: number;
  hue: number;
  pulse: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type SnakeRoomRow = {
  id: string;
  room_name: string;
  room_kind: RoomKind;
  host_player_id: string;
  host_player_name: string;
  max_players: number;
  player_count: number;
  status: RoomStatus;
  map_theme: string;
  created_at: string;
  updated_at: string;
};

type BroadcastSnapshot = {
  id: string;
  name: string;
  skin: SnakeSkinId;
  points: Vec2[];
  angle: number;
  score: number;
  alive: boolean;
  boosting: boolean;
  sentAt: number;
};

type GameRuntime = {
  local: SnakeState;
  bots: Map<string, SnakeState>;
  remotes: Map<string, RemoteSnake>;
  orbs: Map<string, Orb>;
  particles: Particle[];
  camera: Vec2;
  cameraZoom: number;
  target: Vec2;
  viewport: { width: number; height: number; dpr: number };
  lastFrameAt: number;
  lastBroadcastAt: number;
  lastScoreReported: number;
  worldSeed: number;
  playing: boolean;
  paused: boolean;
  roundStartedAt: number;
  kills: number;
  rank: number;
};

const WORLD_RADIUS = 2350;
const START_SCORE = 28;
const BASE_BODY_POINTS = 24;
const MAX_BODY_POINTS = 180;
const SNAPSHOT_INTERVAL = 90;
const REMOTE_TIMEOUT = 4_500;
const SCORE_STORAGE_KEY = "comeplayers_snake_skin_v54";

const SKINS: SnakeSkin[] = [
  {
    id: "alexia-gold",
    name: "Alexia Gold",
    primary: "#ffd633",
    secondary: "#111827",
    glow: "#facc15",
    eye: "#ffffff",
  },
  {
    id: "cyber-cyan",
    name: "Cyber Cyan",
    primary: "#37e8ff",
    secondary: "#073b4c",
    glow: "#22d3ee",
    eye: "#ffffff",
  },
  {
    id: "neon-pulse",
    name: "Neon Pulse",
    primary: "#ff4fd8",
    secondary: "#6d28d9",
    glow: "#f472b6",
    eye: "#ffffff",
  },
  {
    id: "void-violet",
    name: "Void Violet",
    primary: "#a78bfa",
    secondary: "#21134f",
    glow: "#8b5cf6",
    eye: "#ffffff",
  },
  {
    id: "inferno",
    name: "Inferno",
    primary: "#ff7a18",
    secondary: "#7f1d1d",
    glow: "#fb923c",
    eye: "#fff7ed",
  },
  {
    id: "frost",
    name: "Frost Byte",
    primary: "#e0f2fe",
    secondary: "#0369a1",
    glow: "#7dd3fc",
    eye: "#07111f",
  },
];

const BOT_NAMES = [
  "NeonRex",
  "ByteViper",
  "GhostPixel",
  "NovaStrike",
  "CyberMamba",
  "TurboNoodle",
  "CP Hunter",
  "NightCircuit",
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpAngle(current: number, target: number, t: number) {
  let delta = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  delta = clamp(delta, -Math.PI * 0.85, Math.PI * 0.85);
  return current + delta * t;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function randomArenaPoint(random: () => number, padding = 100): Vec2 {
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random()) * (WORLD_RADIUS - padding);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function skinById(id: SnakeSkinId) {
  return SKINS.find((skin) => skin.id === id) || SKINS[0];
}

function createSnake(
  id: string,
  name: string,
  skin: SnakeSkinId,
  spawn: Vec2,
  angle: number,
): SnakeState {
  const points = Array.from({ length: BASE_BODY_POINTS }, (_, index) => ({
    x: spawn.x - Math.cos(angle) * index * 13,
    y: spawn.y - Math.sin(angle) * index * 13,
  }));
  return {
    id,
    name,
    skin,
    points,
    angle,
    targetAngle: angle,
    score: START_SCORE,
    alive: true,
    boosting: false,
    respawnAt: 0,
    lastDropAt: 0,
  };
}

function createOrb(id: string, random: () => number, value?: number): Orb {
  const point = randomArenaPoint(random, 75);
  return {
    id,
    x: point.x,
    y: point.y,
    value: value || 1 + Math.floor(random() * 4),
    hue: Math.floor(random() * 360),
    pulse: random() * Math.PI * 2,
  };
}

function seedOrbs(seed: number, count = 480) {
  const random = mulberry32(seed);
  const map = new Map<string, Orb>();
  for (let index = 0; index < count; index += 1) {
    const id = `seed-${seed}-${index}`;
    map.set(id, createOrb(id, random));
  }
  return map;
}

function replacementOrb(claimedId: string, worldSeed: number) {
  const seed = hashString(`${claimedId}:${worldSeed}:replacement`);
  const random = mulberry32(seed);
  return createOrb(`replacement-${seed}`, random);
}

function safeSkin(value: unknown): SnakeSkinId {
  return SKINS.some((skin) => skin.id === value)
    ? (value as SnakeSkinId)
    : "alexia-gold";
}

function safeRoomRows(value: unknown): SnakeRoomRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is SnakeRoomRow => {
    if (!entry || typeof entry !== "object") return false;
    const row = entry as Partial<SnakeRoomRow>;
    return typeof row.id === "string" && typeof row.room_name === "string";
  });
}

function createRuntime(
  playerId: string,
  playerName: string,
  skin: SnakeSkinId,
  seed: number,
  solo: boolean,
): GameRuntime {
  const random = mulberry32(seed ^ hashString(playerId));
  const spawn = randomArenaPoint(random, 650);
  const angle = random() * Math.PI * 2;
  const local = createSnake(playerId, playerName, skin, spawn, angle);
  const bots = new Map<string, SnakeState>();
  if (solo) {
    BOT_NAMES.forEach((name, index) => {
      const botRandom = mulberry32(seed + index * 9719);
      const botSpawn = randomArenaPoint(botRandom, 520);
      const botSkin = SKINS[(index + 1) % SKINS.length].id;
      const bot = createSnake(`bot-${index}`, name, botSkin, botSpawn, botRandom() * Math.PI * 2);
      bot.score = START_SCORE + Math.floor(botRandom() * 90);
      bots.set(bot.id, bot);
    });
  }
  return {
    local,
    bots,
    remotes: new Map(),
    orbs: seedOrbs(seed),
    particles: [],
    camera: { ...spawn },
    cameraZoom: 1,
    target: { ...spawn },
    viewport: { width: 1280, height: 720, dpr: 1 },
    lastFrameAt: performance.now(),
    lastBroadcastAt: 0,
    lastScoreReported: 0,
    worldSeed: seed,
    playing: true,
    paused: false,
    roundStartedAt: Date.now(),
    kills: 0,
    rank: 1,
  };
}

function normalizeSnapshot(value: unknown): BroadcastSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<BroadcastSnapshot>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.name !== "string" ||
    !Array.isArray(raw.points) ||
    typeof raw.angle !== "number" ||
    typeof raw.score !== "number"
  ) {
    return null;
  }
  const points = raw.points
    .filter(
      (point): point is Vec2 =>
        Boolean(
          point &&
            typeof point === "object" &&
            typeof (point as Vec2).x === "number" &&
            typeof (point as Vec2).y === "number",
        ),
    )
    .slice(0, MAX_BODY_POINTS);
  if (points.length < 2) return null;
  return {
    id: raw.id,
    name: raw.name.slice(0, 32),
    skin: safeSkin(raw.skin),
    points,
    angle: raw.angle,
    score: Math.max(0, raw.score),
    alive: raw.alive !== false,
    boosting: Boolean(raw.boosting),
    sentAt: typeof raw.sentAt === "number" ? raw.sentAt : Date.now(),
  };
}

function compactPoints(points: Vec2[]) {
  if (points.length <= 64) return points.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }));
  const step = Math.ceil(points.length / 64);
  const result: Vec2[] = [];
  for (let index = 0; index < points.length; index += step) {
    result.push({ x: Math.round(points[index].x), y: Math.round(points[index].y) });
  }
  const tail = points[points.length - 1];
  if (result[result.length - 1] !== tail) result.push({ x: Math.round(tail.x), y: Math.round(tail.y) });
  return result;
}

function formatScore(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString("id-ID");
}

function getPlayerName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const metadata = user.user_metadata || {};
  const candidate =
    metadata.username || metadata.full_name || metadata.name || user.email?.split("@")[0];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim().slice(0, 28)
    : "ComePlayers Player";
}

function snakeRadius(score: number) {
  return clamp(10 + Math.sqrt(Math.max(0, score)) * 0.42, 11, 22);
}

function bodyTargetCount(score: number) {
  return clamp(BASE_BODY_POINTS + Math.floor(score / 4), BASE_BODY_POINTS, MAX_BODY_POINTS);
}

function addBurst(runtime: GameRuntime, point: Vec2, color: string, count = 12) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 35 + Math.random() * 145;
    runtime.particles.push({
      x: point.x,
      y: point.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.45,
      maxLife: 0.8,
      size: 2 + Math.random() * 5,
      color,
    });
  }
  if (runtime.particles.length > 320) runtime.particles.splice(0, runtime.particles.length - 320);
}

function advanceSnake(snake: SnakeState, delta: number) {
  if (!snake.alive || snake.points.length === 0) return;
  const turnRate = clamp(4.4 - snake.points.length * 0.008, 2.25, 4.4);
  snake.angle = lerpAngle(snake.angle, snake.targetAngle, clamp(delta * turnRate, 0, 1));
  const baseSpeed = 168 - clamp(snake.points.length * 0.12, 0, 20);
  const speed = snake.boosting && snake.score > START_SCORE + 4 ? baseSpeed * 1.55 : baseSpeed;
  const head = snake.points[0];
  head.x += Math.cos(snake.angle) * speed * delta;
  head.y += Math.sin(snake.angle) * speed * delta;

  const radius = snakeRadius(snake.score);
  const spacing = radius * 0.78;
  for (let index = 1; index < snake.points.length; index += 1) {
    const previous = snake.points[index - 1];
    const point = snake.points[index];
    const dx = previous.x - point.x;
    const dy = previous.y - point.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > spacing) {
      const move = dist - spacing;
      point.x += (dx / dist) * move;
      point.y += (dy / dist) * move;
    }
  }

  const targetCount = bodyTargetCount(snake.score);
  while (snake.points.length < targetCount) {
    const tail = snake.points[snake.points.length - 1];
    const beforeTail = snake.points[snake.points.length - 2] || tail;
    const dx = tail.x - beforeTail.x;
    const dy = tail.y - beforeTail.y;
    const dist = Math.hypot(dx, dy) || 1;
    snake.points.push({
      x: tail.x + (dx / dist) * spacing,
      y: tail.y + (dy / dist) * spacing,
    });
  }
  if (snake.points.length > targetCount) snake.points.length = targetCount;
}

function nearestOrbAngle(snake: SnakeState, orbs: Map<string, Orb>) {
  const head = snake.points[0];
  let nearest: Orb | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const orb of orbs.values()) {
    const dx = orb.x - head.x;
    const dy = orb.y - head.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < best) {
      best = distSq;
      nearest = orb;
    }
  }
  return nearest ? Math.atan2(nearest.y - head.y, nearest.x - head.x) : snake.angle;
}

function respawnSnake(snake: SnakeState, seed: number) {
  const random = mulberry32(seed ^ hashString(`${snake.id}:${Date.now()}`));
  const spawn = randomArenaPoint(random, 700);
  const angle = random() * Math.PI * 2;
  const fresh = createSnake(snake.id, snake.name, snake.skin, spawn, angle);
  Object.assign(snake, fresh);
}

export default function ComePlayersSnakeGame({ best, onScore }: ArcadeGameProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<GameRuntime | null>(null);
  const animationRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ambientTimerRef = useRef<number | null>(null);
  const modeRef = useRef<SnakeMode>(null);
  const activeRoomRef = useRef<SnakeRoomRow | null>(null);
  const userIdRef = useRef("");

  const [mode, setMode] = useState<SnakeMode>(null);
  const [selectedSkin, setSelectedSkin] = useState<SnakeSkinId>(() => {
    if (typeof window === "undefined") return "alexia-gold";
    return safeSkin(window.localStorage.getItem(SCORE_STORAGE_KEY));
  });
  const [rooms, setRooms] = useState<SnakeRoomRow[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomBusy, setRoomBusy] = useState("");
  const [roomName, setRoomName] = useState("Neon Arena");
  const [maxPlayers, setMaxPlayers] = useState(12);
  const [activeRoom, setActiveRoom] = useState<SnakeRoomRow | null>(null);
  const [playerName, setPlayerName] = useState("ComePlayers Player");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [kills, setKills] = useState(0);
  const [rank, setRank] = useState(1);
  const [playerCount, setPlayerCount] = useState(1);
  const [leaderboard, setLeaderboard] = useState<Array<{ id: string; name: string; score: number; skin: SnakeSkinId }>>([]);
  const [respawnSeconds, setRespawnSeconds] = useState(0);
  const [boosting, setBoosting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [localSnakeId, setLocalSnakeId] = useState("");

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const playTone = useCallback(
    (kind: "eat" | "boost" | "death" | "start" | "kill" | "click") => {
      if (!soundEnabled || typeof window === "undefined") return;
      try {
        const AudioContextClass = window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        const context = audioContextRef.current || new AudioContextClass();
        audioContextRef.current = context;
        if (context.state === "suspended") void context.resume();
        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const settings = {
          eat: { from: 540, to: 880, duration: 0.09, volume: 0.055, type: "sine" as OscillatorType },
          boost: { from: 180, to: 320, duration: 0.12, volume: 0.04, type: "sawtooth" as OscillatorType },
          death: { from: 180, to: 52, duration: 0.48, volume: 0.09, type: "sawtooth" as OscillatorType },
          start: { from: 240, to: 720, duration: 0.34, volume: 0.07, type: "triangle" as OscillatorType },
          kill: { from: 420, to: 1060, duration: 0.26, volume: 0.08, type: "square" as OscillatorType },
          click: { from: 320, to: 440, duration: 0.06, volume: 0.035, type: "sine" as OscillatorType },
        }[kind];
        oscillator.type = settings.type;
        oscillator.frequency.setValueAtTime(settings.from, now);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, settings.to), now + settings.duration);
        gain.gain.setValueAtTime(settings.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + settings.duration + 0.02);
      } catch {
        // Audio is decorative and may be blocked by the embedded webview.
      }
    },
    [soundEnabled],
  );

  useEffect(() => {
    if (!musicEnabled || !playing || typeof window === "undefined") {
      if (ambientTimerRef.current) window.clearInterval(ambientTimerRef.current);
      ambientTimerRef.current = null;
      return;
    }
    const pulse = () => {
      if (!soundEnabled) return;
      try {
        const AudioContextClass = window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        const context = audioContextRef.current || new AudioContextClass();
        audioContextRef.current = context;
        if (context.state === "suspended") return;
        const now = context.currentTime;
        [110, 164.81, 220].forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = index === 0 ? "sine" : "triangle";
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(index === 0 ? 0.014 : 0.007, now + index * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(now + index * 0.08);
          oscillator.stop(now + 1.4);
        });
      } catch {
        // Ignore audio failures.
      }
    };
    pulse();
    ambientTimerRef.current = window.setInterval(pulse, 4_200);
    return () => {
      if (ambientTimerRef.current) window.clearInterval(ambientTimerRef.current);
      ambientTimerRef.current = null;
    };
  }, [musicEnabled, playing, soundEnabled]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const user = data.session?.user;
      if (!user) return;
      setUserId(user.id);
      setPlayerName(getPlayerName(user));
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  const loadRooms = useCallback(async () => {
    if (!userId) return;
    setRoomsLoading(true);
    setError("");
    try {
      const { data, error: roomError } = await supabase
        .from("arcade_snake_rooms")
        .select("id,room_name,room_kind,host_player_id,host_player_name,max_players,player_count,status,map_theme,created_at,updated_at")
        .in("status", ["waiting", "active"])
        .gt("updated_at", new Date(Date.now() - 120_000).toISOString())
        .order("player_count", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(30);
      if (roomError) throw roomError;
      setRooms(safeRoomRows(data));
    } catch (roomError) {
      const message = roomError instanceof Error ? roomError.message : "Could not load snake rooms.";
      setError(
        message.toLowerCase().includes("arcade_snake_rooms")
          ? "Online Snake is not active yet. Run Supabase SQL migration V54 first."
          : message,
      );
    } finally {
      setRoomsLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    if (!userId || mode !== null) return;
    const initial = window.setTimeout(() => void loadRooms(), 0);
    const timer = window.setInterval(() => void loadRooms(), 12_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [loadRooms, mode, userId]);

  const disconnectChannel = useCallback(async () => {
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) {
      try {
        await channel.untrack();
      } catch {
        // Ignore if the socket is already closed.
      }
      await supabase.removeChannel(channel);
    }
    setConnected(false);
  }, [supabase]);

  const stopGame = useCallback(
    async (leaveRoom = true) => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      runtimeRef.current = null;
      setPlaying(false);
      setPaused(false);
      setBoosting(false);
      setScore(0);
      setKills(0);
      setLeaderboard([]);
      setRespawnSeconds(0);
      setLocalSnakeId("");
      await disconnectChannel();
      const room = activeRoomRef.current;
      if (leaveRoom && room && userIdRef.current) {
        void supabase.rpc("arcade_snake_leave_room", { p_room_id: room.id });
      }
      setActiveRoom(null);
      setMode(null);
    },
    [disconnectChannel, supabase],
  );

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      void disconnectChannel();
      const room = activeRoomRef.current;
      if (room && userIdRef.current) {
        void supabase.rpc("arcade_snake_leave_room", { p_room_id: room.id });
      }
    };
  }, [disconnectChannel, supabase]);

  const broadcast = useCallback(async (event: string, payload: Record<string, unknown>) => {
    const channel = channelRef.current;
    if (!channel) return;
    try {
      await channel.send({ type: "broadcast", event, payload });
    } catch {
      // Movement broadcasts are best-effort.
    }
  }, []);

  const consumeOrb = useCallback(
    (runtime: GameRuntime, orb: Orb, online: boolean) => {
      runtime.orbs.delete(orb.id);
      runtime.local.score += orb.value;
      addBurst(runtime, orb, `hsl(${orb.hue} 100% 65%)`, 7);
      const replacement = replacementOrb(orb.id, runtime.worldSeed);
      runtime.orbs.set(replacement.id, replacement);
      if (online) void broadcast("orb_claim", { id: orb.id });
      playTone("eat");
    },
    [broadcast, playTone],
  );

  const killLocalSnake = useCallback(
    (runtime: GameRuntime, killerId?: string) => {
      const snake = runtime.local;
      if (!snake.alive) return;
      snake.alive = false;
      snake.boosting = false;
      snake.respawnAt = Date.now() + 3_200;
      const skin = skinById(snake.skin);
      addBurst(runtime, snake.points[0], skin.glow, 34);
      const dropStep = Math.max(2, Math.floor(snake.points.length / 25));
      const dropped: Orb[] = [];
      for (let index = 0; index < snake.points.length; index += dropStep) {
        const point = snake.points[index];
        const id = `drop-${snake.id}-${Date.now()}-${index}`;
        const orb: Orb = {
          id,
          x: point.x + (Math.random() - 0.5) * 24,
          y: point.y + (Math.random() - 0.5) * 24,
          value: 3 + Math.floor(Math.random() * 5),
          hue: index % 2 === 0 ? 48 : 190,
          pulse: Math.random() * Math.PI * 2,
        };
        runtime.orbs.set(id, orb);
        dropped.push(orb);
      }
      if (modeRef.current === "online") {
        void broadcast("snake_death", {
          id: snake.id,
          killerId: killerId || null,
          dropped: dropped.slice(0, 38),
        });
      }
      playTone("death");
      setRespawnSeconds(4);
    },
    [broadcast, playTone],
  );

  const connectOnlineChannel = useCallback(
    async (room: SnakeRoomRow, runtime: GameRuntime) => {
      await disconnectChannel();
      const channel = supabase.channel(`arcade-snake:${room.id}`, {
        config: {
          broadcast: { self: false, ack: false },
          presence: { key: userId },
        },
      });

      channel
        .on("broadcast", { event: "snake_state" }, ({ payload }) => {
          const snapshot = normalizeSnapshot(payload);
          const current = runtimeRef.current;
          if (!snapshot || !current || snapshot.id === current.local.id) return;
          const existing = current.remotes.get(snapshot.id);
          if (existing) {
            existing.name = snapshot.name;
            existing.skin = snapshot.skin;
            existing.targetPoints = snapshot.points;
            existing.angle = snapshot.angle;
            existing.score = snapshot.score;
            existing.alive = snapshot.alive;
            existing.boosting = snapshot.boosting;
            existing.lastSeenAt = Date.now();
          } else {
            current.remotes.set(snapshot.id, {
              id: snapshot.id,
              name: snapshot.name,
              skin: snapshot.skin,
              points: snapshot.points.map((point) => ({ ...point })),
              targetPoints: snapshot.points.map((point) => ({ ...point })),
              angle: snapshot.angle,
              score: snapshot.score,
              alive: snapshot.alive,
              boosting: snapshot.boosting,
              lastSeenAt: Date.now(),
            });
          }
        })
        .on("broadcast", { event: "orb_claim" }, ({ payload }) => {
          const current = runtimeRef.current;
          const id = payload && typeof payload.id === "string" ? payload.id : "";
          if (!current || !id || !current.orbs.has(id)) return;
          current.orbs.delete(id);
          const replacement = replacementOrb(id, current.worldSeed);
          current.orbs.set(replacement.id, replacement);
        })
        .on("broadcast", { event: "snake_death" }, ({ payload }) => {
          const current = runtimeRef.current;
          if (!current || !payload || typeof payload !== "object") return;
          const raw = payload as { id?: unknown; killerId?: unknown; dropped?: unknown };
          const deadId = typeof raw.id === "string" ? raw.id : "";
          if (deadId) {
            const remote = current.remotes.get(deadId);
            if (remote) remote.alive = false;
          }
          if (raw.killerId === current.local.id) {
            current.kills += 1;
            setKills(current.kills);
            playTone("kill");
          }
          if (Array.isArray(raw.dropped)) {
            raw.dropped.slice(0, 40).forEach((entry) => {
              if (!entry || typeof entry !== "object") return;
              const orb = entry as Partial<Orb>;
              if (
                typeof orb.id === "string" &&
                typeof orb.x === "number" &&
                typeof orb.y === "number"
              ) {
                current.orbs.set(orb.id, {
                  id: orb.id,
                  x: orb.x,
                  y: orb.y,
                  value: typeof orb.value === "number" ? clamp(orb.value, 1, 12) : 4,
                  hue: typeof orb.hue === "number" ? orb.hue : 48,
                  pulse: typeof orb.pulse === "number" ? orb.pulse : 0,
                });
              }
            });
          }
        })
        .on("presence", { event: "sync" }, () => {
          const presenceState = channel.presenceState();
          setPlayerCount(Math.max(1, Object.keys(presenceState).length));
        })
        .on("presence", { event: "leave" }, ({ key }) => {
          const current = runtimeRef.current;
          if (current && key) current.remotes.delete(key);
        });

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
          setConnected(true);
          await channel.track({
            playerId: userId,
            playerName,
            skin: selectedSkin,
            joinedAt: new Date().toISOString(),
          });
          const snapshot: BroadcastSnapshot = {
            id: runtime.local.id,
            name: runtime.local.name,
            skin: runtime.local.skin,
            points: compactPoints(runtime.local.points),
            angle: runtime.local.angle,
            score: runtime.local.score,
            alive: runtime.local.alive,
            boosting: runtime.local.boosting,
            sentAt: Date.now(),
          };
          void channel.send({ type: "broadcast", event: "snake_state", payload: snapshot });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnected(false);
          setError("The real-time connection was interrupted. Check your internet connection, then re-enter the arena.");
        }
      });
      channelRef.current = channel;
    },
    [disconnectChannel, playTone, playerName, selectedSkin, supabase, userId],
  );

  const startGame = useCallback(
    async (nextMode: Exclude<SnakeMode, null>, room?: SnakeRoomRow) => {
      const id = nextMode === "online" ? userId : `solo-${Math.random().toString(36).slice(2)}`;
      if (nextMode === "online" && !id) {
        setError("Sign-in is required to play online.");
        return;
      }
      setError("");
      setNotice("");
      const seed = room ? hashString(`${room.id}:${room.created_at}`) : hashString(`solo:${Date.now()}`);
      const runtime = createRuntime(id, playerName, selectedSkin, seed, nextMode === "solo");
      runtimeRef.current = runtime;
      setLocalSnakeId(id);
      setMode(nextMode);
      setActiveRoom(room || null);
      setPlaying(true);
      setPaused(false);
      setScore(runtime.local.score);
      setKills(0);
      setRank(1);
      setPlayerCount(nextMode === "solo" ? 1 + runtime.bots.size : 1);
      playTone("start");
      if (nextMode === "online" && room) await connectOnlineChannel(room, runtime);
    },
    [connectOnlineChannel, playTone, playerName, selectedSkin, userId],
  );

  const handleCreateRoom = useCallback(async () => {
    if (!userId) {
      setError("Sign-in is required to create an online room.");
      return;
    }
    const trimmedName = roomName.trim().replace(/\s+/g, " ");
    if (trimmedName.length < 3 || trimmedName.length > 40) {
      setError("The room name must be 3–40 characters.");
      return;
    }
    setRoomBusy("create");
    setError("");
    playTone("click");
    try {
      const { data, error: rpcError } = await supabase.rpc("arcade_snake_create_room", {
        p_room_name: trimmedName,
        p_max_players: maxPlayers,
        p_skin: selectedSkin,
      });
      if (rpcError) throw rpcError;
      const room = safeRoomRows(data)[0];
      if (!room) throw new Error("The room could not be created.");
      await startGame("online", room);
    } catch (roomError) {
      setError(roomError instanceof Error ? roomError.message : "Failed to create the room.");
    } finally {
      setRoomBusy("");
    }
  }, [maxPlayers, playTone, roomName, selectedSkin, startGame, supabase, userId]);

  const handleJoinRoom = useCallback(
    async (room: SnakeRoomRow) => {
      if (!userId) {
        setError("Sign-in is required to join an online room.");
        return;
      }
      setRoomBusy(room.id);
      setError("");
      playTone("click");
      try {
        const { data, error: rpcError } = await supabase.rpc("arcade_snake_join_room", {
          p_room_id: room.id,
          p_skin: selectedSkin,
        });
        if (rpcError) throw rpcError;
        const joined = safeRoomRows(data)[0];
        if (!joined) throw new Error("The room is unavailable.");
        await startGame("online", joined);
      } catch (roomError) {
        setError(roomError instanceof Error ? roomError.message : "Failed to join the room.");
        void loadRooms();
      } finally {
        setRoomBusy("");
      }
    },
    [loadRooms, playTone, selectedSkin, startGame, supabase, userId],
  );

  const handleMatchmaking = useCallback(async () => {
    if (!userId) {
      setError("Sign-in is required for Quick Match.");
      return;
    }
    setRoomBusy("matchmaking");
    setError("");
    setNotice("Searching for an arena with active players...");
    playTone("click");
    try {
      const { data, error: rpcError } = await supabase.rpc("arcade_snake_matchmake", {
        p_skin: selectedSkin,
      });
      if (rpcError) throw rpcError;
      const room = safeRoomRows(data)[0];
      if (!room) throw new Error("Matchmaking has not found an arena yet.");
      setNotice("");
      await startGame("online", room);
    } catch (roomError) {
      setNotice("");
      setError(roomError instanceof Error ? roomError.message : "Matchmaking failed.");
    } finally {
      setRoomBusy("");
    }
  }, [playTone, selectedSkin, startGame, supabase, userId]);

  useEffect(() => {
    if (mode !== "online" || !activeRoom) return;
    const heartbeat = window.setInterval(() => {
      void supabase
        .rpc("arcade_snake_touch_room", { p_room_id: activeRoom.id })
        .then(({ data, error: touchError }) => {
          if (touchError) return;
          const room = safeRoomRows(data)[0];
          if (room) setActiveRoom(room);
        });
    }, 14_000);
    return () => window.clearInterval(heartbeat);
  }, [activeRoom, mode, supabase]);

  useEffect(() => {
    if (!playing || !arenaRef.current || !canvasRef.current) return;
    const arena = arenaRef.current;
    const canvas = canvasRef.current;
    const resize = () => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      const rect = arena.getBoundingClientRect();
      const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      runtime.viewport = { width: rect.width, height: rect.height, dpr };
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(arena);
    return () => observer.disconnect();
  }, [playing]);

  const setPointerTarget = useCallback((clientX: number, clientY: number) => {
    const runtime = runtimeRef.current;
    const canvas = canvasRef.current;
    if (!runtime || !canvas || !runtime.local.alive) return;
    const rect = canvas.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    runtime.local.targetAngle = Math.atan2(dy, dx);
    runtime.target = {
      x: runtime.local.points[0].x + dx / Math.max(0.4, runtime.cameraZoom),
      y: runtime.local.points[0].y + dy / Math.max(0.4, runtime.cameraZoom),
    };
  }, []);

  const setBoost = useCallback(
    (active: boolean) => {
      const runtime = runtimeRef.current;
      if (!runtime || !runtime.local.alive) return;
      const next = active && runtime.local.score > START_SCORE + 5;
      if (next && !runtime.local.boosting) playTone("boost");
      runtime.local.boosting = next;
      setBoosting(next);
    },
    [playTone],
  );

  useEffect(() => {
    if (!playing) return;
    const isArenaTarget = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      return Boolean(canvas && event.target instanceof Node && canvas.contains(event.target));
    };
    const onPointerMove = (event: PointerEvent) => {
      if (isArenaTarget(event)) setPointerTarget(event.clientX, event.clientY);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!isArenaTarget(event)) return;
      setPointerTarget(event.clientX, event.clientY);
      if (event.pointerType === "mouse" && event.button === 0) setBoost(true);
    };
    const onPointerUp = () => setBoost(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
        event.preventDefault();
        setBoost(true);
      }
      if (event.code === "KeyP") setPaused((value) => !value);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
        setBoost(false);
      }
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [playing, setBoost, setPointerTarget]);

  const drawScene = useCallback((context: CanvasRenderingContext2D, runtime: GameRuntime, now: number) => {
    const { width, height, dpr } = runtime.viewport;
    if (width <= 0 || height <= 0) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const background = context.createRadialGradient(width * 0.5, height * 0.45, 40, width * 0.5, height * 0.5, Math.max(width, height));
    background.addColorStop(0, "#08243b");
    background.addColorStop(0.48, "#041321");
    background.addColorStop(1, "#01060d");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const zoom = runtime.cameraZoom;
    const toScreen = (point: Vec2) => ({
      x: (point.x - runtime.camera.x) * zoom + width / 2,
      y: (point.y - runtime.camera.y) * zoom + height / 2,
    });

    context.save();
    context.globalAlpha = 0.22;
    context.lineWidth = 1;
    const gridSize = 110 * zoom;
    const offsetX = ((-runtime.camera.x * zoom + width / 2) % gridSize + gridSize) % gridSize;
    const offsetY = ((-runtime.camera.y * zoom + height / 2) % gridSize + gridSize) % gridSize;
    for (let x = offsetX; x < width; x += gridSize) {
      context.strokeStyle = x % (gridSize * 5) < 2 ? "#2dd4bf" : "#0e7490";
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = offsetY; y < height; y += gridSize) {
      context.strokeStyle = y % (gridSize * 5) < 2 ? "#facc15" : "#155e75";
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.restore();

    context.save();
    context.globalAlpha = 0.28;
    for (let index = 0; index < 32; index += 1) {
      const angle = (index / 32) * Math.PI * 2;
      const radius = 600 + (index % 5) * 330;
      const point = toScreen({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
      const size = 2 + (index % 3);
      context.fillStyle = index % 2 === 0 ? "#22d3ee" : "#facc15";
      context.shadowBlur = 12;
      context.shadowColor = context.fillStyle;
      context.beginPath();
      context.arc(point.x, point.y, size, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    const boundary = toScreen({ x: 0, y: 0 });
    context.save();
    context.beginPath();
    context.arc(boundary.x, boundary.y, WORLD_RADIUS * zoom, 0, Math.PI * 2);
    context.strokeStyle = "rgba(250,204,21,0.42)";
    context.lineWidth = 8;
    context.shadowBlur = 28;
    context.shadowColor = "#facc15";
    context.stroke();
    context.beginPath();
    context.arc(boundary.x, boundary.y, (WORLD_RADIUS - 45) * zoom, 0, Math.PI * 2);
    context.strokeStyle = "rgba(34,211,238,0.25)";
    context.lineWidth = 2;
    context.setLineDash([18, 16]);
    context.stroke();
    context.restore();

    for (const orb of runtime.orbs.values()) {
      const point = toScreen(orb);
      if (point.x < -40 || point.y < -40 || point.x > width + 40 || point.y > height + 40) continue;
      const pulse = 1 + Math.sin(now * 0.004 + orb.pulse) * 0.18;
      const orbRadius = (3.5 + orb.value * 0.75) * pulse * clamp(zoom, 0.65, 1.2);
      context.save();
      context.fillStyle = `hsl(${orb.hue} 100% 63%)`;
      context.shadowBlur = 12 + orb.value * 3;
      context.shadowColor = context.fillStyle;
      context.beginPath();
      context.arc(point.x, point.y, orbRadius, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 0.75;
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(point.x - orbRadius * 0.25, point.y - orbRadius * 0.25, orbRadius * 0.28, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    const allSnakes: Array<{
      id: string;
      name: string;
      skin: SnakeSkinId;
      points: Vec2[];
      score: number;
      angle: number;
      alive: boolean;
      boosting: boolean;
      local?: boolean;
    }> = [
      ...Array.from(runtime.bots.values()),
      ...Array.from(runtime.remotes.values()),
      { ...runtime.local, local: true },
    ];

    const topScore = Math.max(...allSnakes.filter((snake) => snake.alive).map((snake) => snake.score), 0);

    for (const snake of allSnakes) {
      if (!snake.alive || snake.points.length < 2) continue;
      const skin = skinById(snake.skin);
      const radius = snakeRadius(snake.score) * clamp(zoom, 0.72, 1.15);
      const stride = Math.max(1, Math.floor(snake.points.length / 120));
      context.save();
      context.globalCompositeOperation = "lighter";
      for (let index = snake.points.length - 1; index >= 0; index -= stride) {
        const point = toScreen(snake.points[index]);
        if (point.x < -80 || point.y < -80 || point.x > width + 80 || point.y > height + 80) continue;
        const taper = 0.58 + (1 - index / Math.max(1, snake.points.length - 1)) * 0.42;
        const segmentRadius = radius * taper;
        const alternating = Math.floor(index / 3) % 2 === 0;
        const gradient = context.createRadialGradient(
          point.x - segmentRadius * 0.28,
          point.y - segmentRadius * 0.32,
          1,
          point.x,
          point.y,
          segmentRadius,
        );
        gradient.addColorStop(0, "rgba(255,255,255,0.95)");
        gradient.addColorStop(0.2, alternating ? skin.primary : skin.secondary);
        gradient.addColorStop(1, alternating ? skin.secondary : skin.primary);
        context.fillStyle = gradient;
        context.shadowBlur = snake.boosting ? 26 : 14;
        context.shadowColor = skin.glow;
        context.beginPath();
        context.arc(point.x, point.y, segmentRadius, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 0.65;
        context.fillStyle = skin.primary;
        context.beginPath();
        context.arc(point.x, point.y, segmentRadius * 0.36, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
      context.restore();

      const head = toScreen(snake.points[0]);
      const headRadius = radius * 1.14;
      context.save();
      context.fillStyle = skin.primary;
      context.shadowBlur = snake.boosting ? 32 : 18;
      context.shadowColor = skin.glow;
      context.beginPath();
      context.arc(head.x, head.y, headRadius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = snake.local ? "#ffffff" : skin.secondary;
      context.lineWidth = snake.local ? 3 : 2;
      context.stroke();

      const forward = { x: Math.cos(snake.angle), y: Math.sin(snake.angle) };
      const side = { x: -forward.y, y: forward.x };
      for (const direction of [-1, 1]) {
        const eyeX = head.x + forward.x * headRadius * 0.42 + side.x * direction * headRadius * 0.43;
        const eyeY = head.y + forward.y * headRadius * 0.42 + side.y * direction * headRadius * 0.43;
        context.fillStyle = skin.eye;
        context.shadowBlur = 0;
        context.beginPath();
        context.arc(eyeX, eyeY, headRadius * 0.26, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#020617";
        context.beginPath();
        context.arc(
          eyeX + forward.x * headRadius * 0.09,
          eyeY + forward.y * headRadius * 0.09,
          headRadius * 0.11,
          0,
          Math.PI * 2,
        );
        context.fill();
      }

      if (snake.score >= topScore && topScore > 0) {
        context.font = `${Math.max(15, headRadius * 0.9)}px system-ui`;
        context.textAlign = "center";
        context.fillText("♛", head.x, head.y - headRadius * 1.25);
      }

      context.font = `800 ${clamp(12 * zoom, 10, 15)}px system-ui`;
      context.textAlign = "center";
      context.fillStyle = snake.local ? "#ffffff" : "#dbeafe";
      context.shadowBlur = 8;
      context.shadowColor = "#000000";
      context.fillText(snake.name, head.x, head.y - headRadius - 12);
      context.font = `700 ${clamp(9.5 * zoom, 8, 12)}px system-ui`;
      context.fillStyle = snake.local ? "#fde047" : "#67e8f9";
      context.fillText(formatScore(snake.score), head.x, head.y - headRadius - 1);
      context.restore();
    }

    for (const particle of runtime.particles) {
      const point = toScreen(particle);
      context.save();
      context.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      context.fillStyle = particle.color;
      context.shadowBlur = 12;
      context.shadowColor = particle.color;
      context.beginPath();
      context.arc(point.x, point.y, particle.size * zoom, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    const mapSize = clamp(width * 0.13, 95, 148);
    const mapX = width - mapSize - 18;
    const mapY = height - mapSize - 18;
    context.save();
    context.globalAlpha = 0.92;
    context.fillStyle = "rgba(2,8,17,0.78)";
    context.strokeStyle = "rgba(34,211,238,0.45)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(mapX + mapSize / 2, mapY + mapSize / 2, mapSize / 2, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    for (const snake of allSnakes) {
      if (!snake.alive || !snake.points[0]) continue;
      const point = snake.points[0];
      const dotX = mapX + mapSize / 2 + (point.x / WORLD_RADIUS) * (mapSize * 0.43);
      const dotY = mapY + mapSize / 2 + (point.y / WORLD_RADIUS) * (mapSize * 0.43);
      const skin = skinById(snake.skin);
      context.fillStyle = snake.local ? "#ffffff" : skin.primary;
      context.shadowBlur = 8;
      context.shadowColor = skin.glow;
      context.beginPath();
      context.arc(dotX, dotY, snake.local ? 4 : 2.6, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    if (!runtime.local.alive) {
      context.save();
      context.fillStyle = "rgba(0,0,0,0.5)";
      context.fillRect(0, 0, width, height);
      context.textAlign = "center";
      context.fillStyle = "#f87171";
      context.font = `900 ${clamp(width * 0.04, 28, 58)}px system-ui`;
      context.fillText("SNAKE DOWN", width / 2, height / 2 - 16);
      context.fillStyle = "#ffffff";
      context.font = `700 ${clamp(width * 0.014, 13, 20)}px system-ui`;
      context.fillText("Respawning with CP energy...", width / 2, height / 2 + 20);
      context.restore();
    }
  }, []);

  useEffect(() => {
    if (!playing) return;
    const loop = (time: number) => {
      const runtime = runtimeRef.current;
      const canvas = canvasRef.current;
      if (!runtime || !canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      const delta = clamp((time - runtime.lastFrameAt) / 1000, 0, 0.04);
      runtime.lastFrameAt = time;
      runtime.paused = paused;

      if (!runtime.paused) {
        const local = runtime.local;
        if (!local.alive && Date.now() >= local.respawnAt) {
          respawnSnake(local, runtime.worldSeed);
          setRespawnSeconds(0);
          playTone("start");
        }
        if (!local.alive) {
          setRespawnSeconds(Math.max(0, Math.ceil((local.respawnAt - Date.now()) / 1000)));
        }

        if (local.alive) {
          if (local.boosting && local.score > START_SCORE + 5) {
            local.score = Math.max(START_SCORE, local.score - delta * 7.2);
            if (time - local.lastDropAt > 85) {
              const tail = local.points[local.points.length - 1];
              const id = `boost-${local.id}-${Math.round(time)}`;
              runtime.orbs.set(id, {
                id,
                x: tail.x,
                y: tail.y,
                value: 1,
                hue: skinById(local.skin).id === "alexia-gold" ? 48 : 190,
                pulse: 0,
              });
              local.lastDropAt = time;
            }
          } else if (local.boosting) {
            local.boosting = false;
            setBoosting(false);
          }
          advanceSnake(local, delta);

          const head = local.points[0];
          if (Math.hypot(head.x, head.y) > WORLD_RADIUS - snakeRadius(local.score) * 0.7) {
            killLocalSnake(runtime);
          }

          if (local.alive) {
            const eatRadius = snakeRadius(local.score) + 8;
            let eaten = 0;
            for (const orb of runtime.orbs.values()) {
              if (Math.abs(orb.x - head.x) > eatRadius || Math.abs(orb.y - head.y) > eatRadius) continue;
              if (distance(head, orb) <= eatRadius) {
                consumeOrb(runtime, orb, modeRef.current === "online");
                eaten += 1;
                if (eaten >= 5) break;
              }
            }
          }
        }

        for (const bot of runtime.bots.values()) {
          if (!bot.alive) {
            if (Date.now() >= bot.respawnAt) respawnSnake(bot, runtime.worldSeed + hashString(bot.id));
            continue;
          }
          const head = bot.points[0];
          const boundaryDistance = Math.hypot(head.x, head.y);
          if (boundaryDistance > WORLD_RADIUS - 340) {
            bot.targetAngle = Math.atan2(-head.y, -head.x);
          } else {
            const desired = nearestOrbAngle(bot, runtime.orbs);
            bot.targetAngle = lerpAngle(bot.targetAngle, desired + Math.sin(time * 0.0004 + hashString(bot.id)) * 0.2, 0.18);
          }
          bot.boosting = Math.sin(time * 0.001 + hashString(bot.id)) > 0.91 && bot.score > 50;
          if (bot.boosting) bot.score = Math.max(START_SCORE, bot.score - delta * 4);
          advanceSnake(bot, delta);
          const botRadius = snakeRadius(bot.score) + 6;
          for (const orb of runtime.orbs.values()) {
            if (distance(bot.points[0], orb) <= botRadius) {
              runtime.orbs.delete(orb.id);
              bot.score += orb.value;
              const replacement = replacementOrb(orb.id, runtime.worldSeed);
              runtime.orbs.set(replacement.id, replacement);
              break;
            }
          }

          const botHead = bot.points[0];
          const botCollisionRadius = snakeRadius(bot.score) * 0.7;
          let botDefeatedByLocal = false;
          if (runtime.local.alive) {
            for (let index = 4; index < runtime.local.points.length; index += 2) {
              if (distance(botHead, runtime.local.points[index]) < botCollisionRadius + snakeRadius(runtime.local.score) * 0.7) {
                botDefeatedByLocal = true;
                break;
              }
            }
          }
          let botHitBody = botDefeatedByLocal;
          if (!botHitBody) {
            for (const otherBot of runtime.bots.values()) {
              if (otherBot.id === bot.id || !otherBot.alive) continue;
              for (let index = 4; index < otherBot.points.length; index += 2) {
                if (distance(botHead, otherBot.points[index]) < botCollisionRadius + snakeRadius(otherBot.score) * 0.66) {
                  botHitBody = true;
                  break;
                }
              }
              if (botHitBody) break;
            }
          }
          if (Math.hypot(botHead.x, botHead.y) > WORLD_RADIUS - botCollisionRadius) botHitBody = true;
          if (botHitBody) {
            bot.alive = false;
            bot.respawnAt = Date.now() + 2_600;
            addBurst(runtime, botHead, skinById(bot.skin).glow, 24);
            const step = Math.max(2, Math.floor(bot.points.length / 18));
            for (let index = 0; index < bot.points.length; index += step) {
              const point = bot.points[index];
              const id = `bot-drop-${bot.id}-${Math.round(time)}-${index}`;
              runtime.orbs.set(id, {
                id,
                x: point.x + (Math.random() - 0.5) * 18,
                y: point.y + (Math.random() - 0.5) * 18,
                value: 3 + Math.floor(Math.random() * 4),
                hue: index % 2 === 0 ? 48 : 190,
                pulse: Math.random() * Math.PI * 2,
              });
            }
            if (botDefeatedByLocal) {
              runtime.kills += 1;
              setKills(runtime.kills);
              playTone("kill");
            }
          }
        }

        for (const remote of runtime.remotes.values()) {
          if (Date.now() - remote.lastSeenAt > REMOTE_TIMEOUT) {
            runtime.remotes.delete(remote.id);
            continue;
          }
          const pointCount = Math.min(remote.points.length, remote.targetPoints.length);
          for (let index = 0; index < pointCount; index += 1) {
            remote.points[index].x = lerp(remote.points[index].x, remote.targetPoints[index].x, clamp(delta * 10, 0, 1));
            remote.points[index].y = lerp(remote.points[index].y, remote.targetPoints[index].y, clamp(delta * 10, 0, 1));
          }
          if (remote.targetPoints.length > remote.points.length) {
            remote.points.push(...remote.targetPoints.slice(remote.points.length).map((point) => ({ ...point })));
          } else if (remote.targetPoints.length < remote.points.length) {
            remote.points.length = remote.targetPoints.length;
          }
        }

        if (runtime.local.alive) {
          const head = runtime.local.points[0];
          const localRadius = snakeRadius(runtime.local.score) * 0.72;
          const opponents = [
            ...Array.from(runtime.bots.values()).map((snake) => ({ ...snake, remoteType: "bot" as const })),
            ...Array.from(runtime.remotes.values()).map((snake) => ({ ...snake, remoteType: "remote" as const })),
          ];
          outer: for (const opponent of opponents) {
            if (!opponent.alive || opponent.points.length < 3) continue;
            for (let index = 3; index < opponent.points.length; index += 2) {
              if (distance(head, opponent.points[index]) < localRadius + snakeRadius(opponent.score) * 0.72) {
                killLocalSnake(runtime, opponent.id);
                break outer;
              }
            }
            const opponentHead = opponent.points[0];
            if (distance(head, opponentHead) < localRadius * 1.4 + snakeRadius(opponent.score) * 0.7) {
              if (opponent.score >= runtime.local.score * 0.92) {
                killLocalSnake(runtime, opponent.id);
                break;
              }
              if (opponent.remoteType === "bot") {
                const bot = runtime.bots.get(opponent.id);
                if (bot) {
                  bot.alive = false;
                  bot.respawnAt = Date.now() + 2_600;
                  runtime.kills += 1;
                  setKills(runtime.kills);
                  addBurst(runtime, opponentHead, skinById(bot.skin).glow, 24);
                  playTone("kill");
                }
              }
            }
          }
        }

        for (const particle of runtime.particles) {
          particle.x += particle.vx * delta;
          particle.y += particle.vy * delta;
          particle.vx *= 0.96;
          particle.vy *= 0.96;
          particle.life -= delta;
        }
        runtime.particles = runtime.particles.filter((particle) => particle.life > 0);

        const head = runtime.local.points[0];
        runtime.camera.x = lerp(runtime.camera.x, head.x, clamp(delta * 5.5, 0, 1));
        runtime.camera.y = lerp(runtime.camera.y, head.y, clamp(delta * 5.5, 0, 1));
        const targetZoom = clamp(1.08 - runtime.local.points.length * 0.0027, 0.62, 1.02);
        runtime.cameraZoom = lerp(runtime.cameraZoom, targetZoom, clamp(delta * 2, 0, 1));

        if (modeRef.current === "online" && channelRef.current && time - runtime.lastBroadcastAt >= SNAPSHOT_INTERVAL) {
          runtime.lastBroadcastAt = time;
          const snapshot: BroadcastSnapshot = {
            id: runtime.local.id,
            name: runtime.local.name,
            skin: runtime.local.skin,
            points: compactPoints(runtime.local.points),
            angle: runtime.local.angle,
            score: runtime.local.score,
            alive: runtime.local.alive,
            boosting: runtime.local.boosting,
            sentAt: Date.now(),
          };
          void broadcast("snake_state", snapshot as unknown as Record<string, unknown>);
        }

        const standings = [
          { id: runtime.local.id, name: runtime.local.name, score: runtime.local.score, skin: runtime.local.skin },
          ...Array.from(runtime.bots.values()).map((snake) => ({ id: snake.id, name: snake.name, score: snake.score, skin: snake.skin })),
          ...Array.from(runtime.remotes.values()).map((snake) => ({ id: snake.id, name: snake.name, score: snake.score, skin: snake.skin })),
        ].sort((a, b) => b.score - a.score);
        runtime.rank = Math.max(1, standings.findIndex((entry) => entry.id === runtime.local.id) + 1);
        if (time - runtime.lastScoreReported > 240) {
          runtime.lastScoreReported = time;
          setScore(Math.floor(runtime.local.score));
          setRank(runtime.rank);
          setLeaderboard(standings.slice(0, 7));
          setPlayerCount(standings.length);
          const high = Math.max(best, Math.floor(runtime.local.score));
          if (high > best) onScore(high);
        }
      }

      drawScene(context, runtime, time);
      animationRef.current = requestAnimationFrame(loop);
    };
    animationRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [best, broadcast, consumeOrb, drawScene, killLocalSnake, onScore, paused, playTone, playing]);

  function selectSkin(id: SnakeSkinId) {
    setSelectedSkin(id);
    try {
      window.localStorage.setItem(SCORE_STORAGE_KEY, id);
    } catch {
      // Storage can be unavailable in strict embedded webviews.
    }
    const runtime = runtimeRef.current;
    if (runtime) runtime.local.skin = id;
    playTone("click");
  }

  const activeSkin = skinById(selectedSkin);

  if (!playing || mode === null) {
    return (
      <div className="overflow-hidden rounded-[28px] border border-cyan-300/25 bg-[#020812] text-white shadow-[0_30px_90px_rgba(0,0,0,0.65),0_0_35px_rgba(34,211,238,0.08)]">
        <div className="relative overflow-hidden border-b border-white/10 px-5 py-6 sm:px-7 lg:px-9">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_10%,rgba(250,204,21,0.16),transparent_28%),radial-gradient(circle_at_85%_0%,rgba(34,211,238,0.17),transparent_34%),linear-gradient(135deg,#06182a,#020711_68%)]" />
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full border-[28px] border-cyan-300/5" />
          <div className="relative grid gap-6 lg:grid-cols-[1.18fr_0.82fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-yellow-300/25 bg-yellow-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-yellow-200">
                <FaWandMagicSparkles /> ComePlayers Online Arena
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                CP Snake <span className="text-cyan-300">Neon Rush</span>
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                Grow by absorbing energy, cut off your rivals, use boosts wisely, and dominate the global leaderboard in the ComePlayers neon arena.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-cyan-200">Realtime multiplayer</span>
                <span className="rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/10 px-3 py-2 text-fuchsia-200">Neon graphics</span>
                <span className="rounded-xl border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-yellow-200">Desktop + Android</span>
                <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-300">Web Audio FX</span>
              </div>
            </div>
            <div className="relative mx-auto aspect-[1.3/1] w-full max-w-[420px] overflow-hidden rounded-3xl border border-cyan-300/25 bg-[#05192a] shadow-[inset_0_0_50px_rgba(34,211,238,0.09),0_0_35px_rgba(34,211,238,0.1)]">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.08)_1px,transparent_1px)] bg-[size:28px_28px]" />
              <div className="absolute left-[13%] top-[49%] h-12 w-12 rounded-full bg-yellow-300 shadow-[0_0_36px_#facc15]" />
              {Array.from({ length: 15 }, (_, index) => (
                <div
                  key={index}
                  className="absolute h-9 w-9 rounded-full border border-white/25 shadow-[0_0_24px_currentColor]"
                  style={
                    {
                      left: `${20 + index * 4.3}%`,
                      top: `${50 + Math.sin(index * 0.58) * 17}%`,
                      background: index % 3 === 0 ? activeSkin.secondary : activeSkin.primary,
                      color: activeSkin.glow,
                      transform: `scale(${1 - index * 0.025})`,
                    } as CSSProperties
                  }
                />
              ))}
              {Array.from({ length: 24 }, (_, index) => (
                <span
                  key={`orb-${index}`}
                  className="absolute h-2 w-2 rounded-full bg-cyan-200 shadow-[0_0_14px_#22d3ee]"
                  style={{ left: `${8 + ((index * 37) % 84)}%`, top: `${9 + ((index * 53) % 78)}%` }}
                />
              ))}
              <div className="absolute bottom-4 left-4 rounded-xl border border-yellow-300/20 bg-black/55 px-3 py-2 text-xs font-black text-yellow-200 backdrop-blur">
                #1 ALEXIA GOLD • 8,420
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-4 sm:p-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Choose your glow</p>
                  <h3 className="mt-1 text-lg font-black">Snake Skin</h3>
                </div>
                <div className="rounded-xl border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-xs font-black text-yellow-200">
                  Best {formatScore(best)}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SKINS.map((skin) => {
                  const selected = selectedSkin === skin.id;
                  return (
                    <button
                      key={skin.id}
                      type="button"
                      onClick={() => selectSkin(skin.id)}
                      className={`rounded-xl border p-3 text-left transition ${
                        selected
                          ? "border-yellow-300/60 bg-yellow-300/10 shadow-[0_0_22px_rgba(250,204,21,0.12)]"
                          : "border-white/10 bg-black/20 hover:border-cyan-300/40"
                      }`}
                    >
                      <span className="flex gap-1.5">
                        {Array.from({ length: 5 }, (_, index) => (
                          <span
                            key={index}
                            className="h-4 w-4 rounded-full border border-white/20"
                            style={{
                              background: index % 2 === 0 ? skin.primary : skin.secondary,
                              boxShadow: `0 0 10px ${skin.glow}`,
                            }}
                          />
                        ))}
                      </span>
                      <span className="mt-2 block truncate text-xs font-black text-white">{skin.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void startGame("solo")}
              className="group flex w-full items-center gap-4 rounded-2xl border border-cyan-300/35 bg-gradient-to-r from-cyan-300/15 to-blue-500/10 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-200/70 hover:shadow-[0_15px_36px_rgba(34,211,238,0.12)]"
            >
              <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-cyan-300 text-xl text-[#021019] shadow-[0_0_24px_rgba(34,211,238,0.35)]">
                <FaGamepad />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-black">Solo Training</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-400">Play instantly against 8 neon bots. No online room required.</span>
              </span>
              <FaCirclePlay className="text-xl text-cyan-200 transition group-hover:scale-110" />
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSoundEnabled((value) => !value)}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-black text-slate-300 hover:border-cyan-300/30"
              >
                {soundEnabled ? <FaVolumeHigh className="text-cyan-300" /> : <FaVolumeXmark />}
                FX {soundEnabled ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                onClick={() => setMusicEnabled((value) => !value)}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-black text-slate-300 hover:border-yellow-300/30"
              >
                <FaMusic className={musicEnabled ? "text-yellow-300" : ""} />
                MUSIC {musicEnabled ? "ON" : "OFF"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-300">Online multiplayer</p>
                <h3 className="mt-1 text-xl font-black">Global Snake Arena</h3>
                <p className="mt-1 text-xs text-slate-500">Public rooms with no code. Join and start hunting energy immediately.</p>
              </div>
              <button
                type="button"
                onClick={() => void loadRooms()}
                disabled={roomsLoading || !userId}
                className="flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-200 disabled:opacity-40"
              >
                <FaRotateRight className={roomsLoading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>

            {!userId ? (
              <div className="mt-4 rounded-xl border border-yellow-300/25 bg-yellow-300/10 p-4 text-sm text-yellow-100">
                Sign in to ComePlayers to unlock public rooms and Global Matchmaking.
              </div>
            ) : null}

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={() => void handleMatchmaking()}
                disabled={!userId || Boolean(roomBusy)}
                className="flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-yellow-300 to-amber-400 px-5 py-3.5 font-black text-black shadow-[0_0_24px_rgba(250,204,21,0.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {roomBusy === "matchmaking" ? <FaMagnifyingGlass className="animate-pulse" /> : <FaBolt />}
                Global Quick Match
              </button>
              <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs font-black text-slate-400">
                <FaWifi className="text-emerald-300" /> Worldwide
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_110px_auto]">
                <input
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  maxLength={40}
                  placeholder="Room name"
                  className="min-w-0 rounded-xl border border-white/10 bg-[#030a13] px-3 py-2.5 text-sm font-bold text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
                />
                <select
                  value={maxPlayers}
                  onChange={(event) => setMaxPlayers(Number(event.target.value))}
                  className="rounded-xl border border-white/10 bg-[#030a13] px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-cyan-300/50"
                >
                  {[8, 12, 16, 20].map((value) => (
                    <option key={value} value={value}>{value} players</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleCreateRoom()}
                  disabled={!userId || Boolean(roomBusy)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-2.5 text-sm font-black text-cyan-100 hover:bg-cyan-300/20 disabled:opacity-40"
                >
                  <FaPlus /> Create
                </button>
              </div>
            </div>

            {notice ? <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">{notice}</div> : null}
            {error ? <div className="mt-3 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</div> : null}

            <div className="mt-4 flex items-center justify-between text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              <span>Open Public Rooms</span>
              <span>{rooms.length} found</span>
            </div>
            <div className="mt-2 max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {roomsLoading && rooms.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-center text-sm text-slate-500">Scanning neon arenas...</div>
              ) : rooms.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-center text-sm text-slate-500">No public rooms yet. Create the first arena or use Quick Match.</div>
              ) : (
                rooms.map((room) => {
                  const full = room.player_count >= room.max_players;
                  return (
                    <div key={room.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#07131f] p-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200"><FaStaffSnake /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-white">{room.room_name}</span>
                        <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Host {room.host_player_name} • {room.player_count}/{room.max_players} players
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleJoinRoom(room)}
                        disabled={full || Boolean(roomBusy)}
                        className="rounded-lg bg-yellow-300 px-3 py-2 text-xs font-black text-black disabled:bg-slate-700 disabled:text-slate-400"
                      >
                        {roomBusy === room.id ? "Joining..." : full ? "Full" : "Join"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-cyan-300/25 bg-[#01060d] text-white shadow-[0_30px_100px_rgba(0,0,0,0.72)]">
      <div className="flex min-h-0 flex-col xl:h-[min(790px,calc(100dvh-140px))] xl:min-h-[620px]">
        <header className="flex flex-wrap items-center gap-2 border-b border-cyan-300/15 bg-[#061421]/95 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-300 to-cyan-300 text-xl text-[#03111b] shadow-[0_0_24px_rgba(34,211,238,0.2)]"><FaStaffSnake /></span>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">CP Snake • Neon Rush</p>
              <p className="truncate text-sm font-black text-white">
                {mode === "online" ? activeRoom?.room_name || "Online Arena" : "Solo Training Arena"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] font-black ${mode === "online" && connected ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-400"}`}>
              <FaWifi /> {mode === "online" ? (connected ? "REALTIME" : "CONNECTING") : "OFFLINE"}
            </span>
            <button type="button" onClick={() => setSoundEnabled((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-cyan-200" title="Sound FX">
              {soundEnabled ? <FaVolumeHigh /> : <FaVolumeXmark />}
            </button>
            <button type="button" onClick={() => setMusicEnabled((value) => !value)} className={`flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 ${musicEnabled ? "text-yellow-300" : "text-slate-500"}`} title="Music"><FaMusic /></button>
            <button type="button" onClick={() => setPaused((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-yellow-200" title="Pause"><FaPause /></button>
            <button type="button" onClick={() => void stopGame()} className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-400/20 bg-red-400/10 text-red-200 hover:bg-red-400/20" title="Leave arena"><FaXmark /></button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_270px]">
          <div ref={arenaRef} className="relative min-h-[520px] overflow-hidden bg-[#020812] xl:min-h-0">
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none cursor-crosshair" />

            <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2 sm:left-4 sm:top-4">
              <div className="rounded-xl border border-white/10 bg-[#03101d]/80 px-3 py-2 shadow-xl backdrop-blur-md">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Score</p>
                <p className="text-lg font-black text-yellow-300">{formatScore(score)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#03101d]/80 px-3 py-2 shadow-xl backdrop-blur-md">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Rank</p>
                <p className="text-lg font-black text-cyan-200">#{rank}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#03101d]/80 px-3 py-2 shadow-xl backdrop-blur-md">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Eliminations</p>
                <p className="text-lg font-black text-fuchsia-200">{kills}</p>
              </div>
              {respawnSeconds > 0 ? (
                <div className="rounded-xl border border-red-300/20 bg-red-400/10 px-3 py-2 shadow-xl backdrop-blur-md">
                  <p className="text-[9px] font-black uppercase tracking-wider text-red-200">Respawn</p>
                  <p className="text-lg font-black text-white">{respawnSeconds}s</p>
                </div>
              ) : null}
            </div>

            <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-full border border-white/10 bg-[#03101d]/80 px-4 py-2 text-xs font-bold text-slate-300 shadow-xl backdrop-blur-md sm:block">
              Move pointer to steer • Hold click / Space to boost • Avoid every snake body
            </div>

            <button
              type="button"
              onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
                event.preventDefault();
                event.stopPropagation();
                setBoost(true);
              }}
              onPointerUp={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setBoost(false);
              }}
              onPointerCancel={() => setBoost(false)}
              className={`absolute bottom-5 right-5 flex h-20 w-20 touch-none select-none flex-col items-center justify-center rounded-full border-2 font-black shadow-[0_0_34px_rgba(250,204,21,0.28)] transition sm:hidden ${boosting ? "scale-95 border-white bg-yellow-200 text-black" : "border-yellow-200/60 bg-yellow-300/85 text-black"}`}
            >
              <FaBolt className="text-xl" />
              <span className="mt-1 text-[10px]">BOOST</span>
            </button>

            {paused ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-blur-sm">
                <button type="button" onClick={() => setPaused(false)} className="flex items-center gap-3 rounded-2xl bg-yellow-300 px-7 py-4 text-lg font-black text-black shadow-[0_0_34px_rgba(250,204,21,0.2)]"><FaCirclePlay /> Resume Arena</button>
              </div>
            ) : null}
          </div>

          <aside className="border-t border-cyan-300/15 bg-[#04101c] p-3 xl:border-l xl:border-t-0">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <section className="rounded-2xl border border-yellow-300/20 bg-yellow-300/[0.06] p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-yellow-300">Your snake</p>
                    <p className="mt-1 truncate text-sm font-black text-white">{playerName}</p>
                  </div>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((index) => (
                      <span key={index} className="h-5 w-5 rounded-full border border-white/20" style={{ background: index % 2 === 0 ? activeSkin.primary : activeSkin.secondary, boxShadow: `0 0 10px ${activeSkin.glow}` }} />
                    ))}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                  <div className="rounded-lg bg-black/25 p-2"><p className="text-[8px] font-black uppercase text-slate-600">Best</p><p className="mt-1 text-xs font-black text-yellow-200">{formatScore(Math.max(best, score))}</p></div>
                  <div className="rounded-lg bg-black/25 p-2"><p className="text-[8px] font-black uppercase text-slate-600">Players</p><p className="mt-1 text-xs font-black text-cyan-200">{playerCount}</p></div>
                  <div className="rounded-lg bg-black/25 p-2"><p className="text-[8px] font-black uppercase text-slate-600">Mode</p><p className="mt-1 text-xs font-black text-white">{mode === "online" ? "PVP" : "BOT"}</p></div>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 sm:col-span-2 xl:col-span-1">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-300"><FaRankingStar /> Leaderboard</p>
                  <span className="text-[9px] font-bold text-slate-600">LIVE</span>
                </div>
                <div className="mt-3 space-y-1.5">
                  {leaderboard.map((entry, index) => {
                    const skin = skinById(entry.skin);
                    const mine = localSnakeId === entry.id;
                    return (
                      <div key={entry.id} className={`flex items-center gap-2 rounded-lg px-2 py-2 ${mine ? "bg-yellow-300/10" : "bg-black/20"}`}>
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${index === 0 ? "bg-yellow-300 text-black" : "bg-white/5 text-slate-400"}`}>{index === 0 ? <FaCrown /> : index + 1}</span>
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: skin.primary, boxShadow: `0 0 8px ${skin.glow}` }} />
                        <span className={`min-w-0 flex-1 truncate text-xs font-bold ${mine ? "text-yellow-100" : "text-slate-300"}`}>{entry.name}</span>
                        <span className="text-[10px] font-black text-cyan-200">{formatScore(entry.score)}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 sm:col-span-3 xl:col-span-1">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-fuchsia-300"><FaHeadphones /> Combat Tips</p>
                <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-slate-400">
                  <li className="flex gap-2"><FaBolt className="mt-0.5 shrink-0 text-yellow-300" /> Boosting consumes mass. Use it only to cut off a rival&apos;s path.</li>
                  <li className="flex gap-2"><FaSkullCrossbones className="mt-0.5 shrink-0 text-red-300" /> Hitting any snake body eliminates you and drops your energy.</li>
                  <li className="flex gap-2"><FaMedal className="mt-0.5 shrink-0 text-cyan-300" /> As you grow, the camera zooms out and your body radius increases.</li>
                </ul>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
