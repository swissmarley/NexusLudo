// Camera rig: OrbitControls free-look + GSAP-driven cinematics.
//   menu/setup/results → slow attract orbit      game start → sweeping fly-in
//   auto mode → glide behind the current human   top view / reset → tweens
//   capture / emp / six → trauma screen shake    victory → low dolly orbit round the core
// Responsive: distance + FOV adapt to the viewport aspect ratio.
import { useEffect, useRef, type ComponentRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import gsap from 'gsap';
import * as THREE from 'three';
import { baseCenterWorld } from '../../game/board';
import type { Seat } from '../../game/types';
import { useGame, type Screen } from '../../store/game';
import { useSettings } from '../../store/settings';
import { useView } from '../../store/view';
import { damp, useFx } from './shared';

type Controls = ComponentRef<typeof OrbitControls>;
type Mode = 'attract' | 'tween' | 'free' | 'victory';

interface Framing {
  r: number;
  phi: number;
  theta: number;
  tx: number;
  ty: number;
  tz: number;
}

const IDLE_MS = 3500;
const MAX_POLAR = 1.2; // ~69° from vertical — never dip under the board

const TAU = Math.PI * 2;
const wrapAngle = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/** Azimuth that looks from behind a seat's base corner toward the centre. */
function seatTheta(seat: Seat): number {
  const c = baseCenterWorld(seat);
  return Math.atan2(c.x, c.z);
}

/** Camera distance so the whole board fits the viewport. */
function fitDistance(aspect: number, fovDeg: number, top = false): number {
  const v = THREE.MathUtils.degToRad(fovDeg) / 2;
  const h = Math.atan(Math.tan(v) * aspect);
  const halfW = top ? 8.6 : 10.4;
  const halfH = top ? 9.2 : 8.9; // extra headroom for HUD top bar + action dock
  return Math.max(halfH / Math.tan(v), halfW / Math.tan(h)) * (top ? 1.04 : 1.1);
}

function fovFor(aspect: number): number {
  return aspect < 0.8 ? 52 : aspect < 1.2 ? 46 : 40;
}

/** Seat whose perspective the camera should adopt by default. */
function homeSeat(): Seat {
  const g = useGame.getState().game;
  if (!g) return 0;
  if (g.players[g.current].kind === 'human') return g.current;
  const human = g.players.find((p) => p.active && p.kind === 'human');
  return human ? human.seat : g.current;
}

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useRef<Controls>(null);

  // mutable rig state (refs → no re-renders, no per-frame allocation)
  const mode = useRef<Mode>('attract');
  const tween = useRef<gsap.core.Tween | gsap.core.Timeline | null>(null);
  const proxy = useRef<Framing>({ r: 30, phi: 1.1, theta: 0.6, tx: 0, ty: 0, tz: 0 });
  const cur = useRef<Framing>({ r: 30, phi: 1.1, theta: 0.6, tx: 0, ty: 0.6, tz: 0 });
  const orbitTheta = useRef(0.6);
  const dragging = useRef(false);
  const lastInput = useRef(-1e9);
  const pendingAuto = useRef<Seat | null>(null);
  const trauma = useRef(0);
  const shake = useRef(new THREE.Vector3());
  const fit = useRef(22);
  const fitTop = useRef(22);
  const tmp = useRef({ v: new THREE.Vector3(), s: new THREE.Spherical(), t: new THREE.Vector3() }).current;

  // ── responsive FOV + fit distance ──
  const aspect = size.width / Math.max(size.height, 1);
  const bucket = aspect < 0.8 ? 0 : aspect < 1.2 ? 1 : 2;
  useEffect(() => {
    camera.fov = fovFor(aspect);
    camera.updateProjectionMatrix();
    fit.current = fitDistance(aspect, camera.fov);
    fitTop.current = fitDistance(aspect, camera.fov, true);
    const c = controls.current;
    if (c) {
      c.minDistance = 6.5;
      c.maxDistance = Math.max(fit.current * 1.7, 32);
    }
  }, [aspect, camera]);

  // ── helpers ──
  const readCurrent = (out: Framing) => {
    const c = controls.current;
    const target = c ? c.target : tmp.t.set(0, 0, 0);
    tmp.v.copy(camera.position).sub(target);
    tmp.s.setFromVector3(tmp.v);
    out.r = tmp.s.radius;
    out.phi = tmp.s.phi;
    out.theta = tmp.s.theta;
    out.tx = target.x;
    out.ty = target.y;
    out.tz = target.z;
  };

  const apply = (f: Framing) => {
    tmp.s.set(f.r, Math.max(0.0001, f.phi), f.theta);
    tmp.t.set(f.tx, f.ty, f.tz);
    camera.position.setFromSpherical(tmp.s).add(tmp.t);
    controls.current?.target.copy(tmp.t);
    camera.lookAt(tmp.t);
  };

  const seatFraming = (seat: Seat): Framing => {
    const theta = seatTheta(seat);
    // shift the look-at point toward the viewer so the board sits above the action dock
    const k = bucket === 0 ? 0.6 : 2.3;
    return {
      r: fit.current,
      phi: bucket === 0 ? 0.72 : 0.9,
      theta,
      tx: Math.sin(theta) * k,
      ty: bucket === 0 ? 0.4 : 0,
      tz: Math.cos(theta) * k,
    };
  };

  const stopTween = () => {
    tween.current?.kill();
    tween.current = null;
  };

  /** Kill any residual damping momentum before we take over the camera. */
  const quench = () => {
    const c = controls.current;
    if (!c) return;
    const d = c.enableDamping;
    c.enableDamping = false;
    c.update();
    c.enableDamping = d;
  };

  const setInteractive = (on: boolean) => {
    if (controls.current) controls.current.enabled = on;
  };

  const finishTween = () => {
    tween.current = null;
    mode.current = 'free';
    setInteractive(true);
  };

  const flyTo = (dest: Framing, duration = 1.5, ease = 'power2.inOut') => {
    stopTween();
    quench();
    setInteractive(false);
    const p = proxy.current;
    readCurrent(p);
    const theta = p.theta + wrapAngle(dest.theta - p.theta);
    mode.current = 'tween';
    tween.current = gsap.to(p, { ...dest, theta, duration, ease, onComplete: finishTween });
  };

  const intro = () => {
    stopTween();
    quench();
    setInteractive(false);
    const p = proxy.current;
    readCurrent(p);
    const dest = seatFraming(homeSeat());
    // sweep the long way round when the short path would be too timid (≥ ~110°)
    let delta = wrapAngle(dest.theta - p.theta);
    if (Math.abs(delta) < Math.PI * 0.6) delta += delta >= 0 ? -TAU : TAU;
    const end = p.theta + delta;
    mode.current = 'tween';
    tween.current = gsap
      .timeline({ onComplete: finishTween })
      .to(p, { r: fit.current * 1.7, phi: 0.5, ty: 0, tx: 0, tz: 0, theta: p.theta + delta * 0.55, duration: 1.5, ease: 'power2.in' })
      .to(p, { r: dest.r, phi: dest.phi, ty: dest.ty, theta: end, duration: 1.7, ease: 'power3.out' });
  };

  const enterAttract = () => {
    stopTween();
    quench();
    setInteractive(false);
    readCurrent(cur.current);
    orbitTheta.current = cur.current.theta;
    mode.current = 'attract';
  };

  const enterVictory = () => {
    stopTween();
    quench();
    setInteractive(false);
    readCurrent(cur.current);
    orbitTheta.current = cur.current.theta;
    mode.current = 'victory';
  };

  const resetView = () => {
    const v = useView.getState();
    const seat = homeSeat();
    if (v.topView) flyTo({ r: fitTop.current, phi: 0.02, theta: seatTheta(seat), tx: 0, ty: 0, tz: 0 }, 1.3);
    else flyTo(seatFraming(seat), 1.4);
  };

  // keep latest closures for subscriptions without re-subscribing
  const api = useRef({ flyTo, intro, enterAttract, enterVictory, resetView, seatFraming });
  api.current = { flyTo, intro, enterAttract, enterVictory, resetView, seatFraming };

  // ── screen transitions ──
  useEffect(() => {
    const onScreen = (screen: Screen, prev: Screen | null) => {
      if (screen === 'menu' || screen === 'setup' || screen === 'results') {
        if (mode.current !== 'attract') api.current.enterAttract();
      } else if (screen === 'victory') {
        api.current.enterVictory();
      } else if (screen === 'game') {
        if (prev === 'victory') api.current.resetView();
        else if (mode.current === 'attract') {
          // gameStart (fired right after) normally triggers the intro; fallback if it doesn't
          queueMicrotask(() => {
            if (mode.current === 'attract') api.current.intro();
          });
        }
      }
    };
    onScreen(useGame.getState().screen, null);
    return useGame.subscribe((s, p) => {
      if (s.screen !== p.screen) onScreen(s.screen, p.screen);
    });
  }, []);

  // ── view store: top view & reset ──
  useEffect(
    () =>
      useView.subscribe((s, p) => {
        if (useGame.getState().screen !== 'game') return;
        if (s.cameraResetNonce !== p.cameraResetNonce || s.topView !== p.topView) {
          pendingAuto.current = null;
          api.current.resetView();
        }
      }),
    [],
  );

  // re-frame when the viewport flips orientation (if the user isn't driving)
  useEffect(() => {
    if (mode.current === 'free' && performance.now() - lastInput.current > IDLE_MS) api.current.resetView();
  }, [bucket]);

  // ── fx-driven behaviours ──
  useFx('gameStart', () => api.current.intro());
  useFx('turn', (e) => {
    const s = useGame.getState();
    if (useSettings.getState().cameraMode !== 'auto' || s.screen !== 'game' || useView.getState().topView) return;
    if (s.game?.players[e.seat].kind !== 'human') return;
    pendingAuto.current = e.seat;
  });
  const addTrauma = (amount: number) => {
    if (!useSettings.getState().screenShake) return;
    trauma.current = Math.min(1, trauma.current + amount);
  };
  useFx('capture', () => addTrauma(0.65));
  useFx('emp', () => addTrauma(0.8));
  useFx('six', () => addTrauma(0.22));
  useFx('finish', () => addTrauma(0.18));

  // ── per-frame drive ──
  // priority -3: remove last frame's shake before anything reads/updates the camera
  useFrame(() => {
    if (shake.current.lengthSq() > 0) {
      camera.position.sub(shake.current);
      shake.current.set(0, 0, 0);
    }
  }, -3);

  // priority -2: cinematic modes (OrbitControls updates at -1 when enabled)
  useFrame((state, dt) => {
    const d = Math.min(dt, 0.1);
    const t = state.clock.elapsedTime;
    const c = cur.current;
    if (mode.current === 'tween') {
      apply(proxy.current);
    } else if (mode.current === 'attract' || mode.current === 'victory') {
      const victory = mode.current === 'victory';
      orbitTheta.current += d * (victory ? 0.22 : 0.055);
      const r = victory ? 9.5 + Math.sin(t * 0.35) * 2.2 : fit.current * 1.2;
      const phi = victory ? 1.27 + Math.sin(t * 0.5) * 0.04 : 1.08 + Math.sin(t * 0.11) * 0.1;
      const ty = victory ? 1.3 : 0.4;
      const k = victory ? 1.4 : 0.9;
      c.r = damp(c.r, r, k, d);
      c.phi = damp(c.phi, phi, k, d);
      c.theta = c.theta + wrapAngle(orbitTheta.current - c.theta) * (1 - Math.exp(-k * d));
      c.tx = damp(c.tx, 0, k, d);
      c.ty = damp(c.ty, ty, k, d);
      c.tz = damp(c.tz, 0, k, d);
      apply(c);
    } else if (mode.current === 'free' && pendingAuto.current !== null) {
      if (!dragging.current && performance.now() - lastInput.current > IDLE_MS) {
        const dest = api.current.seatFraming(pendingAuto.current);
        pendingAuto.current = null;
        readCurrent(proxy.current);
        const p = proxy.current;
        const far =
          Math.abs(wrapAngle(dest.theta - p.theta)) > 0.12 || Math.abs(dest.phi - p.phi) > 0.08 || Math.abs(dest.r - p.r) > 1.2;
        if (far) api.current.flyTo(dest, 1.6, 'power2.inOut');
      }
    }
  }, -2);

  // priority 0 (after controls.update): add trauma-based shake on top
  useFrame((state, dt) => {
    if (trauma.current <= 0) return;
    trauma.current = Math.max(0, trauma.current - Math.min(dt, 0.1) * 1.5);
    const a = trauma.current * trauma.current * 0.32 * (camera.position.length() / 20);
    const t = state.clock.elapsedTime * 30;
    shake.current.set(
      (Math.sin(t * 1.13) + Math.sin(t * 2.71) * 0.5) * a,
      (Math.sin(t * 1.37 + 2) + Math.sin(t * 3.1) * 0.5) * a * 0.7,
      (Math.sin(t * 1.21 + 4) + Math.sin(t * 2.33) * 0.5) * a,
    );
    camera.position.add(shake.current);
  });

  useEffect(() => () => stopTween(), []);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
      minPolarAngle={0}
      maxPolarAngle={MAX_POLAR}
      onStart={() => {
        dragging.current = true;
        lastInput.current = performance.now();
      }}
      onEnd={() => {
        dragging.current = false;
        lastInput.current = performance.now();
      }}
    />
  );
}
