// OWNER: scene agent. Full-screen R3F canvas hosting the NEXUS arena.
import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { useView, type QualityTier } from '../store/view';
import { Tokens } from './actors/Tokens';
import { Dice } from './actors/Dice';
import { VFXLayer } from './vfx/VFXLayer';
import { Arena } from './world/Arena';
import { Atmosphere } from './world/Atmosphere';
import { Board } from './world/Board';
import { CameraRig } from './world/CameraRig';
import { Lighting } from './world/Lighting';
import { PostFX } from './world/PostFX';

const TIERS: QualityTier[] = ['low', 'medium', 'high'];

/** Flags the scene as ready once a few frames have actually rendered. */
function SceneReady() {
  const frames = useRef(0);
  useFrame(() => {
    if (frames.current > 3) return;
    frames.current++;
    if (frames.current === 3) useView.getState().setSceneReady(true);
  });
  return null;
}

/** Steps the quality tier up/down from measured FPS. */
let lastDecline = -Infinity;
function stepQuality(dir: 1 | -1) {
  // avoid oscillating (each tier change remounts the post stack): after a
  // decline, only try stepping back up once performance has been good for a while
  const now = performance.now();
  if (dir < 0) lastDecline = now;
  else if (now - lastDecline < 20000) return;
  const v = useView.getState();
  const i = TIERS.indexOf(v.quality);
  const next = TIERS[Math.max(0, Math.min(TIERS.length - 1, i + dir))];
  if (next !== v.quality) v.setQuality(next);
}

export function Experience() {
  const quality = useView((s) => s.quality);
  const maxDpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const dpr: [number, number] =
    quality === 'high' ? [1, maxDpr] : quality === 'medium' ? [1, Math.min(maxDpr, 1.5)] : [0.75, 1];

  return (
    <div className="absolute inset-0" style={{ touchAction: 'none' }}>
      <Canvas
        dpr={dpr}
        camera={{ fov: 40, near: 0.1, far: 700, position: [14, 16, 22] }}
        gl={{
          antialias: false, // MSAA handled by the effect composer
          powerPreference: 'high-performance',
          alpha: false,
          stencil: false,
          depth: true,
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.setClearColor('#05030d', 1);
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <PerformanceMonitor
          bounds={(refresh) => (refresh > 90 ? [55, 85] : [45, 58])}
          flipflops={Infinity}
          onDecline={() => stepQuality(-1)}
          onIncline={() => stepQuality(1)}
        >
          <AdaptiveDpr pixelated={false} />
          <Suspense fallback={null}>
            <Lighting />
            <Atmosphere />
            <Arena />
            <Board>
              <Tokens />
              <Dice />
              <VFXLayer />
            </Board>
            <CameraRig />
            <PostFX />
            <SceneReady />
          </Suspense>
        </PerformanceMonitor>
      </Canvas>
    </div>
  );
}
