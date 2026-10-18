import type { ReactNode } from 'react';
import { Modal, Label, NxButton } from './primitives';
import { useUI } from './uiStore';
import { POWER_THEME } from '../core/theme';
import type { PowerType } from '../game/types';

const RULES: { k: string; title: string; body: ReactNode; color: string }[] = [
  { k: '01', title: 'DEPLOY ON A SIX', color: '#00f0ff', body: 'Units start docked in your base. Roll a 6 to launch a unit onto your start cell.' },
  { k: '02', title: 'CIRCUIT THE GRID', color: '#9d4dff', body: 'Move clockwise one full lap, then turn into your private home lane toward the Nexus Core.' },
  {
    k: '03',
    title: 'BONUS ROLLS',
    color: '#ffb300',
    body: 'Rolling a 6, capturing an enemy, or bringing a unit into the core grants an extra roll.',
  },
  { k: '04', title: 'TRIPLE-SIX OVERLOAD', color: '#ff3355', body: 'Three 6s in a row overloads your rig — your turn is forfeited immediately.' },
  {
    k: '05',
    title: 'DEREZZ ENEMIES',
    color: '#ff2bd6',
    body: 'Land exactly on an enemy unit to send it back to its base. Safe cells protect everyone.',
  },
  {
    k: '06',
    title: 'SAFE CELLS',
    color: '#3dffa8',
    body: 'The four start cells and the four star cells are safe zones — no captures can happen there.',
  },
  { k: '07', title: 'EXACT FINISH', color: '#00f0ff', body: 'You need the exact roll to enter the core. First to bring all four units home wins.' },
];

export function HowToPlay() {
  const close = useUI((s) => s.setHowTo);
  return (
    <Modal
      title="HOW TO PLAY"
      kicker="// FIELD MANUAL"
      onClose={() => close(false)}
      width={720}
      footer={
        <NxButton variant="primary" onClick={() => close(false)}>
          UNDERSTOOD
        </NxButton>
      }
    >
      <div className="grid gap-2.5 sm:grid-cols-2">
        {RULES.map((r) => (
          <div key={r.k} data-anim className="flex gap-3 border-l-2 bg-white/[0.03] px-3 py-2.5" style={{ borderColor: r.color }}>
            <span className="font-mono text-xs text-white/35">{r.k}</span>
            <div>
              <div className="font-display text-[11px] font-bold tracking-[0.16em]" style={{ color: r.color }}>
                {r.title}
              </div>
              <div className="mt-0.5 text-[15px] leading-snug text-white/75">{r.body}</div>
            </div>
          </div>
        ))}
      </div>

      <Label className="mt-6 mb-2" color="#ff2bd6">
        {'// NEXUS MODE — POWER-UPS'}
      </Label>
      <p data-anim className="mb-3 text-[15px] leading-snug text-white/70">
        Power cells materialise on the track. Land on one to collect it (hold up to 2). Activate them from the action dock during your turn.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(POWER_THEME) as PowerType[]).map((p) => {
          const t = POWER_THEME[p];
          return (
            <div key={p} data-anim className="nx-chamfer flex items-start gap-3 bg-white/[0.04] p-3" style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${t.color} 30%, transparent)` }}>
              <span className="grid h-10 w-10 shrink-0 place-items-center text-xl" style={{ color: t.color, textShadow: `0 0 10px ${t.color}` }} aria-hidden>
                {t.icon}
              </span>
              <div>
                <div className="font-display text-[11px] font-bold tracking-[0.16em]" style={{ color: t.color }}>
                  {t.label}
                </div>
                <div className="text-[14px] leading-snug text-white/70">{t.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      <Label className="mt-6 mb-2">{'// CONTROLS'}</Label>
      <div data-anim className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs text-white/65 sm:grid-cols-3">
        {[
          ['SPACE / ENTER', 'Roll'],
          ['1 – 4', 'Select unit'],
          ['H', 'Toggle hints'],
          ['T', 'Top view'],
          ['C', 'Reset camera'],
          ['ESC', 'Pause'],
        ].map(([k, v]) => (
          <div key={k}>
            <span className="text-nx-cyan">{k}</span> · {v}
          </div>
        ))}
      </div>
    </Modal>
  );
}
