// ─────────────────────────────────────────────────────────────
// NEXUS LUDO rules engine. Pure & deterministic: every function
// takes a state and returns a NEW state. Randomness is injected.
//
// Rules implemented:
//  • A raw 6 is required to launch a token from base onto its start cell.
//  • Rolling a 6 grants an extra roll; three 6s in a row forfeit the turn.
//  • Landing on an opponent on a non-safe cell captures it (sent to base)
//    and grants an extra roll. Start cells and star cells are safe.
//  • Tokens circle 51 cells, then enter their private 5-cell home lane;
//    reaching the core (progress 56) requires an exact roll and grants an extra roll.
//  • Players who bring all four tokens home are ranked; the game ends
//    when only one active player remains unfinished (first finisher wins).
//  • NEXUS mode adds power cells: SHIELD, BOOST, REROLL, EMP.
// ─────────────────────────────────────────────────────────────
import { isSafeCell, relativeProgress, trackCell } from './board';
import {
  BOOST_AMOUNT,
  EMP_KNOCKBACK,
  EMP_RANGE,
  FINISH_PROGRESS,
  LAST_TRACK_PROGRESS,
  MAX_ITEMS,
  POWER_CELL_COUNT,
  SHIELD_TURNS,
  TRACK_LENGTH,
  type GameConfig,
  type GameEvent,
  type GameState,
  type Move,
  type Player,
  type PlayerStats,
  type PowerType,
  type Seat,
  type Token,
} from './types';

export type Rng = () => number;

const POWER_TYPES: PowerType[] = ['shield', 'boost', 'reroll', 'emp'];

export function emptyStats(): PlayerStats {
  return {
    rolls: 0,
    sixes: 0,
    captures: 0,
    captured: 0,
    distance: 0,
    powerUps: 0,
    turns: 0,
    rollHistogram: [0, 0, 0, 0, 0, 0],
  };
}

const DEFAULT_NAMES = ['CYAN', 'AMBER', 'MAGENTA', 'VIOLET'];

export function createGame(config: GameConfig, rng: Rng = Math.random): GameState {
  const seats = new Set(config.players.map((p) => p.seat));
  if (seats.size < 2 || seats.size !== config.players.length) {
    throw new Error('A game needs 2–4 players with unique seats');
  }
  const players: Player[] = ([0, 1, 2, 3] as Seat[]).map((seat) => {
    const cfg = config.players.find((p) => p.seat === seat);
    return {
      seat,
      name: cfg?.name ?? DEFAULT_NAMES[seat],
      kind: cfg?.kind ?? 'ai',
      difficulty: cfg?.difficulty ?? 'normal',
      active: !!cfg,
      rank: null,
      items: [],
      stats: emptyStats(),
    };
  });
  const tokens: Token[] = [];
  for (let s = 0; s < 4; s++)
    for (let i = 0; i < 4; i++) tokens.push({ id: s * 4 + i, seat: s as Seat, index: i, progress: -1, shield: 0 });

  const first = ([0, 1, 2, 3] as Seat[]).find((s) => players[s].active)!;
  let state: GameState = {
    mode: config.mode,
    players,
    tokens,
    current: first,
    phase: 'roll',
    dice: null,
    rawDice: null,
    boosted: false,
    sixStreak: 0,
    legalMoves: [],
    powerCells: [],
    turn: 1,
    finishOrder: [],
    winner: null,
    lastEvents: [{ type: 'turn', seat: first }],
  };
  if (config.mode === 'nexus') {
    const events: GameEvent[] = [];
    state = { ...state, powerCells: fillPowerCells(state, rng, events) };
  }
  players[first].stats.turns = 1;
  return state;
}

// ── Helpers ──────────────────────────────────────────────────

export function tokensOf(state: GameState, seat: Seat): Token[] {
  return state.tokens.filter((t) => t.seat === seat);
}

export function activeSeats(state: GameState): Seat[] {
  return state.players.filter((p) => p.active).map((p) => p.seat);
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      items: [...p.items],
      stats: { ...p.stats, rollHistogram: [...p.stats.rollHistogram] as PlayerStats['rollHistogram'] },
    })),
    tokens: state.tokens.map((t) => ({ ...t })),
    powerCells: state.powerCells.map((c) => ({ ...c })),
    finishOrder: [...state.finishOrder],
    legalMoves: [],
    lastEvents: [],
  };
}

/** Tokens (any owner) occupying an absolute main-track cell. */
export function tokensOnCell(state: GameState, cell: number): Token[] {
  return state.tokens.filter((t) => state.players[t.seat].active && trackCell(t.seat, t.progress) === cell);
}

function fillPowerCells(state: GameState, rng: Rng, events: GameEvent[]): GameState['powerCells'] {
  const cells = [...state.powerCells];
  let guard = 0;
  while (cells.length < POWER_CELL_COUNT && guard++ < 200) {
    const cell = Math.floor(rng() * TRACK_LENGTH);
    if (isSafeCell(cell)) continue;
    if (cells.some((c) => c.cell === cell)) continue;
    if (tokensOnCell(state, cell).length) continue;
    // keep power cells off the 2 cells directly after each start
    if ([1, 2, 14, 15, 27, 28, 40, 41].includes(cell)) continue;
    const type = POWER_TYPES[Math.floor(rng() * POWER_TYPES.length)];
    cells.push({ cell, type });
    events.push({ type: 'spawnPower', cell, power: type });
  }
  return cells;
}

// ── Move generation ──────────────────────────────────────────

export function computeMove(state: GameState, token: Token, roll: number, raw: number): Move | null {
  if (token.progress >= FINISH_PROGRESS) return null;
  let from = token.progress;
  let to: number;
  const path: number[] = [];
  let enters = false;
  if (from < 0) {
    if (raw !== 6) return null;
    to = 0;
    path.push(0);
    enters = true;
  } else {
    to = from + roll;
    if (to > FINISH_PROGRESS) return null;
    for (let p = from + 1; p <= to; p++) path.push(p);
  }
  const finishes = to === FINISH_PROGRESS;
  const captures: number[] = [];
  const blockedBy: number[] = [];
  let collects: PowerType | null = null;
  let lands: Move['lands'] = finishes ? 'finish' : to > LAST_TRACK_PROGRESS ? 'home' : 'track';

  const cell = trackCell(token.seat, to);
  if (cell !== null) {
    if (isSafeCell(cell)) lands = 'safe';
    const others = tokensOnCell(state, cell).filter((t) => t.seat !== token.seat);
    if (!isSafeCell(cell)) {
      for (const o of others) {
        if (o.shield > 0) blockedBy.push(o.id);
        else captures.push(o.id);
      }
    }
    if (state.mode === 'nexus') {
      const pc = state.powerCells.find((c) => c.cell === cell);
      if (pc) collects = pc.type;
    }
  }
  return {
    tokenId: token.id,
    seat: token.seat,
    from,
    to,
    path,
    enters,
    finishes,
    captures,
    blockedBy,
    collects,
    lands,
  };
}

export function legalMovesFor(state: GameState, seat: Seat, roll: number, raw: number): Move[] {
  const moves: Move[] = [];
  for (const t of tokensOf(state, seat)) {
    const m = computeMove(state, t, roll, raw);
    if (m) moves.push(m);
  }
  // Deduplicate identical base launches: show only the lowest-index base token
  // as a distinct option but keep all selectable (UI can click any base token).
  return moves;
}

// ── Turn flow ────────────────────────────────────────────────

function nextSeat(state: GameState, from: Seat): Seat {
  for (let i = 1; i <= 4; i++) {
    const s = ((from + i) % 4) as Seat;
    const p = state.players[s];
    if (p.active && p.rank === null) return s;
  }
  return from;
}

function beginTurn(state: GameState, seat: Seat, events: GameEvent[]): void {
  state.current = seat;
  state.phase = 'roll';
  state.dice = null;
  state.rawDice = null;
  state.boosted = false;
  state.sixStreak = 0;
  state.legalMoves = [];
  state.turn += 1;
  state.players[seat].stats.turns += 1;
  // Shields decay at the start of their owner's turn.
  for (const t of state.tokens) if (t.seat === seat && t.shield > 0) t.shield -= 1;
  events.push({ type: 'turn', seat });
}

function passTurn(state: GameState, events: GameEvent[]): void {
  beginTurn(state, nextSeat(state, state.current), events);
}

function sameSeatAgain(state: GameState): void {
  state.phase = 'roll';
  state.dice = null;
  state.rawDice = null;
  state.boosted = false;
  state.legalMoves = [];
}

/**
 * Apply a dice roll for the current player. `raw` is the face 1..6.
 * Returns new state; if no legal moves exist the turn auto-advances
 * (events contain 'noMoves' / 'forfeit').
 */
export function applyRoll(prev: GameState, raw: number): GameState {
  if (prev.phase !== 'roll') return prev;
  if (raw < 1 || raw > 6 || !Number.isInteger(raw)) throw new Error(`Invalid roll ${raw}`);
  const state = cloneState(prev);
  const events: GameEvent[] = [];
  const seat = state.current;
  const p = state.players[seat];
  p.stats.rolls += 1;
  p.stats.rollHistogram[raw - 1] += 1;
  state.rawDice = raw;
  state.dice = raw;
  state.boosted = false;
  events.push({ type: 'roll', seat, value: raw, raw });
  if (raw === 6) {
    state.sixStreak += 1;
    p.stats.sixes += 1;
    events.push({ type: 'six', seat, streak: state.sixStreak });
    if (state.sixStreak >= 3) {
      events.push({ type: 'forfeit', seat });
      passTurn(state, events);
      state.lastEvents = events;
      return state;
    }
  }
  state.legalMoves = legalMovesFor(state, seat, raw, raw);
  if (state.legalMoves.length === 0) {
    events.push({ type: 'noMoves', seat });
    // A natural six still earns the re-roll even when nothing can move.
    if (raw === 6) {
      events.push({ type: 'extraTurn', seat, reason: 'six' });
      sameSeatAgain(state);
    } else if (canStillAct(state)) {
      // keep phase 'move' so the player may use a power-up (boost/reroll/emp) or skip
      state.phase = 'move';
    } else {
      passTurn(state, events);
    }
  } else {
    state.phase = 'move';
  }
  state.lastEvents = events;
  return state;
}

/** In NEXUS mode a player with no moves but usable items may still act. */
function canStillAct(state: GameState): boolean {
  if (state.mode !== 'nexus') return false;
  const items = state.players[state.current].items;
  return items.includes('reroll') || (items.includes('boost') && !state.boosted && boostedMoves(state).length > 0);
}

function boostedMoves(state: GameState): Move[] {
  if (state.rawDice === null) return [];
  return legalMovesFor(state, state.current, state.rawDice + BOOST_AMOUNT, state.rawDice);
}

/** Skip the current move phase (only valid when no legal move exists). */
export function skipTurn(prev: GameState): GameState {
  if (prev.phase !== 'move' || prev.legalMoves.length > 0) return prev;
  const state = cloneState(prev);
  const events: GameEvent[] = [];
  if (state.rawDice === 6) {
    events.push({ type: 'extraTurn', seat: state.current, reason: 'six' });
    sameSeatAgain(state);
  } else passTurn(state, events);
  state.lastEvents = events;
  return state;
}

export function applyMove(prev: GameState, tokenId: number, rng: Rng = Math.random): GameState {
  if (prev.phase !== 'move') return prev;
  const move = prev.legalMoves.find((m) => m.tokenId === tokenId);
  if (!move) return prev;
  const state = cloneState(prev);
  const events: GameEvent[] = [];
  const seat = state.current;
  const player = state.players[seat];
  const token = state.tokens[tokenId];

  token.progress = move.to;
  player.stats.distance += move.enters ? 1 : move.path.length;
  events.push({ type: 'move', move });
  if (move.enters) events.push({ type: 'enter', tokenId, seat });

  const cell = trackCell(seat, move.to);
  for (const vid of move.captures) {
    const v = state.tokens[vid];
    v.progress = -1;
    v.shield = 0;
    player.stats.captures += 1;
    state.players[v.seat].stats.captured += 1;
    events.push({ type: 'capture', by: tokenId, victim: vid, cell: cell! });
  }
  for (const bid of move.blockedBy) events.push({ type: 'shieldBlock', tokenId: bid, cell: cell! });

  if (move.collects && cell !== null) {
    state.powerCells = state.powerCells.filter((c) => c.cell !== cell);
    player.stats.powerUps += 1;
    events.push({ type: 'collect', seat, tokenId, power: move.collects, cell });
    if (move.collects === 'shield') {
      token.shield = SHIELD_TURNS;
    } else if (move.collects === 'emp') {
      // EMP triggers instantly on pickup
      fireEmp(state, events);
    } else if (player.items.length < MAX_ITEMS) {
      player.items.push(move.collects);
    }
    state.powerCells = fillPowerCells(state, rng, events);
  }

  let extra: 'six' | 'capture' | 'finish' | null = null;
  if (move.finishes) {
    events.push({ type: 'finish', tokenId, seat });
    if (tokensOf(state, seat).every((t) => t.progress >= FINISH_PROGRESS)) {
      player.rank = state.finishOrder.length + 1;
      state.finishOrder.push(seat);
      events.push({ type: 'playerDone', seat, rank: player.rank });
      if (state.winner === null) {
        state.winner = seat;
        events.push({ type: 'win', seat });
      }
      const remaining = activeSeats(state).filter((s) => state.players[s].rank === null);
      if (remaining.length <= 1) {
        for (const s of remaining) {
          state.players[s].rank = state.finishOrder.length + 1;
          state.finishOrder.push(s);
        }
        state.phase = 'over';
        state.legalMoves = [];
        state.lastEvents = events;
        return state;
      }
      // finished player can't take another turn
      passTurn(state, events);
      state.lastEvents = events;
      return state;
    }
    extra = 'finish';
  }
  if (!extra && move.captures.length) extra = 'capture';
  if (!extra && state.rawDice === 6) extra = 'six';

  if (extra) {
    events.push({ type: 'extraTurn', seat, reason: extra });
    sameSeatAgain(state);
  } else passTurn(state, events);
  state.lastEvents = events;
  return state;
}

// ── Power-ups ────────────────────────────────────────────────

function fireEmp(state: GameState, events: GameEvent[]): void {
  const seat = state.current;
  const sources: number[] = [];
  const hits: { tokenId: number; from: number; to: number }[] = [];
  const hitSet = new Set<number>();
  for (const src of tokensOf(state, seat)) {
    const srcCell = trackCell(seat, src.progress);
    if (srcCell === null) continue;
    let fired = false;
    for (let d = 1; d <= EMP_RANGE; d++) {
      const cell = (srcCell + d) % TRACK_LENGTH;
      if (isSafeCell(cell)) continue;
      for (const v of tokensOnCell(state, cell)) {
        if (v.seat === seat || v.shield > 0 || hitSet.has(v.id)) continue;
        const from = v.progress;
        const to = Math.max(0, from - EMP_KNOCKBACK);
        if (to === from) continue;
        hitSet.add(v.id);
        hits.push({ tokenId: v.id, from, to });
        fired = true;
      }
    }
    if (fired) sources.push(src.id);
  }
  for (const h of hits) state.tokens[h.tokenId].progress = h.to;
  events.push({ type: 'emp', seat, sources, hits });
}

export function canUsePower(state: GameState, power: PowerType): boolean {
  if (state.mode !== 'nexus' || state.phase === 'over') return false;
  const p = state.players[state.current];
  if (!p.items.includes(power)) return false;
  switch (power) {
    case 'boost':
      return state.phase === 'move' && !state.boosted && state.rawDice !== null && boostedMoves(state).length > 0;
    case 'reroll':
      return state.phase === 'move' && state.rawDice !== null;
    case 'emp':
    case 'shield':
      return true;
  }
}

export function usePower(prev: GameState, power: PowerType): GameState {
  if (!canUsePower(prev, power)) return prev;
  const state = cloneState(prev);
  const events: GameEvent[] = [];
  const seat = state.current;
  const p = state.players[seat];
  p.items.splice(p.items.indexOf(power), 1);
  events.push({ type: 'usePower', seat, power });
  switch (power) {
    case 'boost': {
      state.boosted = true;
      state.dice = state.rawDice! + BOOST_AMOUNT;
      state.legalMoves = legalMovesFor(state, seat, state.dice, state.rawDice!);
      break;
    }
    case 'reroll': {
      if (state.rawDice === 6) state.sixStreak = Math.max(0, state.sixStreak - 1);
      state.phase = 'roll';
      state.dice = null;
      state.rawDice = null;
      state.boosted = false;
      state.legalMoves = [];
      break;
    }
    case 'emp': {
      fireEmp(state, events);
      if (state.phase === 'move' && state.rawDice !== null) {
        state.legalMoves = legalMovesFor(state, seat, state.dice!, state.rawDice);
      }
      break;
    }
    case 'shield': {
      // Stored shields (not normally stored, but supported) protect the most advanced track token.
      const t = tokensOf(state, seat)
        .filter((t) => t.progress >= 0 && t.progress <= LAST_TRACK_PROGRESS)
        .sort((a, b) => b.progress - a.progress)[0];
      if (t) t.shield = SHIELD_TURNS;
      if (state.phase === 'move' && state.rawDice !== null)
        state.legalMoves = legalMovesFor(state, seat, state.dice!, state.rawDice);
      break;
    }
  }
  state.lastEvents = events;
  return state;
}

// ── Analysis helpers (used by AI, hints & HUD) ───────────────

/** Overall completion 0..1 for a player. */
export function playerProgress(state: GameState, seat: Seat): number {
  const ts = tokensOf(state, seat);
  const sum = ts.reduce((a, t) => a + Math.max(0, t.progress + 1), 0);
  return sum / (4 * (FINISH_PROGRESS + 1));
}

/**
 * Number of opponent tokens that could capture a token sitting on `cell`
 * with a single roll (1..6) — a quick danger metric.
 */
export function threatCount(state: GameState, seat: Seat, cell: number): number {
  if (isSafeCell(cell)) return 0;
  let n = 0;
  for (const t of state.tokens) {
    if (t.seat === seat || !state.players[t.seat].active || state.players[t.seat].rank !== null) continue;
    const tc = trackCell(t.seat, t.progress);
    if (tc === null) {
      // base tokens threaten the start cell (they enter on a six)
      if (t.progress < 0 && cell === t.seat * 13) n += 0.35;
      continue;
    }
    const dist = (cell - tc + TRACK_LENGTH) % TRACK_LENGTH;
    if (dist >= 1 && dist <= 6) {
      // make sure the attacker wouldn't have turned into its home lane first
      if (relativeProgress(t.seat, cell) <= LAST_TRACK_PROGRESS && relativeProgress(t.seat, cell) > t.progress) n += 1;
    }
  }
  return n;
}
