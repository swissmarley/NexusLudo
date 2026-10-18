// Shaders for the board: tiles, docking bays, nexus core, edge strips.
import { GLSL_GLYPHS, GLSL_NOISE, GLSL_OUTPUT, GLSL_SDF } from './common';
import { COLOR } from '../shared';

const v3 = (c: { r: number; g: number; b: number }) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;

// ── Tiles (InstancedMesh) ──────────────────────────────────────
export const tileVert = /* glsl */ `
attribute vec3 aColor;
attribute vec4 aInfo;     // x: kind, y: param (track 0..1 / home 0..1), z: seed, w: highlight
attribute vec2 aDir;      // travel direction on the XZ plane
attribute vec4 aPulse;    // xyz: pulse colour, w: pulse start time
varying vec3 vColor;
varying vec4 vInfo;
varying vec2 vDir;
varying vec4 vPulse;
varying vec3 vLocal;
varying vec3 vNormalL;
varying vec3 vWorld;
void main(){
  vColor = aColor; vInfo = aInfo; vDir = aDir; vPulse = aPulse;
  vLocal = position;
  vNormalL = normal;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const tileFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uTurn;
uniform float uDetail;
varying vec3 vColor;
varying vec4 vInfo;
varying vec2 vDir;
varying vec4 vPulse;
varying vec3 vLocal;
varying vec3 vNormalL;
varying vec3 vWorld;
${GLSL_NOISE}
${GLSL_SDF}
${GLSL_GLYPHS}
const vec3 C_CYAN = ${v3(COLOR.cyan)};
const vec3 C_PURPLE = ${v3(COLOR.purple)};
const vec3 C_SAFE = ${v3(COLOR.safe)};

// procedural circuit traces inside a tile (p in -0.5..0.5)
float circuit(vec2 p, float seed){
  vec2 g = p * 6.0 + seed * 17.0;
  vec2 id = floor(g); vec2 f = fract(g) - 0.5;
  float h = hash21(id);
  float d;
  if (h < 0.33) d = abs(f.y);
  else if (h < 0.66) d = abs(f.x);
  else d = abs(f.x - f.y) * 0.7071;
  float line = 1.0 - smoothstep(0.03, 0.07, d);
  float node = 1.0 - smoothstep(0.08, 0.13, length(f));
  return line * step(0.25, hash21(id + 7.0)) + node * step(0.8, h);
}

void main(){
  float kind = vInfo.x;
  float param = vInfo.y;
  float seed = vInfo.z;
  float hl = vInfo.w;
  bool top = vNormalL.y > 0.5;

  vec2 p = vLocal.xz / 0.92; // -0.5..0.5 on the tile
  float t = uTime;

  // pulse (hop landing)
  float age = t - vPulse.w;
  float pulse = age >= 0.0 ? exp(-age * 3.2) : 0.0;
  float ring = age >= 0.0 && age < 1.2 ? (1.0 - smoothstep(0.0, 0.05, abs(length(p) - age * 0.9))) * (1.0 - age / 1.2) : 0.0;

  // travelling energy comets around the main loop
  float comet = 0.0;
  if (kind < 2.5) {
    float c1 = fract(param - t * 0.045);
    float c2 = fract(param - t * 0.045 + 0.5);
    comet = pow(1.0 - min(c1, 1.0 - c1) * 14.0, 3.0) * step(min(c1, 1.0 - c1), 1.0 / 14.0);
    comet += pow(1.0 - min(c2, 1.0 - c2) * 14.0, 3.0) * step(min(c2, 1.0 - c2), 1.0 / 14.0);
  }

  vec3 base = kind < 0.5 ? mix(C_CYAN, C_PURPLE, 0.5 + 0.5 * sin(param * 6.2831 * 2.0)) : vColor;

  if (!top) {
    // tile sides: thin glowing band
    float band = smoothstep(0.0, 0.035, vLocal.y);
    vec3 side = base * (0.25 + comet * 0.8 + pulse * 2.0 + hl * 0.8) * band;
    gl_FragColor = vec4(side + vec3(0.01, 0.01, 0.025), 1.0);
    ${GLSL_OUTPUT}
    return;
  }

  // ── top face ──
  float box = sdChamferBox(p, vec2(0.5), 0.12);
  vec3 col = vec3(0.012, 0.014, 0.032);
  // glassy inner gradient
  col += base * 0.035 * (1.0 - length(p));

  // circuitry with flowing light
  float circ = circuit(p, seed) * uDetail;
  float flow = 0.5 + 0.5 * sin(t * 2.2 + (p.x * vDir.x + p.y * vDir.y) * 8.0 + seed * 30.0);
  col += base * circ * (0.07 + 0.18 * flow);

  // neon border
  float border = strokeAA(box + 0.045, 0.012);
  float innerBorder = strokeAA(box + 0.09, 0.004);
  float borderI = 0.55 + comet * 2.2;

  // kind-specific decoration
  float deco = 0.0;
  vec3 decoCol = base;
  if (kind > 0.5 && kind < 1.5) {
    // SAFE — star glyph
    deco = glyph(rot2(p, t * 0.25) * 1.15, 6.0, t) * 1.25;
    decoCol = C_SAFE;
    borderI += 0.4;
  } else if (kind > 1.5 && kind < 2.5) {
    // START — seat-coloured pad with chevrons pointing along travel
    vec2 q = vec2(dot(p, vec2(vDir.y, -vDir.x)), dot(p, vDir));
    float chev = 0.0;
    for (int i = 0; i < 3; i++) {
      float o = float(i) * 0.2 - 0.2;
      float k = fract(t * 0.8 - float(i) * 0.33);
      chev += strokeAA(sdChevron(q - vec2(0.0, o), 0.16, 0.0), 0.028) * (0.4 + 0.6 * k);
    }
    deco = chev * 1.2 + 0.2;
    col += base * 0.12;
    borderI += 0.8;
  } else if (kind > 2.5) {
    // HOME lane — seat fill intensifying toward the core + scrolling chevrons
    vec2 q = vec2(dot(p, vec2(vDir.y, -vDir.x)), dot(p, vDir));
    float s = fract(q.y * 2.0 - t * 1.2 - param * 2.0);
    float chev = strokeAA(sdChevron(vec2(q.x, s - 0.5), 0.18, 0.0), 0.03);
    col += base * (0.08 + 0.22 * param);
    deco = chev * (0.35 + 0.5 * param);
    borderI += 0.3 + param * 0.6;
  }

  col += base * border * borderI;
  col += base * innerBorder * 0.25;
  col += decoCol * deco;

  // highlight (legal destination)
  float hp = 0.65 + 0.35 * sin(t * 6.0);
  col += uTurn * hl * (strokeAA(box + 0.02, 0.025) * 2.2 * hp + 0.18 * (1.0 - smoothstep(-0.5, 0.0, box)));

  // hop pulse
  col += vPulse.xyz * (pulse * (0.35 + border * 2.5) + ring * 2.5);

  // outside chamfer → dark gap
  col *= fillAA(box);
  gl_FragColor = vec4(col, 1.0);
  ${GLSL_OUTPUT}
}`;

// ── Docking bays (per-seat plane) ──────────────────────────────
export const bayVert = /* glsl */ `
varying vec2 vP;
void main(){
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const bayFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uActive;   // 0..1 current-turn glow
uniform float uPresent;  // 0..1 seat participates in the match
uniform float uHalf;     // half size of the bay
uniform float uSlot;     // slot offset (1.05)
uniform float uDetail;
varying vec2 vP;
${GLSL_NOISE}
${GLSL_SDF}

float hexGrid(vec2 p, float s){
  p /= s;
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  return sdHexagon(g, 0.5) ;
}

void main(){
  vec2 p = vP;
  float t = uTime;
  float present = mix(0.25, 1.0, uPresent);
  float act = uActive;
  vec3 c = uColor;

  float box = sdChamferBox(p, vec2(uHalf), 0.7);
  vec3 col = vec3(0.01, 0.011, 0.026);

  // hex lattice floor with breathing glow
  float hx = hexGrid(p + vec2(0.0, t * 0.05), 0.42);
  float hexLine = strokeAA(hx, 0.02) * uDetail;
  float breathe = 0.5 + 0.5 * sin(t * 1.5 - length(p) * 1.4);
  col += c * hexLine * (0.05 + 0.12 * act * breathe) * present;
  col += c * 0.035 * present * (1.0 + act);

  // outer frame + inner frame
  float frame = strokeAA(box + 0.06, 0.03);
  float frame2 = strokeAA(box + 0.22, 0.008);
  // corner brackets
  vec2 ap = abs(p);
  float corner = step(uHalf - 1.2, max(ap.x, ap.y)) * step(uHalf - 1.1, min(ap.x, ap.y) + 0.9);
  // hazard stripes along the inner rim
  float stripes = step(0.5, fract((p.x + p.y) * 2.5 - t * 0.4)) * strokeAA(box + 0.4, 0.09);
  col += c * frame * (0.9 + 1.8 * act) * present;
  col += c * frame2 * (0.35 + 0.5 * act) * present;
  col += c * stripes * (0.08 + 0.25 * act) * present;
  col += c * corner * frame2 * 0.6 * present;

  // token sockets at ±slot
  vec2 sp = abs(p) - vec2(uSlot);
  float sr = length(sp);
  float socket = strokeAA(sr - 0.36, 0.022) + 0.5 * strokeAA(sr - 0.27, 0.008);
  float sa = atan(sp.y, sp.x);
  float sticks = step(0.6, fract(sa / 6.2831 * 16.0 + t * 0.15)) * strokeAA(sr - 0.43, 0.025);
  col += c * (socket * (0.7 + act * 1.2) + sticks * (0.25 + act * 0.6)) * present;
  col += c * (1.0 - smoothstep(0.0, 0.34, sr)) * 0.08 * present;
  col *= 1.0 - (1.0 - smoothstep(0.24, 0.3, sr)) * 0.35;

  // dice launch pad at centre
  float r = length(p);
  float a = atan(p.y, p.x);
  float pad = strokeAA(r - 0.78, 0.035) * (0.9 + 1.6 * act);
  float padInner = strokeAA(r - 0.62, 0.01) * (0.4 + 0.8 * act);
  float arcs = step(0.5, fract(a / 6.2831 * 6.0 + t * 0.25 * (0.4 + act))) * strokeAA(r - 0.7, 0.03);
  float crossL = (strokeAA(p.x, 0.006) + strokeAA(p.y, 0.006)) * step(r, 0.58) * step(0.15, r);
  float ping = act * (1.0 - fract(t * 0.8)) * strokeAA(r - fract(t * 0.8) * 0.78, 0.02);
  col += c * (pad + padInner + arcs * (0.5 + act) + crossL * 0.4 + ping * 1.5) * present;
  col += c * (1.0 - smoothstep(0.0, 0.62, r)) * (0.06 + 0.2 * act) * present;

  // offline seats: faint static
  col += vec3(0.02) * (1.0 - uPresent) * step(0.8, hash21(floor(p * 30.0) + floor(t * 8.0))) * fillAA(box);

  col *= fillAA(box);
  gl_FragColor = vec4(col, 1.0);
  ${GLSL_OUTPUT}
}`;

// ── Nexus Core floor plate ─────────────────────────────────────
export const coreFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uSeat[4];
uniform float uSeatOn[4];
uniform vec3 uTurn;
uniform float uFlash;
uniform float uEnergy;
uniform float uHighlight;
varying vec2 vP;
${GLSL_NOISE}
${GLSL_SDF}
void main(){
  vec2 p = vec2(vP.x, -vP.y); // plane local → world xz
  float t = uTime;
  float ax = abs(p.x), az = abs(p.y);
  int s;
  float along;
  if (-p.x >= az) { s = 0; along = -p.x; }
  else if (-p.y >= ax) { s = 1; along = -p.y; }
  else if (p.x >= az) { s = 2; along = p.x; }
  else { s = 3; along = p.y; }
  vec3 c = s == 0 ? uSeat[0] : s == 1 ? uSeat[1] : s == 2 ? uSeat[2] : uSeat[3];
  float on = s == 0 ? uSeatOn[0] : s == 1 ? uSeatOn[1] : s == 2 ? uSeatOn[2] : uSeatOn[3];
  on = mix(0.25, 1.0, on);

  float r = length(p);
  vec3 col = vec3(0.01, 0.01, 0.03);
  // converging energy bands flowing to the reactor
  float bands = smoothstep(0.35, 0.0, abs(fract(along * 3.0 + t * 1.4) - 0.5) - 0.1);
  col += c * (0.18 + 0.35 * bands * smoothstep(0.35, 1.5, along)) * on;
  // triangle seams (diagonals) bright
  float seam = strokeAA(ax - az, 0.012);
  col += mix(vec3(1.0), uTurn, 0.5) * seam * 1.4;
  // outer frame
  float frame = strokeAA(sdBox2(p, vec2(1.44)), 0.025);
  col += c * frame * 1.5 * on;

  // reactor
  float pulse = 0.5 + 0.5 * sin(t * 3.0);
  float reactor = 1.0 - smoothstep(0.0, 0.42 + 0.04 * pulse, r);
  col += mix(uTurn, vec3(1.0), 0.35) * pow(reactor, 1.5) * (1.4 + pulse * 0.8 + uFlash * 3.0 + uEnergy * 2.0);
  float a = atan(p.y, p.x);
  float arc1 = step(0.5, fract(a / 6.2831 * 3.0 + t * 0.4)) * strokeAA(r - 0.55, 0.02);
  float arc2 = step(0.6, fract(-a / 6.2831 * 5.0 + t * 0.6)) * strokeAA(r - 0.66, 0.012);
  col += uTurn * (arc1 * 1.6 + arc2 * 1.0);
  // shockwave from finish events
  float sw = uFlash * strokeAA(r - (1.0 - uFlash) * 1.6, 0.06);
  col += vec3(1.0) * sw * 2.0;
  // legal-finish highlight
  col += uTurn * uHighlight * (0.6 + 0.4 * sin(t * 6.0)) * frame * 2.0;

  gl_FragColor = vec4(col, 1.0);
  ${GLSL_OUTPUT}
}`;

// ── Holographic beam (open cylinder, additive) ─────────────────
export const beamVert = /* glsl */ `
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

export const beamFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uTurn;
uniform float uIntensity;
uniform float uSpeed;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vN;
${GLSL_NOISE}
void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  float facing = abs(dot(normalize(vN), V));
  float edge = pow(1.0 - facing, 2.0);
  float core = pow(facing, 3.0);
  float streak = step(0.75, hash21(vec2(floor(vUv.x * 48.0), floor(vUv.y * 30.0 - uTime * uSpeed * 6.0))));
  float rings = smoothstep(0.85, 1.0, fract(vUv.y * 10.0 - uTime * uSpeed));
  float fade = smoothstep(0.0, 0.03, vUv.y) * pow(1.0 - vUv.y, 2.2);
  float a = (edge * 0.6 + core * 0.4 + streak * 0.35 + rings * 0.5) * fade * uIntensity;
  gl_FragColor = vec4(mix(uTurn, vec3(1.0), 0.25) * a, 1.0);
  ${GLSL_OUTPUT}
}`;

// ── Edge ribbon (vertical strip with perimeter parameter aT) ───
export const ribbonVert = /* glsl */ `
attribute float aT;
attribute float aV;
varying float vT;
varying float vV;
void main(){
  vT = aT; vV = aV;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const ribbonFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uSeat[4];
uniform vec3 uTurn;
uniform float uIntensity;
uniform float uEnergy;
varying float vT;
varying float vV;
void main(){
  // four seat colours blend around the perimeter (aT = angle/2π; seat k corner at fract(0.625 + k/4))
  float x = fract(vT + 0.5) * 4.0;
  int i = int(floor(x));
  float f = smoothstep(0.75, 1.0, fract(x));
  vec3 a = i == 0 ? uSeat[0] : i == 1 ? uSeat[1] : i == 2 ? uSeat[2] : uSeat[3];
  vec3 b = i == 0 ? uSeat[1] : i == 1 ? uSeat[2] : i == 2 ? uSeat[3] : uSeat[0];
  vec3 c = mix(a, b, f);
  c = mix(c, uTurn, 0.25);
  float run = fract(vT * 3.0 - uTime * 0.12);
  float comet = pow(smoothstep(0.85, 1.0, run), 2.0);
  float profile = smoothstep(0.0, 0.3, vV) * smoothstep(1.0, 0.7, vV);
  float dash = 0.75 + 0.25 * step(0.5, fract(vT * 160.0));
  float I = (0.9 + comet * 2.5 + uEnergy) * profile * dash * uIntensity;
  gl_FragColor = vec4(c * I * 1.6, 1.0);
  ${GLSL_OUTPUT}
}`;

// ── Generic soft additive glow disc (underside glow, thrusters) ─
export const glowFrag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uTurn;
uniform float uTurnMix;
uniform float uIntensity;
uniform float uTime;
uniform float uShape; // 0 radial, 1 square
varying vec2 vP;
${GLSL_SDF}
void main(){
  float d = uShape < 0.5 ? length(vP) * 2.0 : (sdChamferBox(vP, vec2(0.5), 0.1) + 0.5) * 2.0;
  float g = pow(clamp(1.0 - d, 0.0, 1.0), 2.4);
  float flick = 0.9 + 0.1 * sin(uTime * 11.0 + vP.x * 3.0);
  gl_FragColor = vec4(mix(uColor, uTurn, uTurnMix) * g * uIntensity * flick, 1.0);
  ${GLSL_OUTPUT}
}`;

export const flatVert = /* glsl */ `
varying vec2 vP;
void main(){
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
