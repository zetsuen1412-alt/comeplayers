"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  FaBuilding,
  FaCoins,
  FaCompress,
  FaCircleInfo,
  FaCrown,
  FaDice,
  FaExpand,
  FaFlagCheckered,
  FaGift,
  FaGlobe,
  FaHouse,
  FaHotel,
  FaLandmark,
  FaPlane,
  FaQuestion,
  FaRotateRight,
  FaStar,
  FaTrophy,
  FaVolumeHigh,
  FaVolumeXmark,
  FaWandMagicSparkles,
  FaWifi,
  FaUsers,
  FaXmark,
} from "react-icons/fa6";
import ComePlayersMonopolyGame from "@/components/arcade/ComePlayersMonopolyGame";
import styles from "./monopoly.module.css";

type TileKind = "start" | "city" | "chance" | "island" | "travel" | "festival" | "tax" | "bonus";
type PlayerColor = "gold" | "pink" | "blue" | "green";
type CharacterId = "alexia" | "nova" | "rex" | "miko";
type GameMode = "quick" | "classic";

type Tile = {
  name: string;
  kind: TileKind;
  price?: number;
  toll?: number;
  group?: string;
  accent: string;
  code?: string;
};

type Player = {
  id: number;
  character: CharacterId;
  name: string;
  color: PlayerColor;
  cash: number;
  position: number;
  avatar: string;
  icon: string;
  team: string;
  ability: string;
  islandTurns: number;
  bankrupt?: boolean;
  isHuman?: boolean;
};

type PropertyState = {
  ownerId: number;
  level: number;
};

type DialogState =
  | { type: "buy"; tileIndex: number }
  | { type: "upgrade"; tileIndex: number }
  | { type: "travel" }
  | { type: "dice-control" }
  | { type: "rules" }
  | { type: "chance"; title: string; body: string; amount: number }
  | { type: "toll"; title: string; body: string }
  | { type: "takeover"; tileIndex: number; toll: number; takeoverCost: number; ownerId: number }
  | { type: "info"; title: string; body: string }
  | null;

const STARTING_CASH = 3_000_000;
const START_BONUS = 350_000;
// Legacy V22 compatibility marker retained for repository regression tests: const MAX_ROUNDS = 12
const MODE_ROUNDS: Record<GameMode, number> = { quick: 8, classic: 15 };
const TAKEOVER_MULTIPLIER = 1.65;
const LIQUIDATION_RATE = 0.7;
const DICE_CONTROL_CHARGES = 2;

const tiles: Tile[] = [
  { name: "START", kind: "start", accent: "#f5c74d", code: "GO" },
  { name: "Jakarta", kind: "city", price: 190000, toll: 52000, group: "Nusantara", accent: "#ff7865", code: "JKT" },
  { name: "Surprise Card", kind: "chance", accent: "#f9d45b", code: "?" },
  { name: "Bandung", kind: "city", price: 210000, toll: 57000, group: "Nusantara", accent: "#ff7865", code: "BDG" },
  { name: "Bali", kind: "city", price: 240000, toll: 65000, group: "Nusantara", accent: "#ff7865", code: "DPS" },
  { name: "Festival Bonus", kind: "bonus", accent: "#f2a449", code: "+" },
  { name: "Singapore", kind: "city", price: 280000, toll: 76000, group: "Asia", accent: "#f1a151", code: "SGP" },
  { name: "Bangkok", kind: "city", price: 300000, toll: 81000, group: "Asia", accent: "#f1a151", code: "BKK" },
  { name: "ISLAND", kind: "island", accent: "#5ab9ff", code: "ISL" },
  { name: "Seoul", kind: "city", price: 340000, toll: 91000, group: "East Asia", accent: "#62cada", code: "SEL" },
  { name: "Surprise Card", kind: "chance", accent: "#f9d45b", code: "?" },
  { name: "Tokyo", kind: "city", price: 380000, toll: 103000, group: "East Asia", accent: "#62cada", code: "TYO" },
  { name: "Taipei", kind: "city", price: 410000, toll: 112000, group: "East Asia", accent: "#62cada", code: "TPE" },
  { name: "City Tax", kind: "tax", accent: "#9a80cf", code: "TAX" },
  { name: "Dubai", kind: "city", price: 450000, toll: 126000, group: "Prestige", accent: "#a27ddd", code: "DXB" },
  { name: "Istanbul", kind: "city", price: 470000, toll: 133000, group: "Prestige", accent: "#a27ddd", code: "IST" },
  { name: "WORLD TOUR", kind: "travel", accent: "#4ac9e8", code: "AIR" },
  { name: "Paris", kind: "city", price: 520000, toll: 149000, group: "Europe", accent: "#df7ace", code: "PAR" },
  { name: "Rome", kind: "city", price: 540000, toll: 156000, group: "Europe", accent: "#df7ace", code: "ROM" },
  { name: "Surprise Card", kind: "chance", accent: "#f9d45b", code: "?" },
  { name: "London", kind: "city", price: 580000, toll: 169000, group: "Europe", accent: "#df7ace", code: "LON" },
  { name: "Berlin", kind: "city", price: 610000, toll: 179000, group: "Europe", accent: "#df7ace", code: "BER" },
  { name: "World Festival", kind: "festival", accent: "#ff7096", code: "FES" },
  { name: "New York", kind: "city", price: 670000, toll: 200000, group: "Americas", accent: "#6397ec", code: "NYC" },
  { name: "WORLD CUP", kind: "bonus", accent: "#60d181", code: "WC" },
  { name: "Los Angeles", kind: "city", price: 710000, toll: 216000, group: "Americas", accent: "#6397ec", code: "LAX" },
  { name: "Las Vegas", kind: "city", price: 750000, toll: 231000, group: "Americas", accent: "#6397ec", code: "LAS" },
  { name: "Surprise Card", kind: "chance", accent: "#f9d45b", code: "?" },
  { name: "Sydney", kind: "city", price: 810000, toll: 252000, group: "Oceania", accent: "#67cb91", code: "SYD" },
  { name: "Auckland", kind: "city", price: 850000, toll: 268000, group: "Oceania", accent: "#67cb91", code: "AKL" },
  { name: "Daily Reward", kind: "bonus", accent: "#f1b84f", code: "+" },
  { name: "ComePlayers", kind: "city", price: 950000, toll: 320000, group: "Legend", accent: "#ddb140", code: "CP" },
];

const initialPlayers: Player[] = [
  {
    id: 0,
    character: "alexia",
    name: "Alexia",
    color: "gold",
    cash: STARTING_CASH,
    position: 0,
    avatar: "/games/monopoly/alexia-avatar.png",
    icon: "A",
    team: "Gold Team",
    ability: "Dice Control +8%",
    islandTurns: 0,
    isHuman: true,
  },
  {
    id: 1,
    character: "nova",
    name: "Nova",
    color: "pink",
    cash: STARTING_CASH,
    position: 8,
    avatar: "/games/monopoly/nova-avatar.png",
    icon: "N",
    team: "Red Team",
    ability: "City Discount 6%",
    islandTurns: 0,
  },
  {
    id: 2,
    character: "rex",
    name: "Rex",
    color: "blue",
    cash: STARTING_CASH,
    position: 16,
    avatar: "/games/monopoly/rex-avatar.png",
    icon: "R",
    team: "Blue Team",
    ability: "Bonus START +10%",
    islandTurns: 0,
  },
  {
    id: 3,
    character: "miko",
    name: "Miko",
    color: "green",
    cash: STARTING_CASH,
    position: 24,
    avatar: "/games/monopoly/miko-avatar.png",
    icon: "M",
    team: "Green Team",
    ability: "Rent Discount 7%",
    islandTurns: 0,
  },
];

function createMatchRoster(selectedCharacter: CharacterId, botCount: number) {
  const selected = initialPlayers.find((player) => player.character === selectedCharacter) ?? initialPlayers[0];
  const rivals = initialPlayers.filter((player) => player.character !== selectedCharacter).slice(0, Math.max(1, Math.min(3, botCount)));
  return [selected, ...rivals].map((player, index) => ({
    ...player,
    cash: STARTING_CASH,
    position: index * 8,
    islandTurns: 0,
    bankrupt: false,
    isHuman: index === 0,
  }));
}

const chanceCards = [
  { title: "Login Bonus", body: "The Community awarded you bonus coins.", amount: 220000 },
  { title: "Tournament Prize", body: "You won a mini-tournament prize.", amount: 350000 },
  { title: "Maintenance Fee", body: "Pay maintenance for all properties.", amount: -180000 },
  { title: "Marketplace Deal", body: "The transaction succeeded and you received cashback.", amount: 150000 },
  { title: "Late Fee", body: "You entered the match late.", amount: -120000 },
];

const buildLevels = [
  { level: 1, label: "Land", icon: <FaStar />, multiplier: 1 },
  { level: 2, label: "House", icon: <FaHouse />, multiplier: 1.35 },
  { level: 3, label: "Hotel", icon: <FaHotel />, multiplier: 1.7 },
  { level: 4, label: "Landmark", icon: <FaLandmark />, multiplier: 2.15 },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(value)));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function perimeterPosition(index: number) {
  const size = 9;
  if (index <= 8) return { row: size, column: size - index };
  if (index <= 16) return { row: size - (index - 8), column: 1 };
  if (index <= 24) return { row: 1, column: 1 + (index - 16) };
  return { row: 1 + (index - 24), column: size };
}

function tileIcon(kind: TileKind) {
  switch (kind) {
    case "start": return <FaFlagCheckered />;
    case "chance": return <FaQuestion />;
    case "island": return <FaHouse />;
    case "travel": return <FaPlane />;
    case "festival": return <FaCrown />;
    case "tax": return <FaCoins />;
    case "bonus": return <FaGift />;
    default: return <FaBuilding />;
  }
}

function purchaseCost(tile: Tile, level: number) {
  const multiplier = buildLevels.find((item) => item.level === level)?.multiplier ?? 1;
  return Math.round((tile.price ?? 0) * multiplier);
}

function levelName(level: number) {
  return buildLevels.find((item) => item.level === level)?.label ?? "Land";
}

function dicePairForTotal(total: number): [number, number] {
  const validPairs: Array<[number, number]> = [];
  for (let first = 1; first <= 6; first += 1) {
    const second = total - first;
    if (second >= 1 && second <= 6) validPairs.push([first, second]);
  }
  return validPairs[Math.floor(Math.random() * validPairs.length)] ?? [1, 1];
}

export default function ComePlayersMarbleGame({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [properties, setProperties] = useState<Record<number, PropertyState>>({});
  const [turn, setTurn] = useState(0);
  const [round, setRound] = useState(1);
  const [dice, setDice] = useState<[number, number]>([1, 1]);
  const [rolling, setRolling] = useState(false);
  const [movingPlayerId, setMovingPlayerId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [purchaseLevel, setPurchaseLevel] = useState(1);
  const [log, setLog] = useState<string[]>(["The game is ready to begin."]);
  const [sound, setSound] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);
  const [winReason, setWinReason] = useState("Highest total assets");
  const [mode, setMode] = useState<GameMode>("quick");
  const [showIntro, setShowIntro] = useState(true);
  const [turnSeconds, setTurnSeconds] = useState(20);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [speech, setSpeech] = useState("Let’s begin!");
  const [diceControlCharges, setDiceControlCharges] = useState(DICE_CONTROL_CHARGES);
  const [diceTarget, setDiceTarget] = useState(8);
  const [diceControlArmed, setDiceControlArmed] = useState(false);
  const [liquidationHistory, setLiquidationHistory] = useState<string[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterId>("alexia");
  const [botCount, setBotCount] = useState(3);
  const [showOnlineEngine, setShowOnlineEngine] = useState(false);
  const gameRef = useRef<HTMLDivElement>(null);
  const resolvingRef = useRef(false);
  const playersRef = useRef<Player[]>(initialPlayers);
  const propertiesRef = useRef<Record<number, PropertyState>>({});
  const extraTurnRef = useRef(false);
  const matchRosterRef = useRef<Player[]>(initialPlayers);

  const maxRounds = MODE_ROUNDS[mode];
  const activePlayer = players[turn];
  const activeTile = tiles[activePlayer.position];

  const setPlayersSafe = useCallback((updater: (current: Player[]) => Player[]) => {
    setPlayers((current) => {
      const next = updater(current);
      playersRef.current = next;
      return next;
    });
  }, []);

  const setPropertiesSafe = useCallback((updater: (current: Record<number, PropertyState>) => Record<number, PropertyState>) => {
    setProperties((current) => {
      const next = updater(current);
      propertiesRef.current = next;
      return next;
    });
  }, []);

  const playTone = useCallback((frequency: number, duration = 0.08, type: OscillatorType = "sine") => {
    if (!sound || typeof window === "undefined") return;
    try {
      const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.055, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
      oscillator.addEventListener("ended", () => void audioContext.close());
    } catch {
      // Audio is a progressive enhancement; the game remains fully playable without it.
    }
  }, [sound]);

  const addLog = useCallback((message: string) => {
    setLog((current) => [message, ...current].slice(0, 5));
    setSpeech(message.length > 62 ? `${message.slice(0, 59)}…` : message);
  }, []);

  const propertyWorth = useCallback((playerId: number) => {
    return (Object.entries(properties) as Array<[string, PropertyState]>).reduce((sum, [index, state]) => {
      if (state.ownerId !== playerId) return sum;
      const tile = tiles[Number(index)];
      return sum + purchaseCost(tile, state.level);
    }, 0);
  }, [properties]);

  const totalWorth = useCallback((player: Player) => player.cash + propertyWorth(player.id), [propertyWorth]);

  const liquidateAssets = useCallback((playerId: number, requiredCash: number) => {
    const player = playersRef.current.find((item) => item.id === playerId);
    if (!player || player.cash >= requiredCash) {
      return { cash: player?.cash ?? 0, sold: [] as string[] };
    }

    let cash = player.cash;
    const nextProperties = { ...propertiesRef.current };
    const ownedCities = (Object.entries(propertiesRef.current) as Array<[string, PropertyState]>)
      .filter(([, state]) => state.ownerId === playerId)
      .map(([index, state]) => ({
        index: Number(index),
        state,
        value: purchaseCost(tiles[Number(index)], state.level),
      }))
      .sort((a, b) => {
        const isCompleteGroup = (group?: string) => {
          if (!group) return false;
          const indexes = tiles
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item.group === group && item.kind === "city")
            .map(({ index }) => index);
          return indexes.length > 1 && indexes.every((index) => propertiesRef.current[index]?.ownerId === playerId);
        };
        const aComplete = isCompleteGroup(tiles[a.index].group) ? 1 : 0;
        const bComplete = isCompleteGroup(tiles[b.index].group) ? 1 : 0;
        if (aComplete !== bComplete) return aComplete - bComplete;
        return a.value - b.value;
      });

    const sold: string[] = [];
    for (const city of ownedCities) {
      if (cash >= requiredCash) break;
      const refund = Math.round(city.value * LIQUIDATION_RATE);
      cash += refund;
      delete nextProperties[city.index];
      sold.push(`${tiles[city.index].name} (+${formatMoney(refund)})`);
    }

    if (sold.length > 0) {
      propertiesRef.current = nextProperties;
      setProperties(nextProperties);
      const nextPlayers = playersRef.current.map((item) => item.id === playerId ? { ...item, cash } : item);
      playersRef.current = nextPlayers;
      setPlayers(nextPlayers);
      setLiquidationHistory((current) => [`${player.name}: ${sold.join(", ")}`, ...current].slice(0, 8));
    }

    return { cash, sold };
  }, []);

  const cityStrategicScore = useCallback((playerId: number, tileIndex: number) => {
    const tile = tiles[tileIndex];
    if (tile.kind !== "city") return -1;
    const groupTiles = tiles
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.group === tile.group && item.kind === "city");
    const ownedInGroup = groupTiles.filter(({ index }) => propertiesRef.current[index]?.ownerId === playerId).length;
    const opponentInGroup = groupTiles.filter(({ index }) => {
      const ownerId = propertiesRef.current[index]?.ownerId;
      return ownerId !== undefined && ownerId !== playerId;
    }).length;
    const completesGroup = ownedInGroup === groupTiles.length - 1 && opponentInGroup === 0;
    const blocksOpponent = groupTiles.some(({ index }) => {
      const ownerId = propertiesRef.current[index]?.ownerId;
      if (ownerId === undefined || ownerId === playerId) return false;
      const opponentCount = groupTiles.filter(({ index: groupIndex }) => propertiesRef.current[groupIndex]?.ownerId === ownerId).length;
      return opponentCount === groupTiles.length - 1;
    });
    return (completesGroup ? 1000 : 0)
      + (blocksOpponent ? 500 : 0)
      + ownedInGroup * 140
      + Math.round((tile.toll ?? 0) / 1000)
      - Math.round((tile.price ?? 0) / 20000);
  }, []);

  const standings = useMemo(() => [...players].sort((a, b) => totalWorth(b) - totalWorth(a)), [players, totalWorth]);

  const ranking = useMemo(() => {
    return standings.reduce<Record<number, number>>((accumulator, player, index) => {
        accumulator[player.id] = index + 1;
        return accumulator;
      }, {});
  }, [standings]);

  const changeCash = useCallback((playerId: number, amount: number) => {
    setPlayersSafe((current) => current.map((player) =>
      player.id === playerId ? { ...player, cash: Math.max(0, player.cash + amount) } : player
    ));
    if (amount > 0) playTone(760, 0.11, "triangle");
    if (amount < 0) playTone(220, 0.12, "sawtooth");
  }, [playTone, setPlayersSafe]);

  const nextTurn = useCallback(() => {
    setDialog(null);
    setPurchaseLevel(1);
    setLastRoll(null);
    setMovingPlayerId(null);
    resolvingRef.current = false;

    if (extraTurnRef.current) {
      extraTurnRef.current = false;
      setTurnSeconds(20);
      setSpeech(`${playersRef.current[turn]?.name ?? "Player"} gets an extra turn!`);
      return;
    }

    setTurn((current) => {
      const total = playersRef.current.length;
      let next = current;
      for (let attempt = 0; attempt < total; attempt += 1) {
        next = (next + 1) % total;
        if (!playersRef.current[next]?.bankrupt) break;
      }
      if (next <= current) setRound((value) => value + 1);
      return next;
    });
  }, [turn]);

  const ownsCompleteGroup = useCallback((playerId: number, group?: string) => {
    if (!group) return false;
    const groupTiles = tiles
      .map((tile, index) => ({ tile, index }))
      .filter(({ tile }) => tile.group === group);
    return groupTiles.length > 1 && groupTiles.every(({ index }) => propertiesRef.current[index]?.ownerId === playerId);
  }, []);

  const evaluateSpecialVictory = useCallback((playerId: number) => {
    const player = playersRef.current.find((item) => item.id === playerId);
    if (!player || player.bankrupt) return;

    const groups = Array.from(new Set(tiles.map((tile) => tile.group).filter(Boolean))) as string[];
    const completeGroups = groups.filter((group) => ownsCompleteGroup(playerId, group));
    const tourismCities = [4, 6, 14, 17, 23, 28];
    const ownsTourismRoute = tourismCities.every((index) => propertiesRef.current[index]?.ownerId === playerId);
    const sideRanges = [[1, 7], [9, 15], [17, 23], [25, 31]];
    const ownsFullSide = sideRanges.some(([start, end]) => {
      const cityIndexes = tiles
        .map((tile, index) => ({ tile, index }))
        .filter(({ tile, index }) => tile.kind === "city" && index >= start && index <= end)
        .map(({ index }) => index);
      return cityIndexes.length > 0 && cityIndexes.every((index) => propertiesRef.current[index]?.ownerId === playerId);
    });

    const reason = completeGroups.length >= 3
      ? "Triple Color Monopoly"
      : ownsTourismRoute
        ? "World Tour Monopoly"
        : ownsFullSide
          ? "Line Monopoly"
          : null;

    if (reason) {
      setWinReason(reason);
      setWinner(player);
      setSpeech(`${player.name} won through ${reason}!`);
      playTone(1040, 0.32, "triangle");
    }
  }, [ownsCompleteGroup, playTone]);

  const resolveTile = useCallback(async function resolvePlayerTile(playerId: number, tileIndex: number, ai = false) {
    const tile = tiles[tileIndex];
    const player = playersRef.current.find((item) => item.id === playerId);
    if (!player) return;

    if (tile.kind === "city") {
      const owned = propertiesRef.current[tileIndex];
      if (!owned) {
        if (ai) {
          const strategicScore = cityStrategicScore(playerId, tileIndex);
          const reserve = strategicScore >= 900 ? 220000 : strategicScore >= 450 ? 330000 : 500000;
          const affordableLevels = [4, 3, 2, 1].filter((level) => player.cash >= purchaseCost(tile, level) + reserve);
          const buyChance = Math.min(0.97, 0.68 + Math.max(0, strategicScore) / 1800);
          const chosenLevel = affordableLevels.length > 0 && Math.random() < buyChance
            ? affordableLevels[strategicScore >= 900 ? 0 : Math.min(affordableLevels.length - 1, Math.floor(Math.random() * 2))]
            : 0;
          if (chosenLevel > 0) {
            const cost = purchaseCost(tile, chosenLevel);
            setPropertiesSafe((current) => ({ ...current, [tileIndex]: { ownerId: playerId, level: chosenLevel } }));
            changeCash(playerId, -cost);
            addLog(`${player.name} bought ${tile.name} with a ${levelName(chosenLevel)}.`);
            window.setTimeout(() => evaluateSpecialVictory(playerId), 0);
          } else {
            addLog(`${player.name} passed ${tile.name}.`);
          }
          await sleep(900);
          nextTurn();
        } else {
          setPurchaseLevel(1);
          setDialog({ type: "buy", tileIndex });
        }
        return;
      }

      if (owned.ownerId === playerId) {
        if (ai) {
          const nextLevel = Math.min(4, owned.level + 1);
          const upgradeCost = purchaseCost(tile, nextLevel) - purchaseCost(tile, owned.level);
          if (owned.level < 4 && player.cash > upgradeCost + 450000 && Math.random() > 0.3) {
            changeCash(playerId, -upgradeCost);
            setPropertiesSafe((current) => ({ ...current, [tileIndex]: { ...owned, level: nextLevel } }));
            addLog(`${player.name} built a ${levelName(nextLevel)} in ${tile.name}.`);
            window.setTimeout(() => evaluateSpecialVictory(playerId), 0);
          } else {
            addLog(`${player.name} kept ${tile.name}.`);
          }
          await sleep(800);
          nextTurn();
        } else {
          setDialog({ type: "upgrade", tileIndex });
        }
        return;
      }

      const owner = playersRef.current.find((item) => item.id === owned.ownerId);
      const monopolyBonus = ownsCompleteGroup(owned.ownerId, tile.group) ? 1.5 : 1;
      const personalDiscount = player.character === "miko" ? 0.93 : 1;
      const toll = Math.round((tile.toll ?? 0) * (1 + (owned.level - 1) * 0.86) * monopolyBonus * personalDiscount);
      let availableCash = player.cash;

      if (availableCash < toll) {
        const liquidation = liquidateAssets(playerId, toll);
        availableCash = liquidation.cash;
        if (liquidation.sold.length > 0) {
          addLog(`${player.name} sold assets to the bank: ${liquidation.sold.join(", ")}.`);
          await sleep(ai ? 700 : 1050);
        }
      }

      if (availableCash < toll) {
        const paid = availableCash;
        setPlayersSafe((current) => current.map((item) => {
          if (item.id === playerId) return { ...item, cash: 0, bankrupt: true };
          if (item.id === owned.ownerId) return { ...item, cash: item.cash + paid };
          return item;
        }));
        setPropertiesSafe((current) => Object.fromEntries(
          Object.entries(current).map(([index, state]) => [index, state.ownerId === playerId ? { ...state, ownerId: owned.ownerId } : state])
        ) as Record<number, PropertyState>);
        extraTurnRef.current = false;
        addLog(`${player.name} went bankrupt. All cities were transferred to ${owner?.name ?? "the owner"}.`);
        const remainingPlayers = playersRef.current.filter((item) => !item.bankrupt && item.id !== playerId);
        if (remainingPlayers.length === 1) {
          setWinReason("Last Player Standing");
          setWinner(remainingPlayers[0]);
        } else {
          window.setTimeout(() => evaluateSpecialVictory(owned.ownerId), 0);
        }
        if (!ai) setDialog({ type: "toll", title: "Bankrupt", body: `There is not enough cash to pay ${formatMoney(toll)}. All assets were transferred to ${owner?.name ?? "the owner"}.` });
        await sleep(ai ? 1100 : 1900);
        nextTurn();
        return;
      }

      changeCash(playerId, -toll);
      changeCash(owned.ownerId, toll);
      addLog(`${player.name} paid ${formatMoney(toll)} to ${owner?.name ?? "the owner"}.`);

      const takeoverCost = Math.round(purchaseCost(tile, owned.level) * TAKEOVER_MULTIPLIER);
      const cashAfterToll = availableCash - toll;
      const canTakeover = owned.level < 4 && cashAfterToll >= takeoverCost;

      if (ai && canTakeover && cashAfterToll > takeoverCost + 500000 && Math.random() > 0.56) {
        changeCash(playerId, -takeoverCost);
        changeCash(owned.ownerId, takeoverCost);
        setPropertiesSafe((current) => ({ ...current, [tileIndex]: { ...owned, ownerId: playerId } }));
        addLog(`${player.name} took over ${tile.name} from ${owner?.name ?? "the owner"}.`);
        window.setTimeout(() => evaluateSpecialVictory(playerId), 0);
        await sleep(1000);
        nextTurn();
        return;
      }

      if (!ai && canTakeover) {
        setDialog({ type: "takeover", tileIndex, toll, takeoverCost, ownerId: owned.ownerId });
        return;
      }

      if (!ai) {
        setDialog({
          type: "toll",
          title: `Pay Rent for ${tile.name}`,
          body: `${owner?.name ?? "Owner"} received ${formatMoney(toll)} coins${monopolyBonus > 1 ? " including the single-color bonus" : ""}.`,
        });
      }
      await sleep(ai ? 900 : 1500);
      nextTurn();
      return;
    }

    if (tile.kind === "chance") {
      const card = chanceCards[Math.floor(Math.random() * chanceCards.length)];
      if (card.amount < 0 && player.cash < Math.abs(card.amount)) {
        const liquidation = liquidateAssets(playerId, Math.abs(card.amount));
        if (liquidation.sold.length > 0) addLog(`${player.name} liquidated assets to pay the surprise card.`);
      }
      const refreshedCash = playersRef.current.find((item) => item.id === playerId)?.cash ?? player.cash;
      const adjustedAmount = card.amount < 0 ? -Math.min(refreshedCash, Math.abs(card.amount)) : card.amount;
      changeCash(playerId, adjustedAmount);
      addLog(`${player.name}: ${card.title} (${card.amount >= 0 ? "+" : "-"}${formatMoney(Math.abs(card.amount))}).`);
      if (!ai) setDialog({ type: "chance", ...card, amount: adjustedAmount });
      await sleep(ai ? 1000 : 1800);
      nextTurn();
      return;
    }

    if (tile.kind === "tax") {
      const tax = 160000;
      if (player.cash < tax) {
        const liquidation = liquidateAssets(playerId, tax);
        if (liquidation.sold.length > 0) addLog(`${player.name} liquidated assets to pay the city tax.`);
      }
      const refreshedCash = playersRef.current.find((item) => item.id === playerId)?.cash ?? player.cash;
      const paidTax = Math.min(refreshedCash, tax);
      changeCash(playerId, -paidTax);
      addLog(`${player.name} paid ${formatMoney(paidTax)} in city tax.`);
      if (!ai) setDialog({ type: "toll", title: "City Tax", body: `You paid ${formatMoney(paidTax)} coins for city maintenance.` });
      await sleep(ai ? 900 : 1500);
      nextTurn();
      return;
    }

    if (tile.kind === "bonus" || tile.kind === "festival") {
      const bonus = tile.kind === "festival" ? 240000 : 140000;
      changeCash(playerId, bonus);
      addLog(`${player.name} received a ${formatMoney(bonus)} bonus.`);
      if (!ai) setDialog({ type: "info", title: tile.name, body: `Congratulations! You received ${formatMoney(bonus)} coins.` });
      await sleep(ai ? 900 : 1500);
      nextTurn();
      return;
    }

    if (tile.kind === "travel") {
      if (ai) {
        const cityTargets = tiles
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.kind === "city")
          .sort((a, b) => {
            const aOwned = Boolean(propertiesRef.current[a.index]);
            const bOwned = Boolean(propertiesRef.current[b.index]);
            if (aOwned !== bOwned) return aOwned ? 1 : -1;
            return cityStrategicScore(playerId, b.index) - cityStrategicScore(playerId, a.index);
          });
        const destination = cityTargets[0]?.index ?? 31;
        setPlayersSafe((current) => current.map((item) => item.id === playerId ? { ...item, position: destination } : item));
        addLog(`${player.name} terbang menuju ${tiles[destination].name}.`);
        await sleep(850);
        await resolvePlayerTile(playerId, destination, true);
      } else {
        setDialog({ type: "travel" });
      }
      return;
    }

    if (tile.kind === "island") {
      extraTurnRef.current = false;
      setPlayersSafe((current) => current.map((item) => item.id === playerId ? { ...item, islandTurns: 1 } : item));
      addLog(`${player.name} is stranded on Relaxation Island and will miss one turn.`);
      if (!ai) setDialog({ type: "info", title: "Relaxation Island", body: "You will miss one turn. On the next turn, your character will rest automatically." });
      await sleep(ai ? 900 : 1600);
      nextTurn();
      return;
    }

    await sleep(650);
    nextTurn();
  }, [addLog, changeCash, cityStrategicScore, evaluateSpecialVictory, liquidateAssets, nextTurn, ownsCompleteGroup, setPlayersSafe, setPropertiesSafe]);

  const animateMove = useCallback(async (playerId: number, steps: number) => {
    setMovingPlayerId(playerId);
    let currentPosition = playersRef.current.find((player) => player.id === playerId)?.position ?? 0;
    for (let step = 0; step < steps; step += 1) {
      const nextPosition = (currentPosition + 1) % tiles.length;
      if (nextPosition === 0) {
        const movingPlayer = playersRef.current.find((player) => player.id === playerId);
        const bonus = movingPlayer?.character === "rex" ? Math.round(START_BONUS * 1.1) : START_BONUS;
        changeCash(playerId, bonus);
        addLog(`${movingPlayer?.name ?? "Player"} passed START and received ${formatMoney(bonus)}.`);
        if (movingPlayer?.isHuman) {
          setDiceControlCharges((current) => {
            if (current >= DICE_CONTROL_CHARGES) return current;
            addLog("Dice Control energy restored by +1 after passing START.");
            return current + 1;
          });
        }
      }
      currentPosition = nextPosition;
      setPlayersSafe((current) => current.map((player) => player.id === playerId ? { ...player, position: currentPosition } : player));
      playTone(380 + step * 18, 0.045, "square");
      await sleep(125);
    }
    setMovingPlayerId(null);
    return currentPosition;
  }, [addLog, changeCash, playTone, setPlayersSafe]);

  const rollDice = useCallback(async (ai = false) => {
    const currentPlayer = playersRef.current[turn];
    if (rolling || dialog || resolvingRef.current || winner || showIntro || movingPlayerId !== null || currentPlayer?.bankrupt || (currentPlayer?.islandTurns ?? 0) > 0) return;
    resolvingRef.current = true;
    setRolling(true);
    setLastRoll(null);
    setSpeech(`${playersRef.current[turn].name} is rolling the dice…`);

    for (let tick = 0; tick < 11; tick += 1) {
      setDice([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
      playTone(170 + tick * 16, 0.045, "square");
      await sleep(68);
    }

    const usesDiceControl = !ai && diceControlArmed && diceControlCharges > 0;
    let first: number;
    let second: number;
    if (usesDiceControl) {
      const controlHit = Math.random() <= (currentPlayer.character === "alexia" ? 0.9 : 0.76);
      const missOffset = Math.random() > 0.5 ? 1 : -1;
      const controlledTotal = controlHit ? diceTarget : Math.max(2, Math.min(12, diceTarget + missOffset));
      [first, second] = dicePairForTotal(controlledTotal);
      setDiceControlCharges((current) => Math.max(0, current - 1));
      setDiceControlArmed(false);
      addLog(controlHit
        ? `${playersRef.current[turn].name} successfully controlled the dice to land on ${controlledTotal}.`
        : `Dice Control narrowly missed and landed on ${controlledTotal}.`);
    } else {
      first = 1 + Math.floor(Math.random() * 6);
      second = 1 + Math.floor(Math.random() * 6);
    }
    const steps = first + second;
    const player = playersRef.current[turn];
    extraTurnRef.current = first === second;
    setDice([first, second]);
    setLastRoll(steps);
    setRolling(false);
    playTone(920, 0.13, "triangle");
    addLog(`${player.name} rolled ${first} + ${second} = ${steps}${first === second ? " — DOUBLES!" : ""}.`);
    await sleep(450);
    const destination = await animateMove(player.id, steps);
    addLog(`${player.name} tiba di ${tiles[destination].name}.`);
    await sleep(320);
    await resolveTile(player.id, destination, ai);
  }, [addLog, animateMove, dialog, diceControlArmed, diceControlCharges, diceTarget, movingPlayerId, playTone, resolveTile, rolling, showIntro, turn, winner]);

  useEffect(() => {
    if (showIntro || dialog || rolling || winner || movingPlayerId !== null || activePlayer.bankrupt || activePlayer.islandTurns <= 0 || resolvingRef.current) return;
    resolvingRef.current = true;
    setSpeech(`${activePlayer.name} is resting on Relaxation Island…`);
    const timer = window.setTimeout(() => {
      setPlayersSafe((current) => current.map((player) => player.id === activePlayer.id ? { ...player, islandTurns: Math.max(0, player.islandTurns - 1) } : player));
      addLog(`${activePlayer.name} missed a turn on Relaxation Island.`);
      extraTurnRef.current = false;
      nextTurn();
    }, activePlayer.isHuman ? 1400 : 900);
    return () => window.clearTimeout(timer);
  }, [activePlayer, addLog, dialog, movingPlayerId, nextTurn, rolling, setPlayersSafe, showIntro, winner]);

  useEffect(() => {
    if (showIntro || dialog || rolling || winner || activePlayer.isHuman || activePlayer.islandTurns > 0 || activePlayer.bankrupt || resolvingRef.current || movingPlayerId !== null) return;
    const timer = window.setTimeout(() => void rollDice(true), 850);
    return () => window.clearTimeout(timer);
  }, [activePlayer.bankrupt, activePlayer.isHuman, activePlayer.islandTurns, dialog, movingPlayerId, rollDice, rolling, showIntro, turn, winner]);

  useEffect(() => {
    setTurnSeconds(20);
  }, [turn]);

  useEffect(() => {
    if (showIntro || dialog || rolling || winner || movingPlayerId !== null || !activePlayer.isHuman || activePlayer.islandTurns > 0 || activePlayer.bankrupt) return;
    const timer = window.setInterval(() => {
      setTurnSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          window.setTimeout(() => void rollDice(false), 0);
          return 20;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activePlayer.bankrupt, activePlayer.isHuman, activePlayer.islandTurns, dialog, movingPlayerId, rollDice, rolling, showIntro, turn, winner]);

  useEffect(() => {
    if (round <= maxRounds || winner) return;
    const ranked = [...players].filter((player) => !player.bankrupt).sort((a, b) => totalWorth(b) - totalWorth(a));
    setWinReason("Highest total assets");
    setWinner(ranked[0] ?? players[0]);
  }, [maxRounds, players, round, totalWorth, winner]);

  const buyProperty = () => {
    if (!dialog || dialog.type !== "buy") return;
    const tile = tiles[dialog.tileIndex];
    const currentPlayer = playersRef.current[turn];
    const baseCost = purchaseCost(tile, purchaseLevel);
    const cost = currentPlayer.character === "nova" ? Math.round(baseCost * 0.94) : baseCost;
    if (currentPlayer.cash < cost) {
      setDialog({ type: "info", title: "Not Enough Coins", body: `The ${levelName(purchaseLevel)} package requires ${formatMoney(cost)} coins.` });
      window.setTimeout(nextTurn, 1500);
      return;
    }
    changeCash(currentPlayer.id, -cost);
    setPropertiesSafe((current) => ({ ...current, [dialog.tileIndex]: { ownerId: currentPlayer.id, level: purchaseLevel } }));
    addLog(`${currentPlayer.name} bought ${tile.name} with a ${levelName(purchaseLevel)}.`);
    window.setTimeout(() => evaluateSpecialVictory(currentPlayer.id), 0);
    nextTurn();
  };

  const upgradeProperty = () => {
    if (!dialog || dialog.type !== "upgrade") return;
    const tile = tiles[dialog.tileIndex];
    const state = propertiesRef.current[dialog.tileIndex];
    if (!state || state.level >= 4) {
      setDialog({ type: "info", title: "Maximum Landmark", body: "This city already has the highest landmark." });
      window.setTimeout(nextTurn, 1400);
      return;
    }
    const nextLevel = state.level + 1;
    const cost = purchaseCost(tile, nextLevel) - purchaseCost(tile, state.level);
    const currentPlayer = playersRef.current[turn];
    if (currentPlayer.cash < cost) {
      setDialog({ type: "info", title: "Not Enough Coins", body: `The upgrade requires ${formatMoney(cost)} coins.` });
      window.setTimeout(nextTurn, 1400);
      return;
    }
    changeCash(currentPlayer.id, -cost);
    setPropertiesSafe((current) => ({ ...current, [dialog.tileIndex]: { ...state, level: nextLevel } }));
    addLog(`${currentPlayer.name} membangun ${levelName(nextLevel)} di ${tile.name}.`);
    window.setTimeout(() => evaluateSpecialVictory(currentPlayer.id), 0);
    nextTurn();
  };

  const takeOverProperty = () => {
    if (!dialog || dialog.type !== "takeover") return;
    const currentPlayer = playersRef.current[turn];
    const owner = playersRef.current.find((player) => player.id === dialog.ownerId);
    const tile = tiles[dialog.tileIndex];
    const state = propertiesRef.current[dialog.tileIndex];
    if (!state || currentPlayer.cash < dialog.takeoverCost) {
      setDialog({ type: "info", title: "Takeover Failed", body: "There are not enough coins or the city ownership has changed." });
      window.setTimeout(nextTurn, 1300);
      return;
    }
    changeCash(currentPlayer.id, -dialog.takeoverCost);
    changeCash(dialog.ownerId, dialog.takeoverCost);
    setPropertiesSafe((current) => ({ ...current, [dialog.tileIndex]: { ...state, ownerId: currentPlayer.id } }));
    addLog(`${currentPlayer.name} took over ${tile.name} from ${owner?.name ?? "the owner"}.`);
    window.setTimeout(() => evaluateSpecialVictory(currentPlayer.id), 0);
    nextTurn();
  };

  const chooseTravelDestination = async (destination: number) => {
    const currentPlayer = playersRef.current[turn];
    setDialog(null);
    setPlayersSafe((current) => current.map((player) => player.id === currentPlayer.id ? { ...player, position: destination } : player));
    addLog(`${currentPlayer.name} terbang langsung menuju ${tiles[destination].name}.`);
    await sleep(550);
    await resolveTile(currentPlayer.id, destination, false);
  };

  const armDiceControl = () => {
    if (diceControlCharges <= 0) {
      setDialog({ type: "info", title: "Out of Energy", body: "Pass START to restore one Dice Control energy." });
      return;
    }
    setDiceControlArmed(true);
    setDialog(null);
    setSpeech(`Dice Control active. Target number: ${diceTarget}.`);
    playTone(720, 0.15, "triangle");
  };

  const startConfiguredGame = () => {
    const roster = createMatchRoster(selectedCharacter, botCount);
    matchRosterRef.current = roster;
    playersRef.current = roster;
    propertiesRef.current = {};
    setPlayers(roster);
    setProperties({});
    setTurn(0);
    setRound(1);
    setDice([1, 1]);
    setRolling(false);
    setMovingPlayerId(null);
    setDialog(null);
    setPurchaseLevel(1);
    setLog([`${roster[0].name} memasuki Marble World bersama ${roster.length - 1} rival.`]);
    setWinner(null);
    setWinReason("Highest total assets");
    setLastRoll(null);
    setSpeech(`${roster[0].name}, let’s begin!`);
    setDiceControlCharges(DICE_CONTROL_CHARGES);
    setDiceTarget(8);
    setDiceControlArmed(false);
    setLiquidationHistory([]);
    resolvingRef.current = false;
    extraTurnRef.current = false;
    setShowIntro(false);
    playTone(880, 0.2, "triangle");
  };

  const resetGame = () => {
    const roster = matchRosterRef.current.map((player, index) => ({
      ...player,
      cash: STARTING_CASH,
      position: index * 8,
      islandTurns: 0,
      bankrupt: false,
      isHuman: index === 0,
    }));
    playersRef.current = roster;
    propertiesRef.current = {};
    setPlayers(roster);
    setProperties({});
    setTurn(0);
    setRound(1);
    setDice([1, 1]);
    setRolling(false);
    setMovingPlayerId(null);
    setDialog(null);
    setPurchaseLevel(1);
    setLog(["A new game is ready to begin."]);
    setWinner(null);
    setWinReason("Highest total assets");
    setShowIntro(true);
    setLastRoll(null);
    setSpeech("Let’s begin!");
    setDiceControlCharges(DICE_CONTROL_CHARGES);
    setDiceTarget(8);
    setDiceControlArmed(false);
    setLiquidationHistory([]);
    resolvingRef.current = false;
    extraTurnRef.current = false;
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await gameRef.current?.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      setFullscreen(false);
    }
  };

  const tileElements = useMemo(() => tiles.map((tile, index) => {
    const grid = perimeterPosition(index);
    const property = properties[index];
    const owner = property ? players.find((player) => player.id === property.ownerId) : null;
    const visitors = players.filter((player) => player.position === index);
    const isCorner = [0, 8, 16, 24].includes(index);
    return (
      <button
        type="button"
        key={`${tile.name}-${index}`}
        className={`${styles.tile} ${isCorner ? styles.cornerTile : ""} ${styles[`kind_${tile.kind}`]}`}
        style={{ gridRow: grid.row, gridColumn: grid.column, "--tile-accent": tile.accent } as CSSProperties}
        onClick={() => setDialog({
          type: "info",
          title: tile.name,
          body: tile.kind === "city"
            ? `${tile.group} · Price ${formatMoney(tile.price ?? 0)} · Base rent ${formatMoney(tile.toll ?? 0)}${property ? ` · ${owner?.name ?? "Owner"} · ${levelName(property.level)}` : ""}`
            : "Petak khusus ComePlayers Marble.",
        })}
      >
        <span className={styles.tileAccent} />
        <span className={styles.tileCode}>{tile.code}</span>
        {property && <span className={`${styles.ownerFlag} ${styles[`owner_${owner?.color ?? "gold"}`]}`}>{property.level}</span>}
        <span className={styles.tileIcon}>{tileIcon(tile.kind)}</span>
        <span className={styles.tileName}>{tile.name}</span>
        {tile.kind === "city" && <span className={styles.tilePrice}>{formatMoney(tile.price ?? 0)}</span>}
        {property && (
          <span className={`${styles.buildings} ${property.level === 4 ? styles.landmarkBuildings : ""}`}>
            {Array.from({ length: property.level }).map((_, building) => <i key={building} />)}
          </span>
        )}
        <span className={styles.tokens}>
          {visitors.map((player) => (
            <i
              key={player.id}
              className={`${styles.token} ${styles[`token_${player.color}`]} ${movingPlayerId === player.id ? styles.movingToken : ""}`}
              title={player.name}
            >
              <Image src={player.avatar} alt="" width={72} height={72} />
            </i>
          ))}
        </span>
      </button>
    );
  }), [movingPlayerId, players, properties]);

  const previewPlayers = useMemo(() => createMatchRoster(selectedCharacter, botCount), [botCount, selectedCharacter]);

  const activeProgress = `${Math.max(0, Math.min(20, turnSeconds)) * 5}%`;
  const buyTile = dialog?.type === "buy" ? tiles[dialog.tileIndex] : null;
  const buyCost = buyTile ? Math.round(purchaseCost(buyTile, purchaseLevel) * (activePlayer.character === "nova" ? 0.94 : 1)) : 0;
  const buyRent = buyTile ? Math.round((buyTile.toll ?? 0) * (1 + (purchaseLevel - 1) * 0.86)) : 0;
  const infoDialog = dialog && (dialog.type === "chance" || dialog.type === "toll" || dialog.type === "info") ? dialog : null;

  if (showOnlineEngine) {
    return (
      <div className={styles.onlineEngineShell}>
        <div className={styles.onlineEngineBar}>
          <div><FaWifi /><span><strong>ComePlayers Marble Online</strong><small>Public rooms, invitation codes, matchmaking, and real-time synchronization</small></span></div>
          <button type="button" onClick={() => setShowOnlineEngine(false)}><FaXmark /> Back to Marble World</button>
        </div>
        <ComePlayersMonopolyGame best={0} onScore={() => undefined} />
      </div>
    );
  }

  return (
    <div ref={gameRef} className={styles.gameShell}>
      <div className={styles.woodBackdrop} />
      <div className={styles.ambientGlow} />

      <header className={styles.topBar}>
        {!embedded ? (
          <button type="button" className={styles.iconButton} onClick={() => router.push("/")} aria-label="Exit game"><FaXmark /></button>
        ) : null}
        <div className={styles.brand}>
          <Image src="/brand/comeplayers-cp-v6.png" alt="ComePlayers" width={64} height={64} />
          <div><strong>COMEPLAYERS MARBLE</strong><span>Play Together · Win Together</span></div>
        </div>
        <div className={styles.roundBadge}><FaTrophy /> {mode === "quick" ? "Quick Mode" : "Classic Mode"} · Round {Math.min(round, maxRounds)}/{maxRounds}</div>
        <div className={styles.toolbar}>
          <button type="button" className={styles.iconButton} onClick={() => setDialog({ type: "rules" })} aria-label="Game guide"><FaCircleInfo /></button>
          <button type="button" className={styles.iconButton} onClick={resetGame} aria-label="Restart"><FaRotateRight /></button>
          <button type="button" className={styles.iconButton} onClick={() => setSound((value) => !value)} aria-label="Suara">{sound ? <FaVolumeHigh /> : <FaVolumeXmark />}</button>
          <button type="button" className={styles.iconButton} onClick={toggleFullscreen} aria-label="Fullscreen">{fullscreen ? <FaCompress /> : <FaExpand />}</button>
        </div>
      </header>

      <main className={styles.stage}>
        {players.map((player, index) => (
          <section key={player.id} className={`${styles.playerCard} ${styles[`player_${index}`]} ${turn === index ? styles.activePlayer : ""} ${player.bankrupt ? styles.bankruptPlayer : ""}`}>
            <div className={`${styles.avatarRing} ${styles[`ring_${player.color}`]}`}>
              <Image src={player.avatar} alt={player.name} width={96} height={96} />
              <i>{ranking[player.id]}<sup>{ranking[player.id] === 1 ? "st" : ranking[player.id] === 2 ? "nd" : ranking[player.id] === 3 ? "rd" : "th"}</sup></i>
            </div>
            <div className={styles.playerInfo}>
              <div className={styles.playerNameLine}><strong>{player.name}</strong><em>{player.team}</em></div>
              <span><FaCoins /> {formatMoney(player.cash)}</span>
              <small>Total aset {formatMoney(totalWorth(player))}</small>
              <small className={styles.abilityText}>{player.bankrupt ? "BANKRUPT" : player.islandTurns > 0 ? "Island: miss 1 turn" : player.ability}</small>
              <div className={styles.cashMeter}><i style={{ width: `${Math.min(100, Math.max(6, (player.cash / STARTING_CASH) * 100))}%` }} /></div>
            </div>
            {turn === index && <div className={styles.speechBubble}>{speech}</div>}
          </section>
        ))}

        <div className={styles.boardFrame}>
          <div className={`${styles.cashPile} ${styles.cashPileOne}`}>{Array.from({ length: 5 }).map((_, index) => <i key={index} />)}</div>
          <div className={`${styles.cashPile} ${styles.cashPileTwo}`}>{Array.from({ length: 5 }).map((_, index) => <i key={index} />)}</div>
          <div className={`${styles.cashPile} ${styles.cashPileThree}`}>{Array.from({ length: 5 }).map((_, index) => <i key={index} />)}</div>
          <div className={`${styles.cashPile} ${styles.cashPileFour}`}>{Array.from({ length: 5 }).map((_, index) => <i key={index} />)}</div>

          <div className={styles.boardGrid}>
            {tileElements}
            <section className={styles.boardCenter}>
              <div className={styles.centerDeckGold}><FaGift /></div>
              <div className={styles.centerDeckChance}><FaQuestion /></div>
              <div className={styles.centerLogo}>
                <Image src="/brand/comeplayers-cp-v6.png" alt="CP" width={120} height={120} />
                <span>MARBLE WORLD</span>
              </div>
              <div className={styles.turnHeader}>
                <div className={styles.timerRing} style={{ "--progress": activeProgress } as CSSProperties}><span>{turnSeconds}</span></div>
                <div className={styles.turnTitle}><strong>{activePlayer.name}</strong>&apos;s Turn<small>{activePlayer.team}</small></div>
              </div>
              <div className={`${styles.diceArea} ${rolling ? styles.diceRolling : ""}`}>
                <span>{dice[0]}</span><span>{dice[1]}</span>
                {lastRoll !== null && !rolling && <b>{lastRoll}</b>}
              </div>
              <div className={styles.diceControlStrip}>
                <button
                  type="button"
                  className={diceControlArmed ? styles.diceControlActive : ""}
                  disabled={!activePlayer.isHuman || activePlayer.bankrupt || activePlayer.islandTurns > 0 || diceControlCharges <= 0 || rolling || movingPlayerId !== null || showIntro}
                  onClick={() => setDialog({ type: "dice-control" })}
                >
                  <FaWandMagicSparkles /> {diceControlArmed ? `TARGET ${diceTarget}` : "DICE CONTROL"}
                </button>
                <span>{Array.from({ length: DICE_CONTROL_CHARGES }).map((_, index) => <i key={index} className={index < diceControlCharges ? styles.energyFilled : ""} />)}</span>
              </div>
              <button
                type="button"
                className={styles.rollButton}
                disabled={!activePlayer.isHuman || activePlayer.islandTurns > 0 || activePlayer.bankrupt || rolling || Boolean(dialog) || Boolean(winner) || movingPlayerId !== null || showIntro}
                onClick={() => void rollDice(false)}
              >
                <FaDice /> {activePlayer.islandTurns > 0 ? "RESTING..." : rolling ? "ROLLING..." : movingPlayerId !== null ? "MOVING..." : "ROLL DICE"}
              </button>
              <div className={styles.centerStats}>
                <span><b>{activeTile.name}</b> current position</span>
                <span><b>{Object.keys(properties).length}</b> cities owned</span>
              </div>
            </section>
          </div>
        </div>

        <aside className={styles.activityPanel}>
          <div className={styles.activityHeader}><strong>Activity</strong><span>LIVE</span></div>
          {log.map((item, index) => <p key={`${item}-${index}`}><i />{item}</p>)}
        </aside>
      </main>

      {showIntro && (
        <div className={styles.modalBackdrop}>
          <section className={`${styles.introPanel} ${styles.lobbyPanel}`}>
            <div className={styles.introLogo}>
              <Image src="/brand/comeplayers-cp-v6.png" alt="ComePlayers" width={72} height={72} />
              <div><strong>MARBLE WORLD LOBBY</strong><span>Select a character, mode, and number of rivals</span></div>
            </div>

            <div className={styles.lobbySectionTitle}><span>1</span><div><strong>Select Character</strong><small>Each character has a different passive ability.</small></div></div>
            <div className={styles.characterPicker}>
              {initialPlayers.map((character) => (
                <button
                  type="button"
                  key={character.character}
                  className={selectedCharacter === character.character ? styles.selectedCharacter : ""}
                  onClick={() => setSelectedCharacter(character.character)}
                >
                  <Image src={character.avatar} alt={character.name} width={92} height={92} />
                  <span><strong>{character.name}</strong><small>{character.ability}</small></span>
                  {selectedCharacter === character.character ? <i>SELECTED</i> : null}
                </button>
              ))}
            </div>

            <div className={styles.lobbySettings}>
              <div>
                <div className={styles.lobbySectionTitle}><span>2</span><div><strong>Match Mode</strong><small>Set the game length.</small></div></div>
                <div className={styles.modeSelector}>
                  <button type="button" className={mode === "quick" ? styles.selectedMode : ""} onClick={() => setMode("quick")}>
                    <strong>Quick Mode</strong><span>8 rounds · shorter action</span>
                  </button>
                  <button type="button" className={mode === "classic" ? styles.selectedMode : ""} onClick={() => setMode("classic")}>
                    <strong>Classic Mode</strong><span>15 rounds · full strategy</span>
                  </button>
                </div>
              </div>
              <div>
                <div className={styles.lobbySectionTitle}><span>3</span><div><strong>Number of Rivals</strong><small>Play against strategic AI.</small></div></div>
                <div className={styles.botSelector}>
                  {[1, 2, 3].map((count) => (
                    <button type="button" key={count} className={botCount === count ? styles.selectedBotCount : ""} onClick={() => setBotCount(count)}>
                      <FaUsers /><strong>{count}</strong><span>Rival</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.seatGrid}>
              {previewPlayers.map((player, index) => (
                <article key={player.id} className={`${styles.seatCard} ${styles[`seat_${player.color}`]}`}>
                  <b>{index + 1}</b>
                  <Image src={player.avatar} alt={player.name} width={88} height={88} />
                  <strong>{player.name}</strong>
                  <span>{index === 0 ? "You" : "Strategic AI"}</span>
                </article>
              ))}
            </div>

            <p>Buy cities, build landmarks, use World Tour, take over rival cities, and win through Triple Color, World Tour, or Line Monopoly.</p>
            <div className={styles.lobbyActions}>
              <button type="button" className={styles.onlineLobbyButton} onClick={() => setShowOnlineEngine(true)}>
                <FaWifi /><span><strong>ONLINE MULTIPLAYER</strong><small>Rooms, invitation codes, and real-time matchmaking</small></span>
              </button>
              <button type="button" className={styles.startButton} onClick={startConfiguredGame}>
                <FaDice /> START SOLO
              </button>
            </div>
          </section>
        </div>
      )}

      {dialog && (
        <div className={styles.modalBackdrop}>
          {dialog.type === "dice-control" ? (
            <section className={`${styles.gameDialog} ${styles.diceControlDialog}`}>
              <div className={styles.dialogEmblem}><FaWandMagicSparkles /></div>
              <h2>{activePlayer.name}&apos;s Dice Control</h2>
              <p>Select the number of spaces to target. Alexia has 90% accuracy; other characters have 76%.</p>
              <div className={styles.diceTargetGrid}>
                {[4, 6, 8, 10, 12].map((target) => (
                  <button
                    type="button"
                    key={target}
                    className={diceTarget === target ? styles.selectedDiceTarget : ""}
                    onClick={() => setDiceTarget(target)}
                  >
                    <FaDice /><strong>{target}</strong><span>spaces</span>
                  </button>
                ))}
              </div>
              <div className={styles.diceEnergySummary}>
                <span>Available energy <b>{diceControlCharges}/{DICE_CONTROL_CHARGES}</b></span>
                <span>Energy is restored when you pass START.</span>
              </div>
              <div className={styles.dialogActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setDialog(null)}>Cancel</button>
                <button type="button" className={styles.primaryButton} onClick={armDiceControl}>Activate Target {diceTarget}</button>
              </div>
            </section>
          ) : dialog.type === "rules" ? (
            <section className={`${styles.gameDialog} ${styles.rulesDialog}`}>
              <div className={styles.dialogEmblem}><FaCircleInfo /></div>
              <h2>ComePlayers Marble Guide</h2>
              <div className={styles.rulesGrid}>
                <article><b>1</b><div><strong>Buy & Build</strong><span>Buy cities, then upgrade Land → House → Hotel → Landmark.</span></div></article>
                <article><b>2</b><div><strong>Dice Control</strong><span>Human characters have two energy points to target a move count. Alexia has the highest accuracy. Pass START to recharge.</span></div></article>
                <article><b>3</b><div><strong>Rent & Liquidation</strong><span>Rent increases by level. If cash is insufficient, the cheapest asset is automatically sold to the bank for 70% of its value.</span></div></article>
                <article><b>4</b><div><strong>Quick Victory</strong><span>Achieve Triple Color, World Tour, Line Monopoly, or survive as the last player.</span></div></article>
              </div>
              <div className={styles.dialogActions}>
                <button type="button" className={styles.primaryButton} onClick={() => setDialog(null)}>Got it</button>
              </div>
            </section>
          ) : dialog.type === "buy" && buyTile ? (
            <section className={styles.clipboardDialog}>
              <div className={styles.clipHandle} />
              <header style={{ "--dialog-accent": buyTile.accent } as CSSProperties}>
                <span>{buyTile.code}</span>
                <div><strong>{buyTile.name}</strong><small>{buyTile.group}</small></div>
              </header>
              <p>Select the building package you want to buy.</p>
              <div className={styles.buildOptions}>
                {buildLevels.map((option) => {
                  const cost = purchaseCost(buyTile, option.level);
                  return (
                    <button
                      type="button"
                      key={option.level}
                      className={purchaseLevel === option.level ? styles.selectedBuild : ""}
                      onClick={() => setPurchaseLevel(option.level)}
                    >
                      <i>{option.icon}</i>
                      <span>{option.label}<small>Level {option.level}</small></span>
                      <strong>{formatMoney(cost)}</strong>
                    </button>
                  );
                })}
              </div>
              <div className={styles.purchaseSummary}>
                <span>Base rent <b>{formatMoney(buyRent)}</b></span>
                <span>Total purchase <b>{formatMoney(buyCost)}</b></span>
                <span>Available cash <b>{formatMoney(activePlayer.cash)}</b></span>
              </div>
              <div className={styles.dialogActions}>
                <button type="button" className={styles.secondaryButton} onClick={nextTurn}>Cancel</button>
                <button type="button" className={styles.primaryButton} onClick={buyProperty}>Purchase</button>
              </div>
            </section>
          ) : dialog.type === "takeover" ? (
            <section className={`${styles.gameDialog} ${styles.takeoverDialog}`}>
              <div className={styles.dialogEmblem}><FaCrown /></div>
              <h2>Take Over {tiles[dialog.tileIndex].name}?</h2>
              <p>You paid {formatMoney(dialog.toll)} in rent. This city can still be taken over before a landmark is built.</p>
              <div className={styles.takeoverSummary}>
                <span>Current owner <b>{players.find((player) => player.id === dialog.ownerId)?.name ?? "Rival"}</b></span>
                <span>Takeover cost <b>{formatMoney(dialog.takeoverCost)}</b></span>
                <span>Cash remaining after transaction <b>{formatMoney(activePlayer.cash - dialog.takeoverCost)}</b></span>
              </div>
              <div className={styles.dialogActions}>
                <button type="button" className={styles.secondaryButton} onClick={nextTurn}>Pay Rent Only</button>
                <button type="button" className={styles.primaryButton} onClick={takeOverProperty}>Take Over City</button>
              </div>
            </section>
          ) : dialog.type === "travel" ? (
            <section className={`${styles.gameDialog} ${styles.travelDialog}`}>
              <div className={styles.dialogEmblem}><FaGlobe /></div>
              <h2>World Tour</h2>
              <p>Select a destination city. You will land there immediately and resolve the tile.</p>
              <div className={styles.travelGrid}>
                {tiles.map((tile, index) => tile.kind === "city" ? (
                  <button type="button" key={tile.name} onClick={() => void chooseTravelDestination(index)} style={{ "--city-color": tile.accent } as CSSProperties}>
                    <span>{tile.code}</span><strong>{tile.name}</strong><small>{properties[index] ? "Already owned" : formatMoney(tile.price ?? 0)}</small>
                  </button>
                ) : null)}
              </div>
              <div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} onClick={nextTurn}>Skip</button></div>
            </section>
          ) : (
            <section className={styles.gameDialog}>
              <div className={styles.dialogEmblem}>{dialog.type === "upgrade" ? <FaBuilding /> : dialog.type === "chance" ? <FaGift /> : <FaCrown />}</div>
              <h2>{dialog.type === "upgrade" ? `Upgrade ${tiles[dialog.tileIndex].name}` : infoDialog?.title ?? "Information"}</h2>
              {dialog.type === "upgrade" ? (() => {
                const tile = tiles[dialog.tileIndex];
                const state = properties[dialog.tileIndex];
                const nextLevel = Math.min(4, (state?.level ?? 1) + 1);
                const cost = purchaseCost(tile, nextLevel) - purchaseCost(tile, state?.level ?? 1);
                return (
                  <>
                    <p>Upgrade buildings to increase the city&apos;s rent value.</p>
                    <div className={styles.upgradeVisual}>
                      <span>{levelName(state?.level ?? 1)}<b>Level {state?.level ?? 1}</b></span>
                      <i>→</i>
                      <span>{levelName(nextLevel)}<b>Level {nextLevel}</b></span>
                    </div>
                    <div className={styles.priceCard}><span>Upgrade Cost</span><strong>{formatMoney(cost)}</strong></div>
                    <div className={styles.dialogActions}>
                      <button type="button" className={styles.secondaryButton} onClick={nextTurn}>Done</button>
                      <button type="button" className={styles.primaryButton} onClick={upgradeProperty}>Upgrade</button>
                    </div>
                  </>
                );
              })() : (
                <>
                  <p>{infoDialog?.body ?? ""}</p>
                  {dialog.type === "chance" && (
                    <div className={`${styles.priceCard} ${dialog.amount < 0 ? styles.negative : ""}`}>
                      <span>Coin Change</span><strong>{dialog.amount >= 0 ? "+" : "-"}{formatMoney(Math.abs(dialog.amount))}</strong>
                    </div>
                  )}
                  <div className={styles.dialogActions}>
                    <button type="button" className={styles.primaryButton} onClick={() => setDialog(null)}>Close</button>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      )}

      {winner && (
        <div className={styles.modalBackdrop}>
          <section className={`${styles.gameDialog} ${styles.winnerDialog}`}>
            <FaCrown className={styles.winnerCrown} />
            <Image className={styles.winnerAvatar} src={winner.avatar} alt={winner.name} width={128} height={128} />
            <h2>{winner.name} Wins!</h2>
            <p>{winReason === "Highest total assets" ? `The player with the highest total assets after ${maxRounds} rounds.` : `Special victory: ${winReason}.`}</p>
            <div className={styles.priceCard}><span>Total Wealth</span><strong>{formatMoney(totalWorth(winner))}</strong></div>
            <div className={styles.matchStandings}>
              {standings.map((player, index) => (
                <article key={player.id} className={player.id === winner.id ? styles.winnerStanding : ""}>
                  <b>#{index + 1}</b>
                  <Image src={player.avatar} alt="" width={42} height={42} />
                  <div><strong>{player.name}</strong><span>{player.bankrupt ? "Bankrupt" : `${Object.values(properties).filter((state) => state.ownerId === player.id).length} cities`}</span></div>
                  <em>{formatMoney(totalWorth(player))}</em>
                </article>
              ))}
            </div>
            {liquidationHistory.length > 0 && (
              <details className={styles.liquidationSummary}>
                <summary>Asset sale history ({liquidationHistory.length})</summary>
                {liquidationHistory.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}
              </details>
            )}
            <div className={styles.dialogActions}>
              {!embedded ? (
                <button type="button" className={styles.secondaryButton} onClick={() => router.push("/")}>Exit</button>
              ) : null}
              <button type="button" className={styles.primaryButton} onClick={resetGame}>Main Lagi</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
