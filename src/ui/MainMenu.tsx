// Title screen — translucent, left-weighted composition over the attract orbit.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGame } from '../store/game';
import { useUI, quickPlay } from './uiStore';
import { NxButton, Label } from './primitives';
import { SEAT_THEME } from '../core/theme';
import type { Seat } from '../game/types';

function Clock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{t.toTimeString().slice(0, 8)}</>;
}

export function MainMenu() {
  const ref = useRef<HTMLDivElement>(null);
  const goto = useGame((s) => s.goto);
  const setHowTo = useUI((s) => s.setHowTo);
  const setSettings = useUI((s) => s.setSettings);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('[data-logo-line]', { opacity: 0, x: -40, skewX: -12, duration: 0.7, stagger: 0.12 })
        .from('[data-rule]', { scaleX: 0, transformOrigin: 'left center', duration: 0.6 }, '-=0.4')
        .from('[data-tag]', { opacity: 0, y: 8, duration: 0.5 }, '-=0.35')
        .from('[data-anim]', { opacity: 0, x: -24, duration: 0.45, stagger: 0.07, clearProps: 'opacity,transform' }, '-=0.25')
        .from('[data-hud]', { opacity: 0, duration: 0.8, stagger: 0.1 }, '-=0.3');
      // occasional hard glitch jolt on the logotype
      const jolt = () => {
        gsap.timeline()
          .to('[data-logo]', { x: 4, skewX: 8, duration: 0.04 })
          .to('[data-logo]', { x: -3, skewX: -4, duration: 0.04 })
          .to('[data-logo]', { x: 0, skewX: 0, duration: 0.06 });
      };
      const id = setInterval(jolt, 4200);
      return () => clearInterval(id);
    }, ref);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} className="nx-safe absolute inset-0 flex flex-col">
      {/* left atmospheric gradient so text reads over the arena */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#05030d]/90 via-[#05030d]/45 to-transparent sm:w-[70%]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#05030d]/80 to-transparent" />

      {/* top HUD strip */}
      <div data-hud className="relative flex items-center justify-between font-mono text-[10px] tracking-[0.25em] text-white/45">
        <span>
          <span className="text-nx-safe">●</span> GRID ONLINE · SECTOR 07
        </span>
        <span className="hidden sm:inline">
          SYS <Clock />
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col justify-center gap-6 sm:max-w-[560px] sm:pl-[3vw]">
        <div data-logo className="select-none">
          <Label className="mb-3 text-nx-cyan/80" color="rgba(0,240,255,0.8)">
            {'// TACTICAL GRID WARFARE'}
          </Label>
          <h1 className="font-display font-black leading-[0.86] tracking-[0.08em]">
            <span data-logo-line className="nx-glitch nx-flicker block text-[clamp(3rem,11vw,6.6rem)] text-white nx-neon" data-text="NEXUS" style={{ color: '#eafcff' }}>
              NEXUS
            </span>
            <span data-logo-line className="nx-grad-text block text-[clamp(3rem,11vw,6.6rem)]" style={{ letterSpacing: '0.26em' }}>
              LUDO
            </span>
          </h1>
          <div data-rule className="mt-4 h-px w-full max-w-[420px] bg-gradient-to-r from-nx-cyan via-nx-violet to-transparent" />
          <p data-tag className="mt-3 max-w-[420px] text-[15px] font-medium leading-snug text-white/65 sm:text-base">
            Four factions. One core. Deploy your units, outmanoeuvre the grid and seize <span className="text-nx-cyan">NEXUS CONTROL</span>.
          </p>
        </div>

        <nav className="flex w-full max-w-[360px] flex-col gap-2.5" aria-label="Main menu">
          <NxButton dataAnim variant="primary" className="h-14 justify-between text-[0.9rem]" onClick={quickPlay}>
            <span>QUICK PLAY</span>
            <span className="font-mono text-[10px] tracking-[0.1em] opacity-70">1V1 · AI</span>
          </NxButton>
          <NxButton dataAnim className="justify-between" accent="#ff2bd6" onClick={() => goto('setup')}>
            <span>NEW MATCH</span>
            <span aria-hidden className="font-mono opacity-60">›</span>
          </NxButton>
          <NxButton dataAnim className="justify-between" accent="#9d4dff" onClick={() => setHowTo(true)}>
            <span>HOW TO PLAY</span>
            <span aria-hidden className="font-mono opacity-60">?</span>
          </NxButton>
          <NxButton dataAnim className="justify-between" accent="#ffb300" onClick={() => setSettings(true)}>
            <span>SETTINGS</span>
            <span aria-hidden className="font-mono opacity-60">⚙</span>
          </NxButton>
        </nav>
      </div>

      {/* faction roster footer */}
      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {([0, 1, 2, 3] as Seat[]).map((s) => (
            <div key={s} data-hud className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-white/50">
              <span className="h-2 w-2 rotate-45" style={{ background: SEAT_THEME[s].color, boxShadow: `0 0 8px ${SEAT_THEME[s].color}` }} />
              {SEAT_THEME[s].faction}
            </div>
          ))}
        </div>
        <div data-hud className="font-mono text-[10px] tracking-[0.25em] text-white/30">
          BUILD 2087.10 · NX-LUDO
        </div>
      </div>
    </div>
  );
}
