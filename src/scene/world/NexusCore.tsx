// Central 3×3 Nexus Core: converging seat triangles, pulsing reactor,
// rising holographic beam, orbiting rings and a floating data crystal.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../../store/game';
import { SEAT_COLORS, damp, uEnergy, uTime, uTurnColor, useBudget, useDisposable, useFx } from './shared';
import { beamFrag, beamVert, coreFrag, flatVert } from './shaders/board';

const BEAM_HEIGHT = 9;

export function NexusCore() {
  const { tier } = useBudget();
  const crystal = useRef<THREE.Group>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  const flash = useRef(0);

  const seatOn = useMemo(() => [1, 1, 1, 1], []);

  const plateMat = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: flatVert,
        fragmentShader: coreFrag,
        uniforms: {
          uTime,
          uTurn: uTurnColor,
          uEnergy,
          uSeat: { value: SEAT_COLORS.map((c) => c.clone()) },
          uSeatOn: { value: seatOn },
          uFlash: { value: 0 },
          uHighlight: { value: 0 },
        },
      }),
    [],
  );
  const beamMat = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: beamVert,
        fragmentShader: beamFrag,
        uniforms: { uTime, uTurn: uTurnColor, uIntensity: { value: 1 }, uSpeed: { value: 0.35 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const outerBeamMat = useDisposable(() => {
    const m = beamMat.clone();
    m.uniforms = { uTime, uTurn: uTurnColor, uIntensity: { value: 0.35 }, uSpeed: { value: 0.18 } };
    return m;
  }, [beamMat]);
  const crystalMat = useDisposable(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#05040c',
        metalness: 0.6,
        roughness: 0.15,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 2.2,
        flatShading: true,
      }),
    [],
  );
  const wireMat = useDisposable(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(3, 3, 3), transparent: true, opacity: 0.85, toneMapped: false }),
    [],
  );
  const ringMat = useDisposable(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 2), toneMapped: false }),
    [],
  );

  const geos = useDisposable(() => {
    const plate = new THREE.PlaneGeometry(2.92, 2.92);
    const beam = new THREE.CylinderGeometry(0.32, 0.42, BEAM_HEIGHT, 32, 1, true).translate(0, BEAM_HEIGHT / 2, 0);
    const outer = new THREE.CylinderGeometry(0.75, 1.0, BEAM_HEIGHT * 0.7, 32, 1, true).translate(0, (BEAM_HEIGHT * 0.7) / 2, 0);
    const oct = new THREE.OctahedronGeometry(0.32, 0);
    const wire = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.5, 0));
    const ring = new THREE.TorusGeometry(1, 0.012, 6, 96);
    return { plate, beam, outer, oct, wire, ring, dispose: () => [plate, beam, outer, oct, wire, ring].forEach((g) => g.dispose()) };
  }, []);

  const playDim = useRef(1);
  useFx('finish', () => (flash.current = 1));
  useFx('win', () => (flash.current = 1));
  useFx('hop', (e) => {
    if (e.progress >= 56) flash.current = Math.max(flash.current, 0.6);
  });

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.1);
    const t = state.clock.elapsedTime;
    flash.current = Math.max(0, flash.current - d * 0.9);
    const u = plateMat.uniforms;
    u.uFlash.value = flash.current;

    // seat activity + finish highlight from the store (cheap reads)
    const s = useGame.getState();
    const g = s.game;
    for (let i = 0; i < 4; i++) seatOn[i] = damp(seatOn[i], g ? (g.players[i].active ? 1 : 0) : 1, 3, d);
    const finishLegal =
      !!g && s.screen === 'game' && !s.busy && g.phase === 'move' && g.players[g.current].kind === 'human' && g.legalMoves.some((m) => m.finishes);
    u.uHighlight.value = damp(u.uHighlight.value, finishLegal ? 1 : 0, 6, d);

    const e = uEnergy.value;
    // keep the beam subdued during play so it never washes out tokens behind it
    playDim.current = damp(playDim.current, s.screen === 'game' ? 0.32 : 1, 2, d);
    const pd = playDim.current;
    beamMat.uniforms.uIntensity.value = (0.9 + Math.sin(t * 2.3) * 0.08) * pd + flash.current * 2.5 + e * 1.5;
    outerBeamMat.uniforms.uIntensity.value = 0.3 * pd + flash.current * 1.2 + e * 0.8;
    crystalMat.emissive.copy(uTurnColor.value).multiplyScalar(1.2 + flash.current * 2 + e);

    if (crystal.current) {
      crystal.current.rotation.y += d * (0.6 + e * 2);
      crystal.current.position.y = 2.2 + Math.sin(t * 1.3) * 0.15;
    }
    if (ringA.current) {
      ringA.current.rotation.z += d * 0.8;
      ringA.current.position.y = 0.9 + Math.sin(t * 0.9) * 0.1;
      ringA.current.scale.setScalar(0.62 + flash.current * 0.6);
    }
    if (ringB.current) {
      ringB.current.rotation.z -= d * 0.5;
      ringB.current.position.y = 1.55 + Math.sin(t * 0.7 + 1) * 0.12;
    }
    ringMat.color.copy(uTurnColor.value).multiplyScalar(2.5 + flash.current * 3);
    wireMat.color.copy(uTurnColor.value).multiplyScalar(2.2);
  });

  return (
    <group>
      <mesh geometry={geos.plate} material={plateMat} rotation-x={-Math.PI / 2} position-y={0.008} />
      <mesh geometry={geos.beam} material={beamMat} renderOrder={7} />
      {tier !== 'low' && <mesh geometry={geos.outer} material={outerBeamMat} renderOrder={7} />}
      <mesh ref={ringA} geometry={geos.ring} material={ringMat} rotation-x={Math.PI / 2} scale={0.62} />
      <mesh ref={ringB} geometry={geos.ring} material={ringMat} rotation-x={Math.PI / 2} scale={0.42} />
      <group ref={crystal} position-y={2.2}>
        <mesh geometry={geos.oct} material={crystalMat} scale={[1, 1.5, 1]} />
        <lineSegments geometry={geos.wire} material={wireMat} />
      </group>
    </group>
  );
}
