"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaArrowsRotate,
  FaBolt,
  FaChessKing,
  FaComputer,
  FaCrown,
  FaDoorOpen,
  FaGlobe,
  FaMagnifyingGlass,
  FaPlay,
  FaPlus,
  FaRotateRight,
  FaShieldHalved,
  FaUserGroup,
  FaUsersViewfinder,
  FaWifi,
} from "react-icons/fa6";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { ArcadeGameProps } from "@/components/arcade/ArcadeGameTypes";

type Color = "w" | "b";
type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
type Piece = `${Color}${PieceType}`;
type Square = Piece | null;
type ChessResult = "playing" | "checkmate" | "stalemate" | "draw";
type Difficulty = "rookie" | "tactical" | "commander";
type ChessMode = "npc" | "online" | null;
type RoomKind = "public" | "matchmaking";

type CastlingRights = {
  wK: boolean;
  wQ: boolean;
  bK: boolean;
  bQ: boolean;
};

type ChessMove = {
  from: number;
  to: number;
  promotion?: PieceType;
  captured?: Piece;
  enPassant?: boolean;
  castle?: "king" | "queen";
};

type ChessState = {
  board: Square[];
  turn: Color;
  castling: CastlingRights;
  enPassant: number | null;
  halfmove: number;
  moveNumber: number;
  result: ChessResult;
  winner: Color | null;
  lastMove: { from: number; to: number } | null;
};

type ChessRoomRow = {
  id: string;
  room_code: string;
  room_name: string;
  room_kind: RoomKind;
  white_player_id: string;
  white_player_name: string;
  black_player_id: string | null;
  black_player_name: string | null;
  game_state: ChessState;
  status: "waiting" | "active" | "finished" | "abandoned";
  winner_color: Color | null;
  version: number;
  created_at: string;
  updated_at: string;
};

type PendingPromotion = {
  moves: ChessMove[];
};

const PIECE_SYMBOL: Record<PieceType, string> = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
};

const PIECE_VALUE: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20_000,
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function pieceColor(piece: Square): Color | null {
  return piece ? (piece[0] as Color) : null;
}

function pieceType(piece: Piece): PieceType {
  return piece[1] as PieceType;
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

function rowOf(square: number) {
  return Math.floor(square / 8);
}

function colOf(square: number) {
  return square % 8;
}

function inside(row: number, col: number) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function squareAt(row: number, col: number) {
  return row * 8 + col;
}

function squareName(square: number) {
  return `${FILES[colOf(square)]}${8 - rowOf(square)}`;
}

function createInitialBoard(): Square[] {
  const backRank: PieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const board: Square[] = Array.from({ length: 64 }, () => null);
  backRank.forEach((type, col) => {
    board[col] = `b${type}`;
    board[8 + col] = "bp";
    board[48 + col] = "wp";
    board[56 + col] = `w${type}`;
  });
  return board;
}

function createInitialState(): ChessState {
  return {
    board: createInitialBoard(),
    turn: "w",
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfmove: 0,
    moveNumber: 1,
    result: "playing",
    winner: null,
    lastMove: null,
  };
}

function normalizeState(value: unknown): ChessState {
  const fallback = createInitialState();
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<ChessState>;
  if (!Array.isArray(raw.board) || raw.board.length !== 64) return fallback;
  const board = raw.board.map((entry) => {
    if (entry === null) return null;
    if (typeof entry !== "string" || !/^[wb][pnbrqk]$/.test(entry)) return null;
    return entry as Piece;
  });
  return {
    board,
    turn: raw.turn === "b" ? "b" : "w",
    castling: {
      wK: Boolean(raw.castling?.wK),
      wQ: Boolean(raw.castling?.wQ),
      bK: Boolean(raw.castling?.bK),
      bQ: Boolean(raw.castling?.bQ),
    },
    enPassant:
      typeof raw.enPassant === "number" && raw.enPassant >= 0 && raw.enPassant < 64
        ? raw.enPassant
        : null,
    halfmove: typeof raw.halfmove === "number" ? raw.halfmove : 0,
    moveNumber: typeof raw.moveNumber === "number" ? raw.moveNumber : 1,
    result:
      raw.result === "checkmate" || raw.result === "stalemate" || raw.result === "draw"
        ? raw.result
        : "playing",
    winner: raw.winner === "w" || raw.winner === "b" ? raw.winner : null,
    lastMove:
      raw.lastMove &&
      typeof raw.lastMove.from === "number" &&
      typeof raw.lastMove.to === "number"
        ? { from: raw.lastMove.from, to: raw.lastMove.to }
        : null,
  };
}

function isSquareAttacked(state: ChessState, target: number, byColor: Color): boolean {
  const targetRow = rowOf(target);
  const targetCol = colOf(target);
  const pawnSourceRow = targetRow + (byColor === "w" ? 1 : -1);
  for (const dc of [-1, 1]) {
    const sourceCol = targetCol + dc;
    if (inside(pawnSourceRow, sourceCol)) {
      if (state.board[squareAt(pawnSourceRow, sourceCol)] === `${byColor}p`) return true;
    }
  }

  const knightSteps = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];
  for (const [dr, dc] of knightSteps) {
    const row = targetRow + dr;
    const col = targetCol + dc;
    if (inside(row, col) && state.board[squareAt(row, col)] === `${byColor}n`) return true;
  }

  const lines: Array<{ steps: number[][]; attackers: PieceType[] }> = [
    {
      steps: [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ],
      attackers: ["r", "q"],
    },
    {
      steps: [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ],
      attackers: ["b", "q"],
    },
  ];
  for (const line of lines) {
    for (const [dr, dc] of line.steps) {
      let row = targetRow + dr;
      let col = targetCol + dc;
      while (inside(row, col)) {
        const piece = state.board[squareAt(row, col)];
        if (piece) {
          if (pieceColor(piece) === byColor && line.attackers.includes(pieceType(piece))) return true;
          break;
        }
        row += dr;
        col += dc;
      }
    }
  }

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const row = targetRow + dr;
      const col = targetCol + dc;
      if (inside(row, col) && state.board[squareAt(row, col)] === `${byColor}k`) return true;
    }
  }
  return false;
}

function kingSquare(state: ChessState, color: Color) {
  return state.board.findIndex((piece) => piece === `${color}k`);
}

function isInCheck(state: ChessState, color: Color) {
  const king = kingSquare(state, color);
  return king >= 0 && isSquareAttacked(state, king, opposite(color));
}

function pushPawnMove(
  moves: ChessMove[],
  from: number,
  to: number,
  captured: Piece | undefined,
  promotionRow: number,
) {
  if (rowOf(to) === promotionRow) {
    (["q", "r", "b", "n"] as PieceType[]).forEach((promotion) => {
      moves.push({ from, to, captured, promotion });
    });
  } else {
    moves.push({ from, to, captured });
  }
}

function pseudoMovesForSquare(state: ChessState, from: number): ChessMove[] {
  const piece = state.board[from];
  if (!piece) return [];
  const color = pieceColor(piece) as Color;
  const type = pieceType(piece);
  const row = rowOf(from);
  const col = colOf(from);
  const moves: ChessMove[] = [];

  if (type === "p") {
    const direction = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;
    const promotionRow = color === "w" ? 0 : 7;
    const oneRow = row + direction;
    if (inside(oneRow, col) && !state.board[squareAt(oneRow, col)]) {
      pushPawnMove(moves, from, squareAt(oneRow, col), undefined, promotionRow);
      const twoRow = row + direction * 2;
      if (row === startRow && !state.board[squareAt(twoRow, col)]) {
        moves.push({ from, to: squareAt(twoRow, col) });
      }
    }
    for (const dc of [-1, 1]) {
      const captureRow = row + direction;
      const captureCol = col + dc;
      if (!inside(captureRow, captureCol)) continue;
      const to = squareAt(captureRow, captureCol);
      const target = state.board[to];
      if (target && pieceColor(target) !== color) {
        pushPawnMove(moves, from, to, target, promotionRow);
      } else if (state.enPassant === to) {
        moves.push({ from, to, captured: `${opposite(color)}p`, enPassant: true });
      }
    }
    return moves;
  }

  if (type === "n") {
    const steps = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];
    for (const [dr, dc] of steps) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (!inside(nextRow, nextCol)) continue;
      const to = squareAt(nextRow, nextCol);
      const target = state.board[to];
      if (!target || pieceColor(target) !== color) moves.push({ from, to, captured: target || undefined });
    }
    return moves;
  }

  if (type === "b" || type === "r" || type === "q") {
    const steps: number[][] = [];
    if (type === "b" || type === "q") steps.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    if (type === "r" || type === "q") steps.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    for (const [dr, dc] of steps) {
      let nextRow = row + dr;
      let nextCol = col + dc;
      while (inside(nextRow, nextCol)) {
        const to = squareAt(nextRow, nextCol);
        const target = state.board[to];
        if (!target) {
          moves.push({ from, to });
        } else {
          if (pieceColor(target) !== color) moves.push({ from, to, captured: target });
          break;
        }
        nextRow += dr;
        nextCol += dc;
      }
    }
    return moves;
  }

  if (type === "k") {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const nextRow = row + dr;
        const nextCol = col + dc;
        if (!inside(nextRow, nextCol)) continue;
        const to = squareAt(nextRow, nextCol);
        const target = state.board[to];
        if (!target || pieceColor(target) !== color) moves.push({ from, to, captured: target || undefined });
      }
    }

    const homeRow = color === "w" ? 7 : 0;
    const enemy = opposite(color);
    if (row === homeRow && col === 4 && !isInCheck(state, color)) {
      const kingRight = color === "w" ? state.castling.wK : state.castling.bK;
      const queenRight = color === "w" ? state.castling.wQ : state.castling.bQ;
      if (
        kingRight &&
        state.board[squareAt(homeRow, 7)] === `${color}r` &&
        !state.board[squareAt(homeRow, 5)] &&
        !state.board[squareAt(homeRow, 6)] &&
        !isSquareAttacked(state, squareAt(homeRow, 5), enemy) &&
        !isSquareAttacked(state, squareAt(homeRow, 6), enemy)
      ) {
        moves.push({ from, to: squareAt(homeRow, 6), castle: "king" });
      }
      if (
        queenRight &&
        state.board[squareAt(homeRow, 0)] === `${color}r` &&
        !state.board[squareAt(homeRow, 1)] &&
        !state.board[squareAt(homeRow, 2)] &&
        !state.board[squareAt(homeRow, 3)] &&
        !isSquareAttacked(state, squareAt(homeRow, 3), enemy) &&
        !isSquareAttacked(state, squareAt(homeRow, 2), enemy)
      ) {
        moves.push({ from, to: squareAt(homeRow, 2), castle: "queen" });
      }
    }
  }

  return moves;
}

function applyMoveRaw(state: ChessState, move: ChessMove): ChessState {
  const board = [...state.board];
  const movingPiece = board[move.from];
  if (!movingPiece) return state;
  const color = pieceColor(movingPiece) as Color;
  const type = pieceType(movingPiece);
  const target = board[move.to];
  board[move.from] = null;

  if (move.enPassant) {
    const capturedSquare = move.to + (color === "w" ? 8 : -8);
    board[capturedSquare] = null;
  }

  if (move.castle) {
    const homeRow = color === "w" ? 7 : 0;
    const rookFrom = squareAt(homeRow, move.castle === "king" ? 7 : 0);
    const rookTo = squareAt(homeRow, move.castle === "king" ? 5 : 3);
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }

  board[move.to] = move.promotion ? `${color}${move.promotion}` : movingPiece;

  const castling = { ...state.castling };
  if (type === "k") {
    if (color === "w") {
      castling.wK = false;
      castling.wQ = false;
    } else {
      castling.bK = false;
      castling.bQ = false;
    }
  }
  if (move.from === 63 || move.to === 63) castling.wK = false;
  if (move.from === 56 || move.to === 56) castling.wQ = false;
  if (move.from === 7 || move.to === 7) castling.bK = false;
  if (move.from === 0 || move.to === 0) castling.bQ = false;

  const movedTwo = type === "p" && Math.abs(rowOf(move.from) - rowOf(move.to)) === 2;
  const enPassant = movedTwo ? (move.from + move.to) / 2 : null;
  const halfmove = type === "p" || target || move.enPassant ? 0 : state.halfmove + 1;

  return {
    ...state,
    board,
    turn: opposite(state.turn),
    castling,
    enPassant,
    halfmove,
    moveNumber: state.moveNumber + (color === "b" ? 1 : 0),
    lastMove: { from: move.from, to: move.to },
  };
}

function legalMoves(state: ChessState, color: Color = state.turn): ChessMove[] {
  if (state.result !== "playing") return [];
  const moves: ChessMove[] = [];
  state.board.forEach((piece, from) => {
    if (!piece || pieceColor(piece) !== color) return;
    pseudoMovesForSquare(state, from).forEach((move) => {
      const next = applyMoveRaw({ ...state, turn: color }, move);
      if (!isInCheck(next, color)) moves.push(move);
    });
  });
  return moves;
}

function completeMove(state: ChessState, move: ChessMove): ChessState {
  const next = applyMoveRaw(state, move);
  const opponentMoves = legalMoves(next, next.turn);
  if (opponentMoves.length === 0) {
    if (isInCheck(next, next.turn)) {
      return { ...next, result: "checkmate", winner: opposite(next.turn) };
    }
    return { ...next, result: "stalemate", winner: null };
  }
  if (next.halfmove >= 100) return { ...next, result: "draw", winner: null };
  return next;
}

function moveText(move: ChessMove) {
  const suffix = move.promotion ? `=${move.promotion.toUpperCase()}` : "";
  return `${squareName(move.from)} → ${squareName(move.to)}${suffix}`;
}

function evaluate(state: ChessState): number {
  if (state.result === "checkmate") return state.winner === "b" ? 1_000_000 : -1_000_000;
  if (state.result !== "playing") return 0;
  let score = 0;
  state.board.forEach((piece, square) => {
    if (!piece) return;
    const color = pieceColor(piece) as Color;
    const type = pieceType(piece);
    const row = rowOf(square);
    const col = colOf(square);
    const centerDistance = Math.abs(3.5 - row) + Math.abs(3.5 - col);
    const positional = Math.max(0, 7 - centerDistance) * (type === "p" || type === "n" ? 3 : 1);
    const value = PIECE_VALUE[type] + positional;
    score += color === "b" ? value : -value;
  });
  if (isInCheck(state, "w")) score += 28;
  if (isInCheck(state, "b")) score -= 28;
  return score;
}

function minimax(state: ChessState, depth: number, alpha: number, beta: number): number {
  if (depth <= 0 || state.result !== "playing") return evaluate(state);
  const moves = legalMoves(state);
  if (moves.length === 0) return evaluate(state);
  const ordered = [...moves].sort(
    (a, b) => (b.captured ? PIECE_VALUE[pieceType(b.captured)] : 0) - (a.captured ? PIECE_VALUE[pieceType(a.captured)] : 0),
  );

  if (state.turn === "b") {
    let best = -Infinity;
    for (const move of ordered) {
      best = Math.max(best, minimax(completeMove(state, move), depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of ordered) {
    best = Math.min(best, minimax(completeMove(state, move), depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function chooseNpcMove(state: ChessState, difficulty: Difficulty): ChessMove | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  const depth = difficulty === "rookie" ? 1 : difficulty === "tactical" ? 2 : 3;
  const scored = moves.map((move) => ({
    move,
    score: minimax(completeMove(state, move), depth - 1, -Infinity, Infinity),
  }));
  scored.sort((a, b) => b.score - a.score);
  const poolSize = difficulty === "rookie" ? Math.min(5, scored.length) : difficulty === "tactical" ? Math.min(2, scored.length) : 1;
  return scored[Math.floor(Math.random() * poolSize)]?.move || scored[0].move;
}

function resultLabel(state: ChessState) {
  if (state.result === "checkmate") return state.winner === "w" ? "CP Gold wins" : "Cyber Cyan wins";
  if (state.result === "stalemate") return "Stalemate";
  if (state.result === "draw") return "Draw";
  if (isInCheck(state, state.turn)) return `${state.turn === "w" ? "CP Gold" : "Cyber Cyan"} is in check`;
  return state.turn === "w" ? "CP Gold to move" : "Cyber Cyan to move";
}

function ChessScoreHeader({ best, state, mode }: { best: number; state: ChessState; mode: ChessMode }) {
  const score = state.result === "checkmate" ? 2000 : 0;
  return (
    <div className="mb-3 grid grid-cols-3 gap-2 text-center text-[10px] font-black uppercase tracking-wider sm:text-xs">
      <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2 text-slate-400 sm:px-3">
        Mode
        <span className="mt-1 block truncate text-sm text-white sm:text-base">
          {mode === "online" ? "Online" : mode === "npc" ? "NPC" : "Ready"}
        </span>
      </div>
      <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/10 px-2 py-2 text-yellow-300 sm:px-3">
        Best CP
        <span className="mt-1 block text-sm text-yellow-100 sm:text-base">{Math.max(best, score).toLocaleString("id-ID")}</span>
      </div>
      <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2 text-slate-400 sm:px-3">
        Status
        <span className="mt-1 block truncate text-sm text-cyan-200 sm:text-base">{state.result === "playing" ? "Live" : "Finished"}</span>
      </div>
    </div>
  );
}

function ModeButton({
  icon,
  title,
  subtitle,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/45 hover:bg-cyan-300/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-xl text-cyan-200 transition group-hover:border-yellow-300/40 group-hover:bg-yellow-300/10 group-hover:text-yellow-200">
        {icon}
      </span>
      <span className="mt-4 block text-lg font-black text-white">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-slate-500">{subtitle}</span>
    </button>
  );
}

function normalizeRoomRow(value: ChessRoomRow): ChessRoomRow {
  return {
    ...value,
    room_name: value.room_name || "ComePlayers Chess Room",
    room_kind: value.room_kind === "matchmaking" ? "matchmaking" : "public",
    white_player_name: value.white_player_name || "ComePlayers Player",
    black_player_name: value.black_player_name || null,
    game_state: normalizeState(value.game_state),
  };
}

function formatRoomAge(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 20) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export default function ComePlayersChessGame({ best, onScore }: ArcadeGameProps) {
  const [mode, setMode] = useState<ChessMode>(null);
  const [state, setState] = useState<ChessState>(() => createInitialState());
  const [difficulty, setDifficulty] = useState<Difficulty>("tactical");
  const [selected, setSelected] = useState<number | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [message, setMessage] = useState("Choose a battle mode.");
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [room, setRoom] = useState<ChessRoomRow | null>(null);
  const [roomName, setRoomName] = useState("ComePlayers Battle Room");
  const [publicRooms, setPublicRooms] = useState<ChessRoomRow[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const scoredResultRef = useRef<string | null>(null);

  const playerColor: Color = mode === "online" && room?.black_player_id === userId ? "b" : "w";
  const onlineReady = mode !== "online" || room?.status === "active";
  const canHumanMove =
    state.result === "playing" &&
    onlineReady &&
    !aiThinking &&
    ((mode === "npc" && state.turn === "w") || (mode === "online" && state.turn === playerColor));

  const currentLegalMoves = useMemo(() => legalMoves(state), [state]);
  const selectedMoves = useMemo(
    () => (selected === null ? [] : currentLegalMoves.filter((move) => move.from === selected)),
    [currentLegalMoves, selected],
  );

  const loadPublicRooms = useCallback(
    async (silent = false) => {
      if (!userId) {
        setPublicRooms([]);
        return;
      }
      if (!silent) setRoomsLoading(true);
      const supabase = getSupabaseBrowserClient();
      const cutoff = new Date(Date.now() - 120_000).toISOString();
      const { data, error } = await supabase
        .from("arcade_chess_rooms")
        .select(
          "id,room_code,room_name,room_kind,white_player_id,white_player_name,black_player_id,black_player_name,game_state,status,winner_color,version,created_at,updated_at",
        )
        .eq("status", "waiting")
        .eq("room_kind", "public")
        .gte("updated_at", cutoff)
        .order("updated_at", { ascending: false })
        .limit(24);

      if (error) {
        if (!silent) {
          setOnlineError(
            error.message.includes("room_kind") || error.message.includes("room_name")
              ? "Install the V42 chess lobby migration in Supabase first."
              : error.message,
          );
        }
      } else {
        setPublicRooms((data || []).map((entry: unknown) => normalizeRoomRow(entry as ChessRoomRow)));
      }
      if (!silent) setRoomsLoading(false);
    },
    [userId],
  );

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(
      ({ data }: { data: { user: { id: string } | null } }) => {
        if (!active) return;
        setUserId(data.user?.id || null);
        setAuthChecked(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== null || !userId) return;
    const supabase = getSupabaseBrowserClient();
    void loadPublicRooms();
    const channel = supabase
      .channel("comeplayers-chess-public-lobby")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "arcade_chess_rooms",
        },
        () => {
          void loadPublicRooms(true);
        },
      )
      .subscribe();
    const interval = window.setInterval(() => void loadPublicRooms(true), 8_000);
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [loadPublicRooms, mode, userId]);

  useEffect(() => {
    if (mode !== "online" || !room?.id) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`comeplayers-chess-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "arcade_chess_rooms",
          filter: `id=eq.${room.id}`,
        },
        (payload: { new: unknown }) => {
          const nextRoom = normalizeRoomRow(payload.new as ChessRoomRow);
          setRoom(nextRoom);
          setState(nextRoom.game_state);
          setSelected(null);
          setPendingPromotion(null);
          setOnlineBusy(false);
          if (nextRoom.status === "active") {
            setMessage(resultLabel(nextRoom.game_state));
          } else if (nextRoom.status === "waiting") {
            setMessage(
              nextRoom.room_kind === "matchmaking"
                ? "Searching all ComePlayers users currently looking for a chess rival…"
                : `“${nextRoom.room_name}” is visible in the public room list.`,
            );
          } else if (nextRoom.status === "abandoned") {
            setMessage("This room is no longer available.");
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [mode, room?.id]);

  useEffect(() => {
    if (
      mode !== "online" ||
      !room?.id ||
      room.status !== "waiting" ||
      room.white_player_id !== userId
    ) {
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const touch = () => {
      void supabase.rpc("arcade_chess_touch_room", { p_room_id: room.id });
    };
    touch();
    const interval = window.setInterval(touch, 25_000);
    return () => window.clearInterval(interval);
  }, [mode, room?.id, room?.status, room?.white_player_id, userId]);

  useEffect(() => {
    if (mode !== "npc" || state.turn !== "b" || state.result !== "playing") return;
    setAiThinking(true);
    setMessage("Alexia NPC is calculating a tactical move…");
    const timer = window.setTimeout(() => {
      const move = chooseNpcMove(state, difficulty);
      if (!move) {
        setAiThinking(false);
        return;
      }
      const next = completeMove(state, move);
      setState(next);
      setSelected(null);
      setMessage(`Alexia NPC played ${moveText(move)}. ${resultLabel(next)}`);
      setAiThinking(false);
    }, difficulty === "commander" ? 520 : 380);
    return () => window.clearTimeout(timer);
  }, [difficulty, mode, state]);

  useEffect(() => {
    if (state.result === "playing") return;
    const key = `${mode}-${room?.id || "local"}-${state.moveNumber}-${state.result}-${state.winner || "draw"}`;
    if (scoredResultRef.current === key) return;
    scoredResultRef.current = key;
    const humanWon =
      state.result === "checkmate" &&
      ((mode === "npc" && state.winner === "w") ||
        (mode === "online" && state.winner === playerColor));
    if (humanWon) {
      onScore(
        mode === "online"
          ? 2200
          : difficulty === "commander"
            ? 1900
            : difficulty === "tactical"
              ? 1500
              : 1100,
      );
    }
  }, [difficulty, mode, onScore, playerColor, room?.id, state]);

  const resetLocal = useCallback(
    (nextMode: ChessMode = mode) => {
      setState(createInitialState());
      setSelected(null);
      setPendingPromotion(null);
      setAiThinking(false);
      setMessage(nextMode === "npc" ? "You are CP Gold. Make the opening move." : "Choose a battle mode.");
      scoredResultRef.current = null;
    },
    [mode],
  );

  function startNpc() {
    setMode("npc");
    setRoom(null);
    setOnlineError("");
    resetLocal("npc");
  }

  async function createPublicRoom() {
    if (!userId) {
      setOnlineError("Sign in to ComePlayers before creating an online chess room.");
      return;
    }
    const cleanName = roomName.trim().replace(/\s+/g, " ");
    if (cleanName.length < 3 || cleanName.length > 48) {
      setOnlineError("Room name must contain 3 to 48 characters.");
      return;
    }
    setOnlineBusy(true);
    setOnlineError("");
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("arcade_chess_create_named_room", {
      p_room_name: cleanName,
      p_game_state: createInitialState(),
    });
    if (error || !Array.isArray(data) || !data[0]) {
      setOnlineError(
        error?.message.includes("arcade_chess_create_named_room")
          ? "Install the V42 chess lobby migration in Supabase first."
          : error?.message || "The room could not be created.",
      );
      setOnlineBusy(false);
      return;
    }
    const nextRoom = normalizeRoomRow(data[0] as ChessRoomRow);
    setMode("online");
    setRoom(nextRoom);
    setState(nextRoom.game_state);
    setSelected(null);
    setMessage(`“${nextRoom.room_name}” is now visible to all signed-in ComePlayers users.`);
    setOnlineBusy(false);
  }

  async function joinPublicRoom(roomId: string) {
    if (!userId) {
      setOnlineError("Sign in to ComePlayers before joining an online chess room.");
      return;
    }
    setOnlineBusy(true);
    setOnlineError("");
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("arcade_chess_join_room_by_id", {
      p_room_id: roomId,
    });
    if (error || !Array.isArray(data) || !data[0]) {
      setOnlineError(error?.message || "The room is no longer available.");
      setOnlineBusy(false);
      void loadPublicRooms(true);
      return;
    }
    const nextRoom = normalizeRoomRow(data[0] as ChessRoomRow);
    setMode("online");
    setRoom(nextRoom);
    setState(nextRoom.game_state);
    setSelected(null);
    setMessage(
      nextRoom.status === "waiting"
        ? `Waiting inside “${nextRoom.room_name}”.`
        : resultLabel(nextRoom.game_state),
    );
    setOnlineBusy(false);
  }

  async function startMatchmaking() {
    if (!userId) {
      setOnlineError("Sign in to ComePlayers before using global matchmaking.");
      return;
    }
    setOnlineBusy(true);
    setOnlineError("");
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("arcade_chess_matchmake", {
      p_game_state: createInitialState(),
    });
    if (error || !Array.isArray(data) || !data[0]) {
      setOnlineError(
        error?.message.includes("arcade_chess_matchmake")
          ? "Install the V42 chess lobby migration in Supabase first."
          : error?.message || "Matchmaking could not be started.",
      );
      setOnlineBusy(false);
      return;
    }
    const nextRoom = normalizeRoomRow(data[0] as ChessRoomRow);
    setMode("online");
    setRoom(nextRoom);
    setState(nextRoom.game_state);
    setSelected(null);
    setMessage(
      nextRoom.status === "active"
        ? `Rival found: ${nextRoom.white_player_id === userId ? nextRoom.black_player_name : nextRoom.white_player_name}.`
        : "Searching all ComePlayers users currently looking for a chess rival…",
    );
    setOnlineBusy(false);
  }

  async function submitOnlineMove(move: ChessMove, next: ChessState) {
    if (!room) return;
    setOnlineBusy(true);
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("arcade_chess_submit_state", {
      p_room_id: room.id,
      p_expected_version: room.version,
      p_game_state: next,
      p_last_move: { from: move.from, to: move.to, notation: moveText(move) },
    });
    if (error || !Array.isArray(data) || !data[0]) {
      setOnlineError(error?.message || "The move could not be synchronized.");
      setOnlineBusy(false);
      return;
    }
    const nextRoom = normalizeRoomRow(data[0] as ChessRoomRow);
    setRoom(nextRoom);
    setState(nextRoom.game_state);
    setMessage(resultLabel(nextRoom.game_state));
    setOnlineBusy(false);
  }

  function performMove(move: ChessMove) {
    const next = completeMove(state, move);
    setSelected(null);
    setPendingPromotion(null);
    if (mode === "online") {
      void submitOnlineMove(move, next);
      return;
    }
    setState(next);
    setMessage(`You played ${moveText(move)}. ${resultLabel(next)}`);
  }

  function chooseMoveTo(to: number) {
    const candidates = selectedMoves.filter((move) => move.to === to);
    if (candidates.length === 0) return false;
    if (candidates.length > 1 && candidates.some((move) => move.promotion)) {
      setPendingPromotion({ moves: candidates });
      return true;
    }
    performMove(candidates[0]);
    return true;
  }

  function clickSquare(square: number) {
    if (!canHumanMove || onlineBusy || state.result !== "playing") return;
    if (selected !== null && chooseMoveTo(square)) return;
    const piece = state.board[square];
    if (piece && pieceColor(piece) === state.turn) {
      setSelected(square);
      setMessage(`${squareName(square)} selected.`);
    } else {
      setSelected(null);
    }
  }

  function exitGame() {
    const leavingRoom = room;
    if (
      leavingRoom?.status === "waiting" &&
      leavingRoom.white_player_id === userId
    ) {
      const supabase = getSupabaseBrowserClient();
      void supabase.rpc("arcade_chess_cancel_room", { p_room_id: leavingRoom.id });
    }
    setMode(null);
    setRoom(null);
    setOnlineError("");
    resetLocal(null);
    window.setTimeout(() => void loadPublicRooms(true), 250);
  }

  const displaySquares = useMemo(() => {
    const squares = Array.from({ length: 64 }, (_, index) => index);
    return playerColor === "b" ? squares.reverse() : squares;
  }, [playerColor]);

  return (
    <div>
      <ChessScoreHeader best={best} state={state} mode={mode} />
      <div className="overflow-hidden rounded-3xl border border-cyan-400/25 bg-[radial-gradient(circle_at_18%_12%,rgba(250,204,21,0.13),transparent_28%),radial-gradient(circle_at_84%_18%,rgba(34,211,238,0.15),transparent_31%),#030b14] shadow-[0_25px_75px_rgba(0,0,0,0.45)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-yellow-300/30 bg-yellow-300/10 text-xl text-yellow-200">
              <FaChessKing />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">ComePlayers Tactical Arena</p>
              <p className="text-base font-black text-white">CP Chess</p>
            </div>
          </div>
          {mode ? (
            <button
              type="button"
              onClick={exitGame}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-100"
            >
              Change mode
            </button>
          ) : null}
        </div>

        {!mode ? (
          <div className="p-4 sm:p-6">
            <div className="mx-auto max-w-4xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-yellow-300/25 bg-yellow-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-yellow-200">
                <FaBolt /> Gold vs Cyber
              </span>
              <h3 className="mt-4 text-2xl font-black text-white sm:text-3xl">Choose your ComePlayers chess battle</h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Play Alexia offline, enter a named public room, or find a rival through global ComePlayers matchmaking.
              </p>
            </div>

            <div className="mx-auto mt-6 grid max-w-4xl gap-3 sm:grid-cols-2">
              <ModeButton
                icon={<FaComputer />}
                title="Play Alexia NPC"
                subtitle="Offline match with Rookie, Tactical, and Commander difficulty."
                onClick={startNpc}
              />
              <ModeButton
                icon={<FaUsersViewfinder />}
                title={onlineBusy ? "Searching…" : "Global Matchmaking"}
                subtitle="Find another signed-in ComePlayers user looking for a chess match."
                onClick={() => void startMatchmaking()}
                disabled={!authChecked || onlineBusy}
              />
            </div>

            <div className="mx-auto mt-4 max-w-4xl rounded-2xl border border-yellow-300/20 bg-yellow-300/[0.045] p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-300/10 text-yellow-200">
                  <FaPlus />
                </span>
                <div>
                  <p className="font-black text-white">Create a public room</p>
                  <p className="text-xs text-slate-500">Give the room a name. Other users can join it directly from the list below.</p>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value.slice(0, 48))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void createPublicRoom();
                  }}
                  placeholder="ROOM NAME"
                  className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 text-sm font-black text-white outline-none transition placeholder:text-slate-700 focus:border-yellow-300/50"
                />
                <button
                  type="button"
                  onClick={() => void createPublicRoom()}
                  disabled={!authChecked || onlineBusy}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-yellow-300 px-5 text-sm font-black text-black transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <FaDoorOpen /> Create Room
                </button>
              </div>
            </div>

            <div className="mx-auto mt-4 max-w-4xl overflow-hidden rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.035]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200">
                    <FaGlobe />
                  </span>
                  <div>
                    <p className="font-black text-white">Open public rooms</p>
                    <p className="text-[11px] text-slate-500">Live rooms available to every signed-in ComePlayers user.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadPublicRooms()}
                  disabled={roomsLoading || !userId}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100 disabled:opacity-45"
                >
                  <FaArrowsRotate className={roomsLoading ? "animate-spin" : ""} /> Refresh
                </button>
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto p-3">
                {!userId && authChecked ? (
                  <div className="rounded-xl border border-yellow-300/20 bg-yellow-300/5 p-4 text-center text-xs font-bold text-yellow-100">
                    Sign in to browse rooms and use online matchmaking. Alexia NPC remains available offline.
                  </div>
                ) : roomsLoading && publicRooms.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">Loading ComePlayers rooms…</div>
                ) : publicRooms.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
                    <FaMagnifyingGlass className="mx-auto text-xl text-slate-600" />
                    <p className="mt-2 text-sm font-black text-slate-300">No public rooms are open</p>
                    <p className="mt-1 text-xs text-slate-600">Create the first room or use global matchmaking.</p>
                  </div>
                ) : (
                  publicRooms.map((entry) => {
                    const ownRoom = entry.white_player_id === userId;
                    return (
                      <div
                        key={entry.id}
                        className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/25 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.7)]" />
                            <p className="truncate font-black text-white">{entry.room_name}</p>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            Host: <span className="font-bold text-cyan-200">{entry.white_player_name}</span> · {formatRoomAge(entry.updated_at)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void joinPublicRoom(entry.id)}
                          disabled={onlineBusy}
                          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-black text-[#031019] hover:bg-cyan-200 disabled:opacity-45"
                        >
                          <FaPlay /> {ownRoom ? "Resume" : "Join Room"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {onlineError ? (
              <p className="mx-auto mt-3 max-w-4xl rounded-xl border border-red-300/20 bg-red-300/5 px-4 py-3 text-xs font-bold text-red-300">
                {onlineError}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 p-3 sm:p-5 xl:grid-cols-[minmax(0,1fr)_250px]">
            <div className="min-w-0">
              {mode === "online" && room ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.055] px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                      {room.room_kind === "matchmaking" ? "Global matchmaking" : "Public chess room"}
                    </p>
                    <p className="mt-0.5 truncate text-lg font-black text-yellow-100">{room.room_name}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${
                      room.status === "waiting"
                        ? "bg-yellow-300/10 text-yellow-200"
                        : "bg-emerald-300/10 text-emerald-200"
                    }`}
                  >
                    <FaWifi /> {room.status === "waiting" ? "Waiting for rival" : "2 players connected"}
                  </span>
                </div>
              ) : null}

              <div className="mx-auto aspect-square w-full max-w-[620px] overflow-hidden rounded-2xl border border-cyan-300/35 bg-[#020811] p-1 shadow-[0_0_45px_rgba(34,211,238,0.08)]">
                <div className="grid h-full w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-xl">
                  {displaySquares.map((square) => {
                    const piece = state.board[square];
                    const row = rowOf(square);
                    const col = colOf(square);
                    const selectedSquare = selected === square;
                    const targetMove = selectedMoves.find((move) => move.to === square);
                    const lastMoveSquare = state.lastMove?.from === square || state.lastMove?.to === square;
                    const light = (row + col) % 2 === 0;
                    const labelBottom = playerColor === "w" ? row === 7 : row === 0;
                    const labelSide = playerColor === "w" ? col === 0 : col === 7;
                    return (
                      <button
                        key={square}
                        type="button"
                        onClick={() => clickSquare(square)}
                        className={`relative flex min-h-0 items-center justify-center transition ${
                          light
                            ? "bg-[linear-gradient(135deg,rgba(250,204,21,0.24),rgba(113,63,18,0.28))]"
                            : "bg-[linear-gradient(135deg,rgba(8,47,73,0.96),rgba(6,24,40,0.98))]"
                        } ${selectedSquare ? "z-10 ring-4 ring-inset ring-yellow-200" : ""} ${lastMoveSquare ? "after:absolute after:inset-0 after:bg-cyan-200/10" : ""}`}
                        aria-label={`${squareName(square)}${piece ? ` ${piece}` : ""}`}
                      >
                        {targetMove ? (
                          <span
                            className={`absolute z-20 rounded-full ${piece ? "inset-1 border-4 border-cyan-200/65" : "h-3.5 w-3.5 bg-cyan-200/75 shadow-[0_0_14px_rgba(103,232,249,0.8)] sm:h-4 sm:w-4"}`}
                          />
                        ) : null}
                        {piece ? (
                          <span
                            className={`relative z-10 flex h-[76%] w-[76%] items-center justify-center rounded-full border text-[clamp(1.55rem,5.2vw,3.6rem)] leading-none shadow-[0_7px_16px_rgba(0,0,0,0.38)] transition ${
                              pieceColor(piece) === "w"
                                ? "border-yellow-200/70 bg-[radial-gradient(circle_at_35%_25%,#fff7c2,#d49a0b_60%,#5f3700)] text-[#090b0d]"
                                : "border-cyan-200/70 bg-[radial-gradient(circle_at_35%_25%,#caf8ff,#1587a0_55%,#042b3b)] text-[#02080c]"
                            }`}
                          >
                            <span className="drop-shadow-[0_2px_0_rgba(255,255,255,0.25)]">{PIECE_SYMBOL[pieceType(piece)]}</span>
                            <span
                              className={`absolute bottom-[7%] right-[5%] rounded px-1 text-[clamp(0.28rem,0.9vw,0.48rem)] font-black leading-4 ${
                                pieceColor(piece) === "w" ? "bg-black/75 text-yellow-200" : "bg-black/75 text-cyan-200"
                              }`}
                            >
                              CP
                            </span>
                          </span>
                        ) : null}
                        {labelBottom ? (
                          <span className="absolute bottom-0.5 right-1 z-20 text-[8px] font-black text-white/35 sm:text-[10px]">{FILES[col]}</span>
                        ) : null}
                        {labelSide ? (
                          <span className="absolute left-1 top-0.5 z-20 text-[8px] font-black text-white/35 sm:text-[10px]">{8 - row}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {pendingPromotion ? (
                <div className="mx-auto mt-3 flex max-w-[620px] items-center justify-center gap-2 rounded-2xl border border-yellow-300/30 bg-yellow-300/10 p-3">
                  <span className="mr-2 text-xs font-black uppercase tracking-wider text-yellow-200">Promote to</span>
                  {pendingPromotion.moves.map((move) => (
                    <button
                      key={move.promotion}
                      type="button"
                      onClick={() => performMove(move)}
                      className="flex h-12 w-12 items-center justify-center rounded-xl border border-yellow-200/30 bg-black/30 text-3xl text-yellow-100 transition hover:bg-yellow-200 hover:text-black"
                    >
                      {PIECE_SYMBOL[move.promotion || "q"]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <aside className="space-y-3">
              <div className="rounded-2xl border border-yellow-300/20 bg-yellow-300/[0.06] p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-300 text-black"><FaCrown /></span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-yellow-300/70">CP Gold</p>
                    <p className="truncate font-black text-white">
                      {mode === "online"
                        ? playerColor === "w"
                          ? "You"
                          : room?.white_player_name || "Online rival"
                        : "You"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300 text-black"><FaShieldHalved /></span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300/70">Cyber Cyan</p>
                    <p className="truncate font-black text-white">
                      {mode === "online"
                        ? playerColor === "b"
                          ? "You"
                          : room?.black_player_name || "Waiting…"
                        : "Alexia NPC"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Battle status</p>
                <p className="mt-2 text-base font-black text-white">{resultLabel(state)}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{onlineBusy ? "Synchronizing…" : message}</p>
                {onlineError ? <p className="mt-2 text-xs font-bold text-red-300">{onlineError}</p> : null}
              </div>

              {mode === "npc" ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Alexia NPC difficulty</p>
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    {(["rookie", "tactical", "commander"] as Difficulty[]).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setDifficulty(level)}
                        className={`rounded-lg px-2 py-2 text-[9px] font-black uppercase transition ${difficulty === level ? "bg-yellow-300 text-black" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                {mode === "npc" ? (
                  <button
                    type="button"
                    onClick={() => resetLocal("npc")}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-black text-slate-300 hover:border-yellow-300/40 hover:text-yellow-100"
                  >
                    <FaRotateRight /> Restart
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-black text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"
                >
                  <FaPlay /> Clear
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-slate-500">
                <p className="flex items-center gap-2 font-black text-slate-300"><FaUserGroup className="text-cyan-300" /> Standard chess rules</p>
                <p className="mt-2">Includes legal checks, checkmate, castling, en passant, promotion, realtime rooms, and responsive touch controls.</p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
