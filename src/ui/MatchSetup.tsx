// Match configuration: mode, seats, difficulty, callsigns, presets.
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useGame } from '../store/game';
import { SEAT_THEME, POWER_THEME } from '../core/theme';
import type { AIDifficulty, GameConfigPlayer, GameMode, PowerType, Seat } from '../game/types';
import { NxButton, Panel, Label, Segmented } from './primitives';
import { useEntrance } from './hooks';
import { sfxClick, sfxHover } from './uiStore';

type SeatKind = 'off' | 'human' | 'ai';
interface SeatCfg {
  kind: SeatKind;
  name: string;
  difficulty: AIDifficulty;
}

const SEATS: Seat[] = [0, 1, 2, 3];
const defaultName = (seat: Seat, kind: SeatKind) => (kind === 'ai' ? `${SEAT_THEME[seat].name}-AI` : `PLAYER ${seat + 1}`);
const isDefaultName = (seat: Seat, name: string) => name === '' || name === defaultName(seat, 'ai') || name === defaultName(seat, 'human');

function preset(kinds: SeatKind[], difficulty: AIDifficulty = 'normal'): SeatCfg[] {
  return kinds.map((k, i) => ({ kind: k, name: defaultName(i as Seat, k === 'off' ? 'human' : k), difficulty }));
}

const PRESETS: { id: string; label: string; sub: string; kinds: SeatKind[] }[] = [
  { id: '1v1', label: '1 VS 1 AI', sub: 'DUEL', kinds: ['human', 'off', 'ai', 'off'] },
  { id: '1v3', label: '1 VS 3 AI', sub: 'GAUNTLET', kinds: ['human', 'ai', 'ai', 'ai'] },
  { id: '2p', label: '2 PLAYERS', sub: 'LOCAL', kinds: ['human', 'off', 'human', 'off'] },
  { id: '4p', label: '4 PLAYERS', sub: 'LOCAL', kinds: ['human', 'human', 'human', 'human'] },
];

function initialSeats(): { mode: GameMode; seats: SeatCfg[] } {
  const cfg = useGame.getState().config;
  if (!cfg) return { mode: 'classic', seats: preset(PRESETS[0].kinds) };
  const seats = preset(['off', 'off', 'off', 'off']);
  for (const p of cfg.players) seats[p.seat] = { kind: p.kind, name: p.name, difficulty: p.difficulty };
  return { mode: cfg.mode, seats };
}

export function MatchSetup() {
  const ref = useRef<HTMLDivElement>(null);
  const [{ mode, seats }, setState] = useState(initialSeats);
  const goto = useGame((s) => s.goto);
  const startGame = useGame((s) => s.startGame);
  useEntrance(ref, { stagger: 0.04 });

  const active = seats.filter((s) => s.kind !== 'off').length;
  const humans = seats.filter((s) => s.kind === 'human').length;
  const valid = active >= 2 && active <= 4;

  const setMode = (m: GameMode) => setState((st) => ({ ...st, mode: m }));
  const patchSeat = (i: number, patch: Partial<SeatCfg>) =>
    setState((st) => ({ ...st, seats: st.seats.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  const setKind = (i: number, kind: SeatKind) => {
    const cur = seats[i];
    const name = kind !== 'off' && isDefaultName(i as Seat, cur.name) ? defaultName(i as Seat, kind) : cur.name;
    patchSeat(i, { kind, name });
  };

  const launch = () => {
    if (!valid) return;
    const players: GameConfigPlayer[] = [];
    seats.forEach((s, i) => {
      if (s.kind === 'off') return;
      const seat = i as Seat;
      players.push({
        seat,
        kind: s.kind,
        difficulty: s.difficulty,
        name: (s.name.trim() || defaultName(seat, s.kind)).toUpperCase().slice(0, 12),
      });
    });
    startGame({ mode, players });
  };

  const matchPreset = PRESETS.find((p) => p.kinds.every((k, i) => k === seats[i].kind))?.id;

  return (
    <div ref={ref} className="nx-safe pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-none absolute inset-0 bg-[#05030d]/55" />
      <Panel className="pointer-events-auto relative flex max-h-full w-full max-w-[1120px] flex-col">
        {/* header */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
          <NxButton size="sm" variant="ghost" onClick={() => goto('menu')} ariaLabel="Back to menu">
            ‹ BACK
          </NxButton>
          <div className="min-w-0 flex-1">
            <Label color="#00f0ff">{'// MATCH CONFIGURATION'}</Label>
            <h2 className="nx-glitch font-display text-lg font-black tracking-[0.2em] sm:text-2xl" data-text="NEW MATCH">
              NEW MATCH
            </h2>
          </div>
          <div className="hidden text-right font-mono text-[10px] tracking-[0.2em] text-white/45 sm:block">
            SEATS <span className="text-nx-cyan">{active}/4</span> · HUMANS <span className="text-nx-magenta">{humans}</span>
          </div>
        </div>

        <div className="nx-scroll min-h-0 flex-1 space-y-5 px-4 py-4 sm:px-6">
          {/* MODE */}
          <section>
            <Label className="mb-2">{'// 01 · GAME MODE'}</Label>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <ModeCard
                selected={mode === 'classic'}
                onClick={() => setMode('classic')}
                title="CLASSIC"
                accent="#00f0ff"
                desc="Pure strategy. Traditional rules — six to deploy, capture to reset, exact roll to finish."
              />
              <ModeCard
                selected={mode === 'nexus'}
                onClick={() => setMode('nexus')}
                title="NEXUS"
                accent="#ff2bd6"
                desc="Power cells spawn on the grid. Collect and deploy tactical power-ups to swing the match."
              >
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(Object.keys(POWER_THEME) as PowerType[]).map((p) => (
                    <span key={p} className="font-mono text-[10px] tracking-[0.1em]" style={{ color: POWER_THEME[p].color }}>
                      {POWER_THEME[p].icon} {POWER_THEME[p].label}
                    </span>
                  ))}
                </div>
              </ModeCard>
            </div>
          </section>

          {/* PRESETS */}
          <section>
            <Label className="mb-2">{'// 02 · QUICK PRESETS'}</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRESETS.map((p) => (
                <NxButton
                  key={p.id}
                  dataAnim
                  size="sm"
                  accent={matchPreset === p.id ? '#ff2bd6' : '#9d4dff'}
                  ariaPressed={matchPreset === p.id}
                  className={`justify-between ${matchPreset === p.id ? '!text-white' : ''}`}
                  style={matchPreset === p.id ? { boxShadow: 'inset 0 -2px 0 #ff2bd6' } : undefined}
                  onClick={() =>
                    setState((st) => ({
                      ...st,
                      seats: p.kinds.map((k, i) => ({
                        kind: k,
                        name: defaultName(i as Seat, k === 'off' ? 'human' : k),
                        difficulty: st.seats[i].difficulty,
                      })),
                    }))
                  }
                >
                  <span>{p.label}</span>
                  <span className="font-mono text-[9px] opacity-60">{p.sub}</span>
                </NxButton>
              ))}
            </div>
          </section>

          {/* SEATS */}
          <section>
            <Label className="mb-2">{'// 03 · OPERATORS'}</Label>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {SEATS.map((seat) => (
                <SeatCard key={seat} seat={seat} cfg={seats[seat]} onKind={(k) => setKind(seat, k)} onPatch={(p) => patchSeat(seat, p)} />
              ))}
            </div>
          </section>
        </div>

        {/* footer */}
        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1 font-mono text-[11px] tracking-[0.14em]" role="status">
            {valid ? (
              <span className="text-nx-safe">
                ✓ {active} OPERATORS READY · {mode.toUpperCase()} MODE
              </span>
            ) : (
              <span className="text-nx-danger">⚠ ACTIVATE {active < 2 ? 'AT LEAST 2' : 'AT MOST 4'} SEATS TO LAUNCH</span>
            )}
          </div>
          <NxButton variant="primary" accent="#00f0ff" disabled={!valid} onClick={launch} className="h-12 min-w-[180px] text-[0.85rem]">
            LAUNCH ▸
          </NxButton>
        </div>
      </Panel>
    </div>
  );
}

function ModeCard({
  selected,
  onClick,
  title,
  desc,
  accent,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  accent: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      data-anim
      role="radio"
      aria-checked={selected}
      onPointerEnter={(e) => e.pointerType === 'mouse' && sfxHover()}
      onClick={() => {
        sfxClick();
        onClick();
      }}
      className="nx-chamfer nx-focus relative cursor-pointer p-4 text-left transition-all"
      style={
        {
          '--c': '12px',
          background: selected
            ? `linear-gradient(120deg, color-mix(in srgb, ${accent} 24%, transparent), rgba(8,8,24,0.6))`
            : 'rgba(255,255,255,0.035)',
          boxShadow: selected ? `inset 0 0 0 1px ${accent}, 0 0 24px color-mix(in srgb, ${accent} 25%, transparent)` : 'inset 0 0 0 1px rgba(255,255,255,0.08)',
        } as CSSProperties
      }
    >
      <div className="flex items-center justify-between">
        <span className="font-display text-base font-black tracking-[0.22em]" style={{ color: selected ? accent : '#e8f6ff' }}>
          {title}
        </span>
        <span
          className="h-3 w-3 rotate-45"
          style={{ background: selected ? accent : 'transparent', boxShadow: selected ? `0 0 10px ${accent}` : 'none', outline: `1px solid ${accent}` }}
        />
      </div>
      <p className="mt-1 text-[15px] leading-snug text-white/70">{desc}</p>
      {children}
    </button>
  );
}

function SeatCard({ seat, cfg, onKind, onPatch }: { seat: Seat; cfg: SeatCfg; onKind: (k: SeatKind) => void; onPatch: (p: Partial<SeatCfg>) => void }) {
  const t = SEAT_THEME[seat];
  const off = cfg.kind === 'off';
  return (
    <div
      data-anim
      className="nx-chamfer relative flex flex-col gap-2.5 p-3.5 transition-all"
      style={
        {
          '--c': '12px',
          background: off
            ? 'rgba(255,255,255,0.025)'
            : `linear-gradient(160deg, color-mix(in srgb, ${t.color} 18%, transparent), rgba(6,6,20,0.65) 60%)`,
          boxShadow: off ? 'inset 0 0 0 1px rgba(255,255,255,0.07)' : `inset 0 0 0 1px color-mix(in srgb, ${t.color} 55%, transparent)`,
        } as CSSProperties
      }
    >
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: off ? 'rgba(255,255,255,0.12)' : t.color, boxShadow: off ? 'none' : `0 0 12px ${t.color}` }} />
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-[0.25em] text-white/45">SEAT {seat + 1} · {quadrant(seat)}</div>
          <div className="font-display text-sm font-black tracking-[0.18em]" style={{ color: off ? 'rgba(232,246,255,0.45)' : t.color }}>
            {t.faction}
          </div>
        </div>
        <span className="h-7 w-7 rotate-45" style={{ border: `1px solid ${t.color}`, background: off ? 'transparent' : `color-mix(in srgb, ${t.color} 30%, transparent)`, opacity: off ? 0.4 : 1 }} />
      </div>

      <Segmented
        small
        ariaLabel={`Seat ${seat + 1} control`}
        value={cfg.kind}
        onChange={onKind}
        options={[
          { value: 'off', label: 'OFF', accent: '#8892a6' },
          { value: 'human', label: 'HUMAN', accent: t.color },
          { value: 'ai', label: 'AI', accent: t.color },
        ]}
      />

      <label className={`block ${off ? 'opacity-35' : ''}`}>
        <span className="font-mono text-[10px] tracking-[0.25em] text-white/45">CALLSIGN</span>
        <input
          className="nx-input nx-chamfer mt-1 block h-11 w-full bg-black/40 px-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-white outline-none placeholder:text-white/25 focus:bg-black/60"
          style={{ '--c': '6px', boxShadow: `inset 0 -1px 0 ${t.color}` } as CSSProperties}
          value={cfg.name}
          maxLength={12}
          disabled={off}
          placeholder={defaultName(seat, cfg.kind === 'ai' ? 'ai' : 'human')}
          onChange={(e) => onPatch({ name: e.target.value.toUpperCase().slice(0, 12) })}
          aria-label={`Seat ${seat + 1} callsign`}
          spellCheck={false}
          autoComplete="off"
        />
      </label>

      <div className={cfg.kind === 'ai' ? '' : 'pointer-events-none opacity-25'} inert={cfg.kind !== 'ai'}>
        <span className="font-mono text-[10px] tracking-[0.25em] text-white/45">AI DIFFICULTY</span>
        <Segmented
          small
          className="mt-1"
          ariaLabel={`Seat ${seat + 1} AI difficulty`}
          value={cfg.difficulty}
          onChange={(difficulty) => onPatch({ difficulty })}
          options={[
            { value: 'easy', label: 'EASY', accent: '#3dffa8' },
            { value: 'normal', label: 'NORMAL', accent: '#ffb300' },
            { value: 'hard', label: 'HARD', accent: '#ff3355' },
          ]}
        />
      </div>
    </div>
  );
}

function quadrant(seat: Seat) {
  return ['NW', 'NE', 'SE', 'SW'][seat];
}
