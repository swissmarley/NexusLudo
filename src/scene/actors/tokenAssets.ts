// Shared token geometries (created once per <Tokens/> mount) and the
// per-token material bundle.
import * as THREE from 'three';
import { POWER_THEME, SEAT_THEME } from '../../core/theme';
import type { Seat } from '../../game/types';
import {
  createDecalMaterial,
  createPlasmaMaterial,
  createSelectRingMaterial,
  createShieldMaterial,
  makeDissolveUniforms,
  patchDissolve,
  type DissolveUniforms,
} from './shaders';

/** Token visual metrics (local space, y=0 at the token's foot). */
export const TOKEN = {
  coreY: 0.53,
  coreR: 0.105,
  haloY: 0.72,
  height: 0.8,
  shieldY: 0.4,
  shieldR: 0.5,
} as const;

export interface TokenGeometries {
  chassis: THREE.LatheGeometry;
  trimBase: THREE.TorusGeometry;
  trimCollar: THREE.TorusGeometry;
  prong: THREE.BoxGeometry;
  fin: THREE.BoxGeometry;
  finTip: THREE.BoxGeometry;
  core: THREE.IcosahedronGeometry;
  halo: THREE.TorusGeometry;
  decal: THREE.PlaneGeometry;
  select: THREE.PlaneGeometry;
  hit: THREE.CylinderGeometry;
  shield: THREE.SphereGeometry;
  marker: THREE.ConeGeometry;
}

/** Chess-pawn-meets-drone silhouette profile (radius, height). */
function chassisProfile(): THREE.Vector2[] {
  const pts: [number, number][] = [
    [0.0, 0.0],
    [0.27, 0.0],
    [0.3, 0.015],
    [0.305, 0.04],
    [0.28, 0.065],
    [0.23, 0.08],
    [0.2, 0.1],
    [0.165, 0.14],
    [0.13, 0.2],
    [0.105, 0.27],
    [0.098, 0.31],
    [0.11, 0.345],
    [0.165, 0.365],
    [0.185, 0.385],
    [0.17, 0.405],
    [0.12, 0.42],
    [0.085, 0.43],
    [0.0, 0.43],
  ];
  return pts.map(([r, y]) => new THREE.Vector2(r, y));
}

export function createTokenGeometries(): TokenGeometries {
  const decal = new THREE.PlaneGeometry(1.25, 1.25);
  decal.rotateX(-Math.PI / 2);
  const select = new THREE.PlaneGeometry(1.25, 1.25);
  select.rotateX(-Math.PI / 2);
  const trimBase = new THREE.TorusGeometry(0.29, 0.012, 8, 48);
  trimBase.rotateX(Math.PI / 2);
  const trimCollar = new THREE.TorusGeometry(0.18, 0.012, 8, 40);
  trimCollar.rotateX(Math.PI / 2);
  const halo = new THREE.TorusGeometry(0.19, 0.01, 6, 48);
  halo.rotateX(Math.PI / 2);
  const marker = new THREE.ConeGeometry(0.09, 0.2, 4);
  marker.rotateX(Math.PI);
  const hit = new THREE.CylinderGeometry(0.48, 0.48, 1.15, 12);
  hit.translate(0, 0.57, 0);
  return {
    chassis: new THREE.LatheGeometry(chassisProfile(), 40),
    trimBase,
    trimCollar,
    prong: new THREE.BoxGeometry(0.03, 0.17, 0.05),
    fin: new THREE.BoxGeometry(0.2, 0.025, 0.05),
    finTip: new THREE.BoxGeometry(0.05, 0.03, 0.06),
    core: new THREE.IcosahedronGeometry(TOKEN.coreR, 3),
    halo,
    decal,
    select,
    hit,
    shield: new THREE.SphereGeometry(TOKEN.shieldR, 40, 24),
    marker,
  };
}

export function disposeGeometries(g: TokenGeometries): void {
  Object.values(g).forEach((geo) => (geo as THREE.BufferGeometry).dispose());
}

export interface TokenMaterials {
  dissolve: DissolveUniforms;
  chassis: THREE.MeshPhysicalMaterial;
  trim: THREE.MeshStandardMaterial;
  core: THREE.ShaderMaterial;
  halo: THREE.MeshBasicMaterial;
  decal: THREE.ShaderMaterial;
  select: THREE.ShaderMaterial;
  shield: THREE.ShaderMaterial;
  marker: THREE.MeshBasicMaterial;
  hit: THREE.MeshBasicMaterial;
  seatColor: THREE.Color;
  dispose: () => void;
}

export function createTokenMaterials(seat: Seat): TokenMaterials {
  const seatColor = new THREE.Color(SEAT_THEME[seat].color);
  const glow = new THREE.Color(SEAT_THEME[seat].glow);
  const dissolve = makeDissolveUniforms(glow.clone().multiplyScalar(1.4));
  const chassis = patchDissolve(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#1a1f2e').lerp(new THREE.Color(SEAT_THEME[seat].deep), 0.25),
      metalness: 0.92,
      roughness: 0.26,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
      emissive: new THREE.Color(SEAT_THEME[seat].deep),
      emissiveIntensity: 0.25,
    }),
    dissolve,
  );
  const trim = patchDissolve(
    new THREE.MeshStandardMaterial({
      color: '#05060a',
      emissive: seatColor,
      emissiveIntensity: 3,
      metalness: 0.3,
      roughness: 0.4,
      toneMapped: false,
    }),
    dissolve,
  );
  const core = createPlasmaMaterial(seatColor, dissolve);
  const halo = new THREE.MeshBasicMaterial({
    color: seatColor.clone().multiplyScalar(3),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const decal = createDecalMaterial(seatColor.clone().multiplyScalar(1.6));
  const select = createSelectRingMaterial(glow.clone().multiplyScalar(2.2));
  const shield = createShieldMaterial(new THREE.Color(POWER_THEME.shield.color).multiplyScalar(1.6));
  const marker = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#e8f6ff').multiplyScalar(2.2),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  // invisible but raycastable hit volume
  const hit = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  const all: THREE.Material[] = [chassis, trim, core, halo, decal, select, shield, marker, hit];
  return {
    dissolve,
    chassis,
    trim,
    core,
    halo,
    decal,
    select,
    shield,
    marker,
    hit,
    seatColor,
    dispose: () => all.forEach((m) => m.dispose()),
  };
}
