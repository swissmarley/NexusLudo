// NEXUS-mode power cells: floating holographic crystals above their track cells
// with a glyph card, ground marker and light column. Spawn-in / vanish animated.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { trackCellWorld } from '../../game/board';
import type { PowerCell, PowerType } from '../../game/types';
import { POWER_THEME } from '../../core/theme';
import { useGame } from '../../store/game';
import { POWER_GLYPH, uTime, useDisposable, useFx } from './shared';
import { columnFrag, columnVert, glyphFrag, holoVert, markerFrag } from './shaders/holo';

const TYPES: PowerType[] = ['shield', 'boost', 'reroll', 'emp'];
const SPAWN_S = 0.8;
const VANISH_S = 0.55;
let nextId = 1;

interface Displayed extends PowerCell {
  key: string;
  /** Unique mount id (a re-spawn on the same cell gets a fresh one). */
  id: number;
  removedAt: number | null;
}

interface TypeMaterials {
  crystal: THREE.MeshStandardMaterial;
  wire: THREE.LineBasicMaterial;
  glyph: THREE.ShaderMaterial;
  marker: THREE.ShaderMaterial;
  column: THREE.ShaderMaterial;
}

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function Cell({ item, mats, geos }: { item: Displayed; mats: TypeMaterials; geos: Geos }) {
  const root = useRef<THREE.Group>(null);
  const crystal = useRef<THREE.Group>(null);
  const card = useRef<THREE.Group>(null);
  const born = useRef(uTime.value);
  const flash = useRef(1);
  const pos = useMemo(() => trackCellWorld(item.cell), [item.cell]);
  const phase = useMemo(() => item.cell * 0.37, [item.cell]);

  useFrame((_, dt) => {
    const t = uTime.value;
    const sp = Math.min(1, (t - born.current) / SPAWN_S);
    const v = item.removedAt === null ? 0 : Math.min(1, (t - item.removedAt) / VANISH_S);
    const s = Math.max(0, easeOutBack(sp)) * (1 - v * v);
    flash.current = Math.max(0, flash.current - dt * 2);
    if (root.current) root.current.scale.setScalar(Math.max(s, 0.0001));
    if (crystal.current) {
      crystal.current.rotation.y += dt * (1.2 + v * 12);
      crystal.current.position.y = 0.85 + Math.sin(t * 2 + phase) * 0.08 + v * 1.4;
      // spawn glitch: jitter during materialisation
      crystal.current.position.x = sp < 1 ? (Math.random() - 0.5) * 0.06 * (1 - sp) : 0;
    }
    if (card.current) card.current.position.y = 1.5 + Math.sin(t * 2 + phase + 0.6) * 0.05 + v * 1.8;
  });

  return (
    <group position={[pos.x, 0, pos.z]}>
      <group ref={root}>
        <mesh geometry={geos.plane} material={mats.marker} rotation-x={-Math.PI / 2} position-y={0.05} scale={0.95} renderOrder={8} />
        <mesh geometry={geos.column} material={mats.column} renderOrder={8} />
        <group ref={crystal} position-y={0.85}>
          <mesh geometry={geos.crystal} material={mats.crystal} scale={[0.2, 0.32, 0.2]} />
          <lineSegments geometry={geos.wire} material={mats.wire} scale={0.3} />
        </group>
        <group ref={card} position-y={1.5}>
          <Billboard>
            <mesh geometry={geos.plane} material={mats.glyph} scale={0.55} renderOrder={9} />
          </Billboard>
        </group>
      </group>
    </group>
  );
}

interface Geos {
  plane: THREE.PlaneGeometry;
  column: THREE.CylinderGeometry;
  crystal: THREE.OctahedronGeometry;
  wire: THREE.EdgesGeometry;
}

export function PowerCells() {
  const powerCells = useGame((s) => (s.screen === 'menu' || s.screen === 'setup' ? null : (s.game?.powerCells ?? null)));
  const [items, setItems] = useState<Displayed[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  // diff the store list against what is displayed so removals can animate out
  useEffect(() => {
    const list = powerCells ?? [];
    const keys = new Set(list.map((p) => `${p.cell}:${p.type}`));
    setItems((prev) => {
      const next: Displayed[] = [];
      for (const it of prev) {
        if (keys.has(it.key) && it.removedAt === null) next.push(it);
        else if (it.removedAt !== null) next.push(it);
        else next.push({ ...it, removedAt: uTime.value });
      }
      for (const p of list) {
        const key = `${p.cell}:${p.type}`;
        if (!next.some((n) => n.key === key && n.removedAt === null)) next.push({ ...p, key, id: nextId++, removedAt: null });
      }
      return next;
    });
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setItems((prev) => prev.filter((it) => it.removedAt === null || uTime.value - it.removedAt < VANISH_S));
    }, VANISH_S * 1000 + 80);
    timers.current.add(timer);
  }, [powerCells]);

  useEffect(() => {
    const set = timers.current;
    return () => set.forEach(clearTimeout);
  }, []);

  // collect: mark immediately (state commit happens alongside, this is a safety net)
  useFx('collect', (e) =>
    setItems((prev) => prev.map((it) => (it.cell === e.cell && it.removedAt === null ? { ...it, removedAt: uTime.value } : it))),
  );

  const geos = useDisposable(() => {
    const g: Geos = {
      plane: new THREE.PlaneGeometry(1, 1),
      column: new THREE.CylinderGeometry(0.16, 0.3, 1.2, 20, 1, true).translate(0, 0.6, 0),
      crystal: new THREE.OctahedronGeometry(1, 0),
      wire: new THREE.EdgesGeometry(new THREE.OctahedronGeometry(1.25, 0)),
    };
    return Object.assign(g, { dispose: () => Object.values(g).forEach((x: THREE.BufferGeometry) => x.dispose()) });
  }, []);

  const mats = useDisposable(() => {
    const out = {} as Record<PowerType, TypeMaterials>;
    TYPES.forEach((type, i) => {
      const color = new THREE.Color(POWER_THEME[type].color);
      out[type] = {
        crystal: new THREE.MeshStandardMaterial({
          color: '#06040e',
          metalness: 0.5,
          roughness: 0.1,
          emissive: color,
          emissiveIntensity: 2.4,
          flatShading: true,
        }),
        wire: new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(2.5), toneMapped: false, transparent: true, opacity: 0.9 }),
        glyph: new THREE.ShaderMaterial({
          vertexShader: holoVert,
          fragmentShader: glyphFrag,
          uniforms: { uTime, uColor: { value: color }, uGlyph: { value: POWER_GLYPH[type] }, uOpacity: { value: 1 }, uSeed: { value: i * 1.7 } },
          side: THREE.DoubleSide,
          ...additive,
        }),
        marker: new THREE.ShaderMaterial({
          vertexShader: holoVert,
          fragmentShader: markerFrag,
          uniforms: { uTime, uColor: { value: color }, uOpacity: { value: 0.9 }, uSpin: { value: 1 } },
          ...additive,
        }),
        column: new THREE.ShaderMaterial({
          vertexShader: columnVert,
          fragmentShader: columnFrag,
          uniforms: { uTime, uColor: { value: color }, uOpacity: { value: 0.7 } },
          side: THREE.DoubleSide,
          ...additive,
        }),
      };
    });
    return Object.assign(out, {
      dispose: () => TYPES.forEach((t) => Object.values(out[t]).forEach((m: THREE.Material) => m.dispose())),
    });
  }, []);

  if (!items.length) return null;
  return (
    <group>
      {items.map((it) => (
        <Cell key={it.id} item={it} mats={mats[it.type]} geos={geos} />
      ))}
    </group>
  );
}
