// Instanced voxel / shard debris with a tiny CPU rigid-body sim (gravity,
// drag, floor bounce, tumbling). Fixed capacity, zero per-frame allocations.
import * as THREE from 'three';

export interface DebrisSpawn {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Instance scale (voxel = equal, shard = flat). */
  sx: number;
  sy: number;
  sz: number;
  r: number;
  g: number;
  b: number;
  life: number;
  gravity: number;
  drag: number;
  spin: number;
  bounce: boolean;
}

export function makeDebrisSpawn(): DebrisSpawn {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 0.08, sy: 0.08, sz: 0.08, r: 1, g: 1, b: 1, life: 1, gravity: -9, drag: 0.5, spin: 8, bounce: true };
}

const FLOOR = 0.07;

export class DebrisSystem {
  readonly mesh: THREE.InstancedMesh;
  private readonly cap: number;
  private readonly data: Float32Array; // per instance: px py pz vx vy vz ax ay az ang angVel age life grav drag bounce sx sy sz
  private static readonly STRIDE = 19;
  private cursor = 0;
  private alive = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(capacity: number) {
    this.cap = capacity;
    this.data = new Float32Array(capacity * DebrisSystem.STRIDE);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, this.c.setRGB(0, 0, 0));
    }
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  }

  spawn(s: DebrisSpawn): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    const d = this.data;
    const o = i * DebrisSystem.STRIDE;
    if (d[o + 12] <= 0) this.alive++;
    d[o] = s.x;
    d[o + 1] = s.y;
    d[o + 2] = s.z;
    d[o + 3] = s.vx;
    d[o + 4] = s.vy;
    d[o + 5] = s.vz;
    this.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    d[o + 6] = this.axis.x;
    d[o + 7] = this.axis.y;
    d[o + 8] = this.axis.z;
    d[o + 9] = Math.random() * Math.PI * 2;
    d[o + 10] = s.spin * (0.5 + Math.random());
    d[o + 11] = 0;
    d[o + 12] = s.life;
    d[o + 13] = s.gravity;
    d[o + 14] = s.drag;
    d[o + 15] = s.bounce ? 1 : 0;
    d[o + 16] = s.sx;
    d[o + 17] = s.sy;
    d[o + 18] = s.sz;
    this.mesh.setColorAt(i, this.c.setRGB(s.r, s.g, s.b));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  update(dt: number): void {
    if (this.alive <= 0) return;
    const d = this.data;
    const S = DebrisSystem.STRIDE;
    let alive = 0;
    for (let i = 0; i < this.cap; i++) {
      const o = i * S;
      const life = d[o + 12];
      if (life <= 0) continue;
      const age = d[o + 11] + dt;
      if (age >= life) {
        d[o + 12] = 0;
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m);
        continue;
      }
      alive++;
      d[o + 11] = age;
      const drag = Math.exp(-d[o + 14] * dt);
      d[o + 3] *= drag;
      d[o + 5] *= drag;
      d[o + 4] = d[o + 4] * drag + d[o + 13] * dt;
      d[o] += d[o + 3] * dt;
      d[o + 1] += d[o + 4] * dt;
      d[o + 2] += d[o + 5] * dt;
      if (d[o + 15] > 0 && d[o + 1] < FLOOR) {
        d[o + 1] = FLOOR;
        if (d[o + 4] < 0) d[o + 4] *= -0.35;
        d[o + 3] *= 0.6;
        d[o + 5] *= 0.6;
        d[o + 10] *= 0.7;
      }
      d[o + 9] += d[o + 10] * dt;
      const f = age / life;
      const k = f > 0.7 ? 1 - (f - 0.7) / 0.3 : Math.min(1, age * 20);
      this.axis.set(d[o + 6], d[o + 7], d[o + 8]);
      this.q.setFromAxisAngle(this.axis, d[o + 9]);
      this.p.set(d[o], d[o + 1], d[o + 2]);
      this.s.set(d[o + 16] * k, d[o + 17] * k, d[o + 18] * k);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.alive = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
