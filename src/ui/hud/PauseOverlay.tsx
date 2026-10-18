import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGame } from '../../store/game';
import { useUI } from '../uiStore';
import { NxButton, Panel, Label } from '../primitives';

export function PauseOverlay() {
  const ref = useRef<HTMLDivElement>(null);
  const setPaused = useGame((s) => s.setPaused);
  const rematch = useGame((s) => s.rematch);
  const quit = useGame((s) => s.quitToMenu);
  const turn = useGame((s) => s.game?.turn ?? 0);
  const setSettings = useUI((s) => s.setSettings);
  const setHowTo = useUI((s) => s.setHowTo);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(ref.current, { opacity: 0, duration: 0.25 });
      gsap.from('[data-p]', { opacity: 0, scale: 0.95, y: 20, duration: 0.4, ease: 'power3.out' });
      gsap.from('[data-anim]', { opacity: 0, x: -14, duration: 0.35, stagger: 0.05, delay: 0.1, clearProps: 'all' });
    }, ref);
    ref.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} className="nx-safe pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-[#020108]/60 backdrop-blur-[5px]" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="nx-scanlines absolute inset-0 opacity-50" />
      <div data-p className="relative w-full max-w-[380px]">
        <Panel className="px-6 py-6">
          <Label color="#ffb300">{`// SIMULATION HALTED · T${String(turn).padStart(3, '0')}`}</Label>
          <h2 className="nx-glitch nx-flicker mt-1 font-display text-3xl font-black tracking-[0.25em] text-white" data-text="PAUSED">
            PAUSED
          </h2>
          <div className="mt-5 flex flex-col gap-2">
            <NxButton dataAnim variant="primary" onClick={() => setPaused(false)}>
              RESUME
            </NxButton>
            <NxButton dataAnim accent="#ff2bd6" onClick={rematch}>
              RESTART MATCH
            </NxButton>
            <NxButton dataAnim accent="#9d4dff" onClick={() => setSettings(true)}>
              SETTINGS
            </NxButton>
            <NxButton dataAnim accent="#9d4dff" onClick={() => setHowTo(true)}>
              HOW TO PLAY
            </NxButton>
            <NxButton dataAnim accent="#ff3355" onClick={quit}>
              QUIT TO MENU
            </NxButton>
          </div>
          <div className="mt-4 font-mono text-[10px] tracking-[0.2em] text-white/35">ESC · RESUME</div>
        </Panel>
      </div>
    </div>
  );
}
