// Presentation-only view state shared between UI and 3D scene.
import { create } from 'zustand';

export type QualityTier = 'low' | 'medium' | 'high';

export interface ViewState {
  /** Increment to request the camera rig to reset to its default framing. */
  cameraResetNonce: number;
  /** Top-down tactical view toggle. */
  topView: boolean;
  /** Runtime-measured GPU quality tier (scene adapts DPR/effects). */
  quality: QualityTier;
  /** True while the WebGL scene is still compiling / loading. */
  sceneReady: boolean;
  resetCamera: () => void;
  setTopView: (v: boolean) => void;
  setQuality: (q: QualityTier) => void;
  setSceneReady: (v: boolean) => void;
}

export const useView = create<ViewState>()((set) => ({
  cameraResetNonce: 0,
  topView: false,
  quality: 'high',
  sceneReady: false,
  resetCamera: () => set((s) => ({ cameraResetNonce: s.cameraResetNonce + 1, topView: false })),
  setTopView: (topView) => set({ topView }),
  setQuality: (quality) => set({ quality }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
}));
