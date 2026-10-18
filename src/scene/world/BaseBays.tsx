// Four seat-coloured docking bays with token sockets and a flat dice launch pad
// at baseCenterWorld(seat). The current player's bay glows brighter and raises
// a low holographic barrier.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { baseCenterWorld, baseSlotWorld } from '../../game/board';
import type { Seat } from '../../game/types';
import { useGame } from '../../store/game';
import { SEATS, SEAT_COLORS, damp, uTime, useBudget, useDisposable } from './shared';
import { bayFrag, bayVert } from './shaders/board';
import { GLSL_OUTPUT } from './shaders/common';

const BAY_HALF = 2.82;
const SLOT = 1.05;

/** Is this seat glowing as "current"? */
function seatState(seat: Seat): { active: number; present: number } {
  const s = useGame.getState();
  const g = s.game;
  if (!g) return { active: 0.35, present: 1 }; // attract mode: all bays lit
  const present = g.players[seat].active ? 1 : 0;
  const active = (s.screen === 'game' || s.screen === 'victory') && g.current === seat && g.phase !== 'over' ? 1 : 0;
  return { active, present };
}

// Holographic barrier wall shader (vertical ribbon around the bay perimeter).
const wallVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const wallFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uActive;
varying vec2 vUv;
void main(){
  float h = vUv.y;
  float fade = pow(1.0 - h, 2.5);
  float lines = 0.6 + 0.4 * step(0.5, fract(h * 8.0 - uTime * 1.5));
  float bars = 0.7 + 0.3 * step(0.5, fract(vUv.x * 60.0));
  gl_FragColor = vec4(uColor * fade * lines * bars * uActive * 0.9, 1.0);
  ${GLSL_OUTPUT}
}`;

function Bay({ seat }: { seat: Seat }) {
  const { tier } = useBudget();
  const center = baseCenterWorld(seat);
  const rimRefs = useRef<THREE.InstancedMesh>(null);
  const wallRef = useRef<THREE.Mesh>(null);

  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: bayVert,
        fragmentShader: bayFrag,
        uniforms: {
          uTime,
          uColor: { value: SEAT_COLORS[seat] },
          uActive: { value: 0 },
          uPresent: { value: 1 },
          uHalf: { value: BAY_HALF },
          uSlot: { value: SLOT },
          uDetail: { value: 1 },
        },
      }),
    [seat],
  );
  const wallMat = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: wallVert,
        fragmentShader: wallFrag,
        uniforms: { uTime, uColor: { value: SEAT_COLORS[seat] }, uActive: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [seat],
  );
  // physical rim material for sockets / pad: emissive neon metal
  const rimMat = useDisposable(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#0c0f1c',
        metalness: 0.9,
        roughness: 0.25,
        emissive: SEAT_COLORS[seat],
        emissiveIntensity: 1.2,
      }),
    [seat],
  );

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    const st = seatState(seat);
    const u = material.uniforms;
    u.uActive.value = damp(u.uActive.value, st.active, 4, d);
    u.uPresent.value = damp(u.uPresent.value, st.present, 4, d);
    u.uDetail.value = tier === 'low' ? 0.4 : 1;
    wallMat.uniforms.uActive.value = u.uActive.value * u.uPresent.value;
    if (wallRef.current) wallRef.current.visible = wallMat.uniforms.uActive.value > 0.01;
    rimMat.emissiveIntensity = (0.35 + u.uActive.value * 1.6) * (0.3 + 0.7 * u.uPresent.value);
  });

  // socket + pad rim placements (local to bay centre)
  const rimGeo = useDisposable(() => new THREE.TorusGeometry(1, 0.018, 8, 64).rotateX(Math.PI / 2), []);
  const placeRims = (im: THREE.InstancedMesh | null) => {
    if (!im) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < 4; i++) {
      const s = baseSlotWorld(seat, i);
      m.makeScale(0.36, 1, 0.36).setPosition(s.x - center.x, 0.006, s.z - center.z);
      im.setMatrixAt(i, m);
    }
    m.makeScale(0.78, 1, 0.78).setPosition(0, 0.006, 0);
    im.setMatrixAt(4, m);
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    rimRefs.current = im;
  };

  // perimeter wall geometry (chamfered square, open cylinder-like ribbon)
  const wallGeo = useDisposable(() => {
    const h = 0.22;
    const c = 0.7;
    const r = BAY_HALF - 0.06;
    const pts: [number, number][] = [
      [-r + c, -r], [r - c, -r], [r, -r + c], [r, r - c], [r - c, r], [-r + c, r], [-r, r - c], [-r, -r + c], [-r + c, -r],
    ];
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let total = 0;
    const lens = [0];
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      lens.push(total);
    }
    pts.forEach(([x, z], i) => {
      pos.push(x, 0, z, x, h, z);
      uv.push(lens[i] / total, 0, lens[i] / total, 1);
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }, []);

  const planeGeo = useDisposable(() => new THREE.PlaneGeometry(BAY_HALF * 2, BAY_HALF * 2), []);

  return (
    <group position={[center.x, 0, center.z]}>
      <mesh geometry={planeGeo} material={material} rotation-x={-Math.PI / 2} position-y={0.004} />
      <instancedMesh ref={placeRims} args={[rimGeo, rimMat, 5]} />
      <mesh ref={wallRef} geometry={wallGeo} material={wallMat} renderOrder={6} />
    </group>
  );
}

export function BaseBays() {
  return (
    <group>
      {SEATS.map((s) => (
        <Bay key={s} seat={s} />
      ))}
    </group>
  );
}
