"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FaArrowRotateRight,
  FaBolt,
  FaBomb,
  FaGift,
  FaHammer,
  FaHeart,
  FaLightbulb,
  FaPause,
  FaPlay,
  FaShuffle,
  FaStar,
  FaVolumeHigh,
  FaVolumeXmark,
  FaWandMagicSparkles,
} from "react-icons/fa6";
import type { ArcadeGameProps } from "@/components/arcade/ArcadeGameTypes";
import styles from "./ComePlayersMatchGame.module.css";

type PieceType = 0 | 1 | 2 | 3 | 4 | 5;
type SpecialType = "row" | "column" | "burst" | "nova" | null;

type Piece = {
  id: string;
  type: PieceType;
  special: SpecialType;
};

type Board = Piece[][];
type Position = { row: number; column: number };
type MatchDirection = "horizontal" | "vertical";

type MatchGroup = {
  direction: MatchDirection;
  cells: Position[];
  type: PieceType;
};

type LevelConfig = {
  id: number;
  name: string;
  chapter: string;
  moves: number;
  targetScore: number;
  objectives: Partial<Record<PieceType, number>>;
  reward: number;
};

type GameStatus = "playing" | "paused" | "victory" | "defeat";
type BoosterId = "hammer" | "shuffle" | "moves";

const ROWS = 8;
const COLUMNS = 8;
const PIECE_TYPES: PieceType[] = [0, 1, 2, 3, 4, 5];
const STORAGE_KEY = "comeplayers_match_progress_v1";
const BEST_KEY = "comeplayers_match_best_v1";

const LEVELS: LevelConfig[] = [
  {
    id: 1,
    name: "Neon Lobby",
    chapter: "Alexia's Crystal Quest",
    moves: 24,
    targetScore: 3200,
    objectives: { 0: 12, 1: 10 },
    reward: 250,
  },
  {
    id: 2,
    name: "Squad Signal",
    chapter: "Alexia's Crystal Quest",
    moves: 23,
    targetScore: 5200,
    objectives: { 2: 16, 4: 12 },
    reward: 400,
  },
  {
    id: 3,
    name: "Golden Queue",
    chapter: "Community Nexus",
    moves: 22,
    targetScore: 7200,
    objectives: { 0: 18, 3: 14, 5: 10 },
    reward: 550,
  },
  {
    id: 4,
    name: "Marketplace Rush",
    chapter: "Community Nexus",
    moves: 21,
    targetScore: 9200,
    objectives: { 1: 18, 2: 16, 4: 14 },
    reward: 700,
  },
  {
    id: 5,
    name: "ComePlayers Core",
    chapter: "Final Connection",
    moves: 20,
    targetScore: 12000,
    objectives: { 0: 20, 1: 18, 2: 18, 5: 14 },
    reward: 1000,
  },
];

const PIECE_META: Record<PieceType, { name: string; symbol: string }> = {
  0: { name: "CP Gold", symbol: "CP" },
  1: { name: "Squad Cyan", symbol: "◆" },
  2: { name: "Victory Violet", symbol: "★" },
  3: { name: "Party Rose", symbol: "♥" },
  4: { name: "Power Lime", symbol: "⚡" },
  5: { name: "Core White", symbol: "⬢" },
};

let pieceSequence = 0;

function createPiece(type: PieceType = randomType(), special: SpecialType = null): Piece {
  pieceSequence += 1;
  return { id: `cp-match-${Date.now()}-${pieceSequence}`, type, special };
}

function randomType(): PieceType {
  return PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
}

function positionKey(position: Position) {
  return `${position.row}:${position.column}`;
}

function parsePositionKey(key: string): Position {
  const [row, column] = key.split(":").map(Number);
  return { row, column };
}

function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((piece) => ({ ...piece })));
}

function swapPieces(board: Board, first: Position, second: Position): Board {
  const next = cloneBoard(board);
  const firstPiece = next[first.row][first.column];
  next[first.row][first.column] = next[second.row][second.column];
  next[second.row][second.column] = firstPiece;
  return next;
}

function areAdjacent(first: Position, second: Position) {
  return Math.abs(first.row - second.row) + Math.abs(first.column - second.column) === 1;
}

function findMatches(board: Board): MatchGroup[] {
  const groups: MatchGroup[] = [];

  for (let row = 0; row < ROWS; row += 1) {
    let start = 0;
    for (let column = 1; column <= COLUMNS; column += 1) {
      const same =
        column < COLUMNS &&
        board[row][column].type === board[row][start].type;
      if (same) continue;
      const length = column - start;
      if (length >= 3) {
        groups.push({
          direction: "horizontal",
          type: board[row][start].type,
          cells: Array.from({ length }, (_, offset) => ({ row, column: start + offset })),
        });
      }
      start = column;
    }
  }

  for (let column = 0; column < COLUMNS; column += 1) {
    let start = 0;
    for (let row = 1; row <= ROWS; row += 1) {
      const same =
        row < ROWS &&
        board[row][column].type === board[start][column].type;
      if (same) continue;
      const length = row - start;
      if (length >= 3) {
        groups.push({
          direction: "vertical",
          type: board[start][column].type,
          cells: Array.from({ length }, (_, offset) => ({ row: start + offset, column })),
        });
      }
      start = row;
    }
  }

  return groups;
}

function boardHasPossibleMove(board: Board) {
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const current = { row, column };
      const candidates = [
        { row, column: column + 1 },
        { row: row + 1, column },
      ];
      for (const candidate of candidates) {
        if (candidate.row >= ROWS || candidate.column >= COLUMNS) continue;
        const swapped = swapPieces(board, current, candidate);
        if (findMatches(swapped).length > 0) return true;
      }
    }
  }
  return false;
}

function createBoard(): Board {
  let attempts = 0;
  while (attempts < 50) {
    const board: Board = [];
    for (let row = 0; row < ROWS; row += 1) {
      const nextRow: Piece[] = [];
      for (let column = 0; column < COLUMNS; column += 1) {
        const blockedTypes = new Set<PieceType>();
        if (
          column >= 2 &&
          nextRow[column - 1].type === nextRow[column - 2].type
        ) {
          blockedTypes.add(nextRow[column - 1].type);
        }
        if (
          row >= 2 &&
          board[row - 1][column].type === board[row - 2][column].type
        ) {
          blockedTypes.add(board[row - 1][column].type);
        }
        const choices = PIECE_TYPES.filter((type) => !blockedTypes.has(type));
        nextRow.push(createPiece(choices[Math.floor(Math.random() * choices.length)]));
      }
      board.push(nextRow);
    }
    if (boardHasPossibleMove(board)) return board;
    attempts += 1;
  }
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLUMNS }, () => createPiece()),
  );
}

function chooseCreationAnchor(group: MatchGroup, preferred: Position[]) {
  const preferredInGroup = preferred.find((position) =>
    group.cells.some((cell) => positionKey(cell) === positionKey(position)),
  );
  if (preferredInGroup) return preferredInGroup;
  return group.cells[Math.floor(group.cells.length / 2)];
}

function collectSpecialCreations(groups: MatchGroup[], preferred: Position[]) {
  const cellDirections = new Map<string, Set<MatchDirection>>();
  for (const group of groups) {
    for (const cell of group.cells) {
      const key = positionKey(cell);
      const directions = cellDirections.get(key) ?? new Set<MatchDirection>();
      directions.add(group.direction);
      cellDirections.set(key, directions);
    }
  }

  const creations = new Map<string, SpecialType>();
  for (const [key, directions] of cellDirections.entries()) {
    if (directions.size > 1) creations.set(key, "burst");
  }

  const orderedGroups = [...groups].sort((a, b) => b.cells.length - a.cells.length);
  for (const group of orderedGroups) {
    if (group.cells.length < 4) continue;
    const anchor = chooseCreationAnchor(group, preferred);
    const key = positionKey(anchor);
    if (creations.has(key)) continue;
    if (group.cells.length >= 5) {
      creations.set(key, "nova");
    } else {
      creations.set(key, group.direction === "horizontal" ? "row" : "column");
    }
  }
  return creations;
}

function expandSpecialClear(board: Board, initialKeys: Set<string>) {
  const clearKeys = new Set(initialKeys);
  const queue = [...initialKeys];
  const activated = new Set<string>();

  while (queue.length > 0) {
    const key = queue.shift();
    if (!key || activated.has(key)) continue;
    activated.add(key);
    const { row, column } = parsePositionKey(key);
    const piece = board[row]?.[column];
    if (!piece?.special) continue;

    const extra: Position[] = [];
    if (piece.special === "row") {
      for (let nextColumn = 0; nextColumn < COLUMNS; nextColumn += 1) {
        extra.push({ row, column: nextColumn });
      }
    }
    if (piece.special === "column") {
      for (let nextRow = 0; nextRow < ROWS; nextRow += 1) {
        extra.push({ row: nextRow, column });
      }
    }
    if (piece.special === "burst") {
      for (let nextRow = Math.max(0, row - 1); nextRow <= Math.min(ROWS - 1, row + 1); nextRow += 1) {
        for (
          let nextColumn = Math.max(0, column - 1);
          nextColumn <= Math.min(COLUMNS - 1, column + 1);
          nextColumn += 1
        ) {
          extra.push({ row: nextRow, column: nextColumn });
        }
      }
    }
    if (piece.special === "nova") {
      for (let nextRow = 0; nextRow < ROWS; nextRow += 1) {
        for (let nextColumn = 0; nextColumn < COLUMNS; nextColumn += 1) {
          if (board[nextRow][nextColumn].type === piece.type) {
            extra.push({ row: nextRow, column: nextColumn });
          }
        }
      }
    }

    for (const position of extra) {
      const extraKey = positionKey(position);
      if (!clearKeys.has(extraKey)) {
        clearKeys.add(extraKey);
        queue.push(extraKey);
      }
    }
  }

  return clearKeys;
}

function collapseAndFill(
  board: Board,
  clearKeys: Set<string>,
  creations: Map<string, SpecialType>,
) {
  const mutable: Array<Array<Piece | null>> = board.map((row) =>
    row.map((piece) => ({ ...piece })),
  );

  for (const key of clearKeys) {
    const { row, column } = parsePositionKey(key);
    mutable[row][column] = null;
  }

  for (const [key, special] of creations.entries()) {
    const { row, column } = parsePositionKey(key);
    const source = board[row][column];
    mutable[row][column] = createPiece(source.type, special);
  }

  const next: Board = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLUMNS }, () => createPiece()),
  );

  for (let column = 0; column < COLUMNS; column += 1) {
    const survivors: Piece[] = [];
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      const piece = mutable[row][column];
      if (piece) survivors.push(piece);
    }
    let survivorIndex = 0;
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      next[row][column] = survivors[survivorIndex] ?? createPiece();
      survivorIndex += 1;
    }
  }

  return next;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function calculateStars(score: number, target: number) {
  if (score >= target * 1.8) return 3;
  if (score >= target * 1.3) return 2;
  if (score >= target) return 1;
  return 0;
}

export default function ComePlayersMatchGame({ best, onScore }: ArcadeGameProps) {
  const [levelIndex, setLevelIndex] = useState(0);
  const [board, setBoard] = useState<Board>(() => createBoard());
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(LEVELS[0].moves);
  const [collected, setCollected] = useState<Partial<Record<PieceType, number>>>({});
  const [selected, setSelected] = useState<Position | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<GameStatus>("playing");
  const [explodingKeys, setExplodingKeys] = useState<Set<string>>(new Set());
  const [invalidKeys, setInvalidKeys] = useState<Set<string>>(new Set());
  const [comboLabel, setComboLabel] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hintKeys, setHintKeys] = useState<Set<string>>(new Set());
  const [activeBooster, setActiveBooster] = useState<BoosterId | null>(null);
  const [boosters, setBoosters] = useState<Record<BoosterId, number>>({
    hammer: 2,
    shuffle: 2,
    moves: 1,
  });
  const [coins, setCoins] = useState(0);
  const [highestUnlocked, setHighestUnlocked] = useState(1);

  const boardRef = useRef(board);
  const scoreRef = useRef(score);
  const movesRef = useRef(moves);
  const collectedRef = useRef(collected);
  const hintTimerRef = useRef<number | null>(null);
  const level = LEVELS[levelIndex];

  const setBoardSafe = useCallback((next: Board) => {
    boardRef.current = next;
    setBoard(next);
  }, []);

  const setScoreSafe = useCallback((next: number) => {
    scoreRef.current = next;
    setScore(next);
    onScore(next);
  }, [onScore]);

  const setMovesSafe = useCallback((next: number) => {
    movesRef.current = next;
    setMoves(next);
  }, []);

  const setCollectedSafe = useCallback((next: Partial<Record<PieceType, number>>) => {
    collectedRef.current = next;
    setCollected(next);
  }, []);

  const playTone = useCallback((frequency: number, duration = 0.08, type: OscillatorType = "sine") => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const AudioContextClass = window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.045, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
      oscillator.addEventListener("ended", () => void context.close());
    } catch {
      // Sound is optional in restricted browser webviews.
    }
  }, [soundEnabled]);

  const objectivesCompleted = useCallback((nextScore = scoreRef.current, nextCollected = collectedRef.current) => {
    if (nextScore < level.targetScore) return false;
    return Object.entries(level.objectives).every(([rawType, target]) => {
      const type = Number(rawType) as PieceType;
      return Number(nextCollected[type] || 0) >= Number(target || 0);
    });
  }, [level]);

  const saveProgress = useCallback((nextHighest = highestUnlocked, nextCoins = coins) => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ highestUnlocked: nextHighest, coins: nextCoins }),
      );
      const storedBest = Number(window.localStorage.getItem(BEST_KEY) || 0);
      if (scoreRef.current > storedBest) {
        window.localStorage.setItem(BEST_KEY, String(scoreRef.current));
      }
    } catch {
      // Local storage is a progressive enhancement.
    }
  }, [coins, highestUnlocked]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored) as { highestUnlocked?: number; coins?: number };
        setHighestUnlocked(Math.max(1, Math.min(LEVELS.length, Number(parsed.highestUnlocked || 1))));
        setCoins(Math.max(0, Number(parsed.coins || 0)));
      } catch {
        // Ignore malformed local save data.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const clearHintTimer = useCallback(() => {
    if (hintTimerRef.current) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    setHintKeys(new Set());
  }, []);

  const findHint = useCallback((candidateBoard: Board) => {
    for (let row = 0; row < ROWS; row += 1) {
      for (let column = 0; column < COLUMNS; column += 1) {
        const first = { row, column };
        const candidates = [
          { row, column: column + 1 },
          { row: row + 1, column },
        ];
        for (const second of candidates) {
          if (second.row >= ROWS || second.column >= COLUMNS) continue;
          const swapped = swapPieces(candidateBoard, first, second);
          if (findMatches(swapped).length > 0) return [first, second];
        }
      }
    }
    return null;
  }, []);

  const scheduleHint = useCallback(() => {
    clearHintTimer();
    if (busy || status !== "playing") return;
    hintTimerRef.current = window.setTimeout(() => {
      const hint = findHint(boardRef.current);
      if (hint) setHintKeys(new Set(hint.map(positionKey)));
    }, 4500);
  }, [busy, clearHintTimer, findHint, status]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(scheduleHint);
    return () => {
      window.cancelAnimationFrame(frame);
      clearHintTimer();
    };
  }, [board, clearHintTimer, scheduleHint, status]);

  const startLevel = useCallback((nextIndex: number) => {
    const safeIndex = Math.max(0, Math.min(LEVELS.length - 1, nextIndex));
    const nextLevel = LEVELS[safeIndex];
    const freshBoard = createBoard();
    setLevelIndex(safeIndex);
    setBoardSafe(freshBoard);
    setScoreSafe(0);
    setMovesSafe(nextLevel.moves);
    setCollectedSafe({});
    setSelected(null);
    setBusy(false);
    setStatus("playing");
    setExplodingKeys(new Set());
    setInvalidKeys(new Set());
    setComboLabel(null);
    setActiveBooster(null);
    setBoosters({ hammer: 2, shuffle: 2, moves: 1 });
  }, [setBoardSafe, setCollectedSafe, setMovesSafe, setScoreSafe]);

  const finishTurn = useCallback(() => {
    if (objectivesCompleted()) {
      setStatus("victory");
      const nextUnlocked = Math.max(highestUnlocked, Math.min(LEVELS.length, level.id + 1));
      const nextCoins = coins + level.reward;
      setHighestUnlocked(nextUnlocked);
      setCoins(nextCoins);
      saveProgress(nextUnlocked, nextCoins);
      playTone(880, 0.16, "triangle");
      window.setTimeout(() => playTone(1120, 0.2, "triangle"), 130);
      return;
    }
    if (movesRef.current <= 0) {
      setStatus("defeat");
      saveProgress();
      playTone(150, 0.28, "sawtooth");
    }
  }, [coins, highestUnlocked, level.id, level.reward, objectivesCompleted, playTone, saveProgress]);

  const updateRewardsForClear = useCallback((workingBoard: Board, clearKeys: Set<string>, combo: number) => {
    const nextCollected = { ...collectedRef.current };
    let specialBonus = 0;
    for (const key of clearKeys) {
      const { row, column } = parsePositionKey(key);
      const piece = workingBoard[row][column];
      nextCollected[piece.type] = Number(nextCollected[piece.type] || 0) + 1;
      if (piece.special) specialBonus += 180;
    }
    setCollectedSafe(nextCollected);
    const gained = clearKeys.size * 70 * combo + specialBonus;
    setScoreSafe(scoreRef.current + gained);
  }, [setCollectedSafe, setScoreSafe]);

  const resolveCascades = useCallback(async (
    startingBoard: Board,
    startingGroups: MatchGroup[],
    preferredAnchors: Position[],
  ) => {
    let workingBoard = startingBoard;
    let groups = startingGroups;
    let combo = 1;
    let preferred = preferredAnchors;

    while (groups.length > 0 && combo <= 20) {
      const creations = collectSpecialCreations(groups, preferred);
      const protectedKeys = new Set(creations.keys());
      const initialClear = new Set<string>();
      for (const group of groups) {
        for (const cell of group.cells) {
          const key = positionKey(cell);
          if (!protectedKeys.has(key)) initialClear.add(key);
        }
      }
      const expanded = expandSpecialClear(workingBoard, initialClear);
      for (const key of protectedKeys) expanded.delete(key);

      setComboLabel(combo === 1 ? "MATCH!" : `COMBO ×${combo}`);
      setExplodingKeys(new Set(expanded));
      playTone(420 + combo * 65, 0.08 + combo * 0.008, "triangle");
      await sleep(170);

      updateRewardsForClear(workingBoard, expanded, combo);
      workingBoard = collapseAndFill(workingBoard, expanded, creations);
      setExplodingKeys(new Set());
      setBoardSafe(workingBoard);
      await sleep(230);

      groups = findMatches(workingBoard);
      preferred = [];
      combo += 1;
    }

    setComboLabel(null);
    if (!boardHasPossibleMove(workingBoard)) {
      const shuffled = createBoard();
      setComboLabel("AUTO SHUFFLE");
      setBoardSafe(shuffled);
      await sleep(450);
      setComboLabel(null);
    }
    finishTurn();
  }, [finishTurn, playTone, setBoardSafe, updateRewardsForClear]);

  const resolveDirectClear = useCallback(async (keys: Set<string>, consumeMove: boolean) => {
    setBusy(true);
    clearHintTimer();
    if (consumeMove) setMovesSafe(Math.max(0, movesRef.current - 1));
    const expanded = expandSpecialClear(boardRef.current, keys);
    setExplodingKeys(expanded);
    setComboLabel("POWER CLEAR!");
    playTone(720, 0.12, "square");
    await sleep(190);
    updateRewardsForClear(boardRef.current, expanded, 1);
    const next = collapseAndFill(boardRef.current, expanded, new Map());
    setExplodingKeys(new Set());
    setBoardSafe(next);
    await sleep(220);
    const cascades = findMatches(next);
    if (cascades.length > 0) {
      await resolveCascades(next, cascades, []);
    } else {
      setComboLabel(null);
      finishTurn();
    }
    setBusy(false);
  }, [clearHintTimer, finishTurn, playTone, resolveCascades, setBoardSafe, setMovesSafe, updateRewardsForClear]);

  const attemptSwap = useCallback(async (first: Position, second: Position) => {
    if (busy || status !== "playing") return;
    setBusy(true);
    clearHintTimer();
    setSelected(null);

    const current = boardRef.current;
    const firstPiece = current[first.row][first.column];
    const secondPiece = current[second.row][second.column];
    const swapped = swapPieces(current, first, second);
    setBoardSafe(swapped);
    playTone(310, 0.055, "sine");
    await sleep(130);

    if (firstPiece.special === "nova" || secondPiece.special === "nova") {
      const clearKeys = new Set<string>();
      if (firstPiece.special === "nova" && secondPiece.special === "nova") {
        for (let row = 0; row < ROWS; row += 1) {
          for (let column = 0; column < COLUMNS; column += 1) {
            clearKeys.add(positionKey({ row, column }));
          }
        }
      } else {
        const targetType = firstPiece.special === "nova" ? secondPiece.type : firstPiece.type;
        for (let row = 0; row < ROWS; row += 1) {
          for (let column = 0; column < COLUMNS; column += 1) {
            if (swapped[row][column].type === targetType) {
              clearKeys.add(positionKey({ row, column }));
            }
          }
        }
        clearKeys.add(positionKey(first));
        clearKeys.add(positionKey(second));
      }
      setMovesSafe(Math.max(0, movesRef.current - 1));
      setExplodingKeys(clearKeys);
      setComboLabel("NOVA BLAST!");
      playTone(920, 0.2, "square");
      await sleep(220);
      updateRewardsForClear(swapped, clearKeys, 2);
      const next = collapseAndFill(swapped, clearKeys, new Map());
      setExplodingKeys(new Set());
      setBoardSafe(next);
      await sleep(240);
      const cascades = findMatches(next);
      if (cascades.length > 0) await resolveCascades(next, cascades, []);
      else {
        setComboLabel(null);
        finishTurn();
      }
      setBusy(false);
      return;
    }

    const matches = findMatches(swapped);
    if (matches.length === 0) {
      const invalid = new Set([positionKey(first), positionKey(second)]);
      setInvalidKeys(invalid);
      playTone(145, 0.11, "sawtooth");
      await sleep(190);
      setBoardSafe(current);
      setInvalidKeys(new Set());
      setBusy(false);
      return;
    }

    setMovesSafe(Math.max(0, movesRef.current - 1));
    await resolveCascades(swapped, matches, [second, first]);
    setBusy(false);
  }, [busy, clearHintTimer, finishTurn, playTone, resolveCascades, setBoardSafe, setMovesSafe, status, updateRewardsForClear]);

  const handleShuffle = useCallback(async () => {
    if (busy || status !== "playing" || boosters.shuffle <= 0) return;
    setBusy(true);
    clearHintTimer();
    setBoosters((current) => ({ ...current, shuffle: current.shuffle - 1 }));
    setComboLabel("SHUFFLE!");
    playTone(560, 0.12, "triangle");
    await sleep(180);
    setBoardSafe(createBoard());
    await sleep(300);
    setComboLabel(null);
    setBusy(false);
  }, [boosters.shuffle, busy, clearHintTimer, playTone, setBoardSafe, status]);

  const handleExtraMoves = useCallback(() => {
    if (busy || status !== "playing" || boosters.moves <= 0) return;
    setBoosters((current) => ({ ...current, moves: current.moves - 1 }));
    setMovesSafe(movesRef.current + 5);
    setComboLabel("+5 MOVES");
    playTone(760, 0.14, "triangle");
    window.setTimeout(() => setComboLabel(null), 700);
  }, [boosters.moves, busy, playTone, setMovesSafe, status]);

  const handlePieceClick = useCallback((position: Position) => {
    if (busy || status !== "playing") return;
    clearHintTimer();

    if (activeBooster === "hammer") {
      if (boosters.hammer <= 0) return;
      setBoosters((current) => ({ ...current, hammer: current.hammer - 1 }));
      setActiveBooster(null);
      void resolveDirectClear(new Set([positionKey(position)]), false);
      return;
    }

    if (!selected) {
      setSelected(position);
      playTone(260, 0.04, "sine");
      return;
    }
    if (positionKey(selected) === positionKey(position)) {
      setSelected(null);
      return;
    }
    if (!areAdjacent(selected, position)) {
      setSelected(position);
      playTone(270, 0.04, "sine");
      return;
    }
    void attemptSwap(selected, position);
  }, [activeBooster, attemptSwap, boosters.hammer, busy, clearHintTimer, playTone, resolveDirectClear, selected, status]);

  const currentBest = useMemo(() => {
    let localBest = 0;
    if (typeof window !== "undefined") {
      try {
        localBest = Number(window.localStorage.getItem(BEST_KEY) || 0);
      } catch {
        localBest = 0;
      }
    }
    return Math.max(best, localBest, score);
  }, [best, score]);

  const objectiveEntries = Object.entries(level.objectives).map(([rawType, target]) => ({
    type: Number(rawType) as PieceType,
    target: Number(target),
  }));
  const progressPercent = Math.min(100, Math.round((score / level.targetScore) * 100));
  const stars = calculateStars(score, level.targetScore);

  return (
    <div className={styles.gameShell}>
      <div className={styles.ambientGlow} />
      <header className={styles.topBar}>
        <div className={styles.brandBlock}>
          <span className={styles.brandMark}>CP</span>
          <span>
            <strong>COMEPLAYERS MATCH</strong>
            <small>{level.chapter}</small>
          </span>
        </div>

        <div className={styles.hudCluster}>
          <div className={styles.hudItem}>
            <span>LEVEL</span>
            <strong>{level.id}</strong>
          </div>
          <div className={styles.hudItem}>
            <span>SCORE</span>
            <strong>{score.toLocaleString("id-ID")}</strong>
          </div>
          <div className={`${styles.hudItem} ${moves <= 5 ? styles.dangerHud : ""}`}>
            <span>MOVES</span>
            <strong>{moves}</strong>
          </div>
          <div className={styles.hudItem}>
            <span>COINS</span>
            <strong>{coins.toLocaleString("id-ID")}</strong>
          </div>
        </div>

        <div className={styles.topActions}>
          <button type="button" onClick={() => setSoundEnabled((current) => !current)} aria-label="Toggle sound">
            {soundEnabled ? <FaVolumeHigh /> : <FaVolumeXmark />}
          </button>
          <button
            type="button"
            onClick={() => setStatus((current) => current === "paused" ? "playing" : "paused")}
            aria-label={status === "paused" ? "Resume game" : "Pause game"}
          >
            {status === "paused" ? <FaPlay /> : <FaPause />}
          </button>
          <button type="button" onClick={() => startLevel(levelIndex)} aria-label="Restart level">
            <FaArrowRotateRight />
          </button>
        </div>
      </header>

      <div className={styles.gameLayout}>
        <aside className={styles.missionPanel}>
          <div className={styles.alexiaCard}>
            <div className={styles.alexiaCopy}>
              <span>MISSION BRIEF</span>
              <h2>{level.name}</h2>
              <p>Connect the crystal squad and activate the ComePlayers Core.</p>
            </div>
            <Image
              src="/arcade/comeplayers-match/alexia-host.png"
              alt="Alexia, mascot ComePlayers"
              fill
              sizes="(max-width: 1180px) 235px, 290px"
              priority
            />
            <div className={styles.speechBubble}>
              {moves <= 5 ? "Only a few moves left—build a big combo!" : "Match 3 crystals. A match of 4 or 5 creates a power crystal!"}
            </div>
          </div>

          <div className={styles.objectiveCard}>
            <div className={styles.cardHeading}>
              <span>OBJECTIVES</span>
              <strong>{progressPercent}%</strong>
            </div>
            <div className={styles.progressTrack}>
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <div className={styles.goalList}>
              <div className={styles.scoreGoal}>
                <FaStar />
                <span>Score target</span>
                <strong>{Math.min(score, level.targetScore).toLocaleString("en-US")} / {level.targetScore.toLocaleString("en-US")}</strong>
              </div>
              {objectiveEntries.map(({ type, target }) => (
                <div key={type} className={styles.goalRow}>
                  <span className={`${styles.miniPiece} ${styles[`piece${type}`]}`}>{PIECE_META[type].symbol}</span>
                  <span>{PIECE_META[type].name}</span>
                  <strong>{Math.min(Number(collected[type] || 0), target)} / {target}</strong>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className={styles.boardStage}>
          <div className={styles.levelBanner}>
            <span>LEVEL {level.id}</span>
            <strong>{level.name}</strong>
            <div className={styles.starTrack} aria-label={`${stars} stars earned`}>
              {[0, 1, 2].map((index) => (
                <FaStar key={index} className={index < stars ? styles.starEarned : ""} />
              ))}
            </div>
          </div>

          <div className={styles.boardFrame}>
            <div className={styles.cornerBadge}>CP</div>
            <div className={styles.board} role="grid" aria-label="ComePlayers Match board">
              {board.map((row, rowIndex) =>
                row.map((piece, columnIndex) => {
                  const position = { row: rowIndex, column: columnIndex };
                  const key = positionKey(position);
                  const isSelected = selected && positionKey(selected) === key;
                  const isExploding = explodingKeys.has(key);
                  const isInvalid = invalidKeys.has(key);
                  const isHinted = hintKeys.has(key);
                  return (
                    <button
                      key={piece.id}
                      type="button"
                      role="gridcell"
                      disabled={busy || status !== "playing"}
                      onClick={() => handlePieceClick(position)}
                      className={[
                        styles.cell,
                        isSelected ? styles.selectedCell : "",
                        isExploding ? styles.explodingCell : "",
                        isInvalid ? styles.invalidCell : "",
                        isHinted ? styles.hintCell : "",
                      ].filter(Boolean).join(" ")}
                      aria-label={`${PIECE_META[piece.type].name}${piece.special ? ` ${piece.special} special` : ""}`}
                    >
                      <span
                        className={[
                          styles.piece,
                          styles[`piece${piece.type}`],
                          piece.special ? styles.specialPiece : "",
                          piece.special ? styles[`special${piece.special}`] : "",
                        ].filter(Boolean).join(" ")}
                      >
                        <span className={styles.pieceShine} />
                        <span className={styles.pieceSymbol}>{piece.special === "nova" ? "CP" : PIECE_META[piece.type].symbol}</span>
                        {piece.special === "row" ? <span className={styles.rowStripe} /> : null}
                        {piece.special === "column" ? <span className={styles.columnStripe} /> : null}
                        {piece.special === "burst" ? <FaBomb className={styles.specialIcon} /> : null}
                        {piece.special === "nova" ? <FaWandMagicSparkles className={styles.specialIcon} /> : null}
                      </span>
                    </button>
                  );
                }),
              )}
            </div>
            {comboLabel ? <div className={styles.comboLabel}>{comboLabel}</div> : null}
          </div>

          <div className={styles.mobileObjectives}>
            {objectiveEntries.map(({ type, target }) => (
              <span key={type}>
                <span className={`${styles.miniPiece} ${styles[`piece${type}`]}`}>{PIECE_META[type].symbol}</span>
                <strong>{Math.min(Number(collected[type] || 0), target)}/{target}</strong>
              </span>
            ))}
          </div>
        </main>

        <aside className={styles.boosterPanel}>
          <div className={styles.boosterHeading}>
            <FaGift />
            <span>
              <strong>BOOSTERS</strong>
              <small>Choose a boost when needed</small>
            </span>
          </div>

          <button
            type="button"
            disabled={busy || status !== "playing" || boosters.hammer <= 0}
            onClick={() => setActiveBooster((current) => current === "hammer" ? null : "hammer")}
            className={`${styles.boosterButton} ${activeBooster === "hammer" ? styles.activeBooster : ""}`}
          >
            <span className={styles.boosterIcon}><FaHammer /></span>
            <span><strong>Core Hammer</strong><small>Hancurkan 1 crystal</small></span>
            <b>×{boosters.hammer}</b>
          </button>

          <button
            type="button"
            disabled={busy || status !== "playing" || boosters.shuffle <= 0}
            onClick={() => void handleShuffle()}
            className={styles.boosterButton}
          >
            <span className={styles.boosterIcon}><FaShuffle /></span>
            <span><strong>Squad Shuffle</strong><small>Acak seluruh papan</small></span>
            <b>×{boosters.shuffle}</b>
          </button>

          <button
            type="button"
            disabled={busy || status !== "playing" || boosters.moves <= 0}
            onClick={handleExtraMoves}
            className={styles.boosterButton}
          >
            <span className={styles.boosterIcon}><FaBolt /></span>
            <span><strong>Extra Energy</strong><small>Add 5 moves</small></span>
            <b>×{boosters.moves}</b>
          </button>

          <button
            type="button"
            disabled={busy || status !== "playing"}
            onClick={() => {
              const hint = findHint(boardRef.current);
              if (hint) {
                clearHintTimer();
                setHintKeys(new Set(hint.map(positionKey)));
                window.setTimeout(() => setHintKeys(new Set()), 1800);
              }
            }}
            className={styles.hintButton}
          >
            <FaLightbulb /> Show hint
          </button>

          <div className={styles.bestCard}>
            <span>PERSONAL BEST</span>
            <strong>{currentBest.toLocaleString("id-ID")}</strong>
            <small>Highest unlocked level: {highestUnlocked}/{LEVELS.length}</small>
          </div>
        </aside>
      </div>

      {status !== "playing" ? (
        <div className={styles.overlay}>
          <div className={styles.resultCard}>
            {status === "paused" ? (
              <>
                <FaPause className={styles.resultIcon} />
                <span>GAME PAUSED</span>
                <h2>Istirahat sebentar?</h2>
                <p>This level&apos;s progress stays safe as long as the game window remains open.</p>
                <button type="button" onClick={() => setStatus("playing")}><FaPlay /> Continue</button>
              </>
            ) : status === "victory" ? (
              <>
                <FaStar className={styles.resultIcon} />
                <span>MISSION COMPLETE</span>
                <h2>{level.name} complete!</h2>
                <div className={styles.resultStars}>
                  {[0, 1, 2].map((index) => <FaStar key={index} className={index < stars ? styles.starEarned : ""} />)}
                </div>
                <p>Score {score.toLocaleString("en-US")} • Reward {level.reward.toLocaleString("en-US")} CP Coins</p>
                <div className={styles.resultActions}>
                  <button type="button" onClick={() => startLevel(levelIndex)}><FaArrowRotateRight /> Main lagi</button>
                  {levelIndex < LEVELS.length - 1 ? (
                    <button type="button" onClick={() => startLevel(levelIndex + 1)}><FaPlay /> Next level</button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <FaHeart className={styles.resultIcon} />
                <span>OUT OF MOVES</span>
                <h2>Crystal Core is not active yet</h2>
                <p>You reached {score.toLocaleString("en-US")} of the {level.targetScore.toLocaleString("en-US")} target.</p>
                <button type="button" onClick={() => startLevel(levelIndex)}><FaArrowRotateRight /> Try again</button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
