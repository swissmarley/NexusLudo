// Pooled lightning bolts: jagged camera-facing ribbons that re-jitter
// several times per second while they live.
import * as THREE from 'three';

const SEG = 14;
const PTS = SEG + 1;

export interface BoltOpts {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  color: THREE.Color;
  life?: number;
  width?: number;
  /** Jaggedness as a fraction of the bolt length. */
  jitter?: number;
  delay?: number;
}

const VERT = /* glsl */ `
attribute float aSide;
attribute float aT;
varying float vSide;
varying float vT;
void main() {
  vSide = aSide;
  vT = aT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vSide;
varying float vT;
void main() {
  float core = exp(-vSide * vSide * 6.0);
  float ends = smoothstep(0.0, 0.08, vT) * smoothstep(1.0, 0.85, vT);
  float a = (core + 0.35 * (1.0 - abs(vSide))) * uOpacity * mix(0.5, 1.0, ends);
  if (a < 0.003) discard;
  vec3 col = mix(uColor * 1.2, vec3(3.0), core * 0.55);
  gl_FragColor = vec4(col, min(a, 1.0));
  #include <colorspace_fragment>
}
`;

interface BoltSlot {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  pos: THREE.BufferAttribute;
  active: boolean;
  age: number;
  delay: number;
  life: number;
  width: number;
  jitter: number;
  rejitter: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  pts: Float32Array;
}

const _dir = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _view = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _x = new THREE.Vector3(1, 0, 0);

export class BoltSystem {
  readonly group = new THREE.Group();
  private readonly slots: BoltSlot[] = [];
  private next = 0;

  constructor(capacity: number) {
    const index: number[] = [];
    for (let i = 0; i < SEG; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const side = new Float32Array(PTS * 2);
    const tt = new Float32Array(PTS * 2);
    for (let i = 0; i < PTS; i++) {
      side[i * 2] = 1;
      side[i * 2 + 1] = -1;
      tt[i * 2] = tt[i * 2 + 1] = i / SEG;
    }
    const base = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    for (let i = 0; i < capacity; i++) {
      const g = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(PTS * 2 * 3), 3);
      pos.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', pos);
      g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
      g.setAttribute('aT', new THREE.BufferAttribute(tt, 1));
      g.setIndex(index);
      const mat = i === 0 ? base : base.clone();
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 11;
      this.group.add(mesh);
      this.slots.push({
        mesh,
        mat,
        pos,
        active: false,
        age: 0,
        delay: 0,
        life: 0.3,
        width: 0.05,
        jitter: 0.15,
        rejitter: 0,
        a: new THREE.Vector3(),
        b: new THREE.Vector3(),
        pts: new Float32Array(PTS * 3),
      });
    }
  }

  spawn(o: BoltOpts): void {
    const s = this.slots[this.next];
    this.next = (this.next + 1) % this.slots.length;
    s.active = true;
    s.age = 0;
    s.delay = o.delay ?? 0;
    s.life = o.life ?? 0.3;
    s.width = o.width ?? 0.05;
    s.jitter = o.jitter ?? 0.16;
    s.rejitter = 0;
    s.a.set(o.ax, o.ay, o.az);
    s.b.set(o.bx, o.by, o.bz);
    (s.mat.uniforms.uColor.value as THREE.Color).copy(o.color);
    s.mesh.visible = false;
  }

  private shape(s: BoltSlot): void {
    _dir.subVectors(s.b, s.a);
    const len = _dir.length();
    _dir.normalize();
    _p1.crossVectors(_dir, Math.abs(_dir.y) > 0.9 ? _x : _up).normalize();
    _p2.crossVectors(_dir, _p1).normalize();
    const amp = s.jitter * len;
    let ox = 0;
    let oy = 0;
    for (let i = 0; i < PTS; i++) {
      const t = i / SEG;
      const env = Math.sin(Math.PI * t);
      // random walk keeps the bolt jagged but coherent
      ox = ox * 0.45 + (Math.random() - 0.5) * amp;
      oy = oy * 0.45 + (Math.random() - 0.5) * amp;
      const o = i * 3;
      s.pts[o] = s.a.x + (s.b.x - s.a.x) * t + (_p1.x * ox + _p2.x * oy) * env;
      s.pts[o + 1] = s.a.y + (s.b.y - s.a.y) * t + (_p1.y * ox + _p2.y * oy) * env;
      s.pts[o + 2] = s.a.z + (s.b.z - s.a.z) * t + (_p1.z * ox + _p2.z * oy) * env;
    }
  }

  private ribbon(s: BoltSlot, cam: THREE.Vector3): void {
    const arr = s.pos.array as Float32Array;
    const p = s.pts;
    for (let i = 0; i < PTS; i++) {
      const i0 = Math.max(0, i - 1) * 3;
      const i1 = Math.min(SEG, i + 1) * 3;
      _tan.set(p[i1] - p[i0], p[i1 + 1] - p[i0 + 1], p[i1 + 2] - p[i0 + 2]);
      const o = i * 3;
      _view.set(cam.x - p[o], cam.y - p[o + 1], cam.z - p[o + 2]);
      _side.crossVectors(_tan, _view).normalize().multiplyScalar(s.width * (0.55 + 0.45 * Math.sin(Math.PI * (i / SEG))));
      const v = i * 6;
      arr[v] = p[o] + _side.x;
      arr[v + 1] = p[o + 1] + _side.y;
      arr[v + 2] = p[o + 2] + _side.z;
      arr[v + 3] = p[o] - _side.x;
      arr[v + 4] = p[o + 1] - _side.y;
      arr[v + 5] = p[o + 2] - _side.z;
    }
    s.pos.needsUpdate = true;
  }

  update(dt: number, cam: THREE.Vector3): void {
    for (const s of this.slots) {
      if (!s.active) continue;
      s.age += dt;
      const t = s.age - s.delay;
      if (t < 0) continue;
      if (t >= s.life) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.mesh.visible = true;
      s.rejitter -= dt;
      if (s.rejitter <= 0) {
        s.rejitter = 0.045;
        this.shape(s);
      }
      this.ribbon(s, cam);
      const f = t / s.life;
      // flickering decay
      s.mat.uniforms.uOpacity.value = (1 - f) * (0.65 + 0.35 * Math.random());
    }
  }

  dispose(): void {
    for (const s of this.slots) {
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
  }
}
