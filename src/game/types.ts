// ─────────────────────────────────────────────────────────────
// NEXUS LUDO — core domain types (pure, render-agnostic)
// ─────────────────────────────────────────────────────────────

export type Seat = 0 | 1 | 2 | 3;
export type GameMode = 'classic' | 'nexus';
export type PlayerKind = 'human' | 'ai';
export type AIDifficulty = 'easy' | 'normal' | 'hard';
export type Phase = 'roll' | 'move' | 'over';

/** Power-ups available in NEXUS mode. */
export type PowerType = 'shield' | 'boost' | 'reroll' | 'emp';

/**
 * Token progress encoding (relative to its owner):
 *   -1        → in base (docking bay)
 *   0 … 50    → on the shared main track (absolute cell = (seat*13 + progress) % 52)
 *   51 … 55   → in the owner's private home lane
 *   56        → finished (reached the Nexus core)
 */
export interface Token {
  id: number; // 0..15, id = seat*4 + index
  seat: Seat;
  index: number; // 0..3 within owner
  progress: number;
  /** Remaining owner-turns of shield protection (NEXUS mode). */
  shield: number;
}

export interface PlayerStats {
  rolls: number;
  sixes: number;
  captures: number;
  captured: number;
  distance: number; // total cells travelled
  powerUps: number;
  turns: number;
  rollHistogram: [number, number, number, number, number, number];
}

export interface Player {
  seat: Seat;
  name: string;
  kind: PlayerKind;
  difficulty: AIDifficulty;
  active: boolean; // participates in this match
  rank: number | null; // finishing place (1-based) once all tokens are home
  items: PowerType[]; // held power-ups (max 2)
  stats: PlayerStats;
}

export interface PowerCell {
  cell: number; // absolute main-track cell 0..51
  type: PowerType;
}

export interface Move {
  tokenId: number;
  seat: Seat;
  from: number; // progress before
  to: number; // progress after
  /** Every intermediate progress value hopped through (excluding `from`, including `to`). */
  path: number[];
  enters: boolean;
  finishes: boolean;
  /** Ids of opponent tokens that will be captured. */
  captures: number[];
  /** Ids of opponent tokens that were protected by a shield on landing cell. */
  blockedBy: number[];
  collects: PowerType | null;
  lands: 'safe' | 'track' | 'home' | 'finish';
}

export interface GameConfigPlayer {
  seat: Seat;
  name: string;
  kind: PlayerKind;
  difficulty: AIDifficulty;
}

export interface GameConfig {
  mode: GameMode;
  players: GameConfigPlayer[]; // 2..4 entries, unique seats
}

export interface GameState {
  mode: GameMode;
  players: Player[]; // always length 4, indexed by seat
  tokens: Token[]; // always length 16
  current: Seat;
  phase: Phase;
  dice: number | null; // effective roll value (after boost)
  rawDice: number | null; // face shown on the die
  boosted: boolean;
  sixStreak: number;
  legalMoves: Move[];
  powerCells: PowerCell[];
  turn: number; // global turn counter
  finishOrder: Seat[];
  winner: Seat | null;
  lastEvents: GameEvent[];
}

// ── Events emitted by the engine for VFX / audio / UI feedback ──
export type GameEvent =
  | { type: 'roll'; seat: Seat; value: number; raw: number }
  | { type: 'six'; seat: Seat; streak: number }
  | { type: 'forfeit'; seat: Seat }
  | { type: 'noMoves'; seat: Seat }
  | { type: 'move'; move: Move }
  | { type: 'enter'; tokenId: number; seat: Seat }
  | { type: 'capture'; by: number; victim: number; cell: number }
  | { type: 'shieldBlock'; tokenId: number; cell: number }
  | { type: 'finish'; tokenId: number; seat: Seat }
  | { type: 'playerDone'; seat: Seat; rank: number }
  | { type: 'extraTurn'; seat: Seat; reason: 'six' | 'capture' | 'finish' }
  | { type: 'turn'; seat: Seat }
  | { type: 'collect'; seat: Seat; tokenId: number; power: PowerType; cell: number }
  | { type: 'usePower'; seat: Seat; power: PowerType }
  | { type: 'emp'; seat: Seat; sources: number[]; hits: { tokenId: number; from: number; to: number }[] }
  | { type: 'spawnPower'; cell: number; power: PowerType }
  | { type: 'win'; seat: Seat };

export const SEAT_COUNT = 4;
export const TOKENS_PER_PLAYER = 4;
export const TRACK_LENGTH = 52;
export const LAST_TRACK_PROGRESS = 50;
export const HOME_LANE_START = 51;
export const FINISH_PROGRESS = 56;
export const MAX_ITEMS = 2;
export const POWER_CELL_COUNT = 4;
export const SHIELD_TURNS = 3;
export const BOOST_AMOUNT = 2;
export const EMP_RANGE = 4;
export const EMP_KNOCKBACK = 4;
