// OWNER: actors/VFX agent.
// Premium holo-metal die: rounded dark-metal cube, neon pips & edges in the
// active player's colour, plasma core. Hovers over the current player's base
// pad when idle, tumbles procedurally onto `dice.value` within `durationMs`.
import { Billboard } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE, SEAT_THEME } from '../../core/theme';
import { baseCenterWorld } from '../../game/board';
import type { Seat } from '../../game/types';
import { selectIsHumanTurn, useGame } from '../../store/game';
import { SHAPE_STAR } from '../vfx/ParticleSystem';
import { RING_SOFT } from '../vfx/RingSystem';
import { bolt, burst, fxScale, neon, ring } from '../vfx/vfxApi';
import {
  DIE_HALF,
  DIE_HOVER_Y,
  DIE_RADIUS,
  DIE_REST_Y,
  DIE_SIZE,
  FACE_NORMALS,
  PIP_LAYOUT,
  T_IMPACTS,
  createThrowPlan,
  faceAxes,
  sampleThrow,
  type ThrowPlan,
} from './diceMath';
import { diceAnchor } from './diceState';
import { createEdgeMaterial, createHoloMaterial, createPlasmaMaterial, createSelectRingMaterial, makeDissolveUniforms } from './shaders';

type Mode = 'idle' | 'throw' | 'rest';

const PIP_SPACING = 0.155;
const PIP_R = 0.05;
const _target = new THREE.Vector3();
const _qIdle = new THREE.Quaternion();
const _qTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6155, 0, Math.PI / 4, 'XZY'));
const _yAxis = new THREE.Vector3(0, 1, 0);
const _seatCol = new THREE.Color();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Builds the 21 pip transforms on the six faces. */
function buildPips(geo: THREE.BufferGeometry, mat: THREE.Material, lift: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, 21);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const zf = new THREE.Vector3(0, 0, 1);
  const one = new THREE.Vector3(1, 1, 1);
  let i = 0;
  for (let v = 1; v <= 6; v++) {
    const n = FACE_NORMALS[v];
    const [u, w] = faceAxes(n);
    q.setFromUnitVectors(zf, n);
    for (const [ox, oy] of PIP_LAYOUT[v]) {
      const p = n
        .clone()
        .multiplyScalar(DIE_HALF + lift)
        .addScaledVector(u, ox * PIP_SPACING)
        .addScaledVector(w, oy * PIP_SPACING);
      m.compose(p, q, one);
      mesh.setMatrixAt(i++, m);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Draw the holographic readout texture (white glyphs; colour comes from the shader). */
function drawReadout(ctx: CanvasRenderingContext2D, text: string, caption: string) {
  const S = ctx.canvas.width;
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 5;
  const m = 26;
  const L = 42;
  // chamfered corner brackets
  for (const [x, y, dx, dy] of [
    [m, m, 1, 1],
    [S - m, m, -1, 1],
    [m, S - m, 1, -1],
    [S - m, S - m, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * L);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * L, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = 18;
  ctx.font = `900 ${text.length > 1 ? 120 : 150}px Orbitron, Rajdhani, system-ui, sans-serif`;
  ctx.fillText(text, S / 2, S / 2 - 8);
  ctx.shadowBlur = 6;
  ctx.font = '700 26px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(caption, S / 2, S - 52);
}

export function Dice() {
  const game = useGame((s) => s.game);
  const dice = useGame((s) => s.dice);
  const humanTurn = useGame(selectIsHumanTurn);

  const res = useMemo(() => {
    const bodyGeo = new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 4, DIE_RADIUS);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: '#0b0e18',
      metalness: 0.78,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      transparent: true,
      opacity: 0.8,
      emissive: new THREE.Color('#000000'),
    });
    const edgeMat = createEdgeMaterial(DIE_HALF);
    const coreMat = createPlasmaMaterial(new THREE.Color(PALETTE.cyan), makeDissolveUniforms(new THREE.Color('#ffffff')));
    const coreGeo = new THREE.IcosahedronGeometry(0.15, 3);
    const pipGeo = new THREE.CircleGeometry(PIP_R, 24);
    const pipRingGeo = new THREE.RingGeometry(PIP_R * 1.15, PIP_R * 1.45, 24);
    const pipMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const pipRingMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    const pips = buildPips(pipGeo, pipMat, 0.003);
    const pipRings = buildPips(pipRingGeo, pipRingMat, 0.004);
    const inviteGeo = new THREE.PlaneGeometry(2.1, 2.1);
    inviteGeo.rotateX(-Math.PI / 2);
    const inviteMat = createSelectRingMaterial(new THREE.Color('#ffffff'));
    const hitGeo = new THREE.BoxGeometry(1.25, 1.25, 1.25);
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas);
    const holoMat = createHoloMaterial(tex);
    const holoGeo = new THREE.PlaneGeometry(0.8, 0.8);
    return { bodyGeo, bodyMat, edgeMat, coreMat, coreGeo, pipGeo, pipRingGeo, pipMat, pipRingMat, pips, pipRings, inviteGeo, inviteMat, hitGeo, hitMat, ctx, tex, holoMat, holoGeo };
  }, []);

  useEffect(
    () => () => {
      const r = res;
      [r.bodyGeo, r.coreGeo, r.pipGeo, r.pipRingGeo, r.inviteGeo, r.hitGeo, r.holoGeo].forEach((g) => g.dispose());
      [r.bodyMat, r.edgeMat, r.coreMat, r.pipMat, r.pipRingMat, r.inviteMat, r.hitMat, r.holoMat].forEach((m) => m.dispose());
      r.tex.dispose();
      r.pips.dispose();
      r.pipRings.dispose();
    },
    [res],
  );

  const root = useRef<THREE.Group>(null);
  const invite = useRef<THREE.Mesh>(null);
  const readout = useRef<THREE.Group>(null);
  const cursorSet = useRef(false);
  const st = useRef({
    mode: 'idle' as Mode,
    init: false,
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    plan: null as ThrowPlan | null,
    start: 0,
    dur: 1,
    impacts: 0,
    landedAt: 0,
    nonce: -1,
    value: 1,
    seat: 0 as Seat,
    sixUntil: 0,
    sixTimer: 0,
    readout: 0,
    invite: 0,
    pulse: 0,
    color: new THREE.Color(SEAT_THEME[0].color),
    label: '',
  });

  // ── start a throw whenever a new roll nonce arrives ────────
  useEffect(() => {
    const s = st.current;
    if (!dice) {
      if (s.mode !== 'throw') s.mode = 'idle';
      return;
    }
    if (!dice.rolling || dice.nonce === s.nonce) return;
    s.nonce = dice.nonce;
    s.value = dice.value;
    s.seat = dice.seat;
    const pad = baseCenterWorld(dice.seat);
    _target.set(pad.x, DIE_REST_Y, pad.z);
    if (!s.init) {
      s.pos.set(pad.x, DIE_HOVER_Y, pad.z);
      s.init = true;
    }
    s.plan = createThrowPlan(s.pos, s.quat, _target, dice.value, dice.nonce);
    s.mode = 'throw';
    s.start = performance.now();
    // land a touch early so the result is visibly settled before the store commits
    s.dur = Math.max(250, dice.durationMs * 0.93);
    s.impacts = 0;
    s.readout = 0;
    s.sixUntil = 0;
  }, [dice]);

  // ── holographic readout label (effective value incl. boost) ─
  const label = useMemo(() => {
    if (!dice) return { text: '', caption: '' };
    const boosted = !!game && game.boosted && game.current === dice.seat && game.dice !== null;
    return {
      text: boosted ? String(game!.dice) : String(dice.value),
      caption: boosted ? 'OVERDRIVE' : dice.value === 6 ? 'MAX OUTPUT' : 'ROLL',
    };
  }, [dice, game]);
  useEffect(() => {
    if (!label.text) return;
    drawReadout(res.ctx, label.text, label.caption);
    res.tex.needsUpdate = true;
  }, [label, res]);

  useEffect(() => {
    if (!game) {
      st.current.init = false;
      st.current.mode = 'idle';
      st.current.sixUntil = 0;
    }
  }, [game]);

  useFrame((state, delta) => {
    const g = root.current;
    if (!g || !game) return;
    const s = st.current;
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;
    const now = performance.now();
    const store = useGame.getState();
    const current = game.current;

    if (!s.init) {
      const p = baseCenterWorld(current);
      s.pos.set(p.x, DIE_HOVER_Y, p.z);
      s.quat.copy(_qTilt);
      s.init = true;
    }

    if (s.mode === 'throw' && s.plan) {
      const k = Math.min(1, (now - s.start) / s.dur);
      sampleThrow(s.plan, k, s.pos, s.quat);
      // impact sparks on each bounce
      while (s.impacts < T_IMPACTS.length && k >= T_IMPACTS[s.impacts]) {
        const strength = 1 - s.impacts * 0.3;
        const c = neon(SEAT_THEME[s.seat].color, 3);
        burst({ x: s.pos.x, y: 0.1, z: s.pos.z }, { count: Math.round(22 * strength), color: c, color2: neon('#e8f6ff', 2), mode: 'ring', speed: [1.2, 3 * strength], size: [0.04, 0.09], life: [0.2, 0.45], gravity: -4, drag: 3 });
        ring({ x: s.pos.x, z: s.pos.z, radius: 0.9 * strength, duration: 0.4, color: c, style: RING_SOFT, thickness: 0.08 });
        s.impacts++;
      }
      if (k >= 1) {
        s.mode = 'rest';
        s.landedAt = now;
        if (s.value === 6) s.sixUntil = now + 1700;
      }
    } else if (s.mode === 'rest') {
      const rolling = store.dice?.rolling ?? false;
      if (!rolling && !store.busy && game.phase === 'roll' && now - s.landedAt > 650) s.mode = 'idle';
    } else {
      // idle hover above the current player's base pad
      const p = baseCenterWorld(current);
      _target.set(p.x, DIE_HOVER_Y + Math.sin(t * 1.6) * 0.06, p.z);
      const dist = Math.hypot(s.pos.x - _target.x, s.pos.z - _target.z);
      _target.y += Math.min(1.2, dist * 0.25); // arc while travelling between bases
      s.pos.x = THREE.MathUtils.damp(s.pos.x, _target.x, 3.2, dt);
      s.pos.z = THREE.MathUtils.damp(s.pos.z, _target.z, 3.2, dt);
      s.pos.y = THREE.MathUtils.damp(s.pos.y, _target.y, 4, dt);
      _qIdle.setFromAxisAngle(_yAxis, t * 0.7).multiply(_qTilt);
      s.quat.slerp(_qIdle, 1 - Math.exp(-3 * dt));
    }

    // interaction affordance
    const canRoll = humanTurn && game.phase === 'roll' && s.mode === 'idle';
    s.invite = THREE.MathUtils.damp(s.invite, canRoll ? 1 : 0, 6, dt);
    const pulse = 1 + s.invite * 0.06 * Math.sin(t * 4.5);
    g.position.copy(s.pos);
    g.quaternion.copy(s.quat);
    g.scale.setScalar(pulse);
    diceAnchor.copy(s.pos);

    // colour follows the active seat
    const seat: Seat = s.mode === 'idle' ? current : s.seat;
    _seatCol.set(SEAT_THEME[seat].color);
    s.color.lerp(_seatCol, 1 - Math.exp(-5 * dt));
    const sixGlow = now < s.sixUntil ? 1 : 0;
    res.pipMat.color.copy(s.color).multiplyScalar(3.2 + sixGlow * 2);
    res.pipRingMat.color.copy(s.color).multiplyScalar(1.4);
    res.bodyMat.emissive.copy(s.color).multiplyScalar(0.05 + s.invite * 0.05);
    const eu = res.edgeMat.uniforms;
    (eu.uColor.value as THREE.Color).copy(s.color).multiplyScalar(1.6 + sixGlow * 1.5);
    eu.uIntensity.value = 0.85 + s.invite * (0.4 + 0.3 * Math.sin(t * 5)) + sixGlow * 0.5;
    eu.uTime.value = t;
    const cu = res.coreMat.uniforms;
    (cu.uColor.value as THREE.Color).copy(s.color);
    cu.uTime.value = t;
    cu.uIntensity.value = 1.2 + s.invite * 0.6 + sixGlow;

    // invite ring on the pad
    const inv = invite.current;
    if (inv) {
      const p = baseCenterWorld(current);
      inv.position.set(p.x, 0.075, p.z);
      inv.rotation.y = -t * 0.5;
      inv.visible = s.invite > 0.01;
      const iu = res.inviteMat.uniforms;
      (iu.uColor.value as THREE.Color).copy(s.color).multiplyScalar(2);
      iu.uOpacity.value = s.invite;
      iu.uTime.value = t;
    }

    // result readout
    s.readout = THREE.MathUtils.damp(s.readout, s.mode === 'rest' ? 1 : 0, s.mode === 'rest' ? 7 : 10, dt);
    const ro = readout.current;
    if (ro) {
      ro.visible = s.readout > 0.01;
      ro.position.set(s.pos.x, s.pos.y + 0.75 + s.readout * 0.1 + Math.sin(t * 2) * 0.03, s.pos.z);
      ro.scale.setScalar(0.6 + 0.4 * s.readout);
      const hu = res.holoMat.uniforms;
      hu.uOpacity.value = s.readout * (0.85 + 0.15 * Math.sin(t * 30) * Math.sin(t * 7));
      hu.uTime.value = t;
      (hu.uColor.value as THREE.Color).copy(s.color).lerp(neon('#ffd54a', 1), sixGlow * 0.6);
    }

    // SIX: electric arcs crawling around the die
    if (now < s.sixUntil) {
      s.sixTimer -= dt;
      if (s.sixTimer <= 0) {
        s.sixTimer = 0.07 / Math.max(0.35, fxScale());
        const gold = neon('#ffd54a', 3);
        const cyan = neon(PALETTE.cyan, 3);
        for (let i = 0; i < 2; i++) {
          _a.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize();
          _b.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
          const r2 = 0.6 + Math.random() * 0.6;
          bolt({
            ax: s.pos.x + _a.x * 0.36,
            ay: s.pos.y + _a.y * 0.36,
            az: s.pos.z + _a.z * 0.36,
            bx: s.pos.x + _b.x * r2,
            by: Math.max(0.08, s.pos.y + _b.y * r2),
            bz: s.pos.z + _b.z * r2,
            color: Math.random() < 0.5 ? gold : cyan,
            life: 0.16,
            width: 0.03,
            jitter: 0.28,
          });
        }
        if (Math.random() < 0.35) burst(s.pos, { count: 6, color: gold, color2: cyan, shape: SHAPE_STAR, speed: [0.6, 1.6], size: [0.08, 0.16], life: [0.2, 0.4], gravity: 1 });
      }
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const s = useGame.getState();
    if (!selectIsHumanTurn(s) || s.game?.phase !== 'roll' || st.current.mode === 'throw') return;
    e.stopPropagation();
    s.rollDice();
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    const s = useGame.getState();
    if (!selectIsHumanTurn(s) || s.game?.phase !== 'roll') return;
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
    cursorSet.current = true;
  };
  const onOut = () => {
    if (!cursorSet.current) return;
    cursorSet.current = false;
    document.body.style.cursor = '';
  };

  if (!game) return null;
  const noRay = () => null;

  return (
    <group name="dice">
      <group ref={root} onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
        <mesh geometry={res.hitGeo} material={res.hitMat} />
        <mesh geometry={res.coreGeo} material={res.coreMat} raycast={noRay} />
        <mesh geometry={res.bodyGeo} material={res.bodyMat} castShadow raycast={noRay} />
        <primitive object={res.pips} raycast={noRay} />
        <primitive object={res.pipRings} raycast={noRay} />
        <mesh geometry={res.bodyGeo} material={res.edgeMat} scale={1.012} renderOrder={5} raycast={noRay} />
      </group>
      <mesh ref={invite} geometry={res.inviteGeo} material={res.inviteMat} renderOrder={3} visible={false} raycast={noRay} />
      <group ref={readout} visible={false}>
        <Billboard>
          <mesh geometry={res.holoGeo} material={res.holoMat} renderOrder={20} raycast={noRay} />
        </Billboard>
      </group>
    </group>
  );
}
