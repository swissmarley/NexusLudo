// Deterministic procedural dice-throw kinematics + face orientation math.
import * as THREE from 'three';

export const DIE_SIZE = 0.62;
export const DIE_HALF = DIE_SIZE / 2;
export const DIE_RADIUS = 0.07;
/** Height of the pad surface the die rests on. */
export const DIE_FLOOR = 0.06;
export const DIE_REST_Y = DIE_FLOOR + DIE_HALF;
export const DIE_HOVER_Y = DIE_REST_Y + 0.6;

/** Local face normal for each value (opposite faces sum to 7). */
export const FACE_NORMALS: Record<number, THREE.Vector3> = {
  1: new THREE.Vector3(0, 1, 0),
  6: new THREE.Vector3(0, -1, 0),
  2: new THREE.Vector3(1, 0, 0),
  5: new THREE.Vector3(-1, 0, 0),
  3: new THREE.Vector3(0, 0, 1),
  4: new THREE.Vector3(0, 0, -1),
};

/** Rotation that brings `value`'s face to point +Y. */
export function faceUpQuat(value: number, out = new THREE.Quaternion()): THREE.Quaternion {
  const X = new THREE.Vector3(1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  switch (value) {
    case 6:
      return out.setFromAxisAngle(X, Math.PI);
    case 2:
      return out.setFromAxisAngle(Z, Math.PI / 2);
    case 5:
      return out.setFromAxisAngle(Z, -Math.PI / 2);
    case 3:
      return out.setFromAxisAngle(X, -Math.PI / 2);
    case 4:
      return out.setFromAxisAngle(X, Math.PI / 2);
    default:
      return out.identity();
  }
}

/** Pip offsets (in units of pip spacing) on a face for each value. */
export const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

/** Tangent axes (u, v) spanning each face. */
export function faceAxes(n: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  if (Math.abs(n.y) > 0.5) return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];
  if (Math.abs(n.x) > 0.5) return [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)];
  return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ThrowPlan {
  start: THREE.Vector3;
  startQ: THREE.Quaternion;
  launch: THREE.Vector3;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  p3: THREE.Vector3;
  end: THREE.Vector3;
  target: THREE.Quaternion;
  ax1: THREE.Vector3;
  ax2: THREE.Vector3;
  spin1: number;
  spin2: number;
}

/** Normalised times of the lift end and the three floor impacts. */
export const T_LIFT = 0.12;
export const T_IMPACTS = [0.5, 0.7, 0.84] as const;

export function createThrowPlan(start: THREE.Vector3, startQ: THREE.Quaternion, pad: THREE.Vector3, value: number, seed: number): ThrowPlan {
  const rng = mulberry32(seed * 7919 + value * 31);
  // throw from the outer corner of the base towards the board centre
  const dir = new THREE.Vector3(-pad.x, 0, -pad.z);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
  dir.normalize();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  const lat = (rng() - 0.5) * 0.7;
  const at = (back: number, side: number, y: number) =>
    new THREE.Vector3(pad.x - dir.x * back + perp.x * side, y, pad.z - dir.z * back + perp.z * side);
  const end = new THREE.Vector3(pad.x, DIE_REST_Y, pad.z);
  const yaw = rng() * Math.PI * 2;
  const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(faceUpQuat(value));
  const randAxis = () => new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
  return {
    start: start.clone(),
    startQ: startQ.clone(),
    launch: at(1.35, lat * 1.2, 1.75),
    p1: at(0.62, lat * 0.7, DIE_REST_Y),
    p2: at(0.2, lat * 0.3, DIE_REST_Y),
    p3: at(-0.04, lat * 0.08, DIE_REST_Y),
    end,
    target,
    ax1: randAxis(),
    ax2: randAxis(),
    spin1: Math.PI * 2 * (2.6 + rng() * 1.2),
    spin2: Math.PI * 2 * (0.6 + rng() * 0.8),
  };
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const smooth = (x: number) => x * x * (3 - 2 * x);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

/** Sample the throw at normalised time t∈[0,1]. At t=1 it equals (end, target) exactly. */
export function sampleThrow(p: ThrowPlan, t: number, outPos: THREE.Vector3, outQ: THREE.Quaternion): void {
  t = Math.min(1, Math.max(0, t));
  // rotation: decaying tumble that converges exactly onto the target face
  _qa.setFromAxisAngle(p.ax1, p.spin1 * Math.pow(1 - t, 2.2));
  _qb.setFromAxisAngle(p.ax2, p.spin2 * Math.pow(1 - t, 2.6));
  _qr.copy(p.target).multiply(_qa).multiply(_qb);
  if (t < T_LIFT) outQ.copy(p.startQ).slerp(_qr, smooth(t / T_LIFT));
  else outQ.copy(_qr);

  const [T1, T2, T3] = T_IMPACTS;
  let y: number;
  if (t < T_LIFT) {
    const s = easeOut(t / T_LIFT);
    outPos.lerpVectors(p.start, p.launch, s);
    return;
  } else if (t < T1) {
    const s = (t - T_LIFT) / (T1 - T_LIFT);
    outPos.lerpVectors(p.launch, p.p1, s);
    y = (1 - s) * p.launch.y + s * DIE_REST_Y + 4 * 1.0 * s * (1 - s);
  } else if (t < T2) {
    const s = (t - T1) / (T2 - T1);
    outPos.lerpVectors(p.p1, p.p2, s);
    y = DIE_REST_Y + 4 * 0.5 * s * (1 - s);
  } else if (t < T3) {
    const s = (t - T2) / (T3 - T2);
    outPos.lerpVectors(p.p2, p.p3, s);
    y = DIE_REST_Y + 4 * 0.16 * s * (1 - s);
  } else {
    const s = (t - T3) / (1 - T3);
    outPos.lerpVectors(p.p3, p.end, easeOut(s));
    y = DIE_REST_Y;
  }
  // keep tilted corners above the floor: rounded-box vertical half-extent
  _m.makeRotationFromQuaternion(outQ);
  const e = _m.elements;
  const ext = (DIE_HALF - DIE_RADIUS) * (Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9])) + DIE_RADIUS;
  const w = Math.min(1, (t - T_LIFT) / 0.08);
  outPos.y = y + (ext - DIE_HALF) * w;
}
