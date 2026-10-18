// ─────────────────────────────────────────────────────────────
// Shared scene state: global shader uniforms, seat colours, effect
// budget helpers and small hooks used across the world components.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SEAT_THEME, PALETTE } from '../../core/theme';
import { fx, type FxEvent, type FxType } from '../../core/fx';
import type { PowerType, Seat } from '../../game/types';
import { useSettings, intensityScale } from '../../store/settings';
import { useView, type QualityTier } from '../../store/view';

export const SEATS: readonly Seat[] = [0, 1, 2, 3];

/** Global animated time uniform — shared by reference across every ShaderMaterial. */
export const uTime: { value: number } = { value: 0 };

/** Current-turn tint (lerped by <Lighting/>) — shared by reference as a uniform. */
export const turnColor = new THREE.Color(SEAT_THEME[0].color);
export const uTurnColor: { value: THREE.Color } = { value: turnColor };

/** 0..1 "victory/celebration" energy level, eased by <Lighting/>. */
export const uEnergy: { value: number } = { value: 0 };

export const SEAT_COLORS: readonly THREE.Color[] = SEATS.map((s) => new THREE.Color(SEAT_THEME[s].color));
export const SEAT_DEEP: readonly THREE.Color[] = SEATS.map((s) => new THREE.Color(SEAT_THEME[s].deep));

export const COLOR = {
  bg: new THREE.Color(PALETTE.bg),
  fog: new THREE.Color('#080622'),
  cyan: new THREE.Color(PALETTE.cyan),
  purple: new THREE.Color(PALETTE.purple),
  magenta: new THREE.Color(PALETTE.magenta),
  amber: new THREE.Color(PALETTE.amber),
  danger: new THREE.Color(PALETTE.danger),
  safe: new THREE.Color(PALETTE.safe),
  white: new THREE.Color(PALETTE.white),
} as const;

/** Scene fog density (FogExp2) — also mirrored inside custom shaders. */
export const FOG_DENSITY = 0.0145;

/** Floor plane height (the board floats above it). */
export const FLOOR_Y = -6.5;

/** Board slab thickness under the y=0 top surface. */
export const SLAB_DEPTH = 0.75;

/** Glyph ids understood by the GLSL `glyph()` function. */
export const GLYPH = {
  shield: 0,
  boost: 1,
  reroll: 2,
  emp: 3,
  crosshair: 4,
  warning: 5,
  star: 6,
  core: 7,
} as const;

export const POWER_GLYPH: Record<PowerType, number> = {
  shield: GLYPH.shield,
  boost: GLYPH.boost,
  reroll: GLYPH.reroll,
  emp: GLYPH.emp,
};

// ── Effect budget ──────────────────────────────────────────────
const TIER_RANK: Record<QualityTier, number> = { low: 0, medium: 1, high: 2 };
const RANK_TIER: QualityTier[] = ['low', 'medium', 'high'];

export interface Budget {
  /** Effective tier = min(user intensity, measured GPU quality). */
  tier: QualityTier;
  /** Particle / instance multiplier. */
  scale: number;
}

/** Reactive effect budget combining the intensity setting and runtime quality tier. */
export function useBudget(): Budget {
  const intensity = useSettings((s) => s.intensity);
  const quality = useView((s) => s.quality);
  return useMemo(() => {
    const tier = RANK_TIER[Math.min(TIER_RANK[intensity], TIER_RANK[quality])];
    const q = quality === 'low' ? 0.5 : quality === 'medium' ? 0.8 : 1;
    return { tier, scale: intensityScale(intensity) * q };
  }, [intensity, quality]);
}

// ── Hooks ──────────────────────────────────────────────────────

/** Subscribe to an fx bus event with an always-fresh handler (no resubscribe churn). */
export function useFx<T extends FxType>(type: T, handler: (e: Extract<FxEvent, { type: T }>) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => fx.on(type, (e) => ref.current(e)), [type]);
}

/** useMemo for GPU resources that disposes the previous value on change / unmount. */
export function useDisposable<T extends { dispose: () => void }>(factory: () => T, deps: readonly unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(factory, deps);
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

/** Frame-rate independent exponential damping. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Deterministic pseudo random generator (mulberry32) for stable procedural layouts. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
