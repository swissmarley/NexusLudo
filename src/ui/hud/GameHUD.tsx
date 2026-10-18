// In-game heads-up display: layout per form factor + keyboard controls.
import { useEffect, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGame } from '../../store/game';
import { useSettings } from '../../store/settings';
import { useView } from '../../store/view';
import type { Seat } from '../../game/types';
import { anyOverlayOpen, useUI } from '../uiStore';
import { useLayout } from '../hooks';
import { PlayerPanel } from './PlayerPanel';
import { ActionDock } from './ActionDock';
import { HintPanel } from './HintPanel';
import { TopBar } from './TopBar';
import { Toasts } from './Toasts';
import { PauseOverlay } from './PauseOverlay';

function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const store = useGame.getState();
      if (store.screen !== 'game' || !store.game) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (anyOverlayOpen()) {
        if (e.key === 'Escape') {
          const ui = useUI.getState();
          ui.setStats(false);
          ui.setSettings(false);
          ui.setHowTo(false);
        }
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'escape') {
        e.preventDefault();
        store.setPaused(!store.paused);
        return;
      }
      if (store.paused) return;
      // Let focused buttons handle their own activation keys.
      const onButton = target?.tagName === 'BUTTON';
      if ((key === ' ' || key === 'enter') && !onButton) {
        e.preventDefault();
        store.rollDice();
        return;
      }
      if (key >= '1' && key <= '4') {
        const g = store.game;
        const id = g.current * 4 + (Number(key) - 1);
        if (g.phase === 'move' && g.legalMoves.some((m) => m.tokenId === id)) store.selectToken(id);
        return;
      }
      if (key === 'h') {
        const s = useSettings.getState();
        s.set({ showHints: !s.showHints });
      } else if (key === 't') {
        const v = useView.getState();
        v.setTopView(!v.topView);
      } else if (key === 'c') {
        useView.getState().resetCamera();
      } else if (key === 's') {
        useUI.getState().setStats(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

const ALL: Seat[] = [0, 1, 2, 3];

export function GameHUD() {
  useHotkeys();
  const layout = useLayout();
  const paused = useGame((s) => s.paused);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      // only animate groups present in the current layout (avoids GSAP 'target not found' warnings)
      const enter = (sel: string, vars: gsap.TweenVars) => {
        if (ref.current?.querySelector(sel)) gsap.from(sel, { opacity: 0, duration: 0.6, ease: 'power3.out', clearProps: 'all', ...vars });
      };
      enter('[data-hud-top]', { y: -30, stagger: 0.06 });
      enter('[data-hud-bottom]', { y: 40, delay: 0.15 });
      enter('[data-hud-left]', { x: -40, stagger: 0.08, delay: 0.1 });
      enter('[data-hud-right]', { x: 40, stagger: 0.08, delay: 0.1 });
    }, ref);
    return () => ctx.revert();
  }, [layout]);

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0">
      {layout === 'desktop' && <DesktopLayout />}
      {layout === 'portrait' && <PortraitLayout />}
      {layout === 'landscape' && <LandscapeLayout />}
      {paused && <PauseOverlay />}
    </div>
  );
}

function DesktopLayout() {
  return (
    <div className="nx-safe absolute inset-0">
      <div className="relative h-full w-full">
        <div data-hud-left className="absolute left-0 top-0">
          <PlayerPanel seat={0} />
        </div>
        <div data-hud-right className="absolute right-0 top-0">
          <PlayerPanel seat={1} align="right" />
        </div>
        <div data-hud-right className="absolute bottom-0 right-0">
          <PlayerPanel seat={2} align="right" />
        </div>
        <div data-hud-left className="absolute bottom-0 left-0">
          <PlayerPanel seat={3} />
        </div>

        <div data-hud-top className="absolute left-1/2 top-0 -translate-x-1/2">
          <TopBar />
        </div>
        <div className="absolute left-1/2 top-[64px] w-[min(440px,40vw)] -translate-x-1/2">
          <Toasts align="center" />
        </div>

        <div data-hud-bottom className="absolute bottom-0 left-1/2 flex w-[min(520px,calc(100%-560px))] min-w-[400px] -translate-x-1/2 flex-col gap-2">
          <HintPanel />
          <ActionDock />
        </div>
      </div>
    </div>
  );
}

function PortraitLayout() {
  return (
    <div className="nx-safe absolute inset-0 flex flex-col">
      <div data-hud-top className="flex items-center justify-end">
        <TopBar compact />
      </div>
      <div data-hud-top className="mt-2 grid grid-cols-4 gap-1.5">
        {ALL.map((s) => (
          <PlayerPanel key={s} seat={s} compact />
        ))}
      </div>
      <div className="mt-2">
        <Toasts align="center" />
      </div>
      <div className="min-h-0 flex-1" />
      <div data-hud-bottom className="flex flex-col gap-2">
        <HintPanel compact />
        <ActionDock compact />
      </div>
    </div>
  );
}

function LandscapeLayout() {
  return (
    <div className="nx-safe absolute inset-0 flex justify-between gap-3">
      <div className="pointer-events-none absolute left-1/2 top-[calc(var(--nx-safe-t)+10px)] z-10 w-[min(360px,40vw)] -translate-x-1/2">
        <Toasts align="center" />
      </div>
      <div className="flex w-[clamp(132px,20vw,190px)] flex-col gap-1.5">
        {ALL.map((s) => (
          <div key={s} data-hud-left>
            <PlayerPanel seat={s} compact />
          </div>
        ))}
      </div>
      <div className="flex w-[clamp(250px,34vw,330px)] flex-col items-end gap-2">
        <div data-hud-right className="flex flex-wrap justify-end">
          <TopBar compact />
        </div>
        <div className="min-h-0 flex-1" />
        <div data-hud-right className="flex w-full flex-col gap-2">
          <HintPanel compact />
          <ActionDock compact />
        </div>
      </div>
    </div>
  );
}
