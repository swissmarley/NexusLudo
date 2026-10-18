// Turn-transition banner + big event callouts, driven by the fx bus.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { fx } from '../../core/fx';
import { useGame } from '../../store/game';
import { useSettings } from '../../store/settings';
import { SEAT_THEME, POWER_THEME } from '../../core/theme';
import type { Seat } from '../../game/types';

interface Banner {
  key: number;
  seat: Seat;
  name: string;
  kind: string;
}
interface Callout {
  key: number;
  text: string;
  sub: string;
  color: string;
  color2: string;
  energy?: boolean;
}

let k = 1;

export function Callouts() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [callout, setCallout] = useState<Callout | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const low = useSettings((s) => s.intensity === 'low');

  useEffect(() => {
    const g = () => useGame.getState().game;
    const name = (seat: Seat) => g()?.players[seat].name ?? SEAT_THEME[seat].name;
    const inGame = () => useGame.getState().screen === 'game';
    const show = (c: Omit<Callout, 'key'>) => inGame() && setCallout({ ...c, key: k++ });
    const offs = [
      fx.on('turn', (e) => {
        if (!inGame()) return;
        const p = g()?.players[e.seat];
        setBanner({ key: k++, seat: e.seat, name: p?.name ?? '', kind: p?.kind ?? 'human' });
      }),
      fx.on('six', (e) => {
        if (e.streak >= 3) return; // forfeit callout handles it
        show({
          text: e.streak === 2 ? 'DOUBLE SIX' : 'SIX!',
          sub: e.streak === 2 ? 'BONUS ROLL · ONE MORE OVERLOADS' : 'BONUS ROLL',
          color: SEAT_THEME[e.seat].color,
          color2: '#ffb300',
          energy: true,
        });
      }),
      fx.on('forfeit', (e) => show({ text: 'OVERLOAD', sub: `TRIPLE SIX · ${name(e.seat)} FORFEITS TURN`, color: '#ff3355', color2: '#ff2bd6' })),
      fx.on('capture', (e) => {
        const st = g();
        if (!st) return;
        const by = st.tokens[e.by].seat;
        const victim = st.tokens[e.victim].seat;
        show({ text: 'DEREZZED', sub: `${name(by)} ▸ ${name(victim)}`, color: '#ff2bd6', color2: SEAT_THEME[by].color });
      }),
      fx.on('finish', (e) => show({ text: 'CORE REACHED', sub: `${name(e.seat)} · UNIT SECURED`, color: SEAT_THEME[e.seat].color, color2: '#ffffff' })),
      fx.on('emp', (e) =>
        show({
          text: 'EMP PULSE',
          sub: e.hits.length ? `${e.hits.length} HOSTILE UNIT${e.hits.length > 1 ? 'S' : ''} DISRUPTED` : 'NO TARGETS IN RANGE',
          color: POWER_THEME.emp.color,
          color2: '#00f0ff',
        }),
      ),
      fx.on('usePower', (e) => {
        if (e.power === 'emp') return;
        const t = POWER_THEME[e.power];
        show({ text: t.label, sub: `${name(e.seat)} · ACTIVATED`, color: t.color, color2: '#ffffff' });
      }),
      fx.on('playerDone', (e) => show({ text: `RANK ${e.rank}`, sub: `${name(e.seat)} · ALL UNITS HOME`, color: '#ffb300', color2: SEAT_THEME[e.seat].color })),
    ];
    return () => offs.forEach((o) => o());
  }, []);

  // ── banner sweep (~0.9s) ──
  useLayoutEffect(() => {
    const el = bannerRef.current;
    if (!banner || !el) return;
    const band = el.querySelector('[data-band]');
    const text = el.querySelectorAll('[data-txt]');
    const tl = gsap.timeline({ onComplete: () => setBanner(null) });
    if (low) {
      tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.15 }).to(el, { opacity: 0, duration: 0.25, delay: 0.5 });
    } else {
      tl.set(el, { opacity: 1 })
        .fromTo(band, { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: 0.22, ease: 'power3.out' })
        .fromTo(text, { x: -60, opacity: 0, skewX: -20 }, { x: 0, opacity: 1, skewX: 0, duration: 0.24, stagger: 0.04, ease: 'power3.out' }, '-=0.1')
        .to(text, { x: 60, opacity: 0, duration: 0.18, ease: 'power2.in', stagger: 0.02 }, '+=0.22')
        .to(band, { scaleX: 0, transformOrigin: 'right center', duration: 0.2, ease: 'power3.in' }, '-=0.12');
    }
    return () => {
      tl.kill();
    };
  }, [banner, low]);

  // ── big callout ──
  useLayoutEffect(() => {
    const el = calloutRef.current;
    if (!callout || !el) return;
    const tl = gsap.timeline({ onComplete: () => setCallout(null) });
    const main = el.querySelector('[data-main]');
    const sub = el.querySelector('[data-sub]');
    const lines = el.querySelectorAll('[data-line]');
    if (low) {
      tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.15 }).to(el, { opacity: 0, duration: 0.3, delay: 0.8 });
    } else {
      tl.set(el, { opacity: 1 })
        .fromTo(main, { scale: 2.2, opacity: 0, filter: 'blur(12px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.38, ease: 'expo.out' })
        .fromTo(lines, { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: 'power3.out' }, '-=0.25')
        .fromTo(sub, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.25 }, '-=0.25')
        .to(main, { x: 3, duration: 0.04, yoyo: true, repeat: 3 }, '+=0.1')
        .to(el, { opacity: 0, y: -16, duration: 0.35, ease: 'power2.in' }, '+=0.35');
    }
    return () => {
      tl.kill();
      gsap.set(el, { y: 0 });
    };
  }, [callout, low]);

  return (
    <>
      {banner && (
        <div ref={bannerRef} className="pointer-events-none absolute inset-x-0 top-[17%] z-30 flex justify-center opacity-0 sm:top-[19%]" aria-live="polite">
          <div
            data-band
            className="absolute inset-y-0 left-0 right-0"
            style={{
              background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${SEAT_THEME[banner.seat].color} 35%, rgba(5,3,13,0.7)) 20%, color-mix(in srgb, ${SEAT_THEME[banner.seat].color} 35%, rgba(5,3,13,0.7)) 80%, transparent)`,
              borderTop: `1px solid ${SEAT_THEME[banner.seat].color}`,
              borderBottom: `1px solid ${SEAT_THEME[banner.seat].color}`,
              boxShadow: `0 0 40px color-mix(in srgb, ${SEAT_THEME[banner.seat].color} 35%, transparent)`,
              backdropFilter: 'blur(6px)',
            }}
          >
            <div className="nx-scanlines absolute inset-0 opacity-70" />
          </div>
          <div className="relative flex flex-col items-center px-6 py-2.5 text-center sm:py-3">
            <span data-txt className="font-mono text-[10px] tracking-[0.4em] text-white/70">
              {SEAT_THEME[banner.seat].faction} · {banner.kind === 'ai' ? 'AI OPERATOR' : 'YOUR MOVE'}
            </span>
            <span
              data-txt
              className="font-display text-[clamp(1.4rem,5vw,2.6rem)] font-black tracking-[0.2em]"
              style={{ color: SEAT_THEME[banner.seat].glow, textShadow: `0 0 18px ${SEAT_THEME[banner.seat].color}` }}
            >
              {banner.name}
            </span>
            <span data-txt className="font-display text-[10px] font-bold tracking-[0.5em] text-white/80">
              TURN ACTIVE
            </span>
          </div>
        </div>
      )}

      {callout && (
        <div ref={calloutRef} className="pointer-events-none absolute inset-x-0 top-[34%] z-30 flex flex-col items-center opacity-0" role="status">
          <div className="flex w-full items-center justify-center gap-4 px-4">
            <span data-line className="h-px max-w-[22vw] flex-1 origin-right" style={{ background: `linear-gradient(90deg, transparent, ${callout.color})` }} />
            <span
              data-main
              className={`nx-glitch font-display text-[clamp(2.2rem,9vw,5.2rem)] font-black leading-none tracking-[0.12em] ${callout.energy ? 'italic' : ''}`}
              data-text={callout.text}
              style={{
                color: '#fff',
                textShadow: `0 0 14px ${callout.color}, 0 0 40px ${callout.color}, 0 0 80px ${callout.color2}`,
                WebkitTextStroke: `1px ${callout.color}`,
              }}
            >
              {callout.text}
            </span>
            <span data-line className="h-px max-w-[22vw] flex-1 origin-left" style={{ background: `linear-gradient(270deg, transparent, ${callout.color})` }} />
          </div>
          <span data-sub className="mt-2 px-4 text-center font-mono text-[11px] tracking-[0.3em] sm:text-xs" style={{ color: callout.color2 === '#ffffff' ? callout.color : callout.color2 }}>
            {callout.sub}
          </span>
        </div>
      )}
    </>
  );
}
