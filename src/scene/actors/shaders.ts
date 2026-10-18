// Material factories & shader patches for tokens and the die.
import * as THREE from 'three';
import { HEX_GLSL, NOISE_GLSL } from '../vfx/glsl';

// ── Digital dissolve / scanline build patch ──────────────────
/** Uniform objects shared by every material of one token. */
export interface DissolveUniforms {
  uDissolve: { value: number }; // 0 = intact, 1 = fully disintegrated
  uBuild: { value: number }; // 0 = not built, 1 = fully materialised (scanline reveal from the ground up)
  uOrigin: { value: THREE.Vector3 }; // token ground position (world)
  uEdge: { value: THREE.Color }; // glow colour of burning edges
  uGlitch: { value: number };
}

export function makeDissolveUniforms(edge: THREE.Color): DissolveUniforms {
  return {
    uDissolve: { value: 0 },
    uBuild: { value: 1 },
    uOrigin: { value: new THREE.Vector3() },
    uEdge: { value: edge.clone() },
    uGlitch: { value: 0 },
  };
}

const DISSOLVE_DECL = /* glsl */ `
uniform float uDissolve;
uniform float uBuild;
uniform vec3 uEdge;
uniform float uGlitch;
varying vec3 vDisPos;
${NOISE_GLSL}
`;

/** Height (world units) covered by the build-up reveal. */
export const BUILD_HEIGHT = 1.15;

const DISSOLVE_CLIP = /* glsl */ `
  float dsN = nx_noise(vDisPos * 13.0 + vec3(0.0, uGlitch * 7.0, 0.0));
  if (uDissolve > 0.0 && dsN < uDissolve) discard;
  float bH = mix(-0.08, ${BUILD_HEIGHT.toFixed(2)}, uBuild);
  if (uBuild < 1.0 && vDisPos.y > bH) discard;
`;

const DISSOLVE_GLOW = /* glsl */ `
  float dsEdge = uDissolve > 0.0 ? smoothstep(uDissolve + 0.14, uDissolve, dsN) : 0.0;
  float bEdge = uBuild < 1.0 ? smoothstep(bH - 0.1, bH, vDisPos.y) : 0.0;
  float scan = uBuild < 1.0 ? step(0.55, fract(vDisPos.y * 60.0)) * (1.0 - uBuild) : 0.0;
  vec3 dsGlow = uEdge * (dsEdge * 7.0 + bEdge * 6.0 + scan * 1.5);
`;

/** Patch a built-in lit material with the dissolve / build-up effect. */
export function patchDissolve<T extends THREE.MeshStandardMaterial>(mat: T, u: DissolveUniforms): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDissolve = u.uDissolve;
    shader.uniforms.uBuild = u.uBuild;
    shader.uniforms.uOrigin = u.uOrigin;
    shader.uniforms.uEdge = u.uEdge;
    shader.uniforms.uGlitch = u.uGlitch;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uOrigin;\nvarying vec3 vDisPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDisPos = (modelMatrix * vec4(transformed, 1.0)).xyz - uOrigin;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DISSOLVE_DECL)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + DISSOLVE_CLIP)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + DISSOLVE_GLOW + 'totalEmissiveRadiance += dsGlow;');
  };
  mat.customProgramCacheKey = () => 'nx-dissolve';
  return mat;
}

// ── Plasma energy core ───────────────────────────────────────
const PLASMA_VERT = /* glsl */ `
uniform vec3 uOrigin;
varying vec3 vN;
varying vec3 vV;
varying vec3 vObj;
varying vec3 vDisPos;
void main() {
  vObj = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDisPos = wp.xyz - uOrigin;
  vec4 mv = viewMatrix * wp;
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const PLASMA_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
${DISSOLVE_DECL}
varying vec3 vN;
varying vec3 vV;
varying vec3 vObj;
void main() {
  ${DISSOLVE_CLIP}
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float n = nx_fbm(vObj * 7.0 + vec3(0.0, uTime * 1.4, uTime * 0.8));
  float bands = 0.5 + 0.5 * sin(n * 14.0 - uTime * 5.0);
  vec3 col = uColor * (0.55 + 1.5 * n + 0.7 * bands) + uColor * fres * 2.5 + vec3(1.0) * pow(fres, 3.0) * 1.5;
  col *= uIntensity;
  ${DISSOLVE_GLOW}
  col += dsGlow;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function createPlasmaMaterial(color: THREE.Color, u: DissolveUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: PLASMA_VERT,
    fragmentShader: PLASMA_FRAG,
    uniforms: {
      uColor: { value: color.clone() },
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uDissolve: u.uDissolve,
      uBuild: u.uBuild,
      uOrigin: u.uOrigin,
      uEdge: u.uEdge,
      uGlitch: u.uGlitch,
    },
    toneMapped: false,
  });
}

// ── Flat ground quads (decal glow, selection ring) ───────────
const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DECAL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float r = length(q);
  float a = exp(-r * r * 6.0) * 0.75;
  a += smoothstep(0.035, 0.0, abs(r - 0.56)) * (0.55 + 0.25 * sin(uTime * 3.0));
  float ang = atan(q.y, q.x);
  a += smoothstep(0.03, 0.0, abs(r - 0.66)) * step(0.0, sin(ang * 3.0 + uTime * 0.8)) * 0.35;
  a *= uOpacity * smoothstep(1.0, 0.9, r);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

export function createDecalMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: DECAL_FRAG,
    uniforms: { uColor: { value: color.clone() }, uOpacity: { value: 1 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

const SELECT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uHover;
varying vec2 vUv;
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float r = length(q);
  float ang = atan(q.y, q.x);
  float pulse = 0.5 + 0.5 * sin(uTime * 6.0);
  float R = 0.8 + 0.05 * pulse;
  float band = smoothstep(0.07, 0.0, abs(r - R));
  float dash = step(0.0, sin(ang * 8.0 - uTime * 3.5));
  float inner = smoothstep(0.025, 0.0, abs(r - 0.62)) * 0.7;
  float ticks = smoothstep(0.05, 0.0, abs(r - 0.93)) * step(0.92, abs(sin(ang * 2.0 + uTime))) ;
  float a = band * mix(0.25, 1.0, dash) + inner + ticks + 0.12 * smoothstep(R, 0.0, r) * uHover;
  a *= uOpacity * (0.7 + 0.3 * pulse + 0.4 * uHover);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * (1.0 + uHover), min(a, 1.0));
  #include <colorspace_fragment>
}
`;

export function createSelectRingMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: SELECT_FRAG,
    uniforms: { uColor: { value: color.clone() }, uOpacity: { value: 0 }, uTime: { value: 0 }, uHover: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

// ── Hexagonal shield bubble ──────────────────────────────────
const SHIELD_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying float vY;
void main() {
  vUv = uv;
  vY = position.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const SHIELD_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying float vY;
${HEX_GLSL}
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
  float hex = nx_hexEdge(vUv * vec2(18.0, 9.0), 0.1);
  float sweep = smoothstep(0.12, 0.0, abs(fract(vUv.y * 1.0 - uTime * 0.45) - 0.5));
  float a = fres * 0.9 + hex * (0.18 + fres * 0.8) + sweep * hex * 0.6;
  a *= uOpacity * (0.85 + 0.15 * sin(uTime * 4.0 + vY * 12.0));
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * (1.2 + sweep), min(a, 1.0));
  #include <colorspace_fragment>
}
`;

export function createShieldMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SHIELD_VERT,
    fragmentShader: SHIELD_FRAG,
    uniforms: { uColor: { value: color.clone() }, uOpacity: { value: 0 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

// ── Die edge shell (glowing bevel edges) ─────────────────────
const EDGE_VERT = /* glsl */ `
varying vec3 vObj;
void main() {
  vObj = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const EDGE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uHalf;
uniform float uIntensity;
uniform float uTime;
varying vec3 vObj;
void main() {
  vec3 a = abs(vObj) / uHalf;
  // second-largest component → closeness to an edge
  float mx = max(a.x, max(a.y, a.z));
  float mn = min(a.x, min(a.y, a.z));
  float mid = a.x + a.y + a.z - mx - mn;
  float edge = smoothstep(0.72, 0.97, mid);
  float corner = smoothstep(0.8, 0.98, mn);
  float travel = 0.5 + 0.5 * sin((vObj.x + vObj.y + vObj.z) * 9.0 - uTime * 6.0);
  float alpha = (edge * (0.65 + 0.35 * travel) + corner * 0.8) * uIntensity;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.5 + corner * 2.0), min(alpha, 1.0));
  #include <colorspace_fragment>
}
`;

export function createEdgeMaterial(half: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: EDGE_VERT,
    fragmentShader: EDGE_FRAG,
    uniforms: { uColor: { value: new THREE.Color() }, uHalf: { value: half }, uIntensity: { value: 1 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

// ── Holographic readout (canvas texture with scanline shader) ─
const HOLO_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
void main() {
  float jitter = step(0.97, fract(sin(floor(uTime * 18.0)) * 43758.5)) * 0.015;
  vec2 uv = vUv + vec2(jitter * sin(vUv.y * 80.0), 0.0);
  float r = texture2D(uMap, uv + vec2(0.006, 0.0)).a;
  float g = texture2D(uMap, uv).a;
  float b = texture2D(uMap, uv - vec2(0.006, 0.0)).a;
  float scan = 0.75 + 0.25 * sin(vUv.y * 220.0 - uTime * 10.0);
  vec3 col = uColor * vec3(r, g, b) * 2.2 + vec3(g) * 0.6;
  float a = max(max(r, g), b) * scan * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * scan, a);
  #include <colorspace_fragment>
}
`;

export function createHoloMaterial(map: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: HOLO_FRAG,
    uniforms: { uMap: { value: map }, uColor: { value: new THREE.Color() }, uOpacity: { value: 0 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}
