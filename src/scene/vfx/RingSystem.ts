// Pooled flat ring effects (pulse / electric shockwave / hex flash) drawn
// with a single procedural shader on horizontal quads.
import * as THREE from 'three';
import { HEX_GLSL, NOISE_GLSL } from './glsl';

export const RING_SOFT = 0;
export const RING_ELECTRIC = 1;
export const RING_HEX = 2;

export interface RingOpts {
  x: number;
  y?: number;
  z: number;
  radius: number;
  duration: number;
  color: THREE.Color;
  style?: number;
  thickness?: number;
  opacity?: number;
  delay?: number;
  /** Vertical rise in units over the lifetime (for rising rings). */
  rise?: number;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uP;
uniform float uStyle;
uniform float uThick;
uniform float uOpacity;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
${NOISE_GLSL}
${HEX_GLSL}
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float r = length(q);
  float ang = atan(q.y, q.x);
  float R = 1.0 - pow(1.0 - uP, 3.0);
  float th = max(uThick * (1.0 - 0.6 * uP), 0.004);
  float a = 0.0;
  if (uStyle < 0.5) {
    float d = r - R;
    a = exp(-d * d / (th * th)) + 0.18 * smoothstep(R, 0.0, r) * step(r, R);
  } else if (uStyle < 1.5) {
    float n = nx_noise(vec3(ang * 5.0, uTime * 14.0, uSeed)) - 0.5;
    float rr = r + n * 0.07 * (1.0 - uP);
    float d = rr - R;
    a = exp(-d * d / (th * th)) * 1.5;
    float fil = pow(abs(sin(ang * 19.0 + nx_noise(vec3(r * 9.0, uTime * 22.0, uSeed)) * 7.0)), 36.0);
    a += fil * smoothstep(R - 0.3, R, r) * step(r, R) * 1.2;
    a += 0.12 * smoothstep(R, 0.0, r) * step(r, R);
  } else {
    float edge = nx_hexEdge(q * 7.0, 0.12);
    float inside = smoothstep(R, R - 0.35, r) * step(r, R);
    float d = r - R;
    a = edge * inside * 0.9 + exp(-d * d / (th * th));
  }
  a *= (1.0 - uP) * uOpacity * smoothstep(1.0, 0.96, r);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * (1.0 + a * 0.6), min(a, 1.0));
  #include <colorspace_fragment>
}
`;

interface RingSlot {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  active: boolean;
  age: number;
  delay: number;
  duration: number;
  radius: number;
  y0: number;
  rise: number;
}

export class RingSystem {
  readonly group = new THREE.Group();
  private readonly geo: THREE.PlaneGeometry;
  private readonly slots: RingSlot[] = [];
  private next = 0;

  constructor(capacity: number) {
    this.geo = new THREE.PlaneGeometry(2, 2);
    this.geo.rotateX(-Math.PI / 2);
    const base = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uColor: { value: new THREE.Color() },
        uP: { value: 0 },
        uStyle: { value: 0 },
        uThick: { value: 0.05 },
        uOpacity: { value: 1 },
        uTime: { value: 0 },
        uSeed: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    for (let i = 0; i < capacity; i++) {
      const mat = i === 0 ? base : base.clone();
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
      this.group.add(mesh);
      this.slots.push({ mesh, mat, active: false, age: 0, delay: 0, duration: 1, radius: 1, y0: 0, rise: 0 });
    }
  }

  spawn(o: RingOpts): void {
    const s = this.slots[this.next];
    this.next = (this.next + 1) % this.slots.length;
    s.active = true;
    s.age = 0;
    s.delay = o.delay ?? 0;
    s.duration = Math.max(0.05, o.duration);
    s.radius = o.radius;
    s.y0 = o.y ?? 0.08;
    s.rise = o.rise ?? 0;
    s.mesh.position.set(o.x, s.y0, o.z);
    s.mesh.scale.setScalar(o.radius);
    const u = s.mat.uniforms;
    (u.uColor.value as THREE.Color).copy(o.color);
    u.uStyle.value = o.style ?? RING_SOFT;
    // thickness is given in world units → normalise by radius
    u.uThick.value = (o.thickness ?? 0.12) / o.radius;
    u.uOpacity.value = o.opacity ?? 1;
    u.uSeed.value = Math.random() * 100;
    u.uP.value = 0;
    s.mesh.visible = false;
  }

  update(dt: number, time: number): void {
    for (const s of this.slots) {
      if (!s.active) continue;
      s.age += dt;
      const t = s.age - s.delay;
      if (t < 0) continue;
      const p = t / s.duration;
      if (p >= 1) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.mesh.visible = true;
      s.mesh.position.y = s.y0 + s.rise * (1 - (1 - p) * (1 - p));
      s.mat.uniforms.uP.value = p;
      s.mat.uniforms.uTime.value = time;
    }
  }

  dispose(): void {
    this.geo.dispose();
    for (const s of this.slots) s.mat.dispose();
  }
}
