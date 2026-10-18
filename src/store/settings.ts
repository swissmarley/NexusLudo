import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AnimationIntensity = 'low' | 'medium' | 'high';
export type CameraMode = 'auto' | 'free';

export interface SettingsState {
  /** Visual effect budget: particle counts, post-processing, trails. */
  intensity: AnimationIntensity;
  /** Gameplay animation speed multiplier (0.5 … 2.5). */
  speed: number;
  masterVolume: number; // 0..1
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  muted: boolean;
  showHints: boolean;
  autoMoveSingle: boolean;
  cameraMode: CameraMode;
  screenShake: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      intensity: 'high',
      speed: 1,
      masterVolume: 0.8,
      musicVolume: 0.45,
      sfxVolume: 0.9,
      muted: false,
      showHints: true,
      autoMoveSingle: true,
      cameraMode: 'auto',
      screenShake: true,
      set: (patch) => set(patch),
    }),
    { name: 'nexus-ludo-settings', version: 1 },
  ),
);

/** Particle multiplier derived from intensity. */
export function intensityScale(i: AnimationIntensity): number {
  return i === 'low' ? 0.3 : i === 'medium' ? 0.65 : 1;
}
