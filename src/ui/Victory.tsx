// Cinematic victory overlay. Keeps the centre clear for the 3D cinematic first.
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import gsap from 'gsap';
import { useGame } from '../store/game';
import { SEAT_THEME } from '../core/theme';
import { NxButton, Label } from './primitives';
import { useUI } from './uiStore';

export function Victory() {
  const ref = useRef<HTMLDivElement>(null);
  const seat = useGame((s) => s.victorySeat ?? s.game?.winner ?? null);
  const game = useGame((s) => s.game);
  const continueAfterVictory = useGame((s) => s.continueAfterVictory);
  const rematch = useGame((s) => s.rematch);
  const quit = useGame((s) => s.quitToMenu);
  const goto = useGame((s) => s.goto);
  const setStats = useUI((s) => s.setStats);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.from('[data-bar-top]', { yPercent: -100, duration: 0.7, ease: 'expo.out' })
        .from('[data-bar-bottom]', { yPercent: 100, duration: 0.7, ease: 'expo.out' }, '<')
        .from('[data-kicker]', { opacity: 0, letterSpacing: '1.2em', duration: 0.8, ease: 'power3.out' }, '-=0.3')
        // hold ~1.5s for the 3D victory cinematic
        .addLabel('reveal', 1.6)
        .fromTo(
          '[data-winner]',
          { opacity: 0, scaleX: 1.6, filter: 'blur(14px)' },
          { opacity: 1, scaleX: 1, filter: 'blur(0px)', duration: 0.5, ease: 'expo.out' },
          'reveal',
        )
        .to('[data-winner]', { x: -6, skewX: 14, duration: 0.05 }, 'reveal+=0.5')
        .to('[data-winner]', { x: 5, skewX: -8, duration: 0.05 })
        .to('[data-winner]', { x: 0, skewX: 0, duration: 0.08 })
        .from('[data-sub]', { opacity: 0, y: 10, duration: 0.4 }, 'reveal+=0.35')
        .from('[data-rule]', { scaleX: 0, duration: 0.6, ease: 'power3.out' }, 'reveal+=0.3')
        .from('[data-panel]', { y: 80, opacity: 0, duration: 0.6, ease: 'power3.out' }, 'reveal+=0.5')
        .from('[data-anim]', { opacity: 0, y: 10, duration: 0.35, stagger: 0.05, clearProps: 'all' }, 'reveal+=0.8');
    }, ref);
    return () => ctx.revert();
  }, []);

  if (seat === null || !game) return null;
  const t = SEAT_THEME[seat];
  const p = game.players[seat];
  const over = game.phase === 'over';
  const remaining = game.players.filter((x) => x.active && x.rank === null).length;

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 z-30" style={{ '--seat': t.color } as CSSProperties}>
      {/* letterbox */}
      <div data-bar-top className="absolute inset-x-0 top-0 h-[12vh] min-h-[56px] bg-[#020108]/92" style={{ borderBottom: `1px solid color-mix(in srgb, ${t.color} 50%, transparent)` }}>
        <div className="flex h-full items-end justify-center pb-2" style={{ paddingTop: 'var(--nx-safe-t)' }}>
          <span data-kicker className="font-mono text-[10px] tracking-[0.6em] text-white/60 sm:text-xs">
            MATCH CONCLUDED · TURN {game.turn}
          </span>
        </div>
      </div>
      <div data-bar-bottom className="absolute inset-x-0 bottom-0 h-[12vh] min-h-[56px] bg-[#020108]/92" style={{ borderTop: `1px solid color-mix(in srgb, ${t.color} 50%, transparent)` }} />

      {/* winner title — upper third, leaves board centre open */}
      <div className="absolute inset-x-0 top-[calc(12vh+3vh)] flex flex-col items-center px-4 text-center">
        <div
          data-winner
          className="nx-glitch font-display font-black leading-none tracking-[0.12em] text-[clamp(2.4rem,10vw,6.5rem)]"
          data-text={p.name}
          style={{ color: t.glow, textShadow: `0 0 18px ${t.color}, 0 0 60px ${t.color}`, opacity: 0 }}
        >
          {p.name}
        </div>
        <div data-rule className="mt-3 h-px w-[min(520px,80vw)]" style={{ background: `linear-gradient(90deg, transparent, ${t.color}, transparent)` }} />
        <div data-sub className="mt-2 font-display text-[11px] font-bold tracking-[0.5em] text-white sm:text-sm">
          NEXUS CONTROL ACQUIRED
        </div>
        <div data-sub className="mt-1 font-mono text-[10px] tracking-[0.3em]" style={{ color: t.color }}>
          {t.faction}
        </div>
      </div>

      {/* bottom panel */}
      <div className="nx-safe absolute inset-x-0 bottom-0 flex justify-center">
        <div data-panel className="nx-panel pointer-events-auto w-full max-w-[680px] px-4 py-3.5 sm:px-5" style={{ '--stroke': t.color, '--bracket': t.color } as CSSProperties}>
          <div className="grid grid-cols-4 gap-2">
            {[
              ['TURNS', p.stats.turns],
              ['CAPTURES', p.stats.captures],
              ['SIXES', p.stats.sixes],
              ['DISTANCE', p.stats.distance],
            ].map(([k, v]) => (
              <div key={k} data-anim className="text-center">
                <div className="font-mono text-[8px] tracking-[0.2em] text-white/45 sm:text-[9px]">{k}</div>
                <div className="font-mono text-lg font-semibold sm:text-2xl" style={{ color: t.glow }}>
                  {v}
                </div>
              </div>
            ))}
          </div>
          {!over && (
            <Label className="mt-2 text-center">{`${remaining} OPERATORS STILL CONTESTING PLACINGS`}</Label>
          )}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {!over && (
              <NxButton dataAnim variant="primary" accent={t.color} onClick={continueAfterVictory}>
                CONTINUE FOR PLACINGS
              </NxButton>
            )}
            <NxButton dataAnim variant={over ? 'primary' : 'default'} accent="#00f0ff" onClick={() => (over ? goto('results') : setStats(true))}>
              {over ? 'VIEW RESULTS' : 'VIEW STATS'}
            </NxButton>
            <NxButton dataAnim accent="#ff2bd6" onClick={rematch}>
              REMATCH
            </NxButton>
            <NxButton dataAnim accent="#9d4dff" onClick={quit}>
              MAIN MENU
            </NxButton>
          </div>
        </div>
      </div>
    </div>
  );
}
