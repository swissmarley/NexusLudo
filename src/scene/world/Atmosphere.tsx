// Atmosphere: fog, GPU-animated drifting particles and volumetric-feeling light shafts.
import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { COLOR, FLOOR_Y, FOG_DENSITY, rng, uEnergy, uTime, uTurnColor, useBudget, useDisposable } from './shared';
import { GLSL_FOG, GLSL_NOISE, GLSL_OUTPUT } from './shaders/common';

// ── Particles ──────────────────────────────────────────────────
const particleVert = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
uniform float uEnergy;
attribute vec4 aData; // x: seed, y: speed, z: size, w: palette
varying float vAlpha;
varying float vPal;
const float H = 34.0;
void main(){
  vec3 p = position;
  float t = uTime * aData.y;
  // rise and wrap vertically, swirl gently around the board
  p.y = mod(p.y + t * (1.0 + uEnergy * 2.0), H) + ${FLOOR_Y.toFixed(2)};
  float ang = t * 0.05 + aData.x * 6.2831;
  p.x += sin(ang + p.y * 0.15) * 1.2;
  p.z += cos(ang * 1.3 + p.y * 0.12) * 1.2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  gl_PointSize = aData.z * uPixelRatio * (90.0 / max(dist, 1.0));
  // fade at the top/bottom of the wrap and with distance
  float yN = (p.y - ${FLOOR_Y.toFixed(2)}) / H;
  vAlpha = smoothstep(0.0, 0.1, yN) * (1.0 - smoothstep(0.75, 1.0, yN));
  vAlpha *= 0.55 + 0.45 * sin(uTime * (1.0 + aData.x * 3.0) + aData.x * 50.0);
  float fd = FOG_DENSITY_P * dist;
  vAlpha *= exp(-fd * fd);
  vPal = aData.w;
}`.replace('FOG_DENSITY_P', FOG_DENSITY.toFixed(5));

const particleFrag = /* glsl */ `
uniform vec3 uTurn;
varying float vAlpha;
varying float vPal;
const vec3 C0 = vec3(${COLOR.cyan.r.toFixed(4)}, ${COLOR.cyan.g.toFixed(4)}, ${COLOR.cyan.b.toFixed(4)});
const vec3 C1 = vec3(${COLOR.purple.r.toFixed(4)}, ${COLOR.purple.g.toFixed(4)}, ${COLOR.purple.b.toFixed(4)});
const vec3 C2 = vec3(${COLOR.magenta.r.toFixed(4)}, ${COLOR.magenta.g.toFixed(4)}, ${COLOR.magenta.b.toFixed(4)});
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float core = smoothstep(0.5, 0.0, d);
  float a = pow(core, 2.2) * vAlpha;
  vec3 col = vPal < 0.33 ? C0 : (vPal < 0.66 ? C1 : C2);
  col = mix(col, uTurn, 0.3);
  gl_FragColor = vec4(col * a * 2.2, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function Particles() {
  const { scale } = useBudget();
  const dpr = useThree((s) => s.viewport.dpr);
  const count = Math.round(2600 * scale);
  const geometry = useDisposable(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const data = new Float32Array(count * 4);
    const rand = rng(9001);
    for (let i = 0; i < count; i++) {
      // denser near the board, sparse far out
      const r = Math.pow(rand(), 0.6) * 55;
      const a = rand() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rand() * 34;
      pos[i * 3 + 2] = Math.sin(a) * r;
      data[i * 4] = rand();
      data[i * 4 + 1] = 0.25 + rand() * 0.9;
      data[i * 4 + 2] = 0.6 + Math.pow(rand(), 3) * 2.8;
      data[i * 4 + 3] = rand();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aData', new THREE.BufferAttribute(data, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 0), 80);
    return geo;
  }, [count]);
  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: particleVert,
        fragmentShader: particleFrag,
        uniforms: { uTime, uTurn: uTurnColor, uEnergy, uPixelRatio: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  material.uniforms.uPixelRatio.value = dpr;
  if (count < 10) return null;
  return <points geometry={geometry} material={material} renderOrder={4} frustumCulled={false} />;
}

// ── Light shafts ───────────────────────────────────────────────
const shaftVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vN;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const shaftFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uTurn;
uniform float uSeed;
uniform float uStrength;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vN;
${GLSL_NOISE}
${GLSL_FOG}
void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  float facing = pow(abs(dot(normalize(vN), V)), 1.6);
  // vUv.y: 0 bottom (wide end, near board) → 1 top (source)
  float along = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.8, 1.0, vUv.y));
  float dust = fbm(vec2(vUv.x * 8.0 + uSeed * 10.0, vUv.y * 3.0 - uTime * 0.12));
  float streaks = 0.6 + 0.4 * sin(vUv.x * 40.0 + uSeed * 20.0);
  float a = facing * along * (0.35 + dust * 0.9) * streaks * uStrength;
  a *= 1.0 - fogFactor(length(cameraPosition - vWorld), FOG_DENSITY * 0.8);
  gl_FragColor = vec4(mix(uColor, uTurn, 0.35) * a * 0.14, 1.0);
  ${GLSL_OUTPUT}
}`;

interface ShaftSpec {
  pos: [number, number, number];
  rot: [number, number, number];
  color: THREE.Color;
  seed: number;
  top: number;
  bottom: number;
  height: number;
}

function LightShafts() {
  const { tier } = useBudget();
  const specs = useMemo<ShaftSpec[]>(() => {
    const rand = rng(31);
    const cols = [COLOR.cyan, COLOR.purple, COLOR.magenta, COLOR.cyan, COLOR.purple];
    return cols.map((color, i) => {
      const a = (i / cols.length) * Math.PI * 2 + 0.4;
      const r = 9 + rand() * 4;
      const tiltOut = 0.32 + rand() * 0.15;
      return {
        // cone source high above, slanting inwards onto the board area
        pos: [Math.cos(a) * r, 11, Math.sin(a) * r],
        rot: [Math.sin(a) * tiltOut, 0, -Math.cos(a) * tiltOut],
        color,
        seed: rand(),
        top: 0.4 + rand() * 0.4,
        bottom: 3 + rand() * 2.5,
        height: 24,
      };
    });
  }, []);
  const geometries = useDisposable(() => {
    const list = specs.map((s) => new THREE.CylinderGeometry(s.top, s.bottom, s.height, 32, 1, true));
    return Object.assign(list, { dispose: () => list.forEach((g) => g.dispose()) });
  }, [specs]);
  const materials = useDisposable(() => {
    const list = specs.map(
      (s) =>
        new THREE.ShaderMaterial({
          vertexShader: shaftVert,
          fragmentShader: shaftFrag,
          uniforms: {
            uTime,
            uTurn: uTurnColor,
            uColor: { value: s.color },
            uSeed: { value: s.seed },
            uStrength: { value: 1 },
          },
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
    );
    return Object.assign(list, { dispose: () => list.forEach((m) => m.dispose()) });
  }, [specs]);
  if (tier === 'low') return null;
  return (
    <group>
      {specs.map((s, i) => (
        <mesh key={i} geometry={geometries[i]} material={materials[i]} position={s.pos} rotation={s.rot} renderOrder={5} />
      ))}
    </group>
  );
}

export function Atmosphere() {
  return (
    <>
      <color attach="background" args={[COLOR.bg.getStyle()]} />
      <fogExp2 attach="fog" args={[COLOR.fog.getHex(), FOG_DENSITY]} />
      <Particles />
      <LightShafts />
    </>
  );
}
