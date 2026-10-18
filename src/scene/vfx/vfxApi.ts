// Imperative VFX facade. VFXLayer registers its pooled systems here; any
// scene component (tokens, dice, the fx-bus handlers) can then fire effects.
// Calls made while no layer is mounted are silently ignored.
import * as THREE from 'three';
import { intensityScale, useSettings } from '../../store/settings';
import { BeamSystem, type BeamOpts } from './BeamSystem';
import { BoltSystem, type BoltOpts } from './BoltSystem';
import { DebrisSystem, makeDebrisSpawn } from './DebrisSystem';
import { MOTION_BALLISTIC, MOTION_SPIRAL, ParticleSystem, SHAPE_GLOW, makeSpawn } from './ParticleSystem';
import { RingSystem, type RingOpts } from './RingSystem';

export interface FlashState {
  color: THREE.Color;
  intensity: number;
  decay: number;
  pos: THREE.Vector3;
}

export interface VFXSystems {
  particles: ParticleSystem;
  debris: DebrisSystem;
  rings: RingSystem;
  beams: BeamSystem;
  bolts: BoltSystem;
  flash: FlashState;
}

let sys: VFXSystems | null = null;
let clock = 0;
interface Scheduled {
  at: number;
  fn: () => void;
}
const queue: Scheduled[] = [];

export function registerVFX(s: VFXSystems | null): void {
  sys = s;
  if (!s) queue.length = 0;
}

/** Called by VFXLayer each frame: advances the scheduler clock. */
export function tickScheduler(time: number): void {
  clock = time;
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].at <= time) {
      const job = queue[i];
      queue.splice(i, 1);
      try {
        job.fn();
      } catch (err) {
        console.error('[vfx]', err);
      }
    }
  }
}

/** Run `fn` after `delay` seconds of VFX time. */
export function schedule(delay: number, fn: () => void): void {
  if (!sys) return;
  queue.push({ at: clock + delay, fn });
}

/** Scale an effect budget by the user's intensity setting. */
export function budget(n: number): number {
  return Math.max(1, Math.round(n * intensityScale(useSettings.getState().intensity)));
}

export function fxScale(): number {
  return intensityScale(useSettings.getState().intensity);
}

const colorCache = new Map<string, THREE.Color>();
/** Linear neon colour (hex × multiplier) — cached, treat as read-only. */
export function neon(hex: string, mult = 1): THREE.Color {
  const key = hex + '|' + mult;
  let c = colorCache.get(key);
  if (!c) {
    c = new THREE.Color(hex).multiplyScalar(mult);
    colorCache.set(key, c);
  }
  return c;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const sp = makeSpawn();
const ds = makeDebrisSpawn();

export interface P3 {
  x: number;
  y: number;
  z: number;
}

export interface BurstOpts {
  count: number;
  color: THREE.Color;
  /** Optional second colour; each particle picks randomly. */
  color2?: THREE.Color;
  speed?: [number, number];
  size?: [number, number];
  life?: [number, number];
  gravity?: number;
  drag?: number;
  shape?: number;
  /** sphere: all dirs, hemi: upper half, ring: horizontal, up: narrow cone up */
  mode?: 'sphere' | 'hemi' | 'ring' | 'up';
  /** Spawn jitter radius. */
  spread?: number;
  delay?: number;
  /** Apply intensity scaling to count (default true). */
  scaled?: boolean;
}

/** Ballistic particle burst. */
export function burst(at: P3, o: BurstOpts): void {
  if (!sys) return;
  const n = o.scaled === false ? o.count : budget(o.count);
  const [s0, s1] = o.speed ?? [1, 3];
  const [z0, z1] = o.size ?? [0.06, 0.14];
  const [l0, l1] = o.life ?? [0.4, 0.9];
  const mode = o.mode ?? 'sphere';
  const spread = o.spread ?? 0;
  for (let i = 0; i < n; i++) {
    let dx: number;
    let dy: number;
    let dz: number;
    if (mode === 'ring') {
      const a = Math.random() * Math.PI * 2;
      dx = Math.cos(a);
      dz = Math.sin(a);
      dy = rnd(0.05, 0.35);
    } else if (mode === 'up') {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.35;
      dx = Math.cos(a) * r;
      dz = Math.sin(a) * r;
      dy = 1;
    } else {
      // uniform sphere
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      dx = Math.cos(a) * r;
      dz = Math.sin(a) * r;
      dy = mode === 'hemi' ? Math.abs(u) : u;
    }
    const len = Math.hypot(dx, dy, dz) || 1;
    const v = rnd(s0, s1) / len;
    const c = o.color2 && Math.random() < 0.5 ? o.color2 : o.color;
    sp.x = at.x + (Math.random() - 0.5) * spread;
    sp.y = at.y + (Math.random() - 0.5) * spread * 0.5;
    sp.z = at.z + (Math.random() - 0.5) * spread;
    sp.vx = dx * v;
    sp.vy = dy * v;
    sp.vz = dz * v;
    sp.r = c.r;
    sp.g = c.g;
    sp.b = c.b;
    sp.life = rnd(l0, l1);
    sp.size = rnd(z0, z1);
    sp.gravity = o.gravity ?? -4;
    sp.drag = o.drag ?? 2;
    sp.shape = o.shape ?? SHAPE_GLOW;
    sp.motion = MOTION_BALLISTIC;
    sp.spin = Math.random();
    sp.delay = (o.delay ?? 0) + Math.random() * 0.03;
    sys.particles.spawn(sp);
  }
}

export interface SpiralOpts {
  count: number;
  color: THREE.Color;
  color2?: THREE.Color;
  radius?: number;
  rise?: number;
  life?: [number, number];
  size?: [number, number];
  delay?: number;
}

/** Particles orbit inward while rising — absorption / power-up effect. */
export function spiral(at: P3, o: SpiralOpts): void {
  if (!sys) return;
  const n = budget(o.count);
  const [l0, l1] = o.life ?? [0.7, 1.1];
  const [z0, z1] = o.size ?? [0.05, 0.12];
  for (let i = 0; i < n; i++) {
    const c = o.color2 && Math.random() < 0.4 ? o.color2 : o.color;
    sp.x = at.x;
    sp.y = at.y + rnd(-0.05, 0.2);
    sp.z = at.z;
    sp.vx = (o.radius ?? 1.2) * rnd(0.7, 1.15);
    sp.vy = rnd(4, 7) * (Math.random() < 0.5 ? 1 : 1.2);
    sp.vz = (o.rise ?? 0.8) * rnd(0.6, 1.2);
    sp.r = c.r;
    sp.g = c.g;
    sp.b = c.b;
    sp.life = rnd(l0, l1);
    sp.size = rnd(z0, z1);
    sp.gravity = 0;
    sp.drag = 0;
    sp.shape = SHAPE_GLOW;
    sp.motion = MOTION_SPIRAL;
    sp.spin = Math.random() * Math.PI * 2;
    sp.delay = (o.delay ?? 0) + Math.random() * 0.25;
    sys.particles.spawn(sp);
  }
}

export interface DebrisOpts {
  count: number;
  color: THREE.Color;
  color2?: THREE.Color;
  speed?: [number, number];
  size?: [number, number];
  life?: [number, number];
  gravity?: number;
  drag?: number;
  /** 'voxel' cubes or flat 'shard' confetti */
  kind?: 'voxel' | 'shard';
  spread?: number;
  upBias?: number;
  bounce?: boolean;
  scaled?: boolean;
}

/** Tumbling instanced voxels / shards. */
export function debris(at: P3, o: DebrisOpts): void {
  if (!sys) return;
  const n = o.scaled === false ? o.count : budget(o.count);
  const [s0, s1] = o.speed ?? [1.5, 3.5];
  const [z0, z1] = o.size ?? [0.05, 0.11];
  const [l0, l1] = o.life ?? [0.9, 1.6];
  const spread = o.spread ?? 0.2;
  const up = o.upBias ?? 0.8;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const h = Math.random();
    const v = rnd(s0, s1);
    const c = o.color2 && Math.random() < 0.4 ? o.color2 : o.color;
    ds.x = at.x + (Math.random() - 0.5) * spread;
    ds.y = at.y + Math.random() * spread;
    ds.z = at.z + (Math.random() - 0.5) * spread;
    ds.vx = Math.cos(a) * v * (1 - h * up * 0.6);
    ds.vz = Math.sin(a) * v * (1 - h * up * 0.6);
    ds.vy = v * (up * (0.5 + h)) + (Math.random() - 0.5);
    const s = rnd(z0, z1);
    if (o.kind === 'shard') {
      ds.sx = s * 1.4;
      ds.sy = s * 0.12;
      ds.sz = s * 0.7;
    } else {
      ds.sx = ds.sy = ds.sz = s;
    }
    ds.r = c.r;
    ds.g = c.g;
    ds.b = c.b;
    ds.life = rnd(l0, l1);
    ds.gravity = o.gravity ?? -9;
    ds.drag = o.drag ?? 0.6;
    ds.spin = o.kind === 'shard' ? 7 : 10;
    ds.bounce = o.bounce ?? true;
    sys.debris.spawn(ds);
  }
}

export function ring(o: RingOpts): void {
  sys?.rings.spawn(o);
}

export function beam(o: BeamOpts): void {
  sys?.beams.spawn(o);
}

export function bolt(o: BoltOpts): void {
  sys?.bolts.spawn(o);
}

/** Radial lightning: `n` bolts from a centre to random points on a ring. */
export function boltStar(at: P3, n: number, r0: number, r1: number, color: THREE.Color, life = 0.32, width = 0.05, yEnd = 0.08): void {
  if (!sys) return;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.8;
    const r = rnd(r0, r1);
    sys.bolts.spawn({
      ax: at.x,
      ay: at.y,
      az: at.z,
      bx: at.x + Math.cos(a) * r,
      by: yEnd,
      bz: at.z + Math.sin(a) * r,
      color,
      life: life * rnd(0.7, 1.2),
      width,
      jitter: 0.18,
      delay: Math.random() * 0.08,
    });
  }
}

/** Short-lived point-light flash (single shared light). */
export function flash(at: P3, color: THREE.Color, intensity: number, decay = 6): void {
  if (!sys) return;
  const f = sys.flash;
  if (intensity < f.intensity * 0.6) return;
  f.pos.set(at.x, at.y, at.z);
  f.color.copy(color);
  f.intensity = intensity * fxScale();
  f.decay = decay;
}
