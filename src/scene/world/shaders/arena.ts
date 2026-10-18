// Shaders for the arena: neon grid floor, skyline, data pillars, holo rings, sky dome.
import { GLSL_FOG, GLSL_NOISE, GLSL_OUTPUT, GLSL_SDF } from './common';
import { COLOR, FLOOR_Y } from '../shared';

const v3 = (c: { r: number; g: number; b: number }) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;

const PALETTE_GLSL = /* glsl */ `
const vec3 C_CYAN = ${v3(COLOR.cyan)};
const vec3 C_PURPLE = ${v3(COLOR.purple)};
const vec3 C_MAGENTA = ${v3(COLOR.magenta)};
const vec3 C_AMBER = ${v3(COLOR.amber)};
`;

// ── Floor ──────────────────────────────────────────────────────
export const floorVert = /* glsl */ `
varying vec3 vWorld;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const floorFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uTurn;
uniform float uEnergy;
uniform float uDetail;
varying vec3 vWorld;
${GLSL_NOISE}
${GLSL_SDF}
${GLSL_FOG}
${PALETTE_GLSL}

float grid(vec2 p, float scale, float width){
  vec2 q = p / scale;
  vec2 fw = fwidth(q);
  vec2 g = abs(fract(q - 0.5) - 0.5) / max(fw, vec2(1e-4));
  float l = 1.0 - min(min(g.x, g.y) / (width + 0.0001), 1.0);
  // fade out where the grid would alias (grazing angles / far away)
  float fade = 1.0 - smoothstep(0.15, 0.6, max(fw.x, fw.y));
  return l * fade;
}

void main(){
  vec2 p = vWorld.xz;
  float r = length(p);
  float dist = length(cameraPosition - vWorld);

  // deep glossy base
  vec3 col = vec3(0.006, 0.004, 0.016);
  float n = fbm(p * 0.06 + vec2(uTime * 0.01, 0.0));
  col += vec3(0.010, 0.006, 0.030) * n;

  // fake reflection: board silhouette glow + turn tint pooled beneath the slab
  float boardD = sdChamferBox(p, vec2(7.9), 1.0);
  float pool = exp(-max(boardD, 0.0) * 0.22) * (boardD < 0.0 ? 1.0 : 1.0);
  col += uTurn * pool * (0.10 + 0.08 * uEnergy);
  float rim = exp(-abs(boardD) * 1.4);
  col += mix(C_CYAN, uTurn, 0.5) * rim * 0.35;

  // neon grid: minor + major lines, tinted by angle
  float ang = atan(p.y, p.x);
  vec3 gridCol = mix(C_PURPLE, C_CYAN, 0.5 + 0.5 * sin(ang * 2.0 + uTime * 0.15));
  gridCol = mix(gridCol, uTurn, 0.25);
  float minor = grid(p, 1.0, 1.0) * 0.18 * uDetail;
  float major = grid(p, 5.0, 1.4);
  // energy pulses expanding from the centre
  float wave = mod(uTime * 9.0, 140.0);
  float pulse = exp(-pow((r - wave) * 0.12, 2.0)) * 1.2;
  // data packets streaking along the major lines
  vec2 cellId = floor(p / 5.0);
  float lane = hash21(cellId.yy + 3.1);
  float packet = smoothstep(0.96, 1.0, fract(p.x * 0.03 - uTime * (0.08 + lane * 0.1) + lane * 7.0));
  float laneB = hash21(cellId.xx + 9.7);
  float packetB = smoothstep(0.965, 1.0, fract(p.y * 0.03 + uTime * (0.06 + laneB * 0.1) + laneB * 5.0));
  float majorX = grid(vec2(p.x, 0.5), 5.0, 1.4);
  float majorZ = grid(vec2(0.5, p.y), 5.0, 1.4);
  float lines = minor + major * (0.55 + pulse) + (majorZ * packet + majorX * packetB) * 2.5 * uDetail;

  float distFade = exp(-r * 0.022);
  col += gridCol * lines * distFade * 0.6;

  // landing-pad rings under the board
  float ring1 = strokeAA(r - 13.5, 0.06);
  float ring2 = strokeAA(r - 14.2, 0.025);
  float ticks = step(0.5, fract(ang / 6.2831853 * 96.0 + uTime * 0.05)) * strokeAA(r - 15.0, 0.25);
  col += mix(C_CYAN, uTurn, 0.6) * (ring1 * 1.4 + ring2 * 0.9 + ticks * 0.6) * (0.8 + 0.2 * sin(uTime * 2.0));

  // horizon sheen
  float sheen = pow(1.0 - clamp(abs(normalize(cameraPosition - vWorld).y), 0.0, 1.0), 4.0);
  col += C_PURPLE * sheen * 0.08;

  float fogF = fogFactor(dist, FOG_DENSITY * 0.9);
  col = mix(col, FOG_COLOR, fogF);
  gl_FragColor = vec4(col, 1.0);
  ${GLSL_OUTPUT}
}`;

// ── Skyline ────────────────────────────────────────────────────
export const skylineVert = /* glsl */ `
attribute vec3 aSize;
attribute float aSeed;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vNormalL;
varying float vSeed;
varying vec3 vSize;
void main(){
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vLocal = position * aSize;
  vNormalL = normal;
  vSeed = aSeed;
  vSize = aSize;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const skylineFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uTurn;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vNormalL;
varying float vSeed;
varying vec3 vSize;
${GLSL_NOISE}
${GLSL_FOG}
${PALETTE_GLSL}
void main(){
  bool top = vNormalL.y > 0.5;
  vec2 fc = abs(vNormalL.x) > 0.5 ? vec2(vLocal.z, vLocal.y) : vec2(vLocal.x, vLocal.y);
  vec3 col = vec3(0.012, 0.009, 0.03);

  // window lattice
  vec2 cellSize = vec2(0.8, 1.3);
  vec2 id = floor(fc / cellSize);
  vec2 f = fract(fc / cellSize);
  float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.7);
  float lit = step(0.8, hash21(id + vSeed * 91.0));
  float flicker = step(0.04, hash21(id * 3.1 + floor(uTime * 1.5 + vSeed * 10.0)));
  vec3 wc = mix(C_CYAN, C_MAGENTA, step(0.5, hash21(id * 1.7 + vSeed)));
  wc = mix(wc, C_AMBER, step(0.88, hash21(id * 5.3 + vSeed)));
  float aa = 1.0 - smoothstep(0.4, 1.2, length(fwidth(fc / cellSize)));
  if (!top) col += wc * win * lit * flicker * 0.55 * aa;

  // neon crown + vertical corner strips
  float crown = smoothstep(vSize.y - 0.35, vSize.y - 0.05, vLocal.y);
  vec3 neon = mix(C_PURPLE, C_CYAN, fract(vSeed * 7.0));
  neon = mix(neon, uTurn, 0.2);
  col += neon * crown * 2.2;
  float edgeX = abs(abs(vNormalL.x) > 0.5 ? vLocal.z : vLocal.x);
  float halfW = (abs(vNormalL.x) > 0.5 ? vSize.z : vSize.x) * 0.5;
  float strip = smoothstep(halfW - 0.12, halfW, edgeX) * step(0.55, fract(vSeed * 13.0));
  col += neon * strip * 1.4 * (0.6 + 0.4 * sin(vLocal.y * 0.5 - uTime * 2.0 + vSeed * 20.0));
  if (top) col = vec3(0.02, 0.015, 0.05) + neon * 0.15;

  // holographic scan sweeping up the towers
  float scan = smoothstep(0.0, 0.6, 1.0 - abs(fract(vLocal.y * 0.02 - uTime * 0.05 + vSeed) - 0.5) * 8.0);
  col += neon * scan * 0.12;

  // ground haze + distance fog
  float dist = length(cameraPosition - vWorld);
  float haze = 1.0 - smoothstep(0.0, 14.0, vWorld.y - ${FLOOR_Y.toFixed(2)});
  col = mix(col, FOG_COLOR * 1.6, haze * 0.75);
  col = mix(col, FOG_COLOR, fogFactor(dist, FOG_DENSITY * 0.55));
  gl_FragColor = vec4(col, 1.0);
  ${GLSL_OUTPUT}
}`;

// ── Additive "light" volumes (data pillars, beams) ─────────────
export const pillarVert = /* glsl */ `
attribute float aSeed;
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
varying float vSeed;
void main(){
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vUv = uv;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const pillarFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uTurn;
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
varying float vSeed;
${GLSL_NOISE}
${GLSL_FOG}
${PALETTE_GLSL}
void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  float facing = abs(dot(normalize(vN), V));
  float core = pow(facing, 2.5);
  float speed = 0.25 + vSeed * 0.5;
  float stream = step(0.55, fract(vUv.y * 40.0 - uTime * speed * 4.0 + vSeed * 9.0));
  float bits = step(0.82, hash21(vec2(floor(vUv.x * 12.0), floor(vUv.y * 90.0 - uTime * speed * 9.0))));
  vec3 c = mix(C_CYAN, C_MAGENTA, step(0.5, fract(vSeed * 3.7)));
  c = mix(c, C_PURPLE, step(0.75, fract(vSeed * 5.1)));
  float vfade = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  float a = (core * 0.35 + stream * 0.25 * core + bits * 0.6) * vfade;
  float dist = length(cameraPosition - vWorld);
  a *= 1.0 - fogFactor(dist, FOG_DENSITY * 0.6);
  gl_FragColor = vec4(c * a * 0.9, 1.0);
  ${GLSL_OUTPUT}
}`;

// ── Holo rings (flat RingGeometry, additive) ───────────────────
export const ringVert = /* glsl */ `
varying vec2 vP;
varying vec3 vWorld;
void main(){
  vP = position.xy;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const ringFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uTurn;
uniform float uTurnMix;
uniform float uInner;
uniform float uOuter;
uniform float uSegments;
uniform float uStyle;
uniform float uOpacity;
uniform float uEnergy;
varying vec2 vP;
varying vec3 vWorld;
${GLSL_NOISE}
${GLSL_FOG}
void main(){
  float r = length(vP);
  float t = (r - uInner) / (uOuter - uInner);
  float a = atan(vP.y, vP.x) / 6.2831853 + 0.5;
  float edge = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.92, t);
  float rimLines = exp(-t * 22.0) + exp(-(1.0 - t) * 22.0);
  float m;
  if (uStyle < 0.5) {
    // fine ticks
    float tick = step(0.55, fract(a * uSegments));
    m = tick * step(0.45, t) * 0.8 + rimLines * 0.9;
  } else if (uStyle < 1.5) {
    // segmented arcs with gaps
    float seg = fract(a * uSegments);
    float on = step(0.3, hash11(floor(a * uSegments) + 1.0));
    m = smoothstep(0.02, 0.06, seg) * smoothstep(0.98, 0.9, seg) * on * 0.55 + rimLines * 0.6;
  } else {
    // data band: dashed code strip
    float code = step(0.5, hash21(vec2(floor(a * uSegments), floor(t * 3.0))));
    m = code * 0.45 * step(0.2, t) * step(t, 0.8) + rimLines * 0.8;
  }
  vec3 c = mix(uColor, uTurn, uTurnMix);
  float glow = m * edge * uOpacity * (1.0 + uEnergy * 0.8);
  float dist = length(cameraPosition - vWorld);
  glow *= 1.0 - fogFactor(dist, FOG_DENSITY);
  gl_FragColor = vec4(c * glow * 1.8, 1.0);
  ${GLSL_OUTPUT}
}`;

// ── Sky dome ───────────────────────────────────────────────────
export const skyVert = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w; // push to far plane
}`;

export const skyFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uTurn;
varying vec3 vDir;
${GLSL_NOISE}
${GLSL_FOG}
${PALETTE_GLSL}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(FOG_COLOR * 1.3, vec3(0.004, 0.002, 0.012), smoothstep(-0.05, 0.55, h));
  // horizon glow band (city light pollution)
  float band = exp(-pow((h - 0.02) * 9.0, 2.0));
  col += mix(C_PURPLE, C_MAGENTA, 0.5 + 0.5 * sin(atan(d.z, d.x) * 2.0 + uTime * 0.05)) * band * 0.22;
  col += uTurn * band * 0.05;
  // aurora data-curtains
  vec2 sp = vec2(atan(d.z, d.x) * 3.0, h * 6.0);
  float aur = fbm(sp + vec2(uTime * 0.03, 0.0)) * smoothstep(0.08, 0.35, h) * (1.0 - smoothstep(0.35, 0.8, h));
  col += mix(C_CYAN, C_PURPLE, fbm(sp * 0.5)) * pow(aur, 3.0) * 0.35;
  // sparse stars
  vec2 sg = floor(vec2(atan(d.z, d.x), asin(clamp(h, -1.0, 1.0))) * 160.0);
  float star = step(0.996, hash21(sg)) * smoothstep(0.1, 0.4, h);
  col += vec3(0.7, 0.8, 1.0) * star * (0.5 + 0.5 * sin(uTime * 2.0 + hash21(sg) * 50.0));
  gl_FragColor = vec4(col, 1.0);
  ${GLSL_OUTPUT}
}`;
