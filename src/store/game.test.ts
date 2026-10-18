import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from './game';
import { useSettings } from './settings';
import { fx } from '../core/fx';
import type { GameConfig, Seat } from '../game/types';

const aiConfig = (mode: 'classic' | 'nexus', seats: Seat[]): GameConfig => ({
  mode,
  players: seats.map((seat) => ({ seat, name: `AI${seat}`, kind: 'ai', difficulty: 'hard' })),
});

async function runUntil(pred: () => boolean, maxSteps = 200000) {
  for (let i = 0; i < maxSteps && !pred(); i++) await vi.advanceTimersByTimeAsync(250);
}

describe('game store controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSettings.getState().set({ speed: 2.5 });
  });
  afterEach(() => {
    useGame.getState().quitToMenu();
    vi.useRealTimers();
  });

  for (const [mode, seats] of [
    ['classic', [0, 2]],
    ['nexus', [0, 1, 2, 3]],
  ] as const) {
    it(`runs a full ${mode} AI match (${seats.length}p) through victory to results`, async () => {
      const events = new Map<string, number>();
      const off = fx.onAny((e) => events.set(e.type, (events.get(e.type) ?? 0) + 1));
      useGame.getState().startGame(aiConfig(mode, [...seats]));
      await runUntil(() => useGame.getState().screen === 'victory');
      expect(useGame.getState().screen).toBe('victory');
      const winner = useGame.getState().victorySeat;
      expect(winner).not.toBeNull();
      // continue for placings until results
      for (let k = 0; k < 4 && useGame.getState().screen !== 'results'; k++) {
        useGame.getState().continueAfterVictory();
        await runUntil(() => ['results', 'victory'].includes(useGame.getState().screen) && !useGame.getState().busy);
        if (useGame.getState().screen === 'victory' && useGame.getState().game?.phase === 'over') {
          useGame.getState().continueAfterVictory();
        }
      }
      const s = useGame.getState();
      expect(s.screen).toBe('results');
      expect(s.game!.phase).toBe('over');
      expect(s.game!.finishOrder).toHaveLength(seats.length);
      expect(s.game!.finishOrder[0]).toBe(winner);
      expect(events.get('diceThrow')).toBeGreaterThan(10);
      expect(events.get('hop')).toBeGreaterThan(10);
      expect(s.history.length).toBeGreaterThan(5);
      off();
    }, 60000);
  }

  it('rejects human input during AI turns and while busy', async () => {
    useGame.getState().startGame({
      mode: 'classic',
      players: [
        { seat: 0, name: 'HUMAN', kind: 'human', difficulty: 'normal' },
        { seat: 2, name: 'BOT', kind: 'ai', difficulty: 'normal' },
      ],
    });
    useGame.getState().rollDice();
    expect(useGame.getState().busy).toBe(true);
    useGame.getState().rollDice(); // ignored while busy
    await runUntil(() => !useGame.getState().busy);
    const g = useGame.getState().game!;
    expect(g.players[0].stats.rolls).toBe(1);
  });
});
