// Local UI-only state (overlays / drawers). Not shared with the scene.
import { create } from 'zustand';
import { fx } from '../core/fx';
import { useGame } from '../store/game';

export interface UIState {
  settingsOpen: boolean;
  howToOpen: boolean;
  statsOpen: boolean;
  setSettings: (v: boolean) => void;
  setHowTo: (v: boolean) => void;
  setStats: (v: boolean) => void;
}

export const useUI = create<UIState>()((set) => ({
  settingsOpen: false,
  howToOpen: false,
  statsOpen: false,
  setSettings: (settingsOpen) => set({ settingsOpen }),
  setHowTo: (howToOpen) => set({ howToOpen }),
  setStats: (statsOpen) => set({ statsOpen }),
}));

/** True when any modal-like overlay owns the keyboard. */
export function anyOverlayOpen(): boolean {
  const s = useUI.getState();
  return s.settingsOpen || s.howToOpen || s.statsOpen;
}

export const sfxClick = () => fx.emit({ type: 'uiClick' });

let lastHover = 0;
export const sfxHover = () => {
  const now = performance.now();
  if (now - lastHover < 45) return; // avoid machine-gun hover ticks
  lastHover = now;
  fx.emit({ type: 'uiHover' });
};

/** QUICK PLAY: one human (seat 0) vs one AI (seat 2), classic, normal. */
export function quickPlay() {
  useGame.getState().startGame({
    mode: 'classic',
    players: [
      { seat: 0, name: 'OPERATOR', kind: 'human', difficulty: 'normal' },
      { seat: 2, name: 'SAINT-AI', kind: 'ai', difficulty: 'normal' },
    ],
  });
}

