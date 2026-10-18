// OWNER: actors/VFX agent.
// Pooled GPU effect layer. Mounts the particle / debris / ring / beam / bolt
// systems once, registers them with the imperative vfxApi and maps every fx
// bus event to a choreographed effect.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fx } from '../../core/fx';
import { PALETTE, POWER_THEME, SEAT_THEME } from '../../core/theme';
import { baseCenterWorld, finishWorld, progressToWorld, trackCellWorld } from '../../game/board';
import type { Seat } from '../../game/types';
import { useGame } from '../../store/game';
import { diceAnchor } from '../actors/diceState';
import { BeamSystem } from './BeamSystem';
import { BoltSystem } from './BoltSystem';
import { DebrisSystem } from './DebrisSystem';
import { ParticleSystem, SHAPE_SHARD, SHAPE_STAR } from './ParticleSystem';
import { RING_ELECTRIC, RING_HEX, RingSystem } from './RingSystem';
import {
  beam,
  bolt,
  boltStar,
  budget,
  burst,
  debris,
  flash,
  neon,
  registerVFX,
  ring,
  schedule,
  spiral,
  tickScheduler,
  type VFXSystems,
} from './vfxApi';

const seatOf = (tokenId: number) => Math.floor(tokenId / 4) as Seat;
const seatHex = (s: Seat) => SEAT_THEME[s].color;
const GOLD = '#ffd54a';
const WHITE = '#e8f6ff';

/** Live world position of a token from the committed game state. */
function tokenWorld(tokenId: number, y = 0.3) {
  const g = useGame.getState().game;
  const seat = seatOf(tokenId);
  const progress = g ? g.tokens[tokenId].progress : -1;
  return progressToWorld(seat, progress, tokenId % 4, y);
}

// ── Effect choreography per fx event ─────────────────────────
function onHop(seat: Seat, tokenId: number, progress: number) {
  if (progress >= 56) return; // finish handles the core
  const p = progressToWorld(seat, progress, tokenId % 4, 0.09);
  const c = neon(seatHex(seat), 3);
  ring({ x: p.x, y: 0.075, z: p.z, radius: 0.62, duration: 0.38, color: c, thickness: 0.08, opacity: 0.9 });
  burst(p, { count: 14, color: c, color2: neon(WHITE, 2), mode: 'ring', speed: [1.2, 2.4], size: [0.04, 0.09], life: [0.2, 0.42], gravity: -3, drag: 4 });
}

function onEnter(seat: Seat) {
  const p = progressToWorld(seat, 0, 0, 0.1);
  const c = neon(seatHex(seat), 3);
  beam({ x: p.x, z: p.z, radius: 0.42, height: 4.5, duration: 0.9, color: c });
  ring({ x: p.x, z: p.z, radius: 1.7, duration: 0.6, color: c, style: RING_ELECTRIC, thickness: 0.12 });
  ring({ x: p.x, z: p.z, radius: 0.9, duration: 0.5, color: neon(WHITE, 2), thickness: 0.1, delay: 0.05 });
  burst(p, { count: 50, color: c, color2: neon(WHITE, 2.5), mode: 'hemi', speed: [1.5, 4], size: [0.05, 0.12], life: [0.4, 0.9], gravity: -5, drag: 2.5 });
  flash({ x: p.x, y: 1, z: p.z }, neon(seatHex(seat), 1), 18);
}

function onCapture(by: number, victim: number, cell: number) {
  const atk = seatOf(by);
  const vic = seatOf(victim);
  const p = trackCellWorld(cell, 0.3);
  const ca = neon(seatHex(atk), 3);
  const cv = neon(seatHex(vic), 3);
  // electric shockwave sweeping across the board
  ring({ x: p.x, y: 0.09, z: p.z, radius: 6, duration: 1.0, color: ca, style: RING_ELECTRIC, thickness: 0.22 });
  ring({ x: p.x, y: 0.1, z: p.z, radius: 3.2, duration: 0.7, color: cv, style: RING_ELECTRIC, thickness: 0.14, delay: 0.08 });
  ring({ x: p.x, y: 0.11, z: p.z, radius: 1.4, duration: 0.45, color: neon(WHITE, 3), thickness: 0.2 });
  // lightning bolts arcing out over the tiles
  boltStar(p, Math.max(3, budget(8)), 1.2, 3.4, ca, 0.38, 0.06);
  boltStar({ x: p.x, y: 1.6, z: p.z }, Math.max(2, budget(3)), 0.1, 0.6, neon(WHITE, 2), 0.25, 0.07, 0.25);
  // victim's chassis shatters into voxels
  debris(p, { count: 46, color: cv, color2: neon(PALETTE.metalLight, 1.4), speed: [1.6, 4.2], size: [0.05, 0.12], life: [0.9, 1.7] });
  burst(p, { count: 90, color: cv, color2: ca, speed: [2, 6], size: [0.05, 0.13], life: [0.3, 0.8], gravity: -6, drag: 3 });
  burst(p, { count: 30, color: neon(WHITE, 3), speed: [3, 7], size: [0.08, 0.18], life: [0.15, 0.35], shape: SHAPE_STAR, drag: 5, gravity: 0 });
  beam({ x: p.x, z: p.z, radius: 0.35, height: 3.2, duration: 0.45, color: cv });
  flash(p, neon(seatHex(atk), 1), 40, 5);
}

function onFinish(seat: Seat, tokenId: number) {
  const f = finishWorld(seat, tokenId % 4, 0.2);
  const c = neon(seatHex(seat), 3);
  beam({ x: 0, z: 0, radius: 0.9, height: 8, duration: 1.7, color: c });
  beam({ x: 0, z: 0, radius: 0.35, height: 9, duration: 1.4, color: neon(WHITE, 2), delay: 0.05 });
  ring({ x: 0, z: 0, radius: 2.4, duration: 0.8, color: c, style: RING_HEX, thickness: 0.18 });
  ring({ x: 0, z: 0, y: 0.2, radius: 1.4, duration: 1.2, color: c, rise: 2.5, thickness: 0.08, delay: 0.1 });
  ring({ x: 0, z: 0, y: 0.2, radius: 1.1, duration: 1.2, color: neon(WHITE, 2), rise: 3.5, thickness: 0.06, delay: 0.3 });
  burst({ x: f.x, y: 0.4, z: f.z }, { count: 140, color: c, color2: neon(GOLD, 2.5), mode: 'up', speed: [3.5, 7], size: [0.05, 0.13], life: [0.8, 1.5], gravity: -7, drag: 0.6, spread: 0.6 });
  burst({ x: 0, y: 0.5, z: 0 }, { count: 40, color: neon(WHITE, 2), speed: [1, 3], shape: SHAPE_STAR, size: [0.1, 0.2], life: [0.3, 0.7], gravity: 0 });
  flash({ x: 0, y: 1.5, z: 0 }, neon(seatHex(seat), 1), 35, 3);
}

function onSix(seat: Seat) {
  const p = { x: diceAnchor.x, y: diceAnchor.y, z: diceAnchor.z };
  const gold = neon(GOLD, 3);
  const cyan = neon(PALETTE.cyan, 3);
  burst(p, { count: 90, color: gold, color2: cyan, speed: [2, 5], size: [0.05, 0.13], life: [0.4, 0.9], gravity: -2, drag: 2.5 });
  burst(p, { count: 24, color: neon(WHITE, 3), speed: [1, 3], shape: SHAPE_STAR, size: [0.12, 0.24], life: [0.3, 0.6], gravity: 0, drag: 3 });
  for (let i = 0; i < 3; i++) {
    ring({ x: p.x, z: p.z, y: 0.1, radius: 1.1 + i * 0.25, duration: 1.0, color: i % 2 ? cyan : gold, rise: 1.8 + i * 0.4, thickness: 0.07, delay: i * 0.14 });
  }
  ring({ x: p.x, z: p.z, radius: 2.4, duration: 0.7, color: gold, style: RING_ELECTRIC, thickness: 0.14 });
  beam({ x: p.x, z: p.z, radius: 0.55, height: 3.5, duration: 0.8, color: gold });
  boltStar(p, Math.max(2, budget(6)), 0.8, 1.8, cyan, 0.3, 0.045);
  flash(p, neon(GOLD, 1), 28, 4);
  void seat;
}

function onCollect(seat: Seat, tokenId: number, power: keyof typeof POWER_THEME, cell: number) {
  const p = trackCellWorld(cell, 0.08);
  const c = neon(POWER_THEME[power].color, 3);
  spiral(p, { count: 70, color: c, color2: neon(WHITE, 2), radius: 1.4, rise: 0.9 });
  ring({ x: p.x, z: p.z, radius: 1.5, duration: 0.7, color: c, style: RING_HEX, thickness: 0.1 });
  ring({ x: p.x, z: p.z, radius: 0.8, duration: 0.5, color: c, delay: 0.7, thickness: 0.12 });
  beam({ x: p.x, z: p.z, radius: 0.3, height: 2.2, duration: 0.9, color: c, delay: 0.55 });
  schedule(0.75, () => burst({ x: p.x, y: 0.7, z: p.z }, { count: 30, color: c, speed: [1, 2.5], life: [0.3, 0.6], gravity: -2 }));
  void seat;
  void tokenId;
}

function onEmp(seat: Seat, sources: number[], hits: { tokenId: number; from: number; to: number }[]) {
  const mag = neon(PALETTE.magenta, 3);
  const em = neon(POWER_THEME.emp.color, 3);
  if (!sources.length) {
    const b = baseCenterWorld(seat, 0.1);
    ring({ x: b.x, z: b.z, radius: 2.2, duration: 0.8, color: em, style: RING_ELECTRIC, thickness: 0.1, opacity: 0.6 });
    return;
  }
  for (const id of sources) {
    const p = tokenWorld(id, 0.4);
    ring({ x: p.x, z: p.z, y: 0.1, radius: 5.2, duration: 1.1, color: em, style: RING_ELECTRIC, thickness: 0.3 });
    ring({ x: p.x, z: p.z, y: 0.12, radius: 3.4, duration: 0.9, color: neon(WHITE, 2), thickness: 0.12, delay: 0.1 });
    ring({ x: p.x, z: p.z, y: 0.14, radius: 2, duration: 0.8, color: mag, style: RING_HEX, thickness: 0.1, delay: 0.18 });
    burst(p, { count: 50, color: mag, mode: 'ring', speed: [3, 6], life: [0.4, 0.8], drag: 2, gravity: 0 });
    boltStar(p, Math.max(2, budget(5)), 0.8, 2.4, mag, 0.4);
    flash(p, neon(PALETTE.magenta, 1), 32, 4);
  }
  // crackle on each victim as the pulse reaches it
  hits.forEach((h, i) => {
    const s = seatOf(h.tokenId);
    const p = progressToWorld(s, h.from, h.tokenId % 4, 0.4);
    schedule(0.15 + i * 0.06, () => {
      for (let k = 0; k < Math.max(2, budget(4)); k++) {
        const a = Math.random() * Math.PI * 2;
        bolt({ ax: p.x, ay: p.y + 0.3, az: p.z, bx: p.x + Math.cos(a) * 0.55, by: 0.1 + Math.random() * 0.5, bz: p.z + Math.sin(a) * 0.55, color: mag, life: 0.35, width: 0.035, jitter: 0.3, delay: k * 0.05 });
      }
      burst(p, { count: 28, color: mag, color2: neon(seatHex(s), 3), speed: [1, 3], shape: SHAPE_SHARD, life: [0.3, 0.6], gravity: -4 });
    });
  });
}

function onShieldBlock(cell: number) {
  const p = trackCellWorld(cell, 0.4);
  const c = neon(POWER_THEME.shield.color, 3);
  ring({ x: p.x, z: p.z, radius: 1.3, duration: 0.7, color: c, style: RING_HEX, thickness: 0.12 });
  ring({ x: p.x, z: p.z, y: 0.3, radius: 0.8, duration: 0.6, color: c, rise: 0.8, thickness: 0.06 });
  burst(p, { count: 40, color: c, color2: neon(WHITE, 2), speed: [1.5, 3.5], shape: SHAPE_SHARD, life: [0.3, 0.6], gravity: -3 });
  flash(p, neon(POWER_THEME.shield.color, 1), 20);
}

function onTurn(seat: Seat) {
  const b = baseCenterWorld(seat);
  const c = neon(seatHex(seat), 2.5);
  ring({ x: b.x, z: b.z, y: 0.08, radius: 3.3, duration: 1.0, color: c, thickness: 0.16, opacity: 0.8 });
  ring({ x: b.x, z: b.z, y: 0.08, radius: 2.2, duration: 0.8, color: c, thickness: 0.08, opacity: 0.6, delay: 0.12 });
}

function onDiceThrow() {
  const p = { x: diceAnchor.x, y: diceAnchor.y, z: diceAnchor.z };
  burst(p, { count: 16, color: neon(WHITE, 2), speed: [0.5, 1.5], life: [0.2, 0.4], gravity: 0, drag: 4 });
}

function onForfeit() {
  const p = { x: diceAnchor.x, y: diceAnchor.y, z: diceAnchor.z };
  const red = neon(PALETTE.danger, 3);
  boltStar(p, Math.max(3, budget(7)), 0.6, 1.6, red, 0.5, 0.05);
  ring({ x: p.x, z: p.z, radius: 2, duration: 0.8, color: red, style: RING_ELECTRIC, thickness: 0.14 });
  burst(p, { count: 40, color: red, speed: [1, 3], shape: SHAPE_SHARD, life: [0.4, 0.9], gravity: -6 });
  flash(p, neon(PALETTE.danger, 1), 25);
}

function onUsePower(seat: Seat, power: keyof typeof POWER_THEME) {
  if (power === 'emp') return; // the emp event carries the big effect
  const b = baseCenterWorld(seat, 0.1);
  const c = neon(POWER_THEME[power].color, 3);
  ring({ x: b.x, z: b.z, radius: 2.4, duration: 0.8, color: c, style: RING_HEX, thickness: 0.12 });
  spiral({ x: b.x, y: 0.1, z: b.z }, { count: 40, color: c, radius: 2, rise: 1.6 });
  if (power === 'boost' || power === 'reroll') {
    const p = { x: diceAnchor.x, y: diceAnchor.y, z: diceAnchor.z };
    boltStar(p, Math.max(2, budget(4)), 0.5, 1.2, c, 0.35, 0.04);
    burst(p, { count: 30, color: c, speed: [1, 3], life: [0.3, 0.6] });
  }
}

function onSpawnPower(cell: number, power: keyof typeof POWER_THEME) {
  const p = trackCellWorld(cell, 0.08);
  const c = neon(POWER_THEME[power].color, 3);
  beam({ x: p.x, z: p.z, radius: 0.3, height: 2.6, duration: 0.8, color: c });
  ring({ x: p.x, z: p.z, radius: 0.9, duration: 0.6, color: c, style: RING_HEX, thickness: 0.08 });
}

function onGameStart() {
  const c = neon(PALETTE.cyan, 2.5);
  ring({ x: 0, z: 0, y: 0.08, radius: 10, duration: 1.8, color: c, thickness: 0.25, opacity: 0.8 });
  ring({ x: 0, z: 0, y: 0.08, radius: 10, duration: 2.1, color: neon(PALETTE.purple, 2.5), thickness: 0.12, delay: 0.25, opacity: 0.7 });
  beam({ x: 0, z: 0, radius: 0.8, height: 6, duration: 1.6, color: c });
}

/** Fireworks, neon confetti and light pillars in the winner's colour. */
function onVictory(seat: Seat) {
  const win = neon(seatHex(seat), 3);
  const glow = neon(SEAT_THEME[seat].glow, 2.5);
  const white = neon(WHITE, 2.5);
  const gold = neon(GOLD, 2.5);
  // light pillars at every base and the core
  for (const s of [0, 1, 2, 3] as Seat[]) {
    const b = baseCenterWorld(s);
    beam({ x: b.x, z: b.z, radius: 0.7, height: 14, duration: 6, color: win, delay: 0.1 * s, opacity: 0.8 });
  }
  beam({ x: 0, z: 0, radius: 1.3, height: 16, duration: 6.5, color: win });
  beam({ x: 0, z: 0, radius: 0.5, height: 18, duration: 6.5, color: white });
  ring({ x: 0, z: 0, radius: 11, duration: 2, color: win, style: RING_ELECTRIC, thickness: 0.35 });
  flash({ x: 0, y: 3, z: 0 }, neon(seatHex(seat), 1), 60, 1.5);

  const shells = Math.max(6, Math.round(budget(26)));
  for (let i = 0; i < shells; i++) {
    const t = 0.2 + i * (6.5 / shells) + Math.random() * 0.15;
    schedule(t, () => {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 5;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = 3 + Math.random() * 2.5;
      const climb = 0.55;
      // rising tracer
      burst({ x, y: 0.2, z }, { count: 10, color: glow, mode: 'up', speed: [h / climb - 0.5, h / climb], size: [0.06, 0.1], life: [climb * 0.8, climb], gravity: 0, drag: 0.01, scaled: false });
      schedule(climb, () => {
        const p = { x, y: h, z };
        const c2 = Math.random() < 0.3 ? gold : Math.random() < 0.5 ? white : glow;
        burst(p, { count: 110, color: win, color2: c2, speed: [2.5, 4.5], size: [0.07, 0.15], life: [0.9, 1.6], gravity: -2.2, drag: 1.4 });
        burst(p, { count: 18, color: white, speed: [0.5, 2], shape: SHAPE_STAR, size: [0.15, 0.3], life: [0.3, 0.6], gravity: 0 });
        debris(p, { count: 14, color: win, color2: c2, kind: 'shard', speed: [1.5, 3.5], size: [0.08, 0.14], life: [2, 3.2], gravity: -1.8, drag: 1.6, bounce: false, upBias: 0.4 });
        ring({ x, z, y: h, radius: 1.6, duration: 0.7, color: win, thickness: 0.1 });
        flash(p, neon(seatHex(seat), 1), 22, 5);
      });
    });
  }
  // neon confetti rain
  const waves = 8;
  for (let w = 0; w < waves; w++) {
    schedule(0.4 + w * 0.6, () => {
      for (let k = 0; k < 3; k++) {
        const x = (Math.random() - 0.5) * 12;
        const z = (Math.random() - 0.5) * 12;
        debris({ x, y: 7, z }, { count: 10, color: win, color2: Math.random() < 0.5 ? white : gold, kind: 'shard', speed: [0.3, 1.2], size: [0.1, 0.18], life: [3, 4.5], gravity: -1.2, drag: 1.8, bounce: true, upBias: 0, spread: 3 });
      }
    });
  }
}

export function VFXLayer() {
  const systems = useMemo<VFXSystems>(
    () => ({
      particles: new ParticleSystem(9000),
      debris: new DebrisSystem(800),
      rings: new RingSystem(40),
      beams: new BeamSystem(20),
      bolts: new BoltSystem(48),
      flash: { color: new THREE.Color(), intensity: 0, decay: 6, pos: new THREE.Vector3() },
    }),
    [],
  );
  const light = useRef<THREE.PointLight>(null);
  const time = useRef(0);

  useEffect(() => {
    registerVFX(systems);
    return () => registerVFX(null);
  }, [systems]);

  useEffect(
    () => () => {
      systems.particles.dispose();
      systems.debris.dispose();
      systems.rings.dispose();
      systems.beams.dispose();
      systems.bolts.dispose();
    },
    [systems],
  );

  // Map fx bus → effects.
  useEffect(() => {
    const offs = [
      fx.on('hop', (e) => onHop(e.seat, e.tokenId, e.progress)),
      fx.on('moveStart', (e) => {
        if (!e.move.enters) return;
        const p = progressToWorld(e.move.seat, 0, 0);
        beam({ x: p.x, z: p.z, radius: 0.14, height: 6, duration: e.hopMs / 1000 + 0.25, color: neon(seatHex(e.move.seat), 3), opacity: 0.8 });
        ring({ x: p.x, z: p.z, radius: 0.7, duration: e.hopMs / 1000, color: neon(seatHex(e.move.seat), 2.5), style: RING_HEX, thickness: 0.06 });
      }),
      fx.on('enter', (e) => onEnter(e.seat)),
      fx.on('capture', (e) => onCapture(e.by, e.victim, e.cell)),
      fx.on('finish', (e) => onFinish(e.seat, e.tokenId)),
      fx.on('six', (e) => onSix(e.seat)),
      fx.on('collect', (e) => onCollect(e.seat, e.tokenId, e.power, e.cell)),
      fx.on('emp', (e) => onEmp(e.seat, e.sources, e.hits)),
      fx.on('shieldBlock', (e) => onShieldBlock(e.cell)),
      fx.on('turn', (e) => onTurn(e.seat)),
      fx.on('diceThrow', () => onDiceThrow()),
      fx.on('forfeit', () => onForfeit()),
      fx.on('usePower', (e) => onUsePower(e.seat, e.power)),
      fx.on('spawnPower', (e) => onSpawnPower(e.cell, e.power)),
      fx.on('gameStart', () => onGameStart()),
      fx.on('victoryStart', (e) => onVictory(e.seat)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    time.current += dt;
    const t = time.current;
    tickScheduler(t);
    // world-size → pixel conversion for point sprites
    const cam = state.camera as THREE.PerspectiveCamera;
    const fov = cam.isPerspectiveCamera ? cam.fov : 45;
    const sizeScale = (state.size.height * state.viewport.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    systems.particles.update(t, sizeScale);
    systems.debris.update(dt);
    systems.rings.update(dt, t);
    systems.beams.update(dt, t);
    systems.bolts.update(dt, state.camera.position);
    const f = systems.flash;
    f.intensity *= Math.exp(-f.decay * dt);
    if (f.intensity < 0.01) f.intensity = 0;
    const l = light.current;
    if (l) {
      l.intensity = f.intensity;
      l.color.copy(f.color);
      l.position.copy(f.pos);
    }
  });

  return (
    <group name="vfx-layer">
      <primitive object={systems.particles.points} />
      <primitive object={systems.debris.mesh} />
      <primitive object={systems.rings.group} />
      <primitive object={systems.beams.group} />
      <primitive object={systems.bolts.group} />
      <pointLight ref={light} intensity={0} distance={9} decay={1.6} />
    </group>
  );
}
