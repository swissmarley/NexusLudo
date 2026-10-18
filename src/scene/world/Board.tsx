// The floating board: chamfered brushed-metal slab with neon edge strips,
// underside glow + thrusters, and all on-board layers (tiles, bays, core,
// power cells, path preview). Children (tokens, dice, VFX) ride along with
// the subtle idle float so everything stays glued to the surface.
import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BoardTiles } from './BoardTiles';
import { BaseBays } from './BaseBays';
import { NexusCore } from './NexusCore';
import { PowerCells } from './PowerCells';
import { PathPreview } from './PathPreview';
import { COLOR, SEAT_COLORS, SLAB_DEPTH, uEnergy, uTime, uTurnColor, useBudget, useDisposable } from './shared';
import { beamFrag, beamVert, flatVert, glowFrag, ribbonFrag, ribbonVert } from './shaders/board';

const SLAB_HALF = 7.85;
const SLAB_CHAMFER = 0.9;
const BEVEL = 0.06;

/** Chamfered-square outline (counter-clockwise in XZ), optionally inflated. */
function outline(half: number, chamfer: number): THREE.Vector2[] {
  const h = half;
  const c = chamfer;
  return [
    new THREE.Vector2(-h + c, -h),
    new THREE.Vector2(h - c, -h),
    new THREE.Vector2(h, -h + c),
    new THREE.Vector2(h, h - c),
    new THREE.Vector2(h - c, h),
    new THREE.Vector2(-h + c, h),
    new THREE.Vector2(-h, h - c),
    new THREE.Vector2(-h, -h + c),
  ];
}

/** Procedural brushed-metal roughness texture (horizontal streaks). */
function brushedTexture(): THREE.DataTexture {
  const w = 256;
  const h = 256;
  const data = new Uint8Array(w * h * 4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows = new Float32Array(h);
  for (let y = 0; y < h; y++) rows[y] = rnd();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const streak = rows[y] * 0.6 + rows[(y + 1) % h] * 0.25 + rnd() * 0.15;
      const v = Math.round(110 + streak * 90);
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.22, 0.22);
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Build a ribbon along the chamfered outline. `vertical` ribbons span y0→y1 at
 * radius `half`; flat ribbons span half→half2 at height y0. Attributes: aT
 * (perimeter angle 0..1), aV (0..1 across the ribbon).
 */
function ribbonGeometry(opts: { half: number; chamfer: number; y0: number; y1?: number; half2?: number }): THREE.BufferGeometry {
  const a = outline(opts.half, opts.chamfer);
  const b = opts.half2 !== undefined ? outline(opts.half2, opts.chamfer * (opts.half2 / opts.half)) : null;
  // subdivide edges so the perimeter gradient is smooth
  const SUB = 24;
  const pos: number[] = [];
  const at: number[] = [];
  const av: number[] = [];
  const idx: number[] = [];
  let v = 0;
  for (let e = 0; e < a.length; e++) {
    const n = (e + 1) % a.length;
    for (let s = 0; s <= SUB; s++) {
      const k = s / SUB;
      const ax = THREE.MathUtils.lerp(a[e].x, a[n].x, k);
      const az = THREE.MathUtils.lerp(a[e].y, a[n].y, k);
      const t = (Math.atan2(az, ax) / (Math.PI * 2) + 1) % 1;
      if (b) {
        const bx = THREE.MathUtils.lerp(b[e].x, b[n].x, k);
        const bz = THREE.MathUtils.lerp(b[e].y, b[n].y, k);
        pos.push(ax, opts.y0, az, bx, opts.y0, bz);
      } else {
        pos.push(ax, opts.y0, az, ax, opts.y1 ?? opts.y0, az);
      }
      at.push(t, t);
      av.push(0, 1);
      if (s > 0) idx.push(v - 2, v, v - 1, v - 1, v, v + 1);
      v += 2;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 1));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(av, 1));
  g.setIndex(idx);
  return g;
}

function Slab() {
  const geometry = useDisposable(() => {
    const shape = new THREE.Shape(outline(SLAB_HALF - BEVEL, SLAB_CHAMFER));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: SLAB_DEPTH - BEVEL * 2,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelSegments: 2,
      curveSegments: 1,
    });
    g.rotateX(-Math.PI / 2);
    g.computeBoundingBox();
    g.translate(0, -g.boundingBox!.max.y, 0);
    g.computeVertexNormals();
    return g;
  }, []);
  const texture = useDisposable(brushedTexture, []);
  const material = useDisposable(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1a2033',
        metalness: 0.88,
        roughness: 0.42,
        roughnessMap: texture,
        envMapIntensity: 1.1,
      }),
    [texture],
  );
  return <mesh geometry={geometry} material={material} />;
}

function EdgeStrips() {
  const { tier } = useBudget();
  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ribbonVert,
        fragmentShader: ribbonFrag,
        uniforms: { uTime, uTurn: uTurnColor, uEnergy, uSeat: { value: SEAT_COLORS.map((c) => c.clone()) }, uIntensity: { value: 1 } },
        side: THREE.DoubleSide,
        toneMapped: true,
      }),
    [],
  );
  const dimMaterial = useDisposable(() => {
    const m = material.clone();
    m.uniforms = { ...material.uniforms, uIntensity: { value: 0.55 } };
    return m;
  }, [material]);
  const geos = useDisposable(() => {
    const out = SLAB_HALF + 0.004;
    const top = ribbonGeometry({ half: out, chamfer: SLAB_CHAMFER + 0.02, y0: -0.13, y1: -0.07 });
    const bottom = ribbonGeometry({ half: out, chamfer: SLAB_CHAMFER + 0.02, y0: -SLAB_DEPTH + 0.06, y1: -SLAB_DEPTH + 0.1 });
    const inlay = ribbonGeometry({ half: 7.6, chamfer: 0.7, y0: 0.003, half2: 7.66 });
    return { top, bottom, inlay, dispose: () => [top, bottom, inlay].forEach((g) => g.dispose()) };
  }, []);
  return (
    <group>
      <mesh geometry={geos.top} material={material} />
      {tier !== 'low' && <mesh geometry={geos.bottom} material={dimMaterial} />}
      <mesh geometry={geos.inlay} material={material} />
    </group>
  );
}

/** Additive glow under the slab + four corner thrusters with downward light cones. */
function Underglow() {
  const { tier } = useBudget();
  const glowMat = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: flatVert,
        fragmentShader: glowFrag,
        uniforms: {
          uTime,
          uTurn: uTurnColor,
          uColor: { value: COLOR.purple },
          uTurnMix: { value: 0.65 },
          uIntensity: { value: 1.3 },
          uShape: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const thrusterMat = useDisposable(() => {
    const m = glowMat.clone();
    m.uniforms = { ...glowMat.uniforms, uColor: { value: COLOR.cyan }, uTurnMix: { value: 0.4 }, uIntensity: { value: 3 }, uShape: { value: 0 } };
    return m;
  }, [glowMat]);
  const coneMat = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: beamVert,
        fragmentShader: beamFrag,
        uniforms: { uTime, uTurn: uTurnColor, uIntensity: { value: 0.55 }, uSpeed: { value: -0.6 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const geos = useDisposable(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    // cone: narrow at the slab, widening downward; flipped so uv.y=0 (bright) sits at the top
    const cone = new THREE.CylinderGeometry(1.6, 0.35, 5, 24, 1, true).translate(0, 2.5, 0).rotateX(Math.PI);
    return { plane, cone, dispose: () => [plane, cone].forEach((g) => g.dispose()) };
  }, []);
  const corners: [number, number][] = [
    [-5.6, -5.6],
    [5.6, -5.6],
    [5.6, 5.6],
    [-5.6, 5.6],
  ];
  const y = -SLAB_DEPTH - 0.03;
  return (
    <group>
      <mesh geometry={geos.plane} material={glowMat} rotation-x={Math.PI / 2} position-y={y} scale={[19, 19, 1]} renderOrder={6} />
      {corners.map(([x, z], i) => (
        <group key={i} position={[x, y - 0.01, z]}>
          <mesh geometry={geos.plane} material={thrusterMat} rotation-x={Math.PI / 2} scale={[2.6, 2.6, 1]} renderOrder={6} />
          {tier !== 'low' && <mesh geometry={geos.cone} material={coneMat} renderOrder={6} />}
        </group>
      ))}
    </group>
  );
}

export function Board({ children }: { children?: ReactNode }) {
  const floatRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = floatRef.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    // very subtle idle float — keeps tokens glued since they ride in this group
    g.position.y = Math.sin(t * 0.55) * 0.035 + uEnergy.value * Math.sin(t * 1.4) * 0.05;
    g.rotation.x = Math.sin(t * 0.37) * 0.0025;
    g.rotation.z = Math.cos(t * 0.31) * 0.0025;
  });
  return (
    <group ref={floatRef}>
      <Slab />
      <EdgeStrips />
      <Underglow />
      <BaseBays />
      <BoardTiles />
      <NexusCore />
      <PowerCells />
      <PathPreview />
      {children}
    </group>
  );
}
