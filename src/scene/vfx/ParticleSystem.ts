// GPU particle pool: a single THREE.Points whose motion is fully evaluated in
// the vertex shader from spawn attributes (no per-frame CPU simulation).
// Particles are written into a ring buffer; only dirty ranges are uploaded.
import * as THREE from 'three';

export const SHAPE_GLOW = 0;
export const SHAPE_SHARD = 1;
export const SHAPE_STAR = 2;

export const MOTION_BALLISTIC = 0;
/** Spiral-in: vel = (radius, angularSpeed, rise); spin = start angle. */
export const MOTION_SPIRAL = 1;

/** Mutable spawn descriptor — reuse one instance to avoid allocations. */
export interface ParticleSpawn {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  life: number;
  size: number;
  gravity: number;
  drag: number;
  shape: number;
  motion: number;
  spin: number;
  delay: number;
}

export function makeSpawn(): ParticleSpawn {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, life: 1, size: 0.1, gravity: 0, drag: 0, shape: 0, motion: 0, spin: 0, delay: 0 };
}

const VERT = /* glsl */ `
uniform float uTime;
uniform float uSizeScale;
attribute vec3 aVel;
attribute vec3 aColor;
attribute vec4 aTime;  // start, life, size, shape
attribute vec4 aPhys;  // gravity, drag, motion, spin/seed
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
varying float vAge;
varying float vSeed;
void main() {
  float age = uTime - aTime.x;
  float life = aTime.y;
  if (age < 0.0 || age > life || life <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    return;
  }
  float f = age / life;
  vec3 p;
  if (aPhys.z < 0.5) {
    float k = max(aPhys.y, 0.0001);
    p = position + aVel * (1.0 - exp(-k * age)) / k;
    p.y += 0.5 * aPhys.x * age * age;
  } else {
    float e = f * f * (3.0 - 2.0 * f);
    float r = aVel.x * (1.0 - e);
    float a = aPhys.w + aVel.y * age;
    p = position + vec3(cos(a) * r, aVel.z * e, sin(a) * r);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = aTime.z * (1.0 - f * 0.55);
  gl_PointSize = clamp(sz * uSizeScale / max(-mv.z, 0.05), 0.0, 96.0);
  vColor = aColor;
  vAlpha = smoothstep(0.0, 0.06, f) * (1.0 - f);
  vShape = aTime.w;
  vAge = f;
  vSeed = aPhys.w;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
varying float vAge;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a;
  if (vShape < 0.5) {
    a = exp(-d * d * 4.5) * 0.8 + smoothstep(0.38, 0.0, d);
  } else if (vShape < 1.5) {
    float rot = vSeed * 6.2831 + vAge * 9.0;
    float cs = cos(rot); float sn = sin(rot);
    vec2 q = abs(mat2(cs, -sn, sn, cs) * c) * 2.0;
    a = smoothstep(1.0, 0.82, q.x * 1.6 + q.y * 0.9) * 1.2;
  } else {
    vec2 q = abs(c) * 2.0;
    a = max(exp(-q.x * 16.0) * exp(-q.y * 2.4), exp(-q.y * 16.0) * exp(-q.x * 2.4)) + exp(-d * d * 12.0);
  }
  a *= vAlpha;
  if (a < 0.004) discard;
  vec3 col = vColor * (1.0 + 1.6 * smoothstep(0.45, 0.0, d));
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

export class ParticleSystem {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private readonly capacity: number;
  private readonly pos: THREE.BufferAttribute;
  private readonly vel: THREE.BufferAttribute;
  private readonly col: THREE.BufferAttribute;
  private readonly time: THREE.BufferAttribute;
  private readonly phys: THREE.BufferAttribute;
  private readonly attrs: THREE.BufferAttribute[];
  private cursor = 0;
  private dirtyMin = Infinity;
  private dirtyMax = -1;
  private now = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    const g = new THREE.BufferGeometry();
    const mk = (n: number) => {
      const a = new THREE.BufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.pos = mk(3);
    this.vel = mk(3);
    this.col = mk(3);
    this.time = mk(4);
    this.phys = mk(4);
    this.attrs = [this.pos, this.vel, this.col, this.time, this.phys];
    // life 0 => inactive
    g.setAttribute('position', this.pos);
    g.setAttribute('aVel', this.vel);
    g.setAttribute('aColor', this.col);
    g.setAttribute('aTime', this.time);
    g.setAttribute('aPhys', this.phys);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uSizeScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  get time0(): number {
    return this.now;
  }

  spawn(s: ParticleSpawn): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const p = this.pos.array as Float32Array;
    const v = this.vel.array as Float32Array;
    const c = this.col.array as Float32Array;
    const t = this.time.array as Float32Array;
    const ph = this.phys.array as Float32Array;
    p[i * 3] = s.x;
    p[i * 3 + 1] = s.y;
    p[i * 3 + 2] = s.z;
    v[i * 3] = s.vx;
    v[i * 3 + 1] = s.vy;
    v[i * 3 + 2] = s.vz;
    c[i * 3] = s.r;
    c[i * 3 + 1] = s.g;
    c[i * 3 + 2] = s.b;
    t[i * 4] = this.now + s.delay;
    t[i * 4 + 1] = s.life;
    t[i * 4 + 2] = s.size;
    t[i * 4 + 3] = s.shape;
    ph[i * 4] = s.gravity;
    ph[i * 4 + 1] = s.drag;
    ph[i * 4 + 2] = s.motion;
    ph[i * 4 + 3] = s.spin;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  /** Advance the clock and flush dirty attribute ranges. */
  update(time: number, sizeScale: number): void {
    this.now = time;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uSizeScale.value = sizeScale;
    if (this.dirtyMax < 0) return;
    const start = this.dirtyMin;
    const count = this.dirtyMax - this.dirtyMin + 1;
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(start * a.itemSize, count * a.itemSize);
      a.needsUpdate = true;
    }
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
