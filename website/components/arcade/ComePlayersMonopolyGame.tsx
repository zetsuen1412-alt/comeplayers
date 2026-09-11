"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FaArrowRight,
  FaBolt,
  FaBuilding,
  FaCartShopping,
  FaCheck,
  FaComputer,
  FaCopy,
  FaCrown,
  FaDice,
  FaDoorOpen,
  FaGavel,
  FaGlobe,
  FaHandshake,
  FaHotel,
  FaHouse,
  FaLandmark,
  FaMagnifyingGlass,
  FaMusic,
  FaPiggyBank,
  FaPlay,
  FaPlus,
  FaRotateRight,
  FaVolumeHigh,
  FaVolumeXmark,
  FaWifi,
  FaXmark,
} from "react-icons/fa6";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { ArcadeGameProps } from "@/components/arcade/ArcadeGameTypes";
import styles from "./ComePlayersMonopolyGame.module.css";

type GameMode = "offline" | "online" | null;
type RoomKind = "public" | "matchmaking";
type RoomStatus = "waiting" | "active" | "finished" | "abandoned";
type GameStatus = "lobby" | "playing" | "finished";
type TurnPhase = "roll" | "action" | "buy" | "debt" | "finished";
type TileKind =
  | "go"
  | "property"
  | "transit"
  | "utility"
  | "chance"
  | "chest"
  | "tax"
  | "jail"
  | "free"
  | "gotojail";
type TokenName = "bolt" | "crown" | "gamepad" | "rocket";
type SoundName =
  | "click"
  | "dice"
  | "step"
  | "cash"
  | "buy"
  | "rent"
  | "card"
  | "jail"
  | "build"
  | "trade"
  | "win"
  | "error";

type Tile = {
  id: number;
  name: string;
  shortName: string;
  kind: TileKind;
  group?: string;
  groupColor?: string;
  price?: number;
  rent?: number[];
  houseCost?: number;
  tax?: number;
};

type PlayerState = {
  id: string;
  name: string;
  token: TokenName;
  color: string;
  cash: number;
  position: number;
  jailed: boolean;
  jailTurns: number;
  bankrupt: boolean;
  npc: boolean;
  getOutCards: number;
};

type OwnershipState = {
  ownerId: string | null;
  houses: number;
  mortgaged: boolean;
};

type TradeOffer = {
  id: string;
  fromId: string;
  toId: string;
  giveCash: number;
  askCash: number;
  giveProperties: number[];
  askProperties: number[];
  status: "pending";
};

type MonopolySettings = {
  freeParkingJackpot: boolean;
  fastMode: boolean;
  startingCash: number;
};

type MonopolyState = {
  status: GameStatus;
  phase: TurnPhase;
  players: PlayerState[];
  currentPlayer: number;
  properties: Record<string, OwnershipState>;
  dice: [number, number];
  extraTurn: boolean;
  doublesInRow: number;
  pendingTile: number | null;
  debtToId: string | null;
  freeParkingPot: number;
  turnNumber: number;
  lastEvent: string;
  log: string[];
  trade: TradeOffer | null;
  winnerId: string | null;
  settings: MonopolySettings;
};

type MonopolyRoomRow = {
  id: string;
  room_name: string;
  room_code: string;
  room_kind: RoomKind;
  host_player_id: string;
  player_ids: string[];
  player_names: string[];
  ready_player_ids: string[];
  max_players: number;
  game_state: MonopolyState;
  status: RoomStatus;
  version: number;
  created_at: string;
  updated_at: string;
};

type CardEffect =
  | { kind: "cash"; amount: number }
  | { kind: "cashEach"; amount: number }
  | { kind: "move"; position: number; collectGo?: boolean }
  | { kind: "moveSteps"; steps: number }
  | { kind: "jail" }
  | { kind: "getOut" }
  | { kind: "repairs"; house: number; hotel: number };

type GameCard = {
  title: string;
  description: string;
  effect: CardEffect;
};

const PLAYER_COLORS = ["#facc15", "#22d3ee", "#c084fc", "#fb7185"];
const PLAYER_TOKENS: TokenName[] = ["bolt", "crown", "gamepad", "rocket"];
const LOCAL_SAVE_KEY = "comeplayers_cp_monopoly_v43_save";

const TILES: Tile[] = [
  { id: 0, name: "Launch Pad", shortName: "GO", kind: "go" },
  { id: 1, name: "Pixel Plaza", shortName: "Pixel", kind: "property", group: "bronze", groupColor: "#92400e", price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50 },
  { id: 2, name: "Squad Chest", shortName: "Chest", kind: "chest" },
  { id: 3, name: "Rookie Row", shortName: "Rookie", kind: "property", group: "bronze", groupColor: "#92400e", price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50 },
  { id: 4, name: "Platform Service Fee", shortName: "Fee", kind: "tax", tax: 200 },
  { id: 5, name: "CP Transit Alpha", shortName: "Transit A", kind: "transit", price: 200, rent: [25, 50, 100, 200] },
  { id: 6, name: "Neon Alley", shortName: "Neon", kind: "property", group: "cyan", groupColor: "#22d3ee", price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
  { id: 7, name: "Loot Drop", shortName: "Loot", kind: "chance" },
  { id: 8, name: "Streamer Street", shortName: "Streamer", kind: "property", group: "cyan", groupColor: "#22d3ee", price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
  { id: 9, name: "LAN Lane", shortName: "LAN", kind: "property", group: "cyan", groupColor: "#22d3ee", price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50 },
  { id: 10, name: "Safe Zone / Jail", shortName: "Jail", kind: "jail" },
  { id: 11, name: "Creator Corner", shortName: "Creator", kind: "property", group: "magenta", groupColor: "#d946ef", price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
  { id: 12, name: "Power Grid", shortName: "Power", kind: "utility", price: 150 },
  { id: 13, name: "Cosplay Court", shortName: "Cosplay", kind: "property", group: "magenta", groupColor: "#d946ef", price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
  { id: 14, name: "Esports Avenue", shortName: "Esports", kind: "property", group: "magenta", groupColor: "#d946ef", price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100 },
  { id: 15, name: "CP Transit Beta", shortName: "Transit B", kind: "transit", price: 200, rent: [25, 50, 100, 200] },
  { id: 16, name: "Cyber City", shortName: "Cyber", kind: "property", group: "orange", groupColor: "#f97316", price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
  { id: 17, name: "Squad Chest", shortName: "Chest", kind: "chest" },
  { id: 18, name: "Guild Garden", shortName: "Guild", kind: "property", group: "orange", groupColor: "#f97316", price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
  { id: 19, name: "Tournament Terrace", shortName: "Tourny", kind: "property", group: "orange", groupColor: "#f97316", price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100 },
  { id: 20, name: "Free Parking Jackpot", shortName: "Parking", kind: "free" },
  { id: 21, name: "Marketplace Mile", shortName: "Market", kind: "property", group: "red", groupColor: "#ef4444", price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
  { id: 22, name: "Loot Drop", shortName: "Loot", kind: "chance" },
  { id: 23, name: "Sponsor Street", shortName: "Sponsor", kind: "property", group: "red", groupColor: "#ef4444", price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
  { id: 24, name: "Champion Boulevard", shortName: "Champion", kind: "property", group: "red", groupColor: "#ef4444", price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150 },
  { id: 25, name: "CP Transit Gamma", shortName: "Transit C", kind: "transit", price: 200, rent: [25, 50, 100, 200] },
  { id: 26, name: "Mobile District", shortName: "Mobile", kind: "property", group: "yellow", groupColor: "#eab308", price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
  { id: 27, name: "Desktop Drive", shortName: "Desktop", kind: "property", group: "yellow", groupColor: "#eab308", price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
  { id: 28, name: "Cloud Utility", shortName: "Cloud", kind: "utility", price: 150 },
  { id: 29, name: "Crossplay Crescent", shortName: "Crossplay", kind: "property", group: "yellow", groupColor: "#eab308", price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150 },
  { id: 30, name: "Anti-Cheat Detention", shortName: "Go Jail", kind: "gotojail" },
  { id: 31, name: "Victory Valley", shortName: "Victory", kind: "property", group: "green", groupColor: "#22c55e", price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
  { id: 32, name: "Ranked Road", shortName: "Ranked", kind: "property", group: "green", groupColor: "#22c55e", price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
  { id: 33, name: "Squad Chest", shortName: "Chest", kind: "chest" },
  { id: 34, name: "Founder’s Field", shortName: "Founder", kind: "property", group: "green", groupColor: "#22c55e", price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200 },
  { id: 35, name: "CP Transit Omega", shortName: "Transit D", kind: "transit", price: 200, rent: [25, 50, 100, 200] },
  { id: 36, name: "Loot Drop", shortName: "Loot", kind: "chance" },
  { id: 37, name: "Legend Lane", shortName: "Legend", kind: "property", group: "blue", groupColor: "#2563eb", price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200 },
  { id: 38, name: "Creator Economy Tax", shortName: "Tax", kind: "tax", tax: 100 },
  { id: 39, name: "Alexia Tower", shortName: "Alexia", kind: "property", group: "blue", groupColor: "#2563eb", price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200 },
];

const LOOT_CARDS: GameCard[] = [
  { title: "Viral Clip", description: "Your clip exploded overnight. Collect CP 150.", effect: { kind: "cash", amount: 150 } },
  { title: "Tournament Win", description: "Advance to Launch Pad and collect CP 200.", effect: { kind: "move", position: 0, collectGo: true } },
  { title: "Server Boost", description: "Move forward three spaces.", effect: { kind: "moveSteps", steps: 3 } },
  { title: "Chargeback", description: "A disputed payment costs CP 100.", effect: { kind: "cash", amount: -100 } },
  { title: "Anti-Cheat Flag", description: "Go directly to detention. Do not collect CP 200.", effect: { kind: "jail" } },
  { title: "Creator Collaboration", description: "Collect CP 50 from every rival.", effect: { kind: "cashEach", amount: 50 } },
  { title: "Premium Sponsor", description: "Collect CP 200.", effect: { kind: "cash", amount: 200 } },
  { title: "Hardware Repair", description: "Pay CP 25 per house and CP 100 per hotel.", effect: { kind: "repairs", house: 25, hotel: 100 } },
  { title: "Appeal Approved", description: "Keep this Get Out of Jail card.", effect: { kind: "getOut" } },
  { title: "Fast Travel", description: "Advance to CP Transit Alpha.", effect: { kind: "move", position: 5, collectGo: true } },
];

const CHEST_CARDS: GameCard[] = [
  { title: "Community Giveaway", description: "Collect CP 100.", effect: { kind: "cash", amount: 100 } },
  { title: "Squad Support", description: "Every rival sends you CP 25.", effect: { kind: "cashEach", amount: 25 } },
  { title: "Subscription Renewal", description: "Pay CP 50.", effect: { kind: "cash", amount: -50 } },
  { title: "Marketplace Refund", description: "Collect CP 75.", effect: { kind: "cash", amount: 75 } },
  { title: "Moderation Penalty", description: "Go directly to detention.", effect: { kind: "jail" } },
  { title: "Convention Travel", description: "Move back two spaces.", effect: { kind: "moveSteps", steps: -2 } },
  { title: "Early Supporter Reward", description: "Collect CP 200.", effect: { kind: "cash", amount: 200 } },
  { title: "PC Upgrade", description: "Pay CP 40 per house and CP 115 per hotel.", effect: { kind: "repairs", house: 40, hotel: 115 } },
  { title: "Moderator Pass", description: "Keep this Get Out of Jail card.", effect: { kind: "getOut" } },
  { title: "Return to Launch Pad", description: "Advance to Launch Pad and collect CP 200.", effect: { kind: "move", position: 0, collectGo: true } },
];

function money(value: number) {
  return `CP ${Math.round(value).toLocaleString("id-ID")}`;
}

function randomId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneState(state: MonopolyState): MonopolyState {
  return JSON.parse(JSON.stringify(state)) as MonopolyState;
}

function propertyDefaults(): Record<string, OwnershipState> {
  return Object.fromEntries(
    TILES.filter((tile) => tile.kind === "property" || tile.kind === "transit" || tile.kind === "utility").map((tile) => [
      String(tile.id),
      { ownerId: null, houses: 0, mortgaged: false },
    ]),
  );
}

function makePlayer(id: string, name: string, index: number, npc = false, cash = 1500): PlayerState {
  return {
    id,
    name,
    token: PLAYER_TOKENS[index % PLAYER_TOKENS.length],
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    cash,
    position: 0,
    jailed: false,
    jailTurns: 0,
    bankrupt: false,
    npc,
    getOutCards: 0,
  };
}

function createBaseState(settings?: Partial<MonopolySettings>): MonopolyState {
  const fullSettings: MonopolySettings = {
    freeParkingJackpot: settings?.freeParkingJackpot ?? true,
    fastMode: settings?.fastMode ?? false,
    startingCash: settings?.startingCash ?? 1500,
  };
  return {
    status: "lobby",
    phase: "roll",
    players: [],
    currentPlayer: 0,
    properties: propertyDefaults(),
    dice: [0, 0],
    extraTurn: false,
    doublesInRow: 0,
    pendingTile: null,
    debtToId: null,
    freeParkingPot: 0,
    turnNumber: 1,
    lastEvent: "Choose a game mode to begin.",
    log: ["Marble Online board initialized."],
    trade: null,
    winnerId: null,
    settings: fullSettings,
  };
}

function normalizeState(value: unknown): MonopolyState {
  const fallback = createBaseState();
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<MonopolyState>;
  const players = Array.isArray(raw.players)
    ? raw.players.slice(0, 4).map((player, index) => {
        const entry = player as Partial<PlayerState>;
        return {
          id: typeof entry.id === "string" ? entry.id : `player-${index}`,
          name: typeof entry.name === "string" ? entry.name : `Player ${index + 1}`,
          token: PLAYER_TOKENS.includes(entry.token as TokenName) ? (entry.token as TokenName) : PLAYER_TOKENS[index],
          color: typeof entry.color === "string" ? entry.color : PLAYER_COLORS[index],
          cash: typeof entry.cash === "number" ? entry.cash : 1500,
          position: typeof entry.position === "number" ? Math.max(0, Math.min(39, Math.round(entry.position))) : 0,
          jailed: Boolean(entry.jailed),
          jailTurns: typeof entry.jailTurns === "number" ? entry.jailTurns : 0,
          bankrupt: Boolean(entry.bankrupt),
          npc: Boolean(entry.npc),
          getOutCards: typeof entry.getOutCards === "number" ? entry.getOutCards : 0,
        };
      })
    : [];
  const properties = propertyDefaults();
  if (raw.properties && typeof raw.properties === "object") {
    Object.keys(properties).forEach((key) => {
      const entry = (raw.properties as Record<string, Partial<OwnershipState>>)[key];
      if (!entry) return;
      properties[key] = {
        ownerId: typeof entry.ownerId === "string" ? entry.ownerId : null,
        houses: typeof entry.houses === "number" ? Math.max(0, Math.min(5, Math.round(entry.houses))) : 0,
        mortgaged: Boolean(entry.mortgaged),
      };
    });
  }
  return {
    status: raw.status === "playing" || raw.status === "finished" ? raw.status : "lobby",
    phase: ["roll", "action", "buy", "debt", "finished"].includes(String(raw.phase)) ? (raw.phase as TurnPhase) : "roll",
    players,
    currentPlayer: typeof raw.currentPlayer === "number" ? Math.max(0, Math.min(Math.max(0, players.length - 1), Math.round(raw.currentPlayer))) : 0,
    properties,
    dice: Array.isArray(raw.dice) && raw.dice.length === 2 ? [Number(raw.dice[0]) || 0, Number(raw.dice[1]) || 0] : [0, 0],
    extraTurn: Boolean(raw.extraTurn),
    doublesInRow: typeof raw.doublesInRow === "number" ? raw.doublesInRow : 0,
    pendingTile: typeof raw.pendingTile === "number" ? raw.pendingTile : null,
    debtToId: typeof raw.debtToId === "string" ? raw.debtToId : null,
    freeParkingPot: typeof raw.freeParkingPot === "number" ? raw.freeParkingPot : 0,
    turnNumber: typeof raw.turnNumber === "number" ? raw.turnNumber : 1,
    lastEvent: typeof raw.lastEvent === "string" ? raw.lastEvent : "Marble Online ready.",
    log: Array.isArray(raw.log) ? raw.log.filter((item): item is string => typeof item === "string").slice(0, 40) : [],
    trade: raw.trade && typeof raw.trade === "object" ? (raw.trade as TradeOffer) : null,
    winnerId: typeof raw.winnerId === "string" ? raw.winnerId : null,
    settings: {
      freeParkingJackpot: raw.settings?.freeParkingJackpot ?? true,
      fastMode: raw.settings?.fastMode ?? false,
      startingCash: typeof raw.settings?.startingCash === "number" ? raw.settings.startingCash : 1500,
    },
  };
}

function addLog(state: MonopolyState, message: string) {
  state.lastEvent = message;
  state.log = [message, ...state.log].slice(0, 40);
}

function ownedTileIds(state: MonopolyState, playerId: string) {
  return Object.entries(state.properties)
    .filter(([, ownership]) => ownership.ownerId === playerId)
    .map(([tileId]) => Number(tileId));
}

function groupTileIds(group: string) {
  return TILES.filter((tile) => tile.group === group).map((tile) => tile.id);
}

function ownsGroup(state: MonopolyState, playerId: string, group?: string) {
  if (!group) return false;
  const ids = groupTileIds(group);
  return ids.length > 0 && ids.every((id) => state.properties[String(id)]?.ownerId === playerId);
}

function activePlayerIndices(state: MonopolyState) {
  return state.players.map((player, index) => ({ player, index })).filter(({ player }) => !player.bankrupt).map(({ index }) => index);
}

function nextActivePlayerIndex(state: MonopolyState, from: number) {
  if (state.players.length === 0) return 0;
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (from + offset) % state.players.length;
    if (!state.players[index]?.bankrupt) return index;
  }
  return from;
}

function checkWinner(state: MonopolyState) {
  const active = activePlayerIndices(state);
  if (state.status === "playing" && active.length <= 1 && state.players.length >= 2) {
    const winnerIndex = active[0] ?? 0;
    state.status = "finished";
    state.phase = "finished";
    state.winnerId = state.players[winnerIndex]?.id || null;
    addLog(state, `${state.players[winnerIndex]?.name || "A player"} conquered the ComePlayers economy!`);
  }
}

function movePlayerBy(state: MonopolyState, playerIndex: number, steps: number) {
  const player = state.players[playerIndex];
  if (!player) return;
  const oldPosition = player.position;
  let newPosition = oldPosition + steps;
  if (steps >= 0 && newPosition >= 40) {
    const laps = Math.floor(newPosition / 40);
    player.cash += 200 * laps;
    addLog(state, `${player.name} passed Launch Pad and collected ${money(200 * laps)}.`);
  }
  newPosition = ((newPosition % 40) + 40) % 40;
  player.position = newPosition;
}

function movePlayerTo(state: MonopolyState, playerIndex: number, position: number, collectGo = false) {
  const player = state.players[playerIndex];
  if (!player) return;
  if (collectGo && position <= player.position && position !== player.position) {
    player.cash += 200;
    addLog(state, `${player.name} passed Launch Pad and collected ${money(200)}.`);
  }
  player.position = position;
}

function sendToJail(state: MonopolyState, playerIndex: number) {
  const player = state.players[playerIndex];
  if (!player) return;
  player.position = 10;
  player.jailed = true;
  player.jailTurns = 0;
  state.extraTurn = false;
  state.doublesInRow = 0;
  state.phase = "action";
  addLog(state, `${player.name} was sent to Anti-Cheat Detention.`);
}

function rentForTile(state: MonopolyState, tileId: number, diceTotal: number) {
  const tile = TILES[tileId];
  const ownership = state.properties[String(tileId)];
  if (!tile || !ownership?.ownerId || ownership.mortgaged) return 0;
  if (tile.kind === "property") {
    const level = Math.max(0, Math.min(5, ownership.houses));
    let rent = tile.rent?.[level] || 0;
    if (level === 0 && ownsGroup(state, ownership.ownerId, tile.group)) rent *= 2;
    return rent;
  }
  if (tile.kind === "transit") {
    const count = TILES.filter((candidate) => candidate.kind === "transit" && state.properties[String(candidate.id)]?.ownerId === ownership.ownerId).length;
    return [0, 25, 50, 100, 200][count] || 25;
  }
  if (tile.kind === "utility") {
    const count = TILES.filter((candidate) => candidate.kind === "utility" && state.properties[String(candidate.id)]?.ownerId === ownership.ownerId).length;
    return diceTotal * (count >= 2 ? 10 : 4);
  }
  return 0;
}

function chargePlayer(state: MonopolyState, playerIndex: number, amount: number, receiverId: string | null, reason: string) {
  const player = state.players[playerIndex];
  if (!player || amount <= 0) return;
  player.cash -= amount;
  if (receiverId) {
    const receiver = state.players.find((entry) => entry.id === receiverId);
    if (receiver && !receiver.bankrupt) receiver.cash += amount;
  } else if (state.settings.freeParkingJackpot) {
    state.freeParkingPot += amount;
  }
  state.debtToId = receiverId;
  addLog(state, `${player.name} paid ${money(amount)} ${reason}.`);
  state.phase = player.cash < 0 ? "debt" : "action";
}

function drawCard(state: MonopolyState, playerIndex: number, kind: "chance" | "chest") {
  const deck = kind === "chance" ? LOOT_CARDS : CHEST_CARDS;
  const card = deck[Math.floor(Math.random() * deck.length)];
  const player = state.players[playerIndex];
  if (!player) return;
  addLog(state, `${player.name} drew “${card.title}”: ${card.description}`);
  const effect = card.effect;
  if (effect.kind === "cash") {
    if (effect.amount >= 0) {
      player.cash += effect.amount;
      state.phase = "action";
    } else {
      chargePlayer(state, playerIndex, Math.abs(effect.amount), null, "after drawing a card");
    }
  } else if (effect.kind === "cashEach") {
    state.players.forEach((other) => {
      if (other.id === player.id || other.bankrupt) return;
      const amount = Math.min(effect.amount, Math.max(0, other.cash));
      other.cash -= amount;
      player.cash += amount;
    });
    state.phase = "action";
  } else if (effect.kind === "move") {
    movePlayerTo(state, playerIndex, effect.position, Boolean(effect.collectGo));
    resolveLanding(state, playerIndex, state.dice[0] + state.dice[1], 1);
  } else if (effect.kind === "moveSteps") {
    movePlayerBy(state, playerIndex, effect.steps);
    resolveLanding(state, playerIndex, state.dice[0] + state.dice[1], 1);
  } else if (effect.kind === "jail") {
    sendToJail(state, playerIndex);
  } else if (effect.kind === "getOut") {
    player.getOutCards += 1;
    state.phase = "action";
  } else if (effect.kind === "repairs") {
    const owned = ownedTileIds(state, player.id);
    const houses = owned.reduce((sum, id) => sum + Math.min(4, state.properties[String(id)]?.houses || 0), 0);
    const hotels = owned.reduce((sum, id) => sum + ((state.properties[String(id)]?.houses || 0) >= 5 ? 1 : 0), 0);
    const total = houses * effect.house + hotels * effect.hotel;
    chargePlayer(state, playerIndex, total, null, "for property repairs");
  }
}

function resolveLanding(state: MonopolyState, playerIndex: number, diceTotal: number, depth = 0) {
  if (depth > 3) {
    state.phase = "action";
    return;
  }
  const player = state.players[playerIndex];
  if (!player) return;
  const tile = TILES[player.position];
  state.pendingTile = null;
  if (tile.kind === "go") {
    state.phase = "action";
    addLog(state, `${player.name} landed on Launch Pad.`);
    return;
  }
  if (tile.kind === "property" || tile.kind === "transit" || tile.kind === "utility") {
    const ownership = state.properties[String(tile.id)];
    if (!ownership.ownerId) {
      state.pendingTile = tile.id;
      state.phase = "buy";
      addLog(state, `${tile.name} is available for ${money(tile.price || 0)}.`);
      return;
    }
    if (ownership.ownerId === player.id) {
      state.phase = "action";
      addLog(state, `${player.name} landed on their own ${tile.name}.`);
      return;
    }
    if (ownership.mortgaged) {
      state.phase = "action";
      addLog(state, `${tile.name} is mortgaged, so no rent was collected.`);
      return;
    }
    const rent = rentForTile(state, tile.id, diceTotal);
    const owner = state.players.find((entry) => entry.id === ownership.ownerId);
    chargePlayer(state, playerIndex, rent, ownership.ownerId, `rent to ${owner?.name || "the owner"}`);
    return;
  }
  if (tile.kind === "chance") {
    drawCard(state, playerIndex, "chance");
    return;
  }
  if (tile.kind === "chest") {
    drawCard(state, playerIndex, "chest");
    return;
  }
  if (tile.kind === "tax") {
    chargePlayer(state, playerIndex, tile.tax || 0, null, `on ${tile.name}`);
    return;
  }
  if (tile.kind === "gotojail") {
    sendToJail(state, playerIndex);
    return;
  }
  if (tile.kind === "free") {
    if (state.settings.freeParkingJackpot && state.freeParkingPot > 0) {
      const jackpot = state.freeParkingPot;
      player.cash += jackpot;
      state.freeParkingPot = 0;
      addLog(state, `${player.name} collected the Free Parking jackpot of ${money(jackpot)}!`);
    } else {
      addLog(state, `${player.name} takes a break at Free Parking.`);
    }
    state.phase = "action";
    return;
  }
  state.phase = "action";
  addLog(state, `${player.name} is just visiting the Safe Zone.`);
}

function canBuildHouse(state: MonopolyState, tileId: number) {
  const tile = TILES[tileId];
  const ownership = state.properties[String(tileId)];
  if (!tile?.group || !ownership?.ownerId || ownership.mortgaged || ownership.houses >= 5) return false;
  if (!ownsGroup(state, ownership.ownerId, tile.group)) return false;
  const groupIds = groupTileIds(tile.group);
  if (groupIds.some((id) => state.properties[String(id)]?.mortgaged)) return false;
  const levels = groupIds.map((id) => state.properties[String(id)]?.houses || 0);
  return ownership.houses <= Math.min(...levels);
}

function canSellHouse(state: MonopolyState, tileId: number) {
  const tile = TILES[tileId];
  const ownership = state.properties[String(tileId)];
  if (!tile?.group || !ownership || ownership.houses <= 0) return false;
  const levels = groupTileIds(tile.group).map((id) => state.properties[String(id)]?.houses || 0);
  return ownership.houses >= Math.max(...levels);
}

function canMortgage(state: MonopolyState, tileId: number) {
  const tile = TILES[tileId];
  const ownership = state.properties[String(tileId)];
  if (!tile || !ownership?.ownerId || ownership.mortgaged) return false;
  if (tile.group && groupTileIds(tile.group).some((id) => (state.properties[String(id)]?.houses || 0) > 0)) return false;
  return true;
}

function propertyNetWorth(state: MonopolyState, playerId: string) {
  return ownedTileIds(state, playerId).reduce((sum, id) => {
    const tile = TILES[id];
    const ownership = state.properties[String(id)];
    const base = ownership.mortgaged ? (tile.price || 0) / 2 : tile.price || 0;
    const buildings = (ownership.houses || 0) * ((tile.houseCost || 0) / 2);
    return sum + base + buildings;
  }, 0);
}

function playerNetWorth(state: MonopolyState, player: PlayerState) {
  return player.cash + propertyNetWorth(state, player.id);
}

function autoMortgage(state: MonopolyState, playerIndex: number) {
  const player = state.players[playerIndex];
  if (!player) return;
  const sellable = ownedTileIds(state, player.id)
    .filter((id) => canSellHouse(state, id))
    .sort((a, b) => (TILES[b].houseCost || 0) - (TILES[a].houseCost || 0));
  for (const id of sellable) {
    while (player.cash < 0 && canSellHouse(state, id)) {
      const ownership = state.properties[String(id)];
      ownership.houses -= 1;
      player.cash += Math.floor((TILES[id].houseCost || 0) / 2);
      addLog(state, `${player.name} sold a building on ${TILES[id].name}.`);
    }
  }
  const mortgageable = ownedTileIds(state, player.id)
    .filter((id) => canMortgage(state, id))
    .sort((a, b) => (TILES[b].price || 0) - (TILES[a].price || 0));
  for (const id of mortgageable) {
    if (player.cash >= 0) break;
    const ownership = state.properties[String(id)];
    ownership.mortgaged = true;
    player.cash += Math.floor((TILES[id].price || 0) / 2);
    addLog(state, `${player.name} mortgaged ${TILES[id].name}.`);
  }
  if (player.cash >= 0) {
    state.phase = "action";
    state.debtToId = null;
  }
}

function declareBankruptcy(state: MonopolyState, playerIndex: number) {
  const player = state.players[playerIndex];
  if (!player) return;
  const creditor = state.debtToId ? state.players.find((entry) => entry.id === state.debtToId) : null;
  ownedTileIds(state, player.id).forEach((id) => {
    const ownership = state.properties[String(id)];
    ownership.ownerId = creditor?.id || null;
    ownership.houses = 0;
    ownership.mortgaged = creditor ? ownership.mortgaged : false;
  });
  player.cash = 0;
  player.bankrupt = true;
  player.jailed = false;
  addLog(state, `${player.name} declared bankruptcy${creditor ? ` to ${creditor.name}` : ""}.`);
  state.debtToId = null;
  state.pendingTile = null;
  checkWinner(state);
  if (state.status === "playing") {
    state.currentPlayer = nextActivePlayerIndex(state, playerIndex);
    state.phase = "roll";
    state.dice = [0, 0];
    state.extraTurn = false;
    state.turnNumber += 1;
  }
}

function tileGridPosition(tileId: number) {
  if (tileId <= 10) return { row: 11, col: 11 - tileId };
  if (tileId <= 20) return { row: 21 - tileId, col: 1 };
  if (tileId <= 30) return { row: 1, col: tileId - 19 };
  return { row: tileId - 29, col: 11 };
}

function tokenGlyph(token: TokenName) {
  if (token === "bolt") return "⚡";
  if (token === "crown") return "♛";
  if (token === "gamepad") return "🎮";
  return "🚀";
}

function tileIcon(tile: Tile) {
  if (tile.kind === "go") return "▶";
  if (tile.kind === "transit") return "🚇";
  if (tile.kind === "utility") return "⚙";
  if (tile.kind === "chance") return "?";
  if (tile.kind === "chest") return "◆";
  if (tile.kind === "tax") return "₵";
  if (tile.kind === "jail") return "🛡";
  if (tile.kind === "free") return "P";
  if (tile.kind === "gotojail") return "⛔";
  return "";
}

function tileArtwork(tile: Tile) {
  if (tile.kind === "go") return "🚀";
  if (tile.kind === "transit") return "🚄";
  if (tile.kind === "utility") return tile.id === 12 ? "⚡" : "☁️";
  if (tile.kind === "chance") return "🎁";
  if (tile.kind === "chest") return "💎";
  if (tile.kind === "tax") return "🏦";
  if (tile.kind === "jail") return "🛡️";
  if (tile.kind === "free") return "🏖️";
  if (tile.kind === "gotojail") return "🚨";
  if (tile.group === "bronze") return "🏠";
  if (tile.group === "cyan") return "🗼";
  if (tile.group === "magenta") return "🎡";
  if (tile.group === "orange") return "🏟️";
  if (tile.group === "red") return "🏬";
  if (tile.group === "yellow") return "🏙️";
  if (tile.group === "green") return "🌴";
  if (tile.group === "blue") return "🏰";
  return tileIcon(tile) || "✨";
}

function formatRoomAge(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 20) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

function normalizeRoomRow(value: MonopolyRoomRow): MonopolyRoomRow {
  return {
    ...value,
    room_name: value.room_name || "Marble Online Room",
    room_code: String(value.room_code || "").toUpperCase(),
    room_kind: value.room_kind === "matchmaking" ? "matchmaking" : "public",
    player_ids: Array.isArray(value.player_ids) ? value.player_ids : [],
    player_names: Array.isArray(value.player_names) ? value.player_names : [],
    ready_player_ids: Array.isArray(value.ready_player_ids) ? value.ready_player_ids : [],
    max_players: Math.max(2, Math.min(4, Number(value.max_players) || 4)),
    game_state: normalizeState(value.game_state),
  };
}

function useGameAudio() {
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [volume, setVolume] = useState(0.45);
  const musicTimerRef = useRef<number | null>(null);

  const ensure = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!contextRef.current) {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;
      const context = new AudioContextClass();
      const master = context.createGain();
      master.gain.value = volume;
      master.connect(context.destination);
      contextRef.current = context;
      masterRef.current = master;
    }
    if (contextRef.current.state === "suspended") void contextRef.current.resume();
    return contextRef.current;
  }, [volume]);

  useEffect(() => {
    if (masterRef.current) masterRef.current.gain.value = enabled ? volume : 0;
  }, [enabled, volume]);

  const tone = useCallback((frequency: number, duration: number, type: OscillatorType = "sine", gain = 0.08, delay = 0) => {
    if (!enabled) return;
    const context = ensure();
    const master = masterRef.current;
    if (!context || !master) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const start = context.currentTime + delay;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.type = type;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), start + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }, [enabled, ensure]);

  const noise = useCallback((duration: number, gain = 0.05) => {
    if (!enabled) return;
    const context = ensure();
    const master = masterRef.current;
    if (!context || !master) return;
    const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * duration)), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = 900;
    envelope.gain.setValueAtTime(gain, context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start();
  }, [enabled, ensure]);

  const play = useCallback((sound: SoundName) => {
    if (!enabled) return;
    ensure();
    if (sound === "click") tone(520, 0.08, "square", 0.035);
    if (sound === "dice") {
      noise(0.28, 0.06);
      tone(120, 0.12, "triangle", 0.05);
      tone(170, 0.12, "triangle", 0.04, 0.12);
    }
    if (sound === "step") tone(230, 0.045, "square", 0.025);
    if (sound === "cash") {
      tone(660, 0.12, "sine", 0.06);
      tone(880, 0.17, "sine", 0.055, 0.08);
    }
    if (sound === "buy") {
      tone(392, 0.12, "triangle", 0.06);
      tone(523, 0.14, "triangle", 0.06, 0.1);
      tone(659, 0.2, "triangle", 0.06, 0.2);
    }
    if (sound === "rent") {
      tone(330, 0.15, "sawtooth", 0.045);
      tone(247, 0.2, "sawtooth", 0.04, 0.1);
    }
    if (sound === "card") {
      tone(740, 0.08, "square", 0.045);
      tone(980, 0.14, "square", 0.04, 0.08);
    }
    if (sound === "jail") {
      tone(220, 0.18, "sawtooth", 0.06);
      tone(110, 0.35, "sawtooth", 0.055, 0.14);
    }
    if (sound === "build") {
      noise(0.09, 0.04);
      tone(440, 0.12, "square", 0.045, 0.05);
      tone(660, 0.16, "square", 0.045, 0.14);
    }
    if (sound === "trade") {
      tone(500, 0.1, "sine", 0.05);
      tone(750, 0.1, "sine", 0.05, 0.12);
      tone(1000, 0.18, "sine", 0.05, 0.24);
    }
    if (sound === "win") {
      [523, 659, 784, 1047].forEach((frequency, index) => tone(frequency, 0.28, "triangle", 0.06, index * 0.12));
    }
    if (sound === "error") {
      tone(180, 0.18, "square", 0.06);
      tone(130, 0.24, "square", 0.05, 0.12);
    }
  }, [enabled, ensure, noise, tone]);

  useEffect(() => {
    if (!enabled || !musicEnabled) {
      if (musicTimerRef.current !== null) window.clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
      return;
    }
    ensure();
    const sequence = () => {
      [196, 247, 294, 370].forEach((frequency, index) => tone(frequency, 0.65, "sine", 0.015, index * 0.28));
      [392, 494, 587].forEach((frequency, index) => tone(frequency, 0.4, "triangle", 0.012, 0.14 + index * 0.42));
    };
    sequence();
    musicTimerRef.current = window.setInterval(sequence, 1900);
    return () => {
      if (musicTimerRef.current !== null) window.clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
    };
  }, [enabled, ensure, musicEnabled, tone]);

  useEffect(() => () => {
    if (musicTimerRef.current !== null) window.clearInterval(musicTimerRef.current);
    void contextRef.current?.close();
  }, []);

  return {
    enabled,
    setEnabled,
    musicEnabled,
    setMusicEnabled,
    volume,
    setVolume,
    play,
    unlock: ensure,
  };
}

function ScoreHeader({ best, state, mode }: { best: number; state: MonopolyState; mode: GameMode }) {
  const current = state.players[state.currentPlayer];
  const leader = [...state.players].filter((player) => !player.bankrupt).sort((a, b) => playerNetWorth(state, b) - playerNetWorth(state, a))[0];
  return (
    <div className={`${styles.scoreHeader} mb-2 grid grid-cols-3 gap-2 text-center text-[9px] font-black uppercase tracking-wider sm:text-[10px]`}>
      <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2 text-slate-400">
        Mode
        <span className="mt-1 block truncate text-sm text-white sm:text-base">{mode ? mode.toUpperCase() : "READY"}</span>
      </div>
      <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/10 px-2 py-2 text-yellow-300">
        Leader
        <span className="mt-1 block truncate text-sm text-yellow-100 sm:text-base">{leader ? money(playerNetWorth(state, leader)) : money(best)}</span>
      </div>
      <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2 text-slate-400">
        Turn
        <span className="mt-1 block truncate text-sm text-cyan-200 sm:text-base">{state.status === "finished" ? "FINISHED" : current?.name || "LOBBY"}</span>
      </div>
    </div>
  );
}

function ModeCard({ icon, title, subtitle, onClick, disabled = false }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/45 hover:bg-cyan-300/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-xl text-cyan-200 transition group-hover:border-yellow-300/40 group-hover:bg-yellow-300/10 group-hover:text-yellow-200">{icon}</span>
      <span className="mt-4 block text-lg font-black text-white">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-slate-500">{subtitle}</span>
    </button>
  );
}

function ActionButton({ children, onClick, disabled = false, tone = "cyan", className = "" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "cyan" | "gold" | "red" | "slate" | "green"; className?: string }) {
  const tones = {
    cyan: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100 hover:border-cyan-200/70 hover:bg-cyan-300/20",
    gold: "border-yellow-300/35 bg-yellow-300/12 text-yellow-100 hover:border-yellow-200/75 hover:bg-yellow-300/22",
    red: "border-red-300/30 bg-red-300/10 text-red-100 hover:border-red-200/70 hover:bg-red-300/20",
    slate: "border-white/10 bg-white/5 text-slate-200 hover:border-white/25 hover:bg-white/10",
    green: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100 hover:border-emerald-200/70 hover:bg-emerald-300/20",
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-35 ${tones[tone]} ${className}`}>
      {children}
    </button>
  );
}

function BoardTile({ tile, state, selected, onSelect }: { tile: Tile; state: MonopolyState; selected: boolean; onSelect: (tileId: number) => void }) {
  const grid = tileGridPosition(tile.id);
  const ownership = state.properties[String(tile.id)];
  const owner = ownership?.ownerId ? state.players.find((player) => player.id === ownership.ownerId) : null;
  const occupants = state.players.filter((player) => !player.bankrupt && player.position === tile.id);
  const corner = [0, 10, 20, 30].includes(tile.id);
  const buildings = ownership?.houses || 0;
  const tileStyle = {
    gridRow: grid.row,
    gridColumn: grid.col,
    "--tile-accent": tile.groupColor || "#67e8f9",
  } as React.CSSProperties;

  return (
    <button
      type="button"
      onClick={() => onSelect(tile.id)}
      style={tileStyle}
      className={`${styles.tile} ${selected ? styles.tileSelected : ""} ${corner ? styles.cornerTile : ""}`}
      title={`${tile.name}${tile.price ? ` • ${money(tile.price)}` : ""}`}
    >
      {tile.groupColor ? <span className={styles.tileBand} style={{ background: `linear-gradient(90deg, ${tile.groupColor}, color-mix(in srgb, ${tile.groupColor} 45%, white))` }} /> : null}
      {owner ? <span className={styles.ownerFlag} style={{ background: owner.color }} /> : null}
      <span className={styles.tileContent} style={tile.groupColor ? { paddingTop: "18%" } : undefined}>
        <span className={styles.tileArtwork}>{tileArtwork(tile)}</span>
        <span className={styles.tileName}>{tile.shortName}</span>
        {tile.price ? <span className={styles.tilePrice}>{money(tile.price).replace("CP ", "CP ")}</span> : null}
      </span>
      {ownership?.mortgaged ? <span className={styles.mortgageRibbon}>MORTGAGED</span> : null}
      {buildings > 0 ? (
        <span className={styles.buildingRow} aria-label={buildings >= 5 ? "Hotel" : `${buildings} houses`}>
          {buildings >= 5 ? <span className={styles.hotelBlock} /> : Array.from({ length: buildings }, (_, index) => <span key={index} className={styles.houseBlock} />)}
        </span>
      ) : null}
      {occupants.length > 0 ? (
        <span className={styles.tokenStack}>
          {occupants.map((player, index) => (
            <span
              key={player.id}
              className={styles.tokenPawn}
              style={{ "--pawn-color": player.color, background: `linear-gradient(145deg, white, ${player.color} 38%, ${player.color})`, animationDelay: `${index * 0.12}s` } as React.CSSProperties}
              title={player.name}
            >
              {tokenGlyph(player.token)}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}

function DiceFace({ value, rolling }: { value: number; rolling: boolean }) {
  const dots: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  return (
    <span className={`${styles.dice3d} ${rolling ? styles.diceRolling : ""}`}>
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className={dots[value]?.includes(index) ? styles.diceDot : styles.diceDotHidden} />
      ))}
    </span>
  );
}

function GameBoard({ state, selectedTile, onSelectTile, rolling }: { state: MonopolyState; selectedTile: number | null; onSelectTile: (tileId: number) => void; rolling: boolean }) {
  const current = state.players[state.currentPlayer];
  const towerHeights = [50, 76, 58, 92, 68, 84, 54];
  return (
    <div className={styles.worldScene}>
      <div className={styles.playerRail}>
        {state.players.map((player, index) => {
          const active = index === state.currentPlayer && state.status === "playing";
          return (
            <div
              key={player.id}
              className={`${styles.playerChip} ${active ? styles.playerChipActive : ""} ${player.bankrupt ? styles.playerChipBankrupt : ""}`}
              style={{ "--player-color": player.color } as React.CSSProperties}
            >
              <span className={styles.avatarFrame} style={{ "--player-color": player.color } as React.CSSProperties}>
                {player.npc ? <span className={styles.avatarImage} /> : tokenGlyph(player.token)}
              </span>
              <span className="min-w-0 flex-1">
                <span className={styles.playerChipName}>{player.name}</span>
                <span className={styles.playerChipCash}>{money(player.cash)}</span>
              </span>
              {active ? <FaBolt className="shrink-0 text-yellow-300" /> : null}
            </div>
          );
        })}
      </div>

      <div className={styles.boardPerspective}>
        <div className={styles.boardFrame}>
          <div className={styles.boardGrid}>
            {TILES.map((tile) => <BoardTile key={tile.id} tile={tile} state={state} selected={selectedTile === tile.id} onSelect={onSelectTile} />)}
            <div className={styles.centerWorld}>
              <div className={styles.centerGridGlow} />
              <div className={styles.citySkyline} aria-hidden="true">
                {towerHeights.map((height, index) => <span key={index} className={styles.skyscraper} style={{ height: `${height}%` }} />)}
              </div>
              <div className={styles.alexiaGuide} aria-hidden="true" />
              <div className={styles.centerPanel}>
                <span className={styles.worldBadge}>ComePlayers World Tour</span>
                <p className={styles.worldTitle}>CP <span>MONOPOLY</span></p>
                <p className={styles.worldSubtitle}>Build • Trade • Rule the map</p>
                <div className={styles.diceRow}>
                  <DiceFace value={state.dice[0] || 1} rolling={rolling} />
                  <DiceFace value={state.dice[1] || 2} rolling={rolling} />
                </div>
                {current ? (
                  <div className={styles.currentPlayerPill}>
                    <span className={styles.currentToken} style={{ background: `linear-gradient(145deg, white, ${current.color} 40%, ${current.color})` }}>{tokenGlyph(current.token)}</span>
                    <span className="min-w-0 text-left">
                      <span className="block text-[7px] font-black uppercase tracking-[0.16em] text-cyan-200/75 sm:text-[9px]">Current turn</span>
                      <span className="block max-w-36 truncate text-[9px] font-black text-white sm:max-w-56 sm:text-xs">{current.name}</span>
                    </span>
                  </div>
                ) : null}
                <p className={styles.eventTicker}>{state.lastEvent}</p>
                {state.settings.freeParkingJackpot ? <p className={styles.jackpotBadge}>Jackpot {money(state.freeParkingPot)}</p> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerPanel({ state, userId }: { state: MonopolyState; userId: string | null }) {
  return (
    <div className={styles.playerPanelGrid}>
      {state.players.map((player, index) => {
        const current = index === state.currentPlayer && state.status === "playing";
        const properties = ownedTileIds(state, player.id).length;
        return (
          <div
            key={player.id}
            className={`${styles.playerCard} ${current ? styles.playerCardActive : ""} ${player.bankrupt ? "opacity-45 grayscale" : ""}`}
            style={{ "--player-color": player.color } as React.CSSProperties}
          >
            <div className={styles.playerCardTop}>
              <span className={styles.playerCardAvatar} style={{ "--player-color": player.color } as React.CSSProperties}>
                {player.npc ? <span className={styles.avatarImage} /> : tokenGlyph(player.token)}
              </span>
              <span className={styles.playerCardName}>
                <strong>{player.name}{player.id === userId ? " (You)" : ""}</strong>
                <small>{player.npc ? "Alexia NPC" : player.bankrupt ? "Bankrupt" : current ? "Rolling now" : "World rival"}</small>
              </span>
              {current ? <FaBolt className={styles.turnBolt} /> : null}
            </div>
            <div className={styles.playerStats}>
              <div className={styles.statCell}><span>Cash</span><strong className={player.cash < 0 ? "!text-red-300" : "!text-yellow-200"}>{money(player.cash)}</strong></div>
              <div className={styles.statCell}><span>Land</span><strong className="!text-cyan-200">{properties}</strong></div>
              <div className={styles.statCell}><span>Worth</span><strong>{money(playerNetWorth(state, player))}</strong></div>
            </div>
            {player.jailed ? <p className={styles.jailTag}>Anti-Cheat Detention • {player.jailTurns}/3</p> : null}
          </div>
        );
      })}
    </div>
  );
}

function PropertyInspector({ state, tileId, currentPlayerId, onClose, onBuild, onSell, onMortgage, onUnmortgage }: { state: MonopolyState; tileId: number; currentPlayerId: string | null; onClose: () => void; onBuild: (tileId: number) => void; onSell: (tileId: number) => void; onMortgage: (tileId: number) => void; onUnmortgage: (tileId: number) => void }) {
  const tile = TILES[tileId];
  const ownership = state.properties[String(tileId)];
  const owner = ownership?.ownerId ? state.players.find((player) => player.id === ownership.ownerId) : null;
  const own = owner?.id === currentPlayerId;
  const rent = tile.kind === "property" ? tile.rent?.[Math.min(5, ownership?.houses || 0)] || 0 : tile.kind === "transit" ? 25 : tile.kind === "utility" ? 4 : 0;
  return (
    <div className="fixed inset-0 z-[420] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-cyan-300/30 bg-[#061421] shadow-[0_30px_100px_rgba(0,0,0,0.75)]">
        <div className="h-3" style={{ background: tile.groupColor || "linear-gradient(90deg,#22d3ee,#facc15)" }} />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Property Intelligence</p>
              <h3 className="mt-1 text-2xl font-black text-white">{tile.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{tile.kind.toUpperCase()} {tile.price ? `• ${money(tile.price)}` : ""}</p>
            </div>
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-white"><FaXmark /></button>
          </div>
          {ownership ? (
            <>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-white/10 bg-black/25 p-3"><p className="text-[9px] font-black uppercase text-slate-600">Owner</p><p className="mt-1 truncate text-sm font-black text-white">{owner?.name || "Bank"}</p></div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-3"><p className="text-[9px] font-black uppercase text-slate-600">Level</p><p className="mt-1 text-sm font-black text-emerald-200">{ownership.houses >= 5 ? "Hotel" : `${ownership.houses} House`}</p></div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-3"><p className="text-[9px] font-black uppercase text-slate-600">Current rent</p><p className="mt-1 text-sm font-black text-yellow-200">{money(rent)}</p></div>
              </div>
              {tile.rent ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-slate-500">Rent ladder</p>
                  <div className="grid grid-cols-3 gap-2 text-[10px] sm:grid-cols-6">
                    {tile.rent.map((value, index) => <div key={value} className={`rounded-lg px-2 py-2 text-center ${index === ownership.houses ? "bg-yellow-300/15 text-yellow-100" : "bg-white/5 text-slate-400"}`}><span className="block text-[7px] font-bold uppercase">{index === 0 ? "Base" : index === 5 ? "Hotel" : `${index}H`}</span><span className="font-black">{money(value)}</span></div>)}
                  </div>
                </div>
              ) : null}
              {own ? (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <ActionButton onClick={() => onBuild(tileId)} disabled={!canBuildHouse(state, tileId)} tone="green"><FaHouse /> Build</ActionButton>
                  <ActionButton onClick={() => onSell(tileId)} disabled={!canSellHouse(state, tileId)} tone="slate"><FaHotel /> Sell</ActionButton>
                  <ActionButton onClick={() => onMortgage(tileId)} disabled={!canMortgage(state, tileId)} tone="gold"><FaLandmark /> Mortgage</ActionButton>
                  <ActionButton onClick={() => onUnmortgage(tileId)} disabled={!ownership.mortgaged} tone="cyan"><FaRotateRight /> Redeem</ActionButton>
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">This is a special board tile. It cannot be purchased or developed.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TradeDialog({ state, actorId, onClose, onSubmit, onAccept, onDecline }: { state: MonopolyState; actorId: string; onClose: () => void; onSubmit: (offer: TradeOffer) => void; onAccept: () => void; onDecline: () => void }) {
  const actor = state.players.find((player) => player.id === actorId);
  const [targetId, setTargetId] = useState(() => state.players.find((player) => player.id !== actorId && !player.bankrupt)?.id || "");
  const [giveCash, setGiveCash] = useState(0);
  const [askCash, setAskCash] = useState(0);
  const [giveProperties, setGiveProperties] = useState<number[]>([]);
  const [askProperties, setAskProperties] = useState<number[]>([]);
  const target = state.players.find((player) => player.id === targetId);
  const incoming = state.trade?.toId === actorId ? state.trade : null;
  const fromPlayer = incoming ? state.players.find((player) => player.id === incoming.fromId) : null;
  const toggle = (list: number[], setter: (value: number[]) => void, tileId: number) => setter(list.includes(tileId) ? list.filter((id) => id !== tileId) : [...list, tileId]);
  if (incoming) {
    return (
      <div className="fixed inset-0 z-[420] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
        <div className="w-full max-w-xl rounded-3xl border border-purple-300/35 bg-[#07131f] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.75)]">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-300">Incoming Trade Offer</p>
          <h3 className="mt-2 text-2xl font-black text-white">{fromPlayer?.name || "A rival"} wants to trade</h3>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4"><p className="text-[9px] font-black uppercase text-emerald-300">You receive</p><p className="mt-2 text-lg font-black text-white">{money(incoming.giveCash)}</p>{incoming.giveProperties.map((id) => <p key={id} className="mt-1 text-xs text-slate-300">+ {TILES[id].name}</p>)}</div>
            <div className="rounded-2xl border border-red-300/20 bg-red-300/5 p-4"><p className="text-[9px] font-black uppercase text-red-300">You give</p><p className="mt-2 text-lg font-black text-white">{money(incoming.askCash)}</p>{incoming.askProperties.map((id) => <p key={id} className="mt-1 text-xs text-slate-300">- {TILES[id].name}</p>)}</div>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2"><ActionButton onClick={onDecline} tone="red"><FaXmark /> Decline</ActionButton><ActionButton onClick={onAccept} tone="green"><FaCheck /> Accept Trade</ActionButton></div>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[420] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-purple-300/35 bg-[#07131f] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.75)]">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-300">Player-to-Player Trading</p><h3 className="mt-2 text-2xl font-black text-white">Build a trade offer</h3></div><button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300"><FaXmark /></button></div>
        <label className="mt-5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Trade with</label>
        <select value={targetId} onChange={(event) => { setTargetId(event.target.value); setAskProperties([]); }} className="mt-2 w-full rounded-xl border border-white/10 bg-[#020811] px-3 py-3 text-sm font-bold text-white outline-none focus:border-cyan-300/50">
          {state.players.filter((player) => player.id !== actorId && !player.bankrupt).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
        </select>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.035] p-4">
            <p className="text-sm font-black text-emerald-200">You give</p>
            <label className="mt-3 block text-[9px] font-bold uppercase text-slate-500">Cash</label>
            <input type="number" min={0} max={Math.max(0, actor?.cash || 0)} value={giveCash} onChange={(event) => setGiveCash(Math.max(0, Number(event.target.value) || 0))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm font-black text-white outline-none" />
            <div className="mt-3 space-y-1">{actor ? ownedTileIds(state, actor.id).map((id) => <button key={id} type="button" onClick={() => toggle(giveProperties, setGiveProperties, id)} className={`flex w-full items-center justify-between rounded-lg border px-2 py-2 text-left text-xs ${giveProperties.includes(id) ? "border-emerald-300/50 bg-emerald-300/10 text-white" : "border-white/10 bg-black/20 text-slate-400"}`}><span>{TILES[id].name}</span><span>{giveProperties.includes(id) ? "✓" : "+"}</span></button>) : null}</div>
          </div>
          <div className="rounded-2xl border border-yellow-300/20 bg-yellow-300/[0.035] p-4">
            <p className="text-sm font-black text-yellow-200">You request</p>
            <label className="mt-3 block text-[9px] font-bold uppercase text-slate-500">Cash</label>
            <input type="number" min={0} max={Math.max(0, target?.cash || 0)} value={askCash} onChange={(event) => setAskCash(Math.max(0, Number(event.target.value) || 0))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm font-black text-white outline-none" />
            <div className="mt-3 space-y-1">{target ? ownedTileIds(state, target.id).map((id) => <button key={id} type="button" onClick={() => toggle(askProperties, setAskProperties, id)} className={`flex w-full items-center justify-between rounded-lg border px-2 py-2 text-left text-xs ${askProperties.includes(id) ? "border-yellow-300/50 bg-yellow-300/10 text-white" : "border-white/10 bg-black/20 text-slate-400"}`}><span>{TILES[id].name}</span><span>{askProperties.includes(id) ? "✓" : "+"}</span></button>) : null}</div>
          </div>
        </div>
        <div className="mt-5 flex justify-end"><ActionButton onClick={() => onSubmit({ id: randomId("trade"), fromId: actorId, toId: targetId, giveCash, askCash, giveProperties, askProperties, status: "pending" })} disabled={!targetId || (giveCash === 0 && askCash === 0 && giveProperties.length === 0 && askProperties.length === 0)} tone="gold"><FaHandshake /> Send Offer</ActionButton></div>
      </div>
    </div>
  );
}

export default function ComePlayersMonopolyGame({ best, onScore }: ArcadeGameProps) {
  const audio = useGameAudio();
  const [mode, setMode] = useState<GameMode>(null);
  const [state, setState] = useState<MonopolyState>(() => createBaseState());
  const [rolling, setRolling] = useState(false);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [showManage, setShowManage] = useState(false);
  const [showTrade, setShowTrade] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [npcCount, setNpcCount] = useState(2);
  const [startingCash, setStartingCash] = useState(1500);
  const [freeParkingJackpot, setFreeParkingJackpot] = useState(true);
  const [fastMode, setFastMode] = useState(false);
  const [auctionBid, setAuctionBid] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [room, setRoom] = useState<MonopolyRoomRow | null>(null);
  const [reconnectRoom, setReconnectRoom] = useState<MonopolyRoomRow | null>(null);
  const [roomName, setRoomName] = useState("ComePlayers Marble Arena");
  const [joinCode, setJoinCode] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [publicRooms, setPublicRooms] = useState<MonopolyRoomRow[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const [savedOffline, setSavedOffline] = useState<MonopolyState | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(LOCAL_SAVE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  });
  const scoredWinnerRef = useRef<string | null>(null);

  const current = state.players[state.currentPlayer] || null;
  const actorId = mode === "offline" ? "local-human" : userId;
  const isMyTurn = Boolean(current && actorId && current.id === actorId);
  const canControl = mode === "offline" ? Boolean(current && !current.npc) : isMyTurn;
  const incomingTrade = Boolean(actorId && state.trade?.toId === actorId);
  const readyCount = room?.ready_player_ids.length ?? 0;
  const isReady = Boolean(userId && room?.ready_player_ids.includes(userId));
  const allPlayersReady = Boolean(room && room.player_ids.length >= 2 && room.player_ids.every((playerId) => room.ready_player_ids.includes(playerId)));

  const loadReconnectRoom = useCallback(async () => {
    if (!userId || mode !== null) {
      setReconnectRoom(null);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("arcade_monopoly_rooms")
      .select("*")
      .contains("player_ids", [userId])
      .in("status", ["waiting", "active"])
      .order("updated_at", { ascending: false })
      .limit(1);
    if (!error && Array.isArray(data) && data[0]) {
      setReconnectRoom(normalizeRoomRow(data[0] as MonopolyRoomRow));
    } else {
      setReconnectRoom(null);
    }
  }, [mode, userId]);

  const loadPublicRooms = useCallback(async (silent = false) => {
    if (!userId) {
      setPublicRooms([]);
      return;
    }
    if (!silent) setRoomsLoading(true);
    const supabase = getSupabaseBrowserClient();
    const cutoff = new Date(Date.now() - 150_000).toISOString();
    const { data, error } = await supabase
      .from("arcade_monopoly_rooms")
      .select("*")
      .eq("status", "waiting")
      .eq("room_kind", "public")
      .gte("updated_at", cutoff)
      .order("updated_at", { ascending: false })
      .limit(24);
    if (error) {
      if (!silent) setOnlineError(error.message.includes("arcade_monopoly_rooms") ? "Install the V43 Marble Online migration in Supabase first." : error.message);
    } else {
      setPublicRooms((data || []).map((entry: unknown) => normalizeRoomRow(entry as MonopolyRoomRow)));
    }
    if (!silent) setRoomsLoading(false);
  }, [userId]);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data }: { data: { user: { id: string } | null } }) => {
      if (!active) return;
      setUserId(data.user?.id || null);
      setAuthChecked(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (mode !== null || !userId) return;
    const timer = window.setTimeout(() => void loadReconnectRoom(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReconnectRoom, mode, userId]);

  useEffect(() => {
    if (mode !== null || !userId) return;
    const supabase = getSupabaseBrowserClient();
    const initialLoad = window.setTimeout(() => void loadPublicRooms(), 0);
    const channel = supabase
      .channel("comeplayers-monopoly-public-lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "arcade_monopoly_rooms" }, () => void loadPublicRooms(true))
      .subscribe();
    const interval = window.setInterval(() => void loadPublicRooms(true), 8_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [loadPublicRooms, mode, userId]);

  useEffect(() => {
    if (mode !== "online" || !room?.id) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`comeplayers-monopoly-${room.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "arcade_monopoly_rooms", filter: `id=eq.${room.id}` }, (payload: { new: unknown }) => {
        const nextRoom = normalizeRoomRow(payload.new as MonopolyRoomRow);
        setRoom(nextRoom);
        setState(nextRoom.game_state);
        setMaxPlayers(nextRoom.max_players);
        setStartingCash(nextRoom.game_state.settings.startingCash);
        setFastMode(nextRoom.game_state.settings.fastMode);
        setFreeParkingJackpot(nextRoom.game_state.settings.freeParkingJackpot);
        setReconnectRoom(nextRoom.status === "active" || nextRoom.status === "waiting" ? nextRoom : null);
        setOnlineBusy(false);
        if (nextRoom.status === "abandoned") setOnlineError("This Marble Online room is no longer available.");
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [mode, room?.id]);

  useEffect(() => {
    if (mode !== "online" || !room?.id || !userId) return;
    const supabase = getSupabaseBrowserClient();
    let active = true;
    const refresh = async () => {
      const { data, error } = await supabase
        .from("arcade_monopoly_rooms")
        .select("*")
        .eq("id", room.id)
        .maybeSingle();
      if (!active || error) return;
      if (!data) {
        setMode(null);
        setRoom(null);
        setReconnectRoom(null);
        setState(createBaseState());
        setOnlineBusy(false);
        setOnlineError("You were removed from the room or the room is no longer available.");
        return;
      }
      const nextRoom = normalizeRoomRow(data as MonopolyRoomRow);
      setRoom(nextRoom);
      setState(nextRoom.game_state);
      setReconnectRoom(nextRoom.status === "waiting" || nextRoom.status === "active" ? nextRoom : null);
      setOnlineBusy(false);
    };
    const interval = window.setInterval(() => void refresh(), 7_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [mode, room?.id, userId]);

  useEffect(() => {
    if (mode !== "online" || !room?.id || room.status !== "waiting" || room.host_player_id !== userId) return;
    const supabase = getSupabaseBrowserClient();
    const touch = () => { void supabase.rpc("arcade_monopoly_touch_room", { p_room_id: room.id }); };
    touch();
    const interval = window.setInterval(touch, 25_000);
    return () => window.clearInterval(interval);
  }, [mode, room?.host_player_id, room?.id, room?.status, userId]);

  useEffect(() => {
    if (mode !== "offline" || state.status !== "playing") return;
    try {
      window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(state));
    } catch {
      // Local save can be blocked in restricted webviews.
    }
  }, [mode, state]);

  useEffect(() => {
    if (state.status !== "finished" || !state.winnerId) return;
    const key = `${mode}-${room?.id || "local"}-${state.winnerId}-${state.turnNumber}`;
    if (scoredWinnerRef.current === key) return;
    scoredWinnerRef.current = key;
    const winner = state.players.find((player) => player.id === state.winnerId);
    if (winner && winner.id === actorId) {
      onScore(Math.max(1200, Math.round(playerNetWorth(state, winner) + state.turnNumber * 10)));
      audio.play("win");
    }
  }, [actorId, audio, mode, onScore, room?.id, state]);

  const submitOnlineState = useCallback(async (next: MonopolyState) => {
    if (!room || !userId) return false;
    setOnlineBusy(true);
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("arcade_monopoly_submit_state", {
      p_room_id: room.id,
      p_expected_version: room.version,
      p_game_state: next,
    });
    if (error || !Array.isArray(data) || !data[0]) {
      setOnlineError(error?.message || "The game state could not be synchronized.");
      setOnlineBusy(false);
      return false;
    }
    const nextRoom = normalizeRoomRow(data[0] as MonopolyRoomRow);
    setRoom(nextRoom);
    setState(nextRoom.game_state);
    setOnlineBusy(false);
    return true;
  }, [room, userId]);

  const commitState = useCallback((next: MonopolyState, sound?: SoundName) => {
    setState(next);
    if (sound) audio.play(sound);
    if (mode === "online") void submitOnlineState(next);
  }, [audio, mode, submitOnlineState]);

  function adoptOnlineRoom(nextRoom: MonopolyRoomRow) {
    setMode("online");
    setRoom(nextRoom);
    setReconnectRoom(nextRoom);
    setState(nextRoom.game_state);
    setMaxPlayers(nextRoom.max_players);
    setStartingCash(nextRoom.game_state.settings.startingCash);
    setFastMode(nextRoom.game_state.settings.fastMode);
    setFreeParkingJackpot(nextRoom.game_state.settings.freeParkingJackpot);
    setOnlineBusy(false);
  }

  function resumeOnlineRoom() {
    if (!reconnectRoom) return;
    audio.unlock();
    audio.play("trade");
    adoptOnlineRoom(reconnectRoom);
    setOnlineError("");
  }

  function startOfflineGame() {
    audio.unlock();
    audio.play("buy");
    const settings: MonopolySettings = { freeParkingJackpot, fastMode, startingCash: fastMode ? Math.min(startingCash, 1200) : startingCash };
    const next = createBaseState(settings);
    next.status = "playing";
    next.phase = "roll";
    next.players = [
      makePlayer("local-human", "You", 0, false, settings.startingCash),
      ...Array.from({ length: npcCount }, (_, index) => makePlayer(`npc-${index + 1}`, ["Alexia Strategist", "Alexia Trader", "Alexia Tycoon"][index], index + 1, true, settings.startingCash)),
    ];
    next.lastEvent = "Your business empire begins. Roll the dice.";
    next.log = ["Offline match started.", "Your business empire begins. Roll the dice."];
    setMode("offline");
    setRoom(null);
    setState(next);
    setOnlineError("");
    setSelectedTile(null);
    scoredWinnerRef.current = null;
  }

  function resumeOfflineGame() {
    if (!savedOffline || savedOffline.players.length < 2) return;
    audio.unlock();
    audio.play("click");
    setMode("offline");
    setRoom(null);
    setState(savedOffline);
    setOnlineError("");
  }

  async function createPublicRoom() {
    if (!userId) {
      setOnlineError("Sign in to ComePlayers before creating an online Marble Online room.");
      audio.play("error");
      return;
    }
    const cleanName = roomName.trim().replace(/\s+/g, " ");
    if (cleanName.length < 3 || cleanName.length > 48) {
      setOnlineError("Room name must contain 3 to 48 characters.");
      return;
    }
    setOnlineBusy(true);
    setOnlineError("");
    const template = createBaseState({ freeParkingJackpot, fastMode, startingCash });
    template.players = [makePlayer(userId, "Host", 0, false, startingCash)];
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("arcade_monopoly_create_room", {
      p_room_name: cleanName,
      p_max_players: maxPlayers,
      p_game_state: template,
    });
    if (error || !Array.isArray(data) || !data[0]) {
      setOnlineError(error?.message.includes("arcade_monopoly_create_room") ? "Install the V43 Marble Online migration in Supabase first." : error?.message || "The room could not be created.");
      setOnlineBusy(false);
      return;
    }
    const nextRoom = normalizeRoomRow(data[0] as MonopolyRoomRow);
    adoptOnlineRoom(nextRoom);
    audio.play("buy");
  }

  async function joinPublicRoom(roomId: string) {
    if (!userId) {
      setOnlineError("Sign in to ComePlayers before joining an online room.");
      return;
    }
    setOnlineBusy(true);
    setOnlineError("");
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("arcade_monopoly_join_room", { p_room_id: roomId });
    if (error || !Array.isArray(data) || !data[0]) {
      setOnlineError(error?.message || "The room is no longer available.");
      setOnlineBusy(false);
      void loadPublicRooms(true);
      return;
    }
    const nextRoom = normalizeRoomRow(data[0] as MonopolyRoomRow);
    adoptOnlineRoom(nextRoom);
    audio.play("trade");
  }

  async function joinRoomByCode() {
    if (!userId) {
      setOnlineError("Sign in to ComePlayers before joining with an invite code.");
      return;
    }
    const code = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (code.length !== 6) {
      setOnlineError("Enter the six-character room code.");
      return;
    }
    setOnlineBusy(true);
    setOnlineError("");
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("arcade_monopoly_join_room_code", { p_room_code: code });
    if (error || !Array.isArray(data) || !data[0]) {
      setOnlineError(error?.message.includes("arcade_monopoly_join_room_code") ? "Install the V47 room-code migration in Supabase first." : error?.message || "The invite code is invalid or the room is unavailable.");
      setOnlineBusy(false);
      return;
    }
    const nextRoom = normalizeRoomRow(data[0] as MonopolyRoomRow);
    adoptOnlineRoom(nextRoom);
    setJoinCode("");
    audio.play("trade");
  }

  async function copyInviteCode() {
    if (!room?.room_code) return;
    try {
      await navigator.clipboard.writeText(room.room_code);
      setOnlineError("Invite code copied. Send it to your friend in ComePlayers Chat & Messages.");
    } catch {
      setOnlineError(`Invite code: ${room.room_code}`);
    }
  }

  async function startMatchmaking() {
    if (!userId) {
      setOnlineError("Sign in to ComePlayers before using global matchmaking.");
      return;
    }
    setOnlineBusy(true);
    setOnlineError("");
    const template = createBaseState({ freeParkingJackpot: true, fastMode: true, startingCash: 1200 });
    template.players = [makePlayer(userId, "Match Player", 0, false, 1200)];
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("arcade_monopoly_matchmake", { p_game_state: template });
    if (error || !Array.isArray(data) || !data[0]) {
      setOnlineError(error?.message.includes("arcade_monopoly_matchmake") ? "Install the V43 Marble Online migration in Supabase first." : error?.message || "Matchmaking could not be started.");
      setOnlineBusy(false);
      return;
    }
    const nextRoom = normalizeRoomRow(data[0] as MonopolyRoomRow);
    adoptOnlineRoom(nextRoom);
    audio.play("trade");
  }

  async function toggleOnlineReady() {
    if (!room || !userId || room.status !== "waiting") return;
    setOnlineBusy(true);
    setOnlineError("");
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("arcade_monopoly_set_ready", {
      p_room_id: room.id,
      p_ready: !isReady,
    });
    if (error || !Array.isArray(data) || !data[0]) {
      setOnlineError(error?.message.includes("arcade_monopoly_set_ready") ? "Install the V48 multiplayer-lobby migration in Supabase first." : error?.message || "Ready status could not be updated.");
      setOnlineBusy(false);
      return;
    }
    adoptOnlineRoom(normalizeRoomRow(data[0] as MonopolyRoomRow));
    audio.play(isReady ? "click" : "buy");
  }

  async function updateOnlineLobbySettings() {
    if (!room || !userId || room.host_player_id !== userId || room.status !== "waiting") return;
    setOnlineBusy(true);
    setOnlineError("");
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("arcade_monopoly_update_lobby", {
      p_room_id: room.id,
      p_max_players: maxPlayers,
      p_starting_cash: fastMode ? Math.min(startingCash, 1200) : startingCash,
      p_fast_mode: fastMode,
      p_free_parking_jackpot: freeParkingJackpot,
    });
    if (error || !Array.isArray(data) || !data[0]) {
      setOnlineError(error?.message.includes("arcade_monopoly_update_lobby") ? "Install the V48 multiplayer-lobby migration in Supabase first." : error?.message || "Room settings could not be saved.");
      setOnlineBusy(false);
      return;
    }
    adoptOnlineRoom(normalizeRoomRow(data[0] as MonopolyRoomRow));
    setOnlineError("Room settings saved. Players must confirm Ready again.");
    audio.play("build");
  }

  async function kickOnlinePlayer(playerId: string) {
    if (!room || !userId || room.host_player_id !== userId || playerId === userId) return;
    setOnlineBusy(true);
    setOnlineError("");
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("arcade_monopoly_kick_player", {
      p_room_id: room.id,
      p_player_id: playerId,
    });
    if (error || !Array.isArray(data) || !data[0]) {
      setOnlineError(error?.message.includes("arcade_monopoly_kick_player") ? "Install the V48 multiplayer-lobby migration in Supabase first." : error?.message || "The player could not be removed.");
      setOnlineBusy(false);
      return;
    }
    adoptOnlineRoom(normalizeRoomRow(data[0] as MonopolyRoomRow));
    audio.play("error");
  }

  async function startOnlineRoom() {
    if (!room || room.host_player_id !== userId || room.player_ids.length < 2 || !allPlayersReady) return;
    setOnlineBusy(true);
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("arcade_monopoly_start_room", { p_room_id: room.id });
    if (error || !Array.isArray(data) || !data[0]) {
      setOnlineError(error?.message || "The match could not be started.");
      setOnlineBusy(false);
      return;
    }
    const nextRoom = normalizeRoomRow(data[0] as MonopolyRoomRow);
    adoptOnlineRoom(nextRoom);
    audio.play("buy");
  }

  function exitGame() {
    const leavingRoom = room;
    if (mode === "offline" && state.players.length >= 2) setSavedOffline(state);
    if (mode === "online" && leavingRoom?.status === "waiting" && userId) {
      const supabase = getSupabaseBrowserClient();
      if (leavingRoom.host_player_id === userId) {
        void supabase.rpc("arcade_monopoly_cancel_room", { p_room_id: leavingRoom.id });
      } else {
        void supabase.rpc("arcade_monopoly_leave_room", { p_room_id: leavingRoom.id });
      }
    }
    setMode(null);
    setRoom(null);
    if (leavingRoom?.status === "waiting") setReconnectRoom(null);
    setState(createBaseState());
    setSelectedTile(null);
    setShowManage(false);
    setShowTrade(false);
    setOnlineError("");
    window.setTimeout(() => {
      void loadPublicRooms(true);
      void loadReconnectRoom();
    }, 250);
  }

  const rollCurrentPlayer = useCallback((allowNpc = false) => {
    const player = state.players[state.currentPlayer];
    if (!player || state.status !== "playing" || state.phase !== "roll" || rolling || onlineBusy) return;
    if (!allowNpc && !canControl) return;
    if (mode === "online" && player.id !== userId) return;
    audio.unlock();
    audio.play("dice");
    setRolling(true);
    window.setTimeout(() => {
      const dieOne = Math.floor(Math.random() * 6) + 1;
      const dieTwo = Math.floor(Math.random() * 6) + 1;
      const total = dieOne + dieTwo;
      const next = cloneState(state);
      const active = next.players[next.currentPlayer];
      if (!active) {
        setRolling(false);
        return;
      }
      next.dice = [dieOne, dieTwo];
      next.pendingTile = null;
      next.debtToId = null;
      const rolledDouble = dieOne === dieTwo;

      if (active.jailed) {
        if (rolledDouble) {
          active.jailed = false;
          active.jailTurns = 0;
          next.extraTurn = false;
          next.doublesInRow = 0;
          movePlayerBy(next, next.currentPlayer, total);
          addLog(next, `${active.name} rolled doubles, escaped detention, and moved ${total} spaces.`);
          resolveLanding(next, next.currentPlayer, total);
        } else {
          active.jailTurns += 1;
          next.extraTurn = false;
          if (active.jailTurns >= 3) {
            active.cash -= 50;
            if (next.settings.freeParkingJackpot) next.freeParkingPot += 50;
            active.jailed = false;
            active.jailTurns = 0;
            movePlayerBy(next, next.currentPlayer, total);
            addLog(next, `${active.name} paid ${money(50)} after three detention turns and moved ${total} spaces.`);
            resolveLanding(next, next.currentPlayer, total);
            if (active.cash < 0) {
              next.phase = "debt";
              next.debtToId = null;
            }
          } else {
            next.phase = "action";
            addLog(next, `${active.name} failed to roll doubles and remains in detention (${active.jailTurns}/3).`);
          }
        }
      } else {
        next.doublesInRow = rolledDouble ? next.doublesInRow + 1 : 0;
        next.extraTurn = rolledDouble;
        if (next.doublesInRow >= 3) {
          sendToJail(next, next.currentPlayer);
          addLog(next, `${active.name} rolled three doubles in a row and triggered anti-cheat detention.`);
        } else {
          movePlayerBy(next, next.currentPlayer, total);
          addLog(next, `${active.name} rolled ${dieOne} + ${dieTwo} and landed on ${TILES[active.position].name}.`);
          resolveLanding(next, next.currentPlayer, total);
        }
      }
      setRolling(false);
      const event = next.lastEvent.toLowerCase();
      const sound: SoundName = event.includes("detention") ? "jail" : event.includes("rent") || event.includes("paid") ? "rent" : event.includes("drew") ? "card" : event.includes("collected") ? "cash" : "step";
      commitState(next, sound);
    }, state.settings.fastMode ? 350 : 620);
  }, [audio, canControl, commitState, mode, onlineBusy, rolling, state, userId]);

  const buyPendingProperty = useCallback((allowNpc = false) => {
    const next = cloneState(state);
    const player = next.players[next.currentPlayer];
    const tileId = next.pendingTile;
    if (!player || tileId === null || next.phase !== "buy") return;
    if (!allowNpc && !canControl) return;
    const tile = TILES[tileId];
    const ownership = next.properties[String(tileId)];
    const price = tile.price || 0;
    if (!ownership || ownership.ownerId || player.cash < price) {
      audio.play("error");
      return;
    }
    player.cash -= price;
    ownership.ownerId = player.id;
    next.pendingTile = null;
    next.phase = player.cash < 0 ? "debt" : "action";
    addLog(next, `${player.name} purchased ${tile.name} for ${money(price)}.`);
    commitState(next, "buy");
  }, [audio, canControl, commitState, state]);

  const runAuction = useCallback((humanBidOverride?: number) => {
    const next = cloneState(state);
    const tileId = next.pendingTile;
    if (tileId === null || next.phase !== "buy") return;
    const tile = TILES[tileId];
    const price = tile.price || 0;
    const bids = next.players
      .filter((player) => !player.bankrupt && player.cash > 50)
      .map((player) => {
        let bid = 0;
        if (player.id === actorId && typeof humanBidOverride === "number") {
          bid = Math.min(Math.max(0, humanBidOverride), Math.max(0, player.cash - 1));
        } else {
          const sameGroupOwned = tile.group ? groupTileIds(tile.group).filter((id) => next.properties[String(id)]?.ownerId === player.id).length : 0;
          const desire = 0.55 + sameGroupOwned * 0.25 + (player.npc ? Math.random() * 0.25 : 0.08);
          bid = Math.min(Math.max(0, player.cash - 180), Math.floor(price * desire / 10) * 10);
        }
        return { player, bid };
      })
      .filter((entry) => entry.bid >= 10)
      .sort((a, b) => b.bid - a.bid);
    const winner = bids[0];
    if (winner) {
      winner.player.cash -= winner.bid;
      next.properties[String(tileId)].ownerId = winner.player.id;
      addLog(next, `${winner.player.name} won the lightning auction for ${tile.name} at ${money(winner.bid)}.`);
    } else {
      addLog(next, `No player bid on ${tile.name}; it remains with the bank.`);
    }
    next.pendingTile = null;
    next.phase = "action";
    setAuctionBid(0);
    commitState(next, winner ? "buy" : "click");
  }, [actorId, commitState, state]);

  const endTurn = useCallback((allowNpc = false) => {
    const next = cloneState(state);
    const player = next.players[next.currentPlayer];
    if (!player || next.status !== "playing" || next.phase !== "action") return;
    if (!allowNpc && !canControl) return;
    if (next.trade && next.trade.fromId === player.id) {
      next.trade = null;
      addLog(next, `${player.name}'s unanswered trade offer expired at the end of the turn.`);
    }
    checkWinner(next);
    if ((next as MonopolyState).status === "finished") {
      commitState(next, "win");
      return;
    }
    if (next.settings.fastMode && next.turnNumber >= 80) {
      const leader = [...next.players].filter((entry) => !entry.bankrupt).sort((a, b) => playerNetWorth(next, b) - playerNetWorth(next, a))[0];
      next.status = "finished";
      next.phase = "finished";
      next.winnerId = leader?.id || null;
      addLog(next, `${leader?.name || "A player"} wins the 80-turn Blitz Economy by net worth.`);
      commitState(next, "win");
      return;
    }
    if (next.extraTurn && !player.jailed && !player.bankrupt) {
      next.extraTurn = false;
      next.phase = "roll";
      next.dice = [0, 0];
      next.pendingTile = null;
      next.debtToId = null;
      addLog(next, `${player.name} earned another roll with doubles.`);
    } else {
      next.currentPlayer = nextActivePlayerIndex(next, next.currentPlayer);
      next.phase = "roll";
      next.dice = [0, 0];
      next.extraTurn = false;
      next.doublesInRow = 0;
      next.pendingTile = null;
      next.debtToId = null;
      next.turnNumber += 1;
      addLog(next, `${next.players[next.currentPlayer]?.name || "Next player"}'s turn begins.`);
    }
    commitState(next, "click");
  }, [canControl, commitState, state]);

  function payToLeaveJail() {
    if (!canControl || !current?.jailed || state.phase !== "roll" || current.cash < 50) return;
    const next = cloneState(state);
    const player = next.players[next.currentPlayer];
    player.cash -= 50;
    player.jailed = false;
    player.jailTurns = 0;
    if (next.settings.freeParkingJackpot) next.freeParkingPot += 50;
    addLog(next, `${player.name} paid ${money(50)} to leave detention before rolling.`);
    commitState(next, "cash");
  }

  function useGetOutCard() {
    if (!canControl || !current?.jailed || current.getOutCards <= 0 || state.phase !== "roll") return;
    const next = cloneState(state);
    const player = next.players[next.currentPlayer];
    player.getOutCards -= 1;
    player.jailed = false;
    player.jailTurns = 0;
    addLog(next, `${player.name} used a Get Out of Detention card.`);
    commitState(next, "card");
  }

  function manageBuild(tileId: number) {
    if (!actorId || !canBuildHouse(state, tileId)) return;
    const next = cloneState(state);
    const ownership = next.properties[String(tileId)];
    const owner = next.players.find((player) => player.id === ownership.ownerId);
    const cost = TILES[tileId].houseCost || 0;
    if (!owner || owner.id !== actorId || owner.cash < cost) {
      audio.play("error");
      return;
    }
    owner.cash -= cost;
    ownership.houses += 1;
    addLog(next, `${owner.name} built ${ownership.houses >= 5 ? "a hotel" : "a house"} on ${TILES[tileId].name} for ${money(cost)}.`);
    commitState(next, "build");
  }

  function manageSell(tileId: number) {
    if (!actorId || !canSellHouse(state, tileId)) return;
    const next = cloneState(state);
    const ownership = next.properties[String(tileId)];
    const owner = next.players.find((player) => player.id === ownership.ownerId);
    if (!owner || owner.id !== actorId) return;
    const refund = Math.floor((TILES[tileId].houseCost || 0) / 2);
    ownership.houses -= 1;
    owner.cash += refund;
    if (owner.cash >= 0 && next.phase === "debt") {
      next.phase = "action";
      next.debtToId = null;
    }
    addLog(next, `${owner.name} sold a building on ${TILES[tileId].name} for ${money(refund)}.`);
    commitState(next, "cash");
  }

  function manageMortgage(tileId: number) {
    if (!actorId || !canMortgage(state, tileId)) return;
    const next = cloneState(state);
    const ownership = next.properties[String(tileId)];
    const owner = next.players.find((player) => player.id === ownership.ownerId);
    if (!owner || owner.id !== actorId) return;
    const value = Math.floor((TILES[tileId].price || 0) / 2);
    ownership.mortgaged = true;
    owner.cash += value;
    if (owner.cash >= 0 && next.phase === "debt") {
      next.phase = "action";
      next.debtToId = null;
    }
    addLog(next, `${owner.name} mortgaged ${TILES[tileId].name} for ${money(value)}.`);
    commitState(next, "cash");
  }

  function manageUnmortgage(tileId: number) {
    if (!actorId) return;
    const ownership = state.properties[String(tileId)];
    if (!ownership?.mortgaged || ownership.ownerId !== actorId) return;
    const cost = Math.ceil((TILES[tileId].price || 0) * 0.55);
    const owner = state.players.find((player) => player.id === actorId);
    if (!owner || owner.cash < cost) {
      audio.play("error");
      return;
    }
    const next = cloneState(state);
    const nextOwner = next.players.find((player) => player.id === actorId)!;
    nextOwner.cash -= cost;
    next.properties[String(tileId)].mortgaged = false;
    addLog(next, `${nextOwner.name} redeemed ${TILES[tileId].name} for ${money(cost)}.`);
    commitState(next, "buy");
  }

  function raiseFundsAutomatically() {
    if (!canControl || state.phase !== "debt") return;
    const next = cloneState(state);
    autoMortgage(next, next.currentPlayer);
    const player = next.players[next.currentPlayer];
    addLog(next, player.cash >= 0 ? `${player.name} raised enough funds to clear the debt.` : `${player.name} still owes ${money(Math.abs(player.cash))}. Sell more assets or declare bankruptcy.`);
    commitState(next, player.cash >= 0 ? "cash" : "error");
  }

  function bankruptCurrentPlayer() {
    if (!canControl || state.phase !== "debt") return;
    const next = cloneState(state);
    declareBankruptcy(next, next.currentPlayer);
    commitState(next, next.status === "finished" ? "win" : "jail");
  }

  function validTradeOffer(offer: TradeOffer) {
    const from = state.players.find((player) => player.id === offer.fromId);
    const to = state.players.find((player) => player.id === offer.toId);
    if (!from || !to || from.bankrupt || to.bankrupt) return false;
    if (offer.giveCash > from.cash || offer.askCash > to.cash) return false;
    if (offer.giveProperties.some((id) => state.properties[String(id)]?.ownerId !== from.id || (state.properties[String(id)]?.houses || 0) > 0)) return false;
    if (offer.askProperties.some((id) => state.properties[String(id)]?.ownerId !== to.id || (state.properties[String(id)]?.houses || 0) > 0)) return false;
    return true;
  }

  function applyTrade(next: MonopolyState, offer: TradeOffer) {
    const from = next.players.find((player) => player.id === offer.fromId);
    const to = next.players.find((player) => player.id === offer.toId);
    if (!from || !to) return false;
    from.cash += offer.askCash - offer.giveCash;
    to.cash += offer.giveCash - offer.askCash;
    offer.giveProperties.forEach((id) => { next.properties[String(id)].ownerId = to.id; });
    offer.askProperties.forEach((id) => { next.properties[String(id)].ownerId = from.id; });
    next.trade = null;
    addLog(next, `${from.name} and ${to.name} completed a property trade.`);
    return true;
  }

  function submitTradeOffer(offer: TradeOffer) {
    if (!actorId || offer.fromId !== actorId || !validTradeOffer(offer)) {
      audio.play("error");
      return;
    }
    const target = state.players.find((player) => player.id === offer.toId);
    const next = cloneState(state);
    if (target?.npc && mode === "offline") {
      const receivedValue = offer.giveCash + offer.giveProperties.reduce((sum, id) => sum + (TILES[id].price || 0), 0);
      const outgoingValue = offer.askCash + offer.askProperties.reduce((sum, id) => sum + (TILES[id].price || 0), 0);
      const strategicBonus = offer.askProperties.some((id) => {
        const tile = TILES[id];
        return tile.group && ownsGroup(next, offer.fromId, tile.group);
      }) ? 120 : 0;
      if (receivedValue >= outgoingValue * 0.88 + strategicBonus) {
        applyTrade(next, offer);
        addLog(next, `${target.name} accepted the negotiated offer.`);
        commitState(next, "trade");
      } else {
        addLog(next, `${target.name} declined the offer after evaluating its portfolio value.`);
        commitState(next, "error");
      }
      setShowTrade(false);
      return;
    }
    next.trade = offer;
    addLog(next, `${next.players.find((player) => player.id === offer.fromId)?.name || "A player"} sent a trade offer to ${target?.name || "a rival"}.`);
    commitState(next, "trade");
    setShowTrade(false);
  }

  function acceptTrade() {
    if (!actorId || state.trade?.toId !== actorId || !validTradeOffer(state.trade)) {
      audio.play("error");
      return;
    }
    const next = cloneState(state);
    applyTrade(next, next.trade!);
    commitState(next, "trade");
    setShowTrade(false);
  }

  function declineTrade() {
    if (!actorId || state.trade?.toId !== actorId) return;
    const next = cloneState(state);
    const target = next.players.find((player) => player.id === actorId);
    next.trade = null;
    addLog(next, `${target?.name || "A player"} declined the trade offer.`);
    commitState(next, "error");
    setShowTrade(false);
  }

  useEffect(() => {
    if (mode !== "offline" || state.status !== "playing") return;
    const player = state.players[state.currentPlayer];
    if (!player?.npc || rolling) return;
    const delay = state.settings.fastMode ? 350 : 750;
    const timer = window.setTimeout(() => {
      if (state.phase === "roll") {
        rollCurrentPlayer(true);
        return;
      }
      if (state.phase === "buy") {
        const tileId = state.pendingTile;
        const tile = tileId === null ? null : TILES[tileId];
        const sameGroup = tile?.group ? groupTileIds(tile.group).filter((id) => state.properties[String(id)]?.ownerId === player.id).length : 0;
        const shouldBuy = Boolean(tile && player.cash >= (tile.price || 0) + (state.settings.fastMode ? 100 : 220) && (Math.random() > 0.18 || sameGroup > 0));
        if (shouldBuy) buyPendingProperty(true);
        else runAuction();
        return;
      }
      if (state.phase === "debt") {
        const next = cloneState(state);
        autoMortgage(next, next.currentPlayer);
        if (next.players[next.currentPlayer].cash < 0) declareBankruptcy(next, next.currentPlayer);
        commitState(next, next.status === "finished" ? "win" : "cash");
        return;
      }
      if (state.phase === "action") {
        const next = cloneState(state);
        const npc = next.players[next.currentPlayer];
        const buildable = ownedTileIds(next, npc.id).filter((id) => canBuildHouse(next, id) && npc.cash >= (TILES[id].houseCost || 0) + 300);
        if (buildable.length > 0 && Math.random() > 0.38) {
          const tileId = buildable[Math.floor(Math.random() * buildable.length)];
          const cost = TILES[tileId].houseCost || 0;
          npc.cash -= cost;
          next.properties[String(tileId)].houses += 1;
          addLog(next, `${npc.name} developed ${TILES[tileId].name}.`);
          if (next.extraTurn && !npc.jailed && !npc.bankrupt) {
            next.extraTurn = false;
            next.phase = "roll";
            next.dice = [0, 0];
            addLog(next, `${npc.name} earned another roll with doubles.`);
          } else {
            next.currentPlayer = nextActivePlayerIndex(next, next.currentPlayer);
            next.phase = "roll";
            next.dice = [0, 0];
            next.extraTurn = false;
            next.doublesInRow = 0;
            next.turnNumber += 1;
            addLog(next, `${next.players[next.currentPlayer]?.name || "Next player"}'s turn begins.`);
          }
          commitState(next, "build");
        } else {
          endTurn(true);
        }
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [buyPendingProperty, commitState, endTurn, mode, rollCurrentPlayer, rolling, runAuction, state]);

  const ownedByActor = useMemo(() => actorId ? ownedTileIds(state, actorId) : [], [actorId, state]);

  return (
    <div>
      <ScoreHeader best={best} state={state} mode={mode} />
      <div className={styles.gameShell}>
        <div className={`${styles.gameHeader} flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5`}>
          <div className="flex items-center gap-3">
            <span className={styles.brandBadge}><FaBuilding /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">ComePlayers Marble Online</p>
              <p className="text-base font-black text-white">Marble Online</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { audio.unlock(); audio.setEnabled(!audio.enabled); }} className={`flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-black transition ${audio.enabled ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-500"}`} title="Toggle game sound effects">{audio.enabled ? <FaVolumeHigh /> : <FaVolumeXmark />} FX</button>
            <button type="button" onClick={() => { audio.unlock(); audio.setMusicEnabled(!audio.musicEnabled); }} disabled={!audio.enabled} className={`flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-black transition ${audio.musicEnabled ? "border-purple-300/35 bg-purple-300/10 text-purple-100" : "border-white/10 bg-white/5 text-slate-500"}`} title="Toggle original synthesized background music"><FaMusic /> Music</button>
            <label className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase text-slate-500 sm:flex">Volume<input aria-label="Game volume" type="range" min="0.05" max="0.8" step="0.05" value={audio.volume} onChange={(event) => audio.setVolume(Number(event.target.value))} className="w-20 accent-cyan-300" /></label>
            {mode ? <ActionButton onClick={exitGame} tone="slate"><FaDoorOpen /> Change mode</ActionButton> : null}
          </div>
        </div>

        {mode === null ? (
          <div className="p-4 sm:p-6">
            <div className={`${styles.heroIntro} mx-auto max-w-5xl`}>
              <div className={styles.heroAlexia} aria-hidden="true" />
              <div className={styles.heroContent}>
                <span className="inline-flex items-center gap-2 rounded-full border border-yellow-100/70 bg-yellow-300 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#684800] shadow-[0_4px_0_#9a6800]"><FaCrown /> ComePlayers World Tour</span>
                <h2 className={`${styles.heroTitle} mt-5`}>Build your <span>dream city</span></h2>
                <p className={styles.heroCopy}>A colorful 2.5D property adventure with forty destinations, animated dice, landmarks, houses, hotels, auctions, trading, public rooms, ready checks, host controls, reconnect recovery, global matchmaking, NPC strategy, autosave, and original game audio.</p>
              </div>
            </div>

            <div className="mx-auto mt-7 grid max-w-4xl gap-3 sm:grid-cols-3">
              <ModeCard icon={<FaComputer />} title="Offline vs Alexia NPC" subtitle="Play against one to three Alexia strategy personalities. Progress saves automatically on this device." onClick={startOfflineGame} />
              <ModeCard icon={<FaGlobe />} title="Create Public Room" subtitle="Name a room for two to four signed-in ComePlayers users and start when everyone is ready." onClick={createPublicRoom} disabled={onlineBusy || !authChecked} />
              <ModeCard icon={<FaMagnifyingGlass />} title="Global Matchmaking" subtitle="Instant two-player Blitz Economy matchmaking across every ComePlayers Chat & Messages user." onClick={startMatchmaking} disabled={onlineBusy || !authChecked} />
            </div>

            {reconnectRoom ? (
              <div className="mx-auto mt-4 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-300/30 bg-cyan-300/[0.07] p-4 text-left">
                <div><p className="flex items-center gap-2 text-sm font-black text-cyan-100"><FaWifi className="animate-pulse" /> Online room found</p><p className="mt-1 text-xs text-slate-400">{reconnectRoom.room_name} • {reconnectRoom.status === "active" ? `Turn ${reconnectRoom.game_state.turnNumber}` : `${reconnectRoom.player_ids.length}/${reconnectRoom.max_players} players in lobby`}</p></div>
                <ActionButton onClick={resumeOnlineRoom} tone="cyan"><FaPlay /> Reconnect</ActionButton>
              </div>
            ) : null}

            {savedOffline && savedOffline.status === "playing" && savedOffline.players.length >= 2 ? (
              <div className="mx-auto mt-4 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.06] p-4 text-left">
                <div><p className="text-sm font-black text-emerald-100">Offline autosave found</p><p className="mt-1 text-xs text-slate-400">Turn {savedOffline.turnNumber} • {savedOffline.players.length} players • {savedOffline.lastEvent}</p></div>
                <ActionButton onClick={resumeOfflineGame} tone="green"><FaPlay /> Resume Match</ActionButton>
              </div>
            ) : null}

            <div className="mx-auto mt-5 grid max-w-4xl gap-3 rounded-3xl border border-white/10 bg-black/20 p-4 lg:grid-cols-[1.2fr_.8fr]">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Public room name</label>
                <input value={roomName} maxLength={48} onChange={(event) => setRoomName(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#020811] px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-cyan-300/50" placeholder="ComePlayers Marble Arena" />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><span className="block text-[9px] font-black uppercase text-slate-500">NPC rivals</span><select value={npcCount} onChange={(event) => setNpcCount(Math.max(1, Math.min(3, Number(event.target.value))))} className="mt-1 w-full bg-transparent text-sm font-black text-white outline-none"><option className="bg-[#061421]" value={1}>1 NPC</option><option className="bg-[#061421]" value={2}>2 NPCs</option><option className="bg-[#061421]" value={3}>3 NPCs</option></select></label>
                  <label className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><span className="block text-[9px] font-black uppercase text-slate-500">Online seats</span><select value={maxPlayers} onChange={(event) => setMaxPlayers(Math.max(2, Math.min(4, Number(event.target.value))))} className="mt-1 w-full bg-transparent text-sm font-black text-white outline-none"><option className="bg-[#061421]" value={2}>2 players</option><option className="bg-[#061421]" value={3}>3 players</option><option className="bg-[#061421]" value={4}>4 players</option></select></label>
                  <label className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><span className="block text-[9px] font-black uppercase text-slate-500">Starting cash</span><select value={startingCash} onChange={(event) => setStartingCash(Number(event.target.value))} className="mt-1 w-full bg-transparent text-sm font-black text-white outline-none"><option className="bg-[#061421]" value={1200}>CP 1,200</option><option className="bg-[#061421]" value={1500}>CP 1,500</option><option className="bg-[#061421]" value={2000}>CP 2,000</option></select></label>
                  <div className="space-y-2"><button type="button" onClick={() => setFreeParkingJackpot((value) => !value)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-[9px] font-black uppercase ${freeParkingJackpot ? "border-yellow-300/30 bg-yellow-300/10 text-yellow-100" : "border-white/10 bg-white/[0.035] text-slate-500"}`}>Jackpot <span>{freeParkingJackpot ? "ON" : "OFF"}</span></button><button type="button" onClick={() => setFastMode((value) => !value)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-[9px] font-black uppercase ${fastMode ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.035] text-slate-500"}`}>Blitz <span>{fastMode ? "ON" : "OFF"}</span></button></div>
                </div>
                <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-yellow-300/20 bg-yellow-300/[0.045] p-3 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1 text-[9px] font-black uppercase tracking-wider text-yellow-100/70">Join with invite code<input value={joinCode} maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} onKeyDown={(event) => { if (event.key === "Enter") void joinRoomByCode(); }} className="mt-2 w-full rounded-xl border border-yellow-300/20 bg-[#020811] px-4 py-3 text-sm font-black uppercase tracking-[0.28em] text-yellow-100 outline-none focus:border-yellow-300/55" placeholder="ABC123" /></label>
                  <ActionButton onClick={() => void joinRoomByCode()} disabled={onlineBusy || joinCode.length !== 6} tone="gold"><FaArrowRight /> Join Code</ActionButton>
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
                <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider text-cyan-300">Open Public Rooms</p><p className="mt-1 text-xs text-slate-500">Join without entering a room code.</p></div><button type="button" onClick={() => void loadPublicRooms()} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:text-white"><FaRotateRight className={roomsLoading ? "animate-spin" : ""} /></button></div>
                <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {publicRooms.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-600">{roomsLoading ? "Scanning the global lobby…" : "No public Marble Online rooms are open yet."}</div> : publicRooms.map((entry) => <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-300/10 text-yellow-200"><FaBuilding /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-white">{entry.room_name}</p><p className="text-[9px] font-bold uppercase text-slate-600">{entry.player_ids.length}/{entry.max_players} players • {entry.ready_player_ids.length} ready • {formatRoomAge(entry.updated_at)}</p></div><ActionButton onClick={() => void joinPublicRoom(entry.id)} disabled={onlineBusy || entry.player_ids.length >= entry.max_players} tone="cyan" className="min-h-9 px-3 text-xs">Join</ActionButton></div>)}
                </div>
              </div>
            </div>
            {onlineError ? <p className="mx-auto mt-4 max-w-4xl rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm font-bold text-red-200">{onlineError}</p> : null}
          </div>
        ) : mode === "online" && room?.status === "waiting" ? (
          <div className="p-4 sm:p-6">
            <div className="mx-auto max-w-4xl rounded-3xl border border-cyan-300/25 bg-black/20 p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Online Lobby V48</p><h2 className="mt-2 text-3xl font-black text-white">{room.room_name}</h2><p className="mt-2 text-sm text-slate-400">Every player must confirm Ready. The host controls match rules and can remove disruptive players before launch.</p></div><span className="inline-flex items-center gap-2 rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-xs font-black text-yellow-100"><FaWifi className="animate-pulse" /> {readyCount}/{room.player_ids.length} ready</span></div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-yellow-300/25 bg-yellow-300/[0.07] p-4">
                <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-yellow-200/70">Invite code</p><p className="mt-1 text-2xl font-black tracking-[0.28em] text-yellow-100">{room.room_code || "------"}</p></div>
                <ActionButton onClick={() => void copyInviteCode()} disabled={!room.room_code} tone="gold"><FaCopy /> Copy Invite</ActionButton>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
                <div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: room.max_players }, (_, index) => {
                      const player = state.players[index];
                      const playerReady = Boolean(player && room.ready_player_ids.includes(player.id));
                      const isHostPlayer = Boolean(player && player.id === room.host_player_id);
                      return <div key={index} className={`flex items-center gap-3 rounded-2xl border p-4 ${player ? playerReady ? "border-emerald-300/35 bg-emerald-300/[0.07]" : "border-cyan-300/25 bg-cyan-300/[0.045]" : "border-dashed border-white/10 bg-white/[0.02]"}`}><span className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg ${player ? "" : "bg-white/5 text-slate-700"}`} style={player ? { background: player.color, color: "#020617" } : undefined}>{player ? tokenGlyph(player.token) : <FaPlus />}</span><div className="min-w-0 flex-1"><p className={`truncate text-sm font-black ${player ? "text-white" : "text-slate-600"}`}>{player?.name || "Open seat"}</p><p className={`mt-1 text-[9px] font-black uppercase tracking-wider ${playerReady ? "text-emerald-300" : "text-slate-600"}`}>{isHostPlayer ? `Host • ${playerReady ? "Ready" : "Not ready"}` : playerReady ? "Ready" : player ? "Not ready" : "Waiting"}</p></div>{player && room.host_player_id === userId && !isHostPlayer ? <button type="button" onClick={() => void kickOnlinePlayer(player.id)} disabled={onlineBusy} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-300/20 bg-red-300/10 text-red-200 transition hover:bg-red-300/20" title={`Remove ${player.name}`}><FaXmark /></button> : playerReady ? <FaCheck className="text-emerald-300" /> : null}</div>;
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div><p className="text-sm font-black text-white">{room.player_ids.length}/{room.max_players} players joined</p><p className="mt-1 text-xs text-slate-500">All joined players must be ready before the host can start.</p></div><ActionButton onClick={() => void toggleOnlineReady()} disabled={onlineBusy} tone={isReady ? "slate" : "green"}>{isReady ? <FaXmark /> : <FaCheck />} {isReady ? "Cancel Ready" : "I Am Ready"}</ActionButton></div>
                </div>

                <div className="rounded-2xl border border-purple-300/20 bg-purple-300/[0.035] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-300">Match Rules</p>
                  {room.host_player_id === userId ? <>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="rounded-xl border border-white/10 bg-black/20 p-3"><span className="block text-[9px] font-black uppercase text-slate-500">Seats</span><select value={maxPlayers} onChange={(event) => setMaxPlayers(Math.max(room.player_ids.length, Math.min(4, Number(event.target.value))))} className="mt-1 w-full bg-transparent text-sm font-black text-white outline-none"><option className="bg-[#061421]" value={2}>2 players</option><option className="bg-[#061421]" value={3}>3 players</option><option className="bg-[#061421]" value={4}>4 players</option></select></label>
                      <label className="rounded-xl border border-white/10 bg-black/20 p-3"><span className="block text-[9px] font-black uppercase text-slate-500">Starting cash</span><select value={startingCash} onChange={(event) => setStartingCash(Number(event.target.value))} className="mt-1 w-full bg-transparent text-sm font-black text-white outline-none"><option className="bg-[#061421]" value={1200}>CP 1,200</option><option className="bg-[#061421]" value={1500}>CP 1,500</option><option className="bg-[#061421]" value={2000}>CP 2,000</option></select></label>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setFreeParkingJackpot((value) => !value)} className={`flex items-center justify-between rounded-xl border px-3 py-3 text-[9px] font-black uppercase ${freeParkingJackpot ? "border-yellow-300/30 bg-yellow-300/10 text-yellow-100" : "border-white/10 bg-black/20 text-slate-500"}`}>Jackpot <span>{freeParkingJackpot ? "ON" : "OFF"}</span></button><button type="button" onClick={() => setFastMode((value) => !value)} className={`flex items-center justify-between rounded-xl border px-3 py-3 text-[9px] font-black uppercase ${fastMode ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-black/20 text-slate-500"}`}>Blitz <span>{fastMode ? "ON" : "OFF"}</span></button></div>
                    <ActionButton onClick={() => void updateOnlineLobbySettings()} disabled={onlineBusy || maxPlayers < room.player_ids.length} tone="cyan" className="mt-3 w-full"><FaBuilding /> Save Rules</ActionButton>
                    <p className="mt-2 text-[9px] leading-4 text-slate-600">Saving rules resets every Ready confirmation so nobody starts under unexpected settings.</p>
                  </> : <div className="mt-3 space-y-2 text-xs"><p className="flex justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-400"><span>Mode</span><strong className="text-white">{room.game_state.settings.fastMode ? "Blitz" : "Classic"}</strong></p><p className="flex justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-400"><span>Starting cash</span><strong className="text-white">{money(room.game_state.settings.startingCash)}</strong></p><p className="flex justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-400"><span>Parking jackpot</span><strong className="text-white">{room.game_state.settings.freeParkingJackpot ? "Enabled" : "Disabled"}</strong></p></div>}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-yellow-300/20 bg-yellow-300/[0.045] p-4"><div><p className="text-sm font-black text-white">Launch status</p><p className="mt-1 text-xs text-slate-500">{allPlayersReady ? "Every player is ready. The match can begin." : `Waiting for ${Math.max(0, room.player_ids.length - readyCount)} player(s) to confirm.`}</p></div>{room.host_player_id === userId ? <ActionButton onClick={() => void startOnlineRoom()} disabled={onlineBusy || room.player_ids.length < 2 || !allPlayersReady} tone="gold"><FaPlay /> Start Economy</ActionButton> : <span className="text-xs font-bold text-cyan-200">{isReady ? "Ready confirmed. Waiting for host…" : "Confirm Ready when prepared."}</span>}</div>
              {onlineError ? <p className="mt-4 rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm font-bold text-red-200">{onlineError}</p> : null}
            </div>
          </div>
        ) : (
          <div className={`${styles.matchStage} p-3 sm:p-4 lg:p-5`}>
            {incomingTrade ? <button type="button" onClick={() => setShowTrade(true)} className="mb-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-purple-300/35 bg-purple-300/10 px-4 py-3 text-left text-purple-100"><span className="flex items-center gap-3"><FaHandshake className="text-xl" /><span><span className="block text-sm font-black">Incoming trade proposal</span><span className="block text-xs text-purple-200/70">Review the cash and properties before accepting.</span></span></span><FaArrowRight /></button> : null}
            <div className={styles.gameplayGrid}>
              <GameBoard state={state} selectedTile={selectedTile} onSelectTile={setSelectedTile} rolling={rolling} />
              <div className={`${styles.controlRail} space-y-3`}>
                <PlayerPanel state={state} userId={actorId} />
                <div className={`${styles.commandCard} p-4`}>
                  <div className="flex items-center justify-between gap-2"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Command Center</p><p className="mt-1 text-sm font-black text-white">{canControl ? "Your decision" : current?.npc ? `${current.name} is thinking…` : `Waiting for ${current?.name || "player"}`}</p></div>{onlineBusy ? <FaWifi className="animate-pulse text-cyan-300" /> : null}</div>
                  <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-slate-400">{state.lastEvent}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {state.phase === "roll" ? <ActionButton onClick={() => rollCurrentPlayer(false)} disabled={!canControl || rolling || onlineBusy} tone="gold" className="col-span-2"><FaDice /> {rolling ? "Rolling…" : "Roll Dice"}</ActionButton> : null}
                    {state.phase === "roll" && current?.jailed ? <><ActionButton onClick={payToLeaveJail} disabled={!canControl || current.cash < 50} tone="red">Pay {money(50)}</ActionButton><ActionButton onClick={useGetOutCard} disabled={!canControl || current.getOutCards <= 0} tone="cyan">Use Card ({current.getOutCards})</ActionButton></> : null}
                    {state.phase === "buy" && state.pendingTile !== null ? <><ActionButton onClick={() => buyPendingProperty(false)} disabled={!canControl || current.cash < (TILES[state.pendingTile].price || 0) || onlineBusy} tone="green"><FaCartShopping /> Buy {money(TILES[state.pendingTile].price || 0)}</ActionButton><ActionButton onClick={() => runAuction(auctionBid)} disabled={!canControl || onlineBusy} tone="gold"><FaGavel /> Auction</ActionButton><label className="col-span-2 rounded-xl border border-white/10 bg-black/20 p-2 text-[9px] font-black uppercase text-slate-500">Your max auction bid<input type="number" min={0} max={Math.max(0, current.cash)} value={auctionBid} onChange={(event) => setAuctionBid(Math.max(0, Number(event.target.value) || 0))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#020811] px-3 py-2 text-sm font-black text-white outline-none" /></label></> : null}
                    {state.phase === "debt" ? <><div className="col-span-2 rounded-xl border border-red-300/25 bg-red-300/10 p-3 text-xs font-bold text-red-100">Debt crisis: raise {money(Math.abs(current?.cash || 0))} by selling buildings or mortgaging properties.</div><ActionButton onClick={raiseFundsAutomatically} disabled={!canControl} tone="gold"><FaPiggyBank /> Auto Raise Funds</ActionButton><ActionButton onClick={bankruptCurrentPlayer} disabled={!canControl} tone="red"><FaXmark /> Bankruptcy</ActionButton></> : null}
                    {state.phase === "action" ? <ActionButton onClick={() => endTurn(false)} disabled={!canControl || onlineBusy} tone="cyan" className="col-span-2"><FaArrowRight /> {state.extraTurn ? "Claim Extra Roll" : "End Turn"}</ActionButton> : null}
                    {state.status === "finished" ? <div className="col-span-2 rounded-2xl border border-yellow-300/30 bg-yellow-300/10 p-4 text-center"><FaCrown className="mx-auto text-3xl text-yellow-200" /><p className="mt-2 text-xl font-black text-white">{state.players.find((player) => player.id === state.winnerId)?.name || "Winner"}</p><p className="mt-1 text-xs text-yellow-100">ComePlayers Economy Champion</p></div> : null}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <ActionButton onClick={() => setShowManage((value) => !value)} disabled={!actorId || ownedByActor.length === 0} tone="slate" className="min-h-9 px-2 text-[10px]"><FaBuilding /> Assets</ActionButton>
                    <ActionButton onClick={() => setShowTrade(true)} disabled={!actorId || state.status !== "playing" || state.players.filter((player) => !player.bankrupt).length < 2} tone="slate" className="min-h-9 px-2 text-[10px]"><FaHandshake /> Trade</ActionButton>
                    <ActionButton onClick={() => setShowLog((value) => !value)} tone="slate" className="min-h-9 px-2 text-[10px]"><FaMagnifyingGlass /> Log</ActionButton>
                  </div>
                </div>

                {showManage ? <div className="max-h-80 overflow-y-auto rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.035] p-3"><div className="mb-2 flex items-center justify-between"><p className="text-[9px] font-black uppercase tracking-wider text-emerald-300">Your Property Portfolio</p><span className="text-[9px] font-bold text-slate-500">Tap to inspect</span></div><div className="space-y-1.5">{ownedByActor.map((id) => { const tile = TILES[id]; const ownership = state.properties[String(id)]; return <button key={id} type="button" onClick={() => setSelectedTile(id)} className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-2 text-left hover:border-cyan-300/35"><span className="h-8 w-2 rounded-full" style={{ background: tile.groupColor || "#22d3ee" }} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-white">{tile.name}</span><span className="block text-[8px] font-bold uppercase text-slate-600">{ownership.mortgaged ? "Mortgaged" : ownership.houses >= 5 ? "Hotel" : `${ownership.houses} houses`}</span></span><span className="text-[9px] font-black text-yellow-200">{money(tile.price || 0)}</span></button>; })}</div></div> : null}

                {showLog ? <div className="max-h-72 overflow-y-auto rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.035] p-3"><p className="mb-2 text-[9px] font-black uppercase tracking-wider text-cyan-300">Live Match Timeline</p><div className="space-y-2">{state.log.map((entry, index) => <div key={`${entry}-${index}`} className="flex gap-2 text-[10px] leading-4 text-slate-400"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/70" /><span>{entry}</span></div>)}</div></div> : null}

                <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="grid grid-cols-2 gap-2 text-center"><div className="rounded-xl bg-white/[0.035] p-2"><p className="text-[8px] font-black uppercase text-slate-600">Turn</p><p className="mt-1 text-sm font-black text-white">{state.turnNumber}</p></div><div className="rounded-xl bg-white/[0.035] p-2"><p className="text-[8px] font-black uppercase text-slate-600">Jackpot</p><p className="mt-1 text-sm font-black text-yellow-200">{money(state.freeParkingPot)}</p></div></div><p className="mt-2 text-[9px] leading-4 text-slate-600">Rules include doubles, three-doubles detention, rent groups, transit scaling, utility dice rent, even building, hotels, mortgage interest, auctions, bankruptcy transfers, public-room synchronization, and 80-turn Blitz tie-breaking.</p></div>
              </div>
            </div>
            {onlineError ? <p className="mt-4 rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm font-bold text-red-200">{onlineError}</p> : null}
          </div>
        )}
      </div>

      {selectedTile !== null ? <PropertyInspector state={state} tileId={selectedTile} currentPlayerId={actorId} onClose={() => setSelectedTile(null)} onBuild={manageBuild} onSell={manageSell} onMortgage={manageMortgage} onUnmortgage={manageUnmortgage} /> : null}
      {showTrade && actorId ? <TradeDialog state={state} actorId={actorId} onClose={() => setShowTrade(false)} onSubmit={submitTradeOffer} onAccept={acceptTrade} onDecline={declineTrade} /> : null}
    </div>
  );
}
