// Dynamic lighting rig + global uniform driver (time, turn colour, energy).
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { useGame } from '../../store/game';
import type { Seat } from '../../game/types';
import { SEAT_COLORS, damp, turnColor, uEnergy, uTime } from './shared';

/** Which seat colour should tint the world right now. */
function targetSeat(time: number): Seat {
  const s = useGame.getState();
  if (s.screen === 'victory' && s.victorySeat !== null) return s.victorySeat;
  if (s.game && (s.screen === 'game' || s.screen === 'results')) return s.game.current;
  // attract mode: slowly cycle through the factions
  return (Math.floor(time / 6) % 4) as Seat;
}

const tmpColor = new THREE.Color();

export function Lighting() {
  const turnLight = useRef<THREE.PointLight>(null);
  const underLight = useRef<THREE.PointLight>(null);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    uTime.value = t;
    const d = Math.min(dt, 0.1);

    // smooth seat-colour transition on turn change
    tmpColor.copy(SEAT_COLORS[targetSeat(t)]);
    turnColor.lerp(tmpColor, 1 - Math.exp(-3.2 * d));

    const screen = useGame.getState().screen;
    uEnergy.value = damp(uEnergy.value, screen === 'victory' ? 1 : 0, 1.6, d);

    if (turnLight.current) {
      turnLight.current.color.copy(turnColor);
      turnLight.current.intensity = 55 + Math.sin(t * 1.7) * 6 + uEnergy.value * 60;
    }
    if (underLight.current) underLight.current.color.copy(turnColor);
  });

  return (
    <>
      <ambientLight intensity={0.22} color="#5a4dff" />
      <hemisphereLight args={['#3b2a8a', '#05030d', 0.45]} />
      {/* cool key light from above/front */}
      <directionalLight position={[8, 16, 10]} intensity={1.15} color="#cfe8ff" />
      {/* magenta + cyan rims for neon edge separation */}
      <directionalLight position={[-14, 6, -12]} intensity={1.4} color="#ff2bd6" />
      <directionalLight position={[14, 4, -10]} intensity={0.9} color="#00f0ff" />
      {/* turn-coloured key above the board */}
      <pointLight ref={turnLight} position={[0, 6.5, 0]} intensity={55} distance={34} decay={2} />
      {/* glow spilling onto the floor beneath the slab */}
      <pointLight ref={underLight} position={[0, -3.2, 0]} intensity={40} distance={20} decay={2} />

      {/* Procedural neon studio environment for metal reflections — no HDR download. */}
      <Environment resolution={256} frames={1} environmentIntensity={0.85}>
        <color attach="background" args={['#020108']} />
        <Lightformer form="rect" intensity={3} color="#00f0ff" position={[-6, 4, -8]} scale={[10, 1.2, 1]} />
        <Lightformer form="rect" intensity={3} color="#ff2bd6" position={[8, 3, 6]} scale={[10, 1.2, 1]} />
        <Lightformer form="rect" intensity={2} color="#9d4dff" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
        <Lightformer form="ring" intensity={2.5} color="#8ffcff" position={[0, 2, 10]} scale={4} />
        <Lightformer form="rect" intensity={1.2} color="#ffb300" position={[10, -2, -6]} scale={[6, 0.6, 1]} />
      </Environment>
    </>
  );
}
