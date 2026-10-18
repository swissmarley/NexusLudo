// Final results: podium + ranking table + progress chart.
import { useRef, type CSSProperties } from 'react';
import { useGame } from '../store/game';
import { playerProgress } from '../game/engine';
import { SEAT_THEME } from '../core/theme';
import type { Player } from '../game/types';
import { NxButton, Panel, Label } from './primitives';
import { useEntrance } from './hooks';
import { ProgressChart } from './StatsDrawer';
import { useUI } from './uiStore';

const ORD = ['1ST', '2ND', '3RD', '4TH'];

export function Results() {
  const ref = useRef<HTMLDivElement>(null);
  const game = useGame((s) => s.game);
  const history = useGame((s) => s.history);
  const rematch = useGame((s) => s.rematch);
  const goto = useGame((s) => s.goto);
  const quit = useGame((s) => s.quitToMenu);
  const setStats = useUI((s) => s.setStats);
  useEntrance(ref, { y: 20, stagger: 0.07 });

  if (!game) return null;
  const ranked: Player[] = game.finishOrder.map((s) => game.players[s]);
  const rest = game.players
    .filter((p) => p.active && !game.finishOrder.includes(p.seat))
    .sort((a, b) => playerProgress(game, b.seat) - playerProgress(game, a.seat));
  const order = [...ranked, ...rest];
  // podium visual order: 2nd, 1st, 3rd
  const podium = [order[1], order[0], order[2]].filter(Boolean) as Player[];
  const heights: Record<number, string> = { 0: 'h-28 sm:h-36', 1: 'h-20 sm:h-24', 2: 'h-14 sm:h-16' };

  return (
    <div ref={ref} className="nx-safe pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-none absolute inset-0 bg-[#05030d]/60" />
      <Panel className="pointer-events-auto relative flex max-h-full w-full max-w-[960px] flex-col">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
          <div className="flex-1">
            <Label color="#ffb300">{`// FINAL STANDINGS · ${game.mode.toUpperCase()} · ${game.turn} TURNS`}</Label>
            <h2 className="nx-glitch font-display text-xl font-black tracking-[0.22em] sm:text-2xl" data-text="RESULTS">
              RESULTS
            </h2>
          </div>
          <NxButton size="sm" variant="ghost" onClick={() => setStats(true)}>
            ▤ STATS
          </NxButton>
        </div>

        <div className="nx-scroll min-h-0 flex-1 px-4 py-4 sm:px-6">
          {/* podium */}
          <div className="flex items-end justify-center gap-2 sm:gap-4">
            {podium.map((p) => {
              const place = order.indexOf(p);
              const t = SEAT_THEME[p.seat];
              return (
                <div key={p.seat} data-anim className="flex w-[30%] max-w-[200px] flex-col items-center">
                  {place === 0 && <div className="mb-1 text-xl text-nx-amber nx-neon">♛</div>}
                  <div className="truncate text-center font-display text-[12px] font-black tracking-[0.12em] sm:text-sm" style={{ color: t.glow, maxWidth: '100%' }}>
                    {p.name}
                  </div>
                  <div className="mb-1.5 font-mono text-[9px] tracking-[0.18em] text-white/45">{t.faction}</div>
                  <div
                    className={`nx-chamfer flex w-full flex-col items-center justify-start pt-2 ${heights[place]}`}
                    style={
                      {
                        '--c': '10px',
                        background: `linear-gradient(180deg, color-mix(in srgb, ${t.color} 45%, transparent), color-mix(in srgb, ${t.color} 6%, transparent))`,
                        boxShadow: `inset 0 2px 0 ${t.color}, 0 0 30px color-mix(in srgb, ${t.color} 25%, transparent)`,
                      } as CSSProperties
                    }
                  >
                    <span className="font-display text-2xl font-black text-white sm:text-3xl" style={{ textShadow: `0 0 14px ${t.color}` }}>
                      {place + 1}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* table */}
          <div data-anim className="mt-5 overflow-x-auto" style={{ touchAction: 'pan-x pan-y' }}>
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="font-mono text-[9px] tracking-[0.18em] text-white/45">
                  {['RANK', 'OPERATOR', 'PROGRESS', 'CAPTURES', 'LOST', 'SIXES', 'DISTANCE', 'POWER'].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.map((p, i) => {
                  const t = SEAT_THEME[p.seat];
                  return (
                    <tr key={p.seat} className="border-t border-white/8 text-[14px]" style={{ background: i === 0 ? `color-mix(in srgb, ${t.color} 8%, transparent)` : undefined }}>
                      <td className="px-2 py-2 font-display text-[11px] font-black" style={{ color: p.rank ? '#ffb300' : 'rgba(232,246,255,0.5)' }}>
                        {p.rank ? ORD[p.rank - 1] : `—`}
                      </td>
                      <td className="px-2 py-2">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rotate-45" style={{ background: t.color }} />
                          <span className="font-semibold text-white">{p.name}</span>
                          <span className="font-mono text-[9px] text-white/40">{p.kind === 'ai' ? 'AI' : 'HU'}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2 font-mono text-[12px] text-white/80">{Math.round(playerProgress(game, p.seat) * 100)}%</td>
                      <td className="px-2 py-2 font-mono text-[12px] text-white/80">{p.stats.captures}</td>
                      <td className="px-2 py-2 font-mono text-[12px] text-white/80">{p.stats.captured}</td>
                      <td className="px-2 py-2 font-mono text-[12px] text-white/80">{p.stats.sixes}</td>
                      <td className="px-2 py-2 font-mono text-[12px] text-white/80">{p.stats.distance}</td>
                      <td className="px-2 py-2 font-mono text-[12px] text-white/80">{p.stats.powerUps}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div data-anim className="mt-5">
            <Label className="mb-1.5">{'// MATCH PROGRESSION'}</Label>
            <div className="nx-chamfer bg-black/30 p-2" style={{ '--c': '8px' } as CSSProperties}>
              <ProgressChart history={history} players={game.players} height={170} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 px-4 py-3 sm:px-6">
          <NxButton accent="#9d4dff" onClick={quit}>
            MENU
          </NxButton>
          <NxButton accent="#ff2bd6" onClick={() => goto('setup')}>
            NEW MATCH
          </NxButton>
          <NxButton variant="primary" onClick={rematch}>
            REMATCH
          </NxButton>
        </div>
      </Panel>
    </div>
  );
}
