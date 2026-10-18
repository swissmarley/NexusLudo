// ─────────────────────────────────────────────────────────────
// FX bus — a tiny typed event emitter that broadcasts gameplay
// moments to presentation layers (VFX, audio, camera, UI toasts).
// Presentation NEVER mutates game state from here.
// ─────────────────────────────────────────────────────────────
import type { GameEvent, Move, Seat } from '../game/types';

export type FxEvent =
  | GameEvent
  /** Die thrown — the 3D die should tumble and land on `value` within `durationMs`. */
  | { type: 'diceThrow'; seat: Seat; value: number; durationMs: number }
  /** A token begins animating along `move.path`, each hop lasting `hopMs`. */
  | { type: 'moveStart'; move: Move; hopMs: number }
  /** Fired by the controller on every hop landing (for footstep SFX / tile pulses). */
  | { type: 'hop'; tokenId: number; seat: Seat; progress: number; index: number; total: number }
  | { type: 'uiClick' }
  | { type: 'uiHover' }
  | { type: 'gameStart' }
  | { type: 'victoryStart'; seat: Seat };

export type FxType = FxEvent['type'];
type Handler<T extends FxType> = (e: Extract<FxEvent, { type: T }>) => void;
type AnyHandler = (e: FxEvent) => void;

class FxBus {
  private handlers = new Map<FxType, Set<(e: FxEvent) => void>>();
  private any = new Set<AnyHandler>();

  on<T extends FxType>(type: T, h: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    const fn = h as (e: FxEvent) => void;
    set.add(fn);
    return () => set!.delete(fn);
  }

  onAny(h: AnyHandler): () => void {
    this.any.add(h);
    return () => this.any.delete(h);
  }

  emit(e: FxEvent): void {
    this.handlers.get(e.type)?.forEach((h) => {
      try {
        h(e);
      } catch (err) {
        console.error('[fx]', e.type, err);
      }
    });
    this.any.forEach((h) => h(e));
  }
}

export const fx = new FxBus();
