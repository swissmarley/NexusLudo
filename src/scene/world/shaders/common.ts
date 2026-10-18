// Shared GLSL snippets: noise, SDF primitives, holographic glyphs, fog.
import { COLOR, FOG_DENSITY } from '../shared';

const f = (n: number) => n.toFixed(5);

/** Hash / value-noise / fbm helpers. */
export const GLSL_NOISE = /* glsl */ `
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
`;

/** 2D signed distance primitives (Inigo Quilez). */
export const GLSL_SDF = /* glsl */ `
#ifndef PI
#define PI 3.14159265
#endif
float sdBox2(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdChamferBox(vec2 p, vec2 b, float c){
  p = abs(p);
  float d = sdBox2(p, b);
  float diag = (p.x + p.y - (b.x + b.y - c)) * 0.70710678;
  return max(d, diag);
}
float sdSegment(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sdHexagon(vec2 p, float r){
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}
float sdStar(vec2 p, float r, float n, float m){
  float an = PI / n; float en = PI / m;
  vec2 acs = vec2(cos(an), sin(an)); vec2 ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}
float sdTri(vec2 p, float r){
  const float k = 1.7320508;
  p.x = abs(p.x) - r; p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
/** Chevron pointing +y. */
float sdChevron(vec2 p, float w, float t){
  p.x = abs(p.x);
  return sdSegment(p, vec2(0.0, w * 0.5), vec2(w, -w * 0.5)) - t;
}
vec2 rot2(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
float strokeAA(float d, float w){ float aa = fwidth(d) * 1.2 + 1e-4; return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
float fillAA(float d){ float aa = fwidth(d) * 1.2 + 1e-4; return 1.0 - smoothstep(-aa, aa, d); }
`;

/**
 * Holographic glyph library. `glyph(p, id, t)` returns an intensity mask
 * for p in roughly [-0.5, 0.5]². Ids match GLYPH in shared.ts.
 */
export const GLSL_GLYPHS = /* glsl */ `
float glyph(vec2 p, float id, float t){
  float m = 0.0;
  if (id < 0.5) {               // shield — nested hexagons
    float d = sdHexagon(rot2(p, PI / 6.0), 0.34);
    m = strokeAA(d, 0.035) + 0.45 * strokeAA(sdHexagon(rot2(p, PI / 6.0), 0.2), 0.022) + 0.25 * fillAA(d);
  } else if (id < 1.5) {        // boost — lightning bolt
    float d = sdSegment(p, vec2(0.12, 0.42), vec2(-0.12, 0.02));
    d = min(d, sdSegment(p, vec2(-0.12, 0.02), vec2(0.12, 0.02)));
    d = min(d, sdSegment(p, vec2(0.12, 0.02), vec2(-0.1, -0.42)));
    m = strokeAA(d, 0.05) + 0.4 * strokeAA(d, 0.11);
  } else if (id < 2.5) {        // reroll — rotating arc with arrow head
    vec2 q = rot2(p, -t * 1.6);
    float a = atan(q.y, q.x);
    float ring = abs(length(q) - 0.3);
    float gap = step(0.6, a) * step(a, 1.5);
    m = strokeAA(ring, 0.04) * (1.0 - gap);
    vec2 h = rot2(q - vec2(cos(1.5), sin(1.5)) * 0.3, -0.2);
    m = max(m, fillAA(sdTri(rot2(h, PI * 0.5), 0.1)));
  } else if (id < 3.5) {        // emp — radiating burst
    float d = sdStar(rot2(p, t * 0.8), 0.4, 8.0, 3.2);
    m = strokeAA(d, 0.03) + 0.35 * fillAA(d) + strokeAA(length(p) - 0.12, 0.03);
    float wave = abs(length(p) - fract(t * 0.9) * 0.5);
    m += 0.6 * strokeAA(wave, 0.015) * (1.0 - fract(t * 0.9));
  } else if (id < 4.5) {        // crosshair — capture
    float r = length(p);
    m = strokeAA(r - 0.32, 0.03) + 0.6 * strokeAA(r - 0.18, 0.018);
    vec2 a = abs(rot2(p, t * 0.6));
    float ticks = min(sdBox2(a - vec2(0.0, 0.36), vec2(0.022, 0.1)), sdBox2(a - vec2(0.36, 0.0), vec2(0.1, 0.022)));
    m = max(m, fillAA(ticks));
    m = max(m, fillAA(r - 0.05));
  } else if (id < 5.5) {        // warning — triangle + exclamation
    float d = sdTri(p - vec2(0.0, -0.04), 0.38);
    m = strokeAA(d, 0.035);
    m = max(m, fillAA(sdBox2(p - vec2(0.0, 0.0), vec2(0.03, 0.1))));
    m = max(m, fillAA(length(p - vec2(0.0, -0.18)) - 0.04));
  } else if (id < 6.5) {        // star — safe zone
    float d = sdStar(p, 0.36, 5.0, 2.6);
    m = strokeAA(d, 0.03) + 0.35 * fillAA(d);
  } else {                      // core — concentric target
    float r = length(p);
    m = strokeAA(r - 0.34, 0.025) + strokeAA(r - 0.2, 0.025) + fillAA(r - 0.08);
    m += 0.7 * strokeAA(sdHexagon(rot2(p, t), 0.42), 0.012);
  }
  return clamp(m, 0.0, 1.5);
}
`;

/** Exponential-squared fog factor matching THREE.FogExp2 (0 = clear, 1 = fully fogged). */
export const GLSL_FOG = /* glsl */ `
const vec3 FOG_COLOR = vec3(${f(COLOR.fog.r)}, ${f(COLOR.fog.g)}, ${f(COLOR.fog.b)});
float fogFactor(float dist, float density){ float d = density * dist; return 1.0 - exp(-d * d); }
const float FOG_DENSITY = ${f(FOG_DENSITY)};
`;

/** Standard tone-mapping / colour-space tail for ShaderMaterials. */
export const GLSL_OUTPUT = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;
