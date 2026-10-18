// Holographic movement-path preview: animated dashed ribbon + chevrons over
// every cell of the hovered (or hinted) legal move, ending at a destination
// marker with a context glyph (capture / shield / power / finish / danger).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { progressToWorld, trackCell, type Vec3 } from '../../game/board';
import { threatCount } from '../../game/engine';
import type { Move } from '../../game/types';
import { POWER_THEME } from '../../core/theme';
import { useGame } from '../../store/game';
import { useSettings } from '../../store/settings';
import { COLOR, GLYPH, POWER_GLYPH, SEAT_COLORS, damp, uTime, useDisposable } from './shared';
import {
  chevronFrag,
  chevronVert,
  columnFrag,
  columnVert,
  glyphFrag,
  holoVert,
  markerFrag,
  pathRibbonFrag,
  pathRibbonVert,
} from './shaders/holo';

const MAX_CHEVRONS = 16;
const Y = 0.075;
const RIBBON_W = 0.16;

interface PreviewInfo {
  points: Vec3[];
  color: THREE.Color;
  glyph: number | null;
  glyphColor: THREE.Color;
  length: number;
}

function buildInfo(move: Move): PreviewInfo {
  const index = move.tokenId % 4;
  const points: Vec3[] = [progressToWorld(move.seat, move.from, index, Y)];
  for (const p of move.path) points.push(progressToWorld(move.seat, p, index, Y));

  let threat = 0;
  const game = useGame.getState().game;
  if (game && move.lands === 'track') {
    const cell = trackCell(move.seat, move.to);
    if (cell !== null) threat = threatCount(game, move.seat, cell);
  }
  const danger = threat > 0;
  const color = danger ? COLOR.danger.clone() : SEAT_COLORS[move.seat].clone();

  let glyph: number | null = null;
  let glyphColor = color.clone();
  if (move.captures.length) {
    glyph = GLYPH.crosshair;
    glyphColor = danger ? COLOR.danger.clone() : COLOR.white.clone().lerp(SEAT_COLORS[move.seat], 0.35);
  } else if (move.collects) {
    glyph = POWER_GLYPH[move.collects];
    glyphColor = new THREE.Color(POWER_THEME[move.collects].color);
  } else if (move.blockedBy.length) {
    glyph = GLYPH.shield;
    glyphColor = COLOR.safe.clone();
  } else if (move.finishes) {
    glyph = GLYPH.core;
    glyphColor = SEAT_COLORS[move.seat].clone();
  } else if (danger) {
    glyph = GLYPH.warning;
    glyphColor = COLOR.danger.clone();
  }

  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return { points, color, glyph, glyphColor, length };
}

/** Flat ribbon along the polyline with cumulative distance attribute. */
function buildRibbon(points: Vec3[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const dist: number[] = [];
  const av: number[] = [];
  const idx: number[] = [];
  let acc = 0;
  let v = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * RIBBON_W * 0.5;
    const nz = (dx / len) * RIBBON_W * 0.5;
    // extend slightly so segments overlap at corners
    const ex = (dx / len) * RIBBON_W * 0.5;
    const ez = (dz / len) * RIBBON_W * 0.5;
    const ax = a.x - (i > 1 ? ex : 0);
    const az = a.z - (i > 1 ? ez : 0);
    const bx = b.x + (i < points.length - 1 ? ex : 0);
    const bz = b.z + (i < points.length - 1 ? ez : 0);
    pos.push(ax + nx, Y, az + nz, ax - nx, Y, az - nz, bx + nx, Y, bz + nz, bx - nx, Y, bz - nz);
    dist.push(acc, acc, acc + len, acc + len);
    av.push(0, 1, 0, 1);
    idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    v += 4;
    acc += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(av, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;

export function PathPreview() {
  const showHints = useSettings((s) => s.showHints);
  const move = useGame((s) => {
    const g = s.game;
    if (!g || s.screen !== 'game' || s.busy || s.moving || s.paused || g.phase !== 'move') return null;
    if (g.players[g.current].kind !== 'human') return null;
    const id = s.hoveredToken ?? (showHints ? (s.hint?.move.tokenId ?? null) : null);
    if (id === null) return null;
    return g.legalMoves.find((m) => m.tokenId === id) ?? null;
  });

  const info = useMemo(() => (move ? buildInfo(move) : null), [move]);
  const [shown, setShown] = useState<PreviewInfo | null>(null);
  useEffect(() => {
    if (info) setShown(info);
  }, [info]);

  const group = useRef<THREE.Group>(null);
  const opacity = useRef(0);
  const reveal = useRef(0);
  useEffect(() => {
    reveal.current = 0;
  }, [info]);

  // ── materials (shared, colours swapped per move) ──
  const mats = useDisposable(() => {
    const ribbon = new THREE.ShaderMaterial({
      vertexShader: pathRibbonVert,
      fragmentShader: pathRibbonFrag,
      uniforms: { uTime, uColor: { value: new THREE.Color() }, uOpacity: { value: 0 }, uLength: { value: 1 }, uReveal: { value: 0 } },
      side: THREE.DoubleSide,
      ...additive,
    });
    const chevron = new THREE.ShaderMaterial({
      vertexShader: chevronVert,
      fragmentShader: chevronFrag,
      uniforms: { uTime, uColor: { value: new THREE.Color() }, uOpacity: { value: 0 }, uCount: { value: 1 }, uReveal: { value: 0 } },
      side: THREE.DoubleSide,
      ...additive,
    });
    const marker = new THREE.ShaderMaterial({
      vertexShader: holoVert,
      fragmentShader: markerFrag,
      uniforms: { uTime, uColor: { value: new THREE.Color() }, uOpacity: { value: 0 }, uSpin: { value: 2 } },
      ...additive,
    });
    const column = new THREE.ShaderMaterial({
      vertexShader: columnVert,
      fragmentShader: columnFrag,
      uniforms: { uTime, uColor: { value: new THREE.Color() }, uOpacity: { value: 0 } },
      side: THREE.DoubleSide,
      ...additive,
    });
    const glyph = new THREE.ShaderMaterial({
      vertexShader: holoVert,
      fragmentShader: glyphFrag,
      uniforms: { uTime, uColor: { value: new THREE.Color() }, uGlyph: { value: 0 }, uOpacity: { value: 0 }, uSeed: { value: 3.3 } },
      side: THREE.DoubleSide,
      ...additive,
    });
    const list = { ribbon, chevron, marker, column, glyph };
    return Object.assign(list, { dispose: () => [ribbon, chevron, marker, column, glyph].forEach((m) => m.dispose()) });
  }, []);

  const geos = useDisposable(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const column = new THREE.CylinderGeometry(0.34, 0.4, 0.9, 24, 1, true).translate(0, 0.45, 0);
    return { plane, flat, column, dispose: () => [plane, flat, column].forEach((g) => g.dispose()) };
  }, []);

  const chevrons = useDisposable(() => {
    const geo = new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2);
    const idx = new Float32Array(MAX_CHEVRONS);
    for (let i = 0; i < MAX_CHEVRONS; i++) idx[i] = i;
    geo.setAttribute('aIndex', new THREE.InstancedBufferAttribute(idx, 1));
    const im = new THREE.InstancedMesh(geo, mats.chevron, MAX_CHEVRONS);
    im.count = 0;
    im.frustumCulled = false;
    im.renderOrder = 9;
    return { im, dispose: () => geo.dispose() };
  }, [mats]);

  const ribbonGeo = useDisposable(() => (shown ? buildRibbon(shown.points) : new THREE.BufferGeometry()), [shown]);

  // apply per-move layout & colours
  useEffect(() => {
    if (!shown) return;
    const { points, color, glyph, glyphColor, length } = shown;
    const m = new THREE.Matrix4();
    const r = new THREE.Matrix4();
    let n = 0;
    for (let i = 1; i < points.length - 1 && n < MAX_CHEVRONS; i++) {
      const a = points[i - 1];
      const b = points[i];
      const theta = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      m.makeRotationY(theta);
      r.makeTranslation(b.x, Y + 0.004, b.z);
      chevrons.im.setMatrixAt(n++, r.multiply(m));
    }
    chevrons.im.count = n;
    chevrons.im.instanceMatrix.needsUpdate = true;
    mats.chevron.uniforms.uCount.value = Math.max(n, 1);
    (mats.ribbon.uniforms.uColor.value as THREE.Color).copy(color);
    (mats.chevron.uniforms.uColor.value as THREE.Color).copy(color);
    (mats.marker.uniforms.uColor.value as THREE.Color).copy(color);
    (mats.column.uniforms.uColor.value as THREE.Color).copy(color);
    (mats.glyph.uniforms.uColor.value as THREE.Color).copy(glyphColor);
    mats.glyph.uniforms.uGlyph.value = glyph ?? 0;
    mats.ribbon.uniforms.uLength.value = Math.max(length, 0.001);
  }, [shown, chevrons, mats]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    opacity.current = damp(opacity.current, info ? 1 : 0, info ? 14 : 10, d);
    reveal.current = Math.min(1, reveal.current + d * 3.2);
    const o = opacity.current;
    const rv = reveal.current;
    mats.ribbon.uniforms.uOpacity.value = o;
    mats.ribbon.uniforms.uReveal.value = rv;
    mats.chevron.uniforms.uOpacity.value = o;
    mats.chevron.uniforms.uReveal.value = rv;
    const end = THREE.MathUtils.smoothstep(rv, 0.7, 1);
    mats.marker.uniforms.uOpacity.value = o * end;
    mats.column.uniforms.uOpacity.value = o * end * 0.8;
    mats.glyph.uniforms.uOpacity.value = shown?.glyph !== null ? o * end : 0;
    if (group.current) group.current.visible = o > 0.01;
  });

  const dest = shown ? shown.points[shown.points.length - 1] : null;
  return (
    <group ref={group} visible={false}>
      <mesh geometry={ribbonGeo} material={mats.ribbon} renderOrder={9} />
      <primitive object={chevrons.im} />
      {dest && (
        <group position={[dest.x, 0, dest.z]}>
          <mesh geometry={geos.flat} material={mats.marker} position-y={Y + 0.006} scale={0.95} renderOrder={9} />
          <mesh geometry={geos.column} material={mats.column} position-y={0.05} renderOrder={9} />
          {shown?.glyph !== null && (
            <Billboard position={[0, 1.25, 0]}>
              <mesh geometry={geos.plane} material={mats.glyph} scale={0.62} renderOrder={10} />
            </Billboard>
          )}
        </group>
      )}
    </group>
  );
}
