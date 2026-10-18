import { describe, expect, it } from 'vitest';
import { applyMove, applyRoll, createGame, skipTurn, usePower, threatCount } from './engine';
import { chooseMove, suggestMove } from './ai';
import { TRACK, HOME_LANES, progressToWorld, trackCell } from './board';
import type { GameConfig, GameState, Seat } from './types';

const cfg = (mode: 'classic' | 'nexus' = 'classic', seats: Seat[] = [0, 2]): GameConfig => ({
  mode,
  players: seats.map((seat) => ({ seat, name: `P${seat}`, kind: 'ai', difficulty: 'normal' })),
});

function withTokens(state: GameState, patch: Record<number, number>): GameState {
  return { ...state, tokens: state.tokens.map((t) => (t.id in patch ? { ...t, progress: patch[t.id] } : t)) };
}

describe('board', () => {
  it('has 52 unique track cells and 4 lanes of 5', () => {
    expect(TRACK).toHaveLength(52);
    expect(new Set(TRACK.map(([r, c]) => `${r},${c}`)).size).toBe(52);
    HOME_LANES.forEach((l) => expect(l).toHaveLength(5));
  });
  it('track cells are orthogonally adjacent', () => {
    for (let i = 0; i < 52; i++) {
      const [r1, c1] = TRACK[i];
      const [r2, c2] = TRACK[(i + 1) % 52];
      const d = Math.abs(r1 - r2) + Math.abs(c1 - c2);
      // corners of the cross step diagonally between arms (classic layout)
      expect(d === 1 || d === 2).toBe(true);
    }
  });
  it('home lanes start adjacent to each seat\'s final track cell', () => {
    for (const s of [0, 1, 2, 3] as Seat[]) {
      const [r, c] = TRACK[trackCell(s, 50)!];
      const [hr, hc] = HOME_LANES[s][0];
      expect(Math.abs(r - hr) + Math.abs(c - hc)).toBe(1);
    }
  });
  it('maps progress to world coordinates', () => {
    const p = progressToWorld(0, 0, 0);
    expect(p).toEqual({ x: -6, y: 0, z: -1 });
  });
});

describe('engine rules', () => {
  it('requires a six to launch', () => {
    let g = createGame(cfg());
    g = applyRoll(g, 3);
    expect(g.current).toBe(2); // no moves → passes
    g = applyRoll(g, 6);
    expect(g.phase).toBe('move');
    expect(g.legalMoves).toHaveLength(4);
    g = applyMove(g, 8);
    expect(g.tokens[8].progress).toBe(0);
    expect(g.current).toBe(2); // six → extra roll
    expect(g.phase).toBe('roll');
  });

  it('forfeits on triple six', () => {
    let g = withTokens(createGame(cfg()), { 0: 10 });
    g = applyMove(applyRoll(g, 6), 0);
    g = applyMove(applyRoll(g, 6), 0);
    g = applyRoll(g, 6);
    expect(g.current).toBe(2);
    expect(g.lastEvents.some((e) => e.type === 'forfeit')).toBe(true);
    expect(g.tokens[0].progress).toBe(22);
  });

  it('captures on non-safe cells and grants an extra roll', () => {
    // seat 0 token at progress 3 (cell 3); seat 2 token at cell 5 → seat-2 progress (5-26+52)%52 = 31
    let g = withTokens(createGame(cfg()), { 0: 3, 8: 31 });
    g = applyRoll(g, 2);
    const m = g.legalMoves.find((x) => x.tokenId === 0)!;
    expect(m.captures).toEqual([8]);
    g = applyMove(g, 0);
    expect(g.tokens[8].progress).toBe(-1);
    expect(g.current).toBe(0);
    expect(g.players[0].stats.captures).toBe(1);
  });

  it('does not capture on safe cells', () => {
    // cell 8 is a star
    let g = withTokens(createGame(cfg()), { 0: 5, 8: (8 - 26 + 52) % 52 });
    g = applyRoll(g, 3);
    expect(g.legalMoves.find((x) => x.tokenId === 0)!.captures).toEqual([]);
  });

  it('requires an exact roll to finish', () => {
    let g = withTokens(createGame(cfg()), { 0: 54, 1: 56, 2: 56, 3: 56 });
    g = applyRoll(g, 4);
    expect(g.legalMoves).toHaveLength(0);
    g = withTokens(createGame(cfg()), { 0: 54, 1: 56, 2: 56, 3: 56 });
    g = applyRoll(g, 2);
    g = applyMove(g, 0);
    expect(g.winner).toBe(0);
    expect(g.phase).toBe('over'); // 2-player game ends
    expect(g.finishOrder).toEqual([0, 2]);
  });

  it('continues for placings in 3+ player games', () => {
    let g = withTokens(createGame(cfg('classic', [0, 1, 2])), { 0: 54, 1: 56, 2: 56, 3: 56 });
    g = applyMove(applyRoll(g, 2), 0);
    expect(g.winner).toBe(0);
    expect(g.phase).toBe('roll');
    expect(g.current).toBe(1);
  });

  it('skips finished players in turn order', () => {
    let g = createGame(cfg('classic', [0, 1, 2]));
    g = { ...g, players: g.players.map((p) => (p.seat === 1 ? { ...p, rank: 1 } : p)) };
    g = applyRoll(g, 2);
    expect(g.current).toBe(2);
  });

  it('enters the home lane past progress 50', () => {
    let g = withTokens(createGame(cfg()), { 0: 48 });
    g = applyRoll(g, 5);
    const m = g.legalMoves[0];
    expect(m.to).toBe(53);
    expect(m.lands).toBe('home');
  });
});

describe('nexus power-ups', () => {
  it('spawns power cells', () => {
    const g = createGame(cfg('nexus'));
    expect(g.powerCells.length).toBe(4);
  });

  it('shield blocks captures', () => {
    let g = withTokens(createGame(cfg('nexus')), { 0: 3, 8: 31 });
    g = { ...g, powerCells: [], tokens: g.tokens.map((t) => (t.id === 8 ? { ...t, shield: 2 } : t)) };
    g = applyRoll(g, 2);
    expect(g.legalMoves[0].blockedBy).toEqual([8]);
    g = applyMove(g, 0);
    expect(g.tokens[8].progress).toBe(31);
  });

  it('boost adds +2 and reroll returns to roll phase', () => {
    let g = withTokens(createGame(cfg('nexus')), { 0: 10 });
    g = { ...g, powerCells: [], players: g.players.map((p) => (p.seat === 0 ? { ...p, items: ['boost', 'reroll'] } : p)) };
    g = applyRoll(g, 3);
    g = usePower(g, 'boost');
    expect(g.dice).toBe(5);
    expect(g.legalMoves[0].to).toBe(15);
    g = usePower(g, 'reroll');
    expect(g.phase).toBe('roll');
    expect(g.players[0].items).toEqual([]);
  });

  it('emp knocks back nearby enemies', () => {
    // seat 0 at cell 10, seat 2 token at cell 12 → progress 38
    let g = withTokens(createGame(cfg('nexus')), { 0: 10, 8: 38 });
    g = { ...g, powerCells: [], players: g.players.map((p) => (p.seat === 0 ? { ...p, items: ['emp'] } : p)) };
    g = usePower(g, 'emp');
    expect(g.tokens[8].progress).toBe(34);
  });

  it('no-move with reroll keeps the player in move phase and skip works', () => {
    let g = createGame(cfg('nexus'));
    g = { ...g, powerCells: [], players: g.players.map((p) => (p.seat === 0 ? { ...p, items: ['reroll'] } : p)) };
    g = applyRoll(g, 2);
    expect(g.phase).toBe('move');
    expect(g.legalMoves).toHaveLength(0);
    g = skipTurn(g);
    expect(g.current).toBe(2);
  });
});

describe('ai', () => {
  it('prefers captures', () => {
    let g = withTokens(createGame(cfg()), { 0: 3, 1: 20, 8: 31 });
    g = applyRoll(g, 2);
    expect(chooseMove(g, 'hard')!.tokenId).toBe(0);
    expect(suggestMove(g)!.reasons).toContain('CAPTURE');
  });

  it('threatCount sees attackers behind', () => {
    const g = withTokens(createGame(cfg()), { 0: 5, 8: (2 - 26 + 52) % 52 });
    expect(threatCount(g, 0, 5)).toBe(1);
  });

  it('plays full AI games to completion without stalling', () => {
    for (let n = 0; n < 30; n++) {
      const mode = n % 2 ? 'nexus' : 'classic';
      const seats: Seat[][] = [[0, 2], [0, 1, 2], [0, 1, 2, 3]];
      let g = createGame(cfg(mode, seats[n % 3]));
      let guard = 0;
      while (g.phase !== 'over' && guard++ < 20000) {
        if (g.phase === 'roll') g = applyRoll(g, 1 + Math.floor(Math.random() * 6));
        else if (g.phase === 'move') {
          const m = chooseMove(g, (['easy', 'normal', 'hard'] as const)[n % 3]);
          g = m ? applyMove(g, m.tokenId) : skipTurn(g);
        }
      }
      expect(g.phase).toBe('over');
      expect(g.winner).not.toBeNull();
      // invariants
      for (const t of g.tokens) expect(t.progress).toBeLessThanOrEqual(56);
    }
  });
});
