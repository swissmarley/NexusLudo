// ─────────────────────────────────────────────────────────────
// Heuristic AI + strategic move suggestions.
// Score every legal move by simulating it and evaluating the
// resulting position (aggression, safety, progress, tempo).
// ─────────────────────────────────────────────────────────────
import { isSafeCell, trackCell } from './board';
import { applyMove, canUsePower, legalMovesFor, threatCount, tokensOf } from './engine';
import {
  BOOST_AMOUNT,
  FINISH_PROGRESS,
  LAST_TRACK_PROGRESS,
  type AIDifficulty,
  type GameState,
  type Move,
  type PowerType,
  type Seat,
} from './types';

export interface ScoredMove {
  move: Move;
  score: number;
  reasons: string[];
}

const WEIGHTS: Record<AIDifficulty, { noise: number; danger: number; lookahead: boolean }> = {
  easy: { noise: 60, danger: 0.3, lookahead: false },
  normal: { noise: 12, danger: 1, lookahead: false },
  hard: { noise: 0, danger: 1.35, lookahead: true },
};

function positionValue(state: GameState, seat: Seat, dangerW: number): number {
  let v = 0;
  for (const t of tokensOf(state, seat)) {
    if (t.progress < 0) continue;
    if (t.progress >= FINISH_PROGRESS) {
      v += 140;
      continue;
    }
    v += 10 + t.progress * 1.6;
    if (t.progress > LAST_TRACK_PROGRESS) {
      v += 30; // home lane is untouchable
      continue;
    }
    const cell = trackCell(seat, t.progress)!;
    if (t.shield > 0) continue;
    const threat = threatCount(state, seat, cell);
    v -= threat * (12 + t.progress * 0.9) * dangerW;
  }
  return v;
}

export function scoreMoves(state: GameState, difficulty: AIDifficulty = 'hard', rng: () => number = Math.random): ScoredMove[] {
  const seat = state.current;
  const w = WEIGHTS[difficulty];
  const base = positionValue(state, seat, w.danger);
  return state.legalMoves
    .map((move) => {
      const reasons: string[] = [];
      const next = applyMove(state, move.tokenId, () => 0.5);
      let score = positionValue(next, seat, w.danger) - base;
      if (move.captures.length) {
        // reward capturing advanced opponents most
        for (const vid of move.captures) score += 45 + state.tokens[vid].progress * 1.2;
        reasons.push('CAPTURE');
      }
      if (move.finishes) {
        score += 40;
        reasons.push('REACH CORE');
      }
      if (move.enters) {
        score += 28;
        reasons.push('DEPLOY');
      }
      if (move.collects) {
        score += move.collects === 'emp' ? 22 : 18;
        reasons.push(`GRAB ${move.collects.toUpperCase()}`);
      }
      if (move.lands === 'safe') reasons.push('SAFE ZONE');
      if (move.lands === 'home' && move.from <= LAST_TRACK_PROGRESS) reasons.push('ENTER HOME LANE');
      // escaping danger
      const fromCell = trackCell(seat, move.from);
      if (fromCell !== null && !isSafeCell(fromCell)) {
        const t = threatCount(state, seat, fromCell);
        if (t > 0 && state.tokens[move.tokenId].shield === 0) {
          score += t * 8 * w.danger;
          reasons.push('EVADE');
        }
      }
      const toCell = trackCell(seat, move.to);
      if (toCell !== null && threatCount(next, seat, toCell) > 0 && next.tokens[move.tokenId].shield === 0) {
        reasons.push('EXPOSED');
      }
      if (w.lookahead) {
        // Hard AI: prefer moves that set up capture chances next turn
        if (toCell !== null) {
          for (const o of next.tokens) {
            if (o.seat === seat || !next.players[o.seat].active) continue;
            const oc = trackCell(o.seat, o.progress);
            if (oc === null || isSafeCell(oc) || o.shield > 0) continue;
            const d = (oc - toCell + 52) % 52;
            if (d >= 1 && d <= 6) score += 4 + o.progress * 0.15;
          }
        }
        // keep tokens spread: penalise moving the leader when others idle in base with a 6
        if (state.rawDice === 6 && !move.enters && tokensOf(state, seat).some((t) => t.progress < 0)) score -= 6;
      }
      score += (rng() - 0.5) * w.noise;
      if (reasons.length === 0) reasons.push('ADVANCE');
      return { move, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export function chooseMove(state: GameState, difficulty: AIDifficulty, rng: () => number = Math.random): Move | null {
  if (state.legalMoves.length === 0) return null;
  return scoreMoves(state, difficulty, rng)[0].move;
}

/** Best move for hint display (noise-free). */
export function suggestMove(state: GameState): ScoredMove | null {
  if (state.legalMoves.length === 0) return null;
  return scoreMoves(state, 'hard', () => 0.5)[0];
}

/**
 * AI power-up decision. Returns a power to activate now, or null.
 * Called when the AI is in 'roll' phase (before rolling) or 'move' phase.
 */
export function choosePower(state: GameState, difficulty: AIDifficulty): PowerType | null {
  if (state.mode !== 'nexus' || difficulty === 'easy') return null;
  const seat = state.current;
  const items = state.players[seat].items;
  if (items.length === 0) return null;

  if (items.includes('emp') && canUsePower(state, 'emp')) {
    // fire if any opponent within range
    for (const t of tokensOf(state, seat)) {
      const c = trackCell(seat, t.progress);
      if (c === null) continue;
      for (const o of state.tokens) {
        if (o.seat === seat || o.shield > 0 || !state.players[o.seat].active) continue;
        const oc = trackCell(o.seat, o.progress);
        if (oc === null || isSafeCell(oc)) continue;
        const d = (oc - c + 52) % 52;
        if (d >= 1 && d <= 4 && o.progress > 0) return 'emp';
      }
    }
  }
  if (state.phase === 'move') {
    const best = state.legalMoves.length ? scoreMoves(state, 'hard', () => 0.5)[0] : null;
    if (items.includes('boost') && canUsePower(state, 'boost')) {
      const sim = scoreMovesWithRoll(state, state.rawDice! + BOOST_AMOUNT);
      if (sim && (!best || sim.score > best.score + 12)) return 'boost';
    }
    if (items.includes('reroll') && canUsePower(state, 'reroll')) {
      if (!best || best.score < (difficulty === 'hard' ? 4 : -4)) return 'reroll';
    }
  }
  return null;
}

function scoreMovesWithRoll(state: GameState, roll: number): ScoredMove | null {
  const moves = legalMovesFor(state, state.current, roll, state.rawDice!);
  if (!moves.length) return null;
  const sim: GameState = { ...state, dice: roll, boosted: true, legalMoves: moves };
  return scoreMoves(sim, 'hard', () => 0.5)[0] ?? null;
}
