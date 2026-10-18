// ─────────────────────────────────────────────────────────────
// Authoritative game store + turn controller.
// `game` is the single source of truth (produced by the pure engine).
// Everything else here is presentation orchestration: dice/move
// animation handshakes, AI scheduling, screens & history.
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { choosePower, chooseMove, suggestMove, type ScoredMove } from '../game/ai';
import { applyMove, applyRoll, createGame, playerProgress, skipTurn, usePower } from '../game/engine';
import type { GameConfig, GameEvent, GameState, Move, PowerType, Seat } from '../game/types';
import { fx } from '../core/fx';
import { useSettings } from './settings';

export type Screen = 'menu' | 'setup' | 'game' | 'victory' | 'results';

/** Base animation durations in ms (divided by the speed setting). */
export const TIMING = {
  dice: 1150,
  hop: 230,
  enter: 620,
  capture: 900,
  emp: 900,
  finish: 900,
  turnBanner: 650,
  aiThink: 520,
  noMoves: 1000,
  powerUse: 650,
  autoMove: 380,
} as const;

export function scaled(ms: number): number {
  const speed = useSettings.getState().speed || 1;
  return Math.round(ms / speed);
}

export interface DiceView {
  value: number;
  nonce: number;
  seat: Seat;
  durationMs: number;
  rolling: boolean;
}

export interface MovingView {
  move: Move;
  hopMs: number;
  nonce: number;
}

export interface Toast {
  id: number;
  text: string;
  seat: Seat | null;
  tone: 'info' | 'good' | 'bad' | 'epic';
}

export interface ProgressSample {
  turn: number;
  values: [number, number, number, number];
}

export interface GameStore {
  screen: Screen;
  config: GameConfig | null;
  game: GameState | null;
  busy: boolean;
  paused: boolean;
  dice: DiceView | null;
  moving: MovingView | null;
  hoveredToken: number | null;
  hint: ScoredMove | null;
  toasts: Toast[];
  history: ProgressSample[];
  /** Set while the victory cinematic is showing and play may still continue for placings. */
  victorySeat: Seat | null;
  session: number;

  // navigation
  goto: (s: Screen) => void;
  startGame: (config: GameConfig) => void;
  rematch: () => void;
  quitToMenu: () => void;
  continueAfterVictory: () => void;
  setPaused: (p: boolean) => void;

  // player intents (validated)
  rollDice: () => void;
  selectToken: (tokenId: number) => void;
  activatePower: (p: PowerType) => void;
  skip: () => void;
  hoverToken: (tokenId: number | null) => void;
  dismissToast: (id: number) => void;
}

let toastId = 1;
let diceNonce = 1;
let moveNonce = 1;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const useGame = create<GameStore>()((set, get) => {
  // ── internal helpers ──────────────────────────────────────
  const alive = (session: number) => get().session === session;

  /** Sleep that also waits while paused and aborts silently if session changed. */
  async function wait(ms: number, session: number): Promise<boolean> {
    await sleep(ms);
    while (get().paused && alive(session)) await sleep(120);
    return alive(session);
  }

  function toast(text: string, seat: Seat | null, tone: Toast['tone'] = 'info', ttl = 2200) {
    const t: Toast = { id: toastId++, text, seat, tone };
    set((s) => ({ toasts: [...s.toasts.slice(-3), t] }));
    setTimeout(() => get().dismissToast(t.id), ttl);
  }

  function name(seat: Seat) {
    return get().game?.players[seat].name ?? '';
  }

  function sample(game: GameState) {
    const values = [0, 1, 2, 3].map((s) => playerProgress(game, s as Seat)) as ProgressSample['values'];
    set((s) => ({ history: [...s.history, { turn: game.turn, values }] }));
  }

  /** Broadcast engine events + toasts. Returns extra delay needed for presentation. */
  function broadcast(events: GameEvent[]): number {
    let extra = 0;
    for (const e of events) {
      if (e.type === 'move') continue; // announced by moveStart
      fx.emit(e);
      switch (e.type) {
        case 'capture':
          toast(`${name(get().game!.tokens[e.by].seat)} DEREZZED ${name(get().game!.tokens[e.victim].seat)}`, get().game!.tokens[e.by].seat, 'bad');
          extra = Math.max(extra, TIMING.capture);
          break;
        case 'forfeit':
          toast(`TRIPLE SIX — ${name(e.seat)} OVERLOADED`, e.seat, 'bad');
          extra = Math.max(extra, TIMING.noMoves);
          break;
        case 'noMoves':
          toast(`NO VALID MOVES`, e.seat, 'info', 1400);
          extra = Math.max(extra, TIMING.noMoves);
          break;
        case 'finish':
          toast(`${name(e.seat)} REACHED THE CORE`, e.seat, 'good');
          extra = Math.max(extra, TIMING.finish);
          break;
        case 'collect':
          toast(`${e.power.toUpperCase()} ACQUIRED`, e.seat, 'good', 1600);
          break;
        case 'emp':
          if (e.hits.length) toast(`EMP BLAST — ${e.hits.length} UNIT${e.hits.length > 1 ? 'S' : ''} KNOCKED BACK`, e.seat, 'epic');
          else toast('EMP FIZZLED — NO TARGETS', e.seat, 'info', 1400);
          extra = Math.max(extra, TIMING.emp);
          break;
        case 'shieldBlock':
          toast('SHIELD ABSORBED CAPTURE', get().game!.tokens[e.tokenId].seat, 'info');
          break;
        case 'extraTurn':
          if (e.reason !== 'six') toast(e.reason === 'capture' ? 'BONUS ROLL' : 'BONUS ROLL', e.seat, 'good', 1300);
          break;
        case 'playerDone':
          toast(`${name(e.seat)} SECURED RANK ${e.rank}`, e.seat, 'epic', 2600);
          break;
        case 'turn':
          extra = Math.max(extra, TIMING.turnBanner);
          break;
      }
    }
    return extra;
  }

  function refreshHint() {
    const g = get().game;
    if (!g || g.phase !== 'move' || g.players[g.current].kind !== 'human') {
      if (get().hint) set({ hint: null });
      return;
    }
    set({ hint: suggestMove(g) });
  }

  function commit(next: GameState) {
    set({ game: next });
    refreshHint();
  }

  // ── core sequences ────────────────────────────────────────
  async function doRoll(session: number) {
    const g = get().game;
    if (!g || g.phase !== 'roll' || get().busy) return;
    set({ busy: true });
    const raw = 1 + Math.floor(Math.random() * 6);
    const durationMs = scaled(TIMING.dice);
    set({ dice: { value: raw, nonce: diceNonce++, seat: g.current, durationMs, rolling: true } });
    fx.emit({ type: 'diceThrow', seat: g.current, value: raw, durationMs });
    if (!(await wait(durationMs, session))) return;
    set((s) => ({ dice: s.dice ? { ...s.dice, rolling: false } : null }));
    const next = applyRoll(get().game!, raw);
    commit(next);
    const extra = broadcast(next.lastEvents);
    if (extra && !(await wait(scaled(extra), session))) return;
    set({ busy: false });
    advance(session);
  }

  async function doMove(tokenId: number, session: number) {
    const g = get().game;
    if (!g || g.phase !== 'move' || get().busy) return;
    const move = g.legalMoves.find((m) => m.tokenId === tokenId);
    if (!move) return;
    set({ busy: true, hint: null, hoveredToken: null });
    const hopMs = scaled(move.enters ? TIMING.enter : TIMING.hop);
    set({ moving: { move, hopMs, nonce: moveNonce++ } });
    fx.emit({ type: 'moveStart', move, hopMs });
    for (let i = 0; i < move.path.length; i++) {
      if (!(await wait(hopMs, session))) return;
      fx.emit({ type: 'hop', tokenId, seat: move.seat, progress: move.path[i], index: i, total: move.path.length });
    }
    const next = applyMove(get().game!, tokenId);
    set({ moving: null });
    commit(next);
    sample(next);
    const extra = broadcast(next.lastEvents);
    if (extra && !(await wait(scaled(extra), session))) return;
    set({ busy: false });
    if (next.lastEvents.some((e) => e.type === 'win')) {
      const w = next.lastEvents.find((e) => e.type === 'win') as Extract<GameEvent, { type: 'win' }>;
      set({ victorySeat: w.seat, screen: 'victory' });
      fx.emit({ type: 'victoryStart', seat: w.seat });
      return; // wait for player to continue / leave
    }
    if (next.phase === 'over') {
      set({ screen: 'results' });
      return;
    }
    advance(session);
  }

  async function doPower(power: PowerType, session: number) {
    const g = get().game;
    if (!g || get().busy) return;
    const next = usePower(g, power);
    if (next === g) return;
    set({ busy: true });
    commit(next);
    const extra = broadcast(next.lastEvents);
    await wait(scaled(Math.max(extra, TIMING.powerUse)), session);
    if (!alive(session)) return;
    set({ busy: false });
    advance(session);
  }

  async function doSkip(session: number) {
    const g = get().game;
    if (!g || get().busy) return;
    const next = skipTurn(g);
    if (next === g) return;
    set({ busy: true });
    commit(next);
    const extra = broadcast(next.lastEvents);
    if (extra && !(await wait(scaled(extra), session))) return;
    set({ busy: false });
    advance(session);
  }

  /** Decide what happens next: AI acts automatically, humans may auto-move. */
  async function advance(session: number) {
    const g = get().game;
    if (!g || !alive(session) || get().busy) return;
    if (get().screen !== 'game') return;
    if (g.phase === 'over') {
      set({ screen: 'results' });
      return;
    }
    const player = g.players[g.current];
    if (player.kind === 'ai') {
      if (!(await wait(scaled(TIMING.aiThink), session))) return;
      const cur = get().game!;
      if (get().busy || cur.current !== g.current) return;
      const power = choosePower(cur, player.difficulty);
      if (power) return doPower(power, session);
      if (cur.phase === 'roll') return doRoll(session);
      if (cur.phase === 'move') {
        const m = chooseMove(cur, player.difficulty);
        if (m) return doMove(m.tokenId, session);
        return doSkip(session);
      }
      return;
    }
    // human
    if (g.phase === 'move' && g.legalMoves.length === 1 && useSettings.getState().autoMoveSingle) {
      const only = g.legalMoves[0].tokenId;
      const canPower = g.mode === 'nexus' && g.players[g.current].items.some((i) => i === 'boost' || i === 'reroll' || i === 'emp');
      if (canPower) return; // let them decide whether to spend a power-up first
      if (!(await wait(scaled(TIMING.autoMove), session))) return;
      const cur = get().game!;
      if (cur.phase === 'move' && cur.legalMoves.length === 1 && cur.legalMoves[0].tokenId === only) doMove(only, session);
    }
  }

  const isHumanTurn = () => {
    const g = get().game;
    return !!g && g.players[g.current].kind === 'human' && !get().busy && !get().paused && get().screen === 'game';
  };

  return {
    screen: 'menu',
    config: null,
    game: null,
    busy: false,
    paused: false,
    dice: null,
    moving: null,
    hoveredToken: null,
    hint: null,
    toasts: [],
    history: [],
    victorySeat: null,
    session: 0,

    goto: (screen) => set({ screen }),

    startGame: (config) => {
      const game = createGame(config);
      const session = get().session + 1;
      set({
        config,
        game,
        session,
        screen: 'game',
        busy: false,
        paused: false,
        dice: null,
        moving: null,
        hint: null,
        hoveredToken: null,
        toasts: [],
        history: [],
        victorySeat: null,
      });
      sample(game);
      fx.emit({ type: 'gameStart' });
      for (const e of game.lastEvents) fx.emit(e);
      setTimeout(() => advance(session), scaled(1400));
    },

    rematch: () => {
      const c = get().config;
      if (c) get().startGame(c);
    },

    quitToMenu: () =>
      set((s) => ({
        session: s.session + 1,
        screen: 'menu',
        game: null,
        busy: false,
        paused: false,
        dice: null,
        moving: null,
        hint: null,
        victorySeat: null,
        toasts: [],
      })),

    continueAfterVictory: () => {
      const g = get().game;
      if (!g) return;
      if (g.phase === 'over') {
        set({ screen: 'results' });
        return;
      }
      set({ screen: 'game', victorySeat: null });
      advance(get().session);
    },

    setPaused: (paused) => set({ paused }),

    rollDice: () => {
      if (!isHumanTurn() || get().game!.phase !== 'roll') return;
      void doRoll(get().session);
    },

    selectToken: (tokenId) => {
      if (!isHumanTurn()) return;
      void doMove(tokenId, get().session);
    },

    activatePower: (p) => {
      if (!isHumanTurn()) return;
      void doPower(p, get().session);
    },

    skip: () => {
      if (!isHumanTurn()) return;
      void doSkip(get().session);
    },

    hoverToken: (tokenId) => {
      if (get().hoveredToken !== tokenId) set({ hoveredToken: tokenId });
    },

    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  };
});

// Convenience selectors
export const selectCurrentPlayer = (s: GameStore) => (s.game ? s.game.players[s.game.current] : null);
export const selectIsHumanTurn = (s: GameStore) =>
  !!s.game && s.game.players[s.game.current].kind === 'human' && !s.busy && !s.paused && s.screen === 'game';
