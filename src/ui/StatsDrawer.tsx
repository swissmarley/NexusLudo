// Slide-in statistics drawer: progress chart + per-player breakdown.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import gsap from 'gsap';
import { useGame, type ProgressSample } from '../store/game';
import { playerProgress } from '../game/engine';
import { SEAT_THEME } from '../core/theme';
import type { GameState, Player, Seat } from '../game/types';
import { useUI } from './uiStore';
import { NxButton, Label } from './primitives';

/** Secondary encoding so seat identity never relies on colour alone. */
const DASH: Record<Seat, string | undefined> = { 0: undefined, 1: '7 4', 2: undefined, 3: '2 3' };
const MARK: Record<Seat, 'circle' | 'square' | 'diamond' | 'triangle'> = { 0: 'circle', 1: 'square', 2: 'diamond', 3: 'triangle' };

function Marker({ seat, x, y, r = 4 }: { seat: Seat; x: number; y: number; r?: number }) {
  const c = SEAT_THEME[seat].color;
  const common = { fill: c, stroke: '#070814', strokeWidth: 2 };
  switch (MARK[seat]) {
    case 'circle':
      return <circle cx={x} cy={y} r={r} {...common} />;
    case 'square':
      return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} {...common} />;
    case 'diamond':
      return <path d={`M${x} ${y - r - 1}L${x + r + 1} ${y}L${x} ${y + r + 1}L${x - r - 1} ${y}Z`} {...common} />;
    case 'triangle':
      return <path d={`M${x} ${y - r - 1}L${x + r + 1} ${y + r}L${x - r - 1} ${y + r}Z`} {...common} />;
  }
}

function leaderSeat(game: GameState): Seat | null {
  if (game.finishOrder.length) return game.finishOrder[0];
  let best: Seat | null = null;
  let bv = -1;
  for (const p of game.players) {
    if (!p.active) continue;
    const v = playerProgress(game, p.seat);
    if (v > bv) {
      bv = v;
      best = p.seat;
    }
  }
  return bv > 0 ? best : null;
}

export function ProgressChart({ history, players, height = 190 }: { history: ProgressSample[]; players: Player[]; height?: number }) {
  const W = 420;
  const H = height;
  const pad = { l: 34, r: 78, t: 12, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const active = players.filter((p) => p.active);
  const n = history.length;
  const x = useCallback((i: number) => pad.l + (n <= 1 ? iw : (i / (n - 1)) * iw), [n, iw, pad.l]);
  const y = (v: number) => pad.t + (1 - v) * ih;
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const paths = useMemo(
    () =>
      active.map((p) => ({
        seat: p.seat,
        d: history.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${(pad.t + (1 - h.values[p.seat]) * ih).toFixed(1)}`).join(''),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, active.map((p) => p.seat).join(), x, ih],
  );

  // direct end labels with simple collision avoidance
  const labels = useMemo(() => {
    if (!n) return [];
    const last = history[n - 1].values;
    const ls = active.map((p) => ({ seat: p.seat, name: p.name, v: last[p.seat], y: pad.t + (1 - last[p.seat]) * ih })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ls.length; i++) if (ls[i].y - ls[i - 1].y < 12) ls[i].y = ls[i - 1].y + 12;
    const overflow = ls.length ? ls[ls.length - 1].y - (H - pad.b) : 0;
    if (overflow > 0) ls.forEach((l) => (l.y -= overflow));
    return ls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, players]);

  const onMove = (e: RPointerEvent) => {
    const svg = svgRef.current;
    if (!svg || n < 1) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = n <= 1 ? 0 : Math.round(((px - pad.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  if (n < 2) {
    return <div className="grid h-[120px] place-items-center font-mono text-[11px] tracking-[0.2em] text-white/40">AWAITING TELEMETRY — MAKE A MOVE</div>;
  }

  const hv = hover !== null ? history[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-none"
        role="img"
        aria-label="Progress over time by player"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={pad.l + iw} y1={y(g)} y2={y(g)} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="rgba(232,246,255,0.45)" fontFamily="JetBrains Mono, monospace">
              {Math.round(g * 100)}%
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 6} fontSize="9" fill="rgba(232,246,255,0.45)" fontFamily="JetBrains Mono, monospace">
          T{history[0].turn}
        </text>
        <text x={pad.l + iw} y={H - 6} textAnchor="end" fontSize="9" fill="rgba(232,246,255,0.45)" fontFamily="JetBrains Mono, monospace">
          T{history[n - 1].turn}
        </text>
        {paths.map((p) => (
          <path
            key={p.seat}
            d={p.d}
            fill="none"
            stroke={SEAT_THEME[p.seat].color}
            strokeWidth={2}
            strokeDasharray={DASH[p.seat]}
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 3px color-mix(in srgb, ${SEAT_THEME[p.seat].color} 60%, transparent))` }}
          />
        ))}
        {labels.map((l) => (
          <g key={l.seat}>
            <Marker seat={l.seat} x={x(n - 1)} y={pad.t + (1 - l.v) * ih} r={3.5} />
            <text x={pad.l + iw + 8} y={l.y + 3} fontSize="9.5" fill="#e8f6ff" fontFamily="Rajdhani, sans-serif" fontWeight={700} letterSpacing="0.06em">
              {l.name.slice(0, 9)}
              <tspan fill="rgba(232,246,255,0.55)" fontFamily="JetBrains Mono, monospace" dx="4">
                {Math.round(l.v * 100)}
              </tspan>
            </text>
          </g>
        ))}
        {hv && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="rgba(232,246,255,0.4)" strokeWidth={1} />
            {active.map((p) => (
              <Marker key={p.seat} seat={p.seat} x={x(hover)} y={y(hv.values[p.seat])} />
            ))}
          </g>
        )}
        {/* larger invisible hit area */}
        <rect x={pad.l} y={0} width={iw} height={H} fill="transparent" />
      </svg>
      {hv && hover !== null && (
        <div
          className="nx-panel nx-plain pointer-events-none absolute top-1 px-2.5 py-1.5"
          style={{ left: `${Math.min(62, (x(hover) / W) * 100)}%`, '--c': '6px' } as CSSProperties}
        >
          <div className="font-mono text-[9px] tracking-[0.2em] text-white/50">TURN {hv.turn}</div>
          {active
            .slice()
            .sort((a, b) => hv.values[b.seat] - hv.values[a.seat])
            .map((p) => (
              <div key={p.seat} className="flex items-center gap-2 text-[12px] leading-tight">
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <Marker seat={p.seat} x={5} y={5} r={3} />
                </svg>
                <span className="font-semibold text-white/90">{p.name}</span>
                <span className="ml-auto pl-2 font-mono text-white/70">{Math.round(hv.values[p.seat] * 100)}%</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function Histogram({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex h-14 items-end gap-[3px]" role="img" aria-label={`Roll distribution: ${data.map((c, i) => `${i + 1}: ${c}`).join(', ')}`}>
      {data.map((c, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-0.5" title={`${i + 1}: ${c}`}>
          <span className="font-mono text-[8px] text-white/45">{c || ''}</span>
          <div
            className="w-full rounded-t-[3px] transition-[height] duration-500"
            style={{ height: `${Math.max(2, (c / max) * 32)}px`, background: c ? color : 'rgba(255,255,255,0.1)', opacity: i === 5 ? 1 : 0.75 }}
          />
          <span className="font-mono text-[9px] text-white/55">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

export function PlayerStatCard({ p, game, leader }: { p: Player; game: GameState; leader: boolean }) {
  const t = SEAT_THEME[p.seat];
  const s = p.stats;
  const prog = playerProgress(game, p.seat);
  const rows: [string, number | string][] = [
    ['ROLLS', s.rolls],
    ['SIXES', s.sixes],
    ['CAPTURES', s.captures],
    ['LOST', s.captured],
    ['DISTANCE', s.distance],
    ['POWER-UPS', s.powerUps],
    ['TURNS', s.turns],
    ['SIX RATE', s.rolls ? `${Math.round((s.sixes / s.rolls) * 100)}%` : '—'],
  ];
  return (
    <div
      data-anim
      className="nx-chamfer relative p-3"
      style={
        {
          '--c': '10px',
          background: `linear-gradient(150deg, color-mix(in srgb, ${t.color} 14%, transparent), rgba(6,6,20,0.6) 55%)`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${t.color} ${leader ? 80 : 30}%, transparent)`,
        } as CSSProperties
      }
    >
      <div className="flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <Marker seat={p.seat} x={6} y={6} r={3.5} />
        </svg>
        <span className="truncate font-display text-[13px] font-black tracking-[0.14em]" style={{ color: t.glow }}>
          {p.name}
        </span>
        <span className="font-mono text-[9px] tracking-[0.18em] text-white/40">{p.kind === 'ai' ? `AI·${p.difficulty.toUpperCase()}` : 'HUMAN'}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {leader && (
            <span className="nx-chamfer px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.14em] text-[#04050d]" style={{ '--c': '4px', background: '#ffb300' } as CSSProperties}>
              ♛ LEADER
            </span>
          )}
          {p.rank && <span className="font-display text-[11px] font-black text-nx-amber">#{p.rank}</span>}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1 flex-1 bg-white/10">
          <div className="h-full" style={{ width: `${prog * 100}%`, background: t.color }} />
        </div>
        <span className="font-mono text-[10px] text-white/70">{Math.round(prog * 100)}%</span>
      </div>
      <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2 border-b border-white/5">
              <dt className="font-mono text-[9px] tracking-[0.14em] text-white/45">{k}</dt>
              <dd className="font-mono text-[12px] font-semibold text-white">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="w-[110px]">
          <div className="mb-1 font-mono text-[8px] tracking-[0.2em] text-white/40">ROLL HISTOGRAM</div>
          <Histogram data={s.rollHistogram} color={t.color} />
        </div>
      </div>
    </div>
  );
}

export function StatsDrawer() {
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const setStats = useUI((s) => s.setStats);
  const game = useGame((s) => s.game);
  const history = useGame((s) => s.history);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(ref.current, { opacity: 0, duration: 0.25 });
      gsap.from(panelRef.current, { xPercent: 100, duration: 0.5, ease: 'expo.out' });
      gsap.from('[data-anim]', { opacity: 0, x: 30, duration: 0.4, stagger: 0.05, delay: 0.15, ease: 'power2.out', clearProps: 'all' });
    }, ref);
    panelRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    return () => ctx.revert();
  }, []);

  const close = () => {
    gsap.to(panelRef.current, { xPercent: 100, duration: 0.3, ease: 'power3.in' });
    gsap.to(ref.current, { opacity: 0, duration: 0.3, onComplete: () => setStats(false) });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || useUI.getState().settingsOpen || useUI.getState().howToOpen) return;
      e.preventDefault();
      e.stopPropagation();
      setStats(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [setStats]);

  const players = game ? game.players.filter((p) => p.active) : [];
  const leader = game ? leaderSeat(game) : null;
  const totals = players.reduce((a, p) => ({ captures: a.captures + p.stats.captures, sixes: a.sixes + p.stats.sixes, rolls: a.rolls + p.stats.rolls }), { captures: 0, sixes: 0, rolls: 0 });

  return (
    <div
      ref={ref}
      className="pointer-events-auto absolute inset-0 z-[45] flex justify-end bg-[#020108]/45"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
      role="dialog"
      aria-modal="true"
      aria-label="Match statistics"
    >
      <div
        ref={panelRef}
        className="nx-panel nx-plain flex h-full w-[min(480px,100vw)] flex-col"
        style={{ '--c': '0px', paddingTop: 'var(--nx-safe-t)', paddingBottom: 'var(--nx-safe-b)', paddingRight: 'var(--nx-safe-r)' } as CSSProperties}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex-1">
            <Label color="#00f0ff">{`// TELEMETRY · TURN ${game?.turn ?? 0}`}</Label>
            <h2 className="nx-glitch font-display text-lg font-black tracking-[0.2em]" data-text="MATCH STATS">
              MATCH STATS
            </h2>
          </div>
          <NxButton size="icon" variant="ghost" onClick={close} ariaLabel="Close statistics">
            ✕
          </NxButton>
        </div>
        {!game ? (
          <div className="p-6 font-mono text-xs text-white/50">NO ACTIVE MATCH</div>
        ) : (
          <div className="nx-scroll min-h-0 flex-1 space-y-4 px-4 py-4">
            <div data-anim className="grid grid-cols-3 gap-2">
              {[
                ['TOTAL ROLLS', totals.rolls, '#00f0ff'],
                ['SIXES', totals.sixes, '#ffb300'],
                ['CAPTURES', totals.captures, '#ff2bd6'],
              ].map(([k, v, c]) => (
                <div key={k as string} className="nx-chamfer bg-white/[0.04] px-3 py-2" style={{ '--c': '7px', boxShadow: `inset 2px 0 0 ${c}` } as CSSProperties}>
                  <div className="font-mono text-[8px] tracking-[0.2em] text-white/45">{k}</div>
                  <div className="font-mono text-xl font-semibold text-white">{v}</div>
                </div>
              ))}
            </div>

            <section data-anim>
              <Label className="mb-1.5">{'// PROGRESS OVER TIME'}</Label>
              <div className="nx-chamfer bg-black/30 p-2" style={{ '--c': '8px' } as CSSProperties}>
                <ProgressChart history={history} players={game.players} />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {players.map((p) => (
                  <span key={p.seat} className="flex items-center gap-1.5 text-[12px] font-semibold text-white/80">
                    <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden>
                      <line x1="0" x2="22" y1="5" y2="5" stroke={SEAT_THEME[p.seat].color} strokeWidth="2" strokeDasharray={DASH[p.seat]} />
                      <Marker seat={p.seat} x={11} y={5} r={3} />
                    </svg>
                    {p.name}
                  </span>
                ))}
              </div>
            </section>

            <section className="space-y-2.5">
              <Label>{'// OPERATOR BREAKDOWN'}</Label>
              {players.map((p) => (
                <PlayerStatCard key={p.seat} p={p} game={game} leader={leader === p.seat} />
              ))}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
