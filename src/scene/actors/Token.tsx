// A single futuristic token: metallic lathe chassis, plasma energy core,
// hovering halo, ground glow, selection ring, shield bubble, neon trail.
// All motion is imperative (GSAP + useFrame) on a small `anim` state; the
// committed resting pose is ALWAYS derived from props (i.e. from `game`).
import type { ThreeEvent } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { progressToWorld } from '../../game/board';
import type { Move, Seat } from '../../game/types';
import { FINISH_PROGRESS } from '../../game/types';
import { useGame } from '../../store/game';
import { beam, burst, neon, ring } from '../vfx/vfxApi';
import { SHAPE_SHARD } from '../vfx/ParticleSystem';
import { RING_HEX } from '../vfx/RingSystem';
import { SEAT_THEME } from '../../core/theme';
import { NeonTrail } from './NeonTrail';
import { TOKEN, createTokenMaterials, type TokenGeometries } from './tokenAssets';

/** Tokens stand on the tile tops. */
export const TOKEN_Y = 0.06;
const HOVER = 0.035;
const HOP_HEIGHT = 0.6;
const FINISH_SCALE = 0.62;

export interface TokenProps {
  id: number;
  seat: Seat;
  index: number;
  progress: number;
  shield: number;
  /** Committed resting pose (cell centre + stack offset) and scale. */
  restX: number;
  restZ: number;
  restScale: number;
  legal: boolean;
  hinted: boolean;
  hovered: boolean;
  dimmed: boolean;
  geo: TokenGeometries;
  spawnDelay: number;
}

interface Anim {
  x: number;
  z: number;
  lift: number;
  sx: number;
  sy: number;
  spin: number;
  scale: number;
  jitter: number;
}

interface Ctl {
  tl: gsap.core.Animation | null;
  squash: gsap.core.Animation | null;
  moving: boolean;
  special: boolean;
  pendingTo: number | null;
  pendingDeadline: number;
  prevProgress: number;
  glitch: number;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = THREE.MathUtils.lerp;
const damp = THREE.MathUtils.damp;

export function Token(props: TokenProps) {
  const { id, seat, index, progress, shield, restX, restZ, restScale, legal, hinted, hovered, dimmed, geo, spawnDelay } = props;
  const mats = useMemo(() => createTokenMaterials(seat), [seat]);
  useEffect(() => () => mats.dispose(), [mats]);

  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const shieldRef = useRef<THREE.Mesh>(null);
  const markerRef = useRef<THREE.Mesh>(null);
  const selectRef = useRef<THREE.Mesh>(null);
  const trailActive = useRef(false);

  const anim = useRef<Anim>({ x: restX, z: restZ, lift: 0, sx: 1, sy: 1, spin: 0, scale: restScale, jitter: 0 });
  const ctl = useRef<Ctl>({ tl: null, squash: null, moving: false, special: false, pendingTo: null, pendingDeadline: 0, prevProgress: progress, glitch: 0 });
  const rest = useRef({ x: restX, z: restZ, scale: restScale });
  const vis = useRef({ ring: 0, marker: 0, shield: 0, core: 1, trim: 3, hover: 0 });

  // ── helpers ────────────────────────────────────────────────
  const killTl = () => {
    ctl.current.tl?.kill();
    ctl.current.tl = null;
  };

  const landSquash = (strength = 1) => {
    const a = anim.current;
    ctl.current.squash?.kill();
    a.sy = 1 - 0.28 * strength;
    a.sx = 1 + 0.18 * strength;
    ctl.current.squash = gsap.to(a, { sy: 1, sx: 1, duration: 0.5, ease: 'elastic.out(1.1, 0.35)' });
  };

  /** Tween to the committed resting pose (unless an animation owns the token). */
  const settle = () => {
    const c = ctl.current;
    if (c.moving || c.special || c.pendingTo !== null) return;
    const a = anim.current;
    const r = rest.current;
    const d = Math.hypot(a.x - r.x, a.z - r.z);
    if (d < 1e-4 && Math.abs(a.scale - r.scale) < 1e-4 && a.lift < 1e-4) {
      a.x = r.x;
      a.z = r.z;
      a.scale = r.scale;
      a.lift = 0;
      return;
    }
    killTl();
    c.tl = gsap.to(a, {
      x: r.x,
      z: r.z,
      scale: r.scale,
      lift: 0,
      duration: Math.min(0.6, 0.28 + d * 0.12),
      ease: 'power3.out',
    });
  };

  // ── movement along move.path (one hop per hopMs) ───────────
  const startMove = (move: Move, hopMs: number) => {
    const c = ctl.current;
    const a = anim.current;
    killTl();
    c.special = false;
    c.moving = true;
    c.pendingTo = move.to;
    const n = move.path.length;
    const hop = Math.max(0.05, hopMs / 1000);
    c.pendingDeadline = performance.now() + n * hopMs + 2500;
    trailActive.current = true;
    const pts = move.path.map((p) => progressToWorld(seat, p, index));
    const sx = a.x;
    const sz = a.z;
    const s0 = a.scale;
    const spin0 = a.spin;
    const lastHop = n - 1;
    const st = { t: 0 };
    let landed = 0;

    const apply = () => {
      const t = Math.min(st.t, n);
      const k = Math.min(Math.floor(t), lastHop);
      const u = t - k;
      // landing squash on every intermediate landing
      if (k > landed) {
        landed = k;
        landSquash(0.7);
      }
      const ax = k === 0 ? sx : pts[k - 1].x;
      const az = k === 0 ? sz : pts[k - 1].z;
      const b = pts[k];
      if (move.enters && n === 1) {
        // launch: crouch → rise with a spin → hang → dive onto the start cell
        if (u < 0.12) {
          const s = u / 0.12;
          a.sy = 1 - 0.25 * Math.sin(s * Math.PI * 0.5);
          a.sx = 1 + 0.15 * Math.sin(s * Math.PI * 0.5);
          a.lift = 0;
        } else if (u < 0.55) {
          const s = (u - 0.12) / 0.43;
          const e = easeOut(s);
          a.lift = 1.9 * e;
          a.x = lerp(ax, b.x, 0.25 * e);
          a.z = lerp(az, b.z, 0.25 * e);
          a.sy = 1 + 0.3 * (1 - s);
          a.sx = 1 / Math.sqrt(a.sy);
          a.spin = spin0 + Math.PI * 2 * e;
        } else if (u < 0.64) {
          a.lift = 1.9 + 0.05 * Math.sin(((u - 0.55) / 0.09) * Math.PI);
          a.sy = a.sx = 1;
        } else {
          const s = (u - 0.64) / 0.36;
          const e = easeIn(s);
          a.lift = 1.9 * (1 - e);
          a.x = lerp(lerp(ax, b.x, 0.25), b.x, easeInOut(s));
          a.z = lerp(lerp(az, b.z, 0.25), b.z, easeInOut(s));
          a.sy = 1 + 0.35 * e;
          a.sx = 1 / Math.sqrt(a.sy);
        }
        return;
      }
      const intoCore = move.finishes && k === lastHop;
      const H = intoCore ? 1.1 : HOP_HEIGHT;
      if (u < 0.12) {
        // anticipation crouch (doubles as the previous landing's squash)
        const s = u / 0.12;
        a.lift = 0;
        a.x = ax;
        a.z = az;
        if (!ctl.current.squash?.isActive()) {
          a.sy = 1 - 0.16 * Math.sin(s * Math.PI * 0.5);
          a.sx = 1 + 0.1 * Math.sin(s * Math.PI * 0.5);
        }
      } else {
        const s = (u - 0.12) / 0.88;
        const e = easeInOut(s);
        a.x = lerp(ax, b.x, e);
        a.z = lerp(az, b.z, e);
        a.lift = 4 * H * s * (1 - s);
        ctl.current.squash?.kill();
        a.sy = 1 + 0.16 * Math.sin(Math.PI * s);
        a.sx = 1 / Math.sqrt(a.sy);
        if (intoCore) {
          a.spin = spin0 + Math.PI * 4 * easeInOut(s);
          a.scale = lerp(s0, FINISH_SCALE, e);
        }
      }
    };

    c.tl = gsap.to(st, {
      t: n,
      duration: n * hop,
      ease: 'none',
      onUpdate: apply,
      onComplete: () => {
        apply();
        const last = pts[lastHop];
        a.x = last.x;
        a.z = last.z;
        a.lift = 0;
        c.moving = false;
        c.tl = null;
        trailActive.current = false;
        landSquash(move.enters ? 1.3 : 1);
        if (move.finishes) celebrate();
        if (c.pendingTo === null) settle();
      },
    });
  };

  /** Spin-in celebration once a token docks in the Nexus core. */
  const celebrate = () => {
    const a = anim.current;
    gsap.to(a, { spin: a.spin + Math.PI * 4, duration: 1.2, ease: 'power2.out' });
    const p = { x: a.x, y: TOKEN_Y + 0.4, z: a.z };
    burst(p, { count: 40, color: neon(SEAT_THEME[seat].color, 3), speed: [1, 3], life: [0.4, 0.9], shape: SHAPE_SHARD, gravity: -3 });
  };

  // ── digital disintegration → re-materialise in base ────────
  const playCapture = () => {
    const c = ctl.current;
    const a = anim.current;
    const u = mats.dissolve;
    killTl();
    c.special = true;
    trailActive.current = false;
    const tl = gsap.timeline({
      onComplete: () => {
        c.special = false;
        u.uDissolve.value = 0;
        u.uBuild.value = 1;
        u.uGlitch.value = 0;
        a.jitter = 0;
        settle();
      },
    });
    a.jitter = 1;
    tl.to(a, { jitter: 0.2, duration: 0.5, ease: 'power1.in' }, 0);
    tl.to(u.uGlitch, { value: 1, duration: 0.6, ease: 'steps(8)' }, 0);
    tl.to(u.uDissolve, { value: 1, duration: 0.6, ease: 'power1.in' }, 0.05);
    tl.to(a, { lift: 0.3, sy: 1.12, sx: 0.92, duration: 0.6, ease: 'power2.out' }, 0);
    tl.add(() => {
      const r = rest.current;
      a.x = r.x;
      a.z = r.z;
      a.scale = r.scale;
      a.lift = 0;
      a.sx = a.sy = 1;
      a.jitter = 0;
      u.uBuild.value = 0;
      u.uDissolve.value = 0;
      u.uGlitch.value = 0;
      const col = neon(SEAT_THEME[seat].color, 3);
      beam({ x: r.x, z: r.z, radius: 0.36, height: 2.4, duration: 1.0, color: col, opacity: 0.8 });
      ring({ x: r.x, z: r.z, radius: 0.75, duration: 0.9, color: col, style: RING_HEX, thickness: 0.06 });
    }, 0.8);
    tl.to(u.uBuild, { value: 1, duration: 0.8, ease: 'power1.inOut' }, 0.85);
    c.tl = tl;
  };

  // ── EMP knock-back: glitchy slide back along the track ─────
  const playGlitchSlide = (from: number, to: number) => {
    const c = ctl.current;
    const a = anim.current;
    killTl();
    c.special = true;
    const pts: { x: number; z: number }[] = [{ x: a.x, z: a.z }];
    for (let p = from - 1; p > to; p--) pts.push(progressToWorld(seat, p, index));
    pts.push({ x: rest.current.x, z: rest.current.z });
    const segs = pts.length - 1;
    const st = { t: 0 };
    a.jitter = 1;
    c.glitch = 1;
    const tl = gsap.timeline({
      onComplete: () => {
        c.special = false;
        c.glitch = 0;
        a.jitter = 0;
        mats.dissolve.uDissolve.value = 0;
        mats.dissolve.uGlitch.value = 0;
        settle();
      },
    });
    tl.to({}, { duration: 0.18 }); // stunned crackle before sliding
    tl.to(st, {
      t: segs,
      duration: 0.16 * segs + 0.15,
      ease: 'power2.inOut',
      onUpdate: () => {
        const k = Math.min(Math.floor(st.t), segs - 1);
        const f = st.t - k;
        a.x = lerp(pts[k].x, pts[k + 1].x, f);
        a.z = lerp(pts[k].z, pts[k + 1].z, f);
      },
    });
    tl.to(a, { jitter: 0, duration: 0.3 });
    c.tl = tl;
  };

  // ── react to store-driven moves ────────────────────────────
  const moving = useGame((s) => (s.moving && s.moving.move.tokenId === id ? s.moving : null));
  useEffect(() => {
    if (moving) startMove(moving.move, moving.hopMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving]);

  // ── react to committed state changes ───────────────────────
  useLayoutEffect(() => {
    rest.current.x = restX;
    rest.current.z = restZ;
    rest.current.scale = restScale;
    const c = ctl.current;
    const prev = c.prevProgress;
    c.prevProgress = progress;
    if (c.pendingTo !== null) {
      if (progress === c.pendingTo) {
        c.pendingTo = null;
        settle();
      }
      return;
    }
    if (c.moving) return;
    if (prev !== progress) {
      if (prev >= 0 && progress < 0) return playCapture();
      if (prev >= 0 && progress >= 0 && progress < prev) return playGlitchSlide(prev, progress);
    }
    settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, restX, restZ, restScale]);

  // ── materialise on spawn (scanline build-up) ───────────────
  useEffect(() => {
    const u = mats.dissolve;
    u.uBuild.value = 0;
    const tw = gsap.to(u.uBuild, { value: 1, duration: 0.9, delay: spawnDelay, ease: 'power1.inOut' });
    return () => {
      tw.kill();
      u.uBuild.value = 1;
    };
  }, [mats, spawnDelay]);

  // cleanup tweens & cursor on unmount
  useEffect(
    () => () => {
      ctl.current.tl?.kill();
      ctl.current.squash?.kill();
      gsap.killTweensOf(anim.current);
      if (useGame.getState().hoveredToken === id) {
        useGame.getState().hoverToken(null);
        document.body.style.cursor = '';
      }
    },
    [id],
  );

  // drop hover/cursor if the token stops being selectable
  useEffect(() => {
    if (!legal && useGame.getState().hoveredToken === id) {
      useGame.getState().hoverToken(null);
      document.body.style.cursor = '';
    }
  }, [legal, id]);

  // ── per-frame presentation ─────────────────────────────────
  useFrame((state, delta) => {
    const g = group.current;
    const b = body.current;
    if (!g || !b) return;
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.1);
    const a = anim.current;
    const c = ctl.current;
    const v = vis.current;

    // safety: never hold a pending move forever
    if (c.pendingTo !== null && !c.moving && performance.now() > c.pendingDeadline) {
      c.pendingTo = null;
      settle();
    }

    const jx = a.jitter > 0 ? (Math.random() - 0.5) * 0.14 * a.jitter : 0;
    const jz = a.jitter > 0 ? (Math.random() - 0.5) * 0.14 * a.jitter : 0;
    g.position.set(a.x + jx, TOKEN_Y, a.z + jz);
    mats.dissolve.uOrigin.value.copy(g.position);

    // glitch tearing during EMP knock-back
    if (c.glitch > 0) {
      const tear = Math.random() < 0.35 ? 0.12 + Math.random() * 0.25 : 0;
      mats.dissolve.uDissolve.value = tear * a.jitter;
      mats.dissolve.uGlitch.value = Math.random();
    }

    const idle = !c.moving && !c.special;
    const selectable = legal && idle;
    const bounce = selectable ? Math.abs(Math.sin(t * 4.2 + id * 0.7)) * 0.11 : 0;
    b.position.y = HOVER + Math.sin(t * 1.9 + id * 1.37) * 0.018 + a.lift + bounce;
    v.hover = damp(v.hover, hovered && selectable ? 1 : 0, 12, dt);
    const hs = 1 + 0.09 * v.hover;
    b.scale.set(a.scale * a.sx * hs, a.scale * a.sy * hs, a.scale * a.sx * hs);
    b.rotation.y = a.spin + Math.sin(t * 0.6 + id) * 0.15;

    // core & halo
    const visibility = (1 - mats.dissolve.uDissolve.value) * mats.dissolve.uBuild.value;
    const coreTarget = dimmed ? 0.55 : selectable ? 1.35 + 0.35 * Math.sin(t * 6 + id) : 1.05;
    v.core = damp(v.core, coreTarget + v.hover * 0.6, 6, dt);
    mats.core.uniforms.uTime.value = t + id * 3.1;
    mats.core.uniforms.uIntensity.value = v.core;
    v.trim = damp(v.trim, dimmed ? 1.2 : selectable ? 3.6 + Math.sin(t * 6 + id) : 3, 6, dt);
    mats.trim.emissiveIntensity = v.trim;
    if (coreRef.current) {
      coreRef.current.rotation.y += dt * 1.4;
      coreRef.current.rotation.x += dt * 0.6;
      coreRef.current.position.y = TOKEN.coreY + Math.sin(t * 2.6 + id) * 0.012;
    }
    if (haloRef.current) {
      haloRef.current.rotation.y += dt * 1.1;
      haloRef.current.rotation.x = Math.sin(t * 1.3 + id) * 0.22;
      haloRef.current.rotation.z = Math.cos(t * 1.1 + id) * 0.22;
      haloRef.current.position.y = TOKEN.haloY + Math.sin(t * 2.2 + id) * 0.025;
      const hp = 0.5 + 0.5 * Math.sin(t * 3 + id);
      mats.halo.opacity = (dimmed ? 0.35 : 0.75 + 0.25 * hp) * visibility;
    }
    mats.decal.uniforms.uTime.value = t + id;
    mats.decal.uniforms.uOpacity.value = (dimmed ? 0.35 : 0.8) * visibility * (1 - Math.min(1, a.lift * 0.6));

    // selection ring
    v.ring = damp(v.ring, selectable ? 1 : 0, 10, dt);
    mats.select.uniforms.uOpacity.value = v.ring;
    mats.select.uniforms.uTime.value = t;
    mats.select.uniforms.uHover.value = v.hover;
    if (selectRef.current) {
      selectRef.current.visible = v.ring > 0.01;
      selectRef.current.rotation.y = t * 0.7;
    }

    // hint marker
    v.marker = damp(v.marker, hinted && selectable ? 1 : 0, 6, dt);
    mats.marker.opacity = v.marker * (0.55 + 0.35 * Math.sin(t * 4));
    if (markerRef.current) {
      markerRef.current.visible = v.marker > 0.01;
      markerRef.current.position.y = 1.08 + bounce + Math.sin(t * 3.5) * 0.06;
      markerRef.current.rotation.y = t * 1.8;
    }

    // shield bubble
    v.shield = damp(v.shield, shield > 0 && progress >= 0 ? 1 : 0, 6, dt);
    if (shieldRef.current) {
      shieldRef.current.visible = v.shield > 0.01;
      const sp = 1 + 0.025 * Math.sin(t * 3);
      shieldRef.current.scale.setScalar(Math.max(0.001, v.shield) * sp);
      shieldRef.current.rotation.y = t * 0.3;
      mats.shield.uniforms.uOpacity.value = v.shield * visibility;
      mats.shield.uniforms.uTime.value = t;
    }
  });

  // ── interaction ────────────────────────────────────────────
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!legal) return;
    e.stopPropagation();
    useGame.getState().selectToken(id);
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    if (!legal) return;
    e.stopPropagation();
    useGame.getState().hoverToken(id);
    document.body.style.cursor = 'pointer';
  };
  const onOut = () => {
    if (useGame.getState().hoveredToken !== id) return;
    useGame.getState().hoverToken(null);
    document.body.style.cursor = '';
  };

  const noRay = () => null;
  const finished = progress >= FINISH_PROGRESS;

  return (
    <>
      <group ref={group} onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
        <mesh geometry={geo.hit} material={mats.hit} scale={finished ? 0.7 : 1} />
        <mesh geometry={geo.decal} material={mats.decal} position-y={0.004} renderOrder={2} raycast={noRay} />
        <mesh ref={selectRef} geometry={geo.select} material={mats.select} position-y={0.008} renderOrder={3} raycast={noRay} />
        <group ref={body}>
          <mesh geometry={geo.chassis} material={mats.chassis} castShadow raycast={noRay} />
          <mesh geometry={geo.trimBase} material={mats.trim} position-y={0.045} raycast={noRay} />
          <mesh geometry={geo.trimCollar} material={mats.trim} position-y={0.385} raycast={noRay} />
          {[0, 1, 2].map((i) => {
            const ang = (i / 3) * Math.PI * 2 + Math.PI / 6;
            return (
              <group key={i} rotation-y={ang}>
                {/* drone arm */}
                <mesh geometry={geo.fin} material={mats.chassis} position={[0.21, 0.19, 0]} rotation-z={-0.35} raycast={noRay} />
                <mesh geometry={geo.finTip} material={mats.trim} position={[0.31, 0.155, 0]} rotation-z={-0.35} raycast={noRay} />
                {/* core cradle prong */}
                <mesh geometry={geo.prong} material={mats.chassis} position={[0.125, 0.48, 0]} rotation-z={0.32} raycast={noRay} />
              </group>
            );
          })}
          <mesh ref={coreRef} geometry={geo.core} material={mats.core} position-y={TOKEN.coreY} raycast={noRay} />
          <mesh ref={haloRef} geometry={geo.halo} material={mats.halo} position-y={TOKEN.haloY} renderOrder={4} raycast={noRay} />
          <mesh ref={shieldRef} geometry={geo.shield} material={mats.shield} position-y={TOKEN.shieldY} visible={false} renderOrder={6} raycast={noRay} />
        </group>
        <mesh ref={markerRef} geometry={geo.marker} material={mats.marker} position-y={1.08} visible={false} renderOrder={5} raycast={noRay} />
      </group>
      <NeonTrail source={coreRef} active={trailActive} color={mats.seatColor} />
    </>
  );
}
