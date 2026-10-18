// Camera-facing neon ribbon that follows an object in world space while
// `active` is true, then shrinks into its head and fades out.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';

const N = 34;
const STEP = 1 / 90; // sample rate (s)

const VERT = /* glsl */ `
attribute float aT;
attribute float aS;
varying float vT;
varying float vS;
void main() {
  vT = aT;
  vS = aS;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vT;
varying float vS;
void main() {
  float head = 1.0 - vT;
  float core = exp(-vS * vS * 5.0);
  float a = pow(head, 1.6) * (0.35 + 0.65 * core) * uOpacity;
  if (a < 0.003) discard;
  vec3 col = mix(uColor, vec3(2.5), core * head * 0.45) * (1.2 + 1.8 * head);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

const _head = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _view = new THREE.Vector3();
const _side = new THREE.Vector3();

interface NeonTrailProps {
  source: RefObject<THREE.Object3D | null>;
  active: RefObject<boolean>;
  color: THREE.Color;
  width?: number;
}

export function NeonTrail({ source, active, color, width = 0.15 }: NeonTrailProps) {
  const res = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    const t = new Float32Array(N * 2);
    const s = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      t[i * 2] = t[i * 2 + 1] = i / (N - 1);
      s[i * 2] = 1;
      s[i * 2 + 1] = -1;
    }
    const index: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setAttribute('position', pos);
    geo.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    geo.setAttribute('aS', new THREE.BufferAttribute(s, 1));
    geo.setIndex(index);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uColor: { value: color.clone().multiplyScalar(2) }, uOpacity: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    return { geo, mat, pos, pts: new Float32Array(N * 3), acc: 0, opacity: 0, primed: false };
  }, [color]);

  useEffect(
    () => () => {
      res.geo.dispose();
      res.mat.dispose();
    },
    [res],
  );

  const mesh = useRef<THREE.Mesh>(null);

  useFrame(({ camera }, delta) => {
    const src = source.current;
    const m = mesh.current;
    if (!src || !m) return;
    src.getWorldPosition(_head);
    const on = !!active.current;
    const pts = res.pts;
    res.opacity = THREE.MathUtils.damp(res.opacity, on ? 1 : 0, on ? 18 : 5, delta);
    if (!res.primed || (!on && res.opacity < 0.01)) {
      for (let i = 0; i < N; i++) {
        pts[i * 3] = _head.x;
        pts[i * 3 + 1] = _head.y;
        pts[i * 3 + 2] = _head.z;
      }
      res.primed = true;
      res.opacity = on ? res.opacity : 0;
      m.visible = on;
      if (!on) return;
    }
    m.visible = true;
    // fixed-rate history so trail length is frame-rate independent
    res.acc += Math.min(delta, 0.1);
    let steps = 0;
    while (res.acc >= STEP && steps < 6) {
      res.acc -= STEP;
      steps++;
      pts.copyWithin(3, 0, (N - 1) * 3);
    }
    pts[0] = _head.x;
    pts[1] = _head.y;
    pts[2] = _head.z;
    const arr = res.pos.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const i0 = Math.max(0, i - 1) * 3;
      const i1 = Math.min(N - 1, i + 1) * 3;
      _tan.set(pts[i0] - pts[i1], pts[i0 + 1] - pts[i1 + 1], pts[i0 + 2] - pts[i1 + 2]);
      const o = i * 3;
      _view.set(camera.position.x - pts[o], camera.position.y - pts[o + 1], camera.position.z - pts[o + 2]);
      _side.crossVectors(_tan, _view);
      const l = _side.length();
      if (l > 1e-6) _side.multiplyScalar((width * (1 - (i / (N - 1)) * 0.75)) / l);
      else _side.set(0, 0, 0);
      const v = i * 6;
      arr[v] = pts[o] + _side.x;
      arr[v + 1] = pts[o + 1] + _side.y;
      arr[v + 2] = pts[o + 2] + _side.z;
      arr[v + 3] = pts[o] - _side.x;
      arr[v + 4] = pts[o + 1] - _side.y;
      arr[v + 5] = pts[o + 2] - _side.z;
    }
    res.pos.needsUpdate = true;
    res.mat.uniforms.uOpacity.value = res.opacity;
  });

  return <mesh ref={mesh} geometry={res.geo} material={res.mat} frustumCulled={false} renderOrder={7} raycast={() => null} />;
}
