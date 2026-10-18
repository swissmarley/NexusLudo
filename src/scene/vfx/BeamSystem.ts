// Pooled vertical energy beams / light pillars (open cylinders, additive).
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';

export interface BeamOpts {
  x: number;
  y?: number;
  z: number;
  radius: number;
  height: number;
  duration: number;
  color: THREE.Color;
  delay?: number;
  opacity?: number;
}

const VERT = /* glsl */ `
varying vec2 vUv;
varying float vFacing;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uP;
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
varying float vFacing;
${NOISE_GLSL}
void main() {
  float y = vUv.y;
  float core = pow(vFacing, 3.0);
  float rim = pow(1.0 - vFacing, 2.0) * 0.6;
  float stripes = 0.65 + 0.35 * sin(y * 40.0 - uTime * 18.0);
  float n = nx_noise(vec3(vUv.x * 12.0, y * 6.0 - uTime * 4.0, 0.0));
  float vfade = pow(1.0 - y, 1.4) * smoothstep(0.0, 0.03, y);
  float life = smoothstep(0.0, 0.08, uP) * (1.0 - smoothstep(0.55, 1.0, uP));
  float a = (core * 1.2 + rim) * stripes * (0.6 + 0.6 * n) * vfade * life * uOpacity;
  if (a < 0.003) discard;
  vec3 col = mix(uColor, vec3(1.0), core * 0.35) * (1.5 + core);
  gl_FragColor = vec4(col, min(a, 1.0));
  #include <colorspace_fragment>
}
`;

interface BeamSlot {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  active: boolean;
  age: number;
  delay: number;
  duration: number;
  radius: number;
  height: number;
}

export class BeamSystem {
  readonly group = new THREE.Group();
  private readonly geo: THREE.CylinderGeometry;
  private readonly slots: BeamSlot[] = [];
  private next = 0;

  constructor(capacity: number) {
    this.geo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
    this.geo.translate(0, 0.5, 0);
    const base = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uColor: { value: new THREE.Color() },
        uP: { value: 0 },
        uTime: { value: 0 },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    for (let i = 0; i < capacity; i++) {
      const mat = i === 0 ? base : base.clone();
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 9;
      this.group.add(mesh);
      this.slots.push({ mesh, mat, active: false, age: 0, delay: 0, duration: 1, radius: 1, height: 1 });
    }
  }

  spawn(o: BeamOpts): void {
    const s = this.slots[this.next];
    this.next = (this.next + 1) % this.slots.length;
    s.active = true;
    s.age = 0;
    s.delay = o.delay ?? 0;
    s.duration = Math.max(0.05, o.duration);
    s.radius = o.radius;
    s.height = o.height;
    s.mesh.position.set(o.x, o.y ?? 0.02, o.z);
    (s.mat.uniforms.uColor.value as THREE.Color).copy(o.color);
    s.mat.uniforms.uOpacity.value = o.opacity ?? 1;
    s.mesh.visible = false;
  }

  update(dt: number, time: number): void {
    for (const s of this.slots) {
      if (!s.active) continue;
      s.age += dt;
      const t = s.age - s.delay;
      if (t < 0) continue;
      const p = t / s.duration;
      if (p >= 1) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.mesh.visible = true;
      const grow = 1 - Math.pow(1 - Math.min(1, p / 0.18), 3);
      const thin = p < 0.6 ? 1 : 1 - ((p - 0.6) / 0.4) * 0.85;
      s.mesh.scale.set(s.radius * thin * (0.6 + 0.4 * grow), s.height * grow, s.radius * thin * (0.6 + 0.4 * grow));
      s.mat.uniforms.uP.value = p;
      s.mat.uniforms.uTime.value = time;
    }
  }

  dispose(): void {
    this.geo.dispose();
    for (const s of this.slots) s.mat.dispose();
  }
}
