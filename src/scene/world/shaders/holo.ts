// Holographic glyph / marker shaders shared by power cells and the path preview.
import { GLSL_GLYPHS, GLSL_NOISE, GLSL_OUTPUT, GLSL_SDF } from './common';

/** Billboard / decal plane: vUv-centred coordinates in -0.5..0.5. */
export const holoVert = /* glsl */ `
varying vec2 vP;
void main(){
  vP = uv - 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Holographic glyph card with scanlines, flicker and soft halo. */
export const glyphFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uGlyph;
uniform float uOpacity;
uniform float uSeed;
varying vec2 vP;
${GLSL_NOISE}
${GLSL_SDF}
${GLSL_GLYPHS}
void main(){
  vec2 p = vP;
  float t = uTime;
  // horizontal glitch slices
  float g = step(0.93, hash11(floor(t * 9.0) + uSeed * 31.0));
  p.x += g * (hash11(floor(p.y * 18.0) + floor(t * 9.0)) - 0.5) * 0.12;
  float m = glyph(p * 1.25, uGlyph, t);
  float halo = exp(-length(vP) * 5.0) * 0.35;
  float frame = strokeAA(sdChamferBox(vP, vec2(0.46), 0.12), 0.01) * 0.6;
  float scan = 0.75 + 0.25 * sin(vP.y * 140.0 - t * 10.0);
  float flick = 0.85 + 0.15 * step(0.1, hash11(floor(t * 20.0) + uSeed));
  float a = (m * 1.6 + halo + frame) * scan * flick * uOpacity;
  gl_FragColor = vec4(uColor * a * 1.7, 1.0);
  ${GLSL_OUTPUT}
}`;

/** Flat ground marker: concentric rotating rings + ticks. */
export const markerFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uSpin;
varying vec2 vP;
${GLSL_SDF}
void main(){
  vec2 p = vP * 2.0; // -1..1
  float r = length(p);
  float t = uTime;
  float a = atan(p.y, p.x);
  float ring1 = strokeAA(r - 0.82, 0.03);
  float ring2 = strokeAA(r - 0.62, 0.012);
  float dash = step(0.5, fract(a / 6.2831 * 12.0 + t * 0.4 * uSpin)) * strokeAA(r - 0.72, 0.035);
  float brackets = step(0.82, fract(a / 6.2831 * 4.0 - t * 0.25 * uSpin + 0.1)) * strokeAA(r - 0.95, 0.03);
  float fill = (1.0 - smoothstep(0.0, 0.85, r)) * 0.25;
  float ping = (1.0 - fract(t * 1.2)) * strokeAA(r - fract(t * 1.2) * 0.95, 0.025);
  float m = ring1 * 1.2 + ring2 * 0.6 + dash * 0.8 + brackets + fill + ping * 0.8;
  gl_FragColor = vec4(uColor * m * uOpacity * 1.6, 1.0);
  ${GLSL_OUTPUT}
}`;

/** Short vertical holo column (open cylinder), bright at the base. */
export const columnVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export const columnFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main(){
  float fade = pow(1.0 - vUv.y, 2.0);
  float lines = 0.55 + 0.45 * step(0.5, fract(vUv.y * 12.0 - uTime * 2.0));
  gl_FragColor = vec4(uColor * fade * lines * uOpacity * 0.9, 1.0);
  ${GLSL_OUTPUT}
}`;

/** Path chevrons (instanced) — chevron pointing +y in local plane, sequenced pulse. */
export const chevronVert = /* glsl */ `
attribute float aIndex;
varying vec2 vP;
varying float vIndex;
void main(){
  vP = uv - 0.5;
  vIndex = aIndex;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

export const chevronFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uCount;
uniform float uReveal;
varying vec2 vP;
varying float vIndex;
${GLSL_SDF}
void main(){
  float k = vIndex / max(uCount, 1.0);
  if (k > uReveal) discard;
  // travelling highlight along the sequence
  float w = fract(uTime * 1.3 - k);
  float travel = pow(1.0 - w, 4.0);
  float c1 = strokeAA(sdChevron(vP - vec2(0.0, 0.1), 0.18, 0.0), 0.035);
  float c2 = strokeAA(sdChevron(vP - vec2(0.0, -0.12), 0.18, 0.0), 0.035);
  float m = (c1 + c2 * 0.6) * (0.55 + travel * 1.8);
  gl_FragColor = vec4(uColor * m * uOpacity * 1.5, 1.0);
  ${GLSL_OUTPUT}
}`;

/** Ribbon connecting path cells: scrolling dashes; aDist = cumulative length, aV across. */
export const pathRibbonVert = /* glsl */ `
attribute float aDist;
attribute float aV;
varying float vDist;
varying float vV;
void main(){ vDist = aDist; vV = aV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export const pathRibbonFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uLength;
uniform float uReveal;
varying float vDist;
varying float vV;
void main(){
  if (vDist > uLength * uReveal + 0.01) discard;
  float edge = abs(vV - 0.5) * 2.0;
  float rails = smoothstep(0.7, 0.95, edge) * (1.0 - smoothstep(0.95, 1.0, edge));
  float dash = step(0.5, fract(vDist * 3.0 - uTime * 2.4));
  float core = (1.0 - smoothstep(0.0, 0.25, edge)) * dash;
  float tailFade = 0.45 + 0.55 * smoothstep(0.0, uLength, vDist);
  float m = (rails * 0.9 + core * 0.7 + 0.08) * tailFade;
  gl_FragColor = vec4(uColor * m * uOpacity * 1.4, 1.0);
  ${GLSL_OUTPUT}
}`;
