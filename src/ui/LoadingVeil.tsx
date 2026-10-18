// Boot sequence veil shown while the WebGL scene compiles.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useView } from '../store/view';

const LINES = [
  'NEXUS//OS v7.3.1 — COLD BOOT',
  'MOUNTING HOLOGRID SUBSTRATE ........ OK',
  'CALIBRATING QUANTUM DICE ENGINE .... OK',
  'SYNCING FACTION REGISTRY [4/4] ..... OK',
  'COMPILING PHOTON SHADERS ...........',
  'ESTABLISHING NEURAL LINK ...........',
];

/** Hard cap so a missing `setSceneReady` never blocks the UI forever. */
const FAILSAFE_MS = 9000;

export function LoadingVeil() {
  const ready = useView((s) => s.sceneReady);
  const [gone, setGone] = useState(false);
  const [failsafe, setFailsafe] = useState(false);
  const [shown, setShown] = useState(0);
  const [pct, setPct] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setFailsafe(true), FAILSAFE_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (shown >= LINES.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), 170 + Math.random() * 160);
    return () => clearTimeout(t);
  }, [shown]);

  useEffect(() => {
    const id = setInterval(() => setPct((p) => (ready ? 100 : Math.min(94, p + Math.random() * 7))), 90);
    return () => clearInterval(id);
  }, [ready]);

  const done = ready || failsafe;

  useLayoutEffect(() => {
    if (!done || !ref.current) return;
    setPct(100);
    const tl = gsap.timeline({ delay: 0.35, onComplete: () => setGone(true) });
    tl.to(ref.current.querySelector('[data-core]'), { scale: 1.08, opacity: 0, duration: 0.45, ease: 'power2.in' })
      .to(ref.current, { opacity: 0, duration: 0.6, ease: 'power2.out' }, '-=0.15');
    return () => {
      tl.kill();
    };
  }, [done]);

  if (gone) return null;

  return (
    <div ref={ref} className="pointer-events-auto absolute inset-0 z-[100] flex items-center justify-center bg-[#05030d]" aria-busy={!done} aria-live="polite">
      <div className="nx-scanlines absolute inset-0 opacity-60" />
      <div className="nx-scanbar absolute inset-x-0 top-0" />
      <div data-core className="relative w-[min(88vw,520px)] px-2">
        <div className="mb-6 flex items-center gap-4">
          <svg width="54" height="54" viewBox="0 0 54 54" className="nx-spin-slow shrink-0" aria-hidden>
            <rect x="12" y="12" width="30" height="30" transform="rotate(45 27 27)" fill="none" stroke="#00f0ff" strokeWidth="1.5" />
            <rect x="18" y="18" width="18" height="18" transform="rotate(45 27 27)" fill="none" stroke="#ff2bd6" strokeWidth="1" opacity="0.8" />
            <circle cx="27" cy="27" r="3" fill="#e8f6ff" />
          </svg>
          <div>
            <div className="nx-glitch font-display text-2xl font-black tracking-[0.3em] text-white sm:text-3xl" data-text="NEXUS LUDO">
              NEXUS LUDO
            </div>
            <div className="font-mono text-[10px] tracking-[0.35em] text-nx-cyan/80">INITIALISING TACTICAL GRID</div>
          </div>
        </div>
        <div className="min-h-[130px] font-mono text-[11px] leading-6 text-white/70 sm:text-xs">
          {LINES.slice(0, shown).map((l, i) => (
            <div key={i} className="truncate">
              <span className="text-nx-magenta">&gt;</span> {l}
              {i === shown - 1 && <span className="nx-blink ml-1 inline-block h-3 w-2 translate-y-[2px] bg-nx-cyan" />}
            </div>
          ))}
        </div>
        <div className="mt-4 h-[3px] w-full bg-white/10">
          <div className="h-full bg-gradient-to-r from-nx-cyan via-nx-violet to-nx-magenta transition-[width] duration-200" style={{ width: `${pct}%`, boxShadow: '0 0 12px #00f0ff' }} />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] tracking-[0.2em] text-white/45">
          <span>{done ? 'LINK ESTABLISHED' : 'LOADING'}</span>
          <span>{Math.round(pct).toString().padStart(3, '0')}%</span>
        </div>
      </div>
    </div>
  );
}
