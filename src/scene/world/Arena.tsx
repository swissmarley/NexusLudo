// The arena around the floating board: neon grid floor, sky dome, holographic
// skyline, data pillars, holo billboards and rotating rings beneath the board.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLOR, FLOOR_Y, rng, uEnergy, uTime, uTurnColor, useBudget, useDisposable } from './shared';
import {
  floorFrag,
  floorVert,
  pillarFrag,
  pillarVert,
  ringFrag,
  ringVert,
  skyFrag,
  skyVert,
  skylineFrag,
  skylineVert,
} from './shaders/arena';
import { GLSL_NOISE, GLSL_OUTPUT, GLSL_FOG } from './shaders/common';

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
} as const;

// ── Floor ──────────────────────────────────────────────────────
function Floor() {
  const { tier } = useBudget();
  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: floorVert,
        fragmentShader: floorFrag,
        uniforms: { uTime, uTurn: uTurnColor, uEnergy, uDetail: { value: 1 } },
      }),
    [],
  );
  useEffect(() => {
    material.uniforms.uDetail.value = tier === 'low' ? 0.5 : 1;
  }, [tier, material]);
  const geometry = useDisposable(() => new THREE.PlaneGeometry(420, 420, 1, 1).rotateX(-Math.PI / 2), []);
  return <mesh geometry={geometry} material={material} position-y={FLOOR_Y} renderOrder={-5} />;
}

// ── Sky dome ───────────────────────────────────────────────────
function Sky() {
  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        uniforms: { uTime, uTurn: uTurnColor },
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [],
  );
  const geometry = useDisposable(() => new THREE.SphereGeometry(300, 48, 24), []);
  return <mesh geometry={geometry} material={material} renderOrder={-10} frustumCulled={false} />;
}

// ── Skyline ────────────────────────────────────────────────────
function Skyline() {
  const { scale } = useBudget();
  const count = Math.round(90 + 170 * Math.min(scale, 1));
  const mesh = useDisposable(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const size = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const mat = new THREE.ShaderMaterial({
      vertexShader: skylineVert,
      fragmentShader: skylineFrag,
      uniforms: { uTime, uTurn: uTurnColor },
    });
    const im = new THREE.InstancedMesh(geo, mat, count);
    const rand = rng(1337);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const ring = i % 3;
      const a = rand() * Math.PI * 2;
      const r = 72 + ring * 22 + rand() * 20;
      const tall = rand() > 0.9;
      const w = 2.5 + rand() * 6;
      const d = 2.5 + rand() * 6;
      const h = tall ? 55 + rand() * 35 : 12 + rand() * (22 + ring * 12);
      p.set(Math.cos(a) * r, FLOOR_Y - 1, Math.sin(a) * r);
      q.setFromAxisAngle(up, -a + (rand() - 0.5) * 0.4);
      s.set(w, h, d);
      m.compose(p, q, s);
      im.setMatrixAt(i, m);
      size.set([w, h, d], i * 3);
      seed[i] = rand();
    }
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    im.frustumCulled = false;
    im.instanceMatrix.needsUpdate = true;
    return Object.assign(im, {
      dispose() {
        geo.dispose();
        mat.dispose();
        THREE.InstancedMesh.prototype.dispose.call(im);
        return im;
      },
    });
  }, [count]);
  return <primitive object={mesh} />;
}

// ── Data pillars (vertical light columns streaming code) ───────
function DataPillars() {
  const { scale } = useBudget();
  const count = Math.round(8 + 14 * Math.min(scale, 1));
  const mesh = useDisposable(() => {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0);
    const seed = new Float32Array(count);
    const mat = new THREE.ShaderMaterial({
      vertexShader: pillarVert,
      fragmentShader: pillarFrag,
      uniforms: { uTime, uTurn: uTurnColor },
      side: THREE.DoubleSide,
      ...additive,
    });
    const im = new THREE.InstancedMesh(geo, mat, count);
    const rand = rng(424242);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand() * 0.4;
      const r = 32 + rand() * 26;
      const rad = 0.12 + rand() * 0.35;
      m.makeScale(rad, 70 + rand() * 30, rad).setPosition(Math.cos(a) * r, FLOOR_Y, Math.sin(a) * r);
      im.setMatrixAt(i, m);
      seed[i] = rand();
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    im.frustumCulled = false;
    im.renderOrder = 2;
    return Object.assign(im, {
      dispose() {
        geo.dispose();
        mat.dispose();
        THREE.InstancedMesh.prototype.dispose.call(im);
        return im;
      },
    });
  }, [count]);
  return <primitive object={mesh} />;
}

// ── Holographic billboards floating among the towers ───────────
const billboardFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uSeed;
varying vec2 vUv;
varying vec3 vWorld;
${GLSL_NOISE}
${GLSL_FOG}
void main(){
  vec2 uv = vUv;
  float glitch = step(0.94, hash11(floor(uTime * 6.0) + uSeed * 13.0));
  uv.x += glitch * (hash11(floor(uv.y * 20.0) + uTime) - 0.5) * 0.08;
  float frame = step(uv.x, 0.02) + step(0.98, uv.x) + step(uv.y, 0.03) + step(0.97, uv.y);
  float bars = step(0.5, hash21(vec2(floor(uv.x * 10.0), floor(uv.y * 6.0 - uTime * (0.5 + uSeed)))));
  float glyphs = bars * step(0.12, uv.x) * step(uv.x, 0.88) * step(0.15, uv.y) * step(uv.y, 0.85);
  float scan = 0.55 + 0.45 * sin(uv.y * 160.0 + uTime * 8.0);
  float big = smoothstep(0.03, 0.0, abs(length(uv - 0.5) - 0.25 - 0.03 * sin(uTime * 2.0 + uSeed * 9.0)));
  float a = (frame * 1.2 + glyphs * 0.35 + big * 0.9) * scan * (0.75 + 0.25 * sin(uTime * 3.0 + uSeed * 40.0));
  a *= 1.0 - fogFactor(length(cameraPosition - vWorld), FOG_DENSITY * 0.55);
  gl_FragColor = vec4(uColor * a * 1.4, 1.0);
  ${GLSL_OUTPUT}
}`;
const billboardVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;

function HoloBillboards() {
  const { tier } = useBudget();
  const items = useMemo(() => {
    const rand = rng(77);
    const cols = [COLOR.magenta, COLOR.cyan, COLOR.purple, COLOR.amber];
    return Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + rand() * 0.5;
      const r = 60 + rand() * 22;
      return {
        pos: [Math.cos(a) * r, 12 + rand() * 22, Math.sin(a) * r] as [number, number, number],
        rotY: -a - Math.PI / 2,
        w: 9 + rand() * 8,
        h: 5 + rand() * 5,
        color: cols[i % cols.length],
        seed: rand(),
      };
    });
  }, []);
  const geometry = useDisposable(() => new THREE.PlaneGeometry(1, 1), []);
  const materials = useDisposable(() => {
    const list = items.map(
      (it) =>
        new THREE.ShaderMaterial({
          vertexShader: billboardVert,
          fragmentShader: billboardFrag,
          uniforms: { uTime, uColor: { value: it.color }, uSeed: { value: it.seed } },
          side: THREE.DoubleSide,
          ...additive,
        }),
    );
    return Object.assign(list, { dispose: () => list.forEach((m) => m.dispose()) });
  }, [items]);
  if (tier === 'low') return null;
  return (
    <group>
      {items.map((it, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={materials[i]}
          position={it.pos}
          rotation-y={it.rotY}
          scale={[it.w, it.h, 1]}
          renderOrder={2}
        />
      ))}
    </group>
  );
}

// ── Rotating holo rings under the board ────────────────────────
interface RingSpec {
  inner: number;
  outer: number;
  y: number;
  speed: number;
  segments: number;
  style: 0 | 1 | 2;
  color: THREE.Color;
  turnMix: number;
  opacity: number;
  tilt?: number;
}

const RINGS: RingSpec[] = [
  { inner: 9.0, outer: 9.35, y: -1.3, speed: 0.06, segments: 160, style: 0, color: COLOR.cyan, turnMix: 0.55, opacity: 1 },
  { inner: 10.4, outer: 11.6, y: -2.3, speed: -0.035, segments: 28, style: 1, color: COLOR.purple, turnMix: 0.2, opacity: 0.8 },
  { inner: 6.8, outer: 7.4, y: -3.4, speed: 0.09, segments: 72, style: 2, color: COLOR.magenta, turnMix: 0.3, opacity: 0.8 },
  { inner: 12.5, outer: 12.7, y: -4.6, speed: -0.02, segments: 240, style: 0, color: COLOR.cyan, turnMix: 0.2, opacity: 0.6 },
];

function HoloRing({ spec }: { spec: RingSpec }) {
  const ref = useRef<THREE.Mesh>(null);
  const geometry = useDisposable(() => new THREE.RingGeometry(spec.inner, spec.outer, 192, 1), [spec]);
  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ringVert,
        fragmentShader: ringFrag,
        uniforms: {
          uTime,
          uTurn: uTurnColor,
          uEnergy,
          uColor: { value: spec.color },
          uTurnMix: { value: spec.turnMix },
          uInner: { value: spec.inner },
          uOuter: { value: spec.outer },
          uSegments: { value: spec.segments },
          uStyle: { value: spec.style },
          uOpacity: { value: spec.opacity },
        },
        side: THREE.DoubleSide,
        ...additive,
      }),
    [spec],
  );
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += spec.speed * Math.min(dt, 0.1) * (1 + uEnergy.value * 3);
  });
  return (
    <mesh ref={ref} geometry={geometry} material={material} position-y={spec.y} rotation-x={-Math.PI / 2} renderOrder={3} />
  );
}

/** Giant tilted halo slowly orbiting in the sky behind the skyline. */
function SkyHalo() {
  const ref = useRef<THREE.Group>(null);
  const spec = useMemo<RingSpec>(
    () => ({ inner: 70, outer: 72, y: 0, speed: 0, segments: 360, style: 0, color: COLOR.purple, turnMix: 0.35, opacity: 0.55 }),
    [],
  );
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += 0.01 * Math.min(dt, 0.1);
  });
  return (
    <group ref={ref}>
      <group position={[0, 18, -110]} rotation={[0.2, 0, 0.3]}>
        <group rotation-x={Math.PI / 2}>
          <HoloRing spec={spec} />
        </group>
      </group>
    </group>
  );
}

export function Arena() {
  return (
    <group>
      <Sky />
      <Floor />
      <Skyline />
      <DataPillars />
      <HoloBillboards />
      {RINGS.map((r, i) => (
        <HoloRing key={i} spec={r} />
      ))}
      <SkyHalo />
    </group>
  );
}
