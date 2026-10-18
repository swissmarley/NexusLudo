// Bottom-centre action dock: roll button, die readout, status, units, power-ups.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import gsap from 'gsap';
import { useGame, selectIsHumanTurn } from '../../store/game';
import { canUsePower } from '../../game/engine';
import { SEAT_THEME, POWER_THEME } from '../../core/theme';
import type { PowerType, Seat } from '../../game/types';
import { DieFace } from '../primitives';
import { sfxClick, sfxHover } from '../uiStore';

interface DockSlice {
  seat: Seat;
  phase: string;
  name: string;
  kind: string;
  mode: string;
  rawDice: number | null;
  dice: number | null;
  boosted: boolean;
  legal: string; // token ids
  items: string;
  usable: string;
  humanTurn: boolean;
  rolling: boolean;
  moving: boolean;
  paused: boolean;
  busy: boolean;
}

function useDock(): DockSlice | null {
  return useGame(
    useShallow((s): DockSlice | null => {
      const g = s.game;
      if (!g) return null;
      const p = g.players[g.current];
      return {
        seat: g.current,
        phase: g.phase,
        name: p.name,
        kind: p.kind,
        mode: g.mode,
        rawDice: g.rawDice,
        dice: g.dice,
        boosted: g.boosted,
        legal: g.legalMoves.map((m) => m.tokenId).join(','),
        items: p.items.join(','),
        usable: p.items.map((it) => (canUsePower(g, it) ? '1' : '0')).join(''),
        humanTurn: selectIsHumanTurn(s) && !s.paused,
        rolling: !!s.dice?.rolling,
        moving: !!s.moving,
        paused: s.paused,
        busy: s.busy,
      };
    }),
  );
}

/** Rapidly cycles faces while the 3D die tumbles. */
function useScramble(active: boolean) {
  const [v, setV] = useState(1);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setV(1 + Math.floor(Math.random() * 6)), 70);
    return () => clearInterval(id);
  }, [active]);
  return v;
}

export function ActionDock({ compact }: { compact?: boolean }) {
  const d = useDock();
  const rollDice = useGame((s) => s.rollDice);
  const selectToken = useGame((s) => s.selectToken);
  const hoverToken = useGame((s) => s.hoverToken);
  const skip = useGame((s) => s.skip);
  const activatePower = useGame((s) => s.activatePower);
  const scramble = useScramble(!!d?.rolling);
  const dieRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const showValue = d?.rolling ? null : (d?.rawDice ?? null);
  useLayoutEffect(() => {
    if (!dieRef.current || showValue === null) return;
    const tw = gsap.fromTo(dieRef.current, { scale: 1.45, rotate: -18 }, { scale: 1, rotate: 0, duration: 0.45, ease: 'back.out(2.6)' });
    return () => {
      tw.kill();
    };
  }, [showValue, d?.seat]);

  const status = d ? statusText(d) : '';
  useLayoutEffect(() => {
    if (!statusRef.current) return;
    const tw = gsap.fromTo(statusRef.current, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
    return () => {
      tw.kill();
    };
  }, [status]);

  if (!d) return null;
  const t = SEAT_THEME[d.seat];
  const canRoll = d.humanTurn && d.phase === 'roll';
  const legal = d.legal ? d.legal.split(',').map(Number) : [];
  const items = (d.items ? d.items.split(',') : []) as PowerType[];
  const canSkip = d.humanTurn && d.phase === 'move' && legal.length === 0;
  const selecting = d.humanTurn && d.phase === 'move' && legal.length > 0;
  const isHumanSeat = d.kind === 'human';
  const vars = { '--seat': t.color, '--stroke': `color-mix(in srgb, ${t.color} 45%, transparent)`, '--bracket': t.color } as CSSProperties;

  const dieSize = compact ? 40 : 52;

  return (
    <div className="pointer-events-auto relative px-3 py-2.5 sm:px-4 sm:py-3" style={vars} role="region" aria-label="Action dock">
      {/* clipped glass lives on its own layer so tooltips can overflow the dock */}
      <div className="nx-panel pointer-events-none absolute inset-0" style={vars} />
      <div className="pointer-events-none absolute inset-x-4 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${t.color}, transparent)` }} />
      <div className={`relative z-10 flex items-center ${compact ? 'gap-2.5' : 'gap-4'}`}>
        {/* die readout */}
        <div className="flex flex-col items-center gap-0.5">
          <div ref={dieRef} className={d.rolling ? 'nx-shake' : ''}>
            <DieFace value={d.rolling ? scramble : showValue} color={t.color} size={dieSize} dim={!d.rolling && showValue === null} />
          </div>
          <div className="h-3 font-mono text-[9px] tracking-[0.15em]" style={{ color: d.boosted ? '#ffb300' : 'rgba(232,246,255,0.45)' }}>
            {d.boosted && d.dice ? `⚡${d.dice}` : showValue ? `ROLL ${showValue}` : '—'}
          </div>
        </div>

        {/* status + controls */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rotate-45" style={{ background: t.color, boxShadow: `0 0 6px ${t.color}` }} />
            <div ref={statusRef} className={`truncate font-display font-bold tracking-[0.16em] ${compact ? 'text-[10px]' : 'text-[12px]'}`} style={{ color: t.glow }} role="status" aria-live="polite">
              {status}
            </div>
          </div>

          {/* unit selector (visible for humans) */}
          {isHumanSeat && (
            <div className="flex items-center gap-1.5" role="group" aria-label="Select unit">
              {[0, 1, 2, 3].map((i) => {
                const id = d.seat * 4 + i;
                const ok = selecting && legal.includes(id);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!ok}
                    aria-label={`Move unit ${i + 1}`}
                    onPointerEnter={(e) => {
                      if (!ok) return;
                      if (e.pointerType === 'mouse') sfxHover();
                      hoverToken(id);
                    }}
                    onPointerLeave={() => hoverToken(null)}
                    onFocus={() => ok && hoverToken(id)}
                    onBlur={() => hoverToken(null)}
                    onClick={() => {
                      sfxClick();
                      hoverToken(null);
                      selectToken(id);
                    }}
                    className={`nx-chamfer nx-focus grid place-items-center font-mono text-xs font-semibold transition-all ${
                      compact ? 'h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11' : 'h-9 w-10'
                    } ${ok ? 'cursor-pointer hover:brightness-150' : 'cursor-default opacity-30'}`}
                    style={
                      {
                        '--c': '6px',
                        color: ok ? '#04050d' : '#e8f6ff',
                        background: ok ? t.color : 'rgba(255,255,255,0.06)',
                        boxShadow: ok ? `0 0 12px ${t.color}` : 'none',
                      } as CSSProperties
                    }
                  >
                    {i + 1}
                  </button>
                );
              })}
              {canSkip && (
                <button
                  type="button"
                  onPointerEnter={(e) => e.pointerType === 'mouse' && sfxHover()}
                  onClick={() => {
                    sfxClick();
                    skip();
                  }}
                  className="nx-chamfer nx-focus ml-1 h-9 cursor-pointer px-3 font-display text-[10px] font-bold tracking-[0.16em] text-nx-amber transition-all hover:brightness-150 pointer-coarse:h-11"
                  style={{ '--c': '6px', background: 'rgba(255,179,0,0.15)', boxShadow: 'inset 0 0 0 1px rgba(255,179,0,0.6)' } as CSSProperties}
                >
                  SKIP ▸
                </button>
              )}
            </div>
          )}

          {/* power-ups */}
          {d.mode === 'nexus' && isHumanSeat && (
            <div className="flex items-center gap-1.5" role="group" aria-label="Power-ups">
              {items.length === 0 && <span className="font-mono text-[9px] tracking-[0.18em] text-white/30">NO POWER-UPS HELD</span>}
              {items.map((it, i) => {
                const th = POWER_THEME[it];
                const ok = d.humanTurn && d.usable[i] === '1';
                return (
                  <span key={`${it}-${i}`} className="nx-tip">
                    <button
                      type="button"
                      disabled={!ok}
                      aria-label={`${th.label}: ${th.desc}`}
                      onPointerEnter={(e) => ok && e.pointerType === 'mouse' && sfxHover()}
                      onClick={() => {
                        sfxClick();
                        activatePower(it);
                      }}
                      className={`nx-chamfer nx-focus flex h-9 items-center gap-1.5 px-2.5 font-display text-[9px] font-bold tracking-[0.12em] transition-all pointer-coarse:h-11 ${
                        ok ? 'cursor-pointer hover:brightness-125' : 'cursor-not-allowed opacity-40'
                      }`}
                      style={
                        {
                          '--c': '6px',
                          color: th.color,
                          background: `color-mix(in srgb, ${th.color} ${ok ? 22 : 8}%, rgba(6,6,18,0.8))`,
                          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${th.color} ${ok ? 80 : 30}%, transparent)${ok ? `, 0 0 12px color-mix(in srgb, ${th.color} 40%, transparent)` : ''}`,
                        } as CSSProperties
                      }
                    >
                      <span className="text-sm leading-none">{th.icon}</span>
                      {!compact && <span>{th.label.split(' ').pop()}</span>}
                    </button>
                    <span className="nx-tip-body nx-panel nx-plain px-3 py-2 text-left" style={{ '--stroke': th.color, '--c': '8px' } as CSSProperties}>
                      <span className="block font-display text-[10px] font-bold tracking-[0.14em]" style={{ color: th.color }}>
                        {th.icon} {th.label}
                      </span>
                      <span className="block text-[13px] leading-snug text-white/80">{th.desc}</span>
                      {!ok && <span className="mt-1 block font-mono text-[9px] tracking-[0.12em] text-white/40">NOT AVAILABLE NOW</span>}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* roll button */}
        <button
          type="button"
          disabled={!canRoll}
          onPointerEnter={(e) => canRoll && e.pointerType === 'mouse' && sfxHover()}
          onClick={() => {
            sfxClick();
            rollDice();
          }}
          aria-label="Roll die (Space)"
          aria-keyshortcuts="Space Enter"
          className={`nx-focus group relative grid shrink-0 cursor-pointer place-items-center transition-all disabled:cursor-not-allowed ${
            compact ? 'h-[64px] w-[64px]' : 'h-[84px] w-[84px]'
          } ${canRoll ? 'nx-roll-ready' : 'opacity-35 grayscale-[0.5]'}`}
          style={vars}
        >
          <span
            className="absolute inset-0 transition-transform group-hover:scale-105 group-active:scale-95"
            style={{
              clipPath: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)',
              background: canRoll ? `linear-gradient(135deg, ${t.glow}, ${t.color} 45%, ${t.deep})` : 'rgba(255,255,255,0.12)',
            }}
          />
          <span
            className="absolute inset-[3px]"
            style={{
              clipPath: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)',
              background: canRoll ? `radial-gradient(circle at 50% 30%, color-mix(in srgb, ${t.color} 55%, #0a0a1a), #070814)` : '#0a0b16',
            }}
          />
          <span className="relative flex flex-col items-center leading-none">
            <span className={`font-display font-black tracking-[0.14em] ${compact ? 'text-[13px]' : 'text-[16px]'}`} style={{ color: canRoll ? '#fff' : 'rgba(232,246,255,0.6)', textShadow: canRoll ? `0 0 10px ${t.color}` : 'none' }}>
              ROLL
            </span>
            {!compact && <span className="mt-1 font-mono text-[8px] tracking-[0.2em] text-white/50">SPACE</span>}
          </span>
        </button>
      </div>
    </div>
  );
}

function statusText(d: DockSlice): string {
  if (d.phase === 'over') return 'MATCH COMPLETE';
  if (d.paused) return 'SYSTEM PAUSED';
  if (d.rolling) return d.kind === 'ai' ? `${d.name} ROLLING…` : 'ROLLING…';
  if (d.moving) return 'UNIT IN TRANSIT…';
  if (d.kind === 'ai') return d.busy ? `${d.name}'S TURN` : `${d.name} · AI THINKING…`;
  if (d.busy) return `${d.name}'S TURN`;
  if (d.phase === 'roll') return `${d.name} · ROLL THE DIE`;
  if (d.phase === 'move') return d.legal ? 'SELECT A UNIT' : 'NO VALID MOVES — USE POWER OR SKIP';
  return `${d.name}'S TURN`;
}
