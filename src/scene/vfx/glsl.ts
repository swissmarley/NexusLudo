// Shared GLSL snippets for NEXUS LUDO actors & VFX.

/** Cheap 3D value noise + fbm (prefixed nx_ to avoid clashes with three chunks). */
export const NOISE_GLSL = /* glsl */ `
float nx_hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float nx_noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(nx_hash(i + vec3(0.0, 0.0, 0.0)), nx_hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(nx_hash(i + vec3(0.0, 1.0, 0.0)), nx_hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(nx_hash(i + vec3(0.0, 0.0, 1.0)), nx_hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(nx_hash(i + vec3(0.0, 1.0, 1.0)), nx_hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float nx_fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * nx_noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
`;

/** Hexagonal grid helpers. nx_hexEdge returns 1 on cell borders, 0 inside. */
export const HEX_GLSL = /* glsl */ `
float nx_hexDist(vec2 p) {
  p = abs(p);
  return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x);
}
float nx_hexEdge(vec2 uv, float width) {
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h;
  vec2 b = mod(uv - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  return smoothstep(0.5 - width, 0.5, nx_hexDist(gv));
}
`;
