// Strategic hint: suggested unit + reason chips. Click to execute.
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import gsap from 'gsap';
import { useGame, selectIsHumanTurn } from '../../store/game';
import { useSettings } from '../../store/settings';
import { SEAT_THEME, POWER_THEME } from '../../core/theme';
import type { PowerType, Seat } from '../../game/types';
import { Chip } from '../primitives';
import { sfxClick, sfxHover } from '../uiStore';

function reasonColor(r: string): string {
  if (r === 'CAPTURE') return '#ff2bd6';
  if (r === 'SAFE ZONE' || r === 'ENTER HOME LANE') return '#3dffa8';
  if (r === 'EVADE') return '#00f0ff';
  if (r === 'EXPOSED') return '#ff3355';
  if (r === 'REACH CORE') return '#ffb300';
  if (r === 'DEPLOY') return '#9d4dff';
  if (r.startsWith('GRAB ')) {
    const p = r.slice(5).toLowerCase() as PowerType;
    return POWER_THEME[p]?.color ?? '#00f0ff';
  }
  return '#8892a6';
}

export function HintPanel({ compact }: { compact?: boolean }) {
  const show = useSettings((s) => s.showHints);
  const h = useGame(
    useShallow((s) => {
      const hint = s.hint;
      if (!hint || !s.game || !selectIsHumanTurn(s) || s.paused || s.game.phase !== 'move') return null;
      const tok = s.game.tokens[hint.move.tokenId];
      return {
        tokenId: hint.move.tokenId,
        seat: tok.seat as Seat,
        index: tok.index,
        from: hint.move.from,
        to: hint.move.to,
        reasons: hint.reasons.join('|'),
        options: s.game.legalMoves.length,
      };
    }),
  );
  const selectToken = useGame((s) => s.selectToken);
  const hoverToken = useGame((s) => s.hoverToken);
  const ref = useRef<HTMLButtonElement>(null);
  const key = h ? `${h.tokenId}:${h.from}:${h.to}` : '';

  useLayoutEffect(() => {
    if (!key || !ref.current) return;
    const tw = gsap.fromTo(ref.current, { opacity: 0, y: 12, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, y: 0, clipPath: 'inset(0 0% 0 0)', duration: 0.45, ease: 'power3.out', clearProps: 'clipPath' });
    return () => {
      tw.kill();
    };
  }, [key]);

  if (!show || !h) return null;
  const t = SEAT_THEME[h.seat];
  const reasons = h.reasons.split('|');
  const fromLabel = h.from < 0 ? 'BASE' : h.from > 50 ? `LANE ${h.from - 50}` : `C${h.from}`;
  const toLabel = h.to >= 56 ? 'CORE' : h.to > 50 ? `LANE ${h.to - 50}` : `C${h.to}`;

  return (
    <button
      ref={ref}
      type="button"
      className="nx-panel nx-focus pointer-events-auto block w-full cursor-pointer px-3 py-2 text-left transition-[filter] hover:brightness-125"
      style={{ '--stroke': 'rgba(61,255,168,0.55)', '--bracket': '#3dffa8', '--c': '10px' } as CSSProperties}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') sfxHover();
        hoverToken(h.tokenId);
      }}
      onPointerLeave={() => hoverToken(null)}
      onFocus={() => hoverToken(h.tokenId)}
      onBlur={() => hoverToken(null)}
      onClick={() => {
        sfxClick();
        hoverToken(null);
        selectToken(h.tokenId);
      }}
      aria-label={`Tactical hint: move unit ${h.index + 1}. ${reasons.join(', ')}. Press to execute.`}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] tracking-[0.25em] text-nx-safe">◈ TACTICAL ADVISOR</span>
        {!compact && <span className="ml-auto font-mono text-[9px] tracking-[0.15em] text-white/35">H · HIDE</span>}
      </div>
      <div className="mt-1 flex items-center gap-2.5">
        <span
          className="nx-chamfer grid h-8 w-8 shrink-0 place-items-center font-display text-sm font-black"
          style={{ '--c': '6px', background: t.color, color: '#04050d', boxShadow: `0 0 12px ${t.color}` } as CSSProperties}
        >
          {h.index + 1}
        </span>
        <div className="min-w-0">
          <div className="font-display text-[11px] font-bold tracking-[0.14em] text-white">
            MOVE UNIT {h.index + 1}
            <span className="ml-2 font-mono text-[10px] font-normal text-white/50">
              {fromLabel} → {toLabel}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {reasons.map((r) => (
              <Chip key={r} color={reasonColor(r)}>
                {r}
              </Chip>
            ))}
          </div>
        </div>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-nx-safe">EXEC ▸</span>
      </div>
    </button>
  );
}
