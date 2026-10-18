// Per-seat status panel. Subscribes only to that seat's slice.
import { memo, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import gsap from 'gsap';
import { useGame } from '../../store/game';
import { playerProgress } from '../../game/engine';
import { SEAT_THEME, POWER_THEME } from '../../core/theme';
import type { PowerType, Seat } from '../../game/types';
import { FINISH_PROGRESS, LAST_TRACK_PROGRESS } from '../../game/types';

type PipState = 'base' | 'track' | 'home' | 'done';
const pipState = (p: number): PipState => (p < 0 ? 'base' : p >= FINISH_PROGRESS ? 'done' : p > LAST_TRACK_PROGRESS ? 'home' : 'track');

interface Slice {
  name: string;
  kind: 'human' | 'ai';
  difficulty: string;
  rank: number | null;
  /** Encoded as strings so shallow equality holds between unrelated store updates. */
  items: string;
  progress: number;
  tokens: string;
  shields: string;
  isCurrent: boolean;
  thinking: boolean;
  captures: number;
}

function usePlayerSlice(seat: Seat): Slice | null {
  return useGame(
    useShallow((s): Slice | null => {
      const g = s.game;
      if (!g || !g.players[seat].active) return null;
      const p = g.players[seat];
      const ts = g.tokens.slice(seat * 4, seat * 4 + 4);
      const isCurrent = g.current === seat && g.phase !== 'over';
      return {
        name: p.name,
        kind: p.kind,
        difficulty: p.difficulty,
        rank: p.rank,
        items: p.items.join(','),
        progress: playerProgress(g, seat),
        tokens: ts.map((t) => t.progress).join(','),
        shields: ts.map((t) => t.shield).join(','),
        isCurrent,
        thinking: isCurrent && p.kind === 'ai' && !s.dice?.rolling && !s.moving,
        captures: p.stats.captures,
      };
    }),
  );
}

function decode(d: Slice) {
  return {
    items: (d.items ? d.items.split(',') : []) as PowerType[],
    tokens: d.tokens.split(',').map(Number),
    shields: d.shields.split(',').map(Number),
  };
}

function Pip({ state, shield, color, size }: { state: PipState; shield: boolean; color: string; size: number }) {
  const style: CSSProperties =
    state === 'done'
      ? { background: color, boxShadow: `0 0 8px ${color}` }
      : state === 'home'
        ? { background: `color-mix(in srgb, ${color} 55%, transparent)`, outline: `1px solid ${color}` }
        : state === 'track'
          ? { background: `linear-gradient(0deg, ${color} 50%, transparent 50%)`, outline: `1px solid ${color}` }
          : { background: 'transparent', outline: `1px solid color-mix(in srgb, ${color} 45%, transparent)` };
  return (
    <span className="relative inline-block rotate-45" style={{ width: size, height: size, ...style }} title={state.toUpperCase()}>
      {shield && <span className="absolute -inset-[3px] rounded-full" style={{ boxShadow: '0 0 0 1px #3dffa8, 0 0 6px #3dffa8' }} />}
    </span>
  );
}

const ORDINAL = ['', '1ST', '2ND', '3RD', '4TH'];

export const PlayerPanel = memo(function PlayerPanel({ seat, compact, align = 'left' }: { seat: Seat; compact?: boolean; align?: 'left' | 'right' }) {
  const raw = usePlayerSlice(seat);
  const d = raw ? { ...raw, ...decode(raw) } : null;
  const ref = useRef<HTMLDivElement>(null);
  const isCurrent = d?.isCurrent ?? false;

  useLayoutEffect(() => {
    if (!ref.current || !isCurrent) return;
    const tw = gsap.fromTo(ref.current, { scale: 0.96 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
    return () => {
      tw.kill();
    };
  }, [isCurrent]);

  if (!d) return null;
  const t = SEAT_THEME[seat];
  const vars = {
    '--seat': t.color,
    '--stroke': isCurrent ? t.color : `color-mix(in srgb, ${t.color} 35%, transparent)`,
    '--bracket': t.color,
    '--c': compact ? '8px' : '12px',
  } as CSSProperties;
  const counts = { base: 0, track: 0, home: 0, done: 0 } as Record<PipState, number>;
  d.tokens.forEach((p) => counts[pipState(p)]++);
  const right = align === 'right';

  if (compact) {
    return (
      <div
        ref={ref}
        className={`nx-panel nx-plain pointer-events-auto min-w-0 px-2 py-1.5 transition-opacity ${isCurrent ? 'nx-pulse-glow' : 'opacity-80'}`}
        style={vars}
        aria-label={`${d.name}, ${t.faction}, ${Math.round(d.progress * 100)} percent${isCurrent ? ', active turn' : ''}`}
      >
        {isCurrent && <div className="nx-active-ring" />}
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rotate-45" style={{ background: t.color, boxShadow: isCurrent ? `0 0 8px ${t.color}` : 'none' }} />
          <span className="truncate font-display text-[10px] font-bold tracking-[0.1em]" style={{ color: isCurrent ? t.glow : '#e8f6ff' }}>
            {d.name}
          </span>
          {d.rank ? (
            <span className="ml-auto font-mono text-[9px] text-nx-amber">{ORDINAL[d.rank]}</span>
          ) : (
            <span className="ml-auto font-mono text-[9px] text-white/45">{d.kind === 'ai' ? 'AI' : 'HU'}</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <div className="flex gap-[5px] pl-[2px]">
            {d.tokens.map((p, i) => (
              <Pip key={i} state={pipState(p)} shield={d.shields[i] > 0} color={t.color} size={6} />
            ))}
          </div>
          {d.items.length > 0 && (
            <span className="ml-auto flex gap-0.5 text-[10px] leading-none">
              {d.items.map((it, i) => (
                <span key={i} style={{ color: POWER_THEME[it].color }} title={POWER_THEME[it].label}>
                  {POWER_THEME[it].icon}
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="mt-1 h-[2px] w-full bg-white/10">
          <div className="h-full transition-[width] duration-500" style={{ width: `${d.progress * 100}%`, background: t.color }} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`nx-panel pointer-events-auto w-[248px] px-3.5 py-3 transition-[opacity,filter] duration-300 ${isCurrent ? 'nx-pulse-glow' : 'opacity-75 saturate-[0.8]'}`}
      style={{ ...vars, transformOrigin: right ? 'right center' : 'left center' }}
      aria-label={`${d.name}, ${t.faction}, ${Math.round(d.progress * 100)} percent${isCurrent ? ', active turn' : ''}`}
    >
      {isCurrent && <div className="nx-active-ring" />}
      <div className="absolute inset-y-0 w-[3px]" style={{ [right ? 'right' : 'left']: 0, background: t.color, boxShadow: `0 0 12px ${t.color}` }} />

      <div className={`flex items-start gap-2 ${right ? 'flex-row-reverse text-right' : ''}`}>
        <div className="min-w-0 flex-1">
          <div className={`flex items-center gap-1.5 ${right ? 'justify-end' : ''}`}>
            <span className="font-mono text-[9px] tracking-[0.22em] text-white/45">{t.faction}</span>
          </div>
          <div className="truncate font-display text-[15px] font-black tracking-[0.12em]" style={{ color: isCurrent ? t.glow : '#e8f6ff', textShadow: isCurrent ? `0 0 12px ${t.color}` : 'none' }}>
            {d.name}
          </div>
        </div>
        <span
          className="nx-chamfer shrink-0 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.12em]"
          style={{ '--c': '4px', background: d.kind === 'ai' ? 'rgba(157,77,255,0.25)' : 'rgba(0,240,255,0.18)', color: d.kind === 'ai' ? '#cfa8ff' : '#8ffcff' } as CSSProperties}
        >
          {d.kind === 'ai' ? `AI·${d.difficulty.slice(0, 3).toUpperCase()}` : 'HUMAN'}
        </span>
      </div>

      <div className={`mt-2 flex items-center gap-3 ${right ? 'flex-row-reverse' : ''}`}>
        <div className="flex gap-[9px] px-1">
          {d.tokens.map((p, i) => (
            <Pip key={i} state={pipState(p)} shield={d.shields[i] > 0} color={t.color} size={9} />
          ))}
        </div>
        <div className={`flex-1 font-mono text-[10px] text-white/55 ${right ? 'text-left' : 'text-right'}`}>
          <span title="In base">B{counts.base}</span> · <span title="On track">T{counts.track}</span> · <span title="Home lane">H{counts.home}</span> ·{' '}
          <span style={{ color: t.color }} title="In core">
            ★{counts.done}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="relative h-[4px] flex-1 overflow-hidden bg-white/10">
          <div
            className="h-full transition-[width] duration-700 ease-out"
            style={{ width: `${d.progress * 100}%`, background: `linear-gradient(90deg, ${t.deep}, ${t.color})`, boxShadow: `0 0 8px ${t.color}` }}
          />
        </div>
        <span className="w-9 text-right font-mono text-[10px]" style={{ color: t.glow }}>
          {Math.round(d.progress * 100)}%
        </span>
      </div>

      <div className={`mt-2 flex min-h-[18px] items-center gap-1.5 ${right ? 'flex-row-reverse' : ''}`}>
        {d.rank ? (
          <span className="font-display text-[11px] font-black tracking-[0.18em] text-nx-amber" style={{ textShadow: '0 0 10px #ffb300' }}>
            ◆ RANK {ORDINAL[d.rank]}
          </span>
        ) : isCurrent ? (
          <span className="font-mono text-[10px] tracking-[0.2em]" style={{ color: t.color }}>
            {d.thinking ? <span className="nx-dots">COMPUTING</span> : <span className="nx-blink">▶ ACTIVE</span>}
          </span>
        ) : (
          <span className="font-mono text-[10px] tracking-[0.2em] text-white/30">STANDBY</span>
        )}
        <span className={`flex gap-1 ${right ? 'mr-auto' : 'ml-auto'}`}>
          {d.items.map((it, i) => (
            <span
              key={i}
              className="nx-chamfer grid h-[18px] w-[22px] place-items-center text-[11px]"
              style={{ '--c': '4px', color: POWER_THEME[it].color, background: `color-mix(in srgb, ${POWER_THEME[it].color} 18%, transparent)` } as CSSProperties}
              title={POWER_THEME[it].label}
            >
              {POWER_THEME[it].icon}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
});
