export const FRONTLINE_GAME_ID = "cp-frontline" as const;
export const FRONTLINE_STORAGE_KEY = "comeplayers_cp_frontline_progress_v1";
export const FRONTLINE_SAVE_VERSION = 1;

export type FrontlineUnitKind =
  | "rifle"
  | "tank"
  | "rocket"
  | "drone"
  | "medic"
  | "titan";

export type FrontlineTechBranch =
  | "weapons"
  | "armor"
  | "logistics"
  | "airSupport";

export type FrontlineResources = {
  credits: number;
  alloy: number;
  intel: number;
};

export type FrontlineProgress = {
  version: number;
  commanderLevel: number;
  xp: number;
  campaignMission: number;
  wins: number;
  losses: number;
  highestScore: number;
  totalKills: number;
  totalUnitsDeployed: number;
  resources: FrontlineResources;
  tech: Record<FrontlineTechBranch, number>;
  unlockedUnits: FrontlineUnitKind[];
  achievements: string[];
  dailyClaimDate: string | null;
  updatedAt: string;
};

export type FrontlineMission = {
  id: number;
  code: string;
  title: string;
  location: string;
  briefing: string;
  objective: string;
  difficulty: "Recruit" | "Veteran" | "Elite" | "Legendary";
  durationSeconds: number;
  enemyPower: number;
  reward: FrontlineResources & { xp: number };
  unlocks?: FrontlineUnitKind;
};

export type FrontlineUnitDefinition = {
  kind: FrontlineUnitKind;
  name: string;
  role: string;
  cost: number;
  hp: number;
  damage: number;
  range: number;
  fireRate: number;
  speed: number;
  color: number;
  accent: string;
};

export type FrontlineFriendTarget = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  level: number;
  power: number;
  wins: number;
  lastSeenAt: string | null;
};

export type FrontlineBattleHistory = {
  id: string;
  opponentId: string | null;
  opponentName: string;
  direction: "attack" | "defense" | "campaign";
  result: "victory" | "defeat";
  score: number;
  stars: number;
  missionCode: string;
  createdAt: string;
};

export type FrontlineBootstrap = {
  online: boolean;
  profile: FrontlineProgress;
  friends: FrontlineFriendTarget[];
  history: FrontlineBattleHistory[];
};

export type FrontlineBattleResult = {
  result: "victory" | "defeat";
  score: number;
  stars: number;
  kills: number;
  unitsDeployed: number;
  missionCode: string;
  durationSeconds: number;
};

export const FRONTLINE_UNIT_DEFINITIONS: Record<
  FrontlineUnitKind,
  FrontlineUnitDefinition
> = {
  rifle: {
    kind: "rifle",
    name: "Rifle Squad",
    role: "Rapid infantry",
    cost: 18,
    hp: 92,
    damage: 13,
    range: 132,
    fireRate: 0.62,
    speed: 58,
    color: 0x4de5ff,
    accent: "#67e8f9",
  },
  tank: {
    kind: "tank",
    name: "Assault Tank",
    role: "Armored vanguard",
    cost: 34,
    hp: 270,
    damage: 35,
    range: 160,
    fireRate: 1.25,
    speed: 34,
    color: 0xffcf4a,
    accent: "#fde047",
  },
  rocket: {
    kind: "rocket",
    name: "Rocket Battery",
    role: "Long-range artillery",
    cost: 42,
    hp: 132,
    damage: 58,
    range: 285,
    fireRate: 2.25,
    speed: 24,
    color: 0xff8b3d,
    accent: "#fb923c",
  },
  drone: {
    kind: "drone",
    name: "Specter Drone",
    role: "Fast air support",
    cost: 38,
    hp: 118,
    damage: 24,
    range: 178,
    fireRate: 0.82,
    speed: 82,
    color: 0xc084fc,
    accent: "#c084fc",
  },
  medic: {
    kind: "medic",
    name: "Field Engineer",
    role: "Repairs allied units",
    cost: 30,
    hp: 105,
    damage: 6,
    range: 105,
    fireRate: 0.9,
    speed: 48,
    color: 0x55f5a3,
    accent: "#6ee7b7",
  },
  titan: {
    kind: "titan",
    name: "Titan Siege Walker",
    role: "Legendary heavy unit",
    cost: 82,
    hp: 680,
    damage: 88,
    range: 205,
    fireRate: 1.9,
    speed: 18,
    color: 0xff5e7d,
    accent: "#fb7185",
  },
};

export const FRONTLINE_MISSIONS: FrontlineMission[] = [
  {
    id: 1,
    code: "operation-first-light",
    title: "Operation First Light",
    location: "Solara Coast",
    briefing:
      "Commander Alexia has located a Dominion relay controlling the eastern coast. Establish a beachhead and destroy its command core.",
    objective: "Destroy the Dominion command core",
    difficulty: "Recruit",
    durationSeconds: 185,
    enemyPower: 1,
    reward: { credits: 900, alloy: 120, intel: 30, xp: 380 },
  },
  {
    id: 2,
    code: "iron-rain",
    title: "Iron Rain",
    location: "Kestrel Valley",
    briefing:
      "Enemy armor is moving through Kestrel Valley. Break the convoy before it reaches the civilian evacuation route.",
    objective: "Stop the armored reinforcement waves",
    difficulty: "Veteran",
    durationSeconds: 205,
    enemyPower: 1.24,
    reward: { credits: 1350, alloy: 190, intel: 48, xp: 560 },
    unlocks: "drone",
  },
  {
    id: 3,
    code: "silent-horizon",
    title: "Silent Horizon",
    location: "Nexus Highlands",
    briefing:
      "A jamming array has blinded the alliance network. Fight uphill, secure the radar sites, and restore the tactical link.",
    objective: "Capture and defend the highland relay",
    difficulty: "Veteran",
    durationSeconds: 220,
    enemyPower: 1.48,
    reward: { credits: 1780, alloy: 260, intel: 70, xp: 760 },
    unlocks: "medic",
  },
  {
    id: 4,
    code: "black-tide",
    title: "Black Tide",
    location: "Orion Delta",
    briefing:
      "Dominion forces are flooding the delta with automated defenses. Use combined arms to open a corridor for the resistance.",
    objective: "Overrun the fortified delta base",
    difficulty: "Elite",
    durationSeconds: 235,
    enemyPower: 1.76,
    reward: { credits: 2350, alloy: 360, intel: 95, xp: 980 },
  },
  {
    id: 5,
    code: "skybreaker",
    title: "Skybreaker",
    location: "Astra Launch Complex",
    briefing:
      "The Dominion is preparing an orbital weapon. Storm the launch complex before the final ignition sequence completes.",
    objective: "Destroy the launch core before ignition",
    difficulty: "Elite",
    durationSeconds: 250,
    enemyPower: 2.08,
    reward: { credits: 3100, alloy: 480, intel: 130, xp: 1320 },
    unlocks: "titan",
  },
  {
    id: 6,
    code: "world-dominion",
    title: "World Dominion",
    location: "Citadel Prime",
    briefing:
      "Every campaign has led here. Unite the frontline, breach Citadel Prime, and end the Dominion command network.",
    objective: "Defeat the Dominion supreme command",
    difficulty: "Legendary",
    durationSeconds: 285,
    enemyPower: 2.55,
    reward: { credits: 5000, alloy: 750, intel: 220, xp: 2100 },
  },
];

const ALL_UNIT_KINDS = Object.keys(
  FRONTLINE_UNIT_DEFINITIONS,
) as FrontlineUnitKind[];
const ALL_TECH_BRANCHES: FrontlineTechBranch[] = [
  "weapons",
  "armor",
  "logistics",
  "airSupport",
];

function safeInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function safeStringArray(value: unknown, allowed?: readonly string[]) {
  if (!Array.isArray(value)) return [];
  const result = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.slice(0, 80));
  return Array.from(new Set(allowed ? result.filter((entry) => allowed.includes(entry)) : result)).slice(0, 60);
}

export function createDefaultFrontlineProgress(): FrontlineProgress {
  return {
    version: FRONTLINE_SAVE_VERSION,
    commanderLevel: 1,
    xp: 0,
    campaignMission: 1,
    wins: 0,
    losses: 0,
    highestScore: 0,
    totalKills: 0,
    totalUnitsDeployed: 0,
    resources: { credits: 3200, alloy: 460, intel: 80 },
    tech: { weapons: 1, armor: 1, logistics: 1, airSupport: 1 },
    unlockedUnits: ["rifle", "tank", "rocket"],
    achievements: [],
    dailyClaimDate: null,
    updatedAt: new Date().toISOString(),
  };
}

export function sanitizeFrontlineProgress(value: unknown): FrontlineProgress {
  const fallback = createDefaultFrontlineProgress();
  if (!value || typeof value !== "object") return fallback;
  const source = value as Partial<FrontlineProgress>;
  const resources = source.resources || fallback.resources;
  const tech = source.tech || fallback.tech;
  const unlocked = safeStringArray(source.unlockedUnits, ALL_UNIT_KINDS);

  return {
    version: FRONTLINE_SAVE_VERSION,
    commanderLevel: safeInteger(source.commanderLevel, 1, 1, 100),
    xp: safeInteger(source.xp, 0, 0, 100_000_000),
    campaignMission: safeInteger(
      source.campaignMission,
      1,
      1,
      FRONTLINE_MISSIONS.length,
    ),
    wins: safeInteger(source.wins, 0, 0, 10_000_000),
    losses: safeInteger(source.losses, 0, 0, 10_000_000),
    highestScore: safeInteger(source.highestScore, 0, 0, 1_000_000_000),
    totalKills: safeInteger(source.totalKills, 0, 0, 1_000_000_000),
    totalUnitsDeployed: safeInteger(
      source.totalUnitsDeployed,
      0,
      0,
      1_000_000_000,
    ),
    resources: {
      credits: safeInteger(resources.credits, fallback.resources.credits, 0, 1_000_000_000),
      alloy: safeInteger(resources.alloy, fallback.resources.alloy, 0, 1_000_000_000),
      intel: safeInteger(resources.intel, fallback.resources.intel, 0, 1_000_000_000),
    },
    tech: Object.fromEntries(
      ALL_TECH_BRANCHES.map((branch) => [
        branch,
        safeInteger(tech[branch], 1, 1, 20),
      ]),
    ) as Record<FrontlineTechBranch, number>,
    unlockedUnits: Array.from(
      new Set<FrontlineUnitKind>([
        "rifle",
        "tank",
        "rocket",
        ...(unlocked as FrontlineUnitKind[]),
      ]),
    ),
    achievements: safeStringArray(source.achievements),
    dailyClaimDate:
      typeof source.dailyClaimDate === "string"
        ? source.dailyClaimDate.slice(0, 32)
        : null,
    updatedAt:
      typeof source.updatedAt === "string"
        ? source.updatedAt.slice(0, 40)
        : new Date().toISOString(),
  };
}

export function levelForXp(xp: number) {
  return Math.min(100, Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 420)) + 1));
}

export function xpForNextLevel(level: number) {
  return Math.max(420, level * level * 420);
}

export function frontlinePower(progress: FrontlineProgress) {
  const techPower = Object.values(progress.tech).reduce(
    (total, level) => total + level * 115,
    0,
  );
  return Math.round(
    900 +
      progress.commanderLevel * 145 +
      techPower +
      progress.unlockedUnits.length * 170 +
      progress.wins * 12,
  );
}

export function applyFrontlineBattleResult(
  current: FrontlineProgress,
  battle: FrontlineBattleResult,
  reward: FrontlineMission["reward"],
): FrontlineProgress {
  const victory = battle.result === "victory";
  const rewardMultiplier = victory ? Math.max(0.35, battle.stars / 3) : 0.22;
  const xp = current.xp + Math.round(reward.xp * rewardMultiplier);
  const completedMission = FRONTLINE_MISSIONS.find(
    (mission) => mission.code === battle.missionCode,
  );
  const nextMission = victory && completedMission?.id === current.campaignMission
    ? Math.min(FRONTLINE_MISSIONS.length, current.campaignMission + 1)
    : current.campaignMission;
  const missionUnlock = victory ? completedMission?.unlocks : undefined;
  const achievements = new Set(current.achievements);
  if (victory) achievements.add("first-victory");
  if (battle.stars === 3) achievements.add("flawless-command");
  if (current.totalKills + battle.kills >= 100) achievements.add("century-guard");
  if (nextMission >= 6) achievements.add("citadel-bound");

  return sanitizeFrontlineProgress({
    ...current,
    commanderLevel: levelForXp(xp),
    xp,
    campaignMission: nextMission,
    wins: current.wins + (victory ? 1 : 0),
    losses: current.losses + (victory ? 0 : 1),
    highestScore: Math.max(current.highestScore, battle.score),
    totalKills: current.totalKills + battle.kills,
    totalUnitsDeployed: current.totalUnitsDeployed + battle.unitsDeployed,
    resources: {
      credits: current.resources.credits + Math.round(reward.credits * rewardMultiplier),
      alloy: current.resources.alloy + Math.round(reward.alloy * rewardMultiplier),
      intel: current.resources.intel + Math.round(reward.intel * rewardMultiplier),
    },
    unlockedUnits: missionUnlock
      ? [...current.unlockedUnits, missionUnlock]
      : current.unlockedUnits,
    achievements: Array.from(achievements),
    updatedAt: new Date().toISOString(),
  });
}
