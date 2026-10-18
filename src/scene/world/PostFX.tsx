// Post-processing stack: HDR bloom (neon-only threshold) → ACES tone mapping →
// chromatic aberration (spikes on impacts) → vignette → film grain / scanlines.
// Budget scales with settings.intensity and the runtime quality tier.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Bloom, ChromaticAberration, EffectComposer, Noise, SMAA, Scanline, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode, type BloomEffect, type ChromaticAberrationEffect } from 'postprocessing';
import * as THREE from 'three';
import { uEnergy, useBudget, useFx } from './shared';

export function PostFX() {
  const { tier } = useBudget();
  const bloom = useRef<BloomEffect>(null);
  const ca = useRef<ChromaticAberrationEffect>(null);
  const impact = useRef(0);

  useFx('capture', () => (impact.current = 1));
  useFx('emp', () => (impact.current = 1.3));
  useFx('win', () => (impact.current = 0.8));
  useFx('six', () => (impact.current = Math.max(impact.current, 0.35)));

  const baseBloom = tier === 'high' ? 1.1 : tier === 'medium' ? 0.95 : 0.8;

  useFrame((_, dt) => {
    impact.current = Math.max(0, impact.current - Math.min(dt, 0.1) * 2.2);
    if (bloom.current) bloom.current.intensity = baseBloom + uEnergy.value * 0.5 + impact.current * 0.6;
    if (ca.current) {
      const k = 0.0007 + impact.current * 0.006;
      ca.current.offset.set(k, k * 0.6);
    }
  });

  return (
    // NOTE: composer MSAA (multisampled half-float targets) renders black/frozen on
    // ANGLE-Metal (Chrome on macOS) — use SMAA instead.
    <EffectComposer multisampling={0} frameBufferType={THREE.HalfFloatType}>
      <Bloom
        ref={bloom}
        mipmapBlur
        luminanceThreshold={1.0}
        luminanceSmoothing={0.2}
        intensity={baseBloom}
        radius={tier === 'low' ? 0.6 : 0.78}
        levels={tier === 'low' ? 5 : 8}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {tier !== 'low' ? <ChromaticAberration ref={ca} radialModulation modulationOffset={0.3} /> : <></>}
      <Vignette offset={0.28} darkness={0.78} />
      {tier !== 'low' ? <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.35} /> : <></>}
      {tier !== 'low' ? <SMAA /> : <></>}
      {tier === 'high' ? <Scanline density={1.35} blendFunction={BlendFunction.OVERLAY} opacity={0.06} /> : <></>}
    </EffectComposer>
  );
}
